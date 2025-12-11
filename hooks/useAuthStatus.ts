
import { useState, useEffect } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';

export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    const userRef = doc(db, "users", firebaseUser.uid);
                    const userSnap = await getDoc(userRef);

                    if (userSnap.exists()) {
                        // El usuario ya existe en Firestore, usamos sus datos
                        setUser(userSnap.data() as User);
                    } else {
                        // Nuevo usuario (Google o Registro Email): Lo creamos en Firestore
                        const email = firebaseUser.email || '';
                        
                        // Lógica de Bootstrap: Si el email empieza con 'admin', es ADMIN
                        // También incluimos el email del desarrollador por si acaso
                        const isAdmin = email.toLowerCase().startsWith('admin') || 
                                        email === 'carayag@ugp-ssm.cl';

                        const newUser: User = {
                            id: firebaseUser.uid,
                            email: email,
                            name: firebaseUser.displayName || email.split('@')[0],
                            nickname: email.split('@')[0],
                            role: isAdmin ? UserRole.ADMIN : UserRole.ANALYST,
                            avatar: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser.displayName || email}`,
                            organization: isAdmin ? 'Administración Sistema' : 'Sin Asignar' 
                        };

                        await setDoc(userRef, newUser);
                        setUser(newUser);
                        console.log("Usuario creado en Firestore automáticamente:", newUser);
                    }
                } catch (error) {
                    console.error("Error fetching/creating user profile:", error);
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
