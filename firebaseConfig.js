import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';

// Pega aquí las claves (apiKey, projectId, etc.)
const firebaseConfig = {
  apiKey: "TU_API_KEY_AQUI", 
  authDomain: "TU_AUTH_DOMAIN_AQUI",
  projectId: "gestion-documental-procesos",
  // ... el resto de las claves
};

// Inicializa la aplicación
const app = initializeApp(firebaseConfig);

// Exporta las instancias de los servicios
export const db = getFirestore(app);   
export const auth = getAuth(app);