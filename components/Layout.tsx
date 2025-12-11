
import React, { useState, useEffect } from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { Menu, X, FileText, BarChart2, PlusCircle, LogOut, User as UserIcon, Users, ClipboardList, Inbox, Database, Settings } from 'lucide-react';
import { User, UserRole, DocState, Document } from '../types';
import { DocumentService } from '../services/firebaseBackend';

interface LayoutProps {
  children: React.ReactNode;
  user: User;
  onLogout: () => void;
}

const Layout: React.FC<LayoutProps> = ({ children, user, onLogout }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [inboxCount, setInboxCount] = useState(0);
  const location = useLocation();

  const isActive = (path: string) => location.pathname === path ? 'bg-slate-800 text-white' : 'text-slate-300 hover:bg-slate-800 hover:text-white';

  // Fetch Inbox Count Logic
  useEffect(() => {
    const fetchCount = async () => {
        try {
            const docs = await DocumentService.getAll();
            let count = 0;
            
            const scope = user.role === UserRole.ANALYST 
                ? docs.filter(d => d.authorId === user.id || (d.assignees && d.assignees.includes(user.id)))
                : docs;

            if (user.role === UserRole.COORDINATOR) {
                count = scope.filter(d => 
                    d.hasPendingRequest === true && 
                    (d.state === DocState.INTERNAL_REVIEW || d.state === DocState.SENT_TO_REFERENT)
                ).length;
            } else if (user.role === UserRole.ANALYST) {
                count = scope.filter(d => 
                    d.state === DocState.REJECTED || 
                    d.state === DocState.INITIATED ||
                    d.state === DocState.IN_PROCESS
                ).length;
            } else if (user.role === UserRole.ADMIN) {
                count = scope.filter(d => d.hasPendingRequest === true).length;
            }
            setInboxCount(count);
        } catch (e) {
            console.error("Error fetching inbox count", e);
        }
    };
    
    fetchCount();
  }, [location.pathname]); // Re-fetch on navigation

  const NavItem = ({ to, icon: Icon, label, badge }: { to: string, icon: any, label: string, badge?: number }) => (
    <Link
      to={to}
      onClick={() => setIsSidebarOpen(false)}
      className={`flex items-center space-x-3 px-4 py-3 rounded-lg transition-colors ${isActive(to)}`}
    >
      <Icon size={20} />
      <span className="font-medium flex-1">{label}</span>
      {badge !== undefined && badge > 0 && (
          <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-auto">
              {badge}
          </span>
      )}
    </Link>
  );

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 md:hidden" 
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-30 w-64 bg-slate-900 text-white transform transition-transform duration-200 ease-in-out md:translate-x-0 md:static md:flex-shrink-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <div>
                <h1 className="text-xl font-bold tracking-tight">SGD</h1>
                <p className="text-xs text-slate-400">Gestión Documental</p>
            </div>
            <button onClick={() => setIsSidebarOpen(false)} className="md:hidden text-slate-400">
                <X size={24} />
            </button>
          </div>

          <nav className="flex-1 px-4 py-6 space-y-2">
            <NavItem to="/" icon={BarChart2} label="Dashboard" />
            <NavItem to="/inbox" icon={Inbox} label="Bandeja de Entrada" badge={inboxCount} />
            <NavItem to="/new" icon={PlusCircle} label="Nueva Solicitud" />
            
            {/* Assignments for Coordinator and Admin */}
            {(user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) && (
                 <NavItem to="/admin/assignments" icon={ClipboardList} label="Asignaciones" />
            )}

            <div className="pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider px-4">Cuenta</div>
            <NavItem to="/profile" icon={Settings} label="Mi Perfil" />
            
            {/* Admin Only */}
            {user.role === UserRole.ADMIN && (
              <>
                <div className="pt-4 pb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider px-4">Administración</div>
                <NavItem to="/admin/users" icon={Users} label="Usuarios" />
                <NavItem to="/admin/database" icon={Database} label="Base de Datos" />
              </>
            )}
          </nav>

          <div className="p-4 border-t border-slate-800">
            <div className="flex items-center space-x-3 mb-4 px-2">
                <div className="w-10 h-10 rounded-full bg-indigo-500 flex items-center justify-center text-sm font-bold overflow-hidden">
                    {user.avatar && user.avatar.startsWith('http') ? (
                        <img src={user.avatar} alt="avatar" className="w-full h-full object-cover" />
                    ) : (
                        user.name.charAt(0)
                    )}
                </div>
                <div className="overflow-hidden">
                    <p className="text-sm font-medium truncate">{user.name}</p>
                    <p className="text-xs text-slate-400 truncate capitalize">{user.role.toLowerCase()}</p>
                </div>
            </div>
            <button 
                onClick={onLogout}
                className="w-full flex items-center justify-center space-x-2 bg-slate-800 hover:bg-slate-700 p-2 rounded-md transition-colors text-sm"
            >
                <LogOut size={16} />
                <span>Cerrar Sesión</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden">
        {/* Mobile Header */}
        <header className="bg-white border-b border-gray-200 p-4 flex items-center justify-between md:hidden">
            <button onClick={() => setIsSidebarOpen(true)} className="text-slate-600">
                <Menu size={24} />
            </button>
            <span className="font-semibold text-slate-800">SGD Mobile</span>
            <div className="w-6" /> {/* Spacer */}
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
            {children}
        </main>
      </div>
    </div>
  );
};

export default Layout;
