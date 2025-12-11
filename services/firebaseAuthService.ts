import { auth } from '../firebaseConfig'; // Importa la instancia de Auth
import { 
    signInWithEmailAndPassword, 
    signOut,
    User as FirebaseUser,
} from 'firebase/auth';

// Función de Login
export const loginUser = async (email: string, password: string): Promise<FirebaseUser> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
};

// Función de Logout
export const logoutUser = async (): Promise<void> => {
    await signOut(auth);
};

// Nota: No necesitamos una función getCurrentUser() aquí, ya que usaremos un listener global.