
import { useState, useEffect } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, query, collection, where, getDocs, updateDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import { UserService } from '../services/firebaseBackend';

export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
        // Initial load check for speed (Mock Session)
        const cachedInit = localStorage.getItem('sgd_user_cache');
        if (cachedInit) {
            setUser(JSON.parse(cachedInit));
        }

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                try {
                    const userRef = doc(db, "users", firebaseUser.uid);
                    const userSnap = await getDoc(userRef);
                    const email = firebaseUser.email || '';
                    
                    // Lista de correos que SIEMPRE deben ser Admin
                    const adminEmails = ['admin@empresa.com'];
                    const shouldBeAdmin = adminEmails.includes(email) || email.toLowerCase().startsWith('admin');

                    if (userSnap.exists()) {
                        // 1. El usuario ya tiene perfil
                        const userData = userSnap.data() as User;
                        
                        // Auto-fix: Corregir roles según configuración dura (solo admins reales)
                        if (shouldBeAdmin && userData.role !== UserRole.ADMIN) {
                            console.log("Upgrading user to ADMIN.");
                            const updatedUser = { ...userData, role: UserRole.ADMIN, organization: 'Administración Sistema' };
                            await updateDoc(userRef, { role: UserRole.ADMIN, organization: 'Administración Sistema' });
                            setUser(updatedUser);
                        } else {
                            setUser(userData);
                        }
                    } else {
                        // 2. Nuevo Login o Migración
                        // Verificar si existe un perfil "Pre-cargado" (importado por CSV) con este email.
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
                                avatar: firebaseUser.photoURL || existingProfile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(existingProfile.name || 'User')}`, // Fallback robusto
                                role: shouldBeAdmin ? UserRole.ADMIN : existingProfile.role // Enforce admin check
                            };
                            
                            // A. Crear nuevo usuario con ID de Google
                            // IMPORTANTE: Sanitizar undefined (Firestore no lo soporta)
                            const safeUser = JSON.parse(JSON.stringify(migratedUser));
                            await setDoc(userRef, safeUser);
                            
                            // B. Ejecutar migración profunda de referencias (Documentos, Matrices, Configs)
                            await UserService.migrateLegacyReferences(existingProfile.id, firebaseUser.uid);

                            // C. Eliminar documento antiguo para evitar duplicados
                            await deleteDoc(oldDocRef);
                            
                            setUser(migratedUser);
                        } else {
                            // CREACIÓN NUEVA (Si no existía en CSV)
                            const newUser: User = {
                                id: firebaseUser.uid,
                                email: email,
                                name: firebaseUser.displayName || email.split('@')[0],
                                nickname: email.split('@')[0],
                                role: shouldBeAdmin ? UserRole.ADMIN : UserRole.ANALYST,
                                avatar: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser.displayName || email}`,
                                organization: shouldBeAdmin ? 'Administración Sistema' : 'Sin Asignar' 
                            };

                            // IMPORTANTE: Sanitizar undefined
                            const safeNewUser = JSON.parse(JSON.stringify(newUser));
                            await setDoc(userRef, safeNewUser);
                            setUser(newUser);
                        }
                    }
                } catch (error) {
                    console.error("Error fetching/creating user profile:", error);
                    setUser(null);
                }
            } else {
                // FALLBACK: Hybrid Auth (Mock Users)
                // If Firebase has no user, check local storage for a valid mock session
                const cached = localStorage.getItem('sgd_user_cache');
                if (cached) {
                    try {
                        const parsedUser = JSON.parse(cached);
                        // Basic validation that it's a user object
                        if (parsedUser && parsedUser.id && parsedUser.role) {
                            setUser(parsedUser);
                        } else {
                            setUser(null);
                        }
                    } catch (e) {
                        setUser(null);
                    }
                } else {
                    setUser(null);
                }
            }
            setCargando(false);
        });

        return () => unsubscribe(); 
    }, []);

    return { user, cargando };
};
