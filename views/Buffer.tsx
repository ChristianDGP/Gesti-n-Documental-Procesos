
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService } from '../services/mockBackend';
import { Document, User, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { Inbox, ChevronRight, AlertCircle, Clock, CheckCircle, FileText, Calendar, Send } from 'lucide-react';

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
                            ${doc.state === DocState.REJECTED ? 'bg-red-500' : 'bg-yellow-500'}`} 
                        />
                        
                        <div className="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center pl-2">
                            <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                                        {doc.project}
                                    </span>
                                    {doc.docType && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                            {doc.docType}
                                        </span>
                                    )}
                                    {doc.hasPendingRequest && (
                                        <span className="flex items-center gap-1 text-[10px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded uppercase">
                                            <Send size={10} /> Solicitud Enviada
                                        </span>
                                    )}
                                </div>
                                <h3 className="text-lg font-semibold text-slate-800 group-hover:text-indigo-700 flex items-center gap-2">
                                    {doc.microprocess || doc.title}
                                </h3>
                                <div className="text-sm text-slate-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                                    <span className="flex items-center gap-1">
                                        <FileText size={14} /> {doc.macroprocess}
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <Clock size={14} /> Actualizado: {new Date(doc.updatedAt).toLocaleDateString()}
                                    </span>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 self-end md:self-center">
                                <div className="text-right">
                                    <div className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${STATE_CONFIG[doc.state].color}`}>
                                        {user.role === UserRole.ANALYST && doc.state === DocState.REJECTED ? (
                                            <span className="flex items-center gap-1"><AlertCircle size={12} /> Requiere Atención</span>
                                        ) : (
                                            STATE_CONFIG[doc.state].label.split('(')[0]
                                        )}
                                    </div>
                                    <div className="text-xs text-slate-400 mt-1 font-mono">
                                        v{doc.version}
                                    </div>
                                </div>
                                <div className="bg-slate-50 p-2 rounded-full text-slate-400 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors">
                                    <ChevronRight size={20} />
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
