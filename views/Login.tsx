
import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/firebaseAuthService'; 
import { UserService } from '../services/firebaseBackend';
import { MOCK_USERS } from '../constants';
import { User as UserType } from '../types';
import { Lock, User, Key, AlertCircle, TrendingUp, Mail, UserPlus, LogIn, Info } from 'lucide-react'; 
import { useNavigate } from 'react-router-dom'; 
import { auth } from '../services/firebaseConfig'; 
import { GoogleAuthProvider, signInWithPopup, UserCredential } from 'firebase/auth'; 

const Login: React.FC = () => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isRegistering) {
                if (!name) throw new Error("El nombre es obligatorio para registrarse.");
                await registerUser(email, password, name);
                // El hook useAuthStatus detectará el nuevo usuario y creará el perfil en DB
                navigate('/');
            } else {
                await loginUser(email, password); 
                navigate('/'); 
            }
        } catch (err: any) {
            console.error(err);
            
            // --- HYBRID AUTH FALLBACK ---
            // If Firebase fails, check if it's a Mock User or a DB-only user (created via Admin Panel)
            if (!isRegistering) {
                 // 1. Check Mock Constants (e.g., admin@empresa.com)
                 let targetUser: UserType | undefined = MOCK_USERS.find(u => u.email === email && u.password === password);
                 
                 // 2. If not found, Check Firestore Users (Users created manually by Admin)
                 if (!targetUser) {
                     try {
                         const allUsers = await UserService.getAll();
                         // Note: In a real app, do not store plain text passwords. This is for the demo/internal template capability.
                         targetUser = allUsers.find(u => u.email === email && u.password === password);
                     } catch (dbErr) {
                         console.error("DB Login check failed", dbErr);
                     }
                 }

                 // 3. If found in either fallback, Log In via Local Storage
                 if (targetUser) {
                     localStorage.setItem('sgd_user_cache', JSON.stringify(targetUser));
                     // Force reload to ensure Auth Hook picks up the local storage state cleanly
                     window.location.reload();
                     return;
                 }
            }
            // -----------------------------

            let mensajeError = 'Error de autenticación.';
            const errorCode = err.code;
            const errorMessage = err.message || '';

            // Manejo actualizado para el error de credenciales unificado de Firebase
            if (errorCode === 'auth/invalid-credential' || errorMessage.includes('invalid-credential')) {
                mensajeError = isRegistering 
                    ? 'Error al crear cuenta. Intente con otro correo.'
                    : 'Correo no registrado o contraseña incorrecta. Si es nuevo, seleccione "Crear Cuenta".';
            } else if (errorCode === 'auth/user-not-found' || errorCode === 'auth/wrong-password') {
                mensajeError = 'Usuario o contraseña incorrectos.';
            } else if (errorCode === 'auth/email-already-in-use') {
                mensajeError = 'Este correo electrónico ya está registrado. Intente iniciar sesión.';
            } else if (errorCode === 'auth/weak-password') {
                mensajeError = 'La contraseña debe tener al menos 6 caracteres.';
            } else if (errorCode === 'auth/too-many-requests') {
                mensajeError = 'Demasiados intentos fallidos. Intente más tarde.';
            } else if (err.message) {
                mensajeError = err.message;
            }
            setError(mensajeError);
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            navigate('/');
        } catch (err: any) {
            console.error(err);
            if (err.code === 'auth/popup-closed-by-user') {
                setError("Inicio de sesión cancelado.");
            } else {
                setError("Error al iniciar sesión con Google.");
            }
            setLoading(false);
        }
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
                <div className="text-center mb-6">
                    <h1 className="text-3xl font-bold text-slate-900">SGD</h1>
                    <p className="text-slate-500 mt-2">Sistema de Gestión Documental</p>
                </div>
                
                {/* Toggle buttons hidden as requested */}

                <form onSubmit={handleSubmit} className="space-y-4">
                    {isRegistering && (
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre Completo</label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <User size={18} className="text-slate-400" />
                                </div>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                                    placeholder="Ej: Juan Pérez"
                                    required={isRegistering}
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Correo Electrónico</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Mail size={18} className="text-slate-400" />
                            </div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                                placeholder={isRegistering ? "admin@empresa.com" : "usuario@empresa.com"}
                                required
                            />
                        </div>
                         {isRegistering && (
                            <p className="text-[10px] text-slate-400 mt-1">Tip: Usa un correo que empiece con 'admin' para obtener permisos totales.</p>
                        )}
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Contraseña</label>
                        <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                <Lock size={18} className="text-slate-400" />
                            </div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-colors"
                                placeholder="••••••••"
                                required
                            />
                        </div>
                    </div>
                    
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100 animate-fadeIn">
                            <AlertCircle size={16} className="flex-shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-indigo-600 text-white py-2.5 rounded-lg hover:bg-indigo-700 transition-colors shadow-md font-medium disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        {loading ? 'Procesando...' : isRegistering ? (
                            <><UserPlus size={18} /> Registrarse</>
                        ) : (
                            <><LogIn size={18} /> Iniciar Sesión</>
                        )}
                    </button>
                    
                    <div className="relative flex items-center justify-center py-2">
                        <div className="flex-grow border-t border-slate-200"></div>
                        <span className="flex-shrink mx-4 text-slate-400 text-xs uppercase font-semibold">O continuar con</span>
                        <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full bg-white text-slate-700 border border-slate-300 py-2.5 rounded-lg hover:bg-slate-50 transition-colors font-medium disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        <TrendingUp size={18} className="text-red-500" /> Google
                    </button>

                </form>
            </div>
        </div>
    );
};

export default Login;
