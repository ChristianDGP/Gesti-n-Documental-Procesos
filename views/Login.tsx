import React, { useState } from 'react';
// ELIMINAR: import { AuthService } from '../services/mockBackend';
import { loginUser } from '../services/firebaseAuthService'; // <-- IMPORTACIÓN REAL
import { Lock, User, Key, AlertCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom'; // Para manejar la redirección en caso de éxito o error


// La interfaz LoginProps y la prop 'onLogin' YA NO SON NECESARIAS
// interface LoginProps { onLogin: () => void; }

// Modificado: El componente ya no recibe props
const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate(); // Hook para la navegación programática

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      // ==========================================================
      // LLAMADA AL SERVICIO DE AUTENTICACIÓN REAL DE FIREBASE
      // ==========================================================
      await loginUser(email, password);
      
      // Si tiene éxito, el hook useAuthStatus detecta el login y App.tsx redirige a '/'.
      // Podemos forzar una pequeña espera o navegar, aunque el listener debería hacerlo:
      navigate('/'); 
      
    } catch (err: any) {
      // Manejo de errores de Firebase
      let mensajeError = 'Error de autenticación. Verifica tus credenciales.';
      
      // Opcional: Puedes analizar el código de error de Firebase (err.code)
      if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
          mensajeError = 'Usuario o contraseña incorrectos.';
      }
      
      setError(mensajeError);
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
                    placeholder="usuario@ejemplo.com" // Sugerencia: Usar formato de correo para Firebase
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
            <p className="text-xs text-slate-400 mt-1">Usa la contraseña del usuario que creaste en Firebase</p>
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