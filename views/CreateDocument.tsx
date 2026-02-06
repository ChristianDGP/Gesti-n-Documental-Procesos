import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DocumentService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { User, DocState, DocType, UserHierarchy, UserRole, Document, FullHierarchy } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename } from '../utils/filenameParser';
import { Save, ArrowLeft, Upload, FileCheck, FileX, AlertTriangle, Info, Layers, FileType, FilePlus, ListFilter, Lock, RefreshCw, History } from 'lucide-react';

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
  const location = useLocation(); 
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Hierarchy Selection State
  const [userHierarchy, setUserHierarchy] = useState<UserHierarchy>({});
  const [fullHierarchyCache, setFullHierarchyCache] = useState<FullHierarchy>({}); 
  
  // Matrix Requirement Map
  const [requirementsMap, setRequirementsMap] = useState<Record<string, DocType[]>>({});

  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedMacro, setSelectedMacro] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [selectedMicro, setSelectedMicro] = useState<string>('');
  const [selectedDocType, setSelectedDocType] = useState<DocType | ''>('');
  
  const [requestType, setRequestType] = useState<RequestType | ''>('');

  // Existing Document State
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
              normalizeHeader(d.project || '') === normalizeHeader(selectedProject) && 
              normalizeHeader(d.microprocess || d.title.split(' - ')[0] || '') === normalizeHeader(selectedMicro) &&
              d.docType === selectedDocType
          );
          
          if (found) {
              setExistingDoc(found);
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
      
      // Do not reset requestType automatically if pre-filled, but handle file reset
      resetFile();

  }, [selectedProject, selectedMicro, selectedDocType, allDocsCache]);

  const loadData = async () => {
      try {
          const [reqMap, full, docs] = await Promise.all([
              HierarchyService.getRequiredTypesMap(),
              HierarchyService.getFullHierarchy(),
              DocumentService.getAll()
          ]);

          setRequirementsMap(reqMap);
          setAllDocsCache(docs);
          setFullHierarchyCache(full);

          let currentHierarchy: UserHierarchy = {};
          if (user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) {
               Object.keys(full).forEach(p => {
                   currentHierarchy[p] = {};
                   Object.keys(full[p]).forEach(m => {
                       currentHierarchy[p][m] = {};
                       Object.keys(full[p][m]).forEach(proc => {
                           currentHierarchy[p][m][proc] = full[p][m][proc].map(n => n.name);
                       });
                   });
               });
               setUserHierarchy(currentHierarchy);
          } else {
              currentHierarchy = await HierarchyService.getUserHierarchy(user.id);
              setUserHierarchy(currentHierarchy);
          }

          // Handle Pre-fill from Document Detail
          if (location.state?.prefill) {
              const { project, macro, process, micro, docType } = location.state.prefill;
              if (project) setSelectedProject(project);
              if (macro) setSelectedMacro(macro);
              if (process) setSelectedProcess(process);
              if (micro) setSelectedMicro(micro);
              
              if (docType && project && micro) {
                  const key = `${normalizeHeader(project)}|${normalizeHeader(micro)}`;
                  const allowed = reqMap[key] || [];
                  if (allowed.includes(docType)) {
                      setSelectedDocType(docType as DocType);
                  }
              }
          }
      } catch (e) {
          console.error("Error loading create document data", e);
      } finally {
          setInitializing(false);
      }
  };

  const getProjects = (): string[] => Object.keys(userHierarchy);
  const getMacros = (): string[] => (!selectedProject || !userHierarchy[selectedProject]) ? [] : Object.keys(userHierarchy[selectedProject]);
  const getProcesses = (): string[] => (!selectedProject || !selectedMacro || !userHierarchy[selectedProject]?.[selectedMacro]) ? [] : Object.keys(userHierarchy[selectedProject][selectedMacro]);
  const getMicros = (): string[] => {
      if (!selectedProject || !selectedMacro || !selectedProcess) return [];
      const processes = userHierarchy[selectedProject]?.[selectedMacro];
      if (!processes) return [];
      return processes[selectedProcess] || [];
  };

  const getAllowedDocTypes = (): DocType[] => {
      if (!selectedProject || !selectedMicro) return [];
      const key = `${normalizeHeader(selectedProject)}|${normalizeHeader(selectedMicro)}`;
      return requirementsMap[key] || [];
  };

  const getAssigneesForSelection = (): string[] => {
      if (!selectedProject || !selectedMacro || !selectedProcess || !selectedMicro) return [];
      const nodes = fullHierarchyCache[selectedProject]?.[selectedMacro]?.[selectedProcess] || [];
      const node = nodes.find(n => n.name === selectedMicro);
      return node?.assignees || [];
  };

  const handleProjectChange = (val: string) => {
      setSelectedProject(val); setSelectedMacro(''); setSelectedProcess(''); setSelectedMicro(''); resetFile();
  };

  const handleMacroChange = (val: string) => {
      setSelectedMacro(val); setSelectedProcess(''); setSelectedMicro(''); resetFile();
  };

  const handleProcessChange = (val: string) => {
      setSelectedProcess(val); setSelectedMicro(''); resetFile();
  };

  const handleMicroChange = (val: string) => {
      setSelectedMicro(val); setSelectedDocType(''); resetFile();
  }

  const handleTypeChange = (val: string) => {
      setSelectedDocType(val as DocType); resetFile();
  }
  
  const handleRequestTypeChange = (val: string) => {
      setRequestType(val as RequestType); resetFile();
  }

  const resetFile = () => {
      setFile(undefined); setFileError([]); setIsFileValid(false); setTitle(''); setDescription('');
      if (fileInputRef.current) { fileInputRef.current.value = ''; }
  };

  const mapParserStateToEnum = (parserState: string): DocState => {
      switch (parserState) {
          case 'Iniciado': return DocState.INITIATED;
          case 'En Proceso': return DocState.IN_PROCESS;
          case 'Revisión Interna': return DocState.INTERNAL_REVIEW;
          case 'Enviado a Referente': return DocState.SENT_TO_REFERENT;
          case 'Revisión Interna Referente': return DocState.REFERENT_REVIEW;
          case 'Enviado a Control': return DocState.SENT_TO_CONTROL;
          case 'Revisión Interna Control': return DocState.CONTROL_REVIEW;
          case 'Aprobado Final': return DocState.APPROVED;
          default: return DocState.INITIATED;
      }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          
          const result = parseDocumentFilename(
              selectedFile.name,
              selectedProject,
              selectedMicro,
              selectedDocType || undefined,
              requestType || undefined
          );
          
          if (result.valido) {
              setIsFileValid(true);
              setFileError([]);
              const cleanMicro = result.microproceso || selectedMicro;
              const cleanType = result.tipo || selectedDocType;
              setTitle(`${cleanMicro} - ${cleanType}`);
              setDescription(`Carga de archivo: ${cleanType} (${result.nomenclatura})`);
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
      const matrixAssignees = getAssigneesForSelection();
      const updatedDoc = await DocumentService.create(
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
              assignees: matrixAssignees
          },
          existingDoc?.id 
      );

      navigate(`/doc/${updatedDoc.id}`);
    } catch (error: any) {
      console.error(error);
      alert('Error al gestionar documento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const shouldShowOption = (type: RequestType): boolean => {
      if (!existingDoc || existingDoc.state === DocState.REJECTED) return true;
      const optionLevel = REQUEST_TYPE_LEVELS[type];
      return optionLevel >= existingDocLevel;
  };

  if (initializing) return <div className="p-8 text-center text-slate-500">Cargando permisos...</div>;

  const projects = getProjects();
  const macros = getMacros();
  const processes = getProcesses();
  const micros = getMicros();
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
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Nueva Solicitud / Carga</h1>
                <p className="text-slate-500">Gestione el versionamiento formal de sus informes institucionales.</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                {/* Step 1: Hierarchy Selection */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                    <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                        <Layers size={18} className="text-indigo-600" />
                        1. Definición del Proceso
                    </h2>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Proyecto</label>
                            <select value={selectedProject} onChange={(e) => handleProjectChange(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none">
                                <option value="">-- Seleccionar --</option>
                                {projects.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Macroproceso</label>
                            <select value={selectedMacro} onChange={(e) => handleMacroChange(e.target.value)} disabled={!selectedProject} className="w-full p-2.5 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none">
                                <option value="">-- Seleccionar --</option>
                                {macros.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Proceso</label>
                            <select value={selectedProcess} onChange={(e) => handleProcessChange(e.target.value)} disabled={!selectedMacro} className="w-full p-2.5 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none">
                                <option value="">-- Seleccionar --</option>
                                {processes.map((p) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Microproceso</label>
                            <select value={selectedMicro} onChange={(e) => handleMicroChange(e.target.value)} disabled={!selectedProcess} className="w-full p-2.5 border border-slate-300 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-indigo-900">
                                <option value="">-- Seleccionar --</option>
                                {micros.map((m) => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-xs font-semibold text-slate-500 uppercase">Tipo de Informe</label>
                                {selectedMicro && <span className="text-[10px] text-indigo-500 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">Filtrado por Matriz</span>}
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {docTypes.map(type => {
                                    const isAllowed = allowedDocTypes.includes(type as DocType);
                                    return (
                                        <label key={type} className={`relative border rounded-lg p-3 text-center transition-all ${!selectedMicro ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed' : isAllowed ? (selectedDocType === type ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105 cursor-pointer' : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400 cursor-pointer') : 'bg-slate-50 border-slate-200 text-slate-300 cursor-not-allowed opacity-60'}`}>
                                            <input type="radio" name="docType" value={type} checked={selectedDocType === type} onChange={(e) => handleTypeChange(e.target.value)} className="hidden" disabled={!selectedMicro || !isAllowed} />
                                            <span className="text-sm font-medium flex items-center justify-center gap-1">{!isAllowed && selectedMicro && <Lock size={12} />}{type}</span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>

                        <div className={`md:col-span-2 mt-4 p-4 rounded-lg border transition-all ${existingDoc ? 'bg-amber-50 border-amber-100' : 'bg-indigo-50 border-indigo-100'}`}>
                             <div className="flex justify-between items-center mb-2">
                                 <label className={`block text-xs font-bold uppercase flex items-center gap-2 ${existingDoc ? 'text-amber-900' : 'text-indigo-900'}`}>
                                    {existingDoc ? <History size={16} /> : <ListFilter size={16} />}
                                    Etapa / Versión de Carga
                                 </label>
                                 {existingDoc && <span className="text-[10px] bg-white border border-amber-200 px-2 py-1 rounded text-amber-700 font-bold uppercase tracking-tighter shadow-sm animate-fadeIn">Actualización Detectada</span>}
                             </div>
                             
                             <select value={requestType} onChange={(e) => handleRequestTypeChange(e.target.value)} disabled={!selectedDocType} className="w-full p-3 border border-slate-200 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500 outline-none font-medium text-slate-700 disabled:bg-slate-100">
                                <option value="">-- Seleccione qué etapa está subiendo --</option>
                                {shouldShowOption('INITIATED') && <option value="INITIATED">Iniciado (Versión 0.0)</option>}
                                {shouldShowOption('IN_PROCESS') && <option value="IN_PROCESS">En Proceso / Avance (Versión 0.n)</option>}
                                {shouldShowOption('INTERNAL') && <option value="INTERNAL">Revisión Interna (Versión v0.n)</option>}
                                {shouldShowOption('REFERENT') && <option value="REFERENT">Revisión Interna Referente (Versión v1.n.i)</option>}
                                {shouldShowOption('CONTROL') && <option value="CONTROL">Revisión Interna Control (Versión v1.n.iAR)</option>}
                            </select>
                            
                            <div className="flex items-start gap-2 mt-2">
                                <Info size={14} className={existingDoc ? 'text-amber-600' : 'text-indigo-600'} />
                                <p className={`text-[10px] leading-tight ${existingDoc ? 'text-amber-700 font-medium' : 'text-indigo-600'}`}>
                                    {existingDoc 
                                        ? `Aviso: Se actualizará el registro existente. La última versión cargada fue la ${existingDoc.version} en estado ${STATE_CONFIG[existingDoc.state].label.split('(')[0]}. Las versiones anteriores han sido consolidadas.`
                                        : "* El archivo que subas debe coincidir estrictamente con la etapa seleccionada."
                                    }
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Step 2: File Upload */}
                {selectedMicro && selectedDocType && requestType && (
                    <div className="animate-fadeIn">
                         <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Upload size={18} className="text-indigo-600" />
                            2. Carga de Archivo
                        </h2>
                        
                        <div className={`mb-4 p-3 rounded border flex items-start gap-2 ${existingDoc ? 'bg-amber-50 border-amber-100 text-amber-900' : 'bg-blue-50 border-blue-100 text-blue-800'}`}>
                            <Info size={18} className="mt-0.5 flex-shrink-0" />
                            <div className="text-sm">
                                <p className="font-semibold">Nomenclatura Priorizada:</p>
                                <p className="font-mono mt-1 text-xs md:text-sm font-bold">
                                    {selectedProject} - {selectedMicro} - {selectedDocType.replace(' ', '')} - [Versión]
                                </p>
                            </div>
                        </div>

                        <div className={`border-2 border-dashed rounded-xl p-8 transition-colors flex flex-col items-center justify-center text-center group relative
                            ${isFileValid ? 'border-green-300 bg-green-50' : fileError.length > 0 ? 'border-red-300 bg-red-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}>
                            <input type="file" ref={fileInputRef} onChange={handleFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                            {file ? (
                                isFileValid ? (
                                    <div className="text-green-700">
                                        <FileCheck size={48} className="mx-auto mb-3" />
                                        <p className="font-semibold text-lg">{file.name}</p>
                                        <p className="text-sm mt-1">Archivo válido y listo para consolidar</p>
                                    </div>
                                ) : (
                                    <div className="text-red-600">
                                        <FileX size={48} className="mx-auto mb-3" />
                                        <p className="font-semibold text-lg">{file.name}</p>
                                        <div className="mt-3 text-sm text-left bg-white/50 p-3 rounded border border-red-200 inline-block">
                                            <ul className="list-disc pl-4 space-y-1">{fileError.map((err, idx) => <li key={idx}>{err}</li>)}</ul>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="text-slate-500 group-hover:text-indigo-600">
                                    <Upload size={40} className="mx-auto mb-3" />
                                    <p className="font-medium">Click para seleccionar archivo</p>
                                    <p className="text-xs mt-2 text-slate-400">Se validará la versión contra la etapa seleccionada.</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3: Confirmation Form */}
                {isFileValid && selectedMicro && selectedDocType && requestType && (
                    <div className="animate-fadeIn border-t border-slate-100 pt-6">
                         <div className={`flex items-center gap-3 p-4 rounded-lg border mb-6 ${existingDoc ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'}`}>
                            <FileType size={20} className="text-slate-500 flex-shrink-0" />
                            <div className="text-sm text-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                                <div><span className="text-slate-400 text-xs uppercase block">Nuevo Estado</span>{detectedState.replace(/_/g, ' ')}</div>
                                <div><span className="text-slate-400 text-xs uppercase block">Nueva Versión</span>{detectedVersion}</div>
                                <div><span className="text-slate-400 text-xs uppercase block">Progreso</span>{detectedProgress}%</div>
                                <div><span className="text-slate-400 text-xs uppercase block">Modo Carga</span>{existingDoc ? 'ACTUALIZAR HISTORIAL' : 'NUEVO REGISTRO'}</div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Título del Documento</label>
                                <input type="text" value={title} readOnly className="w-full px-4 py-2 border border-slate-300 rounded-lg bg-slate-100 text-slate-600 focus:outline-none cursor-not-allowed" />
                            </div>
                             <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Observación de esta Carga</label>
                                <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none" required placeholder="Ej: Ajustes menores según reunión..." />
                            </div>
                        </div>

                        <div className="flex justify-end">
                            <button type="submit" disabled={loading} className={`flex items-center px-6 py-3 rounded-lg disabled:opacity-50 transition-colors shadow-md font-medium text-white ${existingDoc ? 'bg-amber-600 hover:bg-amber-700' : 'bg-green-600 hover:bg-green-700'}`}>
                                {loading ? 'Procesando...' : (
                                    <>
                                        {existingDoc ? <History size={18} className="mr-2" /> : <FilePlus size={18} className="mr-2" />}
                                        {existingDoc ? 'Actualizar y Consolidar Historial' : 'Cargar Nuevo Documento'}
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