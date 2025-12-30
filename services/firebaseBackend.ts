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

// --- Helpers ---
const determineStateFromVersion = (version: string): { state: DocState, progress: number } => {
    const v = (version || '').trim();
    if (!v || v === '-' || v === '0') return { state: DocState.NOT_STARTED, progress: 0 };
    if (v === '0.0') return { state: DocState.INITIATED, progress: 10 };
    if (v.endsWith('ACG')) return { state: DocState.APPROVED, progress: 100 };
    if (/^v1\.\d+\.\d+AR$/.test(v)) return { state: DocState.CONTROL_REVIEW, progress: 90 };
    if (/^v1\.\d+AR$/.test(v)) return { state: DocState.SENT_TO_CONTROL, progress: 90 };
    if (/^v1\.\d+\.\d+$/.test(v)) return { state: DocState.REFERENT_REVIEW, progress: 80 };
    if (/^v1\.\d+$/.test(v)) return { state: DocState.SENT_TO_REFERENT, progress: 80 };
    if (v.startsWith('v0.')) return { state: DocState.INTERNAL_REVIEW, progress: 60 };
    if (/^\d+\./.test(v)) return { state: DocState.IN_PROCESS, progress: 30 };
    return { state: DocState.IN_PROCESS, progress: 30 };
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

const findUserIdsFromCSV = (allUsers: User[], rawString: string): string[] => {
    if (!rawString) return [];
    const searchTerms = rawString.split(/[;,]/).map(s => s.trim().toLowerCase());
    const foundIds: string[] = [];
    searchTerms.forEach(term => {
        if (!term) return;
        const match = allUsers.find(u => 
            u.name.toLowerCase().includes(term) || 
            u.email.toLowerCase().includes(term) ||
            (u.nickname && u.nickname.toLowerCase().includes(term))
        );
        if (match) foundIds.push(match.id);
    });
    return Array.from(new Set(foundIds));
};

export const ReferentService = {
  getAll: async (): Promise<Referent[]> => {
    const q = query(collection(db, "referents"), orderBy("name"));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Referent));
  },
  create: async (data: Omit<Referent, 'id'>): Promise<Referent> => {
    const docRef = await addDoc(collection(db, "referents"), data);
    return { id: docRef.id, ...data };
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
                userId, documentId: docId, type, title, message, isRead: false,
                timestamp: new Date().toISOString(), actorName
            };
            await addDoc(collection(db, "notifications"), notif);
        } catch (e) { console.error(e); }
    },
    getByUser: async (userId: string): Promise<Notification[]> => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId));
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
        return data.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    },
    subscribeToUnreadCount: (userId: string, callback: (count: number) => void) => {
        const q = query(collection(db, "notifications"), where("userId", "==", userId), where("isRead", "==", false));
        return onSnapshot(q, (snapshot) => callback(snapshot.size));
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
    }
};

export const UserService = {
  getAll: async (): Promise<User[]> => {
    const q = query(collection(db, "users"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({ id: doc.id, active: true, ...doc.data() } as User));
  },
  update: async (id: string, userData: Partial<User>): Promise<User> => {
    const userRef = doc(db, "users", id);
    await updateDoc(userRef, userData);
    const updatedSnap = await getDoc(userRef);
    return updatedSnap.data() as User;
  },
  toggleActiveStatus: async (id: string, currentStatus: boolean): Promise<void> => {
    await updateDoc(doc(db, "users", id), { active: !currentStatus });
  },
  create: async (userData: User): Promise<User> => {
      await setDoc(doc(db, "users", userData.id), { ...userData, active: userData.active ?? true });
      return userData;
  },
  delete: async (id: string) => { await deleteDoc(doc(db, "users", id)); },
  // Fixed migrateLegacyReferences: removed redundant line that caused 'qSnapshot' not found error.
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
  getHistory: async (docId: string): Promise<DocHistory[]> => {
    const q = query(collection(db, "history"), where("documentId", "==", docId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as DocHistory).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
  getAll: async (): Promise<DocHistory[]> => {
    const q = query(collection(db, "history"), orderBy("timestamp", "desc"));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data() as DocHistory);
  },
  log: async (docId: string, user: User, action: string, prev: DocState, next: DocState, comment: string, version?: string) => {
    // CORRECCIÓN ID ÚNICO: Se usa una combinación de timestamp y un prefijo para evitar sustitución visual en React
    const entryId = `hist-${docId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    const newEntry: DocHistory = { 
        id: entryId, 
        documentId: docId, 
        userId: user.id, 
        userName: user.name, 
        action, 
        previousState: prev, 
        newState: next, 
        version: version || '-',
        comment, 
        timestamp: new Date().toISOString() 
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
    return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as Document) : null;
  },
  create: async (title: string, description: string, author: User, initialState?: DocState, initialVersion?: string, initialProgress?: number, file?: File, hierarchy?: any): Promise<Document> => {
    const state = initialState || DocState.INITIATED;
    const isSubmission = state === DocState.INTERNAL_REVIEW || state === DocState.SENT_TO_REFERENT || state === DocState.SENT_TO_CONTROL;
    let uploadedFiles: DocFile[] = [];
    const mergedAssignees = Array.from(new Set([...(hierarchy?.assignees || []), author.id]));
    const version = initialVersion || '0.0';
    const newDocData: Omit<Document, 'id'> = {
      title, description, authorId: author.id, authorName: author.name, assignedTo: author.id, assignees: mergedAssignees, state, version, progress: initialProgress || 10, hasPendingRequest: isSubmission, files: uploadedFiles, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), project: hierarchy?.project, macroprocess: hierarchy?.macro, process: hierarchy?.process, microprocess: hierarchy?.micro, docType: hierarchy?.docType
    };
    const docRef = await addDoc(collection(db, "documents"), newDocData);
    
    // CORRECCIÓN: Se elimina el prefijo 'v' redundante que causaba el texto "vv0.1"
    await HistoryService.log(docRef.id, author, 'Creación', DocState.NOT_STARTED, state, `Iniciado Versión ${version}`, version);
    
    // Notificar al coordinador sobre la creación de un nuevo documento
    const allUsers = await UserService.getAll();
    const coordinators = allUsers.filter(u => u.role === UserRole.COORDINATOR || u.role === UserRole.ADMIN);
    coordinators.forEach(coord => {
        NotificationService.create(
            coord.id,
            docRef.id,
            'ASSIGNMENT',
            'Nueva Solicitud de Documento',
            `El analista ${author.name} ha iniciado: ${title}`,
            author.name
        );
    });

    return { id: docRef.id, ...newDocData } as Document;
  },
  delete: async (id: string) => { await deleteDoc(doc(db, "documents", id)); },
  transitionState: async (docId: string, user: User, action: any, comment: string, file?: File, customVersion?: string): Promise<void> => {
      const docRef = doc(db, "documents", docId);
      const docSnap = await getDoc(docRef);
      if(!docSnap.exists()) throw new Error("Documento no encontrado");
      const currentDoc = docSnap.data() as Document;
      let newState = currentDoc.state;
      let newVersion = currentDoc.version;
      let hasPending = currentDoc.hasPendingRequest;
      
      // Mapa de traducción de acciones técnicas a español para el historial
      const actionLabels: Record<string, string> = {
          'APPROVE': 'Aprobación',
          'REJECT': 'Rechazo',
          'COMMENT': 'Observación',
          'REQUEST_APPROVAL': 'Solicitud de Revisión',
          'ADVANCE': 'Avance de Flujo'
      };

      const displayAction = actionLabels[action] || action;

      if (customVersion) {
        newVersion = customVersion;
        newState = determineStateFromVersion(customVersion).state;
      }
      
      if (action === 'APPROVE') hasPending = false;
      else if (action === 'REJECT') { hasPending = false; newState = determineStateFromVersion(newVersion).state; }
      else if (action === 'REQUEST_APPROVAL') hasPending = true;
      
      await updateDoc(docRef, { state: newState, version: newVersion, hasPendingRequest: hasPending, updatedAt: new Date().toISOString() });
      await HistoryService.log(docId, user, displayAction, currentDoc.state, newState, comment, newVersion);

      // --- Lógica de Notificaciones Dinámicas ---
      const allUsers = await UserService.getAll();
      
      // Caso 1: Aprobación o Rechazo (Coordinador -> Analistas)
      if (action === 'APPROVE' || action === 'REJECT') {
          const notificationType = action === 'APPROVE' ? 'APPROVAL' : 'REJECTION';
          const title = action === 'APPROVE' ? 'Documento Aprobado' : 'Documento Rechazado';
          const msg = `El documento "${currentDoc.title}" ha sido ${action === 'APPROVE' ? 'aprobado' : 'rechazado'} (Versión ${newVersion}).`;
          
          currentDoc.assignees.forEach(aid => {
              if (aid !== user.id) {
                NotificationService.create(aid, docId, notificationType, title, msg, user.name);
              }
          });
          
          if (!currentDoc.assignees.includes(currentDoc.authorId) && currentDoc.authorId !== user.id) {
              NotificationService.create(currentDoc.authorId, docId, notificationType, title, msg, user.name);
          }
      } 
      // Caso 2: Nuevo Comentario (Autor y Asignados)
      else if (action === 'COMMENT') {
          const msg = `Nueva observación en "${currentDoc.title}": ${comment.substring(0, 50)}...`;
          const targets = new Set([...(currentDoc.assignees || []), currentDoc.authorId]);
          targets.forEach(aid => {
              if (aid !== user.id) {
                NotificationService.create(aid, docId, 'COMMENT', 'Nueva Observación', msg, user.name);
              }
          });
      } 
      // Caso 3: Carga de nueva versión (Analista -> Coordinadores)
      else if (customVersion) {
          const reviewStates = [DocState.INTERNAL_REVIEW, DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW];
          if (reviewStates.includes(newState)) {
              const coordinators = allUsers.filter(u => u.role === UserRole.COORDINATOR || u.role === UserRole.ADMIN);
              const estadoNombre = STATE_CONFIG[newState]?.label.split('(')[0].trim();
              coordinators.forEach(coord => {
                  if (coord.id !== user.id) {
                    NotificationService.create(
                        coord.id,
                        docId,
                        'ASSIGNMENT',
                        'Revisión Solicitada',
                        `Nueva versión en ${estadoNombre}: ${currentDoc.title} (${newVersion})`,
                        user.name
                    );
                  }
              });
          }
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
      const proj = data.project;
      const macro = data.macroprocess || 'Sin Macroproceso';
      const process = data.process;
      const node: ProcessNode = { name: data.name, docId: doc.id, assignees: data.assignees || [], referentIds: data.referentIds || [], requiredTypes: data.requiredTypes || [], active: data.active !== false };
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
          const macro = data.macroprocess || 'Sin Macroproceso';
          const process = data.process;
          if (!hierarchy[proj]) hierarchy[proj] = {};
          if (!hierarchy[proj][macro]) hierarchy[proj][macro] = {};
          if (!hierarchy[proj][macro][process]) hierarchy[proj][macro][process] = [];
          hierarchy[proj][macro][process].push(data.name);
      });
      return hierarchy;
  },
  updateMatrixAssignment: async (docId: string, assignees: string[]) => {
      const ref = doc(db, "process_matrix", docId);
      await updateDoc(ref, { assignees });
  },
  updateReferentLinks: async (referentId: string, selectedDocIds: string[]) => {
      const q = query(collection(db, "process_matrix"));
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      
      snapshot.docs.forEach(d => {
          const data = d.data();
          let referents = data.referentIds || [];
          const isSelected = selectedDocIds.includes(d.id);
          const hasReferent = referents.includes(referentId);
          
          if (isSelected && !hasReferent) {
              batch.update(d.ref, { referentIds: [...referents, referentId] });
          } else if (!isSelected && hasReferent) {
              batch.update(d.ref, { referentIds: referents.filter((id:string) => id !== referentId) });
          }
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
          const data = d.data();
          const key = `${normalizeHeader(data.project)}|${normalizeHeader(data.name)}`;
          map[key] = data.requiredTypes || [];
      });
      return map;
  },
  toggleProcessStatus: async (docId: string, currentStatus: boolean) => {
      const ref = doc(db, "process_matrix", docId);
      await updateDoc(ref, { active: !currentStatus });
  },
  deleteHierarchyNode: async (level: 'PROJECT' | 'MACRO' | 'PROCESS', name: string, context: { project?: string, macro?: string }) => {
      let q;
      if (level === 'PROJECT') {
          q = query(collection(db, "process_matrix"), where("project", "==", name));
      } else if (level === 'MACRO') {
          q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", name));
      } else { // PROCESS
          q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", context.macro), where("process", "==", name));
      }
      
      const snapshot = await getDocs(q);
      const batch = writeBatch(db);
      snapshot.docs.forEach(d => batch.delete(d.ref));
      await batch.commit();
  },
  updateHierarchyNode: async (level: 'PROJECT' | 'MACRO' | 'PROCESS', oldName: string, newName: string, context: { project?: string, macro?: string }) => {
      let q;
      if (level === 'PROJECT') {
          q = query(collection(db, "process_matrix"), where("project", "==", oldName));
      } else if (level === 'MACRO') {
          q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", oldName));
      } else { // PROCESS
          q = query(collection(db, "process_matrix"), where("project", "==", context.project), where("macroprocess", "==", context.macro), where("process", "==", oldName));
      }
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
      const ref = doc(db, "process_matrix", docId);
      await updateDoc(ref, {
          project: targetProject,
          macroprocess: targetMacro,
          process: targetProcess
      });
  },
  seedDefaults: async () => {
      const batch = writeBatch(db);
      for (const row of REQUIRED_DOCS_MATRIX) {
           const [project, micro, asis, fce, pm, tobe] = row;
           const requiredTypes: string[] = [];
           if (asis) requiredTypes.push('AS IS'); if (fce) requiredTypes.push('FCE'); if (pm) requiredTypes.push('PM'); if (tobe) requiredTypes.push('TO BE');
           const id = generateMatrixId(project, micro);
           batch.set(doc(db, "process_matrix", id), { project, macroprocess: 'Macroproceso General', process: 'Proceso General', name: micro, assignees: [], referentIds: [], requiredTypes, active: true });
      }
      await batch.commit();
  }
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
            const macro = cols[idxMacro] || 'General';
            const process = cols[idxProcess] || 'General';
            const micro = cols[idxMicro];
            if (!micro) continue;
            const assignees = findUserIdsFromCSV(allUsers, cols[idxAnalyst]);
            const requiredTypes: string[] = [];
            if (cols[idxAsis] === '1') requiredTypes.push('AS IS');
            if (cols[idxFce] === '1') requiredTypes.push('FCE');
            if (cols[idxPm] === '1') requiredTypes.push('PM');
            if (cols[idxTobe] === '1') requiredTypes.push('TO BE');
            const id = generateMatrixId(project, micro);
            const nodeData = { project, macroprocess: macro, process, name: micro, assignees, referentIds: [], requiredTypes, active: true };
            batch.set(doc(db, "process_matrix", id), nodeData);
            opCount++; createdCount++;
            if (opCount >= 400) { await batch.commit(); batch = writeBatch(db); opCount = 0; }
        }
        if (opCount > 0) await batch.commit();
        onProgress(100, "Finalizando...");
        return { created: createdCount, historyMatched: 0 };
    }
};