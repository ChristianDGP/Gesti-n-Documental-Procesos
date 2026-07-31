import React, { useState } from 'react';
import { UpProcess } from '../../types/upEngine';
import { UpEngineService, normalizeProcessId } from '../../services/upEngineService';
import {
  X, Sparkles, Upload, FileText, CheckCircle2, AlertCircle,
  RefreshCw, ArrowRight, Shield, Layers, Users
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onProcessImported: (process: UpProcess) => void;
}

export const GeminiImportModal: React.FC<Props> = ({
  isOpen,
  onClose,
  onProcessImported
}) => {
  const [promptText, setPromptText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [extractedProcess, setExtractedProcess] = useState<UpProcess | null>(null);

  if (!isOpen) return null;

  const handleExtract = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptText.trim() && !file) {
      toast.error('Ingrese una descripción/prompt o suba un archivo (PDF/TXT).');
      return;
    }

    setLoading(true);
    try {
      const process = await UpEngineService.extractProcessFromDoc({
        promptText,
        file: file || undefined
      });

      setExtractedProcess(process);
      toast.success('¡Proceso normativo extraído con éxito vía Gemini IA!');
    } catch (err: any) {
      console.error(err);
      toast.error('Error durante la extracción con IA: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveToFirestore = async () => {
    if (!extractedProcess) return;

    setLoading(true);
    try {
      const docId = normalizeProcessId(extractedProcess.name);
      await UpEngineService.saveProcess({
        id: docId,
        savedAt: new Date().toLocaleString('es-CL'),
        process: {
          ...extractedProcess,
          id: docId
        }
      });

      toast.success(`Proceso "${extractedProcess.name}" guardado y activado en la nube.`);
      onProcessImported(extractedProcess);
      onClose();
    } catch (err: any) {
      toast.error('Error al guardar en Firestore: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Modal Header */}
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div>
            <h3 className="text-lg font-bold flex items-center gap-2">
              <Sparkles size={20} className="text-indigo-400" />
              Importación Inteligente con IA (Gemini)
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Extraiga automáticamente etapas, reglas de gobernanza, roles y sistemas a partir de documentos PDF o instrucciones en texto.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {!extractedProcess ? (
            <form onSubmit={handleExtract} className="space-y-5">
              {/* File Upload Zone */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  1. Documento de Origen (PDF / TXT)
                </label>
                <div
                  className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
                    file ? 'border-indigo-500 bg-indigo-50/50' : 'border-slate-300 hover:border-indigo-400 bg-slate-50'
                  }`}
                >
                  <input
                    type="file"
                    accept=".pdf,.txt,.doc,.docx"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="gemini-file-input"
                  />
                  <label htmlFor="gemini-file-input" className="cursor-pointer flex flex-col items-center">
                    <Upload size={32} className={file ? 'text-indigo-600' : 'text-slate-400'} />
                    <span className="text-xs font-bold text-slate-800 mt-2">
                      {file ? file.name : 'Haga click para seleccionar documento PDF o TXT'}
                    </span>
                    <span className="text-[10px] text-slate-400 mt-1">
                      {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Formatos soportados: .pdf, .txt'}
                    </span>
                  </label>
                </div>
              </div>

              {/* Text Prompt */}
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                  2. O Instrucciones / Prompt del Proceso Normativo
                </label>
                <textarea
                  rows={4}
                  value={promptText}
                  onChange={(e) => setPromptText(e.target.value)}
                  placeholder="Ej: Describe el proceso normativo de Triage Clínico y Atención en Urgencias con 4 etapas, reglas bloqueantes de tiempo y roles..."
                  className="w-full p-3.5 border border-slate-300 rounded-2xl text-xs outline-none focus:ring-2 focus:ring-indigo-500 leading-relaxed"
                />
              </div>

              {/* Submit */}
              <div className="flex justify-end pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md active:scale-95 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <RefreshCw size={16} className="animate-spin" />
                      <span>Analizando con Gemini IA...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles size={16} />
                      <span>Extraer Estructura de Proceso</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            /* Extracted Preview */
            <div className="space-y-6 animate-fadeIn">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle2 size={24} className="text-emerald-600" />
                  <div>
                    <h4 className="text-sm font-bold text-emerald-950">{extractedProcess.name}</h4>
                    <p className="text-xs text-emerald-800 font-mono">
                      Versión {extractedProcess.version} | {extractedProcess.stages?.length || 0} Etapas Extraídas
                    </p>
                  </div>
                </div>

                <button
                  onClick={() => setExtractedProcess(null)}
                  className="text-xs font-bold text-slate-600 hover:underline"
                >
                  Re-extraer
                </button>
              </div>

              {/* Preview details */}
              <div className="space-y-4 text-xs text-slate-700">
                <p className="bg-slate-50 p-3 rounded-xl border border-slate-200">{extractedProcess.description}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200">
                    <span className="font-bold text-amber-900 block mb-1">AS-IS:</span>
                    <p className="text-[11px] text-amber-950">{extractedProcess.asIsContext || 'N/A'}</p>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200">
                    <span className="font-bold text-emerald-900 block mb-1">TO-BE:</span>
                    <p className="text-[11px] text-emerald-950">{extractedProcess.toBeOptimizations || 'N/A'}</p>
                  </div>
                </div>

                <div>
                  <span className="font-bold text-slate-900 block mb-2">Etapas Detectadas:</span>
                  <div className="space-y-2">
                    {extractedProcess.stages?.map((stg, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
                        <span className="font-bold">
                          {stg.number}. {stg.name}
                        </span>
                        <span className="text-[10px] text-indigo-600 font-mono">{stg.responsibleRole}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Confirm Save to Firestore */}
              <div className="flex justify-end gap-2 pt-4 border-t border-slate-200">
                <button
                  onClick={() => setExtractedProcess(null)}
                  className="px-4 py-2 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100"
                >
                  Descartar
                </button>
                <button
                  onClick={handleSaveToFirestore}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md"
                >
                  {loading ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                  <span>Guardar y Activar en Firestore</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
