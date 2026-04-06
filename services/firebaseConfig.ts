
// Import correctly from the modular SDK. 
// Using a namespace import with type casting to any to resolve potential type definition issues 
// where named exports might not be recognized by the compiler in specific environments.
import * as firebase from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const { initializeApp, getApps, getApp } = firebase as any;

import firebaseConfig from "../firebase-applet-config.json";

// Standard safe initialization for avoiding duplicate initialization in HMR (Hot Module Replacement)
const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const db = getFirestore(app, (firebaseConfig as any).firestoreDatabaseId);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();
