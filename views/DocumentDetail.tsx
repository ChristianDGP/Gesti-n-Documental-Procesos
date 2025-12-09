
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DocumentService, HistoryService, UserService } from '../services/mockBackend';
import { Document, User, DocHistory, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { parseDocumentFilename, checkVersionRules } from '../utils/filenameParser';
import { ArrowLeft, Upload, FileText, CheckCircle, XCircle, ChevronRight, Activity, Paperclip, AlertOctagon, Info, Layers, Users, RotateCcw, Send } from 'lucide-react';

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

  // Reference for hidden file input triggered by Action Buttons
  const actionFileRef = useRef<HTMLInputElement>(null);
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'REJECT' | null>(null);

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

  // 1. Standard File Upload (Just adding attachments, no state change)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || !e.target.files[0] || !doc) return;
    const file = e.target.files[0];
    
    const analisis = parseDocumentFilename(
        file.name, doc.project, doc.microprocess, doc.docType 
    );

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
  };

  // 2. Action Trigger (Check prerequisites)
  const handleActionClick = (action: 'ADVANCE' | 'APPROVE' | 'REJECT' | 'REQUEST_APPROVAL') => {
      if (!doc) return;

      if (action === 'REQUEST_APPROVAL') {
          if (!window.confirm('¿Solicitar aprobación para la versión actual?')) return;
          executeTransition('REQUEST_APPROVAL', null, null);
          return;
      }

      if (action === 'ADVANCE') {
          executeTransition('ADVANCE', null, null);
          return;
      }

      // For APPROVE or REJECT, we MUST open file dialog to select the response file
      if (action === 'APPROVE' || action === 'REJECT') {
          if (action === 'REJECT' && !comment) {
              alert('Por favor agrega un comentario/observación antes de rechazar.');
              return;
          }
          setPendingAction(action);
          if (actionFileRef.current) actionFileRef.current.click();
      }
  };

  // 3. Handle File Selection for Approve/Reject
  const handleActionFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!e.target.files || !e.target.files[0] || !doc || !pendingAction) return;
      const file = e.target.files[0];
      
      // Basic Syntax Check
      const analisis = parseDocumentFilename(
        file.name, doc.project, doc.microprocess, doc.docType 
      );
      if (!analisis.valido) {
          alert(`El archivo seleccionado no cumple con la nomenclatura del proyecto:\n${analisis.errores.join('\n')}`);
          e.target.value = '';
          return;
      }

      const newVersion = analisis.nomenclatura || '';

      // Check Rules
      const ruleCheck = checkVersionRules(doc.version, newVersion, pendingAction);
      if (!ruleCheck.valid) {
          alert(`Error de lógica de versiones para ${pendingAction}:\n\n${ruleCheck.error}`);
          e.target.value = '';
          return;
      }

      // All good, execute
      if (window.confirm(`Confirma ${pendingAction === 'APPROVE' ? 'APROBAR' : 'RECHAZAR'} subiendo el archivo versión ${newVersion}?`)) {
          await executeTransition(pendingAction, file, newVersion);
      }
      
      // Reset
      e.target.value = '';
      setPendingAction(null);
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

  if (loading || !doc) return <div className="p-8 text-center text-slate-500">Cargando documento...</div>;

  const config = STATE_CONFIG[doc.state];
  const isAssignee = doc.assignees && doc.assignees.includes(user.id);
  const isAuthor = doc.authorId === user.id;

  const canUpload = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && (doc.state === DocState.INITIATED || doc.state === DocState.IN_PROCESS || doc.state === DocState.REJECTED);
  
  // Logic updated: Request Approval checks nomenclature internally
  const canRequestApproval = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && !doc.hasPendingRequest && 
    (doc.state === DocState.IN_PROCESS || doc.state === DocState.INTERNAL_REVIEW || doc.state === DocState.SENT_TO_REFERENT);

  const canRestart = user.role === UserRole.ANALYST && (isAssignee || isAuthor) && doc.state === DocState.REJECTED;
  
  const canApprove = (
      (user.role === UserRole.COORDINATOR && doc.hasPendingRequest && (doc.state === DocState.INTERNAL_REVIEW || doc.state === DocState.SENT_TO_REFERENT)) ||
      (user.role === UserRole.ADMIN && doc.hasPendingRequest && doc.state === DocState.SENT_TO_CONTROL)
  );

  const canReject = canApprove; // Same permissions for reject

  return (
    <div className="max-w-4xl mx-auto space-y-6 pb-12">
      <button onClick={() => navigate('/')} className="flex items-center text-slate-500 hover:text-slate-800 text-sm">
        <ArrowLeft size={16} className="mr-1" /> Volver al Dashboard
      </button>

      {/* Hidden input for Approve/Reject Actions */}
      <input 
        type="file" 
        ref={actionFileRef} 
        className="hidden" 
        onChange={handleActionFileSelected} 
      />

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

        {/* Process Metadata */}
        {doc.macroprocess && (
            <div className="mb-6 bg-slate-50 p-4 rounded-lg border border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
                 <div className="flex items-start gap-2">
                    <Layers size={18} className="text-slate-400 mt-1" />
                    <div><p className="text-xs text-slate-400 uppercase font-bold">Macroproceso</p><p className="text-sm text-slate-700">{doc.macroprocess}</p></div>
                 </div>
                 <div className="flex items-start gap-2">
                    <Layers size={18} className="text-slate-400 mt-1" />
                    <div><p className="text-xs text-slate-400 uppercase font-bold">Proceso</p><p className="text-sm text-slate-700">{doc.process}</p></div>
                 </div>
                 <div className="flex items-start gap-2 md:col-span-2">
                    <Layers size={18} className="text-slate-400 mt-1" />
                    <div><p className="text-xs text-slate-400 uppercase font-bold">Microproceso</p><p className="text-sm text-slate-700 font-medium">{doc.microprocess}</p></div>
                 </div>
            </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm border-t border-slate-100 pt-4">
            <div>
                <p className="text-slate-500">Analistas</p>
                {assigneeNames.map((name, i) => <p key={i} className="font-medium text-slate-800">{name}</p>)}
            </div>
            <div>
                <p className="text-slate-500">Versión Actual</p>
                <p className="font-mono text-slate-800 font-bold">{doc.version}</p>
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
                <p className="text-slate-500">Actualizado</p>
                <p className="text-slate-800">{new Date(doc.updatedAt).toLocaleDateString()}</p>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h3 className="font-semibold text-slate-800 mb-4 flex items-center">
                    <Paperclip size={18} className="mr-2 text-indigo-500" /> Archivos Adjuntos
                </h3>
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

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                 <h3 className="font-semibold text-slate-800 mb-4">Acciones de Flujo</h3>
                 <textarea 
                    className="w-full p-3 border border-slate-300 rounded-lg text-sm mb-4 outline-none focus:ring-2 focus:ring-indigo-500"
                    rows={3}
                    placeholder="Observaciones (requerido para rechazo)..."
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                 />

                 <div className="flex flex-wrap gap-3">
                    {canRequestApproval && (
                         <button onClick={() => handleActionClick('REQUEST_APPROVAL')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm">
                            <Send size={16} className="mr-2" /> Solicitar Aprobación
                        </button>
                    )}
                    
                    {canRestart && (
                         <button onClick={() => handleActionClick('ADVANCE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm">
                            <RotateCcw size={16} className="mr-2" /> Reiniciar Flujo
                        </button>
                    )}

                    {canApprove && (
                        <button onClick={() => handleActionClick('APPROVE')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm font-medium shadow-sm">
                            <CheckCircle size={16} className="mr-2" /> Aprobar (Subir Archivo)
                        </button>
                    )}

                    {canReject && (
                        <button onClick={() => handleActionClick('REJECT')} disabled={actionLoading} className="flex items-center px-4 py-2 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg text-sm font-medium border border-red-200">
                            <XCircle size={16} className="mr-2" /> Rechazar (Subir Archivo)
                        </button>
                    )}

                    {doc.state === DocState.APPROVED && <p className="text-sm text-green-600 font-bold flex items-center"><CheckCircle size={16} className="mr-2"/> Proceso Finalizado</p>}
                 </div>
                 {(canApprove || canReject) && <p className="text-xs text-slate-400 mt-2 italic">* Aprobar o Rechazar requerirá subir el archivo con la nueva versión correspondiente.</p>}
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 h-fit max-h-[600px] overflow-y-auto">
            <h3 className="font-semibold text-slate-800 mb-4 border-b border-slate-100 pb-2">Historial</h3>
            <div className="space-y-6 pl-4 border-l-2 border-slate-100 relative">
                {history.map(h => (
                    <div key={h.id} className="relative">
                        <div className="absolute -left-[21px] top-1 h-3 w-3 rounded-full bg-slate-300 border-2 border-white"></div>
                        <div className="text-xs text-slate-400 mb-0.5">{new Date(h.timestamp).toLocaleString()}</div>
                        <p className="text-sm font-medium text-slate-800">{h.action} <span className="font-normal text-slate-500">por {h.userName}</span></p>
                        {h.comment && <div className="mt-1 p-2 bg-slate-50 rounded text-xs text-slate-600 italic border border-slate-100">"{h.comment}"</div>}
                    </div>
                ))}
            </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentDetail;
