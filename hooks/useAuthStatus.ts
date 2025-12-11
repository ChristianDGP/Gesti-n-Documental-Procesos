// src/hooks/useAuthStatus.ts
import { useState, useEffect } from 'react';
import { auth } from '../firebaseConfig'; 
import { onAuthStateChanged, User as FirebaseUser, getIdTokenResult } from 'firebase/auth'; 
import { User, UserRole } from '../types'; 

// Función auxiliar para transformar el usuario de Firebase en tu tipo de usuario local
const transformUser = (firebaseUser: FirebaseUser, claims: any): User => {
    // 1. DETERMINACIÓN DEL ROL
    // Usa ADMIN si el custom claim existe, de lo contrario usa USER (el rol base)
    // Asumimos que UserRole.USER fue agregado a tu types.ts
    const finalRole: UserRole = claims.admin ? UserRole.ADMIN : UserRole.USER; 
    
    // 2. CONSTRUCCIÓN DEL OBJETO USER CON CAMPOS OBLIGATORIOS
    return {
        id: firebaseUser.uid,
        email: firebaseUser.email || '',
        name: firebaseUser.displayName || 'Usuario DGP',
        role: finalRole, 

        // ⚠️ AÑADIDO: Campos obligatorios de tu interfaz User
        avatar: firebaseUser.photoURL || 'default-avatar.png', 
        organization: 'U-G-P-S-S-M-S-O', // Valor predeterminado
        
        // Campos opcionales (deben ser incluidos o pueden omitirse si se usa '?')
        nickname: firebaseUser.email?.split('@')[0], // Usar parte del correo como nickname
        // password ya no es necesario aquí (solo era para el mock)
    }; // Ya no es necesario 'as User' si todos los campos están incluidos
};


export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                // Obtener el token para leer el Custom Claim
                const idTokenResult = await getIdTokenResult(firebaseUser);
                
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