
import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/firebaseAuthService'; 
import { UserService } from '../services/firebaseBackend';
import { MOCK_USERS } from '../constants';
import { User as UserType } from '../types';
import { Lock, User, Key, AlertCircle, TrendingUp, Mail, UserPlus, LogIn, ChevronDown } from 'lucide-react'; 
import { useNavigate } from 'react-router-dom'; 
import { auth } from '../services/firebaseConfig'; 
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'; 

const Login: React.FC = () => {
    const [isRegistering, setIsRegistering] = useState(false);
    const [showEmailFields, setShowEmailFields] = useState(false);
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(''); setLoading(true);
        try {
            if (isRegistering) { 
                await registerUser(email, password, name); 
                navigate('/'); 
            } else { 
                await loginUser(email, password); 
                navigate('/'); 
            }
        } catch (err: any) {
            if (!isRegistering) {
                 let target: UserType | undefined = MOCK_USERS.find(u => u.email === email && u.password === password);
                 if (!target) { 
                    try { 
                        const all = await UserService.getAll(); 
                        target = all.find(u => u.email === email && u.password === password); 
                    } catch(e){} 
                 }
                 if (target) { 
                    localStorage.setItem('sgd_user_cache', JSON.stringify(target)); 
                    window.location.reload(); 
                    return; 
                 }
            }
            setError(err.message || 'Error de autenticación'); 
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError('');
        try { 
            await signInWithPopup(auth, new GoogleAuthProvider()); 
            navigate('/'); 
        } catch (err: any) { 
            setError("Error al iniciar sesión con Google"); 
            setLoading(false); 
        }
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-[#f1f5f9] p-4">
            <div className="bg-white p-10 rounded-[32px] shadow-[0_20px_50px_-12px_rgba(0,0,0,0.08)] w-full max-w-sm border border-slate-100 flex flex-col items-center">
                
                {/* Header Section */}
                <div className="text-center mb-10">
                    <h1 className="text-[44px] font-black text-[#1e293b] leading-tight mb-0">SGD</h1>
                    <p className="text-slate-400 text-base font-medium tracking-tight">Gestión Documental</p>
                </div>

                <div className="w-full space-y-8">
                    {/* Primary Option: Google */}
                    <button 
                        type="button" 
                        onClick={handleGoogleSignIn} 
                        disabled={loading} 
                        className="w-full bg-white border border-slate-200 py-4 rounded-2xl shadow-sm font-bold flex items-center justify-center gap-3 hover:bg-slate-50 hover:border-slate-300 transition-all active:scale-[0.97] disabled:opacity-50"
                    >
                        {/* Simulación Icono Google */}
                        <div className="w-6 h-6 flex items-center justify-center bg-white rounded-full">
                            <TrendingUp size={22} className="text-[#ea4335]" />
                        </div>
                        <span className="text-lg text-[#334155] font-semibold">Google</span>
                    </button>

                    {/* Divisor con botón de despliegue estético */}
                    <div 
                        className="relative h-10 flex items-center cursor-pointer group" 
                        onClick={() => setShowEmailFields(!showEmailFields)}
                    >
                        <div className={`w-full border-t-[1.5px] transition-colors duration-300 ${showEmailFields ? 'border-indigo-500' : 'border-slate-200 group-hover:border-slate-300'}`}></div>
                        
                        {/* Indicador de Despliegue (Triángulo estilizado) */}
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center">
                            <div 
                                className={`w-8 h-8 rounded-full bg-white border shadow-sm flex items-center justify-center transition-all duration-300 
                                    ${showEmailFields ? 'border-indigo-500 bg-indigo-50 -rotate-180 scale-110' : 'border-slate-200 group-hover:border-slate-300 group-hover:scale-105'}`}
                            >
                                <div 
                                    className={`w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[8px] transition-colors duration-300
                                        ${showEmailFields ? 'border-t-indigo-600' : 'border-t-[#3b82f6]'}`}
                                ></div>
                            </div>
                        </div>
                        
                        {/* Label opcional para guiar al usuario */}
                        {!showEmailFields && (
                            <span className="absolute left-0 -top-6 text-[10px] font-bold text-slate-400 uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
                                Acceso con credenciales
                            </span>
                        )}
                    </div>

                    {/* Formulario Desplegable */}
                    <div className={`overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.4,0,0.2,1)] ${showEmailFields ? 'max-h-[600px] opacity-100' : 'max-h-0 opacity-0 pointer-events-none'}`}>
                        <form onSubmit={handleSubmit} className="space-y-4 pt-2 pb-4">
                            {isRegistering && (
                                <div className="group">
                                    <div className="relative">
                                        <User className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18}/>
                                        <input 
                                            placeholder="Nombre" 
                                            value={name} 
                                            onChange={(e) => setName(e.target.value)} 
                                            className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-slate-700" 
                                            required={isRegistering} 
                                        />
                                    </div>
                                </div>
                            )}
                            
                            <div className="group">
                                <div className="relative">
                                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18}/>
                                    <input 
                                        type="email" 
                                        placeholder="Email" 
                                        value={email} 
                                        onChange={(e) => setEmail(e.target.value)} 
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-slate-700" 
                                        required={showEmailFields} 
                                    />
                                </div>
                            </div>

                            <div className="group">
                                <div className="relative">
                                    <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 group-focus-within:text-indigo-500 transition-colors" size={18}/>
                                    <input 
                                        type="password" 
                                        placeholder="Contraseña" 
                                        value={password} 
                                        onChange={(e) => setPassword(e.target.value)} 
                                        className="w-full pl-12 pr-4 py-3.5 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 focus:bg-white transition-all text-slate-700" 
                                        required={showEmailFields} 
                                    />
                                </div>
                            </div>

                            {error && (
                                <div className="animate-fadeIn p-3 rounded-xl bg-red-50 border border-red-100 flex items-center gap-2">
                                    <AlertCircle size={16} className="text-red-500 shrink-0"/>
                                    <p className="text-xs text-red-700 font-medium leading-tight">{error}</p>
                                </div>
                            )}

                            <button 
                                type="submit" 
                                disabled={loading} 
                                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-lg shadow-lg shadow-indigo-200 hover:bg-indigo-700 hover:shadow-indigo-300 transition-all active:scale-[0.98] disabled:opacity-70 mt-4 flex items-center justify-center gap-2"
                            >
                                {loading ? <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : (isRegistering ? 'Crear Cuenta' : 'Entrar')}
                            </button>

                            <div className="flex justify-center pt-4">
                                <button 
                                    type="button" 
                                    onClick={() => setIsRegistering(!isRegistering)} 
                                    className="text-xs font-bold text-indigo-500 hover:text-indigo-700 transition-colors uppercase tracking-widest"
                                >
                                    {isRegistering ? 'Volver al Login' : '¿No tienes cuenta? Regístrate'}
                                </button>
                            </div>
                        </form>
                    </div>

                    {!showEmailFields && (
                        <div className="text-center animate-fadeIn">
                            <button 
                                onClick={() => setShowEmailFields(true)}
                                className="text-slate-400 text-sm font-semibold hover:text-indigo-500 transition-colors flex items-center justify-center gap-2 mx-auto"
                            >
                                Ingresar con Email y Contraseña <ChevronDown size={14} className="animate-bounce-slow" />
                            </button>
                        </div>
                    )}
                </div>
            </div>

            <style>{`
                .animate-bounce-slow {
                    animation: bounce 2s infinite;
                }
                @keyframes bounce {
                    0%, 100% { transform: translateY(-10%); animation-timing-function: cubic-bezier(0.8,0,1,1); }
                    50% { transform: translateY(0); animation-timing-function: cubic-bezier(0,0,0.2,1); }
                }
            `}</style>
        </div>
    );
};

export default Login;
