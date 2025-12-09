
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocumentService, HistoryService, UserService } from '../services/mockBackend';
import { Document, User, DocHistory, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename } from '../utils/filenameParser';
import { ArrowLeft, Upload, FileText, CheckCircle, XCircle, ChevronRight, Activity, Paperclip, AlertOctagon, Info, Layers, Users } from 'lucide-react';

interface Props {
  user: User;
}

const DocumentDetail: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(null);
  const [history, setHistory] = useState<DocHistory[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  const loadData = async (docId: string) => {
    setLoading(true);
    const [d, h] = await Promise.all([
      DocumentService.getById(docId),
      HistoryService.getHistory(docId)
    ]);
    setDoc(d);
    setHistory(h);

    if (d && d.assignees && d.assignees.length > 0) {
        const allUsers = await UserService.getAll();
        const names = d.assignees
            .map(aid => allUsers.find(u => u.id === aid)?.name)
            .filter(n => n) as string[];
        setAssigneeNames(names);
    }

    setLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !doc) return;
    const file = e.target.files[0];

    // --- INTEGRACIÓN: VALIDACIÓN DE NOMBRE DE ARCHIVO ---
    // Usamos el parser con los datos del documento actual para validar consistencia
    const analisis = parseDocumentFilename(
        file.name,
        doc.project,
        doc.microprocess,
        doc.docType // Si el documento ya tiene tipo asignado, lo validamos
    );

    if (!analisis.valido) {
      // Mostrar errores
      alert(`Error en nomenclatura de archivo:\n\n${analisis.errores.join('\n')}\n\nFormato requerido: PROYECTO - Microproceso - TIPO - Versión`);
      // Limpiar input
      e.target.value = '';
      return;
    }

    // Opcional: Confirmar carga con datos detectados
    const confirmar = window.confirm(
      `Archivo Validado Correctamente:\n` +
      `Proyecto: ${analisis.proyecto || 'Desconocido'}\n` +
      `Microproceso: ${analisis.microproceso || 'Desconocido'}\n` +
      `Tipo: ${analisis.tipo || 'Desconocido'}\n` +
      `Versión: ${analisis.nomenclatura || 'Desconocida'}\n\n` +
      `¿Desea subir este archivo?`
    );

    if (!confirmar) {
        e.target.value = '';
        return;
    }
    // ----------------------------------------------------
    
    try {
      await DocumentService.uploadFile(doc.id, file, user);
      await loadData(doc.id); // Reload to show file
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleAction = async (action: 'ADVANCE' | 'APPROVE' | 'REJECT') => {
    if (!doc) return;
    // Basic validation: Require comment for rejections
    if (action === 'REJECT' && !comment) {
        alert('Debes agregar una observación para rechazar.');
        return;
    }

    setActionLoading(true);
    try {
        await DocumentService.transitionState(doc.id, user, action, comment || 'Cambio de estado');
        setComment('');
        await loadData(doc.id);
    } catch (err: any) {
        alert('Error: ' + err.message);
    } finally {
        setActionLoading(false);
    }
  };

  if (loading || !doc) return <div className="p-8 text-center text-slate-500">Cargando documento...</div>;

  const config = STATE_CONFIG[doc.state];

  // Permission Logic for Actions
  // Check if current user is one of the assignees or the author
  const isAssignee = doc.assignees && doc.assignees.includes(user.id);
  const isAuthor = doc.authorId === user.id;

  const canUpload = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && (doc.state === DocState.INITIATED || doc.state === DocState.IN_PROCESS);
  
  const canAdvance = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && (doc.state === DocState.INITIATED || doc.state === DocState.IN_PROCESS);
  
  const canApprove = (
      (user.role === UserRole.ANALYST && (isAssignee || isAuthor) && doc.state === DocState.IN_PROCESS) || // Send to Internal Review
      (user.role === UserRole.COORDINATOR && doc.state === DocState.INTERNAL_REVIEW) ||
      (user.role === UserRole.COORDINATOR && doc.state === DocState.SENT_TO_REFERENT) ||
      (user.role === UserRole.ADMIN && doc.state === DocState.SENT_TO_CONTROL)
  );

  const canReject = (
      (user.role === UserRole.COORDINATOR && (doc.state === DocState.INTERNAL_REVIEW || doc.state === DocState.SENT_TO_REFERENT)) ||
      (user.role === UserRole.ADMIN && doc.state === DocState.SENT_TO_CONTROL)
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <button onClick={() => navigate('/')} className="flex items-center text-slate-500 hover:text-slate-800 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Volver al Dashboard
      </button>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    {doc.project && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-white">
                            {doc.project}
                        </span>
                    )}
                    {doc.docType && (
                         <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 border border-indigo-200">
                            {doc.docType}
                        </span>
                    )}
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
                <p className="text-slate-500 mt-1">{doc.description}</p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center self-start ${config.color}`}>
                <Activity size={16} className="mr-2" />
                {config.label}
            </div>
        </div>

        {/* Process Hierarchy Metadata */}
        {doc.macroprocess && (
            <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="flex items-start gap-2">
                    <Layers size={18} className="text-slate-400 mt-1" />
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-bold">Macroproceso</p>
                        <p className="text-sm text-slate-700">{doc.macroprocess}</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-2">
                    <Layers size={18} className="text-slate-400 mt-1" />
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-bold">Proceso</p>
                        <p className="text-sm text-slate-700">{doc.process}</p>
                    </div>
                 </div>
                 <div className="flex items-start gap-2 md:col-span-2">
                    <Layers size={18} className="text-slate-400 mt-1" />
                    <div>
                        <p className="text-xs text-slate-400 uppercase font-bold">Microproceso</p>
                        <p className="text-sm text-slate-700 font-medium">{doc.microprocess}</p>
                    </div>
                 </div>
            </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-slate-100 pt-4">
            <div>
                <p className="text-slate-500">Analistas Asignados</p>
                {assigneeNames.length > 0 ? (
                    <div className="flex flex-col">
                        {assigneeNames.map((name, i) => (
                             <p key={i} className="font-medium text-slate-800 flex items-center gap-1">
                                <Users size={12} className="text-slate-400" /> {name}
                             </p>
                        ))}
                    </div>
                ) : (
                    <p className="font-medium text-slate-800">{doc.authorName}</p>
                )}
            </div>
            <div>
                <p className="text-slate-500">Versión</p>
                <p className="font-mono text-slate-800">{doc.version}</p>
            </div>
            <div>
                <p className="text-slate-500">Progreso</p>
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-200 rounded-full h-2 w-20">
                        <div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${doc.progress}%` }}></div>
                    </div>
                    <span className="font-medium">{doc.progress}%</span>
                </div>
            </div>
            <div>
                <p className="text-slate-500">Última actualización</p>
                <p className="text-slate-800">{new Date(doc.updatedAt).toLocaleDateString()}</p>
            </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* Left Column: Actions & Files */}
        <div className="md:col-span-2 space-y-6">
            {/* Files Section */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center">
                    <Paperclip size={18} className="mr-2 text-indigo-500" />
                    Archivos Adjuntos
                </h3>
                
                {doc.files.length === 0 && (
                    <p className="text-sm text-slate-400 italic mb-4">No hay archivos adjuntos.</p>
                )}

                <ul className="space-y-2 mb-4">
                    {doc.files.map(file => (
                        <li key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm border border-slate-100">
                            <div className="flex items-center overflow-hidden">
                                <FileText size={16} className="text-slate-400 mr-3 flex-shrink-0" />
                                <span className="truncate font-medium text-slate-700">{file.name}</span>
                            </div>
                            <span className="text-xs text-slate-400 ml-2 whitespace-nowrap">
                                {(file.size / 1024).toFixed(1)} KB
                            </span>
                        </li>
                    ))}
                </ul>

                {canUpload && (
                    <div className="space-y-3">
                        <label className="block p-4 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors cursor-pointer group">
                            <span className="sr-only">Elegir archivo</span>
                            <input 
                                type="file" 
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <div className="flex flex-col items-center text-center text-indigo-600 group-hover:text-indigo-700">
                                <Upload size={24} className="mb-2" />
                                <span className="text-sm font-medium">Click para subir archivo</span>
                                <span className="text-xs text-slate-400 mt-1">Nomenclatura requerida (Max 55 caracteres)</span>
                            </div>
                        </label>
                        
                        {/* Info Tooltip about Nomenclature */}
                        <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 flex gap-2">
                             <Info size={16} className="text-blue-500 flex-shrink-0 mt-0.5" />
                             <div className="text-xs text-blue-800">
                                 <p className="font-semibold mb-1">Formato obligatorio:</p>
                                 <code>PROY - Microproceso - TIPO - Versión</code>
                                 <p className="mt-1 text-blue-600">Ej: <b>HPC - Gestión de Proyectos - ASIS - v1.0.docx</b></p>
                             </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Workflow Actions */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                 <h3 className="font-semibold text-slate-800 mb-4">Acciones de Flujo</h3>
                 
                 <textarea 
                    className="w-full p-3 border border-slate-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-indigo-500 outline-none"
                    rows={3}
                    placeholder="Escribe una observación, comentario o razón de rechazo..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                 />

                 <div className="flex flex-wrap gap-3">
                    {canAdvance && (
                        <button 
                            onClick={() => handleAction('ADVANCE')}
                            disabled={actionLoading}
                            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
                        >
                            <ChevronRight size={16} className="mr-2" />
                            Avanzar Versión (0.n)
                        </button>
                    )}

                    {canApprove && (
                        <button 
                            onClick={() => handleAction('APPROVE')}
                            disabled={actionLoading}
                            className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium transition-colors"
                        >
                            <CheckCircle size={16} className="mr-2" />
                            {user.role === UserRole.ANALYST ? 'Enviar a Revisión' : 'Aprobar y Avanzar'}
                        </button>
                    )}

                    {canReject && (
                        <button 
                            onClick={() => handleAction('REJECT')}
                            disabled={actionLoading}
                            className="flex items-center px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-medium transition-colors border border-red-200"
                        >
                            <XCircle size={16} className="mr-2" />
                            Rechazar / Observar
                        </button>
                    )}

                    {!canAdvance && !canApprove && !canReject && doc.state !== DocState.APPROVED && (
                        <p className="text-sm text-slate-500 italic">No hay acciones disponibles para tu rol en este estado.</p>
                    )}
                    
                    {doc.state === DocState.APPROVED && (
                        <p className="text-sm text-green-600 font-medium flex items-center">
                            <CheckCircle size={16} className="mr-2" />
                            Documento finalizado exitosamente.
                        </p>
                    )}
                 </div>
            </div>
        </div>

        {/* Right Column: History */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit max-h-[600px] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-4 sticky top-0 bg-white pb-2 border-b border-slate-100">Historial</h3>
            <div className="relative pl-4 border-l-2 border-slate-100 space-y-6">
                {history.map((h, i) => (
                    <div key={h.id} className="relative">
                        <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-slate-300 border-2 border-white"></div>
                        <div className="text-xs text-slate-400 mb-0.5">{new Date(h.timestamp).toLocaleString()}</div>
                        <p className="text-sm font-medium text-slate-800">{h.action} <span className="text-slate-400 font-normal">por {h.userName}</span></p>
                        {h.comment && (
                            <div className="mt-1 p-2 bg-slate-50 rounded text-xs text-slate-600 italic border border-slate-100">
                                "{h.comment}"
                            </div>
                        )}
                        <div className="mt-1 flex items-center gap-2 text-[10px] uppercase font-bold tracking-wider text-slate-400">
                            <span>{STATE_CONFIG[h.previousState]?.label.split('(')[0]}</span>
                            <ChevronRight size={10} />
                            <span className="text-indigo-600">{STATE_CONFIG[h.newState]?.label.split('(')[0]}</span>
                        </div>
                    </div>
                ))}
            </div>
        </div>

      </div>
    </div>
  );
};

export default DocumentDetail;
