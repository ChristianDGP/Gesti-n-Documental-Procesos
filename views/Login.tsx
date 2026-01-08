
import React, { useState } from 'react';
import { loginUser, registerUser } from '../services/firebaseAuthService'; 
import { UserService } from '../services/firebaseBackend';
import { MOCK_USERS } from '../constants';
import { User as UserType } from '../types';
import { Lock, User, Key, AlertCircle, TrendingUp, Mail, UserPlus, LogIn } from 'lucide-react'; 
import { useNavigate } from 'react-router-dom'; 
import { auth } from '../services/firebaseConfig'; 
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth'; 

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
        setError(''); setLoading(true);
        try {
            if (isRegistering) { await registerUser(email, password, name); navigate('/'); } 
            else { await loginUser(email, password); navigate('/'); }
        } catch (err: any) {
            if (!isRegistering) {
                 // Fix: Explicitly type 'target' to match the UserType interface
                 let target: UserType | undefined = MOCK_USERS.find(u => u.email === email && u.password === password);
                 if (!target) { try { const all = await UserService.getAll(); target = all.find(u => u.email === email && u.password === password); } catch(e){} }
                 if (target) { localStorage.setItem('sgd_user_cache', JSON.stringify(target)); window.location.reload(); return; }
            }
            setError(err.message || 'Error de autenticación'); setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        try { await signInWithPopup(auth, new GoogleAuthProvider()); navigate('/'); } 
        catch (err: any) { setError("Error Google"); setLoading(false); }
    };
    
    return (
        <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md border">
                <div className="text-center mb-6"><h1 className="text-3xl font-bold">SGD</h1><p className="text-slate-500">Gestión Documental</p></div>
                <form onSubmit={handleSubmit} className="space-y-4">
                    {isRegistering && <div className="relative"><User className="absolute left-3 top-2.5 text-slate-400" size={18}/><input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} className="w-full pl-10 pr-3 py-2 border rounded-lg outline-none" required /></div>}
                    <div className="relative"><Mail className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full pl-10 pr-3 py-2 border rounded-lg outline-none" required /></div>
                    <div className="relative"><Lock className="absolute left-3 top-2.5 text-slate-400" size={18}/><input type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full pl-10 pr-3 py-2 border rounded-lg outline-none" required /></div>
                    {error && <p className="text-xs text-red-600 bg-red-50 p-2 rounded border border-red-100">{error}</p>}
                    <button type="submit" disabled={loading} className="w-full bg-indigo-600 text-white py-2.5 rounded-lg font-bold disabled:opacity-70">{loading ? '...' : (isRegistering ? 'Crear Cuenta' : 'Entrar')}</button>
                    <div className="flex justify-center py-2 text-xs"><button type="button" onClick={() => setIsRegistering(!isRegistering)} className="text-indigo-600 hover:underline">{isRegistering ? 'Ya tengo cuenta' : 'Crear nueva cuenta'}</button></div>
                    <button type="button" onClick={handleGoogleSignIn} disabled={loading} className="w-full bg-white border py-2.5 rounded-lg font-bold flex items-center justify-center gap-2 hover:bg-slate-50"><TrendingUp size={18} className="text-red-500"/> Google</button>
                </form>
            </div>
        </div>
    );
};

export default Login;
