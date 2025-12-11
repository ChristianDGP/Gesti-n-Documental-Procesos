
import { 
  collection, getDocs, doc, getDoc, setDoc, updateDoc, addDoc, 
  query, where, orderBy, deleteDoc, Timestamp 
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
  AnalystWorkload, DocType, FullHierarchy 
} from "../types";
import { 
  STATE_CONFIG, INITIAL_DATA_LOAD, NAME_TO_ID_MAP, REQUIRED_DOCS_MATRIX 
} from "../constants";

// --- Helpers ---
const determineStateFromVersion = (version: string): { state: DocState, progress: number } => {
    const v = version.trim();
    if (v.endsWith('ACG')) return { state: DocState.APPROVED, progress: 100 };
    if (v.endsWith('AR')) return { state: DocState.SENT_TO_CONTROL, progress: 90 };
    if (v.startsWith('v1.') && !v.includes('AR') && !v.includes('ACG')) return { state: DocState.SENT_TO_REFERENT, progress: 80 };
    if (v.startsWith('v0.')) return { state: DocState.INTERNAL_REVIEW, progress: 60 };
    if (v === '0.0') return { state: DocState.INITIATED, progress: 10 };
    if (/^0\.\d+$/.test(v) || /^\d+\.\d+$/.test(v)) return { state: DocState.IN_PROCESS, progress: 30 };
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

// --- Services ---

export const AuthService = {
  loginWithGoogle: async (): Promise<User> => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const firebaseUser = result.user;
      
      // Check if user exists in Firestore
      const userRef = doc(db, "users", firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        return userSnap.data() as User;
      } else {
        // First time login: Create User Profile
        // Security Rule: You can hardcode your email here to be ADMIN automatically
        // e.g. firebaseUser.email === 'admin@domain.com'
        const isSuperAdmin = firebaseUser.email === 'carayag@ugp-ssm.cl' || firebaseUser.email === 'tu-email@gmail.com';
        
        const newUser: User = {
          id: firebaseUser.uid,
          email: firebaseUser.email || '',
          name: firebaseUser.displayName || 'Usuario',
          nickname: firebaseUser.email?.split('@')[0] || 'user',
          role: isSuperAdmin ? UserRole.ADMIN : UserRole.ANALYST, // Default role
          avatar: firebaseUser.photoURL || `https://ui-avatars.com/api/?name=${firebaseUser.displayName}`,
          organization: 'SSM'
        };
        
        await setDoc(userRef, newUser);
        return newUser;
      }
    } catch (error: any) {
      // Ensure we log the error for debugging purposes
      console.error("AuthService Login Error:", error);
      // Re-throw so UI catches it (especially auth/unauthorized-domain)
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

  // Helper to sync user session
  syncSession: async (callback: (u: User | null) => void) => {
    onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userRef = doc(db, "users", firebaseUser.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          const userData = userSnap.data() as User;
          localStorage.setItem('sgd_user_cache', JSON.stringify(userData));
          callback(userData);
        } else {
          // User authenticated in Firebase but not in Firestore yet?
          // This edge case might happen if creation fails.
          // For now, treat as not logged in or trigger creation?
          // We'll treat as null and let them login again which triggers creation logic
          callback(null);
        }
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
    await updateDoc(userRef, userData);
    const updatedSnap = await getDoc(userRef);
    return updatedSnap.data() as User;
  },
  create: async (userData: User): Promise<User> => {
      // Manual creation by Admin
      await setDoc(doc(db, "users", userData.id), userData);
      return userData;
  },
  delete: async (id: string) => {
      await deleteDoc(doc(db, "users", id));
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
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() } as Document;
    }
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
      files: [], 
      createdAt: new Date().toISOString(), 
      updatedAt: new Date().toISOString(),
      project: hierarchy?.project, macroprocess: hierarchy?.macro, process: hierarchy?.process, microprocess: hierarchy?.micro, docType: hierarchy?.docType
    };

    // 1. Create Document Ref
    const docRef = await addDoc(collection(db, "documents"), newDocData);
    const docId = docRef.id;

    // 2. Upload File if exists
    if (file) {
       const fileRef = ref(storage, `documents/${docId}/${file.name}`);
       await uploadBytes(fileRef, file);
       const url = await getDownloadURL(fileRef);
       
       const newFile: DocFile = {
           id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
           url: url, uploadedAt: new Date().toISOString()
       };
       
       await updateDoc(docRef, {
           files: [newFile]
       });
       newDocData.files = [newFile];
    }

    await HistoryService.log(docId, author, 'Creación', state, state, 'Documento creado.');
    return { id: docId, ...newDocData } as Document;
  },

  uploadFile: async (docId: string, file: File, user: User): Promise<DocFile> => {
      const docRef = doc(db, "documents", docId);
      const docSnap = await getDoc(docRef);
      if(!docSnap.exists()) throw new Error("Doc not found");
      const currentDoc = docSnap.data() as Document;

      // Upload
      const fileRef = ref(storage, `documents/${docId}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      const newFile: DocFile = {
          id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
          url: url, uploadedAt: new Date().toISOString()
      };

      const updatedFiles = [...(currentDoc.files || []), newFile];
      const updates: any = { 
          files: updatedFiles, 
          updatedAt: new Date().toISOString() 
      };

      // Auto-update metadata
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
      // Note: Ideally delete files from Storage too
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
          const fileRef = ref(storage, `documents/${docId}/${Date.now()}_${file.name}`);
          await uploadBytes(fileRef, file);
          const url = await getDownloadURL(fileRef);
          updatedFiles.push({
              id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
              url, uploadedAt: new Date().toISOString()
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
            if (currentDoc.state === DocState.IN_PROCESS || currentDoc.state === DocState.INITIATED || currentDoc.state === DocState.REJECTED) {
                newState = DocState.INTERNAL_REVIEW;
            }
            break;
        case 'APPROVE':
            hasPending = false;
            break;
        case 'REJECT':
            hasPending = false;
            newState = DocState.REJECTED;
            comment = `RECHAZADO: ${comment}`;
            break;
        case 'ADVANCE':
            hasPending = false;
            if (currentDoc.state === DocState.REJECTED) newState = DocState.IN_PROCESS;
            break;
        case 'COMMENT':
            comment = `OBSERVACIÓN: ${comment}`;
            break;
      }

      const progress = STATE_CONFIG[newState]?.progress || currentDoc.progress;
      
      await updateDoc(docRef, {
          state: newState,
          version: newVersion,
          hasPendingRequest: hasPending,
          files: updatedFiles,
          progress,
          updatedAt: new Date().toISOString()
      });

      const actionLabel = action === 'COMMENT' ? 'Observación' : action;
      await HistoryService.log(docId, user, actionLabel, currentDoc.state, newState, comment);
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

export const HierarchyService = {
    getFullHierarchy: async (): Promise<FullHierarchy> => {
        // Fetch custom nodes from Firestore
        const q = query(collection(db, "custom_microprocesses"));
        const snapshot = await getDocs(q);
        const customNodes = snapshot.docs.map(d => d.data());

        // Fetch overrides
        const matrixDoc = await getDoc(doc(db, "config", "matrix_overrides"));
        const overrides = matrixDoc.exists() ? matrixDoc.data() : {};

        // Fetch required types
        const typesDoc = await getDoc(doc(db, "config", "required_types"));
        const requiredTypesMap = typesDoc.exists() ? typesDoc.data() : {};

        const tree: FullHierarchy = {};
        
        // 1. Initial Load (Static)
        INITIAL_DATA_LOAD.forEach(row => {
            if (!row || row.length < 5) return;
            const [project, macro, process, micro, namesStr] = row;
            const matrixKey = `${project}|${micro}`;
            
            let assigneeIds: string[] = [];
            if (overrides[matrixKey]) {
                assigneeIds = overrides[matrixKey];
            } else {
                 // Default logic: do not use NAME_TO_ID_MAP on backend as it's static
                 // Just return empty or use initial seed logic if we had user access
                 assigneeIds = []; 
            }

            if (!tree[project]) tree[project] = {};
            if (!tree[project][macro]) tree[project][macro] = {};
            if (!tree[project][macro][process]) tree[project][macro][process] = [];
            
            if (!tree[project][macro][process].find(m => m.name === micro)) {
                tree[project][macro][process].push({
                    name: micro,
                    docId: matrixKey,
                    assignees: assigneeIds,
                    requiredTypes: requiredTypesMap[matrixKey] || []
                });
            }
        });

        // 2. Custom Nodes
        customNodes.forEach((node: any) => {
             const { project, macro, process, micro, assignees, requiredTypes } = node;
             const matrixKey = `${project}|${micro}`;
             
             // Merge with overrides
             const finalAssignees = overrides[matrixKey] || assignees || [];
             const finalTypes = requiredTypesMap[matrixKey] || requiredTypes || [];

             if (!tree[project]) tree[project] = {};
             if (!tree[project][macro]) tree[project][macro] = {};
             if (!tree[project][macro][process]) tree[project][macro][process] = [];
             
             if (!tree[project][macro][process].find(m => m.name === micro)) {
                 tree[project][macro][process].push({
                     name: micro,
                     docId: matrixKey,
                     assignees: finalAssignees,
                     requiredTypes: finalTypes
                 });
             }
        });

        return tree;
    },

    getUserHierarchy: async (userId: string): Promise<any> => {
        const full = await HierarchyService.getFullHierarchy();
        const userTree: any = {};
        Object.keys(full).forEach(proj => {
            Object.keys(full[proj]).forEach(macro => {
                Object.keys(full[proj][macro]).forEach(proc => {
                    const nodes = full[proj][macro][proc];
                    nodes.forEach(node => {
                        if (node.assignees.includes(userId)) {
                            if(!userTree[proj]) userTree[proj] = {};
                            if(!userTree[proj][macro]) userTree[proj][macro] = {};
                            if(!userTree[proj][macro][proc]) userTree[proj][macro][proc] = [];
                            userTree[proj][macro][proc].push(node.name);
                        }
                    })
                })
            })
        });
        return userTree;
    },

    getRequiredTypesMap: async () => {
        const docSnap = await getDoc(doc(db, "config", "required_types"));
        return docSnap.exists() ? docSnap.data() : {};
    },

    toggleRequiredType: async (matrixKey: string, type: DocType) => {
        const ref = doc(db, "config", "required_types");
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        
        let types = data[matrixKey] || [];
        if (types.includes(type)) types = types.filter((t: string) => t !== type);
        else types.push(type);
        
        await setDoc(ref, { ...data, [matrixKey]: types });
    },

    updateMatrixAssignment: async (matrixKey: string, newAssignees: string[], updatedBy?: string) => {
        const ref = doc(db, "config", "matrix_overrides");
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        
        await setDoc(ref, { ...data, [matrixKey]: newAssignees });

        // Update existing documents linked to this microprocess
        const [proj, micro] = matrixKey.split('|');
        const q = query(collection(db, "documents"), where("project", "==", proj), where("microprocess", "==", micro));
        const docs = await getDocs(q);
        
        await Promise.all(docs.docs.map(async (d) => {
             await updateDoc(doc(db, "documents", d.id), {
                 assignees: newAssignees,
                 assignedTo: newAssignees[0]
             });
        }));
    },

    addMicroprocess: async (project: string, macro: string, process: string, microName: string, assignees: string[], requiredTypes: DocType[]) => {
        await addDoc(collection(db, "custom_microprocesses"), {
            project, macro, process, micro: microName, assignees, requiredTypes
        });
        
        const matrixKey = `${project}|${microName}`;
        await HierarchyService.updateMatrixAssignment(matrixKey, assignees);
        const ref = doc(db, "config", "required_types");
        const snap = await getDoc(ref);
        const data = snap.exists() ? snap.data() : {};
        await setDoc(ref, { ...data, [matrixKey]: requiredTypes });
    },

    deleteMicroprocess: async (project: string, microName: string) => {
        // 1. Delete from custom_microprocesses
        const q = query(collection(db, "custom_microprocesses"), where("project", "==", project), where("micro", "==", microName));
        const snapshot = await getDocs(q);
        await Promise.all(snapshot.docs.map(d => deleteDoc(d.ref)));

        const matrixKey = `${project}|${microName}`;

        // 2. Remove from matrix_overrides
        const overridesRef = doc(db, "config", "matrix_overrides");
        const overridesSnap = await getDoc(overridesRef);
        if (overridesSnap.exists()) {
            const data = overridesSnap.data();
            if (data[matrixKey]) {
                const { [matrixKey]: _, ...rest } = data;
                await setDoc(overridesRef, rest);
            }
        }

        // 3. Remove from required_types
        const typesRef = doc(db, "config", "required_types");
        const typesSnap = await getDoc(typesRef);
        if (typesSnap.exists()) {
            const data = typesSnap.data();
            if (data[matrixKey]) {
                const { [matrixKey]: _, ...rest } = data;
                await setDoc(typesRef, rest);
            }
        }
    }
};

export const DatabaseService = {
    // Keep legacy import but adapted for Firestore Batching
    importLegacyFromCSV: async (csvContent: string) => {
        const lines = csvContent.split(/\r?\n/).filter(line => line.trim() !== '');
        if (lines.length < 2) throw new Error('CSV vacío');
        
        const users = await UserService.getAll();
        const currentUser = await AuthService.getCurrentUser();
        const adminId = currentUser?.id || 'admin';

        const parseLegacyDate = (d: string) => {
            if (!d || d.trim() === '') return new Date().toISOString();
            const parts = d.trim().split('-');
            if (parts.length === 3) return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`).toISOString();
            return new Date().toISOString();
        };

        const parseLegacyState = (s: string): DocState => {
            if (!s) return DocState.INITIATED;
            const normalized = s.trim();
            if (normalized.startsWith('6')) return DocState.APPROVED;
            if (normalized.startsWith('5.1')) return DocState.CONTROL_REVIEW;
            if (normalized.startsWith('5')) return DocState.SENT_TO_CONTROL;
            if (normalized.startsWith('4.1')) return DocState.REFERENT_REVIEW;
            if (normalized.startsWith('4')) return DocState.SENT_TO_REFERENT;
            if (normalized.startsWith('3')) return DocState.INTERNAL_REVIEW;
            if (normalized.startsWith('2')) return DocState.IN_PROCESS;
            if (normalized.startsWith('1')) return DocState.INITIATED;
            return DocState.IN_PROCESS; 
        };

        const cleanPercentage = (p: string): number => {
            if (!p) return 0;
            return parseInt(p.replace('%', '').trim()) || 0;
        };
        
        // Delete existing docs (CAUTION)
        const q = query(collection(db, "documents"));
        const snap = await getDocs(q);
        await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));

        let imported = 0;
        const errors: string[] = [];
        const newMatrixOverrides: Record<string, string[]> = {};

        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(';');
            if (cols.length < 5) continue;

            const [_, project, macro, process, micro, analystName] = cols;
            
            // Resolve Assignee Logic
            let assignees: string[] = [adminId];
            if (analystName) {
                 const clean = analystName.trim();
                 const match = users.find(u => u.name === clean || u.nickname === clean);
                 if (match) assignees = [match.id];
            }
            const authorName = assignees[0] === adminId ? 'Admin (Migración)' : (users.find(u => u.id === assignees[0])?.name || 'Desconocido');
            
            if (project && micro) {
                newMatrixOverrides[`${project}|${micro}`] = assignees;
            }

            const baseDoc = {
                project, macroprocess: macro, process, microprocess: micro,
                authorId: assignees[0], authorName, assignedTo: assignees[0], assignees: assignees,
                files: []
            };

            const createLegacyDoc = async (type: DocType, progressStr: string, dateStr: string, versionStr: string, stateStr: string) => {
                if (versionStr && versionStr.trim() !== '') {
                     await addDoc(collection(db, "documents"), {
                         ...baseDoc,
                         title: `${project} - ${micro} - ${type}`,
                         description: `Migración: ${type} para ${micro}`,
                         docType: type,
                         progress: cleanPercentage(progressStr),
                         updatedAt: parseLegacyDate(dateStr),
                         createdAt: parseLegacyDate(dateStr),
                         version: versionStr.trim(),
                         state: parseLegacyState(stateStr),
                         hasPendingRequest: false
                     });
                     imported++;
                }
            }

            await createLegacyDoc('AS IS', cols[6], cols[7], cols[8], cols[9]);
            await createLegacyDoc('FCE', cols[10], cols[11], cols[12], cols[13]);
            await createLegacyDoc('PM', cols[14], cols[15], cols[16], cols[17]);
            await createLegacyDoc('TO BE', cols[18], cols[19], cols[20], cols[21]);
        }
        
        await setDoc(doc(db, "config", "matrix_overrides"), newMatrixOverrides);
        return { imported, errors };
    },
    exportData: async () => { return "Función no disponible en versión nube (contactar admin DB)"; },
    importData: async (jsonContent: string) => { 
        console.warn("Attempted JSON Restore on Cloud version.");
        throw new Error("La importación de respaldo JSON no está disponible en la versión Cloud. Utilice la importación CSV para migración inicial.");
    }
};
