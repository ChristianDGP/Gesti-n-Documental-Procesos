
// Import correctly from the modular SDK. 
// Using a namespace import with type casting to any to resolve potential type definition issues 
// where named exports might not be recognized by the compiler in specific environments.
import * as firebase from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const { initializeApp, getApps, getApp } = firebase as any;

const firebaseConfig = {
  apiKey: "AIzaSyDp79-utro8hCKE-0ddglfdfVRBTcvMJp0", 
  authDomain: "gestion-documental-procesos.firebaseapp.com",
  databaseURL: "https://gestion-documental-procesos-default-rtdb.firebaseio.com",
  projectId: "gestion-documental-procesos",
  storageBucket: "gestion-documental-procesos.firebasestorage.app",
  messagingSenderId: "441562754090",
  appId: "1:441562754090:web:e5f06f45279097ddf3a753"
};

// Standard safe initialization for avoiding duplicate initialization in HMR (Hot Module Replacement)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
