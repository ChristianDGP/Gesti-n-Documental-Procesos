
import { 
  collection, getDocs, doc, getDoc, setDoc, updateDoc, addDoc, 
  query, where, orderBy, deleteDoc, Timestamp, writeBatch 
} from "firebase/firestore";
import { 
  signInWithPopup, signOut, onAuthStateChanged 
} from "firebase/auth";
import { 
  ref, uploadBytes, getDownloadURL 
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
    if (!v || v === '-') return { state: DocState.NOT_STARTED, progress: 0 };

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

const mapCodeToDocType = (code: string): DocType | undefined => {
    switch (code) {
        case 'AS': return 'AS IS';
        case 'FC': return 'FCE';
        case 'PM': return 'PM';
        case 'TO': return 'TO BE';
        default: return undefined;
    }
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
            return new Date(`${ddmmyyyy[3]}-${ddmmyyyy[2].padStart(2,'0')}-${ddmmyyyy[1].padStart(2,'0')}`).toISOString();
        }
        
        // YYYY-MM-DD
        const yyyymmdd = clean.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        if (yyyymmdd) {
            return new Date(`${yyyymmdd[1]}-${yyyymmdd[2].padStart(2,'0')}-${yyyymmdd[3].padStart(2,'0')}`).toISOString();
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
    const newDocData: Omit<Document, 'id'> = {
      title, description, authorId: author.id, authorName: author.name,
      assignedTo: author.id, assignees: [author.id],
      state, version: initialVersion || '0.0', progress: initialProgress || 10,
      hasPendingRequest: isSubmission,
      files: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      project: hierarchy?.project, macroprocess: hierarchy?.macro, process: hierarchy?.process, microprocess: hierarchy?.micro, docType: hierarchy?.docType
    };
    const safeDocData = JSON.parse(JSON.stringify(newDocData));
    const docRef = await addDoc(collection(db, "documents"), safeDocData);
    const docId = docRef.id;
    if (file) {
       const newFile: DocFile = {
           id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
           url: '#', uploadedAt: new Date().toISOString()
       };
       await updateDoc(docRef, { files: [newFile] });
       newDocData.files = [newFile];
    }
    await HistoryService.log(docId, author, 'Creación', state, state, 'Documento creado (Registro de versión).');
    await HistoryService.log(docId, author, 'Asignación', state, state, `Asignado a: ${author.name}`);
    return { id: docId, ...newDocData } as Document;
  },
  uploadFile: async (docId: string, file: File, user: User): Promise<DocFile> => {
      const docRef = doc(db, "documents", docId);
      const docSnap = await getDoc(docRef);
      if(!docSnap.exists()) throw new Error("Doc not found");
      const currentDoc = docSnap.data() as Document;
      const newFile: DocFile = {
          id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
          url: '#', uploadedAt: new Date().toISOString()
      };
      const updatedFiles = [...(currentDoc.files || []), newFile];
      const updates: any = { files: updatedFiles, updatedAt: new Date().toISOString() };
      const parts = file.name.replace(/\.[^/.]+$/, "").split(' - ');
      if (parts.length >= 4) {
          const newVersion = parts[parts.length - 1];
          const { state, progress } = determineStateFromVersion(newVersion);
          updates.version = newVersion;
          updates.state = state;
          updates.progress = progress;
      }
      await updateDoc(docRef, updates);
      return newFile;
  },
  delete: async (id: string) => {
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
      let updatedFiles = [...currentDoc.files];
      if (file) {
          updatedFiles.push({
              id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
              url: '#', uploadedAt: new Date().toISOString()
          });
      }
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
      const progress = STATE_CONFIG[newState]?.progress || currentDoc.progress;
      await updateDoc(docRef, {
          state: newState, version: newVersion, hasPendingRequest: hasPending,
          files: updatedFiles, progress, updatedAt: new Date().toISOString()
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
           const coords = allUsers.filter(u => u.role === UserRole.COORDINATOR);
           coords.forEach(c => NotificationService.create(c.id, docId, 'COMMENT', 'Solicitud de Aprobación', `${currentDoc.title} requiere revisión.`, user.name));
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
        const project = data.project || 'Sin Proyecto';
        const macro = data.macro || 'General';
        const process = data.process || 'General';
        const microName = data.name || data.micro || data.microprocess || 'Sin Nombre';
        
        // Active Check: default to true if undefined
        const isActive = data.active !== false; 

        if (!hierarchy[project]) hierarchy[project] = {};
        if (!hierarchy[project][macro]) hierarchy[project][macro] = {};
        if (!hierarchy[project][macro][process]) hierarchy[project][macro][process] = [];

        hierarchy[project][macro][process].push({
            name: String(microName), 
            docId: docSnap.id, 
            assignees: data.assignees || [], 
            requiredTypes: data.requiredTypes || [],
            active: isActive
        });
    });
    Object.keys(hierarchy).forEach(p => {
        Object.keys(hierarchy[p]).forEach(m => {
            Object.keys(hierarchy[p][m]).forEach(proc => {
                hierarchy[p][m][proc].sort((a, b) => {
                    const nameA = a.name || ''; const nameB = b.name || '';
                    return nameA.localeCompare(nameB);
                });
            });
        });
    });
    return hierarchy;
  },

  getUserHierarchy: async (userId: string): Promise<UserHierarchy> => {
    const q = query(collection(db, "process_matrix"), where("assignees", "array-contains", userId));
    const snapshot = await getDocs(q);
    const hierarchy: UserHierarchy = {};
    snapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        
        // Filter out inactive items for normal users
        if (data.active === false) return;

        const project = data.project || 'Sin Proyecto';
        const macro = data.macro || 'General';
        const process = data.process || 'General';
        const microName = data.name || data.micro || data.microprocess || 'Sin Nombre';
        if (!hierarchy[project]) hierarchy[project] = {};
        if (!hierarchy[project][macro]) hierarchy[project][macro] = {};
        if (!hierarchy[project][macro][process]) hierarchy[project][macro][process] = [];
        hierarchy[project][macro][process].push(String(microName));
    });
    return hierarchy;
  },

  getRequiredTypesMap: async (): Promise<Record<string, DocType[]>> => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const map: Record<string, DocType[]> = {};
      snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          if (data.active === false) return; // Skip requirements for inactive processes
          const microName = data.name || data.micro || data.microprocess || 'Sin Nombre';
          const key = `${data.project}|${microName}`;
          map[key] = data.requiredTypes || [];
      });
      return map;
  },

  seedDefaults: async () => {
      const batch = writeBatch(db);
      for (const row of REQUIRED_DOCS_MATRIX) {
          const [proj, micro, asis, fce, pm, tobe] = row;
          const id = generateMatrixId(proj as string, micro as string);
          const docRef = doc(db, "process_matrix", id);
          const requiredTypes: DocType[] = [];
          if (asis) requiredTypes.push('AS IS');
          if (fce) requiredTypes.push('FCE');
          if (pm) requiredTypes.push('PM');
          if (tobe) requiredTypes.push('TO BE');
          const snap = await getDoc(docRef);
          if (!snap.exists()) {
              batch.set(docRef, {
                  project: proj, macro: 'Macroproceso General', process: 'Proceso General',
                  name: micro, requiredTypes, assignees: [], active: true
              });
          }
      }
      await batch.commit();
  },

  addMicroprocess: async (project: string, macro: string, process: string, name: string, assignees: string[], requiredTypes: DocType[]) => {
      const id = generateMatrixId(project, name);
      const docRef = doc(db, "process_matrix", id);
      await setDoc(docRef, { project, macro, process, name, assignees, requiredTypes, active: true });
  },

  // NEW: Toggle Active Status (Soft Delete)
  toggleProcessStatus: async (id: string, currentActiveStatus: boolean) => {
      if (!id || !id.trim()) throw new Error("ID no válido");
      const docRef = doc(db, "process_matrix", id.trim());
      await updateDoc(docRef, { active: !currentActiveStatus });
  },

  // Deprecated - replaced by soft delete, but kept for legacy cleanup if needed
  deleteMicroprocess: async (id: string) => {
      if (!id || !id.trim()) throw new Error("ID no válido");
      await deleteDoc(doc(db, "process_matrix", id.trim()));
  },

  updateMatrixAssignment: async (id: string, assignees: string[], updatedBy: string) => {
      const docRef = doc(db, "process_matrix", id);
      await updateDoc(docRef, { assignees });
  },

  toggleRequiredType: async (id: string, type: DocType) => {
      const docRef = doc(db, "process_matrix", id);
      const snap = await getDoc(docRef);
      if (snap.exists()) {
          const current = snap.data().requiredTypes || [];
          let updated = [];
          if (current.includes(type)) updated = current.filter((t: string) => t !== type);
          else updated = [...current, type];
          await updateDoc(docRef, { requiredTypes: updated });
      }
  },

  updateHierarchyNode: async (
      level: 'PROJECT' | 'MACRO' | 'PROCESS', 
      oldValue: string, 
      newValue: string, 
      parentContext?: { project?: string, macro?: string }
  ) => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      let count = 0;

      snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          let shouldUpdate = false;
          const updates: any = {};

          if (level === 'PROJECT') {
              if (data.project === oldValue) {
                  updates.project = newValue;
                  shouldUpdate = true;
              }
          } else if (level === 'MACRO') {
              if (data.project === parentContext?.project && data.macro === oldValue) {
                  updates.macro = newValue;
                  shouldUpdate = true;
              }
          } else if (level === 'PROCESS') {
              if (data.project === parentContext?.project && data.macro === parentContext?.macro && data.process === oldValue) {
                  updates.process = newValue;
                  shouldUpdate = true;
              }
          }

          if (shouldUpdate) {
              batch.update(docSnap.ref, updates);
              count++;
          }
      });

      if (count > 0) await batch.commit();
      console.log(`Updated ${count} records for rename operation.`);
  },

  // NEW: Cascading Delete for Hierarchy Management (Still performs hard delete for structure changes, but could be soft in future)
  deleteHierarchyNode: async (
      level: 'PROJECT' | 'MACRO' | 'PROCESS',
      value: string,
      parentContext?: { project?: string, macro?: string }
  ) => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      let count = 0;

      snapshot.docs.forEach(docSnap => {
          const data = docSnap.data();
          let shouldDelete = false;

          if (level === 'PROJECT') {
              if (data.project === value) shouldDelete = true;
          } else if (level === 'MACRO') {
              if (data.project === parentContext?.project && data.macro === value) shouldDelete = true;
          } else if (level === 'PROCESS') {
              if (data.project === parentContext?.project && data.macro === parentContext?.macro && data.process === value) shouldDelete = true;
          }

          if (shouldDelete) {
              batch.delete(docSnap.ref);
              count++;
          }
      });

      if (count > 0) await batch.commit();
      console.log(`Deleted ${count} records for cascade delete operation.`);
  }
};

export const DatabaseService = {
  exportData: async (): Promise<string> => {
      const data: any = { users: [], documents: [], history: [], notifications: [], process_matrix: [] };
      const collections = ['users', 'documents', 'history', 'notifications', 'process_matrix'];
      for (const colName of collections) {
          const q = query(collection(db, colName));
          const snapshot = await getDocs(q);
          data[colName] = snapshot.docs.map(d => ({ _id: d.id, ...d.data() }));
      }
      return JSON.stringify(data, null, 2);
  },
  importData: async (jsonContent: string) => {
      const data = JSON.parse(jsonContent);
      const collections = ['users', 'documents', 'history', 'notifications', 'process_matrix'];
      for (const colName of collections) await deleteCollectionInBatches(colName);
      for (const colName of collections) {
          if (data[colName]) {
              const batchSize = 400;
              let batch = writeBatch(db);
              let count = 0;
              for (const item of data[colName]) {
                  const { _id, ...rest } = item;
                  const docRef = doc(db, colName, _id);
                  batch.set(docRef, rest);
                  count++;
                  if (count >= batchSize) { await batch.commit(); batch = writeBatch(db); count = 0; }
              }
              if (count > 0) await batch.commit();
          }
      }
  },
  fullSystemResetAndImport: async (rulesCsv: string, historyCsv: string | null, onProgress: (percent: number, status: string) => void) => {
      onProgress(5, "Limpiando base de datos...");
      await deleteCollectionInBatches('documents');
      await deleteCollectionInBatches('history');
      await deleteCollectionInBatches('process_matrix');
      await deleteCollectionInBatches('notifications');
      
      const users = await UserService.getAll();
      
      // PHASE 1: Parse History to Memory Map (12 Columns Strict Format)
      // Structure: Key (Proj|Micro) -> { 'AS IS': {ver, date}, 'FCE': ... }
      type HistoryInfo = { version: string, date: string, state: DocState, progress: number };
      const historyMap = new Map<string, Record<string, HistoryInfo>>();
      
      if (historyCsv) {
          onProgress(15, "Analizando Histórico de Documentos...");
          const hLines = historyCsv.split('\n');
          for (let i = 1; i < hLines.length; i++) {
              const line = hLines[i].trim();
              if (!line) continue;
              const separator = line.includes(';') ? ';' : ',';
              const cols = line.split(separator);
              
              // NEW FORMAT (12 Cols):
              // 0: PROYECTO
              // 1: MACROPROCESO
              // 2: PROCESO
              // 3: MICROPROCESO
              // 4: Ver AS IS | 5: Fecha AS IS
              // 6: Ver FCE   | 7: Fecha FCE
              // 8: Ver PM    | 9: Fecha PM
              // 10: Ver TO BE| 11: Fecha TO BE

              if (cols.length < 12) continue; 
              
              const project = normalizeHeader(cols[0]);
              const micro = normalizeHeader(cols[3]);
              const key = `${project}|${micro}`;
              
              const docTypesMap: { type: DocType, vIdx: number, dIdx: number }[] = [
                  { type: 'AS IS', vIdx: 4, dIdx: 5 },
                  { type: 'FCE', vIdx: 6, dIdx: 7 },
                  { type: 'PM', vIdx: 8, dIdx: 9 },
                  { type: 'TO BE', vIdx: 10, dIdx: 11 },
              ];

              const entry: Record<string, HistoryInfo> = {};
              let hasData = false;

              docTypesMap.forEach(dt => {
                   const ver = cols[dt.vIdx]?.trim();
                   const dateStr = cols[dt.dIdx]?.trim();
                   // STRICT: v must exist and not be empty, '-' or '0.0' unless it matches specific states
                   // We defer to determineStateFromVersion for strictness
                   if (ver && ver !== '-' && ver !== '') {
                       const { state, progress } = determineStateFromVersion(ver);
                       entry[dt.type] = {
                           version: ver,
                           date: parseDateString(dateStr),
                           state, 
                           progress
                       };
                       hasData = true;
                   }
              });

              if (hasData) {
                  historyMap.set(key, entry);
              }
          }
      }

      onProgress(30, "Construyendo Matriz y Generando Documentos Específicos...");
      
      const lines = rulesCsv.split('\n');
      let batch = writeBatch(db); 
      let ops = 0;
      let createdCount = 0;
      let historyMatchedCount = 0;
      const BATCH_LIMIT = 400; 
      
      for (let i = 1; i < lines.length; i++) {
           const line = lines[i].trim();
           if (!line) continue;
           const separator = line.includes(';') ? ';' : ',';
           const cols = line.split(separator);
           
           if (cols.length < 9) continue;
           
           // NEW RULES STRUCTURE (9 Cols):
           // 0: MacroProceso
           // 1: Proceso
           // 2: MicroProceso
           // 3: Analista
           // 4: PROYECTO
           // 5: AS IS (Flag 0/1)
           // 6: FCE (Flag 0/1)
           // 7: PM (Flag 0/1)
           // 8: TO BE (Flag 0/1)

           const macro = cols[0]?.trim() || 'Macroproceso General';
           const process = cols[1]?.trim() || 'Proceso General';
           const micro = cols[2]?.trim();
           const responsableRaw = cols[3]?.trim();
           const project = cols[4]?.trim();

           if (!project || !micro) continue;
           
           let assignees = findUserIdsFromCSV(users, responsableRaw);
           
           let requiredTypes: DocType[] = [];
           const asis = cols[5]?.trim() === '1';
           const fce = cols[6]?.trim() === '1';
           const pm = cols[7]?.trim() === '1';
           const tobe = cols[8]?.trim() === '1';
           
           if (asis) requiredTypes.push('AS IS');
           if (fce) requiredTypes.push('FCE');
           if (pm) requiredTypes.push('PM');
           if (tobe) requiredTypes.push('TO BE');

           // 1. Create Matrix Entry (Deterministic ID)
           const matrixId = generateMatrixId(project, micro);
           const matrixRef = doc(db, "process_matrix", matrixId);
           
           batch.set(matrixRef, { 
               project, macro, process, name: micro, 
               assignees, requiredTypes, active: true 
           });
           ops++;

           // 2. Create Specific Documents based on History OR Requirement
           const lookupKey = `${normalizeHeader(project)}|${normalizeHeader(micro)}`;
           const historyRecord = historyMap.get(lookupKey);
           
           // Determine which types to create:
           // Union of Required Types AND Types present in history
           const typesToCreate = new Set<DocType>(requiredTypes);
           if (historyRecord) {
               Object.keys(historyRecord).forEach(k => typesToCreate.add(k as DocType));
               historyMatchedCount++; // Just counting hit on the row
           }

           for (const type of typesToCreate) {
                const histData = historyRecord ? historyRecord[type] : null;
                
                let state, version, progress, date;

                if (histData) {
                    // CASE A: History exists
                    state = histData.state;
                    version = histData.version;
                    progress = histData.progress;
                    date = histData.date;
                } else {
                    // CASE B: Required but NO History found -> NOT STARTED
                    state = DocState.NOT_STARTED;
                    version = '-';
                    progress = 0;
                    date = ''; // Empty string indicates no activity
                }
                
                // Use DETERMINISTIC ID to prevent duplicates if rules are re-run or duplicated in CSV
                const docId = generateDocumentId(project, micro, type);
                const newDocRef = doc(db, "documents", docId);
                
                const docData: Omit<Document, 'id'> = {
                    title: `${micro} - ${type}`, // Specific Name
                    description: histData ? `Migrado desde Histórico (${version})` : 'Documento Requerido (Pendiente)',
                    authorId: assignees[0] || 'admin',
                    authorName: 'Sistema',
                    assignedTo: assignees[0] || 'admin',
                    assignees: assignees.length > 0 ? assignees : ['admin'],
                    state: state,
                    version: version,
                    progress: progress,
                    hasPendingRequest: false,
                    files: [], 
                    createdAt: date || new Date().toISOString(), 
                    updatedAt: date || '', // Empty if not started
                    project, macroprocess: macro, process, microprocess: micro, 
                    docType: type // EXPLICIT TYPE
                };
                
                batch.set(newDocRef, JSON.parse(JSON.stringify(docData)));
                ops++;
                createdCount++;
           }

           if (ops >= BATCH_LIMIT) {
               await batch.commit();
               batch = writeBatch(db);
               ops = 0;
           }
      }
      if (ops > 0) await batch.commit();
      
      onProgress(100, "Carga Completa.");
      return { created: createdCount, historyMatched: historyMatchedCount, errors: [] };
  }
};
