
import React, { useState, useEffect } from 'react';
import { UserService } from '../services/firebaseBackend';
import { User, UserRole } from '../types';
import { Trash2, UserPlus, Shield, Briefcase, User as UserIcon, X, Lock, Pencil, Power, AlertCircle } from 'lucide-react';

const AdminUsers: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  
  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [nickname, setNickname] = useState('');
  const [role, setRole] = useState<UserRole>(UserRole.ANALYST);
  const [organization, setOrganization] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    setLoading(true);
    const data = await UserService.getAll();
    setUsers(data);
    setLoading(false);
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
                active: true
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
                            <option value={UserRole.COORDINATOR}>Coordinador</option>
                            <option value={UserRole.ADMIN}>Administrador</option>
                        </select>
                    </div>
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
                            <th className="px-6 py-3">Nickname</th>
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
                                <td className="px-6 py-4 font-mono text-slate-600">
                                    {u.nickname || '-'}
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
                                          'bg-green-100 text-green-800'}`}>
                                        {u.role}
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
        
        {users.some(u => u.active === false) && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-100 rounded-lg text-blue-700 text-xs">
                <AlertCircle size={16} />
                <span>Los usuarios <b>Inactivos</b> no pueden iniciar sesión ni realizar gestiones en el sistema.</span>
            </div>
        )}
    </div>
  );
};

export default AdminUsers;
