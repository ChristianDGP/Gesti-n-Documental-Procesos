// src/firebaseConfig.ts

import { initializeApp, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getAuth, Auth } from 'firebase/auth';

// 1. **CLAVES DE TU PROYECTO (Copiadas de la imagen)**
const firebaseConfig = {
  apiKey: "AIzaSyDp79-utro8hCKE-0ddglfdfVRBTcvMJp0", 
  authDomain: "gestion-documental-procesos.firebaseapp.com",
  databaseURL: "https://gestion-documental-procesos-default-rtdb.firebaseio.com",
  projectId: "gestion-documental-procesos",
  storageBucket: "gestion-documental-procesos.firebasestorage.app",
  messagingSenderId: "441562754090",
  appId: "1:441562754090:web:e5f06f45279097ddf3a753",
};

// 2. Inicializa la aplicación de Firebase (con tipado explícito)
const app: FirebaseApp = initializeApp(firebaseConfig);

// 3. Exporta las instancias de los servicios con tipado explícito
export const db: Firestore = getFirestore(app);   
export const auth: Auth = getAuth(app);