
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocumentService, HistoryService, UserService } from '../services/firebaseBackend';
import { Document, User, DocHistory, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename, validateCoordinatorRules, getCoordinatorRuleHint } from '../utils/filenameParser';
import { ArrowLeft, Upload, FileText, CheckCircle, XCircle, Activity, Paperclip, Mail, MessageSquare, Send, AlertTriangle, FileCheck, FileX, Info, ListFilter, Trash2 } from 'lucide-react';

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

  // Response Modal State
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [approvalType, setApprovalType] = useState<ApprovalContext | ''>(''); // New selector state
  const [responseFile, setResponseFile] = useState<File | undefined>(undefined);
  const [responseFileError, setResponseFileError] = useState<string | null>(null);
  const modalFileRef = useRef<HTMLInputElement>(null);

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
    }

    if (d && d.assignees && d.assignees.length > 0) {
        const names = d.assignees
            .map(aid => allUsers.find(u => u.id === aid)?.name)
            .filter(n => n) as string[];
        setAssigneeNames(names);
    }
    setLoading(false);
  };

  const handleDelete = async () => {
      if (!doc) return;
      if (!window.confirm('¿Estás seguro de que quieres eliminar este documento permanentemente? Esta acción no se puede deshacer.')) return;
      try {
          await DocumentService.delete(doc.id);
          navigate('/');
      } catch (e: any) {
          alert(e.message);
      }
  };

  // Standard File Upload (Just adding attachments)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !doc) return;
    const file = e.target.files[0];
    const analisis = parseDocumentFilename(file.name, doc.project, doc.microprocess, doc.docType);

    if (!analisis.valido) {
      alert(`Error en nomenclatura:\n${analisis.errores.join('\n')}`);
      e.target.value = '';
      return;
    }

    if (!window.confirm(`Subir archivo: ${analisis.nomenclatura || 'Desconocida'}?`)) {
        e.target.value = '';
        return;
    }
    
    try {
      await DocumentService.uploadFile(doc.id, file, user);
      await loadData(doc.id);
    } catch (err: any) { alert(err.message); }
    finally { e.target.value = ''; }
  };

  // Trigger Action Flow
  const handleActionClick = (action: 'ADVANCE' | 'APPROVE' | 'REJECT' | 'REQUEST_APPROVAL' | 'COMMENT') => {
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
          if (!window.confirm('¿Solicitar aprobación para la versión actual?')) return;
          executeTransition('REQUEST_APPROVAL', null, null);
          return;
      }

      if (action === 'ADVANCE') {
          executeTransition('ADVANCE', null, null);
          return;
      }

      // For APPROVE or REJECT, Open Modal
      if (action === 'APPROVE' || action === 'REJECT') {
          if (action === 'REJECT' && !comment) {
              alert('Por favor agrega un comentario/observación antes de rechazar.');
              return;
          }
          setPendingAction(action);
          setResponseFile(undefined);
          setResponseFileError(null);

          // Auto-detect approval type if based on current state (Legacy behavior fallback)
          let autoType: ApprovalContext | '' = '';
          if (doc.state === DocState.INTERNAL_REVIEW) autoType = 'INTERNAL';
          else if (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW) autoType = 'REFERENT';
          else if (doc.state === DocState.SENT_TO_CONTROL || doc.state === DocState.CONTROL_REVIEW) autoType = 'CONTROL';
          
          setApprovalType(autoType);
          setShowResponseModal(true);
      }
  };

  const handleResponseFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && doc && pendingAction) {
          const file = e.target.files[0];
          setResponseFile(file);
          
          // 1. Basic Structure Validation
          const analisis = parseDocumentFilename(file.name, doc.project, doc.microprocess, doc.docType);
          if (!analisis.valido) {
              setResponseFileError(`Nomenclatura inválida: ${analisis.errores[0]}`);
              return;
          }

          // Determine Mock State for Validation based on Dropdown
          let mockStateForValidation = doc.state;
          if (approvalType === 'INTERNAL') mockStateForValidation = DocState.INTERNAL_REVIEW;
          else if (approvalType === 'REFERENT') mockStateForValidation = DocState.SENT_TO_REFERENT;
          else if (approvalType === 'CONTROL') mockStateForValidation = DocState.SENT_TO_CONTROL;

          // 2. Strict Coordinator Rule Validation
          const ruleCheck = validateCoordinatorRules(file.name, doc.version, mockStateForValidation, pendingAction);
          if (!ruleCheck.valid) {
              setResponseFileError(ruleCheck.error || 'Error de validación');
              return;
          }

          setResponseFileError(null);
      }
  };

  const handleSubmitResponse = async () => {
      if (!doc || !pendingAction || !responseFile || responseFileError) return;
      if (pendingAction === 'APPROVE' && !approvalType) {
          alert('Debe seleccionar un Tipo de Aprobación.');
          return;
      }

      // Extract Clean Version
      const parts = responseFile.name.replace(/\.[^/.]+$/, "").split(' - ');
      const newVersion = parts[parts.length - 1];

      if (window.confirm(`Confirma ${pendingAction === 'APPROVE' ? 'APROBAR' : 'RECHAZAR'} con archivo ${newVersion}?`)) {
          setShowResponseModal(false);
          await executeTransition(pendingAction, responseFile, newVersion);
      }
  };

  const executeTransition = async (action: any, file: File | null, customVersion: string | null) => {
      if (!doc) return;
      setActionLoading(true);
      try {
        await DocumentService.transitionState(
            doc.id, user, action, 
            comment || (action === 'REQUEST_APPROVAL' ? 'Solicitud de Aprobación Enviada' : 'Cambio de estado'),
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

  // Helper to get hint based on selector
  const getCurrentHint = () => {
      let mockState = doc?.state || DocState.INITIATED;
      if (approvalType === 'INTERNAL') mockState = DocState.INTERNAL_REVIEW;
      else if (approvalType === 'REFERENT') mockState = DocState.SENT_TO_REFERENT;
      else if (approvalType === 'CONTROL') mockState = DocState.SENT_TO_CONTROL;
      
      return getCoordinatorRuleHint(mockState, pendingAction || 'APPROVE');
  };

  if (loading || !doc) return <div className="p-8 text-center text-slate-500">Cargando documento...</div>;

  const config = STATE_CONFIG[doc.state];
  const isAssignee = doc.assignees && doc.assignees.includes(user.id);
  const isAuthor = doc.authorId === user.id;
  const hasWriteAccess = (user.role === UserRole.ANALYST && (isAssignee || isAuthor)) || user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
  const canUpload = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && (doc.state === DocState.INITIATED || doc.state === DocState.IN_PROCESS || doc.state === DocState.REJECTED);
  const canRequestApproval = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && !doc.hasPendingRequest && (doc.state === DocState.IN_PROCESS || doc.state === DocState.INTERNAL_REVIEW || doc.state === DocState.SENT_TO_REFERENT);
  const canRestart = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && doc.state === DocState.REJECTED;
  
  // LOGIC UPDATE: Allow Coordinator/Admin to approve proactively OR if request is pending
  const isCoordinatorOrAdmin = user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
  const isDocActive = doc.state !== DocState.APPROVED;
  
  // MODIFICATION: Allow Analysts (Author/Assignee) to also use the Approve button to trigger validation modal
  // This satisfies both Coordinator/Admin power-use AND Analyst workflow
  const canApprove = (isCoordinatorOrAdmin || (user.role === UserRole.ANALYST && (isAssignee || isAuthor))) && isDocActive;

  const canReject = canApprove;
  const canNotifyCoordinator = user.role === UserRole.ANALYST && coordinatorEmail && doc.state !== DocState.APPROVED;
  const canNotifyAuthor = isCoordinatorOrAdmin && authorEmail && doc.authorId !== user.id;

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <button onClick={() => navigate('/')} className="flex items-center text-slate-500 hover:text-slate-800 text-sm">
            <ArrowLeft size={16} className="mr-1" /> Volver al Dashboard
        </button>
        {user.role === UserRole.ADMIN && (
            <button 
                onClick={handleDelete}
                className="flex items-center text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"
            >
                <Trash2 size={16} className="mr-1" /> Eliminar Documento
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
            {/* Archivos Adjuntos */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center"><Paperclip size={18} className="mr-2 text-indigo-500" /> Archivos Adjuntos</h3>
                <ul className="space-y-2 mb-4">
                    {doc.files.map(file => (
                        <li key={file.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg text-sm border border-slate-100">
                            <div className="flex items-center overflow-hidden">
                                <FileText size={16} className="text-slate-400 mr-3 flex-shrink-0" />
                                <span className="truncate font-medium text-slate-700">{file.name}</span>
                            </div>
                        </li>
                    ))}
                    {doc.files.length === 0 && <p className="text-sm text-slate-400 italic">No hay archivos.</p>}
                </ul>
                {canUpload && (
                    <label className="block p-4 border-2 border-dashed border-indigo-200 rounded-xl hover:bg-indigo-50 transition-colors cursor-pointer text-center text-indigo-600">
                        <input type="file" onChange={handleFileUpload} className="hidden" />
                        <Upload size={24} className="mx-auto mb-2" />
                        <span className="text-sm font-medium">Subir nueva versión</span>
                    </label>
                )}
            </div>

            {/* Acciones */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                 <h3 className="font-semibold text-slate-800 mb-4">Acciones de Flujo</h3>
                 <textarea 
                    className="w-full p-3 border border-slate-300 rounded-lg text-sm mb-4 outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={3}
                    placeholder="Escriba aquí sus observaciones o comentarios..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                 />
                 <div className="flex flex-wrap gap-3">
                    {hasWriteAccess && <button onClick={() => handleActionClick('COMMENT')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium shadow-sm transition-colors"><MessageSquare size={16} className="mr-2" /> Guardar Observación</button>}
                    {canNotifyCoordinator && <button onClick={handleGmailNotification} className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium border border-slate-200 shadow-sm"><Mail size={16} className="mr-2" /> Notificar Coord.</button>}
                    {canNotifyAuthor && <button onClick={handleNotifyAnalyst} className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium border border-slate-200 shadow-sm"><Mail size={16} className="mr-2" /> Notificar Analista</button>}
                    {canRequestApproval && <button onClick={() => handleActionClick('REQUEST_APPROVAL')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm"><Send size={16} className="mr-2" /> Solicitar Aprobación</button>}
                    {canRestart && <button onClick={() => handleActionClick('ADVANCE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm">Reiniciar Flujo</button>}
                    {canApprove && <button onClick={() => handleActionClick('APPROVE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm"><CheckCircle size={16} className="mr-2" /> Aprobar</button>}
                    {canReject && <button onClick={() => handleActionClick('REJECT')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-medium border border-red-200"><XCircle size={16} className="mr-2" /> Rechazar</button>}
                 </div>
            </div>
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

      {/* MODAL DE RESPUESTA (APROBAR/RECHAZAR) */}
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
                        {/* SELECTOR DE CONTEXTO (NUEVO) */}
                        <div>
                            <label className="block text-xs font-bold text-slate-500 uppercase mb-1 flex items-center gap-1">
                                <ListFilter size={14} /> Tipo de Aprobación / Contexto
                            </label>
                            <select 
                                value={approvalType} 
                                onChange={(e) => {
                                    setApprovalType(e.target.value as ApprovalContext);
                                    setResponseFile(undefined); // Reset file to force re-validation
                                    setResponseFileError(null);
                                }}
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                <option value="">-- Seleccionar Etapa --</option>
                                <option value="INTERNAL">Aprobación Revisión Interna (v1.0)</option>
                                <option value="REFERENT">Aprobación Referente (v1.n / v1.nAR)</option>
                                <option value="CONTROL">Aprobación Control Gestión (v1.nAR / v1.nACG)</option>
                            </select>
                        </div>

                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex items-start gap-3">
                            <Info size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                            <div>
                                <p className="text-xs font-bold text-blue-800 uppercase mb-1">Nomenclatura Requerida</p>
                                <p className="text-sm font-mono font-bold text-blue-900">
                                    {approvalType ? getCurrentHint() : 'Seleccione un tipo de aprobación'}
                                </p>
                            </div>
                        </div>

                        <div className={`border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center text-center transition-colors
                            ${!approvalType ? 'bg-slate-50 border-slate-200 cursor-not-allowed opacity-60' : 
                               responseFileError ? 'border-red-300 bg-red-50' : 
                               responseFile ? 'border-green-300 bg-green-50' : 
                               'border-slate-300 hover:bg-slate-50 hover:border-indigo-300 cursor-pointer'}`}>
                            
                            <input 
                                type="file" 
                                ref={modalFileRef}
                                className="hidden"
                                disabled={!approvalType}
                                onChange={handleResponseFileSelect}
                            />

                            {responseFile ? (
                                <div>
                                    {responseFileError ? (
                                        <>
                                            <FileX size={32} className="text-red-500 mx-auto mb-2" />
                                            <p className="font-bold text-red-700">{responseFile.name}</p>
                                            <p className="text-xs text-red-600 mt-1">{responseFileError}</p>
                                            <button onClick={() => modalFileRef.current?.click()} className="text-xs underline text-red-800 mt-2">Cambiar archivo</button>
                                        </>
                                    ) : (
                                        <>
                                            <FileCheck size={32} className="text-green-500 mx-auto mb-2" />
                                            <p className="font-bold text-green-700">{responseFile.name}</p>
                                            <p className="text-xs text-green-600 mt-1">Archivo válido</p>
                                            <button onClick={() => modalFileRef.current?.click()} className="text-xs underline text-green-800 mt-2">Cambiar archivo</button>
                                        </>
                                    )}
                                </div>
                            ) : (
                                <div onClick={() => approvalType && modalFileRef.current?.click()} className={approvalType ? "cursor-pointer" : ""}>
                                    <Upload size={32} className="text-slate-400 mx-auto mb-2" />
                                    <p className="text-sm font-medium text-slate-600">
                                        {approvalType ? 'Click para subir archivo' : 'Seleccione un Tipo primero'}
                                    </p>
                                </div>
                            )}
                        </div>

                        <div className="flex justify-end gap-3 pt-4">
                            <button onClick={() => setShowResponseModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button>
                            <button 
                                onClick={handleSubmitResponse}
                                disabled={!responseFile || !!responseFileError || !approvalType}
                                className={`px-4 py-2 rounded-lg text-white text-sm font-bold shadow-sm transition-all
                                    ${pendingAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                                    disabled:opacity-50 disabled:cursor-not-allowed`}
                            >
                                Confirmar {pendingAction === 'APPROVE' ? 'Aprobación' : 'Rechazo'}
                            </button>
                        </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default DocumentDetail;
