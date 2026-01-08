import { auth } from './firebaseConfig'; 
import { 
    signInWithEmailAndPassword, 
    createUserWithEmailAndPassword,
    signOut,
    updateProfile,
    User as FirebaseUser,
} from 'firebase/auth';

export const loginUser = async (email: string, password: string): Promise<FirebaseUser> => {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return userCredential.user;
};

export const registerUser = async (email: string, password: string, name: string): Promise<FirebaseUser> => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    
    if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
            displayName: name
        });
    }
    
    return userCredential.user;
};

export const logoutUser = async (): Promise<void> => {
    localStorage.removeItem('sgd_user_cache'); 
    await signOut(auth);
};