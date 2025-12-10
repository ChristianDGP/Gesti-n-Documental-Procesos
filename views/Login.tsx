
import React, { useState } from 'react';
import { AuthService } from '../services/mockBackend';
import { Lock, User, Key, AlertCircle } from 'lucide-react';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await AuthService.login(email, password);
      onLogin();
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">
      <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
        <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-md">
                <Lock color="white" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">SGD Corporativo</h1>
            <p className="text-sm text-slate-500">Sistema de Gestión Documental</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Usuario / Correo</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <User size={18} className="text-slate-400" />
                </div>
                <input
                    type="text"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="usuario"
                />
            </div>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Contraseña</label>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Key size={18} className="text-slate-400" />
                </div>
                <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    placeholder="••••••"
                />
            </div>
            <p className="text-xs text-slate-400 mt-1">Default: 'admin' o 'dgp2026'</p>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                <AlertCircle size={16} />
                <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-colors shadow-md font-medium disabled:opacity-70"
          >
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>
        
        <div className="mt-8 pt-6 border-t border-slate-100 text-center text-xs text-slate-400">
            © 2026 Gestión de Procesos - Acceso Restringido
        </div>
      </div>
    </div>
  );
};

export default Login;
