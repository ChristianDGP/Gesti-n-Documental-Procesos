// src/hooks/useAuthStatus.ts
import { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig'; 
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { User, UserRole } from '../types'; // Importamos tu interfaz User y Enum UserRole

// Función auxiliar para transformar el usuario de Firebase en tu tipo de usuario local
const transformUser = (firebaseUser: FirebaseUser): User => {
    // ⚠️ Importante: Asignamos un rol base (USER) para que el routing funcione.
    // **Si tu enum en types.ts usa "UserRole.USER", déjalo así. Si usa minúsculas, cámbialo.**
    const tempRole = UserRole.USER; 
    
    return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario DGP',
        role: tempRole, 
        // Nota: Agrega cualquier otro campo que tu interfaz 'User' requiera aquí
    } as User; 
};


export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const localUser = transformUser(firebaseUser);
                setUser(localUser);
            } else {
                setUser(null);
            }
            setCargando(false);
        });

        return () => unsubscribe(); 
    }, []);

    // Exportamos 'user' y 'cargando'
    return { user, cargando }; 
};