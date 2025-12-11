// src/hooks/useAuthStatus.ts
import { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig'; 
import { onAuthStateChanged, User as FirebaseUser, getIdTokenResult } from 'firebase/auth'; // Importamos getIdTokenResult
import { User, UserRole } from '../types'; // Necesitamos UserRole para el tipado del rol

// Función auxiliar para transformar el usuario de Firebase en tu tipo de usuario local
const transformUser = (firebaseUser: FirebaseUser, claims: any): User => {
    // ⚠️ LÓGICA DE ROLES REAL: Usamos el Custom Claim 'admin'
    // Si el token tiene claims.admin == true, asignamos el rol ADMIN.
    const finalRole = claims.admin ? UserRole.ADMIN : UserRole.USER; 
    
    return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario DGP',
        role: finalRole, // <-- ¡ASIGNACIÓN DEL ROL REAL!
        // Asegúrate de incluir aquí cualquier otro campo que tu interfaz 'User' requiera
    } as User; 
};


export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // OBTENER EL TOKEN Y LOS CLAIMS DEL USUARIO
                const idTokenResult = await getIdTokenResult(firebaseUser);
                
                // Ahora usamos el resultado del token para determinar el rol
                const localUser = transformUser(firebaseUser, idTokenResult.claims);
                setUser(localUser);
            } else {
                setUser(null);
            }
            setCargando(false);
        });

        return () => unsubscribe(); 
    }, []);

    return { user, cargando };
};