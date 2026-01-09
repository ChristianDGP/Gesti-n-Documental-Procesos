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
  DocType, FullHierarchy, Notification, UserHierarchy, ProcessNode, Referent 
} from "../types";
import { 
  STATE_CONFIG, INITIAL_DATA_LOAD, NAME_TO_ID_MAP, REQUIRED_DOCS_MATRIX 
} from "../constants";

// Helper to infer state and progress from version string (The Source of Truth)
export const determineStateFromVersion = (version: string): { state: DocState, progress: number } => {
    // Robust normalization: handle both v/V but internal logic works with uppercase for regex
    const v = (version || '').trim().toUpperCase();
    if (!v || v === '-' || v === '0') return { state: DocState.NOT_STARTED, progress: 0 };
    
    if (v.endsWith('ACG')) return { state: DocState.APPROVED, progress: 100 };
    
    if (v.endsWith('AR')) {
        if (/^V1\.\d+\.\d+AR$/.test(v)) return { state: DocState.CONTROL_REVIEW, progress: 90 };
        return { state: DocState.SENT_TO_CONTROL, progress: 90 };
    }
    
    if (v.startsWith('V1.')) {
        if (v.split('.').length > 2) return { state: DocState.REFERENT_REVIEW, progress: 80 };
        return { state: DocState.SENT_TO_REFERENT, progress: 80 };
    }
    
    if (v.startsWith('V0.')) return { state: DocState.INTERNAL_REVIEW, progress: 60 };
    
    if (v === '0.0') return { state: DocState.INITIATED, progress: 10 };
    
    // Fallback for development versions (0.x)
    if (/^0\.\d+$/.test(v)) return { state: DocState.IN_PROCESS, progress: 30 };
    
    return { state: DocState.IN_PROCESS, progress: 30 };
};

// UI helper to ensure version always looks like "v0.1" instead of "V0.1"
export const formatVersionForDisplay = (v: string): string => {
    if (!v) return '-';
    if (v.startsWith('V') || v.startsWith('v')) {
        return 'v' + v.substring(1);
    }
    return v;
};

export const normalizeHeader = (header: string): string => {
    if (!header) return '';
    return header.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/^"|"$/g, ''); 
};

export const generateMatrixId = (project: string, micro: string): string => {
    const p = normalizeHeader(project).replace(/[^A-Z0-9]/g, '').substring(0, 10);
    const m = normalizeHeader(micro).replace(/[^A-Z0-9]+/g, '_').substring(0, 60); 
    return `MTX_${p}_${m}`;
};

const deleteCollectionInBatches = async (collectionName: string) => {
    const q = query(collection(db, collectionName));
    const snapshot = await getDocs(q);
    let batch = writeBatch(db);
    let count = 0;
    for (const docSnap of snapshot.docs) {
        batch.delete(docSnap.ref);
        count++;
        if (count >= 400) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
        }
    }
    if (count > 0) await batch.commit();
};

export const ReferentService = {
  getAll: async (): Promise<Referent[]> => {
    const q = query(collection(db, "referents"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Referent));
  },
  create: async (data: Omit<Referent, 'id'>): Promise<Referent> => {
    const docRef = await addDoc(collection(db, "referents"), data);
    return { ...data, id: docRef.id } as Referent;
  },
  update: async (id: string, data: Partial<Referent>): Promise<void> => {
    const ref = doc(db, "referents", id);
    await updateDoc(ref, data);
  },
  delete: async (id: string): Promise<void> => {
    await deleteDoc(doc(db, "referents", id));
  }
};

export const NotificationService = {
    create: async (userId: string, docId: string, type: Notification['type'], title: string, message: string, actorName: string) => {
        if (!userId) return;
        try {
            const notif: Omit<Notification, 'id'> = {
                userId, 
                documentId: docId, 
                type, 
                title, 
                message, 
                isRead: false,
                timestamp: new Date().toISOString(), 
                actorName
            };
            await addDoc(collection(db, "notifications"), notif);
        } catch (e) { 
            console.error("Error creating notification record", e); 
        }
    },
    subscribeToNotifications: (userId: string, callback: (notifications: Notification[]) => void) => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId));
        return onSnapshot(q, (snapshot) => {
            const data = snapshot.docs.map(d => ({ ...d.data(), id: d.id } as Notification));
            callback(data.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
        });
    },
    subscribeToUnreadCount: (userId: string, callback: (count: number) => void) => {
        const q = query(collection(db, "notifications"), 
            where("userId", "==", userId), 
            where("isRead", "==", false)
        );
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.size);
        });
    },
    markAsRead: async (notifId: string) => {
        await updateDoc(doc(db, "notifications", notifId), { isRead: true });
    },
    markAllAsRead: async (userId: string) => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId), where("isRead", "==", false));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => batch.update(d.ref, { isRead: true }));
        await batch.commit();
    },
    // NEW: Efficiently notify all managers without reading all users
    notifyManagers: async (docId: string, type: Notification['type'], title: string, message: string, actorName: string, actorId: string) => {
        try {
            // Find admins and coordinators directly via queries
            const roles = [UserRole.ADMIN, UserRole.COORDINATOR];
            const recipientIds = new Set<string>();
            
            for (const role of roles) {
                const q = query(collection(db, "users"), where("role", "==", role));
                const snap = await getDocs(q);
                snap.docs.forEach(d => {
                    if (d.id !== actorId) recipientIds.add(d.id);
                });
            }

            const promises = Array.from(recipientIds).map(uid => 
                NotificationService.create(uid, docId, type, title, message, actorName)
            );
            await Promise.all(promises);
        } catch (e) {
            console.error("Manager notification flow failed", e);
        }
    }
};

export const UserService = {
  getAll: async (): Promise<User[]> => {
    try {
        const q = query(collection(db, "users"));
        const querySnapshot = await getDocs(q);
        return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id, active: (doc.data() as any).active ?? true } as User));
    } catch (e) {
        return [];
    }
  },
  update: async (id: string, userData: Partial<User>): Promise<User> => {
    const userRef = doc(db, "users", id);
    await updateDoc(userRef, userData);
    const updatedSnap = await getDoc(userRef);
    return { ...updatedSnap.data(), id: updatedSnap.id } as User;
  },
  toggleActiveStatus: async (id: string, currentStatus: boolean): Promise<void> => {
    await updateDoc(doc(db, "users", id), { active: !currentStatus });
  },
  create: async (userData: User): Promise<User> => {
      await setDoc(doc(db, "users", userData.id), { ...userData, active: userData.active ?? true });
      return userData;
  },
  delete: async (id: string) => { await deleteDoc(doc(db, "users", id)); },
  migrateLegacyReferences: async (oldId: string, newId: string) => {
      const qMatrix = query(collection(db, "process_matrix"), where("assignees", "array-contains", oldId));
      const snapMatrixDocs = await getDocs(qMatrix);
      const batch = writeBatch(db);
      snapMatrixDocs.docs.forEach(d => {
          const newAssignees = (d.data().assignees || []).map((id: string) => id === oldId ? newId : id);
          batch.update(d.ref, { assignees: newAssignees });
      });
      await batch.commit();
  }
};

export const HistoryService = {
  getHistory: async (docIds: string | string[]): Promise<DocHistory[]> => {
    const ids = Array.isArray(docIds) ? docIds : [docIds];
    if (ids.length === 0) return [];
    const q = query(collection(db, "history"), where("documentId", "in", ids.slice(0, 10)));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DocHistory)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
  getAll: async (): Promise<DocHistory[]> => {
    const q = query(collection(db, "history"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as DocHistory));
  },
  log: async (docId: string, user: User, action: string, prev: DocState, next: DocState, comment: string, version?: string) => {
    const entryId = `hist-${docId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newEntry: DocHistory = { 
        id: entryId, documentId: docId, userId: user.id, userName: user.name, 
        action, previousState: prev, newState: next, version: version || '-',
        comment, timestamp: new Date().toISOString() 
    };
    await addDoc(collection(db, "history"), newEntry);
  }
};

export const DocumentService = {
  getAll: async (): Promise<Document[]> => {
    const q = query(collection(db, "documents"), orderBy("updatedAt", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as Document));
  },
  getById: async (id: string): Promise<Document | null> => {
    const docRef = doc(db, "documents", id);
    const docSnap = await getDoc(docRef);
    return docSnap.exists() ? ({ ...docSnap.data(), id: docSnap.id } as Document) : null;
  },
  getRelatedDocIds: async (project: string, micro: string, type: string): Promise<string[]> => {
      const q = query(
          collection(db, "documents"), 
          where("project", "==", project),
          where("docType", "==", type)
      );
      const snap = await getDocs(q);
      const normalizedMicro = normalizeHeader(micro);
      return snap.docs
          .filter(d => normalizeHeader(d.data().microprocess || d.data().title.split(' - ')[0]) === normalizedMicro)
          .map(d => d.id);
  },
  create: async (title: string, description: string, author: User, initialState?: DocState, initialVersion?: string, initialProgress?: number, file?: File, hierarchy?: any, existingId?: string): Promise<Document> => {
    const state = initialState || DocState.INITIATED;
    const isSubmission = [DocState.INTERNAL_REVIEW, DocState.SENT_TO_REFERENT, DocState.SENT_TO_CONTROL].includes(state);
    const version = initialVersion || '0.0';
    const info = determineStateFromVersion(version);
    const progress = initialProgress !== undefined ? initialProgress : info.progress;

    let finalDocId: string;
    let finalDocData: Document;

    if (existingId) {
        finalDocId = existingId;
        const docRef = doc(db, "documents", existingId);
        const oldSnap = await getDoc(docRef);
        const oldData = oldSnap.data() as Document;
        const updateData: Partial<Document> = { state, version, progress, description, hasPendingRequest: isSubmission, updatedAt: new Date().toISOString() };
        await updateDoc(docRef, updateData);
        await HistoryService.log(existingId, author, 'Nueva Versión (Carga)', oldData.state, state, `Carga de archivo versión ${version}`, version);
        finalDocData = { ...oldData, ...updateData, id: existingId } as Document;
    } else {
        const mergedAssignees = Array.from(new Set([...(hierarchy?.assignees || []), author.id]));
        const newDocData: Omit<Document, 'id'> = {
          title, description, authorId: author.id, authorName: author.name, assignedTo: author.id, assignees: mergedAssignees, state, version, progress, hasPendingRequest: isSubmission, files: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), project: hierarchy?.project, macroprocess: hierarchy?.macro, process: hierarchy?.process, microprocess: hierarchy?.micro, docType: hierarchy?.docType
        };
        const docRef = await addDoc(collection(db, "documents"), newDocData);
        finalDocId = docRef.id;
        await HistoryService.log(docRef.id, author, 'Creación', DocState.NOT_STARTED, state, `Iniciado Versión ${version}`, version);
        finalDocData = { ...newDocData, id: docRef.id } as Document;
    }

    // AUTOMATIC NOTIFICATION: Notify all managers
    const displayVersion = formatVersionForDisplay(version);
    await NotificationService.notifyManagers(
        finalDocId, 
        'UPLOAD', 
        `Nuevo Documento: ${finalDocData.microprocess}`, 
        `${author.name} ha cargado la versión ${displayVersion} para revisión.`, 
        author.name,
        author.id
    );

    return finalDocData;
  },
  delete: async (id: string) => { await deleteDoc(doc(db, "documents", id)); },
  
  revertLastTransition: async (docId: string): Promise<boolean> => {
      const histQ = query(collection(db, "history"), where("documentId", "==", docId));
      const histSnap = await getDocs(histQ);
      if (histSnap.empty) return true;
      const sortedHistory = histSnap.docs.map(d => ({ ...d.data(), _id: d.id, _ref: d.ref } as any)).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      if (sortedHistory.length <= 1) {
          await deleteDoc(doc(db, "documents", docId));
          const batch = writeBatch(db);
          histSnap.docs.forEach(d => batch.delete(d.ref));
          await batch.commit();
          return true;
      }
      const lastAction = sortedHistory[0]; 
      const previousAction = sortedHistory[1]; 
      const docRef = doc(db, "documents", docId);
      const restoredVersion = previousAction.version || '0.0';
      const info = determineStateFromVersion(restoredVersion);
      await updateDoc(docRef, { state: previousAction.newState, version: restoredVersion, progress: info.progress, updatedAt: previousAction.timestamp, hasPendingRequest: [DocState.INTERNAL_REVIEW, DocState.SENT_TO_REFERENT, DocState.SENT_TO_CONTROL].includes(previousAction.newState) });
      await deleteDoc(lastAction._ref);
      return false;
  },

  syncMetadata: async (docId: string, user: User): Promise<void> => {
      const docRef = doc(db, "documents", docId);
      const docSnap = await getDoc(docRef);
      if(!docSnap.exists()) return;
      const data = docSnap.data() as Document;
      const { state, progress } = determineStateFromVersion(data.version);
      if (data.state !== state || data.progress !== progress) {
          await updateDoc(docRef, { state, progress, updatedAt: new Date().toISOString() });
          await HistoryService.log(docId, user, 'Sincronización Sistema', data.state, state, `Corrección automática: ${state} / ${progress}%`, data.version);
      }
  },

  transitionState: async (docId: string, user: User, action: any, comment: string, file?: File, customVersion?: string): Promise<void> => {
      const docRef = doc(db, "documents", docId);
      const docSnap = await getDoc(docRef);
      if(!docSnap.exists()) throw new Error("Documento no encontrado");
      const currentDoc = docSnap.data() as Document;
      let newState = currentDoc.state;
      let newVersion = currentDoc.version;
      let hasPending = currentDoc.hasPendingRequest;
      const actionLabels: Record<string, string> = { 
          'APPROVE': 'Aprobación', 'REJECT': 'Rechazo', 'COMMENT': 'Observación', 
          'REQUEST_APPROVAL': 'Solicitud de Revisión', 'ADVANCE': 'Avance de Flujo' 
      };
      const displayAction = actionLabels[action] || action;
      
      if (customVersion) {
        newVersion = customVersion;
        const info = determineStateFromVersion(customVersion);
        newState = info.state;
      }
      
      if (action === 'APPROVE') hasPending = false;
      else if (action === 'REJECT') { hasPending = false; newState = determineStateFromVersion(newVersion).state; }
      else if (action === 'REQUEST_APPROVAL') {
          hasPending = true;
          if (newState === DocState.INITIATED || newState === DocState.IN_PROCESS || newState === DocState.REJECTED) {
              newState = DocState.INTERNAL_REVIEW;
          }
      }
      
      const { progress: newProgress } = determineStateFromVersion(newVersion);
      await updateDoc(docRef, { 
          state: newState, 
          version: newVersion, 
          progress: newProgress, 
          hasPendingRequest: hasPending, 
          updatedAt: new Date().toISOString() 
      });
      await HistoryService.log(docId, user, displayAction, currentDoc.state, newState, comment, newVersion);

      // NOTIFICATION LOGIC
      const typeMapping: Record<string, Notification['type']> = {
          'APPROVE': 'APPROVAL', 'REJECT': 'REJECTION', 
          'COMMENT': 'COMMENT', 'REQUEST_APPROVAL': 'COMMENT'
      };
      const type = typeMapping[action] || 'COMMENT';
      const displayVersion = formatVersionForDisplay(newVersion);
      const title = `${displayAction}: ${currentDoc.microprocess}`;
      const msg = `${user.name} ha realizado una ${displayAction.toLowerCase()} en "${currentDoc.title}" (${displayVersion}).`;
      
      // Always notify managers
      await NotificationService.notifyManagers(docId, type, title, msg, user.name, user.id);
      
      // Also notify author if they are not the one performing the action and not a manager
      if (currentDoc.authorId && currentDoc.authorId !== user.id) {
          await NotificationService.create(currentDoc.authorId, docId, type, title, msg, user.name);
      }
  }
};

export const HierarchyService = {
  getFullHierarchy: async (): Promise<FullHierarchy> => {
    const q = query(collection(db, "process_matrix"));
    const snapshot = await getDocs(q);
    const hierarchy: FullHierarchy = {};
    snapshot.docs.forEach(doc => {
      const data = doc.data();
      const node: ProcessNode = { name: data.name, docId: doc.id, assignees: data.assignees || [], referentIds: data.referentIds || [], requiredTypes: data.requiredTypes || [], active: data.active !== false };
      if (!hierarchy[data.project]) hierarchy[data.project] = {};
      if (!hierarchy[data.project][data.macroprocess || 'Sin Macro']) hierarchy[data.project][data.macroprocess || 'Sin Macro'] = {};
      if (!hierarchy[data.project][data.macroprocess || 'Sin Macro'][data.process]) hierarchy[data.project][data.macroprocess || 'Sin Macro'][data.process] = [];
      hierarchy[data.project][data.macroprocess || 'Sin Macro'][data.process].push(node);
    });
    return hierarchy;
  },
  getUserHierarchy: async (userId: string): Promise<UserHierarchy> => {
      const q = query(collection(db, "process_matrix"), where("assignees", "array-contains", userId));
      const snapshot = await getDocs(q);
      const hierarchy: UserHierarchy = {};
      snapshot.docs.forEach(doc => {
          const data = doc.data();
          if (!hierarchy[data.project]) hierarchy[data.project] = {};
          if (!hierarchy[data.project][data.macroprocess || 'Sin Macro']) hierarchy[data.project][data.macroprocess || 'Sin Macro'] = {};
          if (!hierarchy[data.project][data.macroprocess || 'Sin Macro'][data.process]) hierarchy[data.project][data.macroprocess || 'Sin Macro'][data.process] = [];
          hierarchy[data.project][data.macroprocess || 'Sin Macro'][data.process].push(data.name);
      });
      return hierarchy;
  },
  updateMatrixAssignment: async (docId: string, assignees: string[]) => { await updateDoc(doc(db, "process_matrix", docId), { assignees }); },
  updateReferentLinks: async (referentId: string, selectedDocIds: string[]) => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => {
          let referents = d.data().referentIds || [];
          const isSelected = selectedDocIds.includes(d.id);
          if (isSelected && !referents.includes(referentId)) batch.update(d.ref, { referentIds: [...referents, referentId] });
          else if (!isSelected && referents.includes(referentId)) batch.update(d.ref, { referentIds: referents.filter((id:string) => id !== referentId) });
      });
      await batch.commit();
  },
  toggleRequiredType: async (docId: string, type: DocType) => {
      const ref = doc(db, "process_matrix", docId);
      const snap = await getDoc(ref);
      if (snap.exists()) {
          const current = new Set(snap.data().requiredTypes || []);
          if (current.has(type)) current.delete(type); else current.add(type);
          await updateDoc(ref, { requiredTypes: Array.from(current) });
      }
  },
  addMicroprocess: async (project: string, macro: string, process: string, name: string, assignees: string[], requiredTypes: string[]) => {
      const id = generateMatrixId(project, name);
      await setDoc(doc(db, "process_matrix", id), { project, macroprocess: macro, process, name, assignees, referentIds: [], requiredTypes, active: true });
  },
  deleteMicroprocess: async (docId: string) => { await deleteDoc(doc(db, "process_matrix", docId)); },
  getRequiredTypesMap: async (): Promise<Record<string, DocType[]>> => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const map: Record<string, DocType[]> = {};
      snapshot.docs.forEach(d => {
          const key = `${normalizeHeader(d.data().project)}|${normalizeHeader(d.data().name)}`;
          map[key] = d.data().requiredTypes || [];
      });
      return map;
  },
  toggleProcessStatus: async (docId: string, currentStatus: boolean) => { await updateDoc(doc(db, "process_matrix", docId), { active: !currentStatus }); },
  deleteHierarchyNode: async (level: 'PROJECT' | 'MACRO' | 'PROCESS', name: string, context: { project?: string, macro?: string }) => {
      let q;
      if (level === 'PROJECT') q = query(collection(db, "process_matrix"), where("project", "==", name));
      else if (level === 'MACRO') q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", name));
      else q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", context.macro), where("process", "==", name));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
  },
  updateHierarchyNode: async (level: 'PROJECT' | 'MACRO' | 'PROCESS', oldName: string, newName: string, context: { project?: string, macro?: string }) => {
      let q;
      if (level === 'PROJECT') q = query(collection(db, "process_matrix"), where("project", "==", oldName));
      else if (level === 'MACRO') q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", oldName));
      else q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", context.macro), where("process", "==", oldName));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => {
          const update: any = {};
          if (level === 'PROJECT') update.project = newName;
          else if (level === 'MACRO') update.macroprocess = newName;
          else update.process = newName;
          batch.update(d.ref, update);
      });
      await batch.commit();
  },
  moveMicroprocess: async (docId: string, targetProject: string, targetMacro: string, targetProcess: string) => {
      await updateDoc(doc(db, "process_matrix", docId), { project: targetProject, macroprocess: targetMacro, process: targetProcess });
  },
  seedDefaults: async () => {
      const batch = writeBatch(db);
      for (const row of REQUIRED_DOCS_MATRIX) {
           const [project, micro, asis, fce, pm, tobe] = row;
           const requiredTypes: string[] = [];
           if (asis) requiredTypes.push('AS IS'); if (fce) requiredTypes.push('FCE'); if (pm) requiredTypes.push('PM'); if (tobe) requiredTypes.push('TO BE');
           batch.set(doc(db, "process_matrix", generateMatrixId(project, micro)), { project, macroprocess: 'Macroproceso General', process: 'Proceso General', name: micro, assignees: [], referentIds: [], requiredTypes, active: true });
      }
      await batch.commit();
  }
};

/**
 * Helper to find user IDs from a string of names or emails in CSV
 */
const findUserIdsFromCSV = (allUsers: User[], input: string): string[] => {
    if (!input) return [];
    const terms = input.split(/[;|,]/).map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
    const ids: string[] = [];
    
    terms.forEach(term => {
        const found = allUsers.find(u => 
            u.name.toLowerCase().includes(term) || 
            (u.nickname && u.nickname.toLowerCase().includes(term)) ||
            u.email.toLowerCase().includes(term)
        );
        if (found) ids.push(found.id);
    });
    
    return Array.from(new Set(ids));
};

export const DatabaseService = {
    exportData: async (): Promise<string> => {
        const collections = ['users', 'documents', 'history', 'process_matrix', 'notifications', 'referents'];
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
                batch.set(doc(db, colName, _id), docData);
                count++;
                if (count >= 400) { await batch.commit(); batch = writeBatch(db); count = 0; }
            }
            if (count > 0) await batch.commit();
        }
    },
    fullSystemResetAndImport: async (rulesCSV: string, historyCSV: string, onProgress: (percent: number, status: string) => void): Promise<{ created: number, historyMatched: number }> => {
        onProgress(5, "Limpiando...");
        await deleteCollectionInBatches("documents"); await deleteCollectionInBatches("history"); await deleteCollectionInBatches("process_matrix"); await deleteCollectionInBatches("notifications");
        onProgress(10, "Reglas...");
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
        for (let i = 1; i < rows.length; i++) {
            const cols = rows[i].split(/[;,]/).map(c => c.trim());
            if (cols.length < 3) continue;
            const project = cols[idxProject] || 'GENERAL';
            const assignees = findUserIdsFromCSV(allUsers, cols[idxAnalyst]);
            const requiredTypes: string[] = [];
            if (cols[idxAsis] === '1') requiredTypes.push('AS IS');
            if (cols[idxFce] === '1') requiredTypes.push('FCE');
            if (cols[idxPm] === '1') requiredTypes.push('PM');
            if (cols[idxTobe] === '1') requiredTypes.push('TO BE');
            batch.set(doc(db, "process_matrix", generateMatrixId(project, cols[idxMicro])), { project, macroprocess: cols[idxMacro] || 'General', process: cols[idxProcess] || 'General', name: cols[idxMicro], assignees, referentIds: [], requiredTypes, active: true });
            opCount++; createdCount++;
            if (opCount >= 400) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
        }
        if (opCount > 0) await batch.commit();
        onProgress(100, "Finalizando...");
        return { created: createdCount, historyMatched: 0 };
    }
};