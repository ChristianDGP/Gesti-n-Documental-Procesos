
import { useState, useEffect } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, query, collection, where, getDocs } from 'firebase/firestore';
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
                        // 1. El usuario ya tiene perfil con su UID (Login normal)
                        setUser(userSnap.data() as User);
                    } else {
                        // 2. Nuevo Login con Google.
                        // Verificar si existe un perfil "Pre-cargado" (importado por CSV) con este email.
                        const email = firebaseUser.email || '';
                        let existingProfile: User | null = null;
                        let oldDocRef = null;

                        if (email) {
                            const q = query(collection(db, "users"), where("email", "==", email));
                            const querySnapshot = await getDocs(q);
                            if (!querySnapshot.empty) {
                                // Encontramos un perfil huérfano (creado por CSV)
                                const docFound = querySnapshot.docs[0];
                                existingProfile = docFound.data() as User;
                                oldDocRef = docFound.ref;
                                console.log("Perfil pre-existente encontrado. Migrando a nuevo UID...");
                            }
                        }

                        if (existingProfile && oldDocRef) {
                            // MIGRACIÓN: Mover datos del ID antiguo al nuevo UID de Auth
                            const migratedUser: User = {
                                ...existingProfile,
                                id: firebaseUser.uid, // Actualizamos ID
                                avatar: firebaseUser.photoURL || existingProfile.avatar // Preferir foto de Google si existe
                            };
                            
                            // Guardar con nuevo ID
                            await setDoc(userRef, migratedUser);
                            // Eliminar documento antiguo para evitar duplicados
                            await deleteDoc(oldDocRef);
                            
                            setUser(migratedUser);
                        } else {
                            // CREACIÓN NUEVA (Si no existía en CSV)
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
                        }
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
