
import { 
  collection, getDocs, doc, getDoc, setDoc, updateDoc, addDoc, 
  query, where, orderBy, deleteDoc, Timestamp, writeBatch, onSnapshot 
} from "firebase/firestore";
import { 
  signInWithPopup, signOut, onAuthStateChanged 
} from "firebase/auth";
import { 
  ref, uploadBytes, getDownloadURL, deleteObject 
} from "firebase/storage";
import { db, auth, googleProvider, storage } from "./firebaseConfig";
import { 
  User, Document, DocState, DocHistory, UserRole, DocFile, 
  AnalystWorkload, DocType, FullHierarchy, Notification, UserHierarchy, ProcessNode 
} from "../types";
import { 
  STATE_CONFIG, INITIAL_DATA_LOAD, NAME_TO_ID_MAP, REQUIRED_DOCS_MATRIX 
} from "../constants";

// --- Helpers ---
const determineStateFromVersion = (version: string): { state: DocState, progress: number } => {
    const v = (version || '').trim();
    
    // 0. Sin Datos / No Iniciado (Guion o Vacío Explicito)
    if (!v || v === '-' || v === '0') return { state: DocState.NOT_STARTED, progress: 0 };

    // 1. Iniciado Estricto
    if (v === '0.0') return { state: DocState.INITIATED, progress: 10 };
    
    // 2. Estados Finales/Control (Siempre tienen sufijo)
    if (v.endsWith('ACG')) return { state: DocState.APPROVED, progress: 100 };
    if (v.endsWith('AR')) return { state: DocState.SENT_TO_CONTROL, progress: 90 };
    
    // 3. Revisión Referente y Control (v1.x) - ESTRICTO CON 'v'
    // Detecta v1.0, v1.0.1, v1.1, etc.
    if (v.startsWith('v1.') && !v.includes('AR') && !v.includes('ACG')) return { state: DocState.SENT_TO_REFERENT, progress: 80 };
    
    // 4. Revisión Interna (v0.x) - ESTRICTO CON 'v'
    if (v.startsWith('v0.')) return { state: DocState.INTERNAL_REVIEW, progress: 60 };
    
    // 5. En Proceso (0.x) - SIN 'v'
    // Si empieza con número (ej: 0.1, 1.0 sin v), se considera trabajo en proceso no formalizado
    if (/^\d+\./.test(v)) return { state: DocState.IN_PROCESS, progress: 30 };
    
    // Fallback
    return { state: DocState.IN_PROCESS, progress: 30 };
};

// Robust string normalization for header matching
export const normalizeHeader = (header: string): string => {
    if (!header) return '';
    return header
        .trim()
        .toUpperCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/^"|"$/g, ''); // Remove quotes
};

// Generates a deterministic ID for matrix rows to PREVENT DUPLICATES
export const generateMatrixId = (project: string, micro: string): string => {
    const p = normalizeHeader(project).replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const m = normalizeHeader(micro).replace(/[^A-Z0-9]+/g, '_').substring(0, 60); 
    return `MTX_${p}_${m}`;
};

// Generates a deterministic ID for Documents to PREVENT DUPLICATES during import
export const generateDocumentId = (project: string, micro: string, type: string): string => {
    const p = normalizeHeader(project).replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const m = normalizeHeader(micro).replace(/[^A-Z0-9]+/g, '_').substring(0, 60);
    const t = normalizeHeader(type).replace(/[^A-Z0-9]/g, '');
    return `DOC_${p}_${m}_${t}`;
};

// Helper to parse Dates robustly (DD/MM/YYYY, YYYY-MM-DD)
const parseDateString = (dateStr: string): string => {
    if (!dateStr) return ''; // Empty string if no date provided
    const clean = dateStr.trim();
    if (!clean || clean === '-' || clean === '0' || clean === '') return '';

    try {
        // DD/MM/YYYY or DD-MM-YYYY
        const ddmmyyyy = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
        if (ddmmyyyy) {
            // Note: Month is 0-indexed in JS Date, but ISO string handles correct YYYY-MM-DD
            // Using string construction to avoid timezone issues affecting the day
            return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}T12:00:00`).toISOString();
        }
        
        // YYYY-MM-DD
        const yyyymmdd = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (yyyymmdd) {
            return new Date(`${yyyymmdd[1]}-${yyyymmdd[2].padStart(2,'0')}-${yyyymmdd[3].padStart(2,'0')}T12:00:00`).toISOString();
        }

        // Try standard parsing
        const d = new Date(clean);
        if (!isNaN(d.getTime())) return d.toISOString();
    } catch(e) {}

    return ''; // Return empty if parsing fails
};

// Helper to find user ID by fuzzy name/email match
const findUserIdsFromCSV = (users: User[], rawValue: string): string[] => {
    if (!rawValue || !rawValue.trim()) return [];
    
    const names = rawValue.split(/[,/&;]|\s+y\s+|\s+-\s+/).map(n => n.trim()).filter(n => n.length > 2);
    const matchedIds: Set<string> = new Set();

    names.forEach(namePart => {
        const cleanPart = normalizeHeader(namePart);
        let match = users.find(u => u.email.toUpperCase() === cleanPart);
        if (!match) match = users.find(u => normalizeHeader(u.name).includes(cleanPart));
        if (!match) match = users.find(u => u.nickname && normalizeHeader(u.nickname) === cleanPart);
        if (!match) {
            const parts = cleanPart.split(' ');
            match = users.find(u => {
                const uName = normalizeHeader(u.name);
                return parts.every(p => p.length < 3 || uName.includes(p));
            });
        }
        if (match) matchedIds.add(match.id);
    });

    return Array.from(matchedIds);
};

const deleteCollectionInBatches = async (collectionName: string, batchSize: number = 400) => {
    const colRef = collection(db, collectionName);
    const q = query(colRef);
    const snapshot = await getDocs(q);
    if (snapshot.size === 0) return;
    let deleted = 0;
    let batch = writeBatch(db);
    let operationCounter = 0;
    for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        operationCounter++;
        deleted++;
        if (operationCounter >= batchSize) {
            await batch.commit();
            batch = writeBatch(db);
            operationCounter = 0;
        }
    }
    if (operationCounter > 0) await batch.commit();
    console.log(`Deleted ${deleted} docs from ${collectionName}`);
};

// --- Services ---

// 1GB POLICY HELPERS
const STORAGE_ALLOWED_STATES = [
    DocState.INTERNAL_REVIEW,
    DocState.SENT_TO_REFERENT,
    DocState.REFERENT_REVIEW,
    DocState.SENT_TO_CONTROL,
    DocState.CONTROL_REVIEW,
    DocState.REJECTED
];

const cleanupOldFiles = async (files: DocFile[]) => {
    if (!files || files.length === 0) return;
    const deletionPromises = files.map(async (file) => {
        if (file.url && file.url !== '#' && file.url.includes('firebasestorage')) {
            try {
                const fileRef = ref(storage, file.url);
                await deleteObject(fileRef);
            } catch (e: any) {
                if (e.code !== 'storage/object-not-found') {
                    console.warn(`Could not delete file ${file.name}:`, e.message);
                }
            }
        }
    });
    await Promise.all(deletionPromises);
};

const uploadToStorage = async (file: File, docId: string): Promise<string> => {
    try {
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const path = `docs/${docId}/${Date.now()}_${sanitizedName}`;
        const storageRef = ref(storage, path);
        await uploadBytes(storageRef, file);
        return await getDownloadURL(storageRef);
    } catch (e: any) {
        console.error("Upload error:", e);
        throw new Error(`Error subiendo archivo: ${e.message}`);
    }
};


export const NotificationService = {
    create: async (userId: string, docId: string, type: Notification['type'], title: string, message: string, actorName: string) => {
        try {
            const notif: Omit<Notification, 'id'> = {
                userId, documentId: docId, type, title, message, isRead: false,
                timestamp: new Date().toISOString(), actorName
            };
            await addDoc(collection(db, "notifications"), notif);
        } catch (e) {
            console.error("Error creating notification", e);
        }
    },
    getByUser: async (userId: string): Promise<Notification[]> => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId));
        const snapshot = await getDocs(q);
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
        return list.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    },
    getUnreadCount: async (userId: string): Promise<number> => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId), where("isRead", "==", false));
        const snapshot = await getDocs(q);
        return snapshot.size;
    },
    subscribeToUnreadCount: (userId: string, callback: (count: number) => void) => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId), where("isRead", "==", false));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.size);
        });
    },
    markAsRead: async (notifId: string) => {
        const ref = doc(db, "notifications", notifId);
        await updateDoc(ref, { isRead: true });
    },
    markAllAsRead: async (userId: string) => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId), where("isRead", "==", false));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => batch.update(d.ref, { isRead: true }));
        await batch.commit();
    }
};

export const AuthService = {
  loginWithGoogle: async (): Promise<User> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        return userSnap.data() as User;
      } else {
        return {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || 'Usuario',
          role: UserRole.ANALYST,
          avatar: firebaseUser.photoURL || '',
          organization: 'SSM'
        } as User;
      }
    } catch (error: any) {
      console.error("AuthService Login Error:", error);
      throw error;
    }
  },
  getCurrentUser: (): User | null => {
    const cached = localStorage.getItem('sgd_user_cache');
    return cached ? JSON.parse(cached) : null;
  },
  logout: async () => {
    await signOut(auth);
    localStorage.removeItem('sgd_user_cache');
  },
  syncSession: async (callback: (u: User | null) => void) => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data() as User;
          localStorage.setItem('sgd_user_cache', JSON.stringify(userData));
          callback(userData);
        } else { callback(null); }
      } else {
        localStorage.removeItem('sgd_user_cache');
        callback(null);
      }
    });
  }
};

export const UserService = {
  getAll: async (): Promise<User[]> => {
    const q = query(collection(db, "users"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as User);
  },
  update: async (id: string, userData: Partial<User>): Promise<User> => {
    const userRef = doc(db, "users", id);
    const safeData = JSON.parse(JSON.stringify(userData));
    await updateDoc(userRef, safeData);
    const updatedSnap = await getDoc(userRef);
    return updatedSnap.data() as User;
  },
  create: async (userData: User): Promise<User> => {
      const safeData = JSON.parse(JSON.stringify(userData));
      await setDoc(doc(db, "users", userData.id), safeData);
      return userData;
  },
  delete: async (id: string) => {
      await deleteDoc(doc(db, "users", id));
  },
  migrateLegacyReferences: async (oldId: string, newId: string) => {
      console.log(`Starting migration from ${oldId} to ${newId}...`);
      const qMatrix = query(collection(db, "process_matrix"), where("assignees", "array-contains", oldId));
      const snapMatrix = await getDocs(qMatrix);
      const matrixPromises = snapMatrix.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const newAssignees = (data.assignees || []).map((id: string) => id === oldId ? newId : id);
          await updateDoc(docSnap.ref, { assignees: newAssignees });
      });
      const qDocsAssignees = query(collection(db, "documents"), where("assignees", "array-contains", oldId));
      const snapDocsAssignees = await getDocs(qDocsAssignees);
      const docAssigneePromises = snapDocsAssignees.docs.map(async (docSnap) => {
          const data = docSnap.data();
          const newAssignees = (data.assignees || []).map((id: string) => id === oldId ? newId : id);
          const updates: any = { assignees: newAssignees };
          if (data.assignedTo === oldId) updates.assignedTo = newId;
          await updateDoc(docSnap.ref, updates);
      });
      const qDocsAuthor = query(collection(db, "documents"), where("authorId", "==", oldId));
      const snapDocsAuthor = await getDocs(qDocsAuthor);
      const docAuthorPromises = snapDocsAuthor.docs.map(async (docSnap) => {
          await updateDoc(docSnap.ref, { authorId: newId });
      });
      await Promise.all([...matrixPromises, ...docAssigneePromises, ...docAuthorPromises]);
      console.log("Migration completed.");
  }
};

export const HistoryService = {
  getHistory: async (docId: string): Promise<DocHistory[]> => {
    const q = query(collection(db, "history"), where("documentId", "==", docId));
    const querySnapshot = await getDocs(q);
    const history = querySnapshot.docs.map(doc => doc.data() as DocHistory);
    return history.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
  log: async (docId: string, user: User, action: string, prev: DocState, next: DocState, comment: string) => {
    const newEntry: DocHistory = {
        id: `hist-${Date.now()}`, documentId: docId, userId: user.id, userName: user.name,
        action, previousState: prev, newState: next, comment, timestamp: new Date().toISOString()
    };
    await addDoc(collection(db, "history"), newEntry);
  }
};

export const DocumentService = {
  getAll: async (): Promise<Document[]> => {
    const q = query(collection(db, "documents"), orderBy("updatedAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Document));
  },
  getById: async (id: string): Promise<Document | null> => {
    const docRef = doc(db, "documents", id);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) return { id: docSnap.id, ...docSnap.data() } as Document;
    return null;
  },
  create: async (title: string, description: string, author: User, initialState?: DocState, initialVersion?: string, initialProgress?: number, file?: File, hierarchy?: any): Promise<Document> => {
    const state = initialState || DocState.INITIATED;
    const isSubmission = state === DocState.INTERNAL_REVIEW || state === DocState.SENT_TO_REFERENT || state === DocState.SENT_TO_CONTROL;
    
    let uploadedFiles: DocFile[] = [];
    if (file && STORAGE_ALLOWED_STATES.includes(state)) {
        const url = await uploadToStorage(file, `new_${Date.now()}`);
        uploadedFiles.push({
           id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
           url: url, uploadedAt: new Date().toISOString()
        });
    }

    const newDocData: Omit<Document, 'id'> = {
      title, description, authorId: author.id, authorName: author.name,
      assignedTo: author.id, assignees: [author.id],
      state, version: initialVersion || '0.0', progress: initialProgress || 10,
      hasPendingRequest: isSubmission,
      files: uploadedFiles, 
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      project: hierarchy?.project, macroprocess: hierarchy?.macro, process: hierarchy?.process, microprocess: hierarchy?.micro, docType: hierarchy?.docType
    };
    const safeDocData = JSON.parse(JSON.stringify(newDocData));
    const docRef = await addDoc(collection(db, "documents"), safeDocData);
    const docId = docRef.id;
    
    await HistoryService.log(docId, author, 'Creación', state, state, 'Documento creado (Registro de versión).');
    await HistoryService.log(docId, author, 'Asignación', state, state, `Asignado a: ${author.name}`);
    return { id: docId, ...newDocData } as Document;
  },
  
  delete: async (id: string) => {
      const docRef = doc(db, "documents", id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
          const data = snap.data() as Document;
          await cleanupOldFiles(data.files);
      }
      await deleteDoc(doc(db, "documents", id));
  },

  transitionState: async (docId: string, user: User, action: 'ADVANCE' | 'REJECT' | 'APPROVE' | 'REQUEST_APPROVAL' | 'COMMENT', comment: string, file?: File, customVersion?: string): Promise<void> => {
      const docRef = doc(db, "documents", docId);
      const docSnap = await getDoc(docRef);
      if(!docSnap.exists()) throw new Error("Doc not found");
      const currentDoc = docSnap.data() as Document;
      
      let newState = currentDoc.state;
      let newVersion = currentDoc.version;
      let hasPending = currentDoc.hasPendingRequest;
      
      if (customVersion) {
        newVersion = customVersion;
        if (action === 'APPROVE') {
            const { state } = determineStateFromVersion(customVersion);
            newState = state;
        }
      }
      switch (action) {
        case 'REQUEST_APPROVAL':
            hasPending = true;
            if (currentDoc.state === DocState.IN_PROCESS || currentDoc.state === DocState.INITIATED || currentDoc.state === DocState.REJECTED || currentDoc.state === DocState.NOT_STARTED) {
                newState = DocState.INTERNAL_REVIEW;
            }
            break;
        case 'APPROVE': hasPending = false; break;
        case 'REJECT': hasPending = false; newState = DocState.REJECTED; comment = `RECHAZADO: ${comment}`; break;
        case 'ADVANCE': hasPending = false; if (currentDoc.state === DocState.REJECTED) newState = DocState.IN_PROCESS; break;
        case 'COMMENT': comment = `OBSERVACIÓN: ${comment}`; break;
      }

      let finalFiles = [...(currentDoc.files || [])];

      if (file) {
          await cleanupOldFiles(currentDoc.files);
          finalFiles = []; 
          if (STORAGE_ALLOWED_STATES.includes(newState)) {
              const url = await uploadToStorage(file, docId);
              finalFiles.push({
                  id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
                  url: url, uploadedAt: new Date().toISOString()
              });
          }
      } else if (action === 'APPROVE' || action === 'ADVANCE') {
          if (!STORAGE_ALLOWED_STATES.includes(newState)) {
              await cleanupOldFiles(currentDoc.files);
              finalFiles = [];
          }
      }

      const progress = STATE_CONFIG[newState]?.progress || currentDoc.progress;
      await updateDoc(docRef, {
          state: newState, version: newVersion, hasPendingRequest: hasPending,
          files: finalFiles, progress, updatedAt: new Date().toISOString()
      });
      const actionLabel = action === 'COMMENT' ? 'Observación' : action;
      await HistoryService.log(docId, user, actionLabel, currentDoc.state, newState, comment);
      
      if (action === 'APPROVE' || action === 'REJECT') {
          const targetIds = currentDoc.assignees || [currentDoc.authorId];
          const type = action === 'APPROVE' ? 'APPROVAL' : 'REJECTION';
          const title = action === 'APPROVE' ? 'Documento Aprobado' : 'Documento Rechazado';
          targetIds.forEach(targetId => {
              if (targetId !== user.id) {
                  NotificationService.create(targetId, docId, type, title, `${currentDoc.title}: ${comment}`, user.name);
              }
          });
      }
      
      if (action === 'COMMENT') {
           if (user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) {
               const targetIds = currentDoc.assignees || [currentDoc.authorId];
               targetIds.forEach(targetId => {
                  if (targetId !== user.id) NotificationService.create(targetId, docId, 'COMMENT', 'Nueva Observación', `${currentDoc.title}: ${comment}`, user.name);
               });
           } else {
               const allUsers = await UserService.getAll();
               const coords = allUsers.filter(u => u.role === UserRole.COORDINATOR);
               coords.forEach(c => NotificationService.create(c.id, docId, 'COMMENT', 'Comentario de Analista', `${currentDoc.title}: ${comment}`, user.name));
           }
      }

      if (action === 'REQUEST_APPROVAL') {
           const allUsers = await UserService.getAll();
           let targets = allUsers.filter(u => u.role === UserRole.COORDINATOR);
           if (targets.length === 0) targets = allUsers.filter(u => u.role === UserRole.ADMIN);

           for (const target of targets) {
               await NotificationService.create(
                   target.id, 
                   docId, 
                   'ASSIGNMENT', 
                   'Solicitud de Aprobación', 
                   `El documento "${currentDoc.title}" (v${newVersion}) requiere su revisión.`, 
                   user.name
               );
           }
      }
  }
};

export const HierarchyService = {
  getFullHierarchy: async (): Promise<FullHierarchy> => {
    const q = query(collection(db, "process_matrix"));
    const snapshot = await getDocs(q);
    const hierarchy: FullHierarchy = {};

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (!data.project || !data.macroprocess || !data.process || !data.name) return;

      if (!hierarchy[data.project]) hierarchy[data.project] = {};
      if (!hierarchy[data.project][data.macroprocess]) hierarchy[data.project][data.macroprocess] = {};
      if (!hierarchy[data.project][data.macroprocess][data.process]) hierarchy[data.project][data.macroprocess][data.process] = [];

      hierarchy[data.project][data.macroprocess][data.process].push({
        name: data.name,
        docId: docSnap.id,
        assignees: data.assignees || [],
        requiredTypes: data.requiredTypes || [],
        active: data.active !== false
      });
    });
    return hierarchy;
  },

  getUserHierarchy: async (userId: string): Promise<UserHierarchy> => {
    const q = query(collection(db, "process_matrix"), where("assignees", "array-contains", userId));
    const snapshot = await getDocs(q);
    const userH: UserHierarchy = {};

    snapshot.docs.forEach(docSnap => {
      const data = docSnap.data();
      if (data.active !== false) {
          if (!userH[data.project]) userH[data.project] = {};
          if (!userH[data.project][data.macroprocess]) userH[data.project][data.macroprocess] = {};
          if (!userH[data.project][data.macroprocess][data.process]) userH[data.project][data.macroprocess][data.process] = [];
          userH[data.project][data.macroprocess][data.process].push(data.name);
      }
    });
    return userH;
  },

  getRequiredTypesMap: async (): Promise<Record<string, DocType[]>> => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const map: Record<string, DocType[]> = {};
      snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.active !== false) {
              const key = `${data.project}|${data.name}`;
              map[key] = data.requiredTypes || [];
          }
      });
      return map;
  },

  seedDefaults: async () => {
    const batch = writeBatch(db);
    const existing = await getDocs(collection(db, "process_matrix"));
    existing.forEach(d => batch.delete(d.ref));

    REQUIRED_DOCS_MATRIX.forEach((row: any) => {
        const [proj, micro, asis, fce, pm, tobe] = row;
        const macro = "Operativo"; 
        const process = "General"; 
        
        const types: DocType[] = [];
        if (asis) types.push('AS IS');
        if (fce) types.push('FCE');
        if (pm) types.push('PM');
        if (tobe) types.push('TO BE');

        const ref = doc(collection(db, "process_matrix"));
        batch.set(ref, {
            project: proj,
            macroprocess: macro,
            process: process,
            name: micro,
            requiredTypes: types,
            active: true,
            assignees: [] 
        });
    });
    await batch.commit();
  },

  deleteMicroprocess: async (id: string) => {
      await deleteDoc(doc(db, "process_matrix", id));
  },

  updateMatrixAssignment: async (docId: string, assignees: string[], adminId: string) => {
      await updateDoc(doc(db, "process_matrix", docId), { assignees });
  },
  
  toggleRequiredType: async (docId: string, type: DocType) => {
      const ref = doc(db, "process_matrix", docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
          const types = snap.data().requiredTypes || [];
          const newTypes = types.includes(type) 
              ? types.filter((t: string) => t !== type)
              : [...types, type];
          await updateDoc(ref, { requiredTypes: newTypes });
      }
  },

  addMicroprocess: async (project: string, macro: string, process: string, micro: string, assignees: string[], types: string[]) => {
      await addDoc(collection(db, "process_matrix"), {
          project, macroprocess: macro, process, name: micro, assignees, requiredTypes: types, active: true
      });
  },

  toggleProcessStatus: async (id: string, currentStatus: boolean) => {
      await updateDoc(doc(db, "process_matrix", id), { active: !currentStatus });
  },

  deleteHierarchyNode: async (level: string, name: string, parentContext?: any) => {
      let q = query(collection(db, "process_matrix"));
      if (level === 'PROJECT') q = query(collection(db, "process_matrix"), where("project", "==", name));
      if (level === 'MACRO') q = query(collection(db, "process_matrix"), where("project", "==", parentContext.project), where("macroprocess", "==", name));
      if (level === 'PROCESS') q = query(collection(db, "process_matrix"), where("project", "==", parentContext.project), where("macroprocess", "==", parentContext.macro), where("process", "==", name));
      
      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
  },

  updateHierarchyNode: async (level: string, oldName: string, newName: string, parentContext?: any) => {
      let q = query(collection(db, "process_matrix"));
      let fieldToUpdate = '';
      
      if (level === 'PROJECT') {
          q = query(collection(db, "process_matrix"), where("project", "==", oldName));
          fieldToUpdate = 'project';
      } else if (level === 'MACRO') {
          q = query(collection(db, "process_matrix"), where("project", "==", parentContext.project), where("macroprocess", "==", oldName));
          fieldToUpdate = 'macroprocess';
      } else if (level === 'PROCESS') {
           q = query(collection(db, "process_matrix"), where("project", "==", parentContext.project), where("macroprocess", "==", parentContext.macro), where("process", "==", oldName));
           fieldToUpdate = 'process';
      }

      const snap = await getDocs(q);
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { [fieldToUpdate]: newName }));
      await batch.commit();
  },

  moveMicroprocess: async (docId: string, targetProject: string, targetMacro: string, targetProcess: string) => {
      await updateDoc(doc(db, "process_matrix", docId), {
          project: targetProject,
          macroprocess: targetMacro,
          process: targetProcess
      });
  }
};

export const DatabaseService = {
  exportData: async (): Promise<string> => {
      const collections = ["users", "documents", "history", "process_matrix", "notifications"];
      const data: any = {};
      
      for (const colName of collections) {
          const snap = await getDocs(collection(db, colName));
          data[colName] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      }
      return JSON.stringify(data, null, 2);
  },

  importData: async (jsonContent: string) => {
      const data = JSON.parse(jsonContent);
      const batchLimit = 400;
      
      for (const colName of Object.keys(data)) {
          await deleteCollectionInBatches(colName);
          const items = data[colName];
          let batch = writeBatch(db);
          let count = 0;
          for (const item of items) {
              const { id, ...rest } = item;
              const docRef = doc(db, colName, id);
              batch.set(docRef, rest);
              count++;
              if (count >= batchLimit) {
                  await batch.commit();
                  batch = writeBatch(db);
                  count = 0;
              }
          }
          if (count > 0) await batch.commit();
      }
  },

  fullSystemResetAndImport: async (rulesCsv: string, historyCsv: string, onProgress: (percent: number, status: string) => void) => {
      onProgress(5, "Limpiando base de datos...");
      
      await deleteCollectionInBatches("process_matrix");
      await deleteCollectionInBatches("documents");
      await deleteCollectionInBatches("history");
      await deleteCollectionInBatches("notifications");
      
      onProgress(20, "Procesando Reglas de Estructura...");
      
      const rows = rulesCsv.split('\n').map(r => r.trim()).filter(r => r);
      const startIdx = rows[0].toLowerCase().includes('macro') ? 1 : 0;
      
      let batch = writeBatch(db);
      let opCount = 0;
      let matrixCount = 0;
      
      const usersSnap = await getDocs(collection(db, "users"));
      const users = usersSnap.docs.map(d => d.data() as User);
      
      for (let i = startIdx; i < rows.length; i++) {
          const cols = rows[i].split(';');
          if (cols.length < 5) continue;
          
          const [macro, proc, micro, analystRaw, project, asis, fce, pm, tobe] = cols;
          
          const assigneeIds = findUserIdsFromCSV(users, analystRaw);
          const requiredTypes: DocType[] = [];
          if (asis === '1') requiredTypes.push('AS IS');
          if (fce === '1') requiredTypes.push('FCE');
          if (pm === '1') requiredTypes.push('PM');
          if (tobe === '1') requiredTypes.push('TO BE');
          
          const docId = generateMatrixId(project, micro);
          const ref = doc(db, "process_matrix", docId);
          
          batch.set(ref, {
              project: project.trim(),
              macroprocess: macro.trim(),
              process: proc.trim(),
              name: micro.trim(),
              assignees: assigneeIds,
              requiredTypes,
              active: true
          }, { merge: true });

          opCount++;
          if (opCount >= 400) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
              onProgress(20 + Math.floor((i / rows.length) * 30), `Cargando estructura (${i}/${rows.length})...`);
          }
          matrixCount++;
      }
      if (opCount > 0) await batch.commit();
      
      onProgress(50, "Procesando Historial...");
      let historyMatched = 0;
      
      // FIX: Improved History Parsing based on strict column structure
      if (historyCsv) {
          const hRows = historyCsv.split('\n').map(r => r.trim()).filter(r => r);
          const hStartIdx = hRows[0].toLowerCase().includes('proyecto') ? 1 : 0;
          
          batch = writeBatch(db);
          opCount = 0;
          
          for (let i = hStartIdx; i < hRows.length; i++) {
              const cols = hRows[i].split(';');
              
              // Structure: PROYECTO(0) | MACRO(1) | PROCESO(2) | MICRO(3) | 
              // ASIS Ver(4) | ASIS Date(5) | FCE Ver(6) | FCE Date(7) | 
              // PM Ver(8) | PM Date(9) | TOBE Ver(10) | TOBE Date(11)

              if (cols.length < 4) continue;
              
              const proj = cols[0];
              const macro = cols[1];
              const proc = cols[2];
              const micro = cols[3];
              
              const typeConfigs: { type: DocType, vIdx: number, dIdx: number }[] = [
                  { type: 'AS IS', vIdx: 4, dIdx: 5 },
                  { type: 'FCE',   vIdx: 6, dIdx: 7 },
                  { type: 'PM',    vIdx: 8, dIdx: 9 },
                  { type: 'TO BE', vIdx: 10, dIdx: 11 },
              ];
              
              for (const config of typeConfigs) {
                  if (cols.length <= config.dIdx) break; // Safety check
                  
                  const version = (cols[config.vIdx] || '').trim();
                  const dateStr = (cols[config.dIdx] || '').trim();
                  
                  // Solo crear si hay versión válida (distinto de vacío, 0 o guion)
                  if (version && version !== '0' && version !== '-') {
                      const dateISO = parseDateString(dateStr) || new Date().toISOString();
                      const { state, progress } = determineStateFromVersion(version);
                      
                      const docId = generateDocumentId(proj, micro, config.type);
                      const docRef = doc(db, "documents", docId);
                      
                      batch.set(docRef, {
                          title: `${micro.trim()} - ${config.type}`,
                          description: 'Migración Histórica',
                          project: proj.trim(),
                          macroprocess: macro.trim(),
                          process: proc.trim(),
                          microprocess: micro.trim(),
                          docType: config.type,
                          state,
                          version,
                          progress,
                          files: [],
                          authorId: 'system_migration',
                          authorName: 'Sistema (Histórico)',
                          createdAt: dateISO,
                          updatedAt: dateISO, // Important: This fixes the Last Activity date in Dashboard
                          assignees: [] // Will be merged via Matrix later or Dashboard
                      });
                      
                      opCount++;
                      historyMatched++;
                  }
              }

              if (opCount >= 400) {
                  await batch.commit();
                  batch = writeBatch(db);
                  opCount = 0;
                  onProgress(50 + Math.floor((i / hRows.length) * 40), `Cargando historial (${i}/${hRows.length})...`);
              }
          }
          if (opCount > 0) await batch.commit();
      }
      
      return { created: matrixCount, historyMatched };
  }
};
