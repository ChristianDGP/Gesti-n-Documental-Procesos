import React, { useState } from 'react';
import { AuthService } from '../services/mockBackend';
import { Eye, EyeOff, AlertCircle, Lock, User } from 'lucide-react';
import { MOCK_USERS } from '../constants';

interface LoginProps {
  onLogin: () => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
        setError('Por favor completa todos los campos');
        return;
    }

    setLoading(true);
    setError(null);
    try {
      await AuthService.login(username, password);
      onLogin();
    } catch (err: any) {
      setError(err.message || 'Error de autenticación');
    } finally {
      setLoading(false);
    }
  };

  // Helper to pre-fill for testing purposes
  const fillCredentials = (userType: string) => {
      if (userType === 'ADMIN') {
        setUsername('admin');
        setPassword('admin');
      } else {
        const u = MOCK_USERS.find(user => user.role === userType);
        if (u) {
            setUsername(u.email);
            setPassword('123456');
        }
      }
      setError(null);
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-100 p-4 font-sans">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-[400px] p-8 border border-slate-200">
        
        <div className="flex flex-col items-center mb-8">
            <div className="w-16 h-16 bg-indigo-600 rounded-full flex items-center justify-center mb-4 shadow-md">
                <Lock color="white" size={32} />
            </div>
            <h1 className="text-2xl font-bold text-slate-800">Bienvenido a SGA</h1>
            <p className="text-sm text-slate-500">Sistema de Gestión Documental</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Usuario</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <User size={18} className="text-slate-400" />
                    </div>
                    <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        className={`block w-full pl-10 pr-3 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all ${error ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-slate-50'}`}
                        placeholder="Nombre de usuario o correo"
                    />
                </div>
            </div>

            <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <Lock size={18} className="text-slate-400" />
                    </div>
                    <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className={`block w-full pl-10 pr-10 py-2.5 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all ${error ? 'border-red-300 bg-red-50' : 'border-slate-300 bg-slate-50'}`}
                        placeholder="••••••••"
                    />
                    <button 
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                    </button>
                </div>
            </div>
            
            {/* Validacion visual de error */}
            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100">
                    <AlertCircle size={16} className="flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2.5 px-4 rounded-lg transition-all shadow-md hover:shadow-lg disabled:opacity-70 disabled:cursor-not-allowed transform active:scale-95"
            >
                {loading ? 'Validando credenciales...' : 'Ingresar'}
            </button>
        </form>

        <div className="mt-6 text-center">
            <a href="#" className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline">
                ¿Olvidaste tu contraseña?
            </a>
        </div>
      </div>

        {/* Development Helper: Only visible to help you test */}
        <div className="mt-8 max-w-[400px] w-full text-xs text-slate-500 text-center">
            <p className="font-semibold mb-3">Accesos Rápidos (Entorno de Pruebas)</p>
            <div className="flex flex-wrap justify-center gap-2">
                <button 
                    onClick={() => fillCredentials('ADMIN')}
                    className="bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-600 px-3 py-1.5 rounded-full transition-colors shadow-sm"
                >
                    Admin (admin / admin)
                </button>
                <button 
                    onClick={() => fillCredentials('ANALYST')}
                    className="bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-600 px-3 py-1.5 rounded-full transition-colors shadow-sm"
                >
                    Analista (Email / 123456)
                </button>
                <button 
                    onClick={() => fillCredentials('COORDINATOR')}
                    className="bg-white border border-slate-300 hover:border-indigo-400 hover:text-indigo-600 px-3 py-1.5 rounded-full transition-colors shadow-sm"
                >
                    Coordinador (Email / 123456)
                </button>
            </div>
        </div>
    </div>
  );
};

export default Login;