
import { auth } from './firebaseConfig'; // Importa la instancia de Auth
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
    User as FirebaseUser,
} from 'firebase/auth';

// Función de Login
export const loginUser = async (email: string, password: string): Promise<FirebaseUser> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
};

// Función de Registro (Nueva)
export const registerUser = async (email: string, password: string, name: string): Promise<FirebaseUser> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    // Actualizar el nombre de visualización (displayName)
    if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
            displayName: name
        });
    }
    
    return userCredential.user;
};

// Función de Logout
export const logoutUser = async (): Promise<void> => {
    localStorage.removeItem('sgd_user_cache'); // Clear Mock/Cache session
    await signOut(auth);
};
