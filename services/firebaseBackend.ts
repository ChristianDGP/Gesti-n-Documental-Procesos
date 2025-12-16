
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
    if (!dateStr) return ''; 
    const clean = dateStr.trim();
    if (!clean || clean === '-' || clean === '0' || clean === '') return '';

    try {
        // IMPROVED REGEX: Search for date anywhere in string (removed ^ anchor)
        // Supports DD/MM/YYYY or DD-MM-YYYY
        const ddmmyyyy = clean.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
        if (ddmmyyyy) {
            let year = parseInt(ddmmyyyy[3]);
            // Handle 2-digit years (e.g. 23 -> 2023)
            if (year < 100) year += 2000;
            
            // Construct ISO string YYYY-MM-DD
            return new Date(`${year}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}T12:00:00`).toISOString();
        }
        
        // YYYY-MM-DD
        const yyyymmdd = clean.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (yyyymmdd) {
            return new Date(`${yyyymmdd[1]}-${yyyymmdd[2].padStart(2,'0')}-${yyyymmdd[3].padStart(2,'0')}T12:00:00`).toISOString();
        }

        // Try standard parsing as last resort
        const d = new Date(clean);
        if (!isNaN(d.getTime())) return d.toISOString();
    } catch(e) {}

    return ''; 
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
    // MODIFICACIÓN: Bypass de almacenamiento físico.
    // Simular éxito inmediato devolviendo una URL ficticia (hash).
    // Esto permite que el flujo continúe sin intentar conectarse a Firebase Storage.
    console.log(`[SIMULATION] Skipping physical upload for: ${file.name}. Validation was successful.`);
    return `#simulated_upload_${Date.now()}`;
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
    try {
        const newEntry: DocHistory = {
            id: `hist-${Date.now()}`, documentId: docId, userId: user.id, userName: user.name,
            action, previousState: prev, newState: next, comment, timestamp: new Date().toISOString()
        };
        await addDoc(collection(db, "history"), newEntry);
    } catch (e) {
        console.warn("History log failed (non-blocking):", e);
    }
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
        try {
            const url = await uploadToStorage(file, `new_${Date.now()}`);
            uploadedFiles.push({
               id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
               url: url, uploadedAt: new Date().toISOString()
            });
        } catch (e) {
            console.error("File upload skipped/failed:", e);
            // Continue creation even if upload 'fails' in simulated mode
        }
    }

    // Merge passed assignees (from Matrix) with Author
    const passedAssignees = hierarchy?.assignees || [];
    const mergedAssignees = Array.from(new Set([...passedAssignees, author.id]));

    const newDocData: Omit<Document, 'id'> = {
      title, description, authorId: author.id, authorName: author.name,
      assignedTo: author.id, 
      assignees: mergedAssignees, 
      state, version: initialVersion || '0.0', progress: initialProgress || 10,
      hasPendingRequest: isSubmission,
      files: uploadedFiles, 
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      project: hierarchy?.project, macroprocess: hierarchy?.macro, process: hierarchy?.process, microprocess: hierarchy?.micro, docType: hierarchy?.docType
    };
    const safeDocData = JSON.parse(JSON.stringify(newDocData));
    const docRef = await addDoc(collection(db, "documents"), safeDocData);
    const docId = docRef.id;
    
    // Explicit History Logging for State Change
    const previousStateForLog = DocState.NOT_STARTED; 
    const stateLabel = STATE_CONFIG[state]?.label || 'Desconocido';

    await HistoryService.log(docId, author, 'Creación', previousStateForLog, state, `Documento creado en estado: ${stateLabel} (Versión ${initialVersion}).`);
    await HistoryService.log(docId, author, 'Asignación', state, state, `Asignado a: ${author.name} ${passedAssignees.length > 0 ? `y ${passedAssignees.length} analistas más` : ''}`);
    
    // --- NEW: Trigger Notification if created in Review State ---
    if (state === DocState.INTERNAL_REVIEW || state === DocState.SENT_TO_REFERENT || state === DocState.SENT_TO_CONTROL) {
        const allUsers = await UserService.getAll();
        const coordinators = allUsers.filter(u => u.role === UserRole.COORDINATOR || u.role === UserRole.ADMIN);
        
        coordinators.forEach(coord => {
            NotificationService.create(
                coord.id,
                docId,
                'ASSIGNMENT',
                'Nueva Solicitud de Revisión',
                `El documento "${title}" ha sido cargado directamente en etapa de revisión (${stateLabel}).`,
                author.name
            );
        });
    }

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
      
      // Determine next state
      if (customVersion) {
        newVersion = customVersion;
        // Auto-determine state from version structure
        const { state } = determineStateFromVersion(customVersion);
        newState = state;
      }
      
      // Force state override if provided by Approve/Reject logic
      if (action === 'APPROVE') {
          hasPending = false;
          // State is updated via determineStateFromVersion above if version changed
      } else if (action === 'REJECT') {
          hasPending = false;
          // IMPORTANT: Rejections might need to go back to specific states based on version
          const { state } = determineStateFromVersion(newVersion);
          newState = state;
          comment = `RECHAZADO: ${comment}`;
      } else if (action === 'REQUEST_APPROVAL') {
          hasPending = true;
          // If purely requesting approval from In Process, go to Internal Review
          if (currentDoc.state === DocState.IN_PROCESS || currentDoc.state === DocState.INITIATED || currentDoc.state === DocState.REJECTED || currentDoc.state === DocState.NOT_STARTED) {
              newState = DocState.INTERNAL_REVIEW;
          }
      } else if (action === 'ADVANCE') {
          hasPending = false; 
          if (currentDoc.state === DocState.REJECTED) newState = DocState.IN_PROCESS; 
      } else if (action === 'COMMENT') {
          comment = `OBSERVACIÓN: ${comment}`; 
      }

      let finalFiles = [...(currentDoc.files || [])];

      if (file) {
          // In simulation mode, we don't really delete old files either, but we reset the list
          // await cleanupOldFiles(currentDoc.files); 
          finalFiles = []; 
          if (STORAGE_ALLOWED_STATES.includes(newState) || newState === DocState.IN_PROCESS || newState === DocState.REJECTED) {
              try {
                  const url = await uploadToStorage(file, docId);
                  finalFiles.push({
                      id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
                      url: url, uploadedAt: new Date().toISOString()
                  });
              } catch (e) {
                  console.error("Transition upload skipped:", e);
              }
          }
      }

      const progress = STATE_CONFIG[newState]?.progress || currentDoc.progress;
      await updateDoc(docRef, {
          state: newState, version: newVersion, hasPendingRequest: hasPending,
          files: finalFiles, progress, updatedAt: new Date().toISOString()
      });
      const actionLabel = action === 'COMMENT' ? 'Observación' : action;
      await HistoryService.log(docId, user, actionLabel, currentDoc.state, newState, comment);
      
      // Async Notifications (Non-blocking)
      const notifyPromises = [];
      if (action === 'APPROVE' || action === 'REJECT') {
          const targetIds = currentDoc.assignees || [currentDoc.authorId];
          const type = action === 'APPROVE' ? 'APPROVAL' : 'REJECTION';
          const title = action === 'APPROVE' ? 'Documento Aprobado' : 'Documento Rechazado';
          targetIds.forEach(targetId => {
              if (targetId !== user.id) {
                  notifyPromises.push(NotificationService.create(targetId, docId, type, title, `${currentDoc.title}: ${comment}`, user.name));
              }
          });
      }
      
      if (action === 'COMMENT') {
           if (user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) {
               const targetIds = currentDoc.assignees || [currentDoc.authorId];
               targetIds.forEach(targetId => {
                  if (targetId !== user.id) notifyPromises.push(NotificationService.create(targetId, docId, 'COMMENT', 'Nueva Observación', `${currentDoc.title}: ${comment}`, user.name));
               });
           } else {
               const allUsers = await UserService.getAll();
               const coords = allUsers.filter(u => u.role === UserRole.COORDINATOR);
               coords.forEach(c => notifyPromises.push(NotificationService.create(c.id, docId, 'COMMENT', 'Comentario de Analista', `${currentDoc.title}: ${comment}`, user.name)));
           }
      }

      if (action === 'REQUEST_APPROVAL') {
           const allUsers = await UserService.getAll();
           let targets = allUsers.filter(u => u.role === UserRole.COORDINATOR);
           if (targets.length === 0) targets = allUsers.filter(u => u.role === UserRole.ADMIN);

           for (const target of targets) {
               notifyPromises.push(NotificationService.create(
                   target.id, 
                   docId, 
                   'ASSIGNMENT', 
                   'Solicitud de Aprobación', 
                   `El documento "${currentDoc.title}" (v${newVersion}) requiere su revisión.`, 
                   user.name
               ));
           }
      }
      // Execute notifications in background
      Promise.allSettled(notifyPromises);
  }
};

export const HierarchyService = {
  getFullHierarchy: async (): Promise<FullHierarchy> => {
    const q = query(collection(db, "process_matrix"));
    const snapshot = await getDocs(q);
    const hierarchy: FullHierarchy = {};
    
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const proj = data.project;
      // FIX: Read either 'macro' or 'macroprocess' to support legacy/migrated data without breaking UI
      const macro = data.macro || data.macroprocess || 'Sin Macroproceso';
      const process = data.process;
      const node: ProcessNode = {
        name: data.name,
        docId: doc.id,
        assignees: data.assignees || [],
        requiredTypes: data.requiredTypes || [],
        active: data.active !== false // Default true
      };
      
      if (!hierarchy[proj]) hierarchy[proj] = {};
      if (!hierarchy[proj][macro]) hierarchy[proj][macro] = {};
      if (!hierarchy[proj][macro][process]) hierarchy[proj][macro][process] = [];
      
      hierarchy[proj][macro][process].push(node);
    });
    
    return hierarchy;
  },
  
  getUserHierarchy: async (userId: string): Promise<UserHierarchy> => {
      const q = query(collection(db, "process_matrix"), where("assignees", "array-contains", userId));
      const snapshot = await getDocs(q);
      const hierarchy: UserHierarchy = {};

      snapshot.docs.forEach(doc => {
          const data = doc.data();
           if (data.active === false) return;

          const proj = data.project;
          // FIX: Read either 'macro' or 'macroprocess'
          const macro = data.macro || data.macroprocess || 'Sin Macroproceso';
          const process = data.process;
          
          if (!hierarchy[proj]) hierarchy[proj] = {};
          if (!hierarchy[proj][macro]) hierarchy[proj][macro] = {};
          if (!hierarchy[proj][macro][process]) hierarchy[proj][macro][process] = [];
          
          hierarchy[proj][macro][process].push(data.name);
      });
      return hierarchy;
  },

  getRequiredTypesMap: async (): Promise<Record<string, DocType[]>> => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const map: Record<string, DocType[]> = {};
      
      snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (data.active === false) return;
          const key = `${normalizeHeader(data.project)}|${normalizeHeader(data.name)}`;
          map[key] = data.requiredTypes || [];
      });
      return map;
  },

  updateMatrixAssignment: async (docId: string, assignees: string[], assignedBy: string) => {
      const ref = doc(db, "process_matrix", docId);
      await updateDoc(ref, { assignees });
  },

  toggleRequiredType: async (docId: string, type: DocType) => {
      const ref = doc(db, "process_matrix", docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
          const data = snap.data();
          const current = new Set(data.requiredTypes || []);
          if (current.has(type)) current.delete(type);
          else current.add(type);
          await updateDoc(ref, { requiredTypes: Array.from(current) });
      }
  },

  addMicroprocess: async (project: string, macro: string, process: string, name: string, assignees: string[], requiredTypes: string[]) => {
      const id = generateMatrixId(project, name);
      const ref = doc(db, "process_matrix", id);
      await setDoc(ref, {
          project, macroprocess: macro, process, name, assignees, requiredTypes, active: true
      });
  },

  deleteMicroprocess: async (docId: string) => {
      await deleteDoc(doc(db, "process_matrix", docId));
  },
  
  toggleProcessStatus: async (docId: string, currentStatus: boolean) => {
      const ref = doc(db, "process_matrix", docId);
      await updateDoc(ref, { active: !currentStatus }); // Invert status
  },
  
  updateHierarchyNode: async (level: 'PROJECT' | 'MACRO' | 'PROCESS', oldName: string, newName: string, context: { project?: string, macro?: string }) => {
      let q = query(collection(db, "process_matrix"));
      if (level === 'PROJECT') {
          q = query(collection(db, "process_matrix"), where("project", "==", oldName));
      } else if (level === 'MACRO') {
           q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", oldName));
      } else if (level === 'PROCESS') {
           q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", context.macro), where("process", "==", oldName));
      }
      
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.docs.forEach(d => {
          const update: any = {};
          if (level === 'PROJECT') update.project = newName;
          if (level === 'MACRO') update.macroprocess = newName;
          if (level === 'PROCESS') update.process = newName;
          
          if (level === 'PROJECT') {
              const data = d.data();
              const newId = generateMatrixId(newName, data.name);
              const newRef = doc(db, "process_matrix", newId);
              batch.set(newRef, { ...data, ...update });
              batch.delete(d.ref);
          } else {
              batch.update(d.ref, update);
          }
      });
      await batch.commit();
  },
  
  deleteHierarchyNode: async (level: 'PROJECT' | 'MACRO' | 'PROCESS', name: string, context: { project?: string, macro?: string }) => {
      let q = query(collection(db, "process_matrix"));
      if (level === 'PROJECT') {
          q = query(collection(db, "process_matrix"), where("project", "==", name));
      } else if (level === 'MACRO') {
           q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", name));
      } else if (level === 'PROCESS') {
           q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", context.macro), where("process", "==", name));
      }
      
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
  },
  
  moveMicroprocess: async (docId: string, targetProject: string, targetMacro: string, targetProcess: string) => {
      const ref = doc(db, "process_matrix", docId);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("Microprocess not found");
      
      const data = snap.data();
      if (data.project !== targetProject) {
          const newId = generateMatrixId(targetProject, data.name);
          const newRef = doc(db, "process_matrix", newId);
          await setDoc(newRef, { ...data, project: targetProject, macroprocess: targetMacro, process: targetProcess });
          await deleteDoc(ref);
      } else {
          await updateDoc(ref, { macroprocess: targetMacro, process: targetProcess });
      }
  },
  
  seedDefaults: async () => {
      const batch = writeBatch(db);
      for (const row of REQUIRED_DOCS_MATRIX) {
           const [project, micro, asis, fce, pm, tobe] = row;
           const requiredTypes: string[] = [];
           if (asis) requiredTypes.push('AS IS');
           if (fce) requiredTypes.push('FCE');
           if (pm) requiredTypes.push('PM');
           if (tobe) requiredTypes.push('TO BE');
           
           const id = generateMatrixId(project, micro);
           const ref = doc(db, "process_matrix", id);
           
           const snap = await getDoc(ref);
           if (!snap.exists()) {
               batch.set(ref, {
                   project,
                   macroprocess: 'Macroproceso General',
                   process: 'Proceso General',
                   name: micro,
                   assignees: [],
                   requiredTypes,
                   active: true
               });
           }
      }
      await batch.commit();
  }
};

export const DatabaseService = {
    exportData: async (): Promise<string> => {
        const collections = ['users', 'documents', 'history', 'process_matrix', 'notifications'];
        const data: any = {};
        
        for (const colName of collections) {
            const snapshot = await getDocs(collection(db, colName));
            data[colName] = snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));
        }
        return JSON.stringify(data, null, 2);
    },
    
    importData: async (jsonString: string) => {
        const data = JSON.parse(jsonString);
        
        for (const colName of Object.keys(data)) {
            await deleteCollectionInBatches(colName);
            
            const items = data[colName];
            let batch = writeBatch(db);
            let count = 0;
            
            for (const item of items) {
                const { _id, ...docData } = item;
                const ref = doc(db, colName, _id);
                batch.set(ref, docData);
                count++;
                if (count >= 400) {
                    await batch.commit();
                    batch = writeBatch(db);
                    count = 0;
                }
            }
            if (count > 0) await batch.commit();
        }
    },
    
    fullSystemResetAndImport: async (rulesCSV: string, historyCSV: string, onProgress: (percent: number, status: string) => void): Promise<{ created: number, historyMatched: number }> => {
        // 1. Clear Database
        onProgress(5, "Limpiando base de datos...");
        await deleteCollectionInBatches("documents");
        await deleteCollectionInBatches("history");
        await deleteCollectionInBatches("process_matrix");
        await deleteCollectionInBatches("notifications");
        
        onProgress(10, "Procesando reglas de estructura...");
        
        // 2. Parse Rules CSV (Structure)
        const rows = rulesCSV.split(/\r?\n/).filter(r => r.trim().length > 0);
        const headers = rows[0].split(/[;,]/).map(h => normalizeHeader(h));
        
        const idxProject = headers.findIndex(h => h.includes('PROYECTO'));
        const idxMacro = headers.findIndex(h => h.includes('MACRO'));
        const idxProcess = headers.findIndex(h => h === 'PROCESO');
        const idxMicro = headers.findIndex(h => h.includes('MICRO'));
        const idxAnalyst = headers.findIndex(h => h.includes('ANALISTA') || h.includes('RESPONSABLE'));
        
        const idxAsis = headers.findIndex(h => h.includes('ASIS') || h.includes('AS IS'));
        const idxFce = headers.findIndex(h => h.includes('FCE'));
        const idxPm = headers.findIndex(h => h.includes('PM'));
        const idxTobe = headers.findIndex(h => h.includes('TOBE') || h.includes('TO BE'));
        
        const allUsers = await UserService.getAll();
        let createdCount = 0;
        let batch = writeBatch(db);
        let opCount = 0;
        
        const matrixMap = new Map<string, ProcessNode>();

        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(/[;,]/).map(c => c.trim());
            if (cols.length < 3) continue;
            
            const project = cols[idxProject] || 'GENERAL';
            const macro = cols[idxMacro] || 'General';
            const process = cols[idxProcess] || 'General';
            const micro = cols[idxMicro];
            
            if (!micro) continue;

            const analystRaw = cols[idxAnalyst];
            const assignees = findUserIdsFromCSV(allUsers, analystRaw);

            const requiredTypes: string[] = [];
            if (cols[idxAsis] === '1') requiredTypes.push('AS IS');
            if (cols[idxFce] === '1') requiredTypes.push('FCE');
            if (cols[idxPm] === '1') requiredTypes.push('PM');
            if (cols[idxTobe] === '1') requiredTypes.push('TO BE');
            if (requiredTypes.length === 0) {
                 requiredTypes.push('AS IS', 'FCE', 'PM', 'TO BE');
            }

            const id = generateMatrixId(project, micro);
            const nodeData = {
                project, macroprocess: macro, process, name: micro, assignees, requiredTypes, active: true
            };
            
            const ref = doc(db, "process_matrix", id);
            batch.set(ref, nodeData);
            
            // FIXME: Storing raw analyst name in memory map to allow fallback in Step 3
            matrixMap.set(id, { docId: id, ...nodeData, rawAnalyst: analystRaw } as any);
            
            opCount++;
            createdCount++;
            
            if (opCount >= 400) {
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
                onProgress(10 + Math.floor((i / rows.length) * 40), `Estructurando: ${createdCount} nodos...`);
            }
        }
        if (opCount > 0) await batch.commit();

        // 3. Process History CSV (Optional)
        let historyMatched = 0;
        
        if (historyCSV) {
             onProgress(50, "Procesando histórico...");
             const hRows = historyCSV.split(/\r?\n/).filter(r => r.trim().length > 0);
             const hHeaders = hRows[0].split(/[;,]/).map(h => normalizeHeader(h));
             
             const hIdxProject = hHeaders.findIndex(h => h.includes('PROYECTO'));
             const hIdxMicro = hHeaders.findIndex(h => h.includes('MICRO'));
             
             // NEW: Identify separate column indices for Version and Date for each DocType
             const typeCols: { type: string, versionIndex: number, dateIndex: number }[] = [];
             ['AS IS', 'FCE', 'PM', 'TO BE'].forEach(t => {
                 const normType = normalizeHeader(t);
                 // Look for headers containing both Type and "VERSION"/"FECHA" respectively
                 // "Versión AS IS" -> "VERSION AS IS"
                 // "Fecha AS IS" -> "FECHA AS IS"
                 const versionIndex = hHeaders.findIndex(h => h.includes(normType) && h.includes('VERSION'));
                 const dateIndex = hHeaders.findIndex(h => h.includes(normType) && h.includes('FECHA'));
                 
                 // Only add if at least Version column is found
                 if (versionIndex !== -1) {
                     typeCols.push({ type: t, versionIndex, dateIndex });
                 }
             });

             batch = writeBatch(db);
             opCount = 0;
             
             for (let i = 1; i < hRows.length; i++) {
                 const cols = hRows[i].split(/[;,]/).map(c => c.trim());
                 if (cols.length < 2) continue;
                 
                 const project = cols[hIdxProject];
                 const micro = cols[hIdxMicro];
                 
                 if (!project || !micro) continue;
                 
                 const matrixId = generateMatrixId(project, micro);
                 const matrixNode = matrixMap.get(matrixId);
                 
                 if (matrixNode) {
                     for (const tc of typeCols) {
                         // Extract Version and Date from separate columns
                         const versionCell = cols[tc.versionIndex];
                         const dateCell = tc.dateIndex !== -1 ? cols[tc.dateIndex] : '';

                         if (!versionCell || versionCell === '-' || versionCell === '0') continue;
                         
                         const version = versionCell.trim();
                         let date = new Date().toISOString(); 
                         
                         // Try to parse specific Date column if available
                         if (dateCell) {
                             const parsed = parseDateString(dateCell);
                             if (parsed) date = parsed;
                         } else {
                             // Fallback: Check if version cell itself contains a date (legacy logic support)
                             const match = versionCell.match(/\((.+?)\)/);
                             if (match) {
                                 const parsed = parseDateString(match[1]);
                                 if (parsed) date = parsed;
                             }
                         }
                         
                         const { state, progress } = determineStateFromVersion(version);
                         
                         const docId = generateDocumentId(project, micro, tc.type);
                         const docRef = doc(db, "documents", docId);
                         
                         const authorId = (matrixNode.assignees && matrixNode.assignees.length > 0) 
                             ? matrixNode.assignees[0] 
                             : (allUsers.find(u => u.role === UserRole.ADMIN)?.id || 'admin');

                         // FIX 1: Resolve actual name or Fallback to Raw CSV Name
                         let authorName = 'Sistema (Carga)';
                         const authorUser = allUsers.find(u => u.id === authorId);
                         if (authorUser) {
                             authorName = authorUser.name;
                         } else if ((matrixNode as any).rawAnalyst) {
                             authorName = (matrixNode as any).rawAnalyst;
                         }

                         const docData = {
                             title: `${micro} - ${tc.type}`,
                             description: 'Carga Histórica',
                             project,
                             macroprocess: (matrixNode as any).macroprocess,
                             process: (matrixNode as any).process,
                             microprocess: micro,
                             docType: tc.type,
                             authorId,
                             authorName, // Using resolved or raw name
                             assignees: matrixNode.assignees,
                             state,
                             version, // Just the version string (e.g. v1.0ACG)
                             progress,
                             hasPendingRequest: false,
                             createdAt: date,
                             updatedAt: date, // FIX 2: Set activity date to historical date found in "Fecha X" column
                             files: []
                         };
                         
                         batch.set(docRef, docData);
                         historyMatched++;
                         opCount++;
                         if (opCount >= 400) {
                             await batch.commit();
                             batch = writeBatch(db);
                             opCount = 0;
                         }
                     }
                 }
                 
                 if (i % 50 === 0) onProgress(50 + Math.floor((i / hRows.length) * 40), `Importando documentos: ${historyMatched}...`);
             }
             if (opCount > 0) await batch.commit();
        }
        
        onProgress(100, "Finalizando...");
        return { created: createdCount, historyMatched };
    }
};
