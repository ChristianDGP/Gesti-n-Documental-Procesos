
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DocumentService, HistoryService, UserService, HierarchyService, ReferentService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocHistory, UserRole, DocState, FullHierarchy, Referent } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename, validateCoordinatorRules, getCoordinatorRuleHint } from '../utils/filenameParser';
import { ArrowLeft, FileText, CheckCircle, XCircle, Activity, Mail, MessageSquare, ExternalLink, Trash2, Lock, Save, PlusCircle, Upload, Loader2, UserCheck, Users as UsersIcon } from 'lucide-react';

interface Props {
  user: User;
}

const DocumentDetail: React.FC<Props> = ({ user }) => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation(); 
  
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
  const [showResponseModal, setShowResponseModal] = useState(false);
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);
  const [responseFile, setResponseFile] = useState<File | null>(null);
  const [isFileValid, setIsFileValid] = useState(false);
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
            const coord = allUsers.find(u => u.role === UserRole.COORDINATOR || u.role === UserRole.ADMIN);
            if (coord) setCoordinatorEmail(coord.email);
            
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
                // Si no hay nodo en matriz (ej: documento huérfano), mostramos al autor como asignado
                setAssigneeNames([d.authorName]);
            }
        }
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  const handleNotifyReferent = () => {
      if (!doc) return;
      const subject = encodeURIComponent(`Solicitud de Aprobación Técnica: ${doc.microprocess || ''}`);
      const to = encodeURIComponent(referentEmails.join(','));
      const cc = encodeURIComponent(assigneeEmails.join(','));
      const body = encodeURIComponent(`Estimados,\nPara vuestra validación técnica, adjunto el Informe:\n- ${doc.microprocess} - ${doc.docType || ''} - ${doc.version}\n\nAtento a comentarios.\nSaludos,\n${user.name}`);
      window.open(`https://mail.google.com/mail/?view=cm&fs=1&to=${to}&cc=${cc}&su=${subject}&body=${body}`, '_blank');
  };

  const handleActionClick = async (action: any) => {
      if (action === 'APPROVE' || action === 'REJECT') {
          setPendingAction(action); setShowResponseModal(true);
      } else {
          setActionLoading(true);
          await DocumentService.transitionState(doc!.id, user, action, comment);
          setComment(''); await loadData(doc!.id);
          setActionLoading(false);
      }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando...</div>;
  if (!doc) return <div>No encontrado</div>;

  const config = STATE_CONFIG[doc.state];
  const isCoordinator = user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
  const showNotifyReferent = isCoordinator && (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW);

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex justify-between gap-4 mb-6">
            <div>
                <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-white">{doc.project}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-700">{doc.docType}</span>
                </div>
                <h1 className="text-2xl font-bold text-slate-900">{doc.title}</h1>
            </div>
            <div className={`px-3 py-1.5 rounded-lg text-sm font-semibold h-fit ${config.color}`}>{config.label}</div>
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
                <p className="font-mono font-bold text-slate-900">{doc.version}</p>
            </div>
            <div className="space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Progreso de Etapa</p>
                <div className="flex items-center gap-2">
                    <div className="flex-1 bg-slate-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-indigo-600 h-full transition-all duration-500" style={{ width: `${doc.progress}%` }}></div>
                    </div>
                    <span className="font-bold text-indigo-700">{doc.progress}%</span>
                </div>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                    <Activity size={18} className="text-indigo-600" /> Acciones de Gestión
                </h3>
                <textarea 
                    className="w-full p-3 border border-slate-300 rounded-lg text-sm mb-4 focus:ring-2 focus:ring-indigo-500 outline-none transition-shadow" 
                    rows={3} 
                    placeholder="Escriba observaciones o comentarios aquí..." 
                    value={comment} 
                    onChange={(e) => setComment(e.target.value)} 
                />
                <div className="flex flex-wrap gap-2">
                    {showNotifyReferent && (
                        <button onClick={handleNotifyReferent} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-bold shadow-md transition-all active:scale-95">
                            <UserCheck size={16} /> Notificar por Email ({referentNames.length})
                        </button>
                    )}
                    {isCoordinator && doc.state !== DocState.APPROVED && (
                        <>
                            <button onClick={() => handleActionClick('APPROVE')} className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-bold shadow-sm hover:bg-green-700 transition-colors"><CheckCircle size={16} /> Aprobar</button>
                            <button onClick={() => handleActionClick('REJECT')} className="flex items-center gap-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg text-sm font-bold border border-red-200 hover:bg-red-200 transition-colors"><XCircle size={16} /> Rechazar</button>
                        </>
                    )}
                </div>
            </div>
        </div>
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
            <h3 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
                <FileText size={18} className="text-slate-400" /> Historial de Cambios
            </h3>
            <div className="space-y-6 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
                {history.length === 0 ? (
                    <p className="text-center text-slate-400 text-xs py-8">Sin registros previos.</p>
                ) : history.map(h => (
                    <div key={h.id} className="relative pl-6 pb-2 border-l-2 border-slate-100 last:border-0">
                        <div className="absolute left-[-5px] top-0 w-2 h-2 rounded-full bg-slate-300"></div>
                        <div className="text-[10px] text-slate-400 font-mono mb-0.5">{new Date(h.timestamp).toLocaleString()}</div>
                        <div className="text-xs font-bold text-slate-700">{h.action}</div>
                        <div className="text-[11px] text-slate-500 font-medium">{h.userName}</div>
                        {h.comment && <div className="mt-1 p-2 bg-slate-50 rounded border border-slate-100 text-[10px] italic text-slate-600">"{h.comment}"</div>}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentDetail;
