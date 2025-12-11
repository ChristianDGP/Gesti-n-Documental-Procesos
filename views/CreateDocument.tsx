
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, HierarchyService, UserService } from '../services/firebaseBackend';
import { User, DocState, DocType, UserHierarchy, UserRole } from '../types';
import { parseDocumentFilename } from '../utils/filenameParser';
import { Save, ArrowLeft, Upload, FileCheck, FileX, AlertTriangle, Info, Layers, FileType, Send, FilePlus } from 'lucide-react';

interface Props {
  user: User;
}

// Updated Request Types to include early stages
type RequestType = 'INITIATED' | 'IN_PROCESS' | 'INTERNAL' | 'REFERENT' | 'CONTROL';

const CreateDocument: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Hierarchy Selection State with Strict Typing
  const [userHierarchy, setUserHierarchy] = useState<UserHierarchy>({});
  const [selectedProject, setSelectedProject] = useState<string>('');
  const [selectedMacro, setSelectedMacro] = useState<string>('');
  const [selectedProcess, setSelectedProcess] = useState<string>('');
  const [selectedMicro, setSelectedMicro] = useState<string>('');
  const [selectedDocType, setSelectedDocType] = useState<DocType | ''>('');
  const [requestType, setRequestType] = useState<RequestType | ''>('');
  const [coordinatorEmail, setCoordinatorEmail] = useState<string>('');

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

  useEffect(() => {
      loadData();
  }, []);

  const loadData = async () => {
      // 1. Cargar Jerarquía
      // Si es Admin, cargamos la jerarquía completa transformada a formato simple
      if (user.role === UserRole.ADMIN) {
           const full = await HierarchyService.getFullHierarchy();
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
          // Si es Analista, solo lo asignado
          const hierarchy = await HierarchyService.getUserHierarchy(user.id);
          setUserHierarchy(hierarchy);
      }

      // 2. Cargar Coordinador para notificaciones
      const users = await UserService.getAll();
      const coord = users.find(u => u.role === UserRole.COORDINATOR);
      if (coord) setCoordinatorEmail(coord.email);

      setInitializing(false);
  };

  // Helper functions for safe extraction of hierarchy arrays
  // These explicitly return string[] to prevent implicit any errors in .map()
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
      // Critical: Clear the input value so selecting the same file again triggers onChange
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

  const getVersionHint = () => {
      if (requestType === 'INITIATED') return '[0.0]';
      if (requestType === 'IN_PROCESS') return '[0.n] (sin "v")';
      if (requestType === 'INTERNAL') return '[v0.n] donde n es IMPAR';
      if (requestType === 'REFERENT') return '[v1.n.i] donde i es IMPAR';
      if (requestType === 'CONTROL') return '[v1.n.iAR] donde i es IMPAR';
      return '[Versión]';
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          
          // Validate with context AND request type!
          const result = parseDocumentFilename(
              selectedFile.name,
              selectedProject,
              selectedMicro,
              selectedDocType || undefined,
              requestType as RequestType || undefined
          );
          
          if (result.valido) {
              setIsFileValid(true);
              setFileError([]);
              
              // Only auto-fill title/description, rely on Selectors for hierarchy
              const cleanMicro = result.microproceso || selectedMicro;
              const cleanType = result.tipo || selectedDocType;
              setTitle(`${cleanMicro} - ${cleanType}`);
              
              // Auto-description based on Type
              let desc = "Documento cargado";
              if (requestType === 'INITIATED') desc = "Carga Inicial (Inicio de Gestión)";
              else if (requestType === 'IN_PROCESS') desc = "Avance de trabajo (En Proceso)";
              else if (requestType === 'INTERNAL') desc = "Solicitud de Revisión Interna";
              else if (requestType === 'REFERENT') desc = "Solicitud de Revisión Referente";
              else if (requestType === 'CONTROL') desc = "Control de Gestión";
              
              setDescription(desc);
              
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

  // --- LOGIC FOR NOTIFICATION ---
  const sendCoordinatorNotification = () => {
      if (!coordinatorEmail || !file) return;
      
      const subject = encodeURIComponent(`Solicitud de Aprobación SGD: ${selectedProject} - ${selectedMicro}`);
      
      let stageLabel = "";
      if (requestType === 'INTERNAL') stageLabel = "Revisión Interna";
      if (requestType === 'REFERENT') stageLabel = "Revisión con Referente";
      if (requestType === 'CONTROL') stageLabel = "Control de Gestión";

      const body = encodeURIComponent(
`Estimado Coordinador,

Se ha generado una nueva solicitud de revisión en el sistema.

Documento: ${title}
Tipo de Solicitud: ${stageLabel}
Versión: ${detectedVersion}
Archivo: ${file.name}

Atentamente,
${user.name}
`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${coordinatorEmail}&su=${subject}&body=${body}`, '_blank');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !file || !isFileValid || !selectedMicro || !selectedDocType) return;

    setLoading(true);
    
    // Create a promise that rejects after 15 seconds
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("Tiempo de espera agotado. Verifique su conexión.")), 15000);
    });

    try {
      const createPromise = DocumentService.create(
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
              docType: selectedDocType
          }
      );

      // Race between the creation logic and the timeout
      const doc = await Promise.race([createPromise, timeoutPromise]) as any;
      
      // NOTIFICATION LOGIC: Only for Approval Flows
      if (['INTERNAL', 'REFERENT', 'CONTROL'].includes(requestType as string)) {
          sendCoordinatorNotification();
      }

      navigate(`/doc/${doc.id}`);
    } catch (error: any) {
      console.error(error);
      alert('Error al crear documento: ' + error.message);
    } finally {
      // Always reset loading state so the user can try again
      setLoading(false);
    }
  };

  if (initializing) return <div className="p-8 text-center text-slate-500">Cargando permisos...</div>;

  const projects = getProjects() as string[];
  const macros = getMacros() as string[];
  const processes = getProcesses() as string[];
  const micros = getMicros() as string[];
  const docTypes = ['AS IS', 'FCE', 'PM', 'TO BE'];

  const isApprovalFlow = ['INTERNAL', 'REFERENT', 'CONTROL'].includes(requestType as string);

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
                   Completa la ficha técnica para iniciar una revisión formal.
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

                        {/* Request Type Selector (New) */}
                        <div className="md:col-span-2">
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Tipo de Solicitud / Revisión</label>
                            <select 
                                value={requestType}
                                onChange={(e) => handleRequestTypeChange(e.target.value)}
                                disabled={!selectedMicro}
                                className="w-full p-2.5 border border-indigo-200 bg-indigo-50/50 text-indigo-900 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
                            >
                                <option value="">-- Seleccionar Tipo de Solicitud --</option>
                                <option value="INITIATED">Iniciado (Carga Inicial 0.0)</option>
                                <option value="IN_PROCESS">En Proceso (Avance 0.n sin revisión)</option>
                                <option value="INTERNAL">Revisión Interna (Inicio de Flujo v0.n)</option>
                                <option value="REFERENT">Revisión con Referente (v1.n)</option>
                                <option value="CONTROL">Control de Gestión (v1.nAR)</option>
                            </select>
                        </div>

                        {/* Report Type */}
                        <div className="md:col-span-2 mt-2 border-t border-slate-200 pt-4">
                            <label className="block text-xs font-semibold text-slate-500 mb-1 uppercase">Tipo de Informe</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                {docTypes.map(type => (
                                    <label key={type} className={`
                                        cursor-pointer border rounded-lg p-3 text-center transition-all
                                        ${selectedDocType === type 
                                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-105' 
                                            : 'bg-white border-slate-300 text-slate-600 hover:border-indigo-400'}
                                    `}>
                                        <input 
                                            type="radio" 
                                            name="docType" 
                                            value={type} 
                                            checked={selectedDocType === type}
                                            onChange={(e) => handleTypeChange(e.target.value)}
                                            className="hidden"
                                            disabled={!requestType}
                                        />
                                        <span className="text-sm font-medium">{type}</span>
                                    </label>
                                ))}
                            </div>
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
                                    {selectedProject} - {selectedMicro} - {selectedDocType.replace(' ', '')} - {getVersionHint()}
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
                                        <p className="text-sm mt-1">Validación exitosa</p>
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
                                        El nombre debe coincidir con la nomenclatura para {requestType}
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Step 3: Confirmation Form */}
                {isFileValid && selectedMicro && selectedDocType && (
                    <div className="animate-fadeIn border-t border-slate-100 pt-6">
                         <div className="flex items-center gap-3 bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6">
                            <FileType size={20} className="text-slate-500 flex-shrink-0" />
                            <div className="text-sm text-slate-700 grid grid-cols-2 md:grid-cols-4 gap-4 w-full">
                                <div><span className="text-slate-400 text-xs uppercase block">Estado</span>{mapParserStateToEnum(parseDocumentFilename(file!.name).estado || '').replace(/_/g, ' ')}</div>
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
                                className={`flex items-center px-6 py-3 text-white rounded-lg disabled:opacity-50 transition-colors shadow-md font-medium
                                    ${isApprovalFlow ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-green-600 hover:bg-green-700'}`}
                            >
                                {loading ? 'Enviando...' : isApprovalFlow ? (
                                    <>
                                        <Send size={18} className="mr-2" />
                                        Crear Solicitud de Aprobación
                                    </>
                                ) : (
                                    <>
                                        <FilePlus size={18} className="mr-2" />
                                        Cargar Documento / Guardar Avance
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
