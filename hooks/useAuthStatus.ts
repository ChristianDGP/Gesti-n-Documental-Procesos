// src/hooks/useAuthStatus.ts
import { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig'; 
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { User, UserRole } from '../types'; // Importamos tu interfaz User de types.ts

// Función auxiliar para transformar el usuario de Firebase en tu tipo de usuario local
const transformUser = (firebaseUser: FirebaseUser): User => {
    // ⚠️ ATENCIÓN: Esta es la asignación de rol TEMPORAL para que el routing funcione.
    // Asignamos un rol base (USER) para evitar errores de tipado.
    const tempRole = UserRole.USER; 
    
    // Esto simula la estructura de tu objeto User:
    return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario DGP',
        role: tempRole, 
        // Si tu interfaz User necesita más campos, añádelos aquí.
    } as User; 
};


export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        // Listener de Firebase que se ejecuta al inicio de la app, login, o logout
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Transformamos el objeto de Firebase al objeto User que tu app espera
                const localUser = transformUser(firebaseUser);
                setUser(localUser);
            } else {
                setUser(null);
            }
            setCargando(false);
        });

        // Limpia el listener cuando el componente se desmonta (buena práctica)
        return () => unsubscribe(); 
    }, []);

    return { user, cargando };
};