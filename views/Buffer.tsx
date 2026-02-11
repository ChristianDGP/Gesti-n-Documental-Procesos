
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { NotificationService } from '../services/firebaseBackend';
import { User, Notification } from '../types';
import { Inbox, CheckCircle, Mail, User as UserIcon, MessageSquare, AlertTriangle, CheckSquare, ArrowRight, Search, ChevronLeft, ChevronRight, Filter, Upload, Square, Loader2, RotateCcw } from 'lucide-react';

interface Props {
  user: User;
}

const ITEMS_PER_PAGE = 10;

const Buffer: React.FC<Props> = ({ user }) => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const navigate = useNavigate();

  // UI States
  const [activeTab, setActiveTab] = useState<'PENDING' | 'HISTORY'>('PENDING');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  useEffect(() => {
    setLoading(true);
    const unsubscribe = NotificationService.subscribeToNotifications(user.id, (data) => {
        setNotifications(data);
        setLoading(false);
    });
    
    return () => unsubscribe();
  }, [user.id]);

  // Filtrado de notificaciones basado en la pestaña activa
  const filteredNotifications = useMemo(() => {
      return notifications.filter(n => {
          // Si estamos en PENDING, mostramos solo los NO leídos
          if (activeTab === 'PENDING' && n.isRead) return false;
          // Si estamos en HISTORY, mostramos solo los SI leídos
          if (activeTab === 'HISTORY' && !n.isRead) return false;
          
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

  const unreadCount = notifications.filter(n => !n.isRead).length;

  // Manejo de Selección
  const toggleSelect = (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
  };

  const toggleSelectAll = () => {
      const visibleIds = paginatedNotifications.map(n => n.id);
      const allVisibleSelected = visibleIds.every(id => selectedIds.has(id));

      const next = new Set(selectedIds);
      if (allVisibleSelected) {
          visibleIds.forEach(id => next.delete(id));
      } else {
          visibleIds.forEach(id => next.add(id));
      }
      setSelectedIds(next);
  };

  const handleUpdateStatus = async () => {
      if (selectedIds.size === 0) return;
      
      const newStatus = activeTab === 'PENDING'; // Si estamos en pendientes, pasamos a leídos (true). Si no, a no leídos (false).
      
      await NotificationService.updateMultipleReadStatus([...selectedIds], newStatus);
      setSelectedIds(new Set());
  };

  const handleItemClick = async (notif: Notification, e: React.MouseEvent) => {
      // Si el click viene del área del checkbox, no navegar
      if ((e.target as HTMLElement).closest('.selection-trigger')) return;

      if (!notif.isRead) {
          await NotificationService.markAsRead(notif.id);
      }
      
      if (notif.documentId.startsWith('MTX_')) {
          navigate('/new');
      } else {
          navigate(`/doc/${notif.documentId}`);
      }
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

  useEffect(() => {
      setCurrentPage(1);
      setSelectedIds(new Set());
  }, [activeTab, searchTerm]);

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" />Cargando bandeja...</div>;

  const allVisibleSelected = paginatedNotifications.length > 0 && paginatedNotifications.every(n => selectedIds.has(n.id));

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <Inbox className="text-indigo-600" />
                Bandeja de Entrada
            </h1>
            <p className="text-slate-500 text-sm">
                Gestiona tus avisos y solicitudes de validación formal.
            </p>
        </div>
        
        <div className="h-10 flex items-center">
            {selectedIds.size > 0 && (
                <button 
                    onClick={handleUpdateStatus}
                    className={`text-xs text-white font-black uppercase tracking-widest px-5 py-2.5 rounded-xl transition-all shadow-lg flex items-center gap-2 animate-fadeIn 
                        ${activeTab === 'PENDING' ? 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100' : 'bg-slate-700 hover:bg-slate-800 shadow-slate-100'}`}
                >
                    {activeTab === 'PENDING' ? <CheckCircle size={16} /> : <RotateCcw size={16} />}
                    {activeTab === 'PENDING' ? 'Marcar como leídos' : 'Marcar como no leídos'} ({selectedIds.size})
                </button>
            )}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[600px] flex flex-col">
          {/* BARRA DE HERRAMIENTAS */}
          <div className="border-b border-slate-100 bg-slate-50/50 p-4 flex flex-col lg:flex-row gap-4 justify-between items-center">
              
              <div className="flex items-center gap-4 w-full lg:w-auto">
                  {/* SELECTOR MAESTRO */}
                  <button 
                    onClick={toggleSelectAll}
                    disabled={paginatedNotifications.length === 0}
                    className={`flex items-center justify-center w-9 h-9 rounded-xl border transition-all disabled:opacity-30
                        ${allVisibleSelected 
                            ? 'bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-100' 
                            : 'bg-white border-slate-300 text-slate-300 hover:border-indigo-400'}`}
                    title="Seleccionar visibles"
                  >
                    {allVisibleSelected ? <CheckSquare size={18}/> : <Square size={18}/>}
                  </button>

                  <div className="flex bg-slate-200/50 p-1 rounded-xl w-full md:w-auto">
                      <button
                          onClick={() => setActiveTab('PENDING')}
                          className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex items-center gap-2 flex-1 md:flex-none justify-center ${
                              activeTab === 'PENDING' 
                                  ? 'bg-white text-indigo-600 shadow-sm' 
                                  : 'text-slate-500 hover:text-slate-700'
                          }`}
                      >
                          Pendientes
                          {unreadCount > 0 && (
                              <span className="bg-red-500 text-white text-[10px] px-2 py-0.5 rounded-full min-w-[20px] text-center font-black animate-pulse">{unreadCount}</span>
                          )}
                      </button>
                      <button
                          onClick={() => setActiveTab('HISTORY')}
                          className={`px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all flex-1 md:flex-none justify-center ${
                              activeTab === 'HISTORY' 
                                  ? 'bg-white text-indigo-600 shadow-sm' 
                                  : 'text-slate-500 hover:text-slate-700'
                          }`}
                      >
                          Historial
                      </button>
                  </div>
              </div>

              <div className="relative w-full lg:w-80">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input 
                      type="text" 
                      placeholder="Buscar por título o actor..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none bg-white transition-all font-medium"
                  />
              </div>
          </div>

          {/* LISTADO DE MENSAJES */}
          <div className="flex-1">
            {paginatedNotifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 text-slate-400">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                        {searchTerm ? <Filter size={40} className="opacity-20" /> : <Inbox size={40} className="opacity-20" />}
                    </div>
                    <p className="font-bold text-slate-500">
                        {searchTerm 
                            ? "Sin resultados para la búsqueda." 
                            : (activeTab === 'PENDING' ? "¡Bandeja limpia! No tienes pendientes." : "Tu historial está vacío.")}
                    </p>
                </div>
            ) : (
                <div className="divide-y divide-slate-50">
                    {paginatedNotifications.map(notif => (
                        <div 
                          key={notif.id} 
                          onClick={(e) => handleItemClick(notif, e)}
                          className={`group p-4 flex items-start gap-4 transition-all cursor-pointer relative
                              ${!notif.isRead ? 'bg-indigo-50/20' : 'bg-white hover:bg-slate-50/50'} 
                              ${selectedIds.has(notif.id) ? 'bg-indigo-50/40 border-l-4 border-l-indigo-500' : 'border-l-4 border-l-transparent'}`}
                        >
                            {/* Checkbox Individual */}
                            <div 
                                className="selection-trigger mt-1.5 p-1 rounded-lg hover:bg-indigo-100 transition-colors z-10"
                                onClick={(e) => toggleSelect(notif.id, e)}
                            >
                                {selectedIds.has(notif.id) ? (
                                    <CheckSquare size={22} className="text-indigo-600 drop-shadow-sm" />
                                ) : (
                                    <Square size={22} className="text-slate-200 group-hover:text-indigo-300" />
                                )}
                            </div>

                            {/* Icono de Tipo */}
                            <div className="mt-1.5 shrink-0">
                                <div className={`p-2 rounded-xl border ${!notif.isRead ? 'bg-white border-indigo-100 shadow-sm' : 'bg-slate-50 border-transparent text-slate-400'}`}>
                                    {getIcon(notif.type)}
                                </div>
                            </div>

                            <div className="flex-1 min-w-0">
                                  <div className="flex justify-between items-start mb-1">
                                      <h4 className={`text-sm truncate pr-4 ${!notif.isRead ? 'font-black text-slate-900' : 'font-bold text-slate-500'}`}>
                                          {notif.title}
                                      </h4>
                                      <span className="text-[10px] font-black text-slate-300 uppercase whitespace-nowrap bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                                          {new Date(notif.timestamp).toLocaleDateString()}
                                      </span>
                                  </div>
                                  <p className={`text-sm leading-relaxed mb-3 line-clamp-2 ${!notif.isRead ? 'text-slate-700 font-medium' : 'text-slate-400'}`}>
                                      {notif.message}
                                  </p>
                                  
                                  <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                          <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase tracking-tighter shadow-sm
                                            ${!notif.isRead ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                              {notif.actorName}
                                          </span>
                                          <span className="text-[10px] text-slate-300 font-bold">•</span>
                                          <span className="text-[10px] text-slate-400 font-bold uppercase">
                                              {new Date(notif.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                          </span>
                                      </div>
                                      
                                      <div className="opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0 text-indigo-600 text-[10px] font-black uppercase flex items-center gap-1.5 bg-indigo-50 px-3 py-1 rounded-lg">
                                          {notif.documentId.startsWith('MTX_') ? 'Ir a Nueva Solicitud' : 'Gestionar Documento'} <ArrowRight size={12} />
                                      </div>
                                  </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
          </div>

          {/* PAGINACIÓN */}
          {filteredNotifications.length > ITEMS_PER_PAGE && (
              <div className="border-t border-slate-100 p-4 bg-slate-50/50 flex items-center justify-between">
                  <div className="text-[11px] font-black text-slate-400 uppercase tracking-widest">
                      Registros {((currentPage - 1) * ITEMS_PER_PAGE) + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredNotifications.length)} de {filteredNotifications.length}
                  </div>
                  
                  <div className="flex items-center gap-2">
                      <button 
                          onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                          disabled={currentPage === 1}
                          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-30 transition-all shadow-sm active:scale-95"
                      >
                          <ChevronLeft size={18} />
                      </button>
                      <div className="px-4 text-xs font-black text-slate-500 uppercase tracking-tighter">
                          Pág. {currentPage} / {totalPages}
                      </div>
                      <button 
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          disabled={currentPage === totalPages}
                          className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-30 transition-all shadow-sm active:scale-95"
                      >
                          <ChevronRight size={18} />
                      </button>
                  </div>
              </div>
          )}
      </div>
    </div>
  );
};

export default Buffer;
