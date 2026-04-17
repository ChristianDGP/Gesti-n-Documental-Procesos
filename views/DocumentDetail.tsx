import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom';
import { DocumentService, HistoryService, UserService, HierarchyService, ReferentService, normalizeHeader, determineStateFromVersion, formatVersionForDisplay } from '../services/firebaseBackend';
import { Document, User, DocHistory, UserRole, DocState, FullHierarchy, Referent } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename, validateCoordinatorRules, getCoordinatorRuleHint } from '../utils/filenameParser';
import { ArrowLeft, FileText, CheckCircle, XCircle, Activity, Paperclip, Mail, MessageSquare, Send, FileCheck, FileX, Info, ListFilter, Trash2, Lock, Save, PlusCircle, Calendar, Upload, ExternalLink, Clock, User as UserIcon, Users, ArrowRight, History as HistoryIcon, Layers, AlertTriangle, FilePlus, RefreshCw, ChevronRight, UserCheck, Eye, Link as LinkIcon, Wrench, Settings } from 'lucide-react';

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
  const [referentEmails, setReferentEmails] = useState<string[]>([]);
  const [referentNames, setReferentNames] = useState<string[]>([]);
  const [reusableLinks, setReusableLinks] = useState<{ id: string, name: string, latestDocId?: string }[]>([]);
  const [coordinatorEmail, setCoordinatorEmail] = useState<string>('');
  const [authorEmail, setAuthorEmail] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showMasterEdit, setShowMasterEdit] = useState(false);
  const [masterState, setMasterState] = useState<DocState>(DocState.NOT_STARTED);
  const [masterVersion, setMasterVersion] = useState('');
  const [masterProgress, setMasterProgress] = useState(0);
  const [masterPending, setMasterPending] = useState(false);
  const [masterUpdatedAt, setMasterUpdatedAt] = useState('');
  const [masterComment, setMasterComment] = useState('');

  // --- GUARDIAS DE SEGURIDAD CONTRA DUPLICIDAD ---
  const isProcessing = useRef(false);
  const lastExecutionTime = useRef(0);

  const [showResponseModal, setShowResponseModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string[]>([]);
  const [isFileValid, setIsFileValid] = useState(false);
  const [detectedVersion, setDetectedVersion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<string[]>([]);

  // Estado para detectar si hay una versión más nueva
  const [latestDocInfo, setLatestDocInfo] = useState<{ id: string, version: string } | null>(null);

  useEffect(() => {
    if (location.state?.docData) {
        const passedDoc = location.state.docData;
        setDoc(passedDoc);
        if (!passedDoc.id.startsWith('virtual-')) {
             loadAuxiliaryData(passedDoc.id, passedDoc);
        } else {
             setLoading(false);
             if (passedDoc.assignees && passedDoc.assignees.length > 0) {
                 UserService.getAll().then(users => {
                     const names = passedDoc.assignees.map((aid: string) => users.find(u => u.id === aid)?.name).filter((n: string | undefined) => n) as string[];
                     setAssigneeNames(names);
                 });
             }
        }
    } else if (id && !id.startsWith('virtual-')) {
        loadData(id);
    } else {
        setLoading(false);
    }
  }, [id, location.state]);

  const loadAuxiliaryData = async (docId: string, currentDoc: Document) => {
      try {
          const relatedIds = await DocumentService.getRelatedDocIds(
              currentDoc.project!, 
              currentDoc.microprocess || currentDoc.title.split(' - ')[0], 
              currentDoc.docType!
          );

          const [h, allUsers, hierarchy, allReferents, allDocs] = await Promise.all([
              HistoryService.getHistory(relatedIds),
              UserService.getAll(),
              HierarchyService.getFullHierarchy(),
              ReferentService.getAll(),
              DocumentService.getAll()
          ]);
          
          setHistory(h);

          // Detectar si este documento es el más reciente de su grupo
          const relatedDocs = allDocs.filter(d => relatedIds.includes(d.id));
          if (relatedDocs.length > 1) {
              const latest = [...relatedDocs].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
              if (latest && latest.id !== currentDoc.id) {
                  setLatestDocInfo({ id: latest.id, version: latest.version });
              } else {
                  setLatestDocInfo(null);
              }
          } else {
              setLatestDocInfo(null);
          }

          const coordinator = allUsers.find(u => ['COORDINATOR', 'COORDINADOR', 'ADMIN'].includes((u.role || '').toString().toUpperCase()));
          if (coordinator) setCoordinatorEmail(coordinator.email);
          const author = allUsers.find(u => u.id === currentDoc.authorId);
          if (author) setAuthorEmail(author.email);
          
          const matrix = resolveMatrixData(currentDoc, hierarchy, allReferents);
          setReferentEmails(matrix.referentEmails);
          setReferentNames(matrix.referentNames);
          
          if (matrix.reusableLinks && matrix.reusableLinks.length > 0) {
              const links = matrix.reusableLinks.map(id => {
                  const reuNode = Object.values(hierarchy['REU'] || {}).flatMap(m => Object.values(m)).flatMap(p => p).find(n => n.docId === id);
                  const latestReuDoc = allDocs.filter(d => d.project === 'REU' && normalizeHeader(d.microprocess || '') === normalizeHeader(reuNode?.name || '')).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())[0];
                  return {
                      id,
                      name: reuNode?.name || 'Desconocido',
                      latestDocId: latestReuDoc?.id
                  };
              });
              setReusableLinks(links);
          } else {
              setReusableLinks([]);
          }

          if (matrix.assignees.length > 0) {
              const names = matrix.assignees.map(aid => allUsers.find(u => u.id === aid)?.name).filter(n => n) as string[];
              setAssigneeNames(names);
              const emails = matrix.assignees.map(aid => allUsers.find(u => u.id === aid)?.email).filter(e => e) as string[];
              setAssigneeEmails(emails);
          }
          setLoading(false);
      } catch (e) {
          console.error("Error loading aux data", e);
          setLoading(false);
      }
  };

  const resolveMatrixData = (d: Document, hierarchy: FullHierarchy, allReferents: Referent[]) => {
      let resolvedAssigneeIds = d.assignees || [];
      let resolvedReferentEmails: string[] = [];
      let resolvedReferentNames: string[] = [];
      let resolvedReusableLinks: string[] = [];

      if (d.project && d.microprocess) {
           const targetMicro = normalizeHeader(d.microprocess);
           const targetProject = normalizeHeader(d.project);
           let node: any = null;
           for (const projKey of Object.keys(hierarchy)) {
               if (normalizeHeader(projKey) === targetProject) {
                   for (const macroKey of Object.keys(hierarchy[projKey])) {
                       for (const procKey of Object.keys(hierarchy[projKey][macroKey])) {
                           const found = hierarchy[projKey][macroKey][procKey].find(n => normalizeHeader(n.name) === targetMicro);
                           if (found) { node = found; break; }
                       }
                       if (node) break;
                   }
               }
               if (node) break;
           }
           
           // Si encontramos el nodo en la matriz, usamos sus referentes vinculados
           if (node?.assignees && (resolvedAssigneeIds.length === 0 || d.authorName.includes('Sistema'))) resolvedAssigneeIds = node.assignees;
           if (node?.referentIds && node.referentIds.length > 0) {
               const matches = allReferents.filter(r => node.referentIds.includes(r.id));
               resolvedReferentEmails = matches.map(r => r.email);
               resolvedReferentNames = matches.map(r => r.name);
           }
           if (node?.reusableLinks) {
               resolvedReusableLinks = node.reusableLinks;
           }
      }
      return { 
          assignees: resolvedAssigneeIds, 
          referentEmails: resolvedReferentEmails, 
          referentNames: resolvedReferentNames,
          reusableLinks: resolvedReusableLinks
      };
  };

  const loadData = async (docId: string) => {
    setLoading(true);
    try {
        const d = await DocumentService.getById(docId);
        if (d) {
            setDoc(d);
            // Clear location state to ensure fresh data and prevent reverts on navigation
            if (location.state?.docData) {
                navigate(location.pathname, { replace: true, state: {} });
            }
            await loadAuxiliaryData(docId, d);
        } else {
            setDoc(null);
            setLoading(false);
        }
    } catch (error) {
        console.error("Error loading document data:", error);
        setDoc(null);
        setLoading(false);
    }
  };

  const handleSyncState = async () => {
      if (!doc || syncing) return;
      setSyncing(true);
      try {
          await DocumentService.syncMetadata(doc.id, user);
          await loadData(doc.id);
      } catch (e: any) {
          alert("Error al sincronizar: " + e.message);
      } finally {
          setSyncing(false);
      }
  };

  const getDocLink = () => `${window.location.origin}/#/doc/${doc?.id}`;

  const handleNotifyReferent = () => {
      if (!doc || referentEmails.length === 0) {
          alert("No hay correos de referentes vinculados a este proceso en la matriz.");
          return;
      }
      const displayVersion = formatVersionForDisplay(doc.version);
      const subject = encodeURIComponent(`Revisión Técnica: ${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}`);
      const greeting = referentNames.length > 0 ? `Estimada/o ${referentNames.join(', ')}` : 'Estimados Referentes';
      const body = encodeURIComponent(`${greeting},\nSe solicita su validación para el documento: ${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}\nQuedamos atentos a sus observaciones.\n\nSaludos,\n${user.name}`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(referentEmails.join(','))}&su=${subject}&body=${body}`, '_blank');
  };

  const handleNotifyCoordinator = () => {
    if (!doc || !coordinatorEmail) { alert(`Aviso: No se ha detectado correo del coordinador.`); return; }
    const displayVersion = formatVersionForDisplay(doc.version);
    const subject = encodeURIComponent(`Solicitud de Revisión: ${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}`);
    const body = encodeURIComponent(`Estimado,\nPara su revisión, he cargado el documento "${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}".\n\nSaludos,\n${user.name}`);
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${coordinatorEmail}&su=${subject}&body=${body}`, '_blank');
  };

  const triggerAutoEmail = (action: 'APPROVE' | 'REJECT', oldState: DocState, newState: DocState, newVersionStr: string, responseComment: string) => {
    if (!doc || !authorEmail) return;
    
    // Omitir si el estado resultante es Iniciado o En Proceso (según solicitud de usuario)
    if (newState === DocState.INITIATED || newState === DocState.IN_PROCESS) return;

    const displayVersion = formatVersionForDisplay(newVersionStr);
    
    // CASO ESPECIAL A: De Revisión Interna a Referente (Mantiene lógica anterior pero unificada)
    if (action === 'APPROVE' && oldState === DocState.INTERNAL_REVIEW && newState === DocState.SENT_TO_REFERENT) {
        if (referentEmails.length === 0) return;
        const subject = encodeURIComponent(`Revisión Técnica: ${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}`);
        const greeting = referentNames.length > 0 ? `Estimada/o ${referentNames.join(', ')}` : 'Estimados Referentes';
        const body = encodeURIComponent(`${greeting},\nSe solicita su validación para el documento: ${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}\nQuedamos atentos a sus observaciones.\n\nSaludos,\n${user.name}`);
        window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(referentEmails.join(','))}&su=${subject}&body=${body}`, '_blank');
        return;
    }

    // CASO GENERAL: Notificar al Analista (Autor) sobre el resultado de la revisión
    const actionLabel = action === 'APPROVE' ? 'APROBADO' : 'RECHAZADO';
    const subject = encodeURIComponent(`Resultado de Revisión: ${actionLabel} - ${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}`);
    
    let bodyText = `Estimado/a,\n\nSe informa que el documento "${doc.project} - ${doc.microprocess} - ${doc.docType || ''} - ${displayVersion}" ha sido ${actionLabel}.\n\n`;
    
    if (responseComment) {
        bodyText += `Observaciones del Coordinador:\n"${responseComment}"\n\n`;
    }
    
    bodyText += `Estado actual: ${STATE_CONFIG[newState].label}\n`;
    bodyText += `Puede revisar el detalle aquí: ${getDocLink()}\n\n`;
    bodyText += `Saludos,\n${user.name}`;

    const body = encodeURIComponent(bodyText);
    const ccList = assigneeEmails.filter(e => e !== authorEmail).join(',');
    
    window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${authorEmail}${ccList ? `&cc=${ccList}` : ''}&su=${subject}&body=${body}`, '_blank');
  };

  const handleActionClick = async (action: 'ADVANCE' | 'APPROVE' | 'REJECT' | 'COMMENT', e?: React.MouseEvent) => {
      if (e) { e.preventDefault(); e.stopPropagation(); }

      const now = Date.now();
      if (now - lastExecutionTime.current < 3000) return;
      
      if (!doc || isProcessing.current) return;
      isProcessing.current = true;
      lastExecutionTime.current = now;
      
      if (action === 'COMMENT') {
          const currentComment = comment.trim();
          if (!currentComment) { 
              alert('Escribe una observación.'); 
              isProcessing.current = false; 
              return; 
          }
          
          setActionLoading(true);
          setComment(''); 
          
          try {
              await DocumentService.transitionState(doc.id, user, 'COMMENT', currentComment);
              await loadData(doc.id);
          } catch (err: any) {
              alert('Error al guardar: ' + err.message);
              setComment(currentComment);
          } finally {
              isProcessing.current = false;
              setActionLoading(false);
          }
          return;
      }
      
      if (action === 'ADVANCE') { 
          setActionLoading(true);
          try {
              await DocumentService.transitionState(doc.id, user, 'ADVANCE', 'Gestión de flujo.');
              await loadData(doc.id);
          } finally {
              isProcessing.current = false;
              setActionLoading(false);
          }
          return; 
      }
      
      if (action === 'APPROVE' || action === 'REJECT') {
          if (action === 'REJECT' && !comment.trim()) { 
              alert('Agrega una observación para el rechazo.'); 
              isProcessing.current = false; 
              return; 
          }
          setPendingAction(action); setResponseFile(null); setFileError([]); setIsFileValid(false); setDetectedVersion(''); setShowResponseModal(true);
          isProcessing.current = false; 
      }
  };

  const handleResponseFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && doc && pendingAction) {
          const f = e.target.files[0]; setResponseFile(f);
          const result = parseDocumentFilename(f.name, doc.project, doc.microprocess, doc.docType);
          if (!result.valido) { setFileError(result.errores); setIsFileValid(false); return; }
          const rules = validateCoordinatorRules(f.name, doc.version, doc.state, pendingAction);
          if (!rules.valid) { setFileError([rules.error || 'Error de validación.']); setIsFileValid(false); return; }
          setIsFileValid(true); setFileError([]); setDetectedVersion(result.nomenclatura || '');
      }
  };

  const handleSubmitResponse = async (e: React.MouseEvent) => {
      e.preventDefault(); e.stopPropagation();
      
      const now = Date.now();
      if (now - lastExecutionTime.current < 3000) return;
      if (!doc || !pendingAction || isProcessing.current) return;
      
      if (!responseFile || !isFileValid) {
          alert(`Debe cargar un archivo válido para ${pendingAction === 'APPROVE' ? 'aprobar' : 'rechazar'}.`);
          return;
      }
      
      isProcessing.current = true;
      lastExecutionTime.current = now;
      setActionLoading(true);
      setShowResponseModal(false); 
      
      const oldState = doc.state;
      const newState = determineStateFromVersion(detectedVersion).state;

      try {
        await DocumentService.transitionState(
            doc.id, 
            user, 
            pendingAction, 
            comment || `Gestión realizada.`, 
            responseFile, 
            detectedVersion
        );
        
        // Levantar pantalla de Gmail para notificar el resultado (Aprobación o Rechazo)
        triggerAutoEmail(pendingAction, oldState, newState, detectedVersion, comment);

        setComment('');
        await loadData(doc.id);
      } catch(err: any) {
          alert('Error: ' + err.message);
      } finally {
        isProcessing.current = false;
        setActionLoading(false);
      }
  };

  const handleDeleteSelectedHistory = async () => {
      if (selectedHistoryIds.length === 0 || !doc) return;
      setActionLoading(true);
      try {
          await HistoryService.delete(selectedHistoryIds);
          setSelectedHistoryIds([]);
          await loadData(doc.id);
      } catch (e: any) {
          alert("Error al eliminar registros: " + e.message);
      } finally {
          setActionLoading(false);
      }
  };

  const handleRevertAction = async () => {
      if (!doc || isProcessing.current) return;
      setShowDeleteModal(false);
      
      isProcessing.current = true;
      setLoading(true);
      
      try {
          const wasDeleted = await DocumentService.revertLastTransition(doc.id);
          if (wasDeleted) {
              navigate('/', { replace: true });
          } else {
              await loadData(doc.id);
          }
      } catch (e: any) {
          alert("Error al revertir: " + e.message);
          setLoading(false);
      } finally {
          isProcessing.current = false;
      }
  };

  const handleNewRequestPrefilled = () => {
      if (!doc) return;
      navigate('/new', { 
          state: { 
              prefill: { 
                  project: doc.project, 
                  macro: doc.macroprocess, 
                  process: doc.process, 
                  micro: doc.microprocess, 
                  docType: doc.docType 
              } 
          } 
      });
  };

  const handleMasterUpdate = async () => {
      const canEditMaster = user.role === UserRole.ADMIN || user.canEditMasterData;
      if (!doc || !canEditMaster) return;
      if (!masterComment.trim()) {
          alert("Debe ingresar un comentario para la edición maestra.");
          return;
      }
      setActionLoading(true);
      try {
          await DocumentService.masterUpdate(doc.id, user, {
              state: masterState,
              version: masterVersion,
              progress: masterProgress,
              hasPendingRequest: masterPending,
              updatedAt: masterUpdatedAt ? new Date(masterUpdatedAt).toISOString() : undefined,
              comment: masterComment
          });
          setShowMasterEdit(false);
          setMasterComment('');
          alert("Cambios maestros aplicados con éxito. Refrescando datos...");
          await loadData(doc.id);
      } catch (e: any) {
          console.error("Error completo en edición maestra:", e);
          alert("Error en edición maestra: " + e.message);
      } finally {
          setActionLoading(false);
      }
  };

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return 'Fecha no disponible';
    return date.toLocaleString('es-CL', { 
        day: '2-digit', month: '2-digit', year: 'numeric', 
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        hour12: true 
    });
  };

  if (loading && !doc) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><RefreshCw size={24} className="animate-spin mb-2" />Cargando documento...</div>;
  if (!doc) return <div className="p-12 text-center text-slate-500">No se encontró el documento.</div>;

  const config = STATE_CONFIG[doc.state];
  const isGuest = user.role === UserRole.GUEST;
  const isAssignee = doc.assignees && doc.assignees.includes(user.id);
  const isAuthor = doc.authorId === user.id;
  const isAnalystAssigned = user.role === UserRole.ANALYST && (isAssignee || isAuthor);
  const roleUpper = (user.role || '').toString().toUpperCase();
  const isCoordinatorOrAdmin = roleUpper === 'ADMIN' || roleUpper === 'COORDINATOR' || roleUpper === 'COORDINADOR';
  const isAdmin = roleUpper === 'ADMIN';
  const canEditMaster = isAdmin || user.canEditMasterData;
  const canEdit = !isGuest && (isAnalystAssigned || isCoordinatorOrAdmin);
  const isDocActive = doc.state !== DocState.APPROVED;

  // NUEVA LÓGICA DE DETECCIÓN DE INCONSISTENCIA (INCLUYE PENDING STATUS)
  const expectedInfo = determineStateFromVersion(doc.version);
  const expectedState = expectedInfo.state;
  const expectedPending = [
      DocState.INTERNAL_REVIEW, 
      DocState.SENT_TO_REFERENT, 
      DocState.REFERENT_REVIEW, 
      DocState.SENT_TO_CONTROL, 
      DocState.CONTROL_REVIEW
  ].includes(expectedState);
  
  const isInconsistent = !doc.id.startsWith('virtual-') && (doc.state !== expectedState || doc.hasPendingRequest !== expectedPending);

  const canReview = isCoordinatorOrAdmin && [DocState.INTERNAL_REVIEW, DocState.REFERENT_REVIEW, DocState.CONTROL_REVIEW, DocState.SENT_TO_REFERENT, DocState.SENT_TO_CONTROL].includes(doc.state);

  // Determinamos si la descripción es el texto automático generado por el sistema
  const isAutoDescription = doc.description && doc.description.startsWith('Carga de archivo:');

  return (
    <div className="max-w-6xl mx-auto space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-500 hover:text-slate-800 text-sm font-medium transition-colors">
            <ArrowLeft size={16} className="mr-1" /> Volver
        </button>
        <div className="flex items-center gap-2">
            {user.role === UserRole.ADMIN && !doc.id.startsWith('virtual-') && (
                <button type="button" onClick={() => setShowDeleteModal(true)} disabled={actionLoading} className="flex items-center text-red-500 hover:text-red-700 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors shadow-sm disabled:opacity-50">
                    <Trash2 size={14} className="mr-1.5" /> Eliminar
                </button>
            )}
        </div>
      </div>

      {/* BANNER DE VERSIÓN OBSOLETA */}
      {latestDocInfo && (
          <div className="bg-indigo-600 border-l-4 border-white p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 animate-fadeIn shadow-lg text-white">
              <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-lg">
                      <HistoryIcon size={24} />
                  </div>
                  <div>
                      <p className="text-sm font-black uppercase tracking-tighter">Estás viendo una versión antigua</p>
                      <p className="text-xs opacity-90 font-medium">Existe una versión más reciente para este microproceso: <span className="font-black bg-white/20 px-1 rounded">{formatVersionForDisplay(latestDocInfo.version)}</span></p>
                  </div>
              </div>
              <button 
                onClick={() => navigate(`/doc/${latestDocInfo.id}`)} 
                className="flex items-center gap-2 px-6 py-2 bg-white text-indigo-600 rounded-lg text-xs font-black uppercase tracking-widest hover:bg-slate-50 transition-all shadow-md active:scale-95"
              >
                  Ir a versión actual
                  <ChevronRight size={14} />
              </button>
          </div>
      )}

      {/* INCONSISTENCY ALERT - SOLO PARA ADMIN */}
      {isInconsistent && isAdmin && (
          <div className="bg-amber-50 border-l-4 border-amber-400 p-4 rounded-lg flex flex-col md:flex-row items-center justify-between gap-4 animate-fadeIn shadow-sm">
              <div className="flex items-center gap-3">
                  <AlertTriangle className="text-amber-500 shrink-0" size={24} />
                  <div>
                      <p className="text-sm font-black text-amber-900 uppercase tracking-tighter">Inconsistencia Detectada en Metadatos</p>
                      <p className="text-xs text-amber-800 font-medium">
                          La versión "{formatVersionForDisplay(doc.version)}" no coincide con el estado o la alerta de gestión actual.
                      </p>
                  </div>
              </div>
              <button 
                onClick={handleSyncState} 
                disabled={syncing}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-xs font-black uppercase tracking-widest hover:bg-amber-700 transition-all shadow-md active:scale-95 disabled:opacity-50"
              >
                  {syncing ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  Sincronizar Estado
              </button>
          </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 mb-6">
            <div>
                <div className="flex items-center gap-2 mb-2">
                    {doc.project && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-white tracking-wider">{doc.project}</span>}
                    {doc.docType && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700 border border-indigo-200 tracking-wider">{doc.docType}</span>}
                    {doc.hasPendingRequest && <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-blue-500 text-white animate-pulse tracking-wider">Solicitud Pendiente</span>}
                </div>
                <h1 className="text-2xl font-black text-slate-900 leading-tight">{doc.title}</h1>
                {/* Solo mostramos la descripción si NO es el texto automático */}
                {!isAutoDescription && doc.description && (
                  <p className="text-slate-500 text-sm font-medium mt-1">{doc.description}</p>
                )}
            </div>
            <div className={`px-3 py-2 rounded-lg text-xs font-bold tracking-wide flex items-center self-start border shadow-sm ${config.color}`}>
                <Activity size={14} className="mr-2" />{config.label}
            </div>
        </div>
        
        {/* GRILLA DE METADATOS ACTUALIZADA CON REFERENTES */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-6 text-[11px] border-t border-slate-100 pt-5">
            <div>
                <p className="text-slate-400 uppercase font-bold tracking-widest mb-1.5 flex items-center gap-1">
                    <UserIcon size={12} /> Analistas
                </p>
                {assigneeNames.length > 0 ? assigneeNames.map((name, i) => <p key={i} className="font-bold text-slate-700">{name}</p>) : <p className="font-bold text-slate-700">{doc.authorName || 'Sin Asignar'}</p>}
            </div>
            
            <div>
                <p className="text-slate-400 uppercase font-bold tracking-widest mb-1.5 flex items-center gap-1">
                    <UserCheck size={12} /> Referentes
                </p>
                {referentNames.length > 0 ? (
                    referentNames.map((name, i) => <p key={i} className="font-bold text-indigo-700">{name}</p>)
                ) : (
                    <p className="font-medium text-slate-400 italic">No asignados</p>
                )}
            </div>

            <div>
                <p className="text-slate-400 uppercase font-bold tracking-widest mb-1.5 flex items-center gap-1">
                    <Layers size={12} /> Versión Actual
                </p>
                <p className="font-mono text-slate-800 font-black text-xs">{formatVersionForDisplay(doc.version)}</p>
            </div>
            
            <div>
                <p className="text-slate-400 uppercase font-bold tracking-widest mb-1.5 flex items-center gap-1">
                    <Activity size={12} /> Progreso
                </p>
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 rounded-full h-2 min-w-[80px] overflow-hidden border border-slate-200">
                        <div className="bg-indigo-600 h-full rounded-full shadow-[0_0_8px_rgba(79,70,229,0.3)] transition-all duration-500" style={{ width: `${doc.progress}%` }}></div>
                    </div>
                    <span className="font-black text-slate-800">{doc.progress}%</span>
                </div>
            </div>
            
            <div>
                <p className="text-slate-400 uppercase font-bold tracking-widest mb-1.5 flex items-center gap-1">
                    <Clock size={12} /> Actualizado
                </p>
                <p className="font-bold text-slate-700">{doc.updatedAt && doc.updatedAt !== new Date(0).toISOString() ? new Date(doc.updatedAt).toLocaleDateString('es-CL') : 'Sin actividad'}</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        <div className="lg:col-span-2 space-y-6">
            {(isAnalystAssigned || isCoordinatorOrAdmin) && isDocActive && !isGuest && (
                 <div className="flex justify-start">
                    <button type="button" onClick={handleNewRequestPrefilled} disabled={actionLoading} className="flex items-center text-white px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-md transition-all active:scale-95 text-[11px] font-black uppercase tracking-widest disabled:opacity-50">
                        <FilePlus size={16} className="mr-2" /> NUEVA SOLICITUD / CARGA
                    </button>
                </div>
            )}

            {isGuest && (
              <div className="bg-slate-100 border-l-4 border-slate-400 p-4 flex gap-3 text-xs text-slate-600 font-bold items-center shadow-sm">
                <Eye size={20} className="text-slate-500" />
                Modo Consulta: Usted tiene permisos de solo lectura. No puede realizar gestiones sobre este documento.
              </div>
            )}

            {!canEdit && !isGuest && <div className="bg-amber-50 border-l-4 border-amber-400 p-4 flex gap-3 text-xs text-amber-800 font-medium"><Lock size={18} className="text-amber-500" /> Vista de solo lectura. No tiene permisos de gestión en este documento.</div>}
            
            {/* DOCUMENTOS REUTILIZABLES VINCULADOS */}
            {reusableLinks.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                    <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2 uppercase text-[11px] tracking-widest">
                        <LinkIcon size={14} className="text-indigo-600" /> Componentes Reutilizables (REU)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {reusableLinks.map(link => (
                            <div key={link.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-xl hover:border-indigo-200 transition-all group">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center border border-slate-200 text-indigo-500 shadow-sm group-hover:shadow-md transition-all">
                                        <FileText size={20} />
                                    </div>
                                    <div>
                                        <p className="text-sm font-bold text-slate-700">{link.name}</p>
                                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-tighter">Proyecto REU</p>
                                    </div>
                                </div>
                                {link.latestDocId ? (
                                    <Link 
                                        to={`/doc/${link.latestDocId}`} 
                                        className="p-2 bg-white border border-slate-200 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-all shadow-sm"
                                        title="Ver Documento"
                                    >
                                        <ExternalLink size={16} />
                                    </Link>
                                ) : (
                                    <span className="text-[10px] font-bold text-slate-400 italic px-2 py-1 bg-slate-100 rounded border border-slate-200">Sin Archivo</span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {canEdit && (
                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                     <h3 className="font-bold text-slate-800 mb-5 flex items-center gap-2 uppercase text-[11px] tracking-widest">
                        Acciones de Flujo
                     </h3>
                     
                     <textarea 
                        className="w-full p-4 border border-slate-200 rounded-xl text-sm mb-5 outline-none focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 bg-slate-50/30 transition-all placeholder:text-slate-400" 
                        rows={4} 
                        placeholder="Escriba aquí sus observaciones o comentarios técnicos..." 
                        value={comment} 
                        onChange={(e) => setComment(e.target.value)} 
                        disabled={actionLoading}
                     />
                     
                     <div className="flex flex-wrap gap-3">
                        <button 
                            type="button"
                            onClick={(e) => handleActionClick('COMMENT', e)} 
                            disabled={actionLoading || !comment.trim()} 
                            className="flex items-center px-5 py-2.5 bg-[#1e293b] text-white rounded-lg hover:bg-slate-800 text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50"
                        >
                            <MessageSquare size={18} className="mr-2" /> {actionLoading ? 'Guardando...' : 'Guardar Observación'}
                        </button>

                        {isCoordinatorOrAdmin && referentEmails.length > 0 && [DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(doc.state) && (
                            <button type="button" onClick={handleNotifyReferent} disabled={actionLoading} className="flex items-center px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50">
                                <Users size={18} className="mr-2 text-indigo-500" /> Notificar Referente
                            </button>
                        )}

                        {isAnalystAssigned && isDocActive && (
                             <button type="button" onClick={handleNotifyCoordinator} disabled={actionLoading} className="flex items-center px-5 py-2.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-sm font-bold shadow-sm transition-all active:scale-95 disabled:opacity-50">
                                <Mail size={18} className="mr-2 text-indigo-500" /> Notificar Coordinador
                            </button>
                        )}

                        {canReview && isDocActive && (
                            <button 
                                type="button"
                                onClick={(e) => handleActionClick('APPROVE', e)} 
                                disabled={actionLoading} 
                                className="flex items-center px-6 py-2.5 bg-[#22c55e] text-white rounded-lg hover:bg-green-600 text-sm font-bold shadow-md shadow-green-100 transition-all active:scale-95 disabled:opacity-50"
                            >
                                <CheckCircle size={18} className="mr-2" /> Aprobar
                            </button>
                        )}

                        {canReview && isDocActive && (
                            <button 
                                type="button"
                                onClick={(e) => handleActionClick('REJECT', e)} 
                                disabled={actionLoading} 
                                className="flex items-center px-5 py-2.5 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg text-sm font-bold border border-red-100 transition-all active:scale-95 disabled:opacity-50"
                            >
                                <XCircle size={18} className="mr-2" /> Rechazar
                            </button>
                        )}
                     </div>
                </div>
            )}

            {/* EDICIÓN MAESTRA PARA ADMINISTRADORES O USUARIOS CON PERMISO ESPECIAL */}
            {canEditMaster && (
                <div className={`bg-slate-900 rounded-xl shadow-lg border border-slate-800 text-white overflow-hidden relative transition-all duration-300 ${showMasterEdit ? 'p-6' : 'p-4'}`}>
                    <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
                        <Settings size={showMasterEdit ? 120 : 60} className="transition-all" />
                    </div>
                    
                    <div 
                        className="flex items-center justify-between relative z-10 cursor-pointer group"
                        onClick={() => {
                            if (!showMasterEdit) {
                                setMasterState(doc.state);
                                setMasterVersion(doc.version);
                                setMasterProgress(doc.progress);
                                setMasterPending(doc.hasPendingRequest || false);
                                setMasterUpdatedAt(doc.updatedAt ? doc.updatedAt.split('.')[0].slice(0, 16) : '');
                            }
                            setShowMasterEdit(!showMasterEdit);
                        }}
                    >
                        <div className="flex items-center gap-3">
                            <div className={`p-2 bg-indigo-500 rounded-lg transition-all ${showMasterEdit ? 'scale-100' : 'scale-90'}`}>
                                <Wrench size={showMasterEdit ? 20 : 16} className="text-white" />
                            </div>
                            <div>
                                <h3 className={`font-black uppercase tracking-widest transition-all ${showMasterEdit ? 'text-sm' : 'text-xs'}`}>Edición Maestra</h3>
                                {showMasterEdit && (
                                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter animate-fadeIn">Control total de metadatos sin carga de archivos</p>
                                )}
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            {!showMasterEdit && <span className="text-[9px] font-black uppercase tracking-widest text-slate-500 group-hover:text-indigo-400 transition-colors">Haga clic para expandir</span>}
                            <button 
                                type="button"
                                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${showMasterEdit ? 'bg-slate-700 text-slate-300' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20'}`}
                            >
                                {showMasterEdit ? 'Cancelar' : 'Activar Editor'}
                            </button>
                        </div>
                    </div>

                    {showMasterEdit && (
                        <div className="mt-6 space-y-5 animate-fadeIn relative z-10">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Estado del Documento</label>
                                    <select 
                                        value={masterState} 
                                        onChange={(e) => {
                                            const newState = e.target.value as DocState;
                                            setMasterState(newState);
                                            // Vincular progreso al estado seleccionado automáticamente
                                            const config = STATE_CONFIG[newState];
                                            if (config) {
                                                setMasterProgress(config.progress);
                                            }
                                        }}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        {Object.entries(DocState).map(([key, value]) => (
                                            <option key={value} value={value}>{STATE_CONFIG[value as DocState]?.label || value}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Progreso (%)</label>
                                    <input 
                                        type="number" 
                                        min="0" max="100"
                                        value={masterProgress} 
                                        onChange={(e) => setMasterProgress(parseInt(e.target.value))}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Versión (Nomenclatura)</label>
                                    <input 
                                        type="text" 
                                        value={masterVersion} 
                                        onChange={(e) => setMasterVersion(e.target.value)}
                                        placeholder="Ej: 0.1, v1.0, v1.0.1AR"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alerta de Gestión</label>
                                    <div className="flex items-center h-9">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                checked={masterPending} 
                                                onChange={(e) => setMasterPending(e.target.checked)}
                                                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
                                            />
                                            <span className="text-xs font-bold text-slate-300">Solicitud Pendiente</span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Fecha "Actualizado"</label>
                                    <input 
                                        type="datetime-local" 
                                        value={masterUpdatedAt} 
                                        onChange={(e) => setMasterUpdatedAt(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-white"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Justificación del Cambio</label>
                                    <textarea 
                                        value={masterComment}
                                        onChange={(e) => setMasterComment(e.target.value)}
                                        placeholder="Explique por qué está modificando estos valores manualmente..."
                                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 min-h-[80px]"
                                    />
                                </div>
                            </div>

                            <div className="flex justify-end pt-2">
                                <button 
                                    onClick={handleMasterUpdate}
                                    disabled={actionLoading || !masterComment.trim()}
                                    className="flex items-center gap-2 px-6 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-500/20 disabled:opacity-50 active:scale-95"
                                >
                                    <Save size={16} />
                                    {actionLoading ? 'Guardando...' : 'Aplicar Cambios Maestros'}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
        
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col min-h-[550px]">
            <div className="flex justify-between items-center mb-6 border-b border-slate-100 pb-4">
                <div className="flex items-center gap-3">
                    {isAdmin && history.length > 0 && (
                        <input 
                            type="checkbox" 
                            checked={history.length > 0 && selectedHistoryIds.length === history.length}
                            onChange={() => {
                                if (selectedHistoryIds.length === history.length) setSelectedHistoryIds([]);
                                else setSelectedHistoryIds(history.map(h => h.id));
                            }}
                            className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                        />
                    )}
                    <h3 className="font-bold text-slate-800 text-sm">Historial Completo</h3>
                </div>
                {isAdmin && selectedHistoryIds.length > 0 && (
                    <button 
                        onClick={handleDeleteSelectedHistory}
                        disabled={actionLoading}
                        className="text-red-500 hover:text-red-700 text-[11px] font-bold uppercase tracking-wider px-3 py-1.5 bg-red-50 hover:bg-red-100 rounded-lg border border-red-100 transition-colors shadow-sm disabled:opacity-50"
                    >
                        Eliminar ({selectedHistoryIds.length})
                    </button>
                )}
            </div>
            
            <div className="flex-1 overflow-y-auto pr-3 custom-scrollbar">
                {history.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-slate-300">
                      <Clock size={40} className="mb-3 opacity-20" />
                      <p className="text-xs font-bold uppercase tracking-widest">Sin registros</p>
                  </div>
                ) : (
                  <div className="space-y-10 pl-5 border-l-[1.5px] border-slate-100 relative ml-2">
                      {history.map((h) => (
                          <div key={h.id} className="relative group animate-fadeIn flex items-start gap-3">
                              {isAdmin && (
                                  <input 
                                      type="checkbox" 
                                      checked={selectedHistoryIds.includes(h.id)}
                                      onChange={(e) => {
                                          if (e.target.checked) setSelectedHistoryIds([...selectedHistoryIds, h.id]);
                                          else setSelectedHistoryIds(selectedHistoryIds.filter(id => id !== h.id));
                                      }}
                                      className="mt-1 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                                  />
                              )}
                              <div className="relative">
                                  <div className="absolute -left-[35px] top-2 h-3 w-3 rounded-full bg-slate-300 border-2 border-white shadow-sm ring-4 ring-white group-hover:bg-indigo-500 transition-colors"></div>
                                  <div className="text-[11px] font-bold text-slate-400 mb-1 flex items-center gap-1.5 uppercase tracking-tighter">
                                      {formatDate(h.timestamp)}
                                  </div>
                                  <div className="text-[13px] text-slate-700 mb-2">
                                      <span className="font-black text-slate-900">{h.action}</span>
                                      <span className="mx-1.5 font-medium text-slate-400 text-xs">por</span>
                                      <span className="font-black text-slate-800">{h.userName}</span>
                                  </div>
                                  <div className="mb-2.5">
                                      <span className="inline-block px-2 py-0.5 rounded bg-slate-100 text-slate-500 text-[10px] font-black border border-slate-200 uppercase tracking-tighter">
                                          Versión: {formatVersionForDisplay(h.version || '-')}
                                      </span>
                                  </div>
                                  {h.comment && (
                                      <div className="bg-slate-50/80 border border-slate-100 rounded-lg p-3.5 text-xs italic text-slate-600 leading-relaxed shadow-sm relative overflow-hidden">
                                          <div className="absolute top-0 left-0 w-1 h-full bg-slate-200/50"></div>
                                          "{h.comment}"
                                      </div>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
                )}
            </div>
            
            {doc.id.startsWith('virtual-') && (
              <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100 flex items-start gap-3 shadow-sm">
                  <Info className="text-amber-600 flex-shrink-0" size={18} />
                  <p className="text-xs text-amber-800 font-bold leading-tight">Este microproceso aún no posee documentos cargados (Estado Pendiente).</p>
              </div>
            )}
        </div>
      </div>

      {showResponseModal && pendingAction && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-100">
                  <div className={`p-5 border-b border-slate-100 flex justify-between items-center ${pendingAction === 'APPROVE' ? 'bg-green-50' : 'bg-red-50'}`}>
                      <h3 className={`text-lg font-black flex items-center gap-2 ${pendingAction === 'APPROVE' ? 'text-green-800' : 'text-red-800'}`}>{pendingAction === 'APPROVE' ? <CheckCircle size={24} /> : <XCircle size={24} />}{pendingAction === 'APPROVE' ? 'Aprobar Solicitud' : 'Rechazar Solicitud'}</h3>
                      <button type="button" onClick={() => setShowResponseModal(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><XCircle size={20} /></button>
                  </div>
                  <div className="p-6 space-y-4">
                        <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl flex flex-col gap-2">
                            <div className="flex items-start gap-3">
                                <Info size={20} className="text-blue-600 mt-0.5 flex-shrink-0" />
                                <div>
                                    <p className="text-xs font-black text-blue-800 uppercase mb-1">Carga de Documento Priorizada</p>
                                    <p className="text-xs text-blue-900 leading-relaxed font-bold">{getCoordinatorRuleHint(doc.state, pendingAction, doc.project)}</p>
                                </div>
                            </div>
                        </div>
                        
                        <div className={`border-2 border-dashed rounded-2xl p-8 transition-all flex flex-col items-center justify-center text-center group relative ${isFileValid ? 'border-green-400 bg-green-50/50' : fileError.length > 0 ? 'border-red-400 bg-red-50/50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}`}>
                            <input type="file" ref={fileInputRef} onChange={handleResponseFileSelect} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" disabled={actionLoading} />
                            {responseFile ? (
                                isFileValid ? (
                                    <div className="text-green-700 animate-fadeIn">
                                        <CheckCircle size={40} className="mx-auto mb-3" />
                                        <p className="font-black text-sm">{responseFile.name}</p>
                                        <p className="text-[10px] mt-1 font-black uppercase opacity-60">Versión Detectada: {formatVersionForDisplay(detectedVersion)}</p>
                                    </div>
                                ) : (
                                    <div className="text-red-600 animate-fadeIn">
                                        <FileX size={40} className="mx-auto mb-3" />
                                        <p className="font-black text-sm">{responseFile.name}</p>
                                        <div className="mt-3 text-xs text-left bg-white p-2 rounded-lg border border-red-100">
                                            <ul className="list-disc pl-4 space-y-1 font-bold">{fileError.map((err, idx) => <li key={idx}>{err}</li>)}</ul>
                                        </div>
                                    </div>
                                )
                            ) : (
                                <div className="text-slate-400 group-hover:text-indigo-600 transition-colors">
                                    <Upload size={40} className="mx-auto mb-3 opacity-50" />
                                    <p className="font-black text-sm uppercase tracking-wider">Haga clic para cargar respuesta</p>
                                    <p className="text-[10px] mt-1 opacity-60 font-bold">Nomenclatura institucional obligatoria.</p>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex justify-end gap-3 pt-4">
                            <button type="button" onClick={() => setShowResponseModal(false)} className="px-4 py-2 text-slate-500 hover:text-slate-800 text-sm font-black uppercase tracking-tighter transition-colors">Cancelar</button>
                            <button type="button" onClick={(e) => handleSubmitResponse(e)} disabled={!isFileValid || actionLoading} className={`px-6 py-2 rounded-lg text-white text-sm font-black shadow-md transition-all flex items-center gap-2 ${pendingAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} disabled:opacity-50 disabled:grayscale`}>
                                <Save size={16} />{actionLoading ? 'Procesando...' : `Confirmar ${pendingAction === 'APPROVE' ? 'Aprobación' : 'Rechazo'}`}
                            </button>
                        </div>
                  </div>
              </div>
          </div>
      )}

      {/* REVERT / DELETE MODAL */}
      {showDeleteModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-red-100">
                  <div className="p-5 border-b border-red-50 bg-red-50 flex justify-between items-center">
                      <h3 className="text-lg font-black flex items-center gap-2 text-red-800">
                          <AlertTriangle size={24} /> 
                          Revertir Última Acción
                      </h3>
                      <button type="button" onClick={() => setShowDeleteModal(false)} className="text-red-400 hover:text-red-600 transition-colors">
                          <XCircle size={20} />
                      </button>
                  </div>
                  <div className="p-6">
                      <div className="bg-amber-50 border border-amber-100 p-4 rounded-xl mb-6">
                          <p className="text-sm text-amber-800 font-bold leading-relaxed">
                              ⚠️ Esta acción eliminará el último hito registrado en el historial y restaurará el documento a su <b>estado, versión y progreso inmediatamente anterior</b>.
                          </p>
                          <p className="text-xs text-amber-700 mt-2">
                              Si este es el único hito del documento, el registro completo será eliminado.
                          </p>
                      </div>

                      <div className="flex flex-col gap-3">
                          <button 
                            type="button"
                            onClick={handleRevertAction}
                            disabled={actionLoading}
                            className="w-full flex items-center justify-center gap-2 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-black uppercase tracking-widest text-xs shadow-lg shadow-red-100 transition-all active:scale-95 disabled:opacity-50"
                          >
                              {actionLoading ? 'Procesando...' : <><Trash2 size={16} /> Confirmar Reversión</>}
                          </button>
                          <button 
                            type="button"
                            onClick={() => setShowDeleteModal(false)}
                            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold uppercase tracking-widest text-xs transition-all"
                          >
                              Cancelar
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