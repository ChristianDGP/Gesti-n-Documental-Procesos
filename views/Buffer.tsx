
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService } from '../services/mockBackend';
import { Document, User, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { Inbox, CheckCircle, Clock, AlertCircle, Send, Paperclip, FileText } from 'lucide-react';

interface Props {
  user: User;
}

const Buffer: React.FC<Props> = ({ user }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = async () => {
    setLoading(true);
    const data = await DocumentService.getAll();
    setDocs(data);
    setLoading(false);
  };

  // BUFFER LOGIC
  const getBufferDocs = () => {
    // Base scope (my docs or all docs depending on role for visibility)
    const scope = user.role === UserRole.ANALYST 
        ? docs.filter(d => d.authorId === user.id || (d.assignees && d.assignees.includes(user.id)))
        : docs;

    if (user.role === UserRole.COORDINATOR) {
        // Coordinator Actionable Items: Pending Request Flag + States (Internal Review or Sent to Referent)
        return scope.filter(d => 
            d.hasPendingRequest === true && 
            (d.state === DocState.INTERNAL_REVIEW || d.state === DocState.SENT_TO_REFERENT)
        );
    }
    if (user.role === UserRole.ANALYST) {
        // Analyst Actionable Items: Rejected docs needing correction
        return scope.filter(d => d.state === DocState.REJECTED);
    }
    if (user.role === UserRole.ADMIN) {
        // Admin Actionable Items: Pending Request Flag + Sent to Control
        return scope.filter(d => 
            d.hasPendingRequest === true &&
            d.state === DocState.SENT_TO_CONTROL
        );
    }
    return [];
  };

  const bufferDocs = getBufferDocs();
  
  const getEmptyMessage = () => {
      if (user.role === UserRole.ANALYST) return "No tienes documentos rechazados pendientes de corrección.";
      if (user.role === UserRole.COORDINATOR) return "No tienes solicitudes pendientes de revisión.";
      return "No hay solicitudes pendientes de control de gestión.";
  };

  const getHeaderTitle = () => {
      if (user.role === UserRole.ANALYST) return "Documentos Rechazados / A Corregir";
      if (user.role === UserRole.COORDINATOR) return "Solicitudes de Revisión Pendientes";
      return "Solicitudes de Control de Gestión";
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando bandeja...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Inbox className="text-indigo-600" />
                Bandeja de Entrada
            </h1>
            <p className="text-slate-500">
                {getHeaderTitle()}
            </p>
        </div>
        <div className="bg-indigo-50 text-indigo-700 px-4 py-2 rounded-lg text-sm font-bold border border-indigo-100">
            {bufferDocs.length} Tareas Pendientes
        </div>
      </div>

      {bufferDocs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle size={32} />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">¡Todo al día!</h3>
              <p className="text-slate-500">{getEmptyMessage()}</p>
          </div>
      ) : (
          <div className="grid grid-cols-1 gap-4">
              {bufferDocs.map(doc => (
                  <Link to={`/doc/${doc.id}`} key={doc.id} className="block group">
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 transition-all hover:shadow-md hover:border-indigo-300 relative overflow-hidden">
                        {/* Status Stripe */}
                        <div className={`absolute left-0 top-0 bottom-0 w-1.5 
                            ${doc.state === DocState.REJECTED ? 'bg-red-500' : 'bg-indigo-500'}`} 
                        />
                        
                        <div className="flex flex-col gap-4 pl-3">
                            {/* Header: Project & Type */}
                            <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        {doc.project}
                                    </span>
                                    {doc.docType && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                            {doc.docType}
                                        </span>
                                    )}
                                    {doc.hasPendingRequest && (
                                        <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase animate-pulse">
                                            <Send size={10} /> Solicitud Enviada
                                        </span>
                                    )}
                                </div>
                                <div className="text-xs text-slate-400 flex items-center gap-1">
                                    <Clock size={12} /> {new Date(doc.updatedAt).toLocaleDateString()}
                                </div>
                            </div>

                            {/* Main Content */}
                            <div className="flex justify-between items-center">
                                <div>
                                    <h3 className="text-lg font-semibold text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">
                                        {doc.microprocess || doc.title}
                                    </h3>
                                    <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-1">
                                        <FileText size={14} className="text-slate-400"/>
                                        {doc.macroprocess}
                                    </div>
                                </div>
                                
                                {/* Version & Status Badge */}
                                 <div className="flex flex-col items-end gap-1">
                                    <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATE_CONFIG[doc.state].color}`}>
                                        {user.role === UserRole.ANALYST && doc.state === DocState.REJECTED ? (
                                            <span className="flex items-center gap-1"><AlertCircle size={12} /> Requiere Atención</span>
                                        ) : (
                                            STATE_CONFIG[doc.state].label.split('(')[0]
                                        )}
                                    </div>
                                     <div className="flex items-center gap-2 mt-1">
                                         <span className="text-xs font-mono bg-slate-100 text-slate-600 px-2 py-0.5 rounded border border-slate-200 font-bold" title="Versión Actual">
                                            v{doc.version}
                                         </span>
                                         {doc.files.length > 0 && (
                                            <span className="flex items-center gap-1 text-xs text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100" title={`${doc.files.length} archivos adjuntos`}>
                                                <Paperclip size={10} /> {doc.files.length}
                                            </span>
                                         )}
                                     </div>
                                </div>
                            </div>

                            {/* Progress Bar Footer */}
                            <div className="w-full">
                                <div className="flex justify-between text-[10px] text-slate-400 mb-1 uppercase font-bold tracking-wider">
                                    <span>Progreso del Flujo</span>
                                    <span>{doc.progress}%</span>
                                </div>
                                <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                                    <div 
                                        className={`h-1.5 rounded-full transition-all duration-500 ${
                                            doc.progress === 100 ? 'bg-green-500' : 
                                            doc.state === DocState.REJECTED ? 'bg-red-400' : 'bg-indigo-500'
                                        }`}
                                        style={{ width: `${doc.progress}%` }}
                                    ></div>
                                </div>
                            </div>
                        </div>
                    </div>
                  </Link>
              ))}
          </div>
      )}
    </div>
  );
};

export default Buffer;
