
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
                    
                    const adminEmails = ['admin@empresa.com'];
                    const shouldBeAdmin = adminEmails.includes(email) || email.toLowerCase().startsWith('admin');

                    if (userSnap.exists()) {
                        const userData = userSnap.data() as User;
                        
                        // VERIFICACIÓN DE ESTADO ACTIVO
                        if (userData.active === false) {
                            console.warn("Intento de acceso de cuenta inactiva:", email);
                            await signOut(auth);
                            localStorage.removeItem('sgd_user_cache');
                            setUser(null);
                            alert("Su cuenta ha sido desactivada por el administrador. Contacte a soporte.");
                            return;
                        }

                        if (shouldBeAdmin && userData.role !== UserRole.ADMIN) {
                            console.log("Upgrading user to ADMIN.");
                            const updatedUser = { ...userData, role: UserRole.ADMIN, organization: 'Administración Sistema' };
                            await updateDoc(userRef, { role: UserRole.ADMIN, organization: 'Administración Sistema' });
                            setUser(updatedUser);
                        } else {
                            setUser(userData);
                        }
                    } else {
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
                            const migratedUser: User = {
                                ...existingProfile,
                                id: firebaseUser.uid, 
                                avatar: firebaseUser.photoURL || existingProfile.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(existingProfile.name || 'User')}`, 
                                role: shouldBeAdmin ? UserRole.ADMIN : existingProfile.role,
                                active: true
                            };
                            
                            const safeUser = JSON.parse(JSON.stringify(migratedUser));
                            await setDoc(userRef, safeUser);
                            await UserService.migrateLegacyReferences(existingProfile.id, firebaseUser.uid);
                            await deleteDoc(oldDocRef);
                            setUser(migratedUser);
                        } else {
                            const newUser: User = {
                                id: firebaseUser.uid,
                                email: email,
                                name: firebaseUser.displayName || email.split('@')[0],
                                nickname: email.split('@')[0],
                                role: shouldBeAdmin ? UserRole.ADMIN : UserRole.ANALYST,
                                avatar: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser.displayName || email}`,
                                organization: shouldBeAdmin ? 'Administración Sistema' : 'Sin Asignar',
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
                const cached = localStorage.getItem('sgd_user_cache');
                if (cached) {
                    try {
                        const parsedUser = JSON.parse(cached);
                        if (parsedUser && parsedUser.id && parsedUser.role && parsedUser.active !== false) {
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
