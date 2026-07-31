import React, { useState, useRef } from 'react';
import { User, DocState } from '../../types';
import { UpEngineService, normalizeProcessId } from '../../services/upEngineService';
import { SavedProcessEntry, UpProcess } from '../../types/upEngine';
import { parseDocumentFilename } from '../../utils/filenameParser';
import { FileUp, X, CheckCircle2, AlertCircle, RefreshCw, Folder, Layers, Zap, Activity, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  user: User;
  project: string;
  macro: string;
  process: string;
  micro: string;
  docType: 'TO_BE' | 'FCE';
  onSuccess: () => void;
}

export const UpEngineUploadModal: React.FC<Props> = ({
  isOpen,
  onClose,
  user,
  project,
  macro,
  process,
  micro,
  docType,
  onSuccess
}) => {
  const [selectedDocType, setSelectedDocType] = useState<'TO BE' | 'FCE'>(
    docType === 'FCE' ? 'FCE' : 'TO BE'
  );
  const [file, setFile] = useState<File | null>(null);
  const [version, setVersion] = useState<string>('1.0');
  const [description, setDescription] = useState<string>('');
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!micro) {
      toast.error('Debe seleccionar un microproceso válido.');
      return;
    }

    if (!file) {
      toast.error('Debe adjuntar un archivo para subir a UpEngine.');
      return;
    }

    // Validar Nomenclatura del archivo
    const parseResult = parseDocumentFilename(
      file.name,
      project,
      micro,
      selectedDocType
    );

    if (!parseResult.valido) {
      toast.error(`Error de Nomenclatura en "${file.name}":\n` + parseResult.errores.join(' | '));
      return;
    }

    setIsUploading(true);
    try {
      const docDesc = description.trim() || `Archivo cargado directamente en UpEngine para ${micro} (${selectedDocType})`;

      // 1. Extract process data from uploaded file / text
      let extractedProcess: UpProcess | null = null;
      if (file.name.toLowerCase().endsWith('.docx') || file.name.toLowerCase().endsWith('.doc')) {
        try {
          const wordData = await UpEngineService.parseWordDoc(file);
          if (wordData) {
            extractedProcess = {
              id: wordData.id || normalizeProcessId(micro || wordData.meta?.name || 'proceso'),
              name: wordData.meta?.name || micro,
              description: wordData.purpose || docDesc,
              version: wordData.meta?.version || version || '1.0',
              lastUpdated: new Date().toISOString().split('T')[0],
              project: project,
              macroprocess: macro,
              process: process,
              microprocess: micro,
              docType: selectedDocType,
              docState: DocState.APPROVED,
              docAuthor: user?.name || 'Usuario',
              docComment: docDesc,
              docFileName: file.name,
              meta: wordData.meta,
              purpose: wordData.purpose,
              scope: wordData.scope,
              kpis: wordData.kpis || [],
              sipoc: wordData.sipoc || { suppliers: [], inputs: [], processName: micro, outputs: [], customers: [] },
              wordRoles: wordData.roles || [],
              steps: wordData.steps || [],
              businessRules: wordData.businessRules || [],
              asIsContext: wordData.purpose,
              toBeOptimizations: wordData.scope,
              fceFactors: (wordData.kpis || []).map((k) => `${k.name}: Meta ${k.target} (${k.frequency})`),
              stages: (wordData.steps && wordData.steps.length > 0)
                ? wordData.steps.map((st, idx) => ({
                    id: st.id || `stg_${idx + 1}`,
                    number: idx + 1,
                    name: st.name || `Actividad ${idx + 1}`,
                    description: st.description || '',
                    responsibleRole: (wordData.roles?.find((r) => r.id === st.roleId)?.title) || st.roleId || 'Responsable',
                    substeps: st.inputs || [],
                    criticalControlPoints: st.rules || [],
                    estimatedTimeMinutes: parseInt(st.duration) || 30,
                    failureImpact: 'MEDIUM'
                  }))
                : [],
              governanceRules: (wordData.businessRules && wordData.businessRules.length > 0)
                ? wordData.businessRules.map((br, idx) => ({
                    id: br.id || `gov_${idx + 1}`,
                    code: `BR-${idx + 1}`,
                    title: br.type || 'Regla de Negocio',
                    description: br.description || '',
                    severity: br.type === 'Bloqueante' ? 'CRITICAL' : 'HIGH',
                    enforcementType: br.type === 'Bloqueante' ? 'BLOCKING' : 'WARNING'
                  }))
                : [],
              roles: (wordData.roles && wordData.roles.length > 0)
                ? wordData.roles.map((r, idx) => ({
                    id: r.id || `role_${idx + 1}`,
                    name: r.title || `Rol ${idx + 1}`,
                    responsibilities: r.responsibility ? [r.responsibility] : []
                  }))
                : [],
              integrations: []
            };
          }
        } catch (wErr) {
          console.warn('[UpEngineUploadModal] Error parsing Word document:', wErr);
        }
      } else if (file.name.toLowerCase().endsWith('.json') || file.type === 'application/json') {
        try {
          const jsonText = await file.text();
          const parsed = JSON.parse(jsonText);
          if (parsed && typeof parsed === 'object') {
            extractedProcess = parsed.process || parsed;
          }
        } catch (jErr) {
          console.warn('[UpEngineUploadModal] Failed parsing JSON file directly:', jErr);
        }
      }

      if (!extractedProcess) {
        try {
          extractedProcess = await UpEngineService.extractProcessFromDoc({
            file,
            promptText: docDesc
          });
        } catch (aiErr) {
          console.warn('[UpEngineUploadModal] AI process extraction warning/fallback:', aiErr);
        }
      }

      // 2. Build & save full UpEngine process entry exclusively in UpEngine
      const procId = normalizeProcessId(micro);
      const fileUrl = ''; // UpEngine internal reference

      const processToSave: SavedProcessEntry = {
        id: procId,
        savedAt: new Date().toLocaleString('es-CL'),
        process: {
          id: procId,
          name: micro,
          description: docDesc || extractedProcess?.description || `Proceso normativo optimizado para ${micro}`,
          version: version || extractedProcess?.version || '1.0',
          lastUpdated: new Date().toISOString().split('T')[0],
          project: project,
          macroprocess: macro,
          process: process,
          microprocess: micro,
          docType: selectedDocType,
          docState: DocState.APPROVED,
          docAuthor: user?.name || 'Usuario',
          docComment: docDesc,
          docFileName: file.name,
          docFileUrl: fileUrl,
          meta: extractedProcess?.meta,
          purpose: extractedProcess?.purpose,
          scope: extractedProcess?.scope,
          kpis: extractedProcess?.kpis || [],
          sipoc: extractedProcess?.sipoc || { suppliers: [], inputs: [], processName: micro, outputs: [], customers: [] },
          wordRoles: extractedProcess?.wordRoles || [],
          steps: extractedProcess?.steps || [],
          businessRules: extractedProcess?.businessRules || [],
          asIsContext: extractedProcess?.asIsContext || `Flujo de inicio e insumos normativos para ${micro}.`,
          toBeOptimizations: selectedDocType === 'TO BE' ? (extractedProcess?.toBeOptimizations || docDesc || `Optimizaciones de flujo y trazabilidad digital para ${micro}.`) : extractedProcess?.toBeOptimizations,
          fceFactors: selectedDocType === 'FCE' ? (extractedProcess?.fceFactors || ['Trazabilidad en tiempo real', 'Estandarización normativo-operativa', 'Integración SGD']) : extractedProcess?.fceFactors,
          glossary: extractedProcess?.glossary || [],
          subprocesses: extractedProcess?.subprocesses || [],
          sipocRows: extractedProcess?.sipocRows || [],
          stages: (extractedProcess?.stages && extractedProcess.stages.length > 0) ? extractedProcess.stages : [
            {
              id: 'stg_1',
              number: 1,
              name: 'Recepción y Validación de Antecedentes',
              description: `Ingreso formal de requerimientos y verificación de documentación para ${micro}.`,
              responsibleRole: user?.name || 'Responsable del Área',
              substeps: ['Ingreso de datos en SGD', 'Verificación de anexos y requisitos'],
              criticalControlPoints: ['Inconsistencia en antecedentes entregados'],
              estimatedTimeMinutes: 30,
              failureImpact: 'MEDIUM'
            },
            {
              id: 'stg_2',
              number: 2,
              name: 'Revisión Técnica y Control Normativo',
              description: `Evaluación de cumplimiento de estándares y criterios operativos para ${micro}.`,
              responsibleRole: 'Jefatura de Operaciones',
              substeps: ['Análisis técnico de factibilidad', 'Validación con referente del área'],
              criticalControlPoints: ['Falta de visto bueno institucional'],
              estimatedTimeMinutes: 45,
              failureImpact: 'HIGH'
            },
            {
              id: 'stg_3',
              number: 3,
              name: 'Aprobación y Cierre de Expediente',
              description: `Emisión de resolución o entrega conforme del producto/servicio para ${micro}.`,
              responsibleRole: 'Subdirección de Gestión',
              substeps: ['Firma digital de documento final', 'Notificación a partes interesadas'],
              criticalControlPoints: ['Demora en la notificación al solicitante'],
              estimatedTimeMinutes: 20,
              failureImpact: 'HIGH'
            }
          ],
          governanceRules: (extractedProcess?.governanceRules && extractedProcess.governanceRules.length > 0) ? extractedProcess.governanceRules : [
            {
              id: 'gov_1',
              code: 'REG-SGD-01',
              title: 'Control de Trazabilidad y Firmas',
              description: 'Toda documentación debe ser canalizada mediante el sistema SGD institucional con firma habilitada.',
              severity: 'HIGH',
              enforcementType: 'BLOCKING'
            }
          ],
          roles: (extractedProcess?.roles && extractedProcess.roles.length > 0) ? extractedProcess.roles : [
            { id: 'r_1', name: user?.name || 'Responsable de Área', responsibilities: ['Validar expediente', 'Aprobar etapa inicial'] },
            { id: 'r_2', name: 'Jefatura / Subdirección', responsibilities: ['Supervisión de cumplimiento', 'Resolución final'] }
          ],
          integrations: extractedProcess?.integrations || []
        }
      };

      await UpEngineService.saveProcess(processToSave);

      toast.success(`Archivo "${file.name}" cargado y proceso "${micro}" poblado exitosamente en UpEngine para ${selectedDocType}.`);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('[UpEngineUploadModal] Error uploading file:', err);
      toast.error(`Error al subir archivo: ${err?.message || 'Ocurrió un error inesperado'}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto animate-fadeIn">
      <div className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8 space-y-0">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 flex items-center justify-between border-b border-indigo-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shrink-0">
              <FileUp size={20} />
            </div>
            <div>
              <h3 className="text-base font-bold text-white tracking-tight">
                Subir Archivo a UpEngine
              </h3>
              <p className="text-xs text-indigo-200/80">
                Actualizar contenido de proceso para visualización directa
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            disabled={isUploading}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-all"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Selected Hierarchy Context */}
          <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 text-xs space-y-1.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Folder size={12} className="text-indigo-500" /> Jerarquía de Proceso Asignado
            </div>
            <div className="font-bold text-slate-800 leading-tight">
              {project || 'Proyecto'} <span className="text-slate-400 font-normal">/</span> {macro || 'Macroproceso'} <span className="text-slate-400 font-normal">/</span> {process || 'Proceso'}
            </div>
            <div className="text-indigo-700 font-extrabold flex items-center gap-1">
              <Layers size={13} />
              <span>Microproceso: {micro || 'No seleccionado'}</span>
            </div>
          </div>

          {/* Doc Type Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-2">
              Tipo de Documento
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedDocType('TO BE')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  selectedDocType === 'TO BE'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Zap size={15} />
                <span>TO BE (Proceso Futuro)</span>
              </button>

              <button
                type="button"
                onClick={() => setSelectedDocType('FCE')}
                className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                  selectedDocType === 'FCE'
                    ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                <Activity size={15} />
                <span>FCE (Indicadores FCE)</span>
              </button>
            </div>
          </div>

          {/* Version Input */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Versión
              </label>
              <input
                type="text"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
                placeholder="Ej. 1.0, v1.0.0"
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
                Usuario Emisor
              </label>
              <input
                type="text"
                disabled
                value={user?.name || 'Usuario'}
                className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Observación / Descripción del Archivo
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej. Carga de manual de procesos optimizado y especificaciones operativas..."
              className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* File Upload Area */}
          <div>
            <label className="block text-xs font-bold text-slate-700 uppercase mb-1">
              Archivo Adjunto *
            </label>
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
                file
                  ? 'border-emerald-400 bg-emerald-50/50 text-emerald-900'
                  : 'border-slate-300 hover:border-indigo-500 bg-slate-50/70 hover:bg-slate-50 text-slate-600'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.vsdx,.png,.jpg,.json"
              />

              {file ? (
                <div className="flex flex-col items-center gap-1.5">
                  <CheckCircle2 size={32} className="text-emerald-600" />
                  <span className="text-xs font-extrabold text-slate-900 break-all">{file.name}</span>
                  <span className="text-[10px] text-emerald-700 font-mono font-bold">
                    {(file.size / 1024).toFixed(1)} KB — Listo para subir
                  </span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-1.5">
                  <FileUp size={32} className="text-indigo-500" />
                  <span className="text-xs font-bold text-slate-800">
                    Arrastra tu archivo aquí o haz clic para explorar
                  </span>
                  <span className="text-[10px] text-slate-400">
                    Formatos permitidos: PDF, Word, Excel, Visio, JSON, Imágenes
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Modal Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isUploading}
              className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 hover:bg-slate-100 transition-all"
            >
              Cancelar
            </button>

            <button
              type="submit"
              disabled={isUploading || !file}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/20 transition-all flex items-center gap-2"
            >
              {isUploading ? (
                <>
                  <RefreshCw size={15} className="animate-spin" />
                  <span>Subiendo...</span>
                </>
              ) : (
                <>
                  <FileUp size={15} />
                  <span>Subir e Integrar en UpEngine</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
