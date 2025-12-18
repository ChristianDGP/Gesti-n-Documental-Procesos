
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocumentService, HistoryService, UserService, HierarchyService, ReferentService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocHistory, UserRole, DocState, FullHierarchy, Referent } from '../types';
import { STATE_CONFIG } from '../constants';
import { validateCoordinatorRules, getCoordinatorRuleHint } from '../utils/filenameParser';
import { 
    ArrowLeft, FileText, CheckCircle, XCircle, Activity, Mail, 
    MessageSquare, ExternalLink, PlusCircle, Upload, Loader2, 
    UserCheck, Users as UsersIcon, FileCheck, FileX, Info, 
    AlertTriangle, Send, History, ChevronRight, Save
} from 'lucide-react';

interface Props {
  user: User;
}

const DocumentDetail: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  
  const [doc, setDoc] = useState<Document | null>(null);
  const [history, setHistory] = useState<DocHistory[]>([]);
  const [assigneeEmails, setAssigneeEmails] = useState<string[]>([]);
  const [referentEmails, setReferentEmails] = useState<string[]>([]);
  const [assigneeNames, setAssigneeNames] = useState<string[]>([]);
  const [referentNames, setReferentNames] = useState<string[]>([]);
  const [coordinatorEmail, setCoordinatorEmail] = useState<string>('');
  
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  
  // Modal State
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [fileValidationError, setFileValidationError] = useState<string | null>(null);
  const [detectedVersion, setDetectedVersion] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) loadData(id);
  }, [id]);

  const loadData = async (docId: string) => {
    setLoading(true);
    try {
        const [d, h, allUsers, hierarchy, allReferents] = await Promise.all([
          DocumentService.getById(docId),
          HistoryService.getHistory(docId),
          UserService.getAll(),
          HierarchyService.getFullHierarchy(),
          ReferentService.getAll()
        ]);

        if (d) {
            setDoc(d);
            setHistory(h);
            
            // Resolve Coordinator Fallback
            const admin = allUsers.find(u => u.role === UserRole.ADMIN || u.role === UserRole.COORDINATOR);
            if (admin) setCoordinatorEmail(admin.email);

            // Resolve Hierarchy Matrix Assignments & Referents
            const targetMicro = normalizeHeader(d.microprocess || '');
            const targetProject = normalizeHeader(d.project || '');
            let node = null;
            
            for (const p of Object.keys(hierarchy)) {
                if (normalizeHeader(p) === targetProject) {
                    for (const m of Object.keys(hierarchy[p])) {
                        for (const proc of Object.keys(hierarchy[p][m])) {
                            const found = hierarchy[p][m][proc].find(n => normalizeHeader(n.name) === targetMicro);
                            if (found) { node = found; break; }
                        }
                        if (node) break;
                    }
                }
                if (node) break;
            }

            if (node) {
                const aUsers = (node.assignees || []).map(aid => allUsers.find(u => u.id === aid)).filter(u => u) as User[];
                setAssigneeEmails(aUsers.map(u => u.email));
                setAssigneeNames(aUsers.map(u => u.name));

                // Critical: Adequacy for ReferentService preserved
                const rRefs = (node.referentIds || []).map(rid => allReferents.find(ref => ref.id === rid)).filter(r => r) as Referent[];
                setReferentEmails(rRefs.map(r => r.email));
                setReferentNames(rRefs.map(r => r.name));
            } else {
                setAssigneeNames([d.authorName]);
            }
        }
    } catch (e) { 
        console.error("Error loading document detail:", e); 
    } finally { 
        setLoading(false); 
    }
  };

  const handleNotifyReferent = () => {
      if (!doc) return;
      const subject = encodeURIComponent(`Solicitud de Aprobación Técnica: ${doc.microprocess || ''}`);
      const to = referentEmails.join(',');
      const cc = [user.email, coordinatorEmail, ...assigneeEmails].filter((v, i, a) => a.indexOf(v) === i).join(',');
      const body = encodeURIComponent(`Estimados,\nPara vuestra validación técnica, adjunto el Informe:\n- ${doc.microprocess} - ${doc.docType || ''} - ${doc.version}\n\nQuedo atento a sus valiosos comentarios.\n\nSaludos,\n${user.name}`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&cc=${cc}&su=${subject}&body=${body}`, '_blank');
  };

  const handleAdvanceWorkflow = () => {
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

  const handleActionClick = (action: 'APPROVE' | 'REJECT') => {
      setPendingAction(action);
      setResponseFile(null);
      setFileValidationError(null);
      setShowResponseModal(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0] && doc && pendingAction) {
          const file = e.target.files[0];
          const validation = validateCoordinatorRules(file.name, doc.version, doc.state, pendingAction);
          
          if (validation.valid) {
              setResponseFile(file);
              setFileValidationError(null);
              const parts = file.name.replace(/\.[^/.]+$/, "").split(' - ');
              setDetectedVersion(parts[parts.length - 1]);
          } else {
              setResponseFile(null);
              setFileValidationError(validation.error || 'Nombre de archivo no cumple las reglas.');
          }
      }
  };

  const handleConfirmAction = async () => {
      if (!doc || !pendingAction || !responseFile) return;
      
      setActionLoading(true);
      try {
          await DocumentService.transitionState(
              doc.id, 
              user, 
              pendingAction, 
              comment || (pendingAction === 'APPROVE' ? 'Etapa aprobada formalmente.' : 'Documento rechazado para correcciones.'),
              responseFile,
              detectedVersion
          );
          setShowResponseModal(false);
          setComment('');
          await loadData(doc.id);
      } catch (e: any) {
          alert("Error: " + e.message);
      } finally {
          setActionLoading(false);
      }
  };

  if (loading) return (
      <div className="flex flex-col h-screen items-center justify-center bg-slate-50 gap-4">
          <Loader2 className="animate-spin text-indigo-600" size={40} />
          <p className="text-slate-500 font-medium animate-pulse">Cargando expediente...</p>
      </div>
  );

  if (!doc) return <div className="p-8 text-center text-slate-500">Documento no encontrado.</div>;

  const config = STATE_CONFIG[doc.state];
  const isCoordinator = user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
  const isAnalyst = user.role === UserRole.ANALYST;
  const canAdvance = doc.state !== DocState.APPROVED;
  const showNotifyReferent = isCoordinator && (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW);

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 px-2 md:px-0">
      {/* Top Navigation */}
      <button onClick={() => navigate(-1)} className="flex items-center text-slate-400 hover:text-indigo-600 mb-2 text-sm font-semibold transition-all">
          <ArrowLeft size={18} className="mr-1" /> Volver al Tablero
      </button>

      {/* Main Container */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Metadata & Actions */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Header Identity Card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 p-6 text-white relative">
                    <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-2">
                            <span className="px-2 py-1 rounded bg-white/20 text-[10px] font-bold uppercase backdrop-blur-sm">{doc.project}</span>
                            <span className="px-2 py-1 rounded bg-indigo-500 text-[10px] font-bold uppercase">{doc.docType}</span>
                        </div>
                        <div className={`px-3 py-1 rounded-full text-[11px] font-bold border ${config.color.includes('bg-green') ? 'bg-green-500/20 text-green-300 border-green-500/30' : 'bg-white/10 border-white/20'}`}>
                            {config.label.split('(')[0]}
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold mb-2 leading-tight">{doc.title}</h1>
                    <p className="text-slate-400 text-sm line-clamp-2 mb-4">{doc.description}</p>
                    
                    <div className="flex items-center justify-between pt-4 border-t border-white/10">
                        <div className="text-xs">
                             <span className="text-slate-500 block uppercase font-bold tracking-widest text-[9px]">Versión</span>
                             <span className="font-mono text-lg font-bold">{doc.version}</span>
                        </div>
                        <div className="text-right">
                             <span className="text-slate-500 block uppercase font-bold tracking-widest text-[9px]">Progreso</span>
                             <span className="text-lg font-bold text-indigo-400">{doc.progress}%</span>
                        </div>
                    </div>
                </div>

                {/* Details Grid */}
                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6 bg-white">
                    <div className="space-y-1">
                        <p className="text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1 tracking-wider"><UsersIcon size={12}/> Analistas Responsables</p>
                        <p className="text-sm font-semibold text-slate-800">
                            {assigneeNames.length > 0 ? assigneeNames.join(', ') : <span className="text-slate-300 italic">No asignado</span>}
                        </p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-slate-400 font-bold uppercase text-[10px] flex items-center gap-1 tracking-wider"><UserCheck size={12}/> Referentes Técnicos</p>
                        <p className="text-sm font-semibold text-indigo-600">
                            {referentNames.length > 0 ? referentNames.join(', ') : <span className="text-slate-300 italic">Sin referentes</span>}
                        </p>
                    </div>
                </div>
            </div>

            {/* Action Panel */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-6">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-sm uppercase tracking-widest">
                        <Activity size={18} className="text-indigo-600" /> Panel de Gestión
                    </h3>
                    {doc.hasPendingRequest && (
                        <span className="flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-50 px-2 py-1 rounded-full animate-pulse border border-red-100">
                            <AlertTriangle size={12}/> Pendiente de Revisión
                        </span>
                    )}
                </div>

                <div className="space-y-6">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2 tracking-wider">Observaciones / Comentarios</label>
                        <textarea 
                            className="w-full p-4 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none transition-all bg-slate-50 min-h-[100px]" 
                            placeholder="Ingrese notas sobre esta versión o motivos de rechazo..." 
                            value={comment} 
                            onChange={(e) => setComment(e.target.value)} 
                        />
                    </div>

                    <div className="flex flex-wrap gap-3">
                        {/* Primary Analysts Actions */}
                        {isAnalyst && canAdvance && (
                            <button 
                                onClick={handleAdvanceWorkflow}
                                className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 text-sm font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95"
                            >
                                <PlusCircle size={18} /> Nueva Solicitud / Continuar Flujo
                            </button>
                        )}

                        {/* Coordinator Review Actions */}
                        {isCoordinator && doc.state !== DocState.APPROVED && (
                            <>
                                <button 
                                    onClick={() => handleActionClick('APPROVE')} 
                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-green-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-green-200 hover:bg-green-700 transition-all active:scale-95"
                                >
                                    <CheckCircle size={18} /> Aprobar Etapa
                                </button>
                                <button 
                                    onClick={() => handleActionClick('REJECT')} 
                                    className="flex-1 md:flex-none flex items-center justify-center gap-2 px-6 py-3 bg-white text-red-600 border border-red-200 rounded-xl text-sm font-bold hover:bg-red-50 transition-all active:scale-95"
                                >
                                    <XCircle size={18} /> Rechazar Cambios
                                </button>
                            </>
                        )}

                        {/* Communication Actions */}
                        {showNotifyReferent && (
                            <button 
                                onClick={handleNotifyReferent} 
                                className="w-full md:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-white text-slate-700 border border-slate-200 rounded-xl text-sm font-bold hover:bg-slate-50 transition-all"
                            >
                                <Send size={18} className="text-indigo-600" /> Notificar Referentes ({referentEmails.length})
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>

        {/* Right Column: Timeline & Sidebars */}
        <div className="space-y-6">
            
            {/* Timeline Sidebar */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden flex flex-col h-full max-h-[800px]">
                <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800 flex items-center gap-2 text-xs uppercase tracking-widest">
                        <History size={16} className="text-slate-400" /> Historial de Cambios
                    </h3>
                    <span className="text-[10px] font-bold bg-white px-2 py-1 rounded border border-slate-200 text-slate-500">
                        {history.length} Eventos
                    </span>
                </div>
                
                <div className="flex-1 overflow-y-auto p-6 scrollbar-thin">
                    <div className="relative border-l-2 border-slate-100 ml-3 space-y-8">
                        {history.length === 0 ? (
                            <p className="text-center text-slate-400 text-xs py-10 italic">Sin actividad registrada.</p>
                        ) : history.map((h, i) => (
                            <div key={h.id} className="relative pl-8 animate-fadeIn" style={{ animationDelay: `${i * 0.1}s` }}>
                                <div className={`absolute -left-[9px] top-0 w-4 h-4 rounded-full border-2 border-white shadow-sm transition-all
                                    ${h.action.includes('Aprob') ? 'bg-green-500' : h.action.includes('Rechaz') ? 'bg-red-500' : 'bg-indigo-500'}`}>
                                </div>
                                <div className="text-[10px] text-slate-400 font-bold mb-1">{new Date(h.timestamp).toLocaleString()}</div>
                                <h4 className="text-sm font-bold text-slate-800 leading-tight">{h.action}</h4>
                                <p className="text-xs text-slate-500 font-medium">{h.userName}</p>
                                {h.comment && (
                                    <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-100 text-xs italic text-slate-600 leading-relaxed shadow-sm">
                                        "{h.comment}"
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
      </div>

      {/* RESPONSE MODAL (Action Verification) */}
      {showResponseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col transform transition-all scale-100">
                  <div className={`p-6 flex justify-between items-center text-white ${pendingAction === 'APPROVE' ? 'bg-green-600' : 'bg-red-600'}`}>
                      <h3 className="text-lg font-bold flex items-center gap-2">
                          {pendingAction === 'APPROVE' ? <CheckCircle size={22}/> : <XCircle size={22}/>}
                          {pendingAction === 'APPROVE' ? 'Validar Aprobación' : 'Validar Rechazo'}
                      </h3>
                      <button onClick={() => setShowResponseModal(false)} className="hover:bg-black/10 p-2 rounded-full transition-colors"><XCircle size={24} /></button>
                  </div>
                  
                  <div className="p-8 space-y-6">
                      <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 space-y-4">
                          <div className="flex justify-between items-center text-xs">
                              <span className="text-slate-400 font-bold uppercase tracking-widest">Nomenclatura Requerida</span>
                              <span className="bg-white px-2 py-1 rounded border border-slate-200 text-indigo-600 font-bold">{detectedVersion || 'Pendiente'}</span>
                          </div>
                          <div className="p-3 bg-white rounded-xl border border-indigo-100 text-sm font-mono font-bold text-indigo-800 text-center break-all">
                              {getCoordinatorRuleHint(doc.state, pendingAction!)}
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="block text-sm font-bold text-slate-700 ml-1">Documento de Respaldo / Respuesta</label>
                          <div 
                              onClick={() => fileInputRef.current?.click()}
                              className={`border-2 border-dashed rounded-2xl p-10 transition-all flex flex-col items-center justify-center text-center cursor-pointer group
                              ${responseFile ? 'border-green-300 bg-green-50 shadow-inner' : 
                                fileValidationError ? 'border-red-300 bg-red-50' : 
                                'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}`}
                          >
                              <input 
                                  type="file" 
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  className="hidden"
                              />

                              {responseFile ? (
                                  <div className="text-green-700 animate-fadeIn">
                                      <FileCheck size={48} className="mx-auto mb-3" />
                                      <p className="font-bold text-sm truncate max-w-[300px]">{responseFile.name}</p>
                                      <p className="text-[10px] mt-2 uppercase font-bold tracking-widest bg-white/50 px-2 py-1 rounded inline-block">Versión OK</p>
                                  </div>
                              ) : fileValidationError ? (
                                  <div className="text-red-600 animate-fadeIn">
                                      <FileX size={48} className="mx-auto mb-3" />
                                      <p className="text-xs font-bold leading-relaxed">{fileValidationError}</p>
                                      <p className="text-[10px] mt-4 text-slate-400 font-bold uppercase">Haga clic para reintentar</p>
                                  </div>
                              ) : (
                                  <div className="text-slate-400 group-hover:text-indigo-500">
                                      <Upload size={48} className="mx-auto mb-3 transition-transform group-hover:-translate-y-1" />
                                      <p className="text-sm font-bold">Subir archivo validado</p>
                                      <p className="text-[10px] mt-1 text-slate-300">Debe coincidir con la regla de versión</p>
                                  </div>
                              )}
                          </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4">
                          <button 
                            disabled={actionLoading}
                            onClick={() => setShowResponseModal(false)} 
                            className="px-5 py-3 text-slate-500 hover:text-slate-800 font-bold text-sm transition-colors"
                          >
                            Cancelar
                          </button>
                          <button 
                              disabled={!responseFile || actionLoading}
                              onClick={handleConfirmAction}
                              className={`flex items-center gap-2 px-8 py-3 rounded-xl text-white font-bold text-sm shadow-xl transition-all
                                  ${pendingAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700 shadow-green-100' : 'bg-red-600 hover:bg-red-700 shadow-red-100'} 
                                  disabled:opacity-50 disabled:cursor-not-allowed transform active:scale-95`}
                          >
                              {actionLoading ? <Loader2 size={20} className="animate-spin" /> : <Save size={20} />}
                              Confirmar y Procesar
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
