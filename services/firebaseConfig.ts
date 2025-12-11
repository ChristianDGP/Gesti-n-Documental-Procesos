
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCMlO85AL8DBFfL1ldqCOKWP1mCO7NE3h0",
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
