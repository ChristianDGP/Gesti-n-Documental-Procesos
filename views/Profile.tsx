
import React, { useState, useEffect } from 'react';
import { UserService } from '../services/mockBackend';
import { User, UserRole } from '../types';
import { UserCog, Save, Lock, Mail, Shield, Building } from 'lucide-react';

interface Props {
  user: User;
  onUpdate: () => void;
}

const Profile: React.FC<Props> = ({ user, onUpdate }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

  useEffect(() => {
    // Populate form with current user data
    setEmail(user.email);
    setPassword(user.password || '');
    setConfirmPassword(user.password || '');
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);

    if (password !== confirmPassword) {
        setMessage({ type: 'error', text: 'Las contraseñas no coinciden.' });
        return;
    }

    if (!email.includes('@')) {
        setMessage({ type: 'error', text: 'Ingrese un correo electrónico válido.' });
        return;
    }

    setLoading(true);
    try {
        await UserService.update(user.id, {
            email,
            password: password || undefined // Only update if not empty
        });
        
        // Trigger parent update (re-renders layout with new info if applicable)
        onUpdate();
        setMessage({ type: 'success', text: 'Perfil actualizado correctamente.' });
    } catch (err: any) {
        setMessage({ type: 'error', text: err.message });
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-6 animate-fadeIn">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                    <UserCog className="text-indigo-600" />
                    Mi Perfil
                </h1>
                <p className="text-slate-500">Gestione la información de acceso a su cuenta.</p>
            </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 bg-slate-50/50 border-b border-slate-100 flex items-center gap-4">
                <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center text-2xl font-bold text-indigo-600 border-2 border-white shadow-sm overflow-hidden">
                    {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user.name.charAt(0)}
                </div>
                <div>
                    <h2 className="text-lg font-bold text-slate-800">{user.name}</h2>
                    <p className="text-sm text-slate-500 font-mono">@{user.nickname || 'usuario'}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
                {/* Read Only Fields */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                     <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                            <Building size={12} /> Organización
                        </label>
                        <input 
                            type="text" 
                            value={user.organization} 
                            disabled 
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1 flex items-center gap-1">
                            <Shield size={12} /> Rol de Usuario
                        </label>
                         <input 
                            type="text" 
                            value={user.role} 
                            disabled 
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
                        />
                    </div>
                </div>
                
                <hr className="border-slate-100" />

                {/* Editable Fields */}
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                            <Mail size={16} className="text-indigo-500" />
                            Correo Electrónico
                        </label>
                        <input 
                            type="email" 
                            value={email} 
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                            required
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                <Lock size={16} className="text-indigo-500" />
                                Contraseña
                            </label>
                            <input 
                                type="password" 
                                value={password} 
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                                <Lock size={16} className="text-indigo-500" />
                                Confirmar Contraseña
                            </label>
                            <input 
                                type="password" 
                                value={confirmPassword} 
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" 
                            />
                        </div>
                    </div>
                </div>

                {message && (
                    <div className={`p-3 rounded-lg text-sm flex items-center gap-2 ${message.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {message.text}
                    </div>
                )}

                <div className="flex justify-end pt-2">
                    <button 
                        type="submit" 
                        disabled={loading}
                        className="flex items-center px-6 py-2.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium disabled:opacity-70"
                    >
                        {loading ? 'Guardando...' : (
                            <>
                                <Save size={18} className="mr-2" />
                                Guardar Cambios
                            </>
                        )}
                    </button>
                </div>
            </form>
        </div>
    </div>
  );
};

export default Profile;
