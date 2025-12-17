
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DocumentService, HistoryService, UserService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocHistory, UserRole, DocState, FullHierarchy } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename, validateCoordinatorRules, getCoordinatorRuleHint } from '../utils/filenameParser';
import { ArrowLeft, FileText, CheckCircle, XCircle, Activity, Paperclip, Mail, MessageSquare, Send, FileCheck, FileX, Info, ListFilter, Trash2, Lock, Save, PlusCircle, Calendar, Upload, ExternalLink } from 'lucide-react';

interface Props {
  user: User;
}

const DocumentDetail: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const [doc, setDoc] = useState<Document | null>(null);
  const [history, setHistory] = useState<DocHistory[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<string[]>([]);
  const [assigneeEmails, setAssigneeEmails] = useState<string[]>([]);
  const [coordinatorEmail, setCoordinatorEmail] = useState<string>('');
  const [authorEmail, setAuthorEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);

  // Response Modal State
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  
  // File Upload inside Modal
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string[]>([]);
  const [isFileValid, setIsFileValid] = useState(false);
  const [detectedVersion, setDetectedVersion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Delete Modal State
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  useEffect(() => {
    if (location.state?.docData) {
        const passedDoc = location.state.docData;
        setDoc(passedDoc);
        setLoading(false);
        if (!passedDoc.id.startsWith('virtual-')) {
             loadAuxiliaryData(passedDoc.id, passedDoc);
        } else {
             if (passedDoc.assignees && passedDoc.assignees.length > 0) {
                 UserService.getAll().then(users => {
                     const names = passedDoc.assignees.map((aid: string) => users.find(u => u.id === aid)?.name).filter((n: string) => n) as string[];
                     setAssigneeNames(names);
                     const emails = passedDoc.assignees.map((aid: string) => users.find(u => u.id === aid)?.email).filter((e: string) => e) as string[];
                     setAssigneeEmails(emails);
                 });
             }
        }
    } else if (id && !id.startsWith('virtual-')) {
        loadData(id);
    } else {
        setLoading(false);
    }
  }, [id, location.state]);

  const resolveAssignees = (d: Document, hierarchy: FullHierarchy): string[] => {
      let resolvedIds = d.assignees || [];
      const isLegacy = d.authorName.includes('Sistema') || d.authorName.includes('Carga');
      
      if ((resolvedIds.length === 0 || isLegacy) && d.project && d.microprocess) {
           const targetMicro = normalizeHeader(d.microprocess);
           const targetProject = normalizeHeader(d.project);
           
           let node: any = null;
           if (hierarchy) {
               for (const projKey of Object.keys(hierarchy)) {
                   if (normalizeHeader(projKey) === targetProject) {
                       const projData = hierarchy[projKey];
                       for (const macroKey of Object.keys(projData)) {
                           const macroData = projData[macroKey];
                           for (const procKey of Object.keys(macroData)) {
                               const nodes = macroData[procKey];
                               const found = nodes.find(n => normalizeHeader(n.name) === targetMicro);
                               if (found) {
                                   node = found;
                                   break;
                               }
                           }
                           if (node) break;
                       }
                   }
                   if (node) break;
               }
           }
           if (node?.assignees && node.assignees.length > 0) resolvedIds = node.assignees;
      }
      return resolvedIds;
  };

  const findCoordinator = (users: User[]) => {
      const coord = users.find(u => {
          const role = (u.role || '').toString().toUpperCase();
          return role === 'COORDINATOR' || role === 'COORDINADOR';
      });
      if (coord) return coord;
      const admin = users.find(u => {
          const role = (u.role || '').toString().toUpperCase();
          return role === 'ADMIN' || role === 'ADMINISTRADOR';
      });
      return admin;
  };

  const loadAuxiliaryData = async (docId: string, currentDoc: Document | null) => {
      try {
          const [h, allUsers, hierarchy] = await Promise.all([
              HistoryService.getHistory(docId),
              UserService.getAll(),
              HierarchyService.getFullHierarchy()
          ]);
          setHistory(h);
          const targetDoc = currentDoc || doc;
          if (targetDoc) {
              const coordinator = findCoordinator(allUsers);
              if (coordinator) setCoordinatorEmail(coordinator.email);
              const author = allUsers.find(u => u.id === targetDoc.authorId);
              if (author) setAuthorEmail(author.email);
              const resolvedIds = resolveAssignees(targetDoc, hierarchy);
              if (resolvedIds.length > 0) {
                  const names = resolvedIds.map(aid => allUsers.find(u => u.id === aid)?.name).filter(n => n) as string[];
                  setAssigneeNames(names);
                  const emails = resolvedIds.map(aid => allUsers.find(u => u.id === aid)?.email).filter(e => e) as string[];
                  setAssigneeEmails(emails);
              }
          }
      } catch (e) {
          console.error("Error loading aux data", e);
      }
  };

  const loadData = async (docId: string) => {
    setLoading(true);
    try {
        const [d, h, allUsers, hierarchy] = await Promise.all([
          DocumentService.getById(docId),
          HistoryService.getHistory(docId),
          UserService.getAll(),
          HierarchyService.getFullHierarchy()
        ]);
        if (d) {
            setDoc(d);
            setHistory(h);
            const coordinator = findCoordinator(allUsers);
            if (coordinator) setCoordinatorEmail(coordinator.email);
            const author = allUsers.find(u => u.id === d.authorId);
            if (author) setAuthorEmail(author.email);
            const resolvedIds = resolveAssignees(d, hierarchy);
            if (resolvedIds.length > 0) {
                const names = resolvedIds.map(aid => allUsers.find(u => u.id === aid)?.name).filter(n => n) as string[];
                setAssigneeNames(names);
                const emails = resolvedIds.map(aid => allUsers.find(u => u.id === aid)?.email).filter(e => e) as string[];
                setAssigneeEmails(emails);
            } else {
                setAssigneeNames([]);
                setAssigneeEmails([]);
            }
        } else {
            setDoc(null);
        }
    } catch (error) {
        console.error("Error loading document data:", error);
        setDoc(null);
    } finally {
        setLoading(false);
    }
  };

  const handleNewRequest = () => {
      if (!doc) return;
      navigate('/new', { state: { prefill: { project: doc.project, macro: doc.macroprocess, process: doc.process, micro: doc.microprocess, docType: doc.docType } } });
  };

  const handleDeleteClick = () => { setShowDeleteModal(true); };

  const confirmDelete = async () => {
      if (!doc) return;
      try {
          setShowDeleteModal(false);
          setLoading(true); 
          await DocumentService.delete(doc.id);
          navigate('/', { replace: true });
      } catch (e: any) {
          alert('Error al eliminar: ' + e.message);
          setLoading(false);
      }
  };

  const handleActionClick = async (action: 'ADVANCE' | 'APPROVE' | 'REJECT' | 'COMMENT') => {
      if (!doc) return;
      if (action === 'COMMENT') {
          if (!comment.trim()) { alert('Por favor escribe una observación antes de guardar.'); return; }
          executeTransition('COMMENT', null, null);
          return;
      }
      if (action === 'ADVANCE') { executeTransition('ADVANCE', null, null); return; }
      if (action === 'APPROVE' || action === 'REJECT') {
          if (action === 'REJECT' && !comment) { alert('Por favor agrega un comentario/observación antes de rechazar.'); return; }
          setPendingAction(action);
          setResponseFile(null); setFileError([]); setIsFileValid(false); setDetectedVersion('');
          setShowResponseModal(true);
      }
  };

  const handleResponseFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && doc && pendingAction) {
          const f = e.target.files[0];
          setResponseFile(f);
          const result = parseDocumentFilename(f.name, doc.project, doc.microprocess, doc.docType);
          if (!result.valido) { setFileError(result.errores); setIsFileValid(false); return; }
          const rules = validateCoordinatorRules(f.name, doc.version, doc.state, pendingAction);
          if (!rules.valid) { setFileError([rules.error || 'Error de validación de versión.']); setIsFileValid(false); return; }
          setIsFileValid(true); setFileError([]); setDetectedVersion(result.nomenclatura || '');
      }
  };

  const handleSubmitResponse = async () => {
      if (!doc || !pendingAction || !responseFile || !isFileValid) return;
      const actionText = pendingAction === 'APPROVE' ? 'APROBAR' : 'RECHAZAR';
      if (window.confirm(`¿Confirma ${actionText} la solicitud cargando el archivo ${detectedVersion}?`)) {
          setShowResponseModal(false);
          await executeTransition(pendingAction, responseFile, detectedVersion);
      }
  };

  const executeTransition = async (action: any, file: File | null, customVersion: string | null) => {
      if (!doc) return;
      setActionLoading(true);
      try {
        await DocumentService.transitionState(doc.id, user, action, comment || (action === 'REQUEST_APPROVAL' ? `Solicitud enviada tras validar archivo.` : `Gestión realizada.`), file || undefined, customVersion || undefined);
        setComment('');
        await loadData(doc.id);
      } catch (err: any) {
        alert('Error: ' + err.message);
      } finally {
        setActionLoading(false);
      }
  };

  // --- NOTIFICATION HANDLERS ---

  // 1. ANALISTA -> COORDINADOR (Comunicación Interna: Con PROYECTO)
  const handleAnalystNotificationToCoordinator = () => {
    if (!doc) return;
    if (!coordinatorEmail) {
        alert(`Aviso: No se ha detectado un usuario con rol 'Coordinador' ni 'Administrador'.`);
        return;
    }
    const subject = encodeURIComponent(`Solicitud de Aprobación ${doc.project} - ${doc.microprocess}`);
    const bodyRaw = `Estimada/o,
Para vuestra aprobación, adjunto el Informe "${doc.project} - ${doc.macroprocess || ''} - ${doc.microprocess} - ${doc.docType || ''} - ${doc.version}",

Atento a comentarios
Saludos

${user.name}`;

    const body = encodeURIComponent(bodyRaw);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${coordinatorEmail}&su=${subject}&body=${body}`, '_blank');
  };

  // 2. COORDINADOR -> EXTERNO (Comunicación Externa: SIN PROYECTO)
  const handleNotifyExternal = () => {
      if (!doc) return;
      const subject = encodeURIComponent(`Solicitud de Aprobación ${doc.docType || ''} ${doc.microprocess || ''}`);
      const cc = encodeURIComponent(assigneeEmails.join(','));
      const bodyRaw = `Estimado,
Para vuestra aprobación, adjunto el Informe:

- ${doc.microprocess} - ${doc.docType || ''} - ${doc.version}

Atento a comentarios
Saludos

${user.name}`;

      const body = encodeURIComponent(bodyRaw);
      // Destinatario vacío (to=), analistas en CC.
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&cc=${cc}&su=${subject}&body=${body}`, '_blank');
  };

  // 3. COORDINADOR -> ANALISTA (Comunicación Interna: Con PROYECTO)
  const handleNotifyAnalyst = () => {
      if (!doc || assigneeEmails.length === 0) return;
      
      const subject = encodeURIComponent(`Respuesta Solicitud: ${doc.project} - ${doc.microprocess}`);
      const estadoLabel = doc.state === DocState.APPROVED ? 'Aprobado' : 
                          doc.state === DocState.REJECTED ? 'Rechazado' : 
                          STATE_CONFIG[doc.state].label.split('(')[0].trim();
      
      const primerAnalista = assigneeNames[0] || 'Analista';
      
      const bodyRaw = `Estimado ${primerAnalista},
Adjunto el Informe:

- ${doc.project} - ${doc.macroprocess || ''} - ${doc.microprocess} - ${doc.docType || ''} - ${doc.version}

Estado: ${estadoLabel}

Saludos

${user.name}`;

      const body = encodeURIComponent(bodyRaw);
      const to = encodeURIComponent(assigneeEmails.join(','));
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${subject}&body=${body}`, '_blank');
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando documento...</div>;
  if (!doc) return (
      <div className="p-12 text-center flex flex-col items-center justify-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400"><FileX size={32} /></div>
          <h2 className="text-xl font-bold text-slate-700 mb-2">Documento no encontrado</h2>
          <p className="text-slate-500 mb-6">El documento que buscas no existe o ha sido eliminado.</p>
          <button onClick={() => navigate('/')} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">Volver al Inicio</button>
      </div>
  );

  const config = STATE_CONFIG[doc.state];
  const isAssignee = doc.assignees && doc.assignees.includes(user.id);
  const isAuthor = doc.authorId === user.id;
  const isAnalystAssigned = user.role === UserRole.ANALYST && (isAssignee || isAuthor);
  const isCoordinatorOrAdmin = user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
  const canEdit = isAnalystAssigned || isCoordinatorOrAdmin;
  const canRestart = isAnalystAssigned && doc.state === DocState.REJECTED;
  const isDocActive = doc.state !== DocState.APPROVED;
  const canApprove = isCoordinatorOrAdmin && isDocActive;
  const canReject = isCoordinatorOrAdmin && isDocActive;
  const canNotifyAuthor = isCoordinatorOrAdmin && doc.state !== DocState.NOT_STARTED; 
  const canNotifyExternal = (isCoordinatorOrAdmin) && (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.SENT_TO_CONTROL);
  const analystNotificationStates = [DocState.INTERNAL_REVIEW, DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW];
  const canNotifyCoordinator = isAnalystAssigned && analystNotificationStates.includes(doc.state);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-slate-800 text-sm"><ArrowLeft size={16} className="mr-1" /> Volver</button>
        {user.role === UserRole.ADMIN && !doc.id.startsWith('virtual-') && (
            <button type="button" onClick={handleDeleteClick} className="flex items-center text-red-500 hover:text-red-700 text-sm font-medium px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg transition-colors"><Trash2 size={16} className="mr-1" /> Eliminar</button>
        )}
      </div>

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
            <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold flex items-center self-start ${config.color}`}><Activity size={16} className="mr-2" />{config.label}</div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-slate-100 pt-4">
            <div><p className="text-slate-500">Analistas</p>{assigneeNames.length > 0 ? assigneeNames.map((name, i) => <p key={i} className="font-medium text-slate-800">{name}</p>) : <p className="font-medium text-slate-800">{doc.authorName}</p>}</div>
            <div><p className="text-slate-500">Versión Actual</p><p className="font-mono text-slate-800 font-bold">{doc.version}</p></div>
            <div><p className="text-slate-500">Progreso</p><div className="flex items-center gap-2"><div className="flex-1 bg-slate-200 rounded-full h-2 w-20"><div className="bg-indigo-600 h-2 rounded-full" style={{ width: `${doc.progress}%` }}></div></div><span className="font-medium">{doc.progress}%</span></div></div>
            <div><p className="text-slate-500">Actualizado</p><p className="text-slate-800">{new Date(doc.updatedAt).toLocaleDateString()}</p></div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
            {!canEdit && <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 flex gap-3 text-sm text-yellow-700"><Lock size={20} className="text-yellow-400" /> Solo lectura.</div>}
            {canEdit && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                     <h3 className="font-semibold text-slate-800 mb-4">Acciones de Flujo</h3>
                     {user.role === UserRole.ANALYST && doc.state !== DocState.APPROVED && (
                         <div className="mb-6 pb-6 border-b border-slate-100">
                             <button onClick={handleNewRequest} className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-md transition-all active:scale-95"><PlusCircle size={20} className="mr-2" />{doc.state === DocState.NOT_STARTED ? 'Iniciar Solicitud' : 'Nueva Solicitud / Continuar Flujo'}</button>
                         </div>
                     )}
                     <textarea className="w-full p-3 border border-slate-300 rounded-lg text-sm mb-4 outline-none focus:ring-2 focus:ring-indigo-500" rows={3} placeholder="Observaciones..." value={comment} onChange={(e) => setComment(e.target.value)} />
                     <div className="flex flex-wrap gap-3">
                        <button onClick={() => handleActionClick('COMMENT')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-slate-800 text-white rounded-lg hover:bg-slate-900 text-sm font-medium shadow-sm transition-colors"><MessageSquare size={16} className="mr-2" /> Guardar Observación</button>
                        {canNotifyCoordinator && <button onClick={handleAnalystNotificationToCoordinator} className="flex items-center px-4 py-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-lg text-sm font-medium border border-blue-200 shadow-sm"><Mail size={16} className="mr-2" /> Notificar al coordinador</button>}
                        {canNotifyAuthor && <button onClick={handleNotifyAnalyst} className="flex items-center px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg text-sm font-medium border border-slate-200 shadow-sm"><Mail size={16} className="mr-2" /> Notificar Analista</button>}
                        {canNotifyExternal && <button onClick={handleNotifyExternal} className="flex items-center px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 text-sm font-medium shadow-sm border border-purple-700 transition-colors"><ExternalLink size={16} className="mr-2" /> Notificar Referente / Control</button>}
                        {canRestart && <button onClick={() => handleActionClick('ADVANCE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm">Reiniciar Flujo</button>}
                        {canApprove && <button onClick={() => handleActionClick('APPROVE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm"><CheckCircle size={16} className="mr-2" /> Aprobar</button>}
                        {canReject && <button onClick={() => handleActionClick('REJECT')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-medium border border-red-200"><XCircle size={16} className="mr-2" /> Rechazar</button>}
                     </div>
                </div>
            )}
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit max-h-[600px] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Historial</h3>
            <div className="space-y-6 pl-4 border-l-2 border-slate-100 relative">
                {history.length === 0 ? <p className="text-xs text-slate-400 italic">Sin historial registrado.</p> : history.map(h => (
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

      {showResponseModal && pendingAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                  <div className={`p-5 border-b border-slate-100 flex justify-between items-center ${pendingAction === 'APPROVE' ? 'bg-green-50' : 'bg-red-50'}`}>
                      <h3 className={`text-lg font-bold flex items-center gap-2 ${pendingAction === 'APPROVE' ? 'text-green-800' : 'text-red-800'}`}>{pendingAction === 'APPROVE' ? <CheckCircle size={24} /> : <XCircle size={24} />}{pendingAction === 'APPROVE' ? 'Aprobar Solicitud' : 'Rechazar Solicitud'}</h3>
                      <button onClick={() => setShowResponseModal(false)} className="text-slate-400 hover:text-slate-600"><XCircle size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-lg flex flex-col gap-2"><div className="flex items-start gap-3"><Info size={20} className="text-blue-600 mt-0.5 flex-shrink-0" /><div><p className="text-xs font-bold text-blue-800 uppercase mb-1">Carga de Documento Requerida</p><p className="text-xs text-blue-900 leading-relaxed">{getCoordinatorRuleHint(doc.state, pendingAction)}</p></div></div></div>
                        <div className={`border-2 border-dashed rounded-lg p-6 transition-colors flex flex-col items-center justify-center text-center group relative ${isFileValid ? 'border-green-300 bg-green-50' : fileError.length > 0 ? 'border-red-300 bg-red-50' : 'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}><input type="file" ref={fileInputRef} onChange={handleResponseFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />{responseFile ? (isFileValid ? <div className="text-green-700"><CheckCircle size={32} className="mx-auto mb-2" /><p className="font-semibold text-sm">{responseFile.name}</p><p className="text-xs mt-1">Versión Detectada: <strong>{detectedVersion}</strong></p></div> : <div className="text-red-600"><FileX size={32} className="mx-auto mb-2" /><p className="font-semibold text-sm">{responseFile.name}</p><div className="mt-2 text-xs text-left bg-white/50 p-2 rounded border border-red-200"><ul className="list-disc pl-4 space-y-1">{fileError.map((err, idx) => <li key={idx}>{err}</li>)}</ul></div></div>) : <div className="text-slate-500 group-hover:text-indigo-600"><Upload size={32} className="mx-auto mb-2" /><p className="font-medium text-sm">Click para cargar respuesta</p><p className="text-xs mt-1 text-slate-400">Debe cumplir con la nomenclatura de la etapa.</p></div>}</div>
                        <div className="flex justify-end gap-3 pt-4"><button onClick={() => setShowResponseModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-700 text-sm">Cancelar</button><button onClick={handleSubmitResponse} disabled={!isFileValid} className={`px-4 py-2 rounded-lg text-white text-sm font-bold shadow-sm transition-all flex items-center gap-2 ${pendingAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50 disabled:cursor-not-allowed`}><Save size={16} />Confirmar {pendingAction === 'APPROVE' ? 'Aprobación' : 'Rechazo'}</button></div>
                  </div>
              </div>
          </div>
      )}

      {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-slideUp">
                  <div className="p-5 border-b border-red-100 bg-red-50 flex items-center justify-between"><h3 className="text-lg font-bold text-red-800 flex items-center gap-2"><Trash2 size={24} /> Confirmar Eliminación</h3><button onClick={() => setShowDeleteModal(false)} className="text-red-400 hover:text-red-600"><XCircle size={20} /></button></div>
                  <div className="p-6"><p className="text-slate-700 mb-4">¿Estás seguro de que quieres eliminar permanentemente: <strong>{doc.title}</strong>?</p><div className="flex justify-end gap-3"><button onClick={() => setShowDeleteModal(false)} className="px-4 py-2 text-slate-600">Cancelar</button><button onClick={confirmDelete} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700">Sí, Eliminar</button></div></div>
              </div>
          </div>
      )}
    </div>
  );
};

export default DocumentDetail;
