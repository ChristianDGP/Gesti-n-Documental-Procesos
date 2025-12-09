import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService } from '../services/mockBackend';
import { User, DocState } from '../types';
import { parseDocumentFilename } from '../utils/filenameParser';
import { Save, ArrowLeft, Upload, FileCheck, FileX, AlertTriangle, Info } from 'lucide-react';

interface Props {
  user: User;
}

const CreateDocument: React.FC<Props> = ({ user }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // State for the uploaded file and its validation
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string[]>([]);
  const [isFileValid, setIsFileValid] = useState(false);

  // Form State (Auto-filled but editable)
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  
  // Workflow State (Inferred)
  const [detectedState, setDetectedState] = useState<DocState>(DocState.INITIATED);
  const [detectedVersion, setDetectedVersion] = useState('0.0');
  const [detectedProgress, setDetectedProgress] = useState(10);
  const [detectedProject, setDetectedProject] = useState('');

  // Helper to map parser string state to Enum
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
          
          // Execute Parse Logic
          const result = parseDocumentFilename(selectedFile.name);
          
          if (result.valido) {
              setIsFileValid(true);
              setFileError([]);
              
              // Auto-fill form data
              setTitle(result.descripcion || '');
              
              // If we have an explanation from the parser, use it as default description
              // Otherwise, we keep it blank for the user to fill
              setDescription(result.explicacion ? `${result.explicacion} (Proyecto: ${result.proyecto})` : '');
              
              // Set Internal State
              if (result.estado) setDetectedState(mapParserStateToEnum(result.estado));
              if (result.nomenclatura) setDetectedVersion(result.nomenclatura);
              if (result.porcentaje) setDetectedProgress(result.porcentaje);
              if (result.proyecto) setDetectedProject(result.proyecto);

          } else {
              setIsFileValid(false);
              setFileError(result.errores);
              // Reset inferred fields if invalid
              setTitle('');
              setDescription('');
          }
      }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description || !file || !isFileValid) return;

    setLoading(true);
    try {
      // Pass the inferred state and the file to creation service
      const doc = await DocumentService.create(
          title, 
          description, 
          user,
          detectedState,
          detectedVersion,
          detectedProgress,
          file
      );
      navigate(`/doc/${doc.id}`);
    } catch (error: any) {
      console.error(error);
      alert('Error al crear documento: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-slate-800 mb-6 text-sm">
            <ArrowLeft size={16} className="mr-1" />
            Volver
        </button>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 md:p-8">
            <div className="mb-8">
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Nueva Solicitud</h1>
                <p className="text-slate-500">
                    Sube tu archivo institucional para comenzar. El sistema detectará automáticamente la información del flujo.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-8">
                
                {/* 1. File Upload Area */}
                <div>
                    <label className="block text-sm font-medium text-slate-700 mb-2">1. Cargar Documento (Requerido)</label>
                    
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
                                    <p className="text-sm mt-1">Archivo válido y procesado correctamente</p>
                                </div>
                            ) : (
                                <div className="text-red-600">
                                    <FileX size={48} className="mx-auto mb-3" />
                                    <p className="font-semibold text-lg break-all">{file.name}</p>
                                    <div className="mt-3 text-sm text-left bg-white/50 p-3 rounded border border-red-200 inline-block">
                                        <p className="font-bold mb-1">Errores detectados:</p>
                                        <ul className="list-disc pl-4 space-y-1">
                                            {fileError.map((err, idx) => (
                                                <li key={idx}>{err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                    <p className="text-xs mt-3">Click para intentar con otro archivo</p>
                                </div>
                            )
                        ) : (
                            <div className="text-slate-500 group-hover:text-indigo-600">
                                <Upload size={40} className="mx-auto mb-3" />
                                <p className="font-medium">Arrastra tu archivo aquí o haz click para buscar</p>
                                <p className="text-xs mt-2 text-slate-400">Formato: PROYECTO - Descripción Nomenclatura (Max 55 chars)</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* 2. Detected Metadata & Form Fields (Only visible if file is valid) */}
                {isFileValid && (
                    <div className="animate-fadeIn space-y-6 border-t border-slate-100 pt-6">
                        <div className="flex items-center gap-3 bg-blue-50 p-4 rounded-lg border border-blue-100">
                            <Info size={20} className="text-blue-600 flex-shrink-0" />
                            <div className="text-sm text-blue-800">
                                <p className="font-semibold">Información detectada:</p>
                                <ul className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                                    <li><span className="text-blue-500 text-xs uppercase">Proyecto</span><br/>{detectedProject}</li>
                                    <li><span className="text-blue-500 text-xs uppercase">Versión</span><br/>{detectedVersion}</li>
                                    <li><span className="text-blue-500 text-xs uppercase">Estado</span><br/>{mapParserStateToEnum(parseDocumentFilename(file!.name).estado || '').replace(/_/g, ' ')}</li>
                                    <li><span className="text-blue-500 text-xs uppercase">Progreso</span><br/>{detectedProgress}%</li>
                                </ul>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Título del Documento</label>
                            <input 
                                type="text" 
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all bg-slate-50"
                                required
                            />
                            <p className="text-xs text-slate-400 mt-1">Extraído automáticamente del nombre del archivo.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Descripción / Observación</label>
                            <textarea 
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe el contenido..."
                                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all min-h-[100px]"
                                required
                            />
                        </div>

                        <div className="pt-4 flex justify-end">
                            <button 
                                type="submit" 
                                disabled={loading}
                                className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-md font-medium"
                            >
                                {loading ? 'Procesando...' : (
                                    <>
                                        <Save size={18} className="mr-2" />
                                        Confirmar y Crear Solicitud
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