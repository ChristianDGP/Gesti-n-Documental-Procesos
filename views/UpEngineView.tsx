import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { User, Document, DocState, FullHierarchy } from '../types';
import { SavedProcessEntry, UpProcess } from '../types/upEngine';
import { UpEngineService, normalizeProcessId } from '../services/upEngineService';
import { DocumentService, HierarchyService, normalizeHeader, formatVersionForDisplay } from '../services/firebaseBackend';
import { STATE_CONFIG, REQUIRED_DOCS_MATRIX } from '../constants';
import { parseDocumentFilename } from '../utils/filenameParser';

const mapParserStateToEnum = (parserState?: string): DocState => {
  switch (parserState) {
    case 'Iniciado': return DocState.INITIATED;
    case 'En Proceso': return DocState.IN_PROCESS;
    case 'Revisión Interna': return DocState.INTERNAL_REVIEW;
    case 'Enviado a Referente': return DocState.SENT_TO_REFERENT;
    case 'Revisión Interna Referente': return DocState.REFERENT_REVIEW;
    case 'Enviado a Control': return DocState.SENT_TO_CONTROL;
    case 'Revisión Interna Control': return DocState.CONTROL_REVIEW;
    case 'Aprobado Final': return DocState.APPROVED;
    default: return DocState.APPROVED;
  }
};
import { ProcessSpecificationManual } from '../components/UpEngine/ProcessSpecificationManual';
import { FrameworkDocViewer } from '../components/UpEngine/FrameworkDocViewer';
import { CodeGenerator } from '../components/UpEngine/CodeGenerator';
import { ProcessSimulator } from '../components/UpEngine/ProcessSimulator';
import { LibraryManagerModal } from '../components/UpEngine/LibraryManagerModal';
import { GeminiImportModal } from '../components/UpEngine/GeminiImportModal';
import { UpEngineUploadModal } from '../components/UpEngine/UpEngineUploadModal';
import { InteractiveProcessMap } from '../components/UpEngine/InteractiveProcessMap';
import {
  Cpu, FileText, Code, Play, Sparkles, Layers,
  Cloud, RefreshCw, AlertCircle, PlusCircle, FileUp,
  Clock, User as UserIcon, Download, Tag, CheckCircle2,
  Folder, Filter, ArrowRight, Zap, Activity, ChevronDown,
  RotateCcw, Trash2, Save, AlertTriangle
} from 'lucide-react';
import { toast } from 'sonner';

interface Props {
  user: User;
}

type ActiveTab = 'FRAMEWORK' | 'CODE_GEN' | 'SIMULATOR';

export const UpEngineView: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<ActiveTab>('FRAMEWORK');
  const [processes, setProcesses] = useState<SavedProcessEntry[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [syncStatus, setSyncStatus] = useState<'SYNCED' | 'SAVING' | 'OFFLINE'>('SYNCED');

  // Exact 4 Hierarchy Filters
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedMacro, setSelectedMacro] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [selectedMicro, setSelectedMicro] = useState<string>('');

  // Modals
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [isGeminiOpen, setIsGeminiOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [uploadModalDocType, setUploadModalDocType] = useState<'TO_BE' | 'FCE'>('TO_BE');

  // Document Tab State ('TO_BE' | 'FCE')
  const [docTab, setDocTab] = useState<'TO_BE' | 'FCE'>('TO_BE');

  // Direct Word (.docx) Upload State & Staged Draft Management
  const [isWordParsing, setIsWordParsing] = useState(false);
  const [stagedProcess, setStagedProcess] = useState<SavedProcessEntry | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const wordFileInputRef = useRef<HTMLInputElement>(null);

  const isStagedForSelected = useMemo(() => {
    if (!stagedProcess || !selectedMicro) return false;
    const stagedMicro = stagedProcess.process?.microprocess || stagedProcess.process?.name;
    return normalizeHeader(stagedMicro) === normalizeHeader(selectedMicro);
  }, [stagedProcess, selectedMicro]);

  const handleWordUploadDirect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!selectedMicro) {
      toast.error('Por favor seleccione un microproceso en los filtros antes de cargar el documento Word.');
      if (wordFileInputRef.current) wordFileInputRef.current.value = '';
      return;
    }

    // 1. Validar Nomenclatura del archivo de acuerdo a Proyecto, Microproceso y Tipo de Documento
    const expectedDocType = docTab === 'FCE' ? 'FCE' : 'TO BE';
    const parseResult = parseDocumentFilename(
      file.name,
      selectedProject,
      selectedMicro,
      expectedDocType
    );

    if (!parseResult.valido) {
      toast.error(`Error de Nomenclatura en "${file.name}":\n` + parseResult.errores.join(' | '));
      if (wordFileInputRef.current) wordFileInputRef.current.value = '';
      return;
    }

    setIsWordParsing(true);
    const loadingToast = toast.loading('Leyendo y procesando documento Word (.docx)...');

    try {
      const wordData = await UpEngineService.parseWordDoc(file);
      const procId = normalizeProcessId(selectedMicro);

      const docStateExtracted = mapParserStateToEnum(parseResult.estado);
      const versionExtracted = parseResult.nomenclatura || wordData.meta?.version || '1.0';

      const processToSave: SavedProcessEntry = {
        id: procId,
        savedAt: new Date().toLocaleString('es-CL'),
        process: {
          id: procId,
          name: selectedMicro,
          description: wordData.purpose || `Proceso caracterizado desde Word para ${selectedMicro}`,
          version: versionExtracted,
          lastUpdated: new Date().toISOString().split('T')[0],
          project: selectedProject,
          macroprocess: selectedMacro,
          process: selectedProcess,
          microprocess: selectedMicro,
          docType: docTab,
          docState: docStateExtracted,
          docAuthor: user?.name || 'Usuario',
          docComment: wordData.purpose,
          docFileName: file.name,
          meta: wordData.meta,
          purpose: wordData.purpose,
          scope: wordData.scope,
          kpis: wordData.kpis || [],
          sipoc: wordData.sipoc || { suppliers: [], inputs: [], processName: selectedMicro, outputs: [], customers: [] },
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
        }
      };

      setStagedProcess(processToSave);
      toast.dismiss(loadingToast);
      toast.success(`Documento Word cargado en vista previa para "${selectedMicro}". Revisa la información y presiona "Confirmar y Guardar".`);
    } catch (err: any) {
      console.error('[UpEngineView] Error parsing word file:', err);
      toast.dismiss(loadingToast);
      toast.error(`Error al procesar el archivo Word: ${err.message || 'Error desconocido'}`);
    } finally {
      setIsWordParsing(false);
      if (wordFileInputRef.current) wordFileInputRef.current.value = '';
    }
  };

  const handleSaveProcess = async () => {
    const targetEntry = isStagedForSelected ? stagedProcess : (activeProcess ? {
      id: normalizeProcessId(selectedMicro),
      savedAt: new Date().toLocaleString('es-CL'),
      process: activeProcess
    } : null);

    if (!targetEntry) {
      toast.error('No hay cambios ni caracterización de proceso para guardar.');
      return;
    }

    setIsSaving(true);
    const saveToast = toast.loading(`Guardando caracterización de "${selectedMicro}" en UpEngine...`);
    try {
      await UpEngineService.saveProcess(targetEntry);
      setStagedProcess(null);
      toast.dismiss(saveToast);
      toast.success(`Caracterización del proceso "${selectedMicro}" guardada y confirmada exitosamente.`);
    } catch (err: any) {
      console.error('[UpEngineView] Error saving process:', err);
      saveToast && toast.dismiss(saveToast);
      toast.error(`Error al guardar el proceso: ${err.message || 'Error de base de datos'}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancelStaged = () => {
    setStagedProcess(null);
    if (wordFileInputRef.current) wordFileInputRef.current.value = '';
    toast.info('Carga de borrador cancelada. Se han descartado los cambios no guardados.');
  };

  const handleDeleteProcess = async () => {
    if (!selectedMicro) return;

    const confirmed = window.confirm(
      `¿Está seguro de que desea eliminar la caracterización del proceso "${selectedMicro}"?\n\nEsta acción borrará el contenido registrado de la base de datos de UpEngine.`
    );

    if (!confirmed) return;

    setIsDeleting(true);
    const deleteToast = toast.loading(`Eliminando contenido del proceso "${selectedMicro}"...`);

    try {
      setStagedProcess(null);
      if (wordFileInputRef.current) wordFileInputRef.current.value = '';

      const procId = normalizeProcessId(selectedMicro);
      const normSelected = normalizeHeader(selectedMicro);

      const existingEntries = processes.filter(
        p => p.id === procId || normalizeHeader(p.process?.microprocess || p.process?.name) === normSelected
      );

      for (const entry of existingEntries) {
        await UpEngineService.deleteProcess(entry.id);
      }

      // Ensure deletion by normalized ID as well
      try {
        await UpEngineService.deleteProcess(procId);
      } catch (e) {
        // Ignore if non-existent or already deleted
      }

      toast.dismiss(deleteToast);
      toast.success(`El contenido del proceso "${selectedMicro}" ha sido eliminado correctamente.`);
    } catch (err: any) {
      console.error('[UpEngineView] Error deleting process content:', err);
      toast.dismiss(deleteToast);
      toast.error(`Error al eliminar el contenido: ${err.message || 'Error de base de datos'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  // Load Hierarchy and Documents from Firestore
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [fullHier, docs] = await Promise.all([
          HierarchyService.getFullHierarchy(),
          DocumentService.getAll()
        ]);
        setHierarchy(fullHier);
        setDocuments(docs);

        // Initialize default selections for 4 hierarchy filters
        const projKeys = Object.keys(fullHier);
        if (projKeys.length > 0) {
          const firstProj = projKeys[0];
          setSelectedProject(firstProj);

          const macroKeys = Object.keys(fullHier[firstProj] || {});
          if (macroKeys.length > 0) {
            const firstMacro = macroKeys[0];
            setSelectedMacro(firstMacro);

            const procKeys = Object.keys(fullHier[firstProj][firstMacro] || {});
            if (procKeys.length > 0) {
              const firstProc = procKeys[0];
              setSelectedProcess(firstProc);

              const microNodes = fullHier[firstProj][firstMacro][firstProc] || [];
              if (microNodes.length > 0) {
                setSelectedMicro(microNodes[0].name);
              }
            }
          }
        }
      } catch (err) {
        console.error('[UpEngine] Error loading initial hierarchy and documents:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Subscribe to real-time UpEngine processes collection
  useEffect(() => {
    const unsubscribe = UpEngineService.subscribeToProcesses((fetched) => {
      setProcesses(fetched);
    });
    return () => unsubscribe();
  }, []);

  // Compute available options for 4 hierarchy filters
  const projectOptions = useMemo(() => Object.keys(hierarchy), [hierarchy]);

  const macroOptions = useMemo(() => {
    if (!selectedProject || !hierarchy[selectedProject]) return [];
    return Object.keys(hierarchy[selectedProject]);
  }, [hierarchy, selectedProject]);

  const processOptions = useMemo(() => {
    if (!selectedProject || !selectedMacro || !hierarchy[selectedProject]?.[selectedMacro]) return [];
    return Object.keys(hierarchy[selectedProject][selectedMacro]);
  }, [hierarchy, selectedProject, selectedMacro]);

  const microOptions = useMemo(() => {
    if (!selectedProject || !selectedMacro || !selectedProcess || !hierarchy[selectedProject]?.[selectedMacro]?.[selectedProcess]) return [];
    return hierarchy[selectedProject][selectedMacro][selectedProcess].map(node => node.name);
  }, [hierarchy, selectedProject, selectedMacro, selectedProcess]);

  // Handle cascading filter changes
  const handleProjectChange = (proj: string) => {
    setSelectedProject(proj);
    const macros = Object.keys(hierarchy[proj] || {});
    const firstMacro = macros[0] || '';
    setSelectedMacro(firstMacro);

    const procs = firstMacro ? Object.keys(hierarchy[proj]?.[firstMacro] || {}) : [];
    const firstProc = procs[0] || '';
    setSelectedProcess(firstProc);

    const micros = firstProc ? (hierarchy[proj]?.[firstMacro]?.[firstProc] || []).map(n => n.name) : [];
    setSelectedMicro(micros[0] || '');
  };

  const handleMacroChange = (macro: string) => {
    setSelectedMacro(macro);
    const procs = Object.keys(hierarchy[selectedProject]?.[macro] || {});
    const firstProc = procs[0] || '';
    setSelectedProcess(firstProc);

    const micros = firstProc ? (hierarchy[selectedProject]?.[macro]?.[firstProc] || []).map(n => n.name) : [];
    setSelectedMicro(micros[0] || '');
  };

  const handleProcessChange = (proc: string) => {
    setSelectedProcess(proc);
    const micros = (hierarchy[selectedProject]?.[selectedMacro]?.[proc] || []).map(n => n.name);
    setSelectedMicro(micros[0] || '');
  };

  const handleSelectNodeFromMap = (proj: string, macro?: string, proc?: string, micro?: string) => {
    setSelectedProject(proj);

    const availableMacros = Object.keys(hierarchy[proj] || {});
    const targetMacro = macro && availableMacros.includes(macro) ? macro : (availableMacros[0] || '');
    setSelectedMacro(targetMacro);

    const availableProcs = targetMacro ? Object.keys(hierarchy[proj]?.[targetMacro] || {}) : [];
    const targetProc = proc && availableProcs.includes(proc) ? proc : (availableProcs[0] || '');
    setSelectedProcess(targetProc);

    const availableMicros = targetProc ? (hierarchy[proj]?.[targetMacro]?.[targetProc] || []).map(n => n.name) : [];
    const targetMicro = micro && availableMicros.includes(micro) ? micro : (availableMicros[0] || '');
    setSelectedMicro(targetMicro);
  };

  const refreshDocuments = async () => {
    try {
      const docs = await DocumentService.getAll();
      setDocuments(docs);
    } catch (e) {
      console.error('[UpEngine] Error refreshing documents:', e);
    }
  };

  const openUploadModal = (type: 'TO_BE' | 'FCE') => {
    setUploadModalDocType(type);
    setIsUploadModalOpen(true);
  };

  // Find document uploaded/consolidated specifically for 'TO BE'
  const toBeDoc = useMemo(() => {
    if (!selectedProject || !selectedMicro) return null;
    const normSelectedMicro = normalizeHeader(selectedMicro);

    const matches = documents.filter((doc) => {
      const matchProject = doc.project === selectedProject;
      const matchMicro = normalizeHeader(doc.microprocess || doc.title.split(' - ')[0]) === normSelectedMicro;
      const matchType = doc.docType === 'TO BE';
      return matchProject && matchMicro && matchType;
    });

    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0];
  }, [documents, selectedProject, selectedMicro]);

  // Find document uploaded/consolidated specifically for 'FCE'
  const fceDoc = useMemo(() => {
    if (!selectedProject || !selectedMicro) return null;
    const normSelectedMicro = normalizeHeader(selectedMicro);

    const matches = documents.filter((doc) => {
      const matchProject = doc.project === selectedProject;
      const matchMicro = normalizeHeader(doc.microprocess || doc.title.split(' - ')[0]) === normSelectedMicro;
      const matchType = doc.docType === 'FCE';
      return matchProject && matchMicro && matchType;
    });

    if (matches.length === 0) return null;
    return matches.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())[0];
  }, [documents, selectedProject, selectedMicro]);

  const matchedDocument = toBeDoc || fceDoc;

  // Find process model in UpEngine processes corresponding to selected microprocess or matched document
  const activeProcess = useMemo((): UpProcess | null => {
    if (!selectedMicro) return null;
    const normSelected = normalizeHeader(selectedMicro);

    // 1. If we have an unsaved staged process for selected microprocess, use its data first
    if (stagedProcess && stagedProcess.process) {
      const stagedMicro = stagedProcess.process.microprocess || stagedProcess.process.name;
      if (normalizeHeader(stagedMicro) === normSelected) {
        return stagedProcess.process;
      }
    }

    // 2. Look for process entry matching microprocess in Firestore
    const targetProcId = normalizeProcessId(selectedMicro);
    const match = processes.find((p) => {
      if (p.id === targetProcId) return true;
      const procMicro = p.process.microprocess || p.process.name;
      return normalizeHeader(procMicro) === normSelected;
    });

    if (match) {
      return {
        ...match.process,
        docState: matchedDocument ? matchedDocument.state : match.process.docState,
        docType: matchedDocument ? matchedDocument.docType : match.process.docType,
        version: matchedDocument ? matchedDocument.version : match.process.version,
        docAuthor: matchedDocument ? matchedDocument.authorName : match.process.docAuthor,
        docComment: matchedDocument ? matchedDocument.description : match.process.docComment,
        docFileName: matchedDocument?.files?.[0]?.name || match.process.docFileName,
        docFileUrl: matchedDocument?.files?.[0]?.url || match.process.docFileUrl,
      };
    }

    // If a document exists in SGD without an UpEngine process file, construct process metadata without fake mock stages
    if (matchedDocument) {
      return {
        id: `proc_${matchedDocument.id}`,
        name: selectedMicro,
        description: matchedDocument.description || '',
        version: matchedDocument.version || '1.0',
        lastUpdated: new Date(matchedDocument.updatedAt || Date.now()).toISOString().split('T')[0],
        project: selectedProject,
        macroprocess: selectedMacro,
        process: selectedProcess,
        microprocess: selectedMicro,
        docType: matchedDocument.docType,
        docState: matchedDocument.state,
        docAuthor: matchedDocument.authorName,
        docComment: matchedDocument.description,
        docFileName: matchedDocument.files?.[0]?.name,
        docFileUrl: matchedDocument.files?.[0]?.url,
        stages: [],
        governanceRules: [],
        roles: [],
        integrations: [],
        asIsContext: undefined,
        toBeOptimizations: matchedDocument.docType === 'TO BE' ? matchedDocument.description : undefined,
        fceFactors: undefined
      };
    }

    return null;
  }, [stagedProcess, processes, selectedMicro, selectedProject, selectedMacro, selectedProcess, matchedDocument]);

  // Determine if a process file was uploaded for the microprocess in TO BE
  const hasToBeDocument = useMemo(() => {
    if (!selectedMicro) return false;
    if (isStagedForSelected) return true;
    const normSelected = normalizeHeader(selectedMicro);

    const match = processes.find((p) => {
      const procMicro = p.process?.microprocess || p.process?.name;
      return procMicro && normalizeHeader(procMicro) === normSelected;
    });

    if (match) {
      const p = match.process;
      if (p?.docFileName || p?.docFileUrl || (p?.stages && p.stages.length > 0) || (p?.subprocesses && p.subprocesses.length > 0)) {
        return true;
      }
    }

    if (toBeDoc && toBeDoc.files && toBeDoc.files.length > 0) {
      return true;
    }

    return false;
  }, [isStagedForSelected, processes, selectedMicro, toBeDoc]);

  // Determine if a process file was uploaded for the microprocess in FCE
  const hasFceDocument = useMemo(() => {
    if (!selectedMicro) return false;
    if (isStagedForSelected) return true;
    const normSelected = normalizeHeader(selectedMicro);

    const match = processes.find((p) => {
      const procMicro = p.process?.microprocess || p.process?.name;
      return procMicro && normalizeHeader(procMicro) === normSelected;
    });

    if (match) {
      const p = match.process;
      if (p?.docFileName || p?.docFileUrl || (p?.stages && p.stages.length > 0) || (p?.subprocesses && p.subprocesses.length > 0)) {
        return true;
      }
    }

    if (fceDoc && fceDoc.files && fceDoc.files.length > 0) {
      return true;
    }

    return false;
  }, [isStagedForSelected, processes, selectedMicro, fceDoc]);

  // Active process node from hierarchy matrix
  const selectedNode = useMemo(() => {
    if (!selectedProject || !selectedMacro || !selectedProcess || !selectedMicro || !hierarchy) return null;
    const nodes = hierarchy[selectedProject]?.[selectedMacro]?.[selectedProcess] || [];
    return nodes.find(n => normalizeHeader(n.name) === normalizeHeader(selectedMicro)) || null;
  }, [hierarchy, selectedProject, selectedMacro, selectedProcess, selectedMicro]);

  // Determine if FCE document type is required/applicable for the selected project and microprocess
  const isFceRequired = useMemo(() => {
    // 1. Check selectedNode requiredTypes if defined and non-empty
    if (selectedNode && Array.isArray(selectedNode.requiredTypes) && selectedNode.requiredTypes.length > 0) {
      return selectedNode.requiredTypes.includes('FCE');
    }
    // 2. Check REQUIRED_DOCS_MATRIX from constants
    if (selectedProject && selectedMicro) {
      const normProj = normalizeHeader(selectedProject);
      const normMicro = normalizeHeader(selectedMicro);
      const row = REQUIRED_DOCS_MATRIX.find(
        (r) => normalizeHeader(r[0] as string) === normProj &&
               normalizeHeader(r[1] as string) === normMicro
      );
      if (row) {
        return row[3] === 1; // FCE index in REQUIRED_DOCS_MATRIX
      }
    }
    // 3. Project-level rule: HSR does NOT require FCE
    if (selectedProject && normalizeHeader(selectedProject) === 'HSR') {
      return false;
    }
    return true;
  }, [selectedNode, selectedProject, selectedMicro]);

  // Auto-switch to TO_BE if FCE is not required for selected project/microprocess
  useEffect(() => {
    if (!isFceRequired && docTab === 'FCE') {
      setDocTab('TO_BE');
    }
  }, [isFceRequired, docTab]);

  const stateConfig = matchedDocument ? STATE_CONFIG[matchedDocument.state] : null;

  return (
    <div className="min-h-screen bg-slate-50/80 p-4 sm:p-6 lg:p-8 space-y-6">
      {/* Top Header Banner Card */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20 shrink-0">
            <Cpu size={26} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight">
              UpEngine <span className="text-indigo-600 font-medium">Universal Process Engine</span>
            </h1>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
              Motor normativo y simulador de flujos para la consolidación de procesos de gestión institucional. Sincronizado en tiempo real con la base documental.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Hidden File Input for Direct Word Upload */}
          <input
            type="file"
            ref={wordFileInputRef}
            onChange={handleWordUploadDirect}
            accept=".docx,.doc"
            className="hidden"
          />

          <button
            type="button"
            onClick={() => {
              if (!selectedMicro) {
                toast.error('Por favor seleccione un microproceso en los filtros antes de cargar el archivo Word.');
                return;
              }
              wordFileInputRef.current?.click();
            }}
            disabled={isWordParsing}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
          >
            {isWordParsing ? (
              <>
                <RefreshCw size={16} className="animate-spin" />
                <span>Procesando Word...</span>
              </>
            ) : (
              <>
                <FileText size={16} />
                <span>Cargar Documento Word (.docx)</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* INTERACTIVE PROCESS MAP */}
      <InteractiveProcessMap
        hierarchy={hierarchy}
        documents={documents}
        processes={processes}
        selectedProject={selectedProject}
        selectedMacro={selectedMacro}
        selectedProcess={selectedProcess}
        selectedMicro={selectedMicro}
        onSelectNode={handleSelectNodeFromMap}
      />

      {/* 4 EXACT HIERARCHY FILTERS TOOLBAR */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2 text-xs font-extrabold text-slate-800 uppercase tracking-wider">
            <Filter size={15} className="text-indigo-600" />
            <span>Filtros de Estructura de Procesos (Proceso Activo Seleccionado)</span>
          </div>
          <span className="text-[11px] font-medium text-slate-400">
            Exactamente 4 niveles jerárquicos
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Proyecto Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              1. Proyecto
            </label>
            <select
              value={selectedProject}
              onChange={(e) => handleProjectChange(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              {projectOptions.map((proj) => (
                <option key={proj} value={proj}>
                  {proj}
                </option>
              ))}
            </select>
          </div>

          {/* 2. Macroproceso Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              2. Macroproceso
            </label>
            <select
              value={selectedMacro}
              onChange={(e) => handleMacroChange(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              {macroOptions.map((macro) => (
                <option key={macro} value={macro}>
                  {macro}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Proceso Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              3. Proceso
            </label>
            <select
              value={selectedProcess}
              onChange={(e) => handleProcessChange(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              {processOptions.map((proc) => (
                <option key={proc} value={proc}>
                  {proc}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Microproceso Filter */}
          <div>
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              4. Microproceso
            </label>
            <select
              value={selectedMicro}
              onChange={(e) => setSelectedMicro(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              {microOptions.map((micro) => (
                <option key={micro} value={micro}>
                  {micro}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Hierarchy Breadcrumb Bar */}
        <div className="pt-2 flex flex-wrap items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 font-medium">
          <Folder size={14} className="text-indigo-500 shrink-0" />
          <span className="font-semibold text-slate-800">{selectedProject || 'Proyecto'}</span>
          <ArrowRight size={12} className="text-slate-400" />
          <span>{selectedMacro || 'Macroproceso'}</span>
          <ArrowRight size={12} className="text-slate-400" />
          <span>{selectedProcess || 'Proceso'}</span>
          <ArrowRight size={12} className="text-slate-400" />
          <span className="font-bold text-indigo-700 underline">{selectedMicro || 'Microproceso'}</span>
        </div>
      </div>

      {/* TABS ARCHITECTURE FOR TO BE AND FCE */}
      {loading ? (
        <div className="p-12 text-center bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
          <RefreshCw size={26} className="animate-spin text-indigo-600 mb-2" />
          <p className="text-xs font-bold text-slate-600">Sincronizando estado normativo...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB SWITCHER BAR */}
          <div className="bg-white p-2 rounded-2xl border border-slate-200 shadow-xs flex flex-col sm:flex-row gap-2">
            <button
              onClick={() => setDocTab('TO_BE')}
              className={`flex-1 flex items-center justify-between p-4 rounded-xl text-xs font-bold transition-all border ${
                docTab === 'TO_BE'
                  ? 'bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white border-indigo-500 shadow-md ring-2 ring-indigo-500/20'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${docTab === 'TO_BE' ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                  <Zap size={16} />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-black">Pestaña TO-BE</span>
                  <span className={`text-[10px] ${docTab === 'TO_BE' ? 'text-indigo-200' : 'text-slate-500'}`}>
                    Proceso Futuro Optimizado
                  </span>
                </div>
              </div>

              {toBeDoc ? (
                <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-extrabold uppercase rounded-full flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  Actualizado v{formatVersionForDisplay(toBeDoc.version)}
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-extrabold uppercase rounded-full flex items-center gap-1">
                  <AlertCircle size={11} />
                  Pendiente de Actualización
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => {
                if (!isFceRequired) {
                  toast.info(`El documento FCE no es requerido para el proyecto ${selectedProject || 'seleccionado'}.`);
                  return;
                }
                setDocTab('FCE');
              }}
              disabled={!isFceRequired}
              className={`flex-1 flex items-center justify-between p-4 rounded-xl text-xs font-bold transition-all border ${
                !isFceRequired
                  ? 'bg-slate-100/80 text-slate-400 border-slate-200 cursor-not-allowed opacity-60'
                  : docTab === 'FCE'
                  ? 'bg-gradient-to-r from-slate-900 via-emerald-950 to-slate-900 text-white border-emerald-500 shadow-md ring-2 ring-emerald-500/20 cursor-pointer'
                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 cursor-pointer'
              }`}
              title={!isFceRequired ? `Para el proyecto ${selectedProject || 'HSR'} no son requeridos los documentos FCE.` : undefined}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center font-bold ${
                    !isFceRequired
                      ? 'bg-slate-200 text-slate-400'
                      : docTab === 'FCE'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  <Activity size={16} />
                </div>
                <div className="text-left">
                  <div className="flex items-center gap-2">
                    <span className="block text-xs font-black">Pestaña FCE</span>
                    {!isFceRequired && (
                      <span className="px-2 py-0.5 bg-slate-200 text-slate-600 border border-slate-300 text-[9px] font-extrabold uppercase rounded-full">
                        No Requerido ({selectedProject || 'HSR'})
                      </span>
                    )}
                  </div>
                  <span
                    className={`text-[10px] ${
                      !isFceRequired
                        ? 'text-slate-400'
                        : docTab === 'FCE'
                        ? 'text-emerald-200'
                        : 'text-slate-500'
                    }`}
                  >
                    {!isFceRequired ? `No aplica para ${selectedProject || 'este proyecto'}` : 'Factores Críticos de Éxito'}
                  </span>
                </div>
              </div>

              {!isFceRequired ? (
                <span className="px-2.5 py-1 bg-slate-200 text-slate-500 text-[10px] font-extrabold uppercase rounded-full">
                  No Aplica
                </span>
              ) : fceDoc ? (
                <span className="px-2.5 py-1 bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 text-[10px] font-extrabold uppercase rounded-full flex items-center gap-1">
                  <CheckCircle2 size={11} />
                  Actualizado v{formatVersionForDisplay(fceDoc.version)}
                </span>
              ) : (
                <span className="px-2.5 py-1 bg-amber-500/20 border border-amber-400/30 text-amber-300 text-[10px] font-extrabold uppercase rounded-full flex items-center gap-1">
                  <AlertCircle size={11} />
                  Pendiente de Actualización
                </span>
              )}
            </button>
          </div>

          {/* TAB 1 CONTENT: TO BE */}
          {docTab === 'TO_BE' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-5">
                {!toBeDoc ? (
                  /* PENDIENTE DE ACTUALIZACIÓN ALERT FOR TO BE */
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-xs">
                          <AlertCircle size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-amber-950">
                              Estado del Documento SGD: <span className="text-amber-800 underline">Pendiente de Actualización</span>
                            </h4>
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] uppercase rounded-full">
                              Sin Archivo TO-BE
                            </span>
                          </div>
                          <p className="text-xs text-amber-900/90 mt-1 font-medium">
                            Este microproceso aún no cuenta con un archivo o documento <strong className="text-amber-950">TO BE</strong> cargado o consolidado mediante la funcionalidad del SGD.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap self-end sm:self-center">
                        <button
                          onClick={() => openUploadModal('TO_BE')}
                          className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/20 transition-all cursor-pointer"
                        >
                          <FileUp size={15} />
                          <span>Subir Archivo a UpEngine</span>
                        </button>

                        <Link
                          to={`/create?project=${encodeURIComponent(selectedProject)}&macro=${encodeURIComponent(selectedMacro)}&process=${encodeURIComponent(selectedProcess)}&micro=${encodeURIComponent(selectedMicro)}&type=TO%20BE`}
                          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition-all"
                        >
                          <PlusCircle size={15} />
                          <span>Cargar / Consolidar Documento (TO BE)</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* DOCUMENT CAPTURED INFO FOR TO BE */
                  <div className="space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold uppercase rounded-full flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-600" />
                            Documentación Actualizada en SGD
                          </span>
                          <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-mono font-extrabold rounded-full">
                            Versión: {formatVersionForDisplay(toBeDoc.version)}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 tracking-tight">
                          {toBeDoc.microprocess || selectedMicro}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">{toBeDoc.title}</p>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 shrink-0 min-w-[260px]">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Estado Actual del Documento
                        </div>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STATE_CONFIG[toBeDoc.state]?.color || 'bg-slate-100 text-slate-800'}`}>
                            {STATE_CONFIG[toBeDoc.state]?.label || toBeDoc.state}
                          </span>
                          <span className="text-xs font-mono font-extrabold text-slate-700">
                            {toBeDoc.progress}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-indigo-600 rounded-full transition-all duration-500"
                            style={{ width: `${toBeDoc.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <UserIcon size={12} className="text-indigo-500" /> Creado / Cargado por
                        </span>
                        <p className="font-bold text-slate-800 truncate">{toBeDoc.authorName}</p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <Clock size={12} className="text-indigo-500" /> Última Modificación
                        </span>
                        <p className="font-bold text-slate-800 font-mono">
                          {new Date(toBeDoc.updatedAt || Date.now()).toLocaleDateString('es-CL')}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-0.5 sm:col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <FileText size={12} className="text-indigo-500" /> Observación / Descripción
                        </span>
                        <p className="font-medium text-slate-700 truncate">
                          {toBeDoc.description || 'Sin observaciones registradas.'}
                        </p>
                      </div>
                    </div>

                    {toBeDoc.files && toBeDoc.files.length > 0 && (
                      <div className="p-3.5 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <FileUp size={16} className="text-indigo-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-900 truncate">{toBeDoc.files[0].name}</span>
                        </div>
                        <a
                          href={toBeDoc.files[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0"
                        >
                          <Download size={13} />
                          <span>Ver Archivo</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MANUAL DE ESPECIFICACIÓN DE PROCESOS (TO-BE) */}
              <ProcessSpecificationManual
                process={activeProcess}
                microprocessName={selectedMicro}
                projectName={selectedProject}
                docType="TO BE"
                initialFramework="TO_BE"
                hasDocument={hasToBeDocument}
                isStaged={isStagedForSelected}
                isSaving={isSaving}
                isDeleting={isDeleting}
                onOpenUploadModal={() => {
                  if (!selectedMicro) {
                    toast.error('Por favor seleccione un microproceso antes de cargar el documento Word.');
                    return;
                  }
                  wordFileInputRef.current?.click();
                }}
                onSaveProcess={handleSaveProcess}
                onCancelStaged={handleCancelStaged}
                onDeleteProcess={handleDeleteProcess}
              />
            </div>
          )}

          {/* TAB 2 CONTENT: FCE */}
          {docTab === 'FCE' && (
            <div className="space-y-6 animate-fadeIn">
              <div className="bg-white rounded-3xl p-6 border border-slate-200/90 shadow-sm space-y-5">
                {!fceDoc ? (
                  /* PENDIENTE DE ACTUALIZACIÓN ALERT FOR FCE */
                  <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/90 rounded-2xl p-5 space-y-4">
                    <div className="flex flex-col sm:flex-row items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 mt-0.5 shadow-xs">
                          <AlertCircle size={20} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4 className="text-sm font-bold text-amber-950">
                              Estado del Documento SGD: <span className="text-amber-800 underline">Pendiente de Actualización</span>
                            </h4>
                            <span className="px-2.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 font-extrabold text-[10px] uppercase rounded-full">
                              Sin Archivo FCE
                            </span>
                          </div>
                          <p className="text-xs text-amber-900/90 mt-1 font-medium">
                            Este microproceso aún no cuenta con un archivo o documento <strong className="text-amber-950">FCE</strong> cargado o consolidado mediante la funcionalidad del SGD.
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0 flex-wrap self-end sm:self-center">
                        <button
                          onClick={() => openUploadModal('FCE')}
                          className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-600/20 transition-all cursor-pointer"
                        >
                          <FileUp size={15} />
                          <span>Subir Archivo a UpEngine</span>
                        </button>

                        <Link
                          to={`/create?project=${encodeURIComponent(selectedProject)}&macro=${encodeURIComponent(selectedMacro)}&process=${encodeURIComponent(selectedProcess)}&micro=${encodeURIComponent(selectedMicro)}&type=FCE`}
                          className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/20 transition-all"
                        >
                          <PlusCircle size={15} />
                          <span>Cargar / Consolidar Documento (FCE)</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* DOCUMENT CAPTURED INFO FOR FCE */
                  <div className="space-y-4">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="px-3 py-1 bg-emerald-50 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold uppercase rounded-full flex items-center gap-1">
                            <CheckCircle2 size={12} className="text-emerald-600" />
                            Documentación Actualizada en SGD
                          </span>
                          <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-mono font-extrabold rounded-full">
                            Versión: {formatVersionForDisplay(fceDoc.version)}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-slate-900 tracking-tight">
                          {fceDoc.microprocess || selectedMicro}
                        </h4>
                        <p className="text-xs text-slate-500 mt-0.5">{fceDoc.title}</p>
                      </div>

                      <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 shrink-0 min-w-[260px]">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                          Estado Actual del Documento
                        </div>
                        <div className="flex items-center justify-between gap-3 mb-1.5">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${STATE_CONFIG[fceDoc.state]?.color || 'bg-slate-100 text-slate-800'}`}>
                            {STATE_CONFIG[fceDoc.state]?.label || fceDoc.state}
                          </span>
                          <span className="text-xs font-mono font-extrabold text-slate-700">
                            {fceDoc.progress}%
                          </span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                            style={{ width: `${fceDoc.progress}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <UserIcon size={12} className="text-emerald-500" /> Creado / Cargado por
                        </span>
                        <p className="font-bold text-slate-800 truncate">{fceDoc.authorName}</p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-0.5">
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <Clock size={12} className="text-emerald-500" /> Última Modificación
                        </span>
                        <p className="font-bold text-slate-800 font-mono">
                          {new Date(fceDoc.updatedAt || Date.now()).toLocaleDateString('es-CL')}
                        </p>
                      </div>

                      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200/80 space-y-0.5 sm:col-span-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase flex items-center gap-1">
                          <FileText size={12} className="text-emerald-500" /> Observación / Descripción
                        </span>
                        <p className="font-medium text-slate-700 truncate">
                          {fceDoc.description || 'Sin observaciones registradas.'}
                        </p>
                      </div>
                    </div>

                    {fceDoc.files && fceDoc.files.length > 0 && (
                      <div className="p-3.5 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <FileUp size={16} className="text-emerald-600 shrink-0" />
                          <span className="text-xs font-bold text-slate-900 truncate">{fceDoc.files[0].name}</span>
                        </div>
                        <a
                          href={fceDoc.files[0].url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs shrink-0"
                        >
                          <Download size={13} />
                          <span>Ver Archivo</span>
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* MANUAL DE ESPECIFICACIÓN DE PROCESOS (FCE) */}
              <ProcessSpecificationManual
                process={activeProcess}
                microprocessName={selectedMicro}
                projectName={selectedProject}
                docType="FCE"
                initialFramework="FCE"
                hasDocument={hasFceDocument}
                isStaged={isStagedForSelected}
                isSaving={isSaving}
                isDeleting={isDeleting}
                onOpenUploadModal={() => {
                  if (!selectedMicro) {
                    toast.error('Por favor seleccione un microproceso antes de cargar el documento Word.');
                    return;
                  }
                  wordFileInputRef.current?.click();
                }}
                onSaveProcess={handleSaveProcess}
                onCancelStaged={handleCancelStaged}
                onDeleteProcess={handleDeleteProcess}
              />
            </div>
          )}
        </div>
      )}

      {/* Action Buttons Bar for Library and AI Import */}

      {/* Modals */}
      <LibraryManagerModal
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        processes={processes}
        activeProcessId={activeProcess?.id || ''}
        onSelectProcess={(entry) => {
          setIsLibraryOpen(false);
          if (entry.process.microprocess) {
            setSelectedMicro(entry.process.microprocess);
          }
        }}
      />

      <GeminiImportModal
        isOpen={isGeminiOpen}
        onClose={() => setIsGeminiOpen(false)}
        onProcessImported={(proc) => {
          setIsGeminiOpen(false);
          toast.success(`Proceso "${proc.name}" importado con éxito.`);
        }}
      />

      <UpEngineUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        user={user}
        project={selectedProject}
        macro={selectedMacro}
        process={selectedProcess}
        micro={selectedMicro}
        docType={uploadModalDocType}
        onSuccess={refreshDocuments}
      />
    </div>
  );
};

export default UpEngineView;

