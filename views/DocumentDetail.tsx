
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocumentService, HistoryService, UserService } from '../services/firebaseBackend';
import { Document, User, DocHistory, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename } from '../utils/filenameParser';
import { ArrowLeft, Upload, FileText, CheckCircle, XCircle, Activity, Paperclip, Mail, MessageSquare, Send, AlertTriangle, FileCheck, FileX, Info, ListFilter, Trash2, Lock, Save, Eye } from 'lucide-react';

interface Props {
  user: User;
}

type ApprovalContext = 'INTERNAL' | 'REFERENT' | 'CONTROL';

const DocumentDetail: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [doc, setDoc] = useState<Document | null>(null);
  const [history, setHistory] = useState<DocHistory[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<string[]>([]);
  const [coordinatorEmail, setCoordinatorEmail] = useState<string>('');
  const [authorEmail, setAuthorEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // File Validation State for Analyst
  const [validationFile, setValidationFile] = useState<File | null>(null);
  const [validationError, setValidationError] = useState<string[]>([]);
  const [isValidated, setIsValidated] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Response Modal State
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [approvalType, setApprovalType] = useState<ApprovalContext | ''>(''); 
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [manualVersion, setManualVersion] = useState('');

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  const loadData = async (docId: string) => {
    setLoading(true);
    const [d, h, allUsers] = await Promise.all([
      DocumentService.getById(docId),
      HistoryService.getHistory(docId),
      UserService.getAll()
    ]);
    setDoc(d);
    setHistory(h);

    const coordinator = allUsers.find(u => u.role === UserRole.COORDINATOR);
    if (coordinator) setCoordinatorEmail(coordinator.email);

    if (d) {
        const author = allUsers.find(u => u.id === d.authorId);
        if (author) setAuthorEmail(author.email);
        setManualVersion(d.version);
    }

    if (d && d.assignees && d.assignees.length > 0) {
        const names = d.assignees
            .map(aid => allUsers.find(u => u.id === aid)?.name)
            .filter(n => n) as string[];
        setAssigneeNames(names);
    }
    setLoading(false);
  };

  // --- VALIDATION LOGIC FOR ANALYST ---
  const handleFileValidation = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && doc) {
          const file = e.target.files[0];
          setValidationFile(file);
          
          // Determine expected stage for validation
          let expectedStage: 'INTERNAL' | 'REFERENT' | 'CONTROL' | 'IN_PROCESS' = 'INTERNAL';
          if (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW) expectedStage = 'REFERENT';
          else if (doc.state === DocState.SENT_TO_CONTROL || doc.state === DocState.CONTROL_REVIEW) expectedStage = 'CONTROL';
          else if (doc.state === DocState.IN_PROCESS) expectedStage = 'IN_PROCESS';

          const result = parseDocumentFilename(
              file.name,
              doc.project,
              doc.microprocess,
              doc.docType,
              expectedStage
          );

          if (result.valido) {
              setIsValidated(true);
              setValidationError([]);
          } else {
              setIsValidated(false);
              setValidationError(result.errores);
          }
      }
  };

  const handleDeleteClick = () => {
      setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
      if (!doc) return;
      try {
          setShowDeleteModal(false);
          setLoading(true); 
          await DocumentService.delete(doc.id);
          navigate('/', { replace: true });
      } catch (e: any) {
          console.error("Error eliminando documento:", e);
          alert('Error al eliminar: ' + e.message);
          setLoading(false);
      }
  };

  const handleActionClick = async (action: 'ADVANCE' | 'APPROVE' | 'REJECT' | 'REQUEST_APPROVAL' | 'COMMENT') => {
      if (!doc) return;

      if (action === 'COMMENT') {
          if (!comment.trim()) {
              alert('Por favor escribe una observación antes de guardar.');
              return;
          }
          executeTransition('COMMENT', null, null);
          return;
      }

      if (action === 'REQUEST_APPROVAL') {
          if (!isValidated || !validationFile) {
              alert("Debe seleccionar y validar un archivo correcto antes de solicitar aprobación.");
              return;
          }

          const msg = `Validación Exitosa: ${validationFile.name}
          
¿Confirmar envío de solicitud?
Se registrará el evento en el historial.`;
          
          if (!window.confirm(msg)) return;
          
          // Trigger transition without uploading the file (as requested to save space), 
          // but logging the action.
          await executeTransition('REQUEST_APPROVAL', null, null);
          
          // Reset validation state
          setValidationFile(null);
          setIsValidated(false);
          return;
      }

      if (action === 'ADVANCE') {
          executeTransition('ADVANCE', null, null);
          return;
      }

      if (action === 'APPROVE' || action === 'REJECT') {
          if (action === 'REJECT' && !comment) {
              alert('Por favor agrega un comentario/observación antes de rechazar.');
              return;
          }
          setPendingAction(action);
          setManualVersion(doc.version);

          let autoType: ApprovalContext | '' = '';
          if (doc.state === DocState.INTERNAL_REVIEW) autoType = 'INTERNAL';
          else if (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW) autoType = 'REFERENT';
          else if (doc.state === DocState.SENT_TO_CONTROL || doc.state === DocState.CONTROL_REVIEW) autoType = 'CONTROL';
          
          setApprovalType(autoType);
          setShowResponseModal(true);
      }
  };

  const handleSubmitResponse = async () => {
      if (!doc || !pendingAction || !approvalType) return;
      
      const actionText = pendingAction === 'APPROVE' ? 'APROBAR' : 'RECHAZAR';
      const msg = `¿Confirma ${actionText} la solicitud?`;

      if (window.confirm(msg)) {
          setShowResponseModal(false);
          await executeTransition(pendingAction, null, manualVersion);
      }
  };

  const executeTransition = async (action: any, file: File | null, customVersion: string | null) => {
      if (!doc) return;
      setActionLoading(true);
      try {
        await DocumentService.transitionState(
            doc.id, user, action, 
            comment || (action === 'REQUEST_APPROVAL' ? `Solicitud enviada tras validar archivo: ${validationFile?.name}` : `Gestión realizada.`),
            file || undefined,
            customVersion || undefined
        );
        setComment('');
        await loadData(doc.id);
      } catch (err: any) {
        alert('Error: ' + err.message);
      } finally {
        setActionLoading(false);
      }
  };

  const handleGmailNotification = () => {
    if (!doc || !coordinatorEmail) return;
    const subject = encodeURIComponent(`Solicitud de Aprobación SGD: ${doc.project} - ${doc.microprocess}`);
    const body = encodeURIComponent(`Estimado Coordinador,\n\nSolicitud de revisión para ${doc.title}.\nVersión: ${doc.version}\n\nAtentamente,\n${user.name}`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${coordinatorEmail}&su=${subject}&body=${body}`, '_blank');
  };

  const handleNotifyAnalyst = () => {
      if (!doc || !authorEmail) return;
      const subject = encodeURIComponent(`Respuesta Solicitud SGD: ${doc.project} - ${doc.microprocess}`);
      const body = encodeURIComponent(`Estimado/a ${doc.authorName},\n\nRevisión completada.\nEstado: ${STATE_CONFIG[doc.state].label}\nObservaciones: ${comment}\n\nAtentamente,\n${user.name}`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${authorEmail}&su=${subject}&body=${body}`, '_blank');
  };

  if (loading || !doc) return <div className="p-8 text-center text-slate-500">Cargando documento...</div>;

  const config = STATE_CONFIG[doc.state];
  const isAssignee = doc.assignees && doc.assignees.includes(user.id);
  const isAuthor = doc.authorId === user.id;
  const isAnalystAssigned = user.role === UserRole.ANALYST && (isAssignee || isAuthor);
  const isCoordinatorOrAdmin = user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
  const canEdit = isAnalystAssigned || isCoordinatorOrAdmin;

  const canRequestApproval = isAnalystAssigned && !doc.hasPendingRequest;
  const canRestart = isAnalystAssigned && doc.state === DocState.REJECTED;
  const isDocActive = doc.state !== DocState.APPROVED;
  const canApprove = isCoordinatorOrAdmin && isDocActive;
  const canReject = isCoordinatorOrAdmin && isDocActive;
  const canNotifyCoordinator = isAnalystAssigned && coordinatorEmail && doc.state !== DocState.APPROVED;
  const canNotifyAuthor = isCoordinatorOrAdmin && authorEmail && doc.authorId !== user.id;

  const handleNewRequest = () => {
      navigate('/new', { state: { prefill: { project: doc.project, macro: doc.macroprocess, process: doc.process, micro: doc.microprocess, docType: doc.docType } } });
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-slate-800 text-sm">
            <ArrowLeft size={16} className="mr-1" /> Volver
        </button>
        {user.role === UserRole.ADMIN && (
            <button 
                type="button"
                onClick={handleDeleteClick}
                className="flex items-center text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
                <Trash2 size={16} className="mr-1" /> Eliminar
            </button>
        )}
      </div>

      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    {doc.project && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-white">{doc.project}</span>}
                    {doc.docType && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 border border-indigo-200">{doc.docType}</span>}
                    {doc.hasPendingRequest && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500 text-white animate-pulse">Solicitud Pendiente</span>}
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
                <p className="text-slate-500 mt-1">{doc.description}</p>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center self-start ${config.color}`}>
                <Activity size={16} className="mr-2" />
                {config.label}
            </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-slate-100 pt-4">
            <div><p className="text-slate-500">Analistas</p>{assigneeNames.map((name, i) => <p key={i} className="font-medium text-slate-800">{name}</p>)}</div>
            <div><p className="text-slate-500">Versión Actual</p><p className="font-mono text-slate-800 font-bold">{doc.version}</p></div>
            <div><p className="text-slate-500">Progreso</p><div className="flex items-center gap-2"><div className="flex-1 bg-slate-200 rounded-full h-2 w-20"><div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${doc.progress}%` }}></div></div><span className="font-medium">{doc.progress}%</span></div></div>
            <div><p className="text-slate-500">Actualizado</p><p className="text-slate-800">{new Date(doc.updatedAt).toLocaleDateString()}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
            
            {!canEdit && (
                <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                    <div className="flex">
                        <div className="flex-shrink-0"><Lock size={20} className="text-yellow-400" /></div>
                        <div className="ml-3"><p className="text-sm text-yellow-700">Solo lectura.</p></div>
                    </div>
                </div>
            )}

            {/* Archivos Adjuntos - Histórico */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-semibold text-slate-800 flex items-center"><Paperclip size={18} className="mr-2 text-indigo-500" /> Archivos en Sistema</h3>
                </div>
                <ul className="space-y-2 mb-4">
                    {doc.files.map(file => (
                        <li key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm border border-slate-100 group hover:border-indigo-200 transition-colors">
                            <div className="flex items-center overflow-hidden">
                                <FileText size={16} className="text-slate-400 mr-3 flex-shrink-0 group-hover:text-indigo-500" />
                                <a href={file.url} target="_blank" rel="noopener noreferrer" className="truncate font-medium text-slate-700 hover:text-indigo-700 hover:underline">
                                    {file.name}
                                </a>
                            </div>
                        </li>
                    ))}
                    {doc.files.length === 0 && <p className="text-sm text-slate-400 italic">No hay archivos almacenados.</p>}
                </ul>
            </div>

            {/* Acciones */}
            {canEdit && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                     <h3 className="font-semibold text-slate-800 mb-4">Acciones de Flujo</h3>
                     
                     {/* AREA DE VALIDACIÓN PARA ANALISTA */}
                     {canRequestApproval && (
                         <div className="mb-6 p-4 bg-indigo-50 border border-indigo-100 rounded-lg">
                             <h4 className="text-sm font-bold text-indigo-900 mb-2 flex items-center gap-2">
                                 <FileCheck size={16}/> Validación de Entrega
                             </h4>
                             <p className="text-xs text-indigo-700 mb-3">
                                 Seleccione el archivo final para validar la nomenclatura antes de solicitar aprobación.
                             </p>
                             
                             <div className="flex gap-3 items-center">
                                 <input 
                                    type="file" 
                                    ref={fileInputRef}
                                    onChange={handleFileValidation}
                                    className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-indigo-100 file:text-indigo-700 hover:file:bg-indigo-200"
                                 />
                             </div>

                             {validationFile && (
                                 <div className={`mt-3 p-3 rounded-lg border text-sm ${isValidated ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
                                     {isValidated ? (
                                         <div className="flex items-center gap-2 font-medium">
                                             <CheckCircle size={16} /> Archivo válido. Listo para solicitar.
                                         </div>
                                     ) : (
                                         <div>
                                             <div className="flex items-center gap-2 font-bold mb-1">
                                                 <XCircle size={16} /> Error de nomenclatura:
                                             </div>
                                             <ul className="list-disc pl-5 text-xs space-y-1">
                                                 {validationError.map((e, i) => <li key={i}>{e}</li>)}
                                             </ul>
                                         </div>
                                     )}
                                 </div>
                             )}
                         </div>
                     )}

                     <textarea 
                        className="w-full p-3 border border-slate-300 rounded-lg text-sm mb-4 outline-none focus:ring-2 focus:ring-indigo-500"
                        rows={3}
                        placeholder="Observaciones..."
                        value={comment}
                        onChange={(e) => setComment(e.target.value)}
                     />
                     <div className="flex flex-wrap gap-3">
                        <button onClick={() => handleActionClick('COMMENT')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium shadow-sm transition-colors"><MessageSquare size={16} className="mr-2" /> Guardar Observación</button>
                        
                        {canNotifyCoordinator && <button onClick={handleGmailNotification} className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium border border-slate-200 shadow-sm"><Mail size={16} className="mr-2" /> Notificar Coord.</button>}
                        {canNotifyAuthor && <button onClick={handleNotifyAnalyst} className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium border border-slate-200 shadow-sm"><Mail size={16} className="mr-2" /> Notificar Analista</button>}
                        
                        {canRequestApproval && (
                            <button 
                                onClick={() => handleActionClick('REQUEST_APPROVAL')} 
                                disabled={actionLoading || !isValidated} 
                                className={`flex items-center px-4 py-2 text-white rounded-lg text-sm font-medium shadow-sm transition-colors ${isValidated ? 'bg-green-600 hover:bg-green-700' : 'bg-slate-300 cursor-not-allowed'}`}
                            >
                                <Send size={16} className="mr-2" /> Solicitar Aprobación
                            </button>
                        )}
                        
                        {canRestart && <button onClick={() => handleActionClick('ADVANCE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm">Reiniciar Flujo</button>}
                        
                        {canApprove && <button onClick={() => handleActionClick('APPROVE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm"><CheckCircle size={16} className="mr-2" /> Aprobar</button>}
                        {canReject && <button onClick={() => handleActionClick('REJECT')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-medium border border-red-200"><XCircle size={16} className="mr-2" /> Rechazar</button>}
                     </div>
                </div>
            )}
        </div>

        {/* Historial (Right Column) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit max-h-[600px] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Historial</h3>
            <div className="space-y-6 pl-4 border-l-2 border-slate-100 relative">
                {history.map(h => (
                    <div key={h.id} className="relative">
                        <div className={`absolute -left-[21px] top-1 h-3 w-3 rounded-full border-2 border-white ${h.action === 'Observación' ? 'bg-indigo-400' : 'bg-slate-300'}`}></div>
                        <div className="text-xs text-slate-400 mb-0.5">{new Date(h.timestamp).toLocaleString()}</div>
                        <p className="text-sm font-medium text-slate-800">{h.action} <span className="font-normal text-slate-500">por {h.userName}</span></p>
                        {h.comment && <div className="mt-1 p-2 bg-slate-50 rounded text-xs text-slate-600 italic border border-slate-100">"{h.comment}"</div>}
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* MODAL DE RESPUESTA (COORDINADOR) - SIN CARGA DE ARCHIVO */}
      {showResponseModal && pendingAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                  <div className={`p-5 border-b border-slate-100 flex justify-between items-center ${pendingAction === 'APPROVE' ? 'bg-green-50' : 'bg-red-50'}`}>
                      <h3 className={`text-lg font-bold flex items-center gap-2 ${pendingAction === 'APPROVE' ? 'text-green-800' : 'text-red-800'}`}>
                          {pendingAction === 'APPROVE' ? <CheckCircle size={24} /> : <XCircle size={24} />}
                          {pendingAction === 'APPROVE' ? 'Aprobar Documento' : 'Rechazar Documento'}
                      </h3>
                      <button onClick={() => setShowResponseModal(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={20} /></button>
                  </div>
                  
                  <div className="p-6 space-y-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                <ListFilter size={14} /> Etapa del Proceso
                            </label>
                            <select 
                                value={approvalType} 
                                onChange={(e) => setApprovalType(e.target.value as ApprovalContext)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">-- Seleccionar Etapa --</option>
                                <option value="INTERNAL">Etapa: Revisión Interna (v0.x - v1.0)</option>
                                <option value="REFERENT">Etapa: Referente (v1.x - v1.y)</option>
                                <option value="CONTROL">Etapa: Control de Gestión (v1.xAR - v1.yAR)</option>
                            </select>
                        </div>

                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex flex-col gap-2">
                            <div className="flex items-start gap-3">
                                <Info size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs font-bold text-blue-800 uppercase mb-1">Nota del Sistema</p>
                                    <p className="text-xs text-blue-900 leading-relaxed">
                                        Esta acción registrará oficialmente la {pendingAction === 'APPROVE' ? 'aprobación' : 'rechazo'} en el historial y notificará al analista. 
                                        <strong> No es necesario subir un archivo adjunto en este paso.</strong>
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                <Activity size={14} /> Versión Resultante
                            </label>
                            <input 
                                type="text" 
                                value={manualVersion}
                                onChange={(e) => setManualVersion(e.target.value)}
                                className="w-full p-2 border border-slate-300 rounded-lg text-sm font-mono"
                                placeholder={doc.version}
                            />
                            <p className="text-[10px] text-slate-400 mt-1">Confirme la versión que quedará registrada (Ej: v1.0, v1.0.2AR)</p>
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowResponseModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button>
                            <button 
                                onClick={handleSubmitResponse}
                                disabled={!approvalType}
                                className={`px-4 py-2 rounded-lg text-white text-sm font-bold shadow-sm transition-all flex items-center gap-2
                                    ${pendingAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                                    disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                <Save size={16} />
                                {pendingAction === 'APPROVE' ? 'Confirmar Aprobación' : 'Confirmar Rechazo'}
                            </button>
                        </div>
                  </div>
              </div>
          </div>
      )}

      {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slideUp">
                  <div className="p-5 border-b border-red-100 bg-red-50 flex items-center justify-between">
                      <h3 className="text-lg font-bold text-red-800 flex items-center gap-2"><Trash2 size={24} /> Confirmar Eliminación</h3>
                      <button onClick={() => setShowDeleteModal(false)} className="text-red-400 hover:text-red-600"><XCircle size={20} /></button>
                  </div>
                  <div className="p-6">
                      <p className="text-slate-700 mb-4">¿Estás seguro de que quieres eliminar permanentemente: <strong>{doc.title}</strong>?</p>
                      <div className="flex justify-end gap-3">
                          <button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-slate-600">Cancelar</button>
                          <button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Sí, Eliminar</button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default DocumentDetail;
