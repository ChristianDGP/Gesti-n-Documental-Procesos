
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '../services/firebaseBackend';
import { User, Notification } from '../types';
import { Inbox, CheckCircle, MailOpen, Mail, User as UserIcon, MessageSquare, AlertTriangle, CheckSquare, ArrowRight } from 'lucide-react';

interface Props {
  user: User;
}

const Buffer: React.FC<Props> = ({ user }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadNotifications();
  }, []);

  const loadNotifications = async () => {
    setLoading(true);
    const data = await NotificationService.getByUser(user.id);
    setNotifications(data);
    setLoading(false);
  };

  const handleItemClick = async (notif: Notification) => {
      // Mark as read
      if (!notif.isRead) {
          await NotificationService.markAsRead(notif.id);
          // Optimistic update
          setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, isRead: true } : n));
      }
      
      // Navigation Logic
      if (notif.documentId.startsWith('MTX_')) {
          // It's a Matrix Assignment (Process), NOT a Document yet.
          // User should go to "Create Document" to start working on it.
          navigate('/new');
      } else {
          // Standard Document Navigation
          navigate(`/doc/${notif.documentId}`);
      }
  };

  const handleMarkAllRead = async () => {
      await NotificationService.markAllAsRead(user.id);
      setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
  };

  const getIcon = (type: Notification['type']) => {
      switch (type) {
          case 'ASSIGNMENT': return <UserIcon size={18} className="text-blue-500" />;
          case 'APPROVAL': return <CheckSquare size={18} className="text-green-500" />;
          case 'REJECTION': return <AlertTriangle size={18} className="text-red-500" />;
          case 'COMMENT': return <MessageSquare size={18} className="text-amber-500" />;
          default: return <Mail size={18} className="text-slate-500" />;
      }
  };

  const unreadCount = notifications.filter(n => !n.isRead).length;

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando notificaciones...</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Inbox className="text-indigo-600" />
                Bandeja de Entrada
            </h1>
            <p className="text-slate-500">
                Notificaciones y actualizaciones recientes.
            </p>
        </div>
        <div className="flex items-center gap-3">
             {unreadCount > 0 && (
                <button 
                    onClick={handleMarkAllRead}
                    className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-3 py-1 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
                >
                    Marcar todo como leído
                </button>
             )}
        </div>
      </div>

      {notifications.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
              <div className="w-16 h-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Inbox size={32} />
              </div>
              <h3 className="text-lg font-semibold text-slate-800 mb-2">Bandeja Vacía</h3>
              <p className="text-slate-500">No tienes notificaciones recientes.</p>
          </div>
      ) : (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="divide-y divide-slate-100">
                  {notifications.map(notif => (
                      <div 
                        key={notif.id} 
                        onClick={() => handleItemClick(notif)}
                        className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 
                            ${!notif.isRead ? 'bg-indigo-50/40 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
                      >
                          <div className="mt-1 flex-shrink-0">
                                {getIcon(notif.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className={`text-sm truncate pr-2 ${!notif.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                                        {notif.title}
                                    </h4>
                                    <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
                                        {new Date(notif.timestamp).toLocaleDateString()} {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit'})}
                                    </span>
                                </div>
                                <p className={`text-sm mb-1 ${!notif.isRead ? 'text-slate-800' : 'text-slate-500'}`}>
                                    {notif.message}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-slate-400">
                                    <span className="font-medium">{notif.actorName}</span>
                                    <span>•</span>
                                    <span>{notif.type === 'ASSIGNMENT' ? 'Nueva Asignación' : notif.type}</span>
                                </div>
                          </div>
                          <div className="flex flex-col items-end justify-between self-stretch">
                             {!notif.isRead && (
                                  <div className="w-2.5 h-2.5 bg-indigo-500 rounded-full mb-2"></div>
                             )}
                             {notif.documentId.startsWith('MTX_') && (
                                 <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-1 font-bold">
                                     Iniciar <ArrowRight size={10} />
                                 </span>
                             )}
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      )}
    </div>
  );
};

export default Buffer;
