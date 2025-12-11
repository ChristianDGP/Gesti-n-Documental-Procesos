// src/views/Login.tsx
import React, { useState } from 'react';
import { loginUser } from '../services/firebaseAuthService'; 
import { Lock, User, Key, AlertCircle, TrendingUp } from 'lucide-react'; // Añadimos TrendingUp
import { useNavigate } from 'react-router-dom'; 
import { auth } from '../firebaseConfig'; // <-- NECESARIO PARA GOOGLE SIGN-IN
import { GoogleAuthProvider, signInWithPopup, UserCredential } from 'firebase/auth'; // <-- NECESARIO PARA GOOGLE

const Login: React.FC = () => {
    // ... (El estado para email, password, error, loading es el mismo)
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
            await loginUser(email, password); 
            navigate('/'); 
        } catch (err: any) {
            let mensajeError = 'Error de autenticación. Verifica tus credenciales.';
            if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
                mensajeError = 'Usuario o contraseña incorrectos.';
            }
            setError(mensajeError);
            setLoading(false);
        }
    };

    // NUEVA FUNCIÓN PARA GOOGLE SIGN-IN
    const handleGoogleSignIn = async () => {
        setError('');
        setLoading(true);
        try {
            const provider = new GoogleAuthProvider();
            const result: UserCredential = await signInWithPopup(auth, provider);
            // El listener en useAuthStatus detectará el login
            navigate('/');
        } catch (err: any) {
            console.error(err);
            setError("Error al iniciar sesión con Google. Revisa Dominios Autorizados.");
            setLoading(false);
        }
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 font-sans">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border border-slate-200">
                {/* ... (Header y Títulos son iguales) ... */}
                
                <form onSubmit={handleSubmit} className="space-y-6">
                    {/* ... (Campos de Email y Password son iguales) ... */}
                    
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
                    
                    {/* BOTÓN DE GOOGLE AÑADIDO TEMPORALMENTE */}
                    <div className="relative flex items-center justify-center">
                        <div className="flex-grow border-t border-slate-200"></div>
                        <span className="flex-shrink mx-4 text-slate-400 text-sm">O</span>
                        <div className="flex-grow border-t border-slate-200"></div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full bg-red-600 text-white py-2 rounded-lg hover:bg-red-700 transition-colors shadow-md font-medium disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                        <TrendingUp size={18} /> Iniciar con Google
                    </button>
                    {/* FIN DEL BOTÓN DE GOOGLE */}

                </form>
                
                {/* ... (Footer es igual) ... */}
            </div>
        </div>
    );
};

export default Login;