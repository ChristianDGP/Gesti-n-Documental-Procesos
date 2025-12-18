
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocumentService, HistoryService, UserService, HierarchyService, ReferentService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocHistory, UserRole, DocState, FullHierarchy, Referent } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename, validateCoordinatorRules, getCoordinatorRuleHint } from '../utils/filenameParser';
import { ArrowLeft, FileText, CheckCircle, XCircle, Activity, Mail, MessageSquare, ExternalLink, Trash2, Lock, Save, PlusCircle, Upload, Loader2, UserCheck, Users as UsersIcon, FileCheck, FileX, Info, AlertTriangle } from 'lucide-react';

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
            
            // Resolve names and emails from Hierarchy Matrix
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

                const rUsers = (node.referentIds || []).map(rid => allReferents.find(ref => ref.id === rid)).filter(r => r) as Referent[];
                setReferentEmails(rUsers.map(r => r.email));
                setReferentNames(rUsers.map(r => r.name));
            } else {
                setAssigneeNames([d.authorName]);
            }
        }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleNotifyReferent = () => {
      if (!doc) return;
      const subject = encodeURIComponent(`Solicitud de Aprobación Técnica: ${doc.microprocess || ''}`);
      const to = referentEmails.join(',');
      const cc = assigneeEmails.join(',');
      const body = encodeURIComponent(`Estimados,\nPara vuestra validación técnica, adjunto el Informe:\n- ${doc.microprocess} - ${doc.docType || ''} - ${doc.version}\n\nAtento a comentarios.\nSaludos,\n${user.name}`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&cc=${cc}&su=${subject}&body=${body}`, '_blank');
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
              setFileValidationError(validation.error || 'Archivo inválido');
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
              comment || (pendingAction === 'APPROVE' ? 'Aprobado por coordinación' : 'Rechazado por coordinación'),
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

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center justify-center min-h-[400px]"><Loader2 className="animate-spin mb-2 text-indigo-600" /> Cargando detalle...</div>;
  if (!doc) return <div className="p-8 text-center text-slate-500">Documento no encontrado.</div>;

  const config = STATE_CONFIG[doc.state];
  const isCoordinator = user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
  const showNotifyReferent = isCoordinator && (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      {/* Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <button onClick={() => navigate(-1)} className="flex items-center text-slate-400 hover:text-slate-600 mb-4 text-xs font-medium transition-colors">
            <ArrowLeft size={14} className="mr-1" /> Volver al listado
        </button>
        <div className="flex flex-col md:flex-row justify-between gap-4 mb-6">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-white">{doc.project}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">{doc.docType}</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-sm font-bold h-fit border shadow-sm ${config.color}`}>{config.label}</div>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 text-sm border-t border-slate-100 pt-6">
            <div className="space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px] flex items-center gap-1"><UsersIcon size={12}/> Analistas</p>
                <p className="font-medium text-slate-800 leading-relaxed">
                    {assigneeNames.length > 0 ? assigneeNames.join(', ') : <span className="text-slate-400 italic">Sin asignar</span>}
                </p>
            </div>
            <div className="space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px] flex items-center gap-1"><UserCheck size={12}/> Referentes</p>
                <p className="font-medium text-indigo-600 leading-relaxed">
                    {referentNames.length > 0 ? referentNames.join(', ') : <span className="text-slate-400 italic">Sin referentes vinculados</span>}
                </p>
            </div>
            <div className="space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Versión Actual</p>
                <p className="font-mono font-bold text-slate-900 bg-slate-50 px-2 py-1 rounded border border-slate-200 w-fit">{doc.version}</p>
            </div>
            <div className="space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Progreso General</p>
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                        <div className="bg-indigo-600 h-full transition-all duration-700 ease-out" style={{ width: `${doc.progress}%` }}></div>
                    </div>
                    <span className="font-bold text-indigo-700 text-xs">{doc.progress}%</span>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Actions Column */}
        <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                    <Activity size={18} className="text-indigo-600" /> Gestión del Documento
                </h3>
                <textarea 
                    className="w-full p-3 border border-slate-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow bg-slate-50" 
                    rows={3} 
                    placeholder="Escriba observaciones, motivos de rechazo o comentarios para el historial..." 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)} 
                />
                <div className="flex flex-wrap gap-3">
                    {showNotifyReferent && (
                        <button onClick={handleNotifyReferent} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-bold shadow-md transition-all active:scale-95">
                            <Mail size={16} /> Notificar a Referentes ({referentNames.length})
                        </button>
                    )}
                    {isCoordinator && doc.state !== DocState.APPROVED && (
                        <>
                            <button onClick={() => handleActionClick('APPROVE')} className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-green-700 transition-all active:scale-95">
                                <CheckCircle size={18} /> Aprobar Etapa
                            </button>
                            <button onClick={() => handleActionClick('REJECT')} className="flex items-center gap-2 px-5 py-2.5 bg-white text-red-600 border-2 border-red-100 rounded-lg text-sm font-bold hover:bg-red-50 transition-all active:scale-95">
                                <XCircle size={18} /> Rechazar Cambios
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>

        {/* History Sidebar */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-sm uppercase tracking-wider">
                <FileText size={18} className="text-slate-400" /> Línea de Tiempo
            </h3>
            <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin">
                {history.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-8 italic">No hay actividad registrada aún.</p>
                ) : history.map(h => (
                    <div key={h.id} className="relative pl-6 pb-2 border-l-2 border-slate-100 last:border-0">
                        <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-slate-300"></div>
                        <div className="text-[10px] text-slate-400 font-mono mb-0.5">{new Date(h.timestamp).toLocaleString()}</div>
                        <div className="text-xs font-bold text-slate-800">{h.action}</div>
                        <div className="text-[11px] text-slate-500 mb-2">{h.userName}</div>
                        {h.comment && <div className="mt-1 p-2 bg-slate-50 rounded border border-slate-100 text-[10px] italic text-slate-600 leading-relaxed">"{h.comment}"</div>}
                    </div>
                ))}
            </div>
        </div>
      </div>

      {/* RESPONSE MODAL (Action Verification) */}
      {showResponseModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                  <div className={`p-5 flex justify-between items-center text-white ${pendingAction === 'APPROVE' ? 'bg-green-600' : 'bg-red-600'}`}>
                      <h3 className="text-lg font-bold flex items-center gap-2">
                          {pendingAction === 'APPROVE' ? <CheckCircle size={20}/> : <XCircle size={20}/>}
                          Confirmar {pendingAction === 'APPROVE' ? 'Aprobación' : 'Rechazo'}
                      </h3>
                      <button onClick={() => setShowResponseModal(false)} className="hover:bg-black/10 p-1 rounded transition-colors"><XCircle size={24} /></button>
                  </div>
                  
                  <div className="p-6 space-y-6">
                      <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
                          <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-bold uppercase">Estado Actual</span>
                              <span className="font-bold text-slate-800">{config.label.split('(')[0]}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                              <span className="text-slate-500 font-bold uppercase">Versión Actual</span>
                              <span className="font-mono font-bold text-indigo-600">{doc.version}</span>
                          </div>
                          <div className="pt-2 border-t border-slate-200">
                              <p className="text-[10px] text-slate-400 uppercase font-bold mb-1">Nomenclatura requerida:</p>
                              <p className="text-xs font-mono bg-white p-2 rounded border border-slate-200 text-indigo-700">
                                  {getCoordinatorRuleHint(doc.state, pendingAction!)}
                              </p>
                          </div>
                      </div>

                      <div className="space-y-3">
                          <label className="block text-sm font-bold text-slate-700">Subir Archivo de Respuesta</label>
                          <div 
                              onClick={() => fileInputRef.current?.click()}
                              className={`border-2 border-dashed rounded-xl p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer group
                              ${responseFile ? 'border-green-300 bg-green-50' : 
                                fileValidationError ? 'border-red-300 bg-red-50' : 
                                'border-slate-300 hover:border-indigo-400 hover:bg-slate-50'}`}
                          >
                              <input 
                                  type="file" 
                                  ref={fileInputRef}
                                  onChange={handleFileChange}
                                  className="hidden"
                              />

                              {responseFile ? (
                                  <div className="text-green-700 animate-fadeIn">
                                      <FileCheck size={40} className="mx-auto mb-2" />
                                      <p className="font-bold text-sm">{responseFile.name}</p>
                                      <p className="text-[10px] mt-1 uppercase font-bold">Versión detectada: {detectedVersion}</p>
                                  </div>
                              ) : fileValidationError ? (
                                  <div className="text-red-600 animate-fadeIn">
                                      <FileX size={40} className="mx-auto mb-2" />
                                      <p className="text-xs font-bold">{fileValidationError}</p>
                                      <p className="text-[10px] mt-2 text-slate-400">Haga clic para reintentar</p>
                                  </div>
                              ) : (
                                  <div className="text-slate-400 group-hover:text-indigo-500">
                                      <Upload size={40} className="mx-auto mb-2" />
                                      <p className="text-sm font-bold">Seleccionar archivo</p>
                                      <p className="text-[10px] mt-1">Debe cumplir con las reglas de versión</p>
                                  </div>
                              )}
                          </div>
                      </div>

                      <div className="flex justify-end gap-3 pt-4">
                          <button 
                            disabled={actionLoading}
                            onClick={() => setShowResponseModal(false)} 
                            className="px-4 py-2 text-slate-500 hover:text-slate-800 font-bold text-sm"
                          >
                            Cancelar
                          </button>
                          <button 
                              disabled={!responseFile || actionLoading}
                              onClick={handleConfirmAction}
                              className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-bold text-sm shadow-md transition-all
                                  ${pendingAction === 'APPROVE' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'} 
                                  disabled:opacity-50 disabled:cursor-not-allowed`}
                          >
                              {actionLoading ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                              Confirmar y Guardar
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
