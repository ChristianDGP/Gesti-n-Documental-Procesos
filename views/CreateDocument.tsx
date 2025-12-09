
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, HierarchyService } from '../services/mockBackend';
import { User, DocState, DocType } from '../types';
import { parseDocumentFilename } from '../utils/filenameParser';
import { Save, ArrowLeft, Upload, FileCheck, FileX, AlertTriangle, Info, Layers, FileType } from 'lucide-react';

interface Props {
  user: User;
}

const CreateDocument: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  // Hierarchy Selection State
  const [userHierarchy, setUserHierarchy] = useState<any>({});
  const [selectedProject, setSelectedProject] = useState('');
  const [selectedMacro, setSelectedMacro] = useState('');
  const [selectedProcess, setSelectedProcess] = useState('');
  const [selectedMicro, setSelectedMicro] = useState('');
  const [selectedDocType, setSelectedDocType] = useState<DocType | ''>('');

  // File Upload State
  const [file, setFile] = useState<File | undefined>(undefined);
  const [fileError, setFileError] = useState<string[]>([]);
  const [isFileValid, setIsFileValid] = useState(false);

  // Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Inferred Workflow State
  const [detectedState, setDetectedState] = useState<DocState>(DocState.INITIATED);
  const [detectedVersion, setDetectedVersion] = useState('0.0');
  const [detectedProgress, setDetectedProgress] = useState(10);

  useEffect(() => {
      loadHierarchy();
  }, []);

  const loadHierarchy = async () => {
      const hierarchy = await HierarchyService.getUserHierarchy(user.id);
      setUserHierarchy(hierarchy);
      setInitializing(false);
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

  const resetFile = () => {
      setFile(undefined);
      setFileError([]);
      setIsFileValid(false);
      setTitle('');
      setDescription('');
  };

  const mapParserStateToEnum = (parserState: string): DocState => {
      switch (parserState) {
          case 'Iniciado': return DocState.INITIATED;
          case 'En proceso': return DocState.IN_PROCESS;
          case 'En revisión interna': return DocState.INTERNAL_REVIEW;
          case 'Enviado a Referente': return DocState.SENT_TO_REFERENT;
          case 'Revisión con referentes': return DocState.REFERENT_REVIEW;
          case 'Enviado a Control de Gestión': return DocState.SENT_TO_CONTROL;
          case 'Revisión con Control de Gestión': return DocState.CONTROL_REVIEW;
          case 'Aprobado Control Gestión': return DocState.APPROVED;
          default: return DocState.INITIATED;
      }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
          const selectedFile = e.target.files[0];
          setFile(selectedFile);
          
          // Validate with context!
          const result = parseDocumentFilename(
              selectedFile.name,
              selectedProject,
              selectedMicro,
              selectedDocType || undefined
          );
          
          if (result.valido) {
              setIsFileValid(true);
              setFileError([]);
              
              // Only auto-fill title/description, rely on Selectors for hierarchy
              const cleanMicro = result.microproceso || selectedMicro;
              const cleanType = result.tipo || selectedDocType;
              setTitle(`${cleanMicro} - ${cleanType}`);
              setDescription(`Informe ${cleanType} para microproceso ${cleanMicro}`);
              
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
    if (!title || !description || !file || !isFileValid || !selectedMicro || !selectedDocType) return;

    setLoading(true);
    try {
      const doc = await DocumentService.create(
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
      navigate(`/doc/${doc.id}`);
    } catch (error: any) {
      console.error(error);
      alert('Error al crear documento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (initializing) return <div className="p-8 text-center text-slate-500">Cargando permisos...</div>;

  // Helper to extract keys for dropdowns
  const projects = Object.keys(userHierarchy);
  const macros = selectedProject && userHierarchy[selectedProject] ? Object.keys(userHierarchy[selectedProject]) : [];
  const processes = selectedMacro && userHierarchy[selectedProject] && userHierarchy[selectedProject][selectedMacro] 
    ? Object.keys(userHierarchy[selectedProject][selectedMacro]) : [];
  const micros: string[] = selectedProcess && userHierarchy[selectedProject] && userHierarchy[selectedProject][selectedMacro] && userHierarchy[selectedProject][selectedMacro][selectedProcess]
    ? (userHierarchy[selectedProject][selectedMacro][selectedProcess] || []) : [];

  const docTypes = ['AS IS', 'FCE', 'PM', 'TO BE'];

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
                   Completa la ficha técnica y carga el archivo validado.
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
                                {projects.map(p => <option key={p} value={p}>{p}</option>)}
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
                                {macros.map(m => <option key={m} value={m}>{m}</option>)}
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
                                {processes.map(p => <option key={p} value={p}>{p}</option>)}
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
                                {micros.map((m: string) => <option key={m} value={m}>{m}</option>)}
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
                                            disabled={!selectedMicro}
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
                {selectedMicro && selectedDocType && (
                    <div className="animate-fadeIn">
                         <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-4 flex items-center gap-2">
                            <Upload size={18} className="text-indigo-600" />
                            2. Carga de Archivo
                        </h2>
                        
                        <div className="mb-4 p-3 bg-blue-50 text-blue-800 text-sm rounded border border-blue-100 flex items-start gap-2">
                            <Info size={18} className="mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="font-semibold">Nomenclatura Requerida:</p>
                                <p className="font-mono mt-1 text-xs md:text-sm">
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
                                        El nombre del archivo debe coincidir con la selección
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
                                className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md font-medium"
                            >
                                {loading ? 'Creando...' : (
                                    <>
                                        <Save size={18} className="mr-2" />
                                        Crear Solicitud
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
