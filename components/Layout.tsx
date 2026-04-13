
import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Menu, X, FileText, BarChart2, PlusCircle, LogOut, User as UserIcon, Users, ClipboardList, Inbox, Database, Settings, ListTodo, Network, PieChart, UserCheck, BookOpen, CalendarRange, History, Link as LinkIcon } from 'lucide-react';
import { User, UserRole, DocState, Document, Notification } from '../types';
import { NotificationService } from '../services/firebaseBackend';
import { toast } from 'sonner';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const lastNotifId = useRef<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const isActive = (path: string) => location.pathname === path ? 'bg-slate-800 text-white shadow-inner' : 'text-slate-300 hover:bg-slate-800 hover:text-white';

  useEffect(() => {
    if (!user?.id) return;
    
    // Establishing reliable real-time connection for notification badge and toasts
    const unsubscribe = NotificationService.subscribeToNotifications(user.id, (notifs) => {
        const unread = notifs.filter(n => !n.isRead);
        setInboxCount(unread.length);
        
        // Show toast for new unread notification
        if (unread.length > 0) {
            const latest = unread[0];
            // Only show if it's a new ID and not the one we already saw
            if (latest.id !== lastNotifId.current) {
                // If this is the first load, we don't want to spam toasts for all old unread ones
                // So we only toast if lastNotifId was already set or if the notification is very recent (last 30 seconds)
                const isRecent = (new Date().getTime() - new Date(latest.timestamp).getTime()) < 30000;
                
                if (lastNotifId.current !== null || isRecent) {
                    toast(latest.title, {
                        description: latest.message,
                        action: {
                            label: 'Ver',
                            onClick: () => {
                                if (latest.documentId.startsWith('MTX_')) {
                                    navigate(`/new?assignmentId=${latest.documentId}`);
                                } else {
                                    navigate(`/doc/${latest.documentId}`);
                                }
                            }
                        }
                    });
                }
                lastNotifId.current = latest.id;
            }
        }
    });
    
    return () => {
        if (unsubscribe) unsubscribe();
    };
  }, [user?.id, navigate]); 

  const NavItem = ({ to, icon: Icon, label, badge }: { to: string, icon: any, label: string, badge?: number }) => (
    <Link
      to={to}
      onClick={() => setIsSidebarOpen(false)}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-all duration-200 group ${isActive(to)}`}
    >
      <div className="relative">
        <Icon 
            size={20} 
            className={isActive(to).includes('bg-slate-800') ? 'text-indigo-400' : 'text-slate-400 group-hover:text-white'} 
        />
        {badge !== undefined && badge > 0 && (
            <span className="absolute -top-2.5 -right-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-[10px] font-black text-white shadow-md ring-2 ring-slate-900 animate-pulse px-1">
                {badge > 99 ? '99+' : badge}
            </span>
        )}
      </div>
      <span className="font-medium flex-1">{label}</span>
    </Link>
  );

  const roleUpper = (user.role || '').toString().toUpperCase();
  const isGuest = roleUpper === 'GUEST';
  const isAdminOrCoord = roleUpper === 'ADMIN' || roleUpper === 'COORDINATOR' || roleUpper === 'COORDINADOR';
  
  const canAccessReports = isAdminOrCoord || ((user.role === UserRole.ANALYST || isGuest) && (user.canAccessReports || user.canAccessReportGestion || user.canAccessReportContinuity || user.canAccessReportMonthly || user.canAccessBIQueryBuilder));
  const canAccessReferents = isAdminOrCoord || (user.role === UserRole.ANALYST && (user.canAccessReferents || user.canAccessReferentsByProcess || user.canAccessReferentsDirectory));
  const canAccessGantt = isAdminOrCoord || ((user.role === UserRole.ANALYST || isGuest) && user.canAccessGantt);
  const canAccessReuseMatrix = isAdminOrCoord || (user.role === UserRole.ANALYST && (user.canAccessReuseMatrix || user.canAccessReuseMatrixLink || user.canAccessReuseMatrixView || user.canAccessReuseMatrixIntersect));
  const canAccessStructure = isAdminOrCoord || (user.role === UserRole.ANALYST && user.canAccessStructure);
  const canAccessAssignments = isAdminOrCoord || (user.role === UserRole.ANALYST && user.canAccessAssignments);
  const canAccessLog = user.role === UserRole.ADMIN || (user.role === UserRole.ANALYST && user.canAccessLog);

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {isSidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-20 md:hidden backdrop-blur-sm transition-opacity" onClick={() => setIsSidebarOpen(false)} />
      )}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-300 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center flex-shrink-0 bg-slate-950/30">
            <div>
                <h1 className="text-xl font-bold tracking-tight text-white">SGD</h1>
                <p className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest">{isGuest ? 'Visor Institucional' : 'Gestión Documental'}</p>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400 hover:text-white">
                <X size={24} />
            </button>
          </div>
          <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
            {!isGuest && (
              <>
                <div className="pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4">Operación Diaria</div>
                <NavItem to="/inbox" icon={Inbox} label="Bandeja de Entrada" badge={inboxCount} />
                <NavItem to="/worklist" icon={ListTodo} label="Lista de Trabajo" />
                <NavItem to="/new" icon={PlusCircle} label="Nueva Solicitud" />
              </>
            )}
            
            <div className="pt-6 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4">Visualización y Análisis</div>
            <NavItem to="/dashboard" icon={BarChart2} label="Dashboard" />
            
            {(canAccessReports || canAccessReferents || canAccessGantt || canAccessStructure || canAccessAssignments || canAccessReuseMatrix || canAccessLog || isAdminOrCoord) && (
              <>
                {canAccessReports && <NavItem to="/admin/reports" icon={PieChart} label="Reportes" />}
                {canAccessGantt && <NavItem to="/admin/gantt" icon={CalendarRange} label="Diagrama Gantt" />}
                {canAccessLog && <NavItem to="/admin/events" icon={History} label="Log de Eventos" />}
                {(canAccessStructure || canAccessAssignments || canAccessReuseMatrix) && (
                    <>
                        {canAccessStructure && <NavItem to="/admin/structure" icon={Network} label="Estructura" />}
                        {canAccessAssignments && <NavItem to="/admin/assignments" icon={ClipboardList} label="Asignaciones" />}
                        {canAccessReuseMatrix && <NavItem to="/admin/reuse" icon={LinkIcon} label="Matriz Reutilizables" />}
                    </>
                )}
                {canAccessReferents && <NavItem to="/admin/referents" icon={UserCheck} label="Referentes" />}
                {user.role === UserRole.ADMIN && (
                    <>
                        <NavItem to="/admin/database" icon={Database} label="Base de Datos" />
                        <NavItem to="/admin/users" icon={Users} label="Usuarios" />
                    </>
                )}
              </>
            )}
            <div className="pt-6 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-widest px-4">Mi Cuenta</div>
            {!isGuest && <NavItem to="/manual" icon={BookOpen} label="Manual de Usuario" />}
            <NavItem to="/profile" icon={Settings} label="Mi Perfil" />
          </nav>
          <div className="p-4 border-t border-slate-800 flex-shrink-0 bg-slate-950/20">
            <button onClick={onLogout} className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-red-900/40 hover:text-red-200 p-2.5 rounded-lg transition-all text-sm font-semibold border border-transparent hover:border-red-800/50">
                <LogOut size={16} />
                <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        <header className="bg-white border-b border-gray-200 p-4 flex items-center justify-between md:hidden flex-shrink-0 shadow-sm">
            <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600 hover:bg-slate-50 p-1 rounded-md"><Menu size={24} /></button>
            <div className="flex flex-col items-center">
              <span className="font-bold text-slate-900 text-sm">SGD Visor</span>
              <span className="text-[10px] text-indigo-600 font-bold uppercase tracking-tight">Acceso Lectura</span>
            </div>
            <div className="w-6" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-8 bg-slate-50/50">{children}</main>
      </div>
    </div>
  );
};

export default Layout;
