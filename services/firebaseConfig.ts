
import firebase from "firebase/compat/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Configuración unificada
const firebaseConfig = {
  apiKey: "AIzaSyDp79-utro8hCKE-0ddglfdfVRBTcvMJp0", 
  authDomain: "gestion-documental-procesos.firebaseapp.com",
  databaseURL: "https://gestion-documental-procesos-default-rtdb.firebaseio.com",
  projectId: "gestion-documental-procesos",
  storageBucket: "gestion-documental-procesos.firebasestorage.app",
  messagingSenderId: "441562754090",
  appId: "1:441562754090:web:e5f06f45279097ddf3a753"
};

// Initialize Firebase
// Use compat check to prevent duplicate initialization in dev environments and cast to any for modular SDK compatibility
const app = (firebase.apps.length > 0 ? firebase.app() : firebase.initializeApp(firebaseConfig)) as any;

// Export services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
