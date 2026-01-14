
import { useState, useEffect } from 'react';
import { auth, db } from '../services/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, deleteDoc, query, collection, where, getDocs, updateDoc } from 'firebase/firestore';
import { User, UserRole } from '../types';
import { UserService } from '../services/firebaseBackend';

export const useAuthStatus = () => {
    const [user, setUser] = useState<User | null>(null);
    const [cargando, setCargando] = useState(true);

    useEffect(() => {
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
                    
                    const INSTITUTIONAL_DOMAIN = '@ugp-ssmso.cl';
                    const isInstitutional = email.toLowerCase().endsWith(INSTITUTIONAL_DOMAIN);
                    
                    if (userSnap.exists()) {
                        // USUARIO EXISTENTE: Respetamos lo que diga la base de datos.
                        // Esto permite que el Admin cambie el rol y el cambio persista.
                        const userData = userSnap.data() as User;
                        
                        if (userData.active === false) {
                            await signOut(auth);
                            localStorage.removeItem('sgd_user_cache');
                            setUser(null);
                            alert("Su cuenta ha sido desactivada. Contacte al administrador.");
                            return;
                        }

                        setUser(userData);
                        localStorage.setItem('sgd_user_cache', JSON.stringify(userData));
                    } else {
                        // EL USUARIO ENTRA POR PRIMERA VEZ (No existe en la colección "users")
                        
                        // 1. Verificar si hay un perfil legacy (ej: cargado vía Excel)
                        let existingProfile: User | null = null;
                        let oldDocRef = null;

                        if (email) {
                            const q = query(collection(db, "users"), where("email", "==", email));
                            const querySnapshot = await getDocs(q);
                            if (!querySnapshot.empty) {
                                const docFound = querySnapshot.docs[0];
                                existingProfile = docFound.data() as User;
                                oldDocRef = docFound.ref;
                            }
                        }

                        if (existingProfile && oldDocRef) {
                            // MIGRACIÓN: El email existía pero es su primer login con esta cuenta de Google/Email
                            // Forzamos GUEST por defecto para cumplimiento de seguridad inicial
                            const migratedUser: User = {
                                ...existingProfile,
                                id: firebaseUser.uid, 
                                avatar: firebaseUser.photoURL || existingProfile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(existingProfile.name || 'User')}`, 
                                role: UserRole.GUEST, // REGLA: Siempre inicia como GUEST
                                active: true,
                                organization: isInstitutional ? 'Servicio de Salud Metropolitano Sur Oriente' : 'Acceso Externo (Visitante)'
                            };
                            
                            const safeUser = JSON.parse(JSON.stringify(migratedUser));
                            await setDoc(userRef, safeUser);
                            await UserService.migrateLegacyReferences(existingProfile.id, firebaseUser.uid);
                            await deleteDoc(oldDocRef);
                            setUser(migratedUser);
                        } else {
                            // NUEVO USUARIO TOTAL
                            const newUser: User = {
                                id: firebaseUser.uid,
                                email: email,
                                name: firebaseUser.displayName || email.split('@')[0],
                                nickname: email.split('@')[0],
                                role: UserRole.GUEST, // REGLA: Siempre inicia como GUEST
                                avatar: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser.displayName || email}`,
                                organization: isInstitutional ? 'Servicio de Salud Metropolitano Sur Oriente' : 'Acceso Externo (Visitante)',
                                active: true 
                            };

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
                localStorage.removeItem('sgd_user_cache');
                setUser(null);
            }
            setCargando(false);
        });

        return () => unsubscribe(); 
    }, []);

    return { user, cargando };
};
