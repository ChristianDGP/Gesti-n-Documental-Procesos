import React, { useState, useEffect } from 'react';
import { UserService } from '../services/mockBackend';
import { User, UserRole } from '../types';
import { Trash2, UserPlus, Shield, Briefcase, User as UserIcon, X, Lock, Pencil } from 'lucide-react';

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
    if (!window.confirm('¿Estás seguro de que quieres eliminar este usuario?')) return;
    try {
        await UserService.delete(id);
        await loadUsers();
    } catch (error) {
        console.error(error);
    }
  };

  const handleEdit = (user: User) => {
      setEditingUserId(user.id);
      setName(user.name);
      setEmail(user.email);
      setNickname(user.nickname || '');
      setRole(user.role);
      setOrganization(user.organization);
      setPassword(''); // Don't show current password
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
    
    // Auto-append domain if missing for ease of use (only if not editing or if user typed it out)
    let finalEmail = email;
    if (!finalEmail.includes('@') && !email.includes('.')) {
        finalEmail += '@empresa.com';
    }

    try {
        if (editingUserId) {
            // Update
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
            // Create
            if (!password) {
                alert('La contraseña es obligatoria para nuevos usuarios.');
                return;
            }
            await UserService.create({
                name,
                email: finalEmail,
                nickname: nickname || undefined,
                role,
                organization,
                password
            });
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
                <p className="text-slate-500">Administra perfiles y permisos del sistema.</p>
            </div>
            <button 
                onClick={showForm ? handleCancel : handleCreateNew}
                className={`inline-flex items-center px-4 py-2 text-white rounded-lg transition-colors shadow-sm ${showForm ? 'bg-slate-500 hover:bg-slate-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}
            >
                {showForm ? <X size={18} className="mr-2" /> : <UserPlus size={18} className="mr-2" />}
                {showForm ? 'Cancelar' : 'Nuevo Usuario'}
            </button>
        </div>

        {/* Create/Edit User Form */}
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
                        <input type="text" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required placeholder="usuario@empresa.com" />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Usuario Corto / Nickname</label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={nickname} 
                                onChange={(e) => setNickname(e.target.value)} 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                                placeholder="Ej: jsmith"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">
                            Contraseña
                            {editingUserId && <span className="text-slate-400 font-normal ml-2">(Dejar en blanco para no cambiar)</span>}
                        </label>
                        <div className="relative">
                            <input 
                                type="text" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)} 
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                                placeholder={editingUserId ? "••••••••" : "Establecer contraseña"}
                                required={!editingUserId}
                            />
                        </div>
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

        {/* Users List */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-6 py-3">Usuario</th>
                            <th className="px-6 py-3">Nickname</th>
                            <th className="px-6 py-3">Rol</th>
                            <th className="px-6 py-3">Organización</th>
                            <th className="px-6 py-3 text-right">Acciones</th>
                        </tr>
                    </thead>
                    <tbody>
                        {users.map(u => (
                            <tr key={u.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
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
                                    <div className="flex justify-end gap-2">
                                        <button 
                                            onClick={() => handleEdit(u)}
                                            className="text-slate-400 hover:text-indigo-600 p-1 hover:bg-indigo-50 rounded transition-colors"
                                            title="Editar usuario"
                                        >
                                            <Pencil size={18} />
                                        </button>
                                        <button 
                                            onClick={() => handleDelete(u.id)}
                                            className="text-slate-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
                                            title="Eliminar usuario"
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {users.length === 0 && !loading && (
                            <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-400">No hay usuarios registrados.</td></tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    </div>
  );
};

export default AdminUsers;