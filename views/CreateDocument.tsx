
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DocumentService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { User, DocState, DocType, UserHierarchy, UserRole, Document, FullHierarchy } from '../types';
import { parseDocumentFilename } from '../utils/filenameParser';
import { Save, ArrowLeft, Upload, FileCheck, FileX, AlertTriangle, Info, Layers, FileType, FilePlus, ListFilter, Lock, RefreshCw } from 'lucide-react';

interface Props {
  user: User;
}

// Request Types mapped to Parser Logic
type RequestType = 'INITIATED' | 'IN_PROCESS' | 'INTERNAL' | 'REFERENT' | 'CONTROL';

// Map States to Levels for filtering
const STATE_LEVELS: Record<DocState, number> = {
    [DocState.NOT_STARTED]: 0,
    [DocState.INITIATED]: 1,
    [DocState.IN_PROCESS]: 2,
    [DocState.INTERNAL_REVIEW]: 3,
    [DocState.SENT_TO_REFERENT]: 4,
    [DocState.REFERENT_REVIEW]: 4,
    [DocState.SENT_TO_CONTROL]: 5,
    [DocState.CONTROL_REVIEW]: 5,
    [DocState.APPROVED]: 6,
    [DocState.REJECTED]: 0 // Special case
};

const REQUEST_TYPE_LEVELS: Record<RequestType, number> = {
    'INITIATED': 1,
    'IN_PROCESS': 2,
    'INTERNAL': 3,
    'REFERENT': 4,
    'CONTROL': 5
};

const CreateDocument: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation(); // Hook to access passed state
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Hierarchy Selection State with Strict Typing
  const [userHierarchy, setUserHierarchy] = useState<UserHierarchy>({});
  const [fullHierarchyCache, setFullHierarchyCache] = useState<FullHierarchy>({}); // Cache full hierarchy for assignments
  
  // Matrix Requirement Map (Project|Micro -> AllowedTypes[])
  const [requirementsMap, setRequirementsMap] = useState<Record<string, DocType[]>>({});

  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedMacro, setSelectedMacro] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [selectedMicro, setSelectedMicro] = useState<string>('');
  const [selectedDocType, setSelectedDocType] = useState<DocType | ''>('');
  
  // New: Request Type for Safety
  const [requestType, setRequestType] = useState<RequestType | ''>('');

  // Existing Document State (for filtering)
  const [existingDoc, setExistingDoc] = useState<Document | null>(null);
  const [existingDocLevel, setExistingDocLevel] = useState<number>(0);

  // File Upload State
  const [file, setFile] = useState<File | undefined>(undefined);
  const [fileError, setFileError] = useState<string[]>([]);
  const [isFileValid, setIsFileValid] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Inferred Workflow State
  const [detectedState, setDetectedState] = useState<DocState>(DocState.INITIATED);
  const [detectedVersion, setDetectedVersion] = useState('0.0');
  const [detectedProgress, setDetectedProgress] = useState(10);

  // Cache of all docs for quick lookup
  const [allDocsCache, setAllDocsCache] = useState<Document[]>([]);

  useEffect(() => {
      loadData();
  }, []);

  // Effect to find existing document when selection changes
  useEffect(() => {
      if (selectedProject && selectedMicro && selectedDocType) {
          const found = allDocsCache.find(d => 
              d.project === selectedProject && 
              (d.microprocess === selectedMicro || d.title.includes(selectedMicro)) &&
              d.docType === selectedDocType
          );
          
          if (found) {
              setExistingDoc(found);
              // Calculate effective level (Use MAX logic if multiple found, but find returns first. Assuming cache is sorted by update)
              const level = STATE_LEVELS[found.state] || 0;
              setExistingDocLevel(level);
          } else {
              setExistingDoc(null);
              setExistingDocLevel(0);
          }
      } else {
          setExistingDoc(null);
          setExistingDocLevel(0);
      }
      
      // Reset request type when hierarchy changes to prevent invalid states
      setRequestType('');
      resetFile();

  }, [selectedProject, selectedMicro, selectedDocType, allDocsCache]);

  const loadData = async () => {
      // 1. Cargar Mapa de Requisitos, Jerarquía y Documentos Existentes
      try {
          // Always load full hierarchy to get assignment data
          const [reqMap, full, docs] = await Promise.all([
              HierarchyService.getRequiredTypesMap(),
              HierarchyService.getFullHierarchy(),
              DocumentService.getAll()
          ]);

          setRequirementsMap(reqMap);
          setAllDocsCache(docs);
          setFullHierarchyCache(full);

          // Build View Hierarchy based on Role
          if (user.role === UserRole.ADMIN) {
               const adminTree: UserHierarchy = {};
               // Convertir FullHierarchy (nodos complejos) a UserHierarchy (solo nombres)
               Object.keys(full).forEach(p => {
                   adminTree[p] = {};
                   Object.keys(full[p]).forEach(m => {
                       adminTree[p][m] = {};
                       Object.keys(full[p][m]).forEach(proc => {
                           adminTree[p][m][proc] = full[p][m][proc].map(n => n.name);
                       });
                   });
               });
               setUserHierarchy(adminTree);
          } else {
              // Si es Analista/Coordinador, cargamos SU jerarquía filtrada
              const userH = await HierarchyService.getUserHierarchy(user.id);
              setUserHierarchy(userH);
          }

          // 2. PRE-FILL LOGIC (Si viene desde Dashboard o Detalle)
          if (location.state?.prefill) {
              const { project, macro, process, micro, docType } = location.state.prefill;
              if (project) setSelectedProject(project);
              if (macro) setSelectedMacro(macro);
              if (process) setSelectedProcess(process);
              if (micro) setSelectedMicro(micro);
              
              // Validate if the pre-filled docType is actually allowed
              if (docType && project && micro) {
                  // FIX: Use normalized key for lookup here too
                  const key = `${normalizeHeader(project)}|${normalizeHeader(micro)}`;
                  const allowed = reqMap[key] || [];
                  if (allowed.includes(docType)) {
                      setSelectedDocType(docType);
                  }
              }
          }
      } catch (e) {
          console.error("Error loading create document data", e);
      } finally {
          setInitializing(false);
      }
  };

  // Helper functions for safe extraction of hierarchy arrays
  const getProjects = (): string[] => {
      return Object.keys(userHierarchy);
  };

  const getMacros = (): string[] => {
      if (!selectedProject || !userHierarchy[selectedProject]) return [];
      return Object.keys(userHierarchy[selectedProject]);
  };

  const getProcesses = (): string[] => {
      if (!selectedProject || !selectedMacro || !userHierarchy[selectedProject]?.[selectedMacro]) return [];
      return Object.keys(userHierarchy[selectedProject][selectedMacro]);
  };

  const getMicros = (): string[] => {
      if (!selectedProject || !selectedMacro || !selectedProcess) return [];
      const processes = userHierarchy[selectedProject]?.[selectedMacro];
      if (!processes) return [];
      return processes[selectedProcess] || [];
  };

  // Helper to check allowed types based on Matrix
  const getAllowedDocTypes = (): DocType[] => {
      if (!selectedProject || !selectedMicro) return [];
      // FIX: Use normalizeHeader to match the key format stored in requirementsMap (created in backend service)
      const key = `${normalizeHeader(selectedProject)}|${normalizeHeader(selectedMicro)}`;
      return requirementsMap[key] || [];
  };

  // Find assignments from Full Hierarchy Cache
  const getAssigneesForSelection = (): string[] => {
      if (!selectedProject || !selectedMacro || !selectedProcess || !selectedMicro) return [];
      const nodes = fullHierarchyCache[selectedProject]?.[selectedMacro]?.[selectedProcess] || [];
      const node = nodes.find(n => n.name === selectedMicro);
      return node?.assignees || [];
  };

  // Reset downstream selections when upstream changes
  const handleProjectChange = (val: string) => {
      setSelectedProject(val);
      setSelectedMacro('');
      setSelectedProcess('');
      setSelectedMicro('');
      resetFile();
  };

  const handleMacroChange = (val: string) => {
      setSelectedMacro(val);
      setSelectedProcess('');
      setSelectedMicro('');
      resetFile();
  };

  const handleProcessChange = (val: string) => {
      setSelectedProcess(val);
      setSelectedMicro('');
      resetFile();
  };

  const handleMicroChange = (val: string) => {
      setSelectedMicro(val);
      setSelectedDocType(''); // Reset type because allowed types change per micro
      resetFile();
  }

  const handleTypeChange = (val: string) => {
      setSelectedDocType(val as DocType);
      resetFile();
  }
  
  const handleRequestTypeChange = (val: string) => {
      setRequestType(val as RequestType);
      resetFile();
  }

  const resetFile = () => {
      setFile(undefined);
      setFileError([]);
      setIsFileValid(false);
      setTitle('');
      setDescription('');
      if (fileInputRef.current) {
          fileInputRef.current.value = '';
      }
  };

  const mapParserStateToEnum = (parserState: string): DocState => {
      switch (parserState) {
          case 'Iniciado': return DocState.INITIATED;
          case 'En Proceso': return DocState.IN_PROCESS;
          case 'En revisión interna': return DocState.INTERNAL_REVIEW;
          case 'Enviado a Referente': return DocState.SENT_TO_REFERENT;
          case 'Revisión con referentes': return DocState.REFERENT_REVIEW;
          case 'Enviado a Control de Gestión': return DocState.SENT_TO_CONTROL;
          case 'Revisión con Control de Gestión': return DocState.CONTROL_REVIEW;
          case 'Aprobado': return DocState.APPROVED;
          default: return DocState.INITIATED;
      }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          
          // Validate logic with Strict Request Type
          const result = parseDocumentFilename(
              selectedFile.name,
              selectedProject,
              selectedMicro,
              selectedDocType || undefined,
              requestType || undefined // Pass the strict expected type
          );
          
          if (result.valido) {
              setIsFileValid(true);
              setFileError([]);
              
              const cleanMicro = result.microproceso || selectedMicro;
              const cleanType = result.tipo || selectedDocType;
              setTitle(`${cleanMicro} - ${cleanType}`);
              setDescription(`Carga de documento: ${cleanType} (${result.nomenclatura})`);
              
              if (result.estado) setDetectedState(mapParserStateToEnum(result.estado));
              if (result.nomenclatura) setDetectedVersion(result.nomenclatura);
              if (result.porcentaje) setDetectedProgress(result.porcentaje);

          } else {
              setIsFileValid(false);
              setFileError(result.errores);
              setTitle('');
              setDescription('');
          }
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !file || !isFileValid || !selectedMicro || !selectedDocType || !requestType) return;

    setLoading(true);
    
    try {
      // Find assigned users from hierarchy to ensure correct assignment
      const matrixAssignees = getAssigneesForSelection();

      const newDoc = await DocumentService.create(
          title, 
          description, 
          user,
          detectedState,
          detectedVersion,
          detectedProgress,
          file,
          {
              project: selectedProject,
              macro: selectedMacro,
              process: selectedProcess,
              micro: selectedMicro,
              docType: selectedDocType,
              assignees: matrixAssignees // Pass matrix assignees
          }
      );

      navigate(`/doc/${newDoc.id}`);
    } catch (error: any) {
      console.error(error);
      alert('Error al crear documento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Options filtering Logic
  const shouldShowOption = (type: RequestType): boolean => {
      if (!existingDoc || existingDoc.state === DocState.REJECTED) return true; // If rejected or new, allow all (typically reset)
      
      const optionLevel = REQUEST_TYPE_LEVELS[type];
      
      // LOGIC: Show only levels >= current level
      // Exception: If current is Internal Review (3), we allow Internal Review (3) [update] and Referent (4) [advance].
      return optionLevel >= existingDocLevel;
  };

  if (initializing) return <div className="p-8 text-center text-slate-500">Cargando permisos...</div>;

  const projects = getProjects() as string[];
  const macros = getMacros() as string[];
  const processes = getProcesses() as string[];
  const micros = getMicros() as string[];
  const docTypes = ['AS IS', 'FCE', 'PM', 'TO BE'];
  
  const allowedDocTypes = getAllowedDocTypes();

  return (
    <div className="max-w-4xl mx-auto pb-12">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-slate-800 mb-6 text-sm">
            <ArrowLeft size={16} className="mr-1" />
            Volver
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
            <div className="mb-8 border-b border-slate-100 pb-4">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Nueva Solicitud</h1>
                <p className="text-slate-500">
                   Carga de documento para gestión y aprobación.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* Step 1: Hierarchy Selection */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <Layers size={18} className="text-indigo-600" />
                        1. Definición del Proceso
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Project */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Proyecto</label>
                            <select 
                                value={selectedProject}
                                onChange={(e) => handleProjectChange(e.target.value)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">-- Seleccionar --</option>
                                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>

                        {/* Macroprocess */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Macroproceso</label>
                            <select 
                                value={selectedMacro}
                                onChange={(e) => handleMacroChange(e.target.value)}
                                disabled={!selectedProject}
                                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">-- Seleccionar --</option>
                                {macros.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        {/* Process */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Proceso</label>
                            <select 
                                value={selectedProcess}
                                onChange={(e) => handleProcessChange(e.target.value)}
                                disabled={!selectedMacro}
                                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">-- Seleccionar --</option>
                                {processes.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>

                        {/* Microprocess */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Microproceso</label>
                            <select 
                                value={selectedMicro}
                                onChange={(e) => handleMicroChange(e.target.value)}
                                disabled={!selectedProcess}
                                className="w-full p-2.5 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-indigo-900"
                            >
                                <option value="">-- Seleccionar --</option>
                                {micros.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        {/* Report Type (Filtered by Requirements) */}
                        <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase">Tipo de Informe</label>
                                {selectedMicro && (
                                    <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                                        Filtrado por Matriz
                                    </span>
                                )}
                            </div>
                            
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {docTypes.map(type => {
                                    const isAllowed = allowedDocTypes.includes(type as DocType);
                                    
                                    return (
                                        <label key={type} className={`
                                            relative border rounded-lg p-3 text-center transition-all
                                            ${!selectedMicro 
                                                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' 
                                                : isAllowed 
                                                    ? (selectedDocType === type 
                                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105 cursor-pointer' 
                                                        : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 cursor-pointer')
                                                    : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed opacity-60'}
                                        `}>
                                            <input 
                                                type="radio" 
                                                name="docType" 
                                                value={type} 
                                                checked={selectedDocType === type}
                                                onChange={(e) => handleTypeChange(e.target.value)}
                                                className="hidden"
                                                disabled={!selectedMicro || !isAllowed}
                                            />
                                            <span className="text-sm font-medium flex items-center justify-center gap-1">
                                                {!isAllowed && selectedMicro && <Lock size={12} />}
                                                {type}
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                            {selectedMicro && allowedDocTypes.length === 0 && (
                                <p className="text-xs text-red-400 mt-2 flex items-center gap-1">
                                    <AlertTriangle size={12} /> Este microproceso no tiene documentos configurados en la matriz.
                                </p>
                            )}
                        </div>

                        {/* Request Type Selector (Workflow Stage) */}
                        <div className="md:col-span-2 mt-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100 transition-all">
                             <div className="flex justify-between items-center mb-2">
                                 <label className="block text-xs font-bold text-indigo-900 uppercase flex items-center gap-2">
                                    <ListFilter size={16} /> Tipo de Solicitud / Etapa
                                 </label>
                                 {existingDoc && (
                                     <span className="text-[10px] bg-white border border-indigo-200 px-2 py-1 rounded text-indigo-600 font-medium">
                                         Progreso Actual: {existingDoc.version}
                                     </span>
                                 )}
                             </div>
                             
                             <select 
                                value={requestType} 
                                onChange={(e) => handleRequestTypeChange(e.target.value)}
                                disabled={!selectedDocType}
                                className="w-full p-3 border border-indigo-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 disabled:bg-slate-100"
                            >
                                <option value="">-- Seleccione qué está subiendo --</option>
                                {shouldShowOption('INITIATED') && <option value="INITIATED">Iniciado (Versión 0.0)</option>}
                                {shouldShowOption('IN_PROCESS') && <option value="IN_PROCESS">En Proceso / Avance (Versión 0.n)</option>}
                                {shouldShowOption('INTERNAL') && <option value="INTERNAL">Revisión Interna (Versión v0.n)</option>}
                                {shouldShowOption('REFERENT') && <option value="REFERENT">Revisión Referente (Versión v1.n)</option>}
                                {shouldShowOption('CONTROL') && <option value="CONTROL">Control de Gestión (Versión v1.nAR)</option>}
                            </select>
                            
                            <p className="text-[10px] text-indigo-600 mt-2">
                                {existingDoc 
                                    ? `* Se han filtrado las etapas anteriores al estado actual del documento (${existingDoc.version}).`
                                    : "* El archivo que subas debe coincidir estrictamente con la etapa seleccionada."
                                }
                            </p>
                        </div>
                    </div>

                    {projects.length === 0 && (
                        <div className="mt-4 p-3 bg-yellow-50 text-yellow-700 text-sm rounded border border-yellow-200 flex items-center gap-2">
                            <AlertTriangle size={16} />
                            No tienes procesos asignados actualmente. Contacta al administrador.
                        </div>
                    )}
                </div>

                {/* Step 2: File Upload */}
                {selectedMicro && selectedDocType && requestType && (
                    <div className="animate-fadeIn">
                         <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Upload size={18} className="text-indigo-600" />
                            2. Carga de Archivo
                        </h2>
                        
                        <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-sm rounded border border-blue-100 flex items-start gap-2">
                            <Info size={18} className="mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-semibold">Nomenclatura Requerida:</p>
                                <p className="font-mono mt-1 text-xs md:text-sm font-bold">
                                    {selectedProject} - {selectedMicro} - {selectedDocType.replace(' ', '')} - [Versión]
                                </p>
                            </div>
                        </div>

                        <div className={`border-2 border-dashed rounded-xl p-8 transition-colors flex flex-col items-center justify-center text-center group relative
                            ${isFileValid ? 'border-green-300 bg-green-50' : 
                              fileError.length > 0 ? 'border-red-300 bg-red-50' : 
                              'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}>
                            
                            <input 
                                type="file" 
                                ref={fileInputRef}
                                onChange={handleFileSelect}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            />

                            {file ? (
                                isFileValid ? (
                                    <div className="text-green-700">
                                        <FileCheck size={48} className="mx-auto mb-3" />
                                        <p className="font-semibold text-lg">{file.name}</p>
                                        <p className="text-sm mt-1">Archivo válido y listo para cargar</p>
                                    </div>
                                ) : (
                                    <div className="text-red-600">
                                        <FileX size={48} className="mx-auto mb-3" />
                                        <p className="font-semibold text-lg">{file.name}</p>
                                        <div className="mt-3 text-sm text-left bg-white/50 p-3 rounded border border-red-200 inline-block">
                                            <ul className="list-disc pl-4 space-y-1">
                                                {fileError.map((err, idx) => (
                                                    <li key={idx}>{err}</li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="text-slate-500 group-hover:text-indigo-600">
                                    <Upload size={40} className="mx-auto mb-3" />
                                    <p className="font-medium">Click para seleccionar archivo</p>
                                    <p className="text-xs mt-2 text-slate-400">
                                        Se validará la versión contra la etapa seleccionada.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3: Confirmation Form */}
                {isFileValid && selectedMicro && selectedDocType && requestType && (
                    <div className="animate-fadeIn border-t border-slate-100 pt-6">
                         <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                            <FileType size={20} className="text-slate-500 flex-shrink-0" />
                            <div className="text-sm text-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                                <div><span className="text-slate-400 text-xs uppercase block">Estado Detectado</span>{mapParserStateToEnum(parseDocumentFilename(file!.name).estado || '').replace(/_/g, ' ')}</div>
                                <div><span className="text-slate-400 text-xs uppercase block">Versión</span>{detectedVersion}</div>
                                <div><span className="text-slate-400 text-xs uppercase block">Progreso</span>{detectedProgress}%</div>
                                <div><span className="text-slate-400 text-xs uppercase block">Tipo</span>{selectedDocType}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Título del Documento</label>
                                <input 
                                    type="text" 
                                    value={title}
                                    readOnly
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600 focus:outline-none cursor-not-allowed"
                                />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Descripción</label>
                                <input 
                                    type="text" 
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                                    required
                                />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="flex items-center px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50 transition-colors shadow-md font-medium"
                            >
                                {loading ? 'Cargando...' : (
                                    <>
                                        <FilePlus size={18} className="mr-2" />
                                        Cargar Documento
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                )}
            </form>
        </div>
    </div>
  );
};

export default CreateDocument;
