
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Configuración unificada con la NUEVA API KEY proporcionada
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
const app = initializeApp(firebaseConfig);

// Export services
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
