
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '../services/firebaseBackend';
import { User, Notification } from '../types';
import { Inbox, CheckCircle, MailOpen, Mail, User as UserIcon, MessageSquare, AlertTriangle, CheckSquare, ArrowRight, Search, ChevronLeft, ChevronRight, Filter, Upload } from 'lucide-react';

interface Props {
  user: User;
}

const ITEMS_PER_PAGE = 5;

const Buffer: React.FC<Props> = ({ user }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // UI States
  const [activeTab, setActiveTab] = useState<'UNREAD' | 'ALL'>('UNREAD');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    // Real-time synchronization
    const unsubscribe = NotificationService.subscribeToNotifications(user.id, (data) => {
        setNotifications(data);
        setLoading(false);
    });
    
    return () => unsubscribe();
  }, [user.id]);

  const handleItemClick = async (notif: Notification) => {
      // Mark as read
      if (!notif.isRead) {
          await NotificationService.markAsRead(notif.id);
          // Snapshot listener will update state
      }
      
      // Navigation Logic
      if (notif.documentId.startsWith('MTX_')) {
          navigate('/new');
      } else {
          navigate(`/doc/${notif.documentId}`);
      }
  };

  const handleMarkAllRead = async () => {
      await NotificationService.markAllAsRead(user.id);
      // Snapshot listener will handle the UI update
  };

  const getIcon = (type: Notification['type']) => {
      switch (type) {
          case 'ASSIGNMENT': return <UserIcon size={18} className="text-blue-500" />;
          case 'APPROVAL': return <CheckSquare size={18} className="text-green-500" />;
          case 'REJECTION': return <AlertTriangle size={18} className="text-red-500" />;
          case 'COMMENT': return <MessageSquare size={18} className="text-amber-500" />;
          case 'UPLOAD': return <Upload size={18} className="text-indigo-500" />;
          default: return <Mail size={18} className="text-slate-500" />;
      }
  };

  // --- FILTERING & PAGINATION LOGIC ---
  
  const filteredNotifications = useMemo(() => {
      return notifications.filter(n => {
          // 1. Tab Filter
          if (activeTab === 'UNREAD' && n.isRead) return false;
          
          // 2. Search Filter
          if (searchTerm) {
              const term = searchTerm.toLowerCase();
              return (
                  n.title.toLowerCase().includes(term) ||
                  n.message.toLowerCase().includes(term) ||
                  n.actorName.toLowerCase().includes(term)
              );
          }
          return true;
      });
  }, [notifications, activeTab, searchTerm]);

  const totalPages = Math.ceil(filteredNotifications.length / ITEMS_PER_PAGE);
  
  const paginatedNotifications = useMemo(() => {
      const start = (currentPage - 1) * ITEMS_PER_PAGE;
      return filteredNotifications.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredNotifications, currentPage]);

  // Reset page when filters change
  useEffect(() => {
      setCurrentPage(1);
  }, [activeTab, searchTerm]);

  const unreadCount = notifications.filter(n => !n.isRead).length;


  if (loading) return <div className="p-8 text-center text-slate-500">Cargando notificaciones...</div>;

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Inbox className="text-indigo-600" />
                Bandeja de Entrada
            </h1>
            <p className="text-slate-500">
                Gestiona tus avisos y tareas pendientes.
            </p>
        </div>
        
        {unreadCount > 0 && (
            <button 
                onClick={handleMarkAllRead}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium px-4 py-2 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors border border-indigo-100 shadow-sm whitespace-nowrap"
            >
                <CheckCircle size={16} className="inline mr-2" />
                Marcar todo leído
            </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[500px] flex flex-col">
          {/* HEADER: TABS & SEARCH */}
          <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
              
              {/* TABS */}
              <div className="flex bg-slate-200/50 p-1 rounded-lg w-full md:w-auto">
                  <button
                      onClick={() => setActiveTab('UNREAD')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 flex-1 md:flex-none justify-center ${
                          activeTab === 'UNREAD' 
                              ? 'bg-white text-indigo-600 shadow-sm' 
                              : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                      Pendientes
                      {unreadCount > 0 && (
                          <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full min-w-[20px] text-center">{unreadCount}</span>
                      )}
                  </button>
                  <button
                      onClick={() => setActiveTab('ALL')}
                      className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex-1 md:flex-none justify-center ${
                          activeTab === 'ALL' 
                              ? 'bg-white text-indigo-600 shadow-sm' 
                              : 'text-slate-500 hover:text-slate-700'
                      }`}
                  >
                      Historial Completo
                  </button>
              </div>

              {/* SEARCH */}
              <div className="relative w-full md:w-64">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                      type="text" 
                      placeholder="Buscar notificación..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                  />
              </div>
          </div>

          {/* LIST CONTENT */}
          <div className="flex-1">
            {paginatedNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-slate-400">
                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        {searchTerm ? <Filter size={32} /> : <Inbox size={32} />}
                    </div>
                    <p className="font-medium">
                        {searchTerm 
                            ? "No se encontraron resultados para tu búsqueda." 
                            : (activeTab === 'UNREAD' ? "¡Estás al día! No tienes pendientes." : "Bandeja vacía.")}
                    </p>
                    {activeTab === 'UNREAD' && !searchTerm && notifications.length > 0 && (
                        <button onClick={() => setActiveTab('ALL')} className="mt-2 text-sm text-indigo-600 hover:underline">
                            Ver historial completo
                        </button>
                    )}
                </div>
            ) : (
                <div className="divide-y divide-slate-100">
                    {paginatedNotifications.map(notif => (
                        <div 
                          key={notif.id} 
                          onClick={() => handleItemClick(notif)}
                          className={`p-4 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-4 group
                              ${!notif.isRead ? 'bg-indigo-50/30' : ''}`}
                        >
                            {/* Icon Indicator */}
                            <div className="mt-1 relative">
                                {getIcon(notif.type)}
                                {!notif.isRead && (
                                    <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>
                                )}
                            </div>

                            <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-1">
                                      <h4 className={`text-sm truncate pr-2 ${!notif.isRead ? 'font-bold text-slate-900' : 'font-medium text-slate-700'}`}>
                                          {notif.title}
                                      </h4>
                                      <span className="text-xs text-slate-400 flex-shrink-0 whitespace-nowrap">
                                          {new Date(notif.timestamp).toLocaleDateString()}
                                      </span>
                                  </div>
                                  <p className={`text-sm mb-2 line-clamp-2 ${!notif.isRead ? 'text-slate-800' : 'text-slate-500'}`}>
                                      {notif.message}
                                  </p>
                                  
                                  <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2 text-xs text-slate-400">
                                          <span className="bg-slate-100 px-1.5 py-0.5 rounded font-medium text-slate-600">{notif.actorName}</span>
                                          <span>•</span>
                                          <span className="capitalize">{new Date(notif.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                                      </div>
                                      
                                      <div className="opacity-0 group-hover:opacity-100 transition-opacity text-indigo-600 text-xs font-bold flex items-center gap-1">
                                          Ver Detalle <ArrowRight size={12} />
                                      </div>
                                  </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>

          {/* FOOTER: PAGINATION */}
          {filteredNotifications.length > ITEMS_PER_PAGE && (
              <div className="border-t border-slate-100 p-3 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
                  <span>
                      Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)} de {filteredNotifications.length}
                  </span>
                  
                  <div className="flex items-center gap-2">
                      <button 
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="p-1.5 rounded-md hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-slate-200 transition-all"
                      >
                          <ChevronLeft size={16} />
                      </button>
                      <span className="font-medium px-2">
                          Página {currentPage} de {totalPages}
                      </span>
                      <button 
                          onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                          disabled={currentPage === totalPages}
                          className="p-1.5 rounded-md hover:bg-white hover:shadow-sm disabled:opacity-50 disabled:cursor-not-allowed border border-transparent hover:border-slate-200 transition-all"
                      >
                          <ChevronRight size={16} />
                      </button>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default Buffer;
