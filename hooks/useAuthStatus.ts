
import { useState, useEffect } from 'react';
import { auth, db } from '../services/firebaseConfig'; // Apuntar al config unificado
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';

export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    // Intentar obtener el perfil completo de Firestore
                    const userRef = doc(db, "users", firebaseUser.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists()) {
                        // Usuario existe en DB: Usar sus datos reales (Rol, Organización, etc.)
                        setUser(userSnap.data() as User);
                    } else {
                        // Usuario no existe en DB (Primer login o error): Crear objeto temporal
                        // Nota: AuthService.loginWithGoogle en firebaseBackend debería manejar la creación
                        const tempUser: User = {
                            id: firebaseUser.uid,
                            email: firebaseUser.email || '',
                            name: firebaseUser.displayName || 'Usuario',
                            nickname: firebaseUser.email?.split('@')[0],
                            role: UserRole.ANALYST, // Rol por defecto temporal
                            avatar: firebaseUser.photoURL || '',
                            organization: 'Sin Asignar' 
                        };
                        setUser(tempUser);
                    }
                } catch (error) {
                    console.error("Error fetching user profile:", error);
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setCargando(false);
        });

        return () => unsubscribe(); 
    }, []);

    return { user, cargando };
};
