
import React, { useState, useEffect } from 'react';
import { UserService } from '../services/firebaseBackend';
import { User, UserRole } from '../types';
import { Trash2, UserPlus, Shield, Briefcase, User as UserIcon, X, Lock, Pencil, Power, AlertCircle, CheckCircle, PieChart, UserCheck, Loader2, CalendarRange, Link as LinkIcon, Network, ClipboardList, History } from 'lucide-react';

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.ANALYST);
  const [organization, setOrganization] = useState('');
  const [password, setPassword] = useState('');
  const [canAccessReports, setCanAccessReports] = useState(false);
  const [canAccessReportGestion, setCanAccessReportGestion] = useState(false);
  const [canAccessReportContinuity, setCanAccessReportContinuity] = useState(false);
  const [canAccessReportMonthly, setCanAccessReportMonthly] = useState(false);
  const [canAccessReferents, setCanAccessReferents] = useState(false);
  const [canAccessReferentsByProcess, setCanAccessReferentsByProcess] = useState(false);
  const [canAccessReferentsDirectory, setCanAccessReferentsDirectory] = useState(false);
  const [canAccessGantt, setCanAccessGantt] = useState(false);
  const [canAccessReuseMatrix, setCanAccessReuseMatrix] = useState(false);
  const [canAccessReuseMatrixLink, setCanAccessReuseMatrixLink] = useState(false);
  const [canAccessReuseMatrixView, setCanAccessReuseMatrixView] = useState(false);
  const [canAccessStructure, setCanAccessStructure] = useState(false);
  const [canAccessAssignments, setCanAccessAssignments] = useState(false);
  const [canAccessLog, setCanAccessLog] = useState(false);
  const [canAuditEvents, setCanAuditEvents] = useState(false);
  const [canEditGanttDate, setCanEditGanttDate] = useState(false);
  const [canAddStructure, setCanAddStructure] = useState(false);
  const [canEditStructure, setCanEditStructure] = useState(false);
  const [canEditMasterData, setCanEditMasterData] = useState(false);
  const [canAssignDefinedDocs, setCanAssignDefinedDocs] = useState(false);
  const [canManageAssignments, setCanManageAssignments] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const data = await UserService.getAll();
    setUsers(data);
    setLoading(false);
  };

  const handleTogglePermission = async (user: User, field: 'canAccessReports' | 'canAccessReferents' | 'canAccessGantt' | 'canAccessReportGestion' | 'canAccessReportContinuity' | 'canAccessReportMonthly' | 'canAccessReuseMatrix' | 'canAccessReferentsByProcess' | 'canAccessReferentsDirectory' | 'canAccessReuseMatrixLink' | 'canAccessReuseMatrixView' | 'canAccessStructure' | 'canAccessAssignments' | 'canAccessLog') => {
      setUpdatingId(`${user.id}-${field}`);
      const newValue = !user[field];
      
      try {
          const updatePayload: any = { [field]: newValue };
          
          // Lógica de cascada para reportes
          if (field === 'canAccessReports') {
              updatePayload.canAccessReportGestion = newValue;
              updatePayload.canAccessReportContinuity = newValue;
              updatePayload.canAccessReportMonthly = newValue;
          }

          // Lógica de cascada para referentes
          if (field === 'canAccessReferents') {
              updatePayload.canAccessReferentsByProcess = newValue;
              updatePayload.canAccessReferentsDirectory = newValue;
          }

          // Lógica de cascada para matriz
          if (field === 'canAccessReuseMatrix') {
              updatePayload.canAccessReuseMatrixLink = newValue;
              updatePayload.canAccessReuseMatrixView = newValue;
          }
          
          await UserService.update(user.id, updatePayload);
          
          // Actualización optimista local
          setUsers(prev => prev.map(u => u.id === user.id ? { ...u, ...updatePayload } : u));
      } catch (error) {
          console.error(error);
          alert('Error al actualizar permisos');
      } finally {
          setUpdatingId(null);
      }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que quieres eliminar permanentemente este usuario? Esta acción es irreversible.')) return;
    try {
        await UserService.delete(id);
        await loadUsers();
    } catch (error) {
        console.error(error);
    }
  };

  const handleToggleStatus = async (user: User) => {
      const action = user.active !== false ? 'inactivar' : 'activar';
      if (!window.confirm(`¿Está seguro que desea ${action} al usuario ${user.name}?`)) return;
      
      try {
          await UserService.toggleActiveStatus(user.id, user.active !== false);
          await loadUsers();
      } catch (error) {
          console.error(error);
          alert('Error al cambiar estado del usuario');
      }
  };

  const handleEdit = (user: User) => {
      setEditingUserId(user.id);
      setName(user.name);
      setEmail(user.email);
      setNickname(user.nickname || '');
      setRole(user.role);
      setOrganization(user.organization);
      setPassword(''); 
      setCanAccessReports(user.canAccessReports || false);
      setCanAccessReportGestion(user.canAccessReportGestion || false);
      setCanAccessReportContinuity(user.canAccessReportContinuity || false);
      setCanAccessReportMonthly(user.canAccessReportMonthly || false);
      setCanAccessReferents(user.canAccessReferents || false);
      setCanAccessReferentsByProcess(user.canAccessReferentsByProcess || false);
      setCanAccessReferentsDirectory(user.canAccessReferentsDirectory || false);
      setCanAccessGantt(user.canAccessGantt || false);
      setCanAccessReuseMatrix(user.canAccessReuseMatrix || false);
      setCanAccessReuseMatrixLink(user.canAccessReuseMatrixLink || false);
      setCanAccessReuseMatrixView(user.canAccessReuseMatrixView || false);
      setCanAccessStructure(user.canAccessStructure || false);
      setCanAccessAssignments(user.canAccessAssignments || false);
      setCanAssignDefinedDocs(user.canAssignDefinedDocs || false);
      setCanManageAssignments(user.canManageAssignments || false);
      setCanAccessLog(user.canAccessLog || false);
      setCanAuditEvents(user.canAuditEvents || false);
      setCanEditGanttDate(user.canEditGanttDate || false);
      setCanAddStructure(user.canAddStructure || false);
      setCanEditStructure(user.canEditStructure || false);
      setCanEditMasterData(user.canEditMasterData || false);
      setShowForm(true);
  };

  const handleCreateNew = () => {
      setEditingUserId(null);
      resetForm();
      setShowForm(true);
  };

  const handleCancel = () => {
      setShowForm(false);
      resetForm();
      setEditingUserId(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !organization) return;
    
    let finalEmail = email;
    if (!finalEmail.includes('@')) {
        finalEmail += '@ugp-ssmso.cl';
    }

    try {
        if (editingUserId) {
            const updatePayload: Partial<User> = {
                name,
                email: finalEmail,
                nickname: nickname || undefined,
                role,
                organization,
                canAccessReports: role === UserRole.ADMIN ? true : canAccessReports,
                canAccessReportGestion: role === UserRole.ADMIN ? true : canAccessReportGestion,
                canAccessReportContinuity: role === UserRole.ADMIN ? true : canAccessReportContinuity,
                canAccessReportMonthly: role === UserRole.ADMIN ? true : canAccessReportMonthly,
                canAccessReferents: role === UserRole.ADMIN ? true : (role === UserRole.GUEST ? false : canAccessReferents),
                canAccessReferentsByProcess: role === UserRole.ADMIN ? true : (role === UserRole.GUEST ? false : canAccessReferentsByProcess),
                canAccessReferentsDirectory: role === UserRole.ADMIN ? true : (role === UserRole.GUEST ? false : canAccessReferentsDirectory),
                canAccessGantt: role === UserRole.ADMIN ? true : canAccessGantt,
                canAccessReuseMatrix: role === UserRole.ADMIN ? true : canAccessReuseMatrix,
                canAccessReuseMatrixLink: role === UserRole.ADMIN ? true : canAccessReuseMatrixLink,
                canAccessReuseMatrixView: role === UserRole.ADMIN ? true : canAccessReuseMatrixView,
                canAccessStructure: role === UserRole.ADMIN ? true : canAccessStructure,
                canAddStructure: role === UserRole.ADMIN ? true : canAddStructure,
                canEditStructure: role === UserRole.ADMIN ? true : canEditStructure,
                canEditMasterData: role === UserRole.ADMIN ? true : canEditMasterData,
                canAccessAssignments: role === UserRole.ADMIN ? true : canAccessAssignments,
                canAssignDefinedDocs: role === UserRole.ADMIN ? true : canAssignDefinedDocs,
                canManageAssignments: role === UserRole.ADMIN ? true : canManageAssignments,
                canAccessLog: role === UserRole.ADMIN ? true : canAccessLog,
                canAuditEvents: role === UserRole.ADMIN ? true : canAuditEvents,
                canEditGanttDate: role === UserRole.ADMIN ? true : canEditGanttDate
            };
            if (password) {
                updatePayload.password = password;
            }
            await UserService.update(editingUserId, updatePayload);
        } else {
            await UserService.create({
                id: `user-${Date.now()}`,
                name,
                email: finalEmail,
                nickname: nickname || undefined,
                role,
                organization,
                password: password || undefined,
                active: true,
                canAccessReports: role === UserRole.ADMIN ? true : canAccessReports,
                canAccessReportGestion: role === UserRole.ADMIN ? true : canAccessReportGestion,
                canAccessReportContinuity: role === UserRole.ADMIN ? true : canAccessReportContinuity,
                canAccessReportMonthly: role === UserRole.ADMIN ? true : canAccessReportMonthly,
                canAccessReferents: role === UserRole.ADMIN ? true : (role === UserRole.GUEST ? false : canAccessReferents),
                canAccessReferentsByProcess: role === UserRole.ADMIN ? true : (role === UserRole.GUEST ? false : canAccessReferentsByProcess),
                canAccessReferentsDirectory: role === UserRole.ADMIN ? true : (role === UserRole.GUEST ? false : canAccessReferentsDirectory),
                canAccessGantt: role === UserRole.ADMIN ? true : canAccessGantt,
                canAccessReuseMatrix: role === UserRole.ADMIN ? true : canAccessReuseMatrix,
                canAccessReuseMatrixLink: role === UserRole.ADMIN ? true : canAccessReuseMatrixLink,
                canAccessReuseMatrixView: role === UserRole.ADMIN ? true : canAccessReuseMatrixView,
                canAccessStructure: role === UserRole.ADMIN ? true : canAccessStructure,
                canAddStructure: role === UserRole.ADMIN ? true : canAddStructure,
                canEditStructure: role === UserRole.ADMIN ? true : canEditStructure,
                canEditMasterData: role === UserRole.ADMIN ? true : canEditMasterData,
                canAccessAssignments: role === UserRole.ADMIN ? true : canAccessAssignments,
                canAssignDefinedDocs: role === UserRole.ADMIN ? true : canAssignDefinedDocs,
                canManageAssignments: role === UserRole.ADMIN ? true : canManageAssignments,
                canAccessLog: role === UserRole.ADMIN ? true : canAccessLog,
                canAuditEvents: role === UserRole.ADMIN ? true : canAuditEvents,
                canEditGanttDate: role === UserRole.ADMIN ? true : canEditGanttDate
            } as User);
        }
        
        setShowForm(false);
        resetForm();
        setEditingUserId(null);
        await loadUsers();
    } catch (err: any) {
        alert(err.message);
    }
  };

  const resetForm = () => {
      setName('');
      setEmail('');
      setNickname('');
      setOrganization('');
      setRole(UserRole.ANALYST);
      setPassword('');
      setCanAccessReports(false);
      setCanAccessReportGestion(false);
      setCanAccessReportContinuity(false);
      setCanAccessReportMonthly(false);
      setCanAccessReferents(false);
      setCanAccessReferentsByProcess(false);
      setCanAccessReferentsDirectory(false);
      setCanAccessGantt(false);
      setCanAccessReuseMatrix(false);
      setCanAccessReuseMatrixLink(false);
      setCanAccessReuseMatrixView(false);
      setCanAccessStructure(false);
      setCanAddStructure(false);
      setCanEditStructure(false);
      setCanEditMasterData(false);
      setCanAccessAssignments(false);
      setCanAssignDefinedDocs(false);
      setCanManageAssignments(false);
      setCanAccessLog(false);
      setCanAuditEvents(false);
      setCanEditGanttDate(false);
  };

  return (
    <div className="space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
                <h1 className="text-2xl font-bold text-slate-900">Gestión de Usuarios</h1>
                <p className="text-slate-500">Administra perfiles, permisos y estados de acceso.</p>
            </div>
            <button 
                onClick={showForm ? handleCancel : handleCreateNew}
                className={`inline-flex items-center px-4 py-2 text-white rounded-lg transition-colors shadow-sm ${showForm ? 'bg-slate-500 hover:bg-slate-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
                {showForm ? <X size={18} className="mr-2" /> : <UserPlus size={18} className="mr-2" />}
                {showForm ? 'Cancelar' : 'Nuevo Usuario'}
            </button>
        </div>

        {showForm && (
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 animate-fadeIn">
                <h2 className="font-semibold text-slate-800 mb-4">{editingUserId ? 'Editar Usuario' : 'Registrar Nuevo Usuario'}</h2>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
                        <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required placeholder="usuario@ugp-ssmso.cl" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Usuario Corto / Nickname</label>
                        <input type="text" value={nickname} onChange={(e) => setNickname(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Ej: jsmith" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" placeholder={editingUserId ? "••••••••" : "Opcional"} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Organización / Área</label>
                        <input type="text" value={organization} onChange={(e) => setOrganization(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Rol</label>
                        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
                            <option value={UserRole.ANALYST}>Analista</option>
                            <option value={UserRole.GUEST}>Visita (Solo Lectura)</option>
                            <option value={UserRole.COORDINATOR}>Coordinador</option>
                            <option value={UserRole.ADMIN}>Administrador</option>
                        </select>
                    </div>

                    {/* SECCIÓN DE PERMISOS PARA ANALISTAS, COORDINADORES Y VISITAS */}
                    {role !== UserRole.ADMIN && (
                        <div className="md:col-span-2 bg-indigo-50 p-4 rounded-lg border border-indigo-100 mt-2">
                            <h3 className="text-xs font-bold text-indigo-900 uppercase mb-3 flex items-center gap-2">
                                <Shield size={14} /> Permisos de Acceso ({role === UserRole.GUEST ? 'Visita' : role === UserRole.COORDINATOR ? 'Coordinador' : 'Analista'})
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={canAccessReports}
                                            onChange={(e) => {
                                                setCanAccessReports(e.target.checked);
                                                if (e.target.checked) {
                                                    setCanAccessReportGestion(true);
                                                    setCanAccessReportContinuity(true);
                                                    setCanAccessReportMonthly(true);
                                                } else {
                                                    setCanAccessReportGestion(false);
                                                    setCanAccessReportContinuity(false);
                                                    setCanAccessReportMonthly(false);
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <PieChart size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-700">Módulo Reportes</span>
                                        </div>
                                    </label>
                                    {canAccessReports && (
                                        <div className="ml-7 space-y-1.5 border-l-2 border-indigo-200 pl-3 py-1">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAccessReportGestion} onChange={(e) => setCanAccessReportGestion(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Reportes de Gestión</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAccessReportContinuity} onChange={(e) => setCanAccessReportContinuity(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Monitor de Continuidad</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAccessReportMonthly} onChange={(e) => setCanAccessReportMonthly(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Cierre Mensual</span>
                                            </label>
                                        </div>
                                    )}
                                </div>
                                
                                {role !== UserRole.GUEST && (
                                    <div className="space-y-2">
                                        <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                            <input 
                                                type="checkbox" 
                                                checked={canAccessReferents}
                                                onChange={(e) => {
                                                    setCanAccessReferents(e.target.checked);
                                                    if (e.target.checked) {
                                                        setCanAccessReferentsByProcess(true);
                                                        setCanAccessReferentsDirectory(true);
                                                    } else {
                                                        setCanAccessReferentsByProcess(false);
                                                        setCanAccessReferentsDirectory(false);
                                                    }
                                                }}
                                                className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                            />
                                            <div className="flex items-center gap-2">
                                                <UserCheck size={16} className="text-indigo-500" />
                                                <span className="text-sm font-medium text-slate-700">Referentes</span>
                                            </div>
                                        </label>
                                        {canAccessReferents && (
                                            <div className="ml-7 space-y-1.5 border-l-2 border-indigo-200 pl-3 py-1">
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input type="checkbox" checked={canAccessReferentsByProcess} onChange={(e) => setCanAccessReferentsByProcess(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Por Procesos</span>
                                                </label>
                                                <label className="flex items-center gap-2 cursor-pointer group">
                                                    <input type="checkbox" checked={canAccessReferentsDirectory} onChange={(e) => setCanAccessReferentsDirectory(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Directorio Maestro</span>
                                                </label>
                                            </div>
                                        )}
                                    </div>
                                )}

                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={canAccessGantt}
                                            onChange={(e) => {
                                                setCanAccessGantt(e.target.checked);
                                                if (!e.target.checked) setCanEditGanttDate(false);
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <CalendarRange size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-700">Diagrama Gantt</span>
                                        </div>
                                    </label>
                                    {canAccessGantt && (
                                        <div className="ml-7 space-y-1.5 border-l-2 border-indigo-200 pl-3 py-1">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canEditGanttDate} onChange={(e) => setCanEditGanttDate(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Editar Fecha</span>
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={canAccessReuseMatrix}
                                            onChange={(e) => {
                                                setCanAccessReuseMatrix(e.target.checked);
                                                if (e.target.checked) {
                                                    setCanAccessReuseMatrixLink(true);
                                                    setCanAccessReuseMatrixView(true);
                                                } else {
                                                    setCanAccessReuseMatrixLink(false);
                                                    setCanAccessReuseMatrixView(false);
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <LinkIcon size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-700">Matriz Reutilizables</span>
                                        </div>
                                    </label>
                                    {canAccessReuseMatrix && (
                                        <div className="ml-7 space-y-1.5 border-l-2 border-indigo-200 pl-3 py-1">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAccessReuseMatrixLink} onChange={(e) => setCanAccessReuseMatrixLink(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Vincular</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAccessReuseMatrixView} onChange={(e) => setCanAccessReuseMatrixView(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Visualizar</span>
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={canAccessStructure}
                                            onChange={(e) => {
                                                setCanAccessStructure(e.target.checked);
                                                if (!e.target.checked) {
                                                    setCanAddStructure(false);
                                                    setCanEditStructure(false);
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Network size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-700">Estructura</span>
                                        </div>
                                    </label>
                                    {canAccessStructure && (
                                        <div className="ml-7 space-y-1.5 border-l-2 border-indigo-200 pl-3 py-1">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAddStructure} onChange={(e) => setCanAddStructure(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Agregar</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canEditStructure} onChange={(e) => setCanEditStructure(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Editar</span>
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={canAccessAssignments}
                                            onChange={(e) => {
                                                setCanAccessAssignments(e.target.checked);
                                                if (!e.target.checked) {
                                                    setCanAssignDefinedDocs(false);
                                                    setCanManageAssignments(false);
                                                }
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <ClipboardList size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-700">Asignaciones</span>
                                        </div>
                                    </label>
                                    {canAccessAssignments && (
                                        <div className="ml-7 space-y-1.5 border-l-2 border-indigo-200 pl-3 py-1">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAssignDefinedDocs} onChange={(e) => setCanAssignDefinedDocs(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Asignar Documentos Definidos</span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canManageAssignments} onChange={(e) => setCanManageAssignments(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Gestionar Acciones</span>
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={canAccessLog}
                                            onChange={(e) => {
                                                setCanAccessLog(e.target.checked);
                                                if (!e.target.checked) setCanAuditEvents(false);
                                            }}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <History size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-700">Log de Eventos</span>
                                        </div>
                                    </label>
                                    {canAccessLog && (
                                        <div className="ml-7 space-y-1.5 border-l-2 border-indigo-200 pl-3 py-1">
                                            <label className="flex items-center gap-2 cursor-pointer group">
                                                <input type="checkbox" checked={canAuditEvents} onChange={(e) => setCanAuditEvents(e.target.checked)} className="w-3.5 h-3.5 text-indigo-600 rounded border-slate-300" />
                                                <span className="text-[10px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">Acciones de Auditoría</span>
                                            </label>
                                        </div>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    <label className="flex items-center gap-3 p-2 bg-white rounded border border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                                        <input 
                                            type="checkbox" 
                                            checked={canEditMasterData}
                                            onChange={(e) => setCanEditMasterData(e.target.checked)}
                                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                                        />
                                        <div className="flex items-center gap-2">
                                            <Shield size={16} className="text-indigo-500" />
                                            <span className="text-sm font-medium text-slate-700">Edición Maestra</span>
                                        </div>
                                    </label>
                                    <p className="ml-7 text-[9px] text-slate-400 leading-tight">Permite modificar metadatos críticos (fecha, progreso, versión) en el detalle del documento.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="md:col-span-2 flex justify-end mt-2">
                        <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded-lg hover:bg-indigo-700 transition-colors">
                            {editingUserId ? 'Guardar Cambios' : 'Crear Usuario'}
                        </button>
                    </div>
                </form>
            </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-6 py-3">Usuario</th>
                            <th className="px-6 py-3 text-center">Estado</th>
                            <th className="px-6 py-3">Rol</th>
                            <th className="px-6 py-3">Organización</th>
                            <th className="px-6 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${u.active === false ? 'opacity-60 bg-slate-50/50' : ''}`}>
                                <td className="px-6 py-4 flex items-center gap-3">
                                    <img src={u.avatar} alt={u.name} className="w-8 h-8 rounded-full bg-slate-200" />
                                    <div>
                                        <p className="font-medium text-slate-900">{u.name}</p>
                                        <p className="text-xs text-slate-500">{u.email}</p>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-center">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${u.active !== false ? 'bg-green-100 text-green-700 border border-green-200' : 'bg-slate-200 text-slate-500 border border-slate-300'}`}>
                                        {u.active !== false ? 'Activo' : 'Inactivo'}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium 
                                        ${u.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' : 
                                          u.role === UserRole.COORDINATOR ? 'bg-blue-100 text-blue-800' : 
                                          u.role === UserRole.GUEST ? 'bg-slate-100 text-slate-600' :
                                          'bg-green-100 text-green-800'}`}>
                                        {u.role === UserRole.GUEST ? 'Visita' : u.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-slate-600">{u.organization}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-1">
                                        <button 
                                            onClick={() => handleToggleStatus(u)}
                                            className={`p-1.5 rounded transition-colors ${u.active !== false ? 'text-slate-400 hover:text-red-600 hover:bg-red-50' : 'text-slate-400 hover:text-green-600 hover:bg-green-50'}`}
                                            title={u.active !== false ? "Inactivar usuario" : "Activar usuario"}
                                        >
                                            <Power size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleEdit(u)}
                                            className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition-colors"
                                            title="Editar usuario"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(u.id)}
                                            className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                                            title="Eliminar permanentemente"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && !loading && (
                            <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-400">No hay usuarios registrados.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default AdminUsers;
