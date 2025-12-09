
import { User, Document, DocState, DocHistory, UserRole, DocFile, AssignmentLog, AnalystWorkload, DocType, UserHierarchy, FullHierarchy, ProcessNode } from '../types';
import { MOCK_USERS, STATE_CONFIG, INITIAL_DATA_LOAD, NAME_TO_ID_MAP, DOCUMENT_STATUS_LOAD, REQUIRED_DOCS_MATRIX } from '../constants';

const STORAGE_KEYS = {
  DOCS: 'sgd_docs_v2026_h',
  HISTORY: 'sgd_history_v2026_h',
  SESSION: 'sgd_session_v2026_h',
  USERS: 'sgd_users_v2026_h',
  ASSIGNMENTS: 'sgd_assignments_v2026_h',
  MATRIX_OVERRIDES: 'sgd_matrix_overrides_v2026_h',
  REQUIRED_TYPES: 'sgd_required_types_v2026_h',
  CUSTOM_NODES: 'sgd_custom_nodes_v2026_h' // New key for user-created microprocesses
};

// ... (Helper functions determineStateFromVersion and mapCodeToDocType remain unchanged) ...
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

const initializeStorage = () => {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(MOCK_USERS));
  }

  // Initialize Required Types if empty
  if (!localStorage.getItem(STORAGE_KEYS.REQUIRED_TYPES)) {
      const requiredMap: Record<string, DocType[]> = {};
      REQUIRED_DOCS_MATRIX.forEach(row => {
          const [project, micro, asIs, fce, pm, toBe] = row;
          const key = `${project}|${micro}`;
          const types: DocType[] = [];
          if (asIs === 1) types.push('AS IS');
          if (fce === 1) types.push('FCE');
          if (pm === 1) types.push('PM');
          if (toBe === 1) types.push('TO BE');
          requiredMap[key] = types;
      });
      localStorage.setItem(STORAGE_KEYS.REQUIRED_TYPES, JSON.stringify(requiredMap));
  }
  
  if (!localStorage.getItem(STORAGE_KEYS.CUSTOM_NODES)) {
      localStorage.setItem(STORAGE_KEYS.CUSTOM_NODES, JSON.stringify([]));
  }

  if (!localStorage.getItem(STORAGE_KEYS.DOCS)) {
    const seedDocs: Document[] = [];
    const adminUser = MOCK_USERS.find(u => u.role === UserRole.ADMIN) || MOCK_USERS[0];
    
    // 1. Build Base Hierarchy Index from INITIAL_DATA_LOAD
    const hierarchyIndex = new Map<string, { macro: string, process: string, assignees: string[] }>();
    INITIAL_DATA_LOAD.forEach(row => {
        if (!row || row.length < 5) return;
        const [project, macro, process, micro, namesStr] = row;
        const key = `${project}|${micro}`;
        const rawNames = namesStr ? namesStr.split('/') : [];
        const assigneeIds: string[] = [];
        rawNames.forEach(name => {
            const cleanName = name.trim();
            if (NAME_TO_ID_MAP[cleanName]) assigneeIds.push(NAME_TO_ID_MAP[cleanName]);
        });
        hierarchyIndex.set(key, { macro, process, assignees: assigneeIds });
    });

    // 2. Generate Documents from DOCUMENT_STATUS_LOAD
    DOCUMENT_STATUS_LOAD.forEach(row => {
        if (!row || row.length < 5) return;
        const [origId, project, micro, typeCode, version] = row;
        const key = `${project}|${micro}`;
        const hierarchyData = hierarchyIndex.get(key);
        if (!hierarchyData) return; 

        const { macro, process, assignees } = hierarchyData;
        const primaryAssignee = assignees.length > 0 ? assignees[0] : adminUser.id;
        const docType = mapCodeToDocType(typeCode);
        const { state, progress } = determineStateFromVersion(version);

        seedDocs.push({
            id: `doc-${origId}-${typeCode}`,
            title: `${project} - ${micro} - ${docType}`,
            description: `Documento ${docType} para microproceso: ${micro}.`,
            project: project,
            macroprocess: macro,
            process: process,
            microprocess: micro,
            docType: docType,
            authorId: adminUser.id,
            authorName: adminUser.name,
            assignedTo: primaryAssignee, 
            assignees: assignees,      
            assignedByName: 'Carga Inicial',
            state: state,
            version: version,
            progress: progress,
            hasPendingRequest: false,
            files: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        });
    });

    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(seedDocs));
  }
  if (!localStorage.getItem(STORAGE_KEYS.HISTORY)) {
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS)) {
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify([]));
  }
  if (!localStorage.getItem(STORAGE_KEYS.MATRIX_OVERRIDES)) {
    localStorage.setItem(STORAGE_KEYS.MATRIX_OVERRIDES, JSON.stringify({}));
  }
};

initializeStorage();

export const HierarchyService = {
  getFullHierarchy: async (): Promise<FullHierarchy> => {
    const tree: FullHierarchy = {};
    
    // Load local storage data
    const overrides = JSON.parse(localStorage.getItem(STORAGE_KEYS.MATRIX_OVERRIDES) || '{}');
    const requiredTypesMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUIRED_TYPES) || '{}');
    const customNodes = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_NODES) || '[]');

    // 1. Process Static Initial Load
    INITIAL_DATA_LOAD.forEach(row => {
        if (!row || row.length < 5) return;
        const [project, macro, process, micro, namesStr] = row;
        
        const matrixKey = `${project}|${micro}`;
        let assigneeIds: string[] = [];

        if (overrides[matrixKey]) {
            assigneeIds = overrides[matrixKey];
        } else {
            const rawNames = namesStr ? namesStr.split('/') : [];
            rawNames.forEach(name => {
                const cleanName = name.trim();
                if (NAME_TO_ID_MAP[cleanName]) assigneeIds.push(NAME_TO_ID_MAP[cleanName]);
            });
        }

        if (!tree[project]) tree[project] = {};
        if (!tree[project][macro]) tree[project][macro] = {};
        if (!tree[project][macro][process]) tree[project][macro][process] = [];

        const existing = tree[project][macro][process].find(m => m.name === micro);
        if (!existing) {
             const types = requiredTypesMap[matrixKey] || [];
             tree[project][macro][process].push({
                name: micro,
                docId: matrixKey,
                assignees: assigneeIds,
                requiredTypes: types
            });
        }
    });

    // 2. Process Custom User-Created Nodes
    customNodes.forEach((node: any) => {
        const { project, macro, process, micro, assignees, requiredTypes } = node;
        const matrixKey = `${project}|${micro}`;
        
        // Determine effective assignees (override check)
        const finalAssignees = overrides[matrixKey] || assignees || [];
        // Determine effective types
        const finalTypes = requiredTypesMap[matrixKey] || requiredTypes || [];

        if (!tree[project]) tree[project] = {};
        if (!tree[project][macro]) tree[project][macro] = {};
        if (!tree[project][macro][process]) tree[project][macro][process] = [];

        const existing = tree[project][macro][process].find(m => m.name === micro);
        if (!existing) {
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

  getUserHierarchy: async (userId: string): Promise<UserHierarchy> => {
    const fullTree = await HierarchyService.getFullHierarchy();
    const userTree: UserHierarchy = {};

    Object.keys(fullTree).forEach(project => {
        Object.keys(fullTree[project]).forEach(macro => {
            Object.keys(fullTree[project][macro]).forEach(process => {
                const microNodes = fullTree[project][macro][process];
                microNodes.forEach(node => {
                    if (node.assignees.includes(userId)) {
                        if (!userTree[project]) userTree[project] = {};
                        if (!userTree[project][macro]) userTree[project][macro] = {};
                        if (!userTree[project][macro][process]) userTree[project][macro][process] = [];
                        userTree[project][macro][process].push(node.name);
                    }
                });
            });
        });
    });
    return userTree;
  },
  
  // New method exposed for Dashboard
  getRequiredTypesMap: async (): Promise<Record<string, DocType[]>> => {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUIRED_TYPES) || '{}');
  },

  updateMatrixAssignment: async (matrixKey: string, newAssignees: string[], adminId: string) => {
    const overrides = JSON.parse(localStorage.getItem(STORAGE_KEYS.MATRIX_OVERRIDES) || '{}');
    overrides[matrixKey] = newAssignees;
    localStorage.setItem(STORAGE_KEYS.MATRIX_OVERRIDES, JSON.stringify(overrides));
    
    // Sync to existing documents
    const [project, micro] = matrixKey.split('|');
    const docs = await DocumentService.getAll();
    let updatedCount = 0;
    
    const updatedDocs = docs.map(d => {
        if (d.project === project && d.microprocess === micro) {
            updatedCount++;
            return { ...d, assignees: newAssignees };
        }
        return d;
    });

    if (updatedCount > 0) {
        localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(updatedDocs));
    }
  },

  toggleRequiredType: async (matrixKey: string, type: DocType) => {
      const requiredTypesMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUIRED_TYPES) || '{}');
      let currentTypes: DocType[] = requiredTypesMap[matrixKey] || [];
      
      if (currentTypes.includes(type)) {
          currentTypes = currentTypes.filter(t => t !== type);
      } else {
          currentTypes.push(type);
      }
      
      requiredTypesMap[matrixKey] = currentTypes;
      localStorage.setItem(STORAGE_KEYS.REQUIRED_TYPES, JSON.stringify(requiredTypesMap));
  },

  addMicroprocess: async (project: string, macro: string, process: string, microName: string, assignees: string[], requiredTypes: DocType[]) => {
      const customNodes = JSON.parse(localStorage.getItem(STORAGE_KEYS.CUSTOM_NODES) || '[]');
      const matrixKey = `${project}|${microName}`;

      // Basic duplicate check (simple)
      const exists = customNodes.some((n: any) => n.project === project && n.micro === microName);
      if (exists) throw new Error('El microproceso ya existe en este proyecto.');

      const newNode = {
          project, macro, process, micro: microName,
          assignees, requiredTypes
      };

      customNodes.push(newNode);
      localStorage.setItem(STORAGE_KEYS.CUSTOM_NODES, JSON.stringify(customNodes));

      // Persist required types to the separate map as well to ensure consistency with the toggle logic
      const requiredTypesMap = JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUIRED_TYPES) || '{}');
      requiredTypesMap[matrixKey] = requiredTypes;
      localStorage.setItem(STORAGE_KEYS.REQUIRED_TYPES, JSON.stringify(requiredTypesMap));

      // Persist assignments to override map for consistency
      const overrides = JSON.parse(localStorage.getItem(STORAGE_KEYS.MATRIX_OVERRIDES) || '{}');
      overrides[matrixKey] = assignees;
      localStorage.setItem(STORAGE_KEYS.MATRIX_OVERRIDES, JSON.stringify(overrides));
  }
};

export const UserService = {
  getAll: async (): Promise<User[]> => {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  },
  create: async (userData: Omit<User, 'id' | 'avatar'>): Promise<User> => {
    const users = await UserService.getAll();
    if (users.find(u => u.email === userData.email)) throw new Error('El correo ya está registrado.');
    const newUser: User = {
      id: `u-${Date.now()}`,
      avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(userData.name)}&background=random`,
      ...userData
    };
    users.push(newUser);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    return newUser;
  },
  update: async (id: string, userData: Partial<User>): Promise<User> => {
    const users = await UserService.getAll();
    const index = users.findIndex(u => u.id === id);
    if (index === -1) throw new Error('Usuario no encontrado');
    const updatedUser = { ...users[index], ...userData };
    users[index] = updatedUser;
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    return updatedUser;
  },
  delete: async (id: string) => {
    let users = await UserService.getAll();
    users = users.filter(u => u.id !== id);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
};

export const AuthService = {
  login: async (input: string, password?: string): Promise<User> => {
    await new Promise(resolve => setTimeout(resolve, 500));
    const users = await UserService.getAll();
    let user: User | undefined;
    if (input === 'admin' && password === 'admin') {
      user = users.find(u => u.role === UserRole.ADMIN);
      if (!user) user = MOCK_USERS.find(u => u.role === UserRole.ADMIN);
    } else {
      user = users.find(u => u.email === input || u.nickname === input || u.name === input);
      if (!user) throw new Error('Usuario no encontrado.');
      const storedPassword = user.password || '123456';
      if (password !== storedPassword) throw new Error('Contraseña incorrecta');
    }
    if (!user) throw new Error('Error desconocido.');
    localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(user));
    return user;
  },
  getCurrentUser: (): User | null => {
    const session = localStorage.getItem(STORAGE_KEYS.SESSION);
    return session ? JSON.parse(session) : null;
  },
  logout: () => {
    localStorage.removeItem(STORAGE_KEYS.SESSION);
  }
};

export const DocumentService = {
  getAll: async (): Promise<Document[]> => {
    const docs = JSON.parse(localStorage.getItem(STORAGE_KEYS.DOCS) || '[]');
    // Sort by UpdatedAt Descending ensures Dashboard always shows the most recent interaction at top
    return docs.sort((a: Document, b: Document) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },
  getById: async (id: string): Promise<Document | null> => {
    const docs = JSON.parse(localStorage.getItem(STORAGE_KEYS.DOCS) || '[]');
    return docs.find((d: Document) => d.id === id) || null;
  },
  create: async (title: string, description: string, author: User, initialState?: DocState, initialVersion?: string, initialProgress?: number, file?: File, hierarchy?: any): Promise<Document> => {
    const state = initialState || DocState.INITIATED;
    const version = initialVersion || '0.0';
    const progress = initialProgress !== undefined ? initialProgress : 10;
    const assigneeIds = author.role === UserRole.ANALYST ? [author.id] : [];
    
    // Determine if this creation counts as a submission (Request)
    // CRITICAL FIX: Ensure 'INTERNAL_REVIEW' etc. trigger this flag
    const isSubmission = state === DocState.INTERNAL_REVIEW || state === DocState.SENT_TO_REFERENT || state === DocState.SENT_TO_CONTROL;

    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title, description, authorId: author.id, authorName: author.name,
      assignedTo: assigneeIds[0], assignees: assigneeIds,
      state: state, version: version, progress: progress, 
      hasPendingRequest: isSubmission, // Auto-flag if state implies submission
      files: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      project: hierarchy?.project, macroprocess: hierarchy?.macro, process: hierarchy?.process, microprocess: hierarchy?.micro, docType: hierarchy?.docType
    };
    if (file) {
        const newFile: DocFile = {
            id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
            url: URL.createObjectURL(file), uploadedAt: new Date().toISOString()
        };
        newDoc.files.push(newFile);
    }
    const docs = await DocumentService.getAll();
    docs.push(newDoc);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
    await HistoryService.log(newDoc.id, author, 'Creación', state, state, 'Documento creado.');
    return newDoc;
  },
  delete: async (id: string) => {
    let docs = await DocumentService.getAll();
    docs = docs.filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
  },
  uploadFile: async (docId: string, file: File, user: User): Promise<DocFile> => {
    const newFile: DocFile = {
      id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
      url: URL.createObjectURL(file), uploadedAt: new Date().toISOString()
    };
    const docs = await DocumentService.getAll();
    const docIndex = docs.findIndex(d => d.id === docId);
    if (docIndex === -1) throw new Error('Documento no encontrado');
    
    // Auto-update metadata based on filename IMMEDIATELY
    const parts = file.name.replace(/\.[^/.]+$/, "").split(' - ');
    if (parts.length >= 4) {
        const newVersion = parts[parts.length - 1];
        if (newVersion) {
            const { state, progress } = determineStateFromVersion(newVersion);
            docs[docIndex].version = newVersion;
            docs[docIndex].state = state;
            docs[docIndex].progress = progress;
        }
    }

    docs[docIndex].files.push(newFile);
    docs[docIndex].updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
    return newFile;
  },
  transitionState: async (docId: string, user: User, action: 'ADVANCE' | 'REJECT' | 'APPROVE' | 'REQUEST_APPROVAL', comment: string, file?: File, customVersion?: string): Promise<Document> => {
    const docs = await DocumentService.getAll();
    const docIndex = docs.findIndex(d => d.id === docId);
    if (docIndex === -1) throw new Error('Documento no encontrado');
    const doc = docs[docIndex];
    const previousState = doc.state;
    let newState = doc.state;
    let newVersion = doc.version;
    let hasPending = doc.hasPendingRequest;

    if (file) {
        const newFile: DocFile = {
            id: `file-${Date.now()}`, name: file.name, size: file.size, type: file.type,
            url: URL.createObjectURL(file), uploadedAt: new Date().toISOString()
        };
        doc.files.push(newFile);
    }
    
    // Explicit logic for version handling from Approve/Reject uploads
    if (customVersion) {
        newVersion = customVersion;
        // If it's a rejection, we update version but state is FORCED to REJECTED below
        // If it's an approval, we derive state from version here:
        if (action === 'APPROVE') {
            const { state: derivedState } = determineStateFromVersion(customVersion);
            newState = derivedState;
        }
    }

    switch (action) {
      case 'REQUEST_APPROVAL':
        hasPending = true;
        // Logic: Move from In Process (30%) or Initiated (10%) to Internal Review (60%)
        if (doc.state === DocState.IN_PROCESS || doc.state === DocState.INITIATED || doc.state === DocState.REJECTED) {
             newState = DocState.INTERNAL_REVIEW;
        }
        break;

      case 'ADVANCE':
        hasPending = false;
        if (doc.state === DocState.REJECTED) { newState = DocState.IN_PROCESS; } // Restart
        break;

      case 'APPROVE':
        hasPending = false;
        // newState is already set via determineStateFromVersion above if file was provided
        // If logic is purely manual without file change (fallback):
        if (!customVersion) {
             if (doc.state === DocState.INTERNAL_REVIEW) newState = DocState.SENT_TO_REFERENT;
             else if (doc.state === DocState.SENT_TO_REFERENT) newState = DocState.SENT_TO_CONTROL;
             else if (doc.state === DocState.SENT_TO_CONTROL) newState = DocState.APPROVED;
        }
        break;
      
      case 'REJECT':
        hasPending = false;
        newState = DocState.REJECTED;
        comment = `RECHAZADO: ${comment}`;
        break;
    }

    // Recalculate progress based on new state config
    const progress = STATE_CONFIG[newState]?.progress || doc.progress;

    docs[docIndex] = {
      ...doc,
      state: newState,
      version: newVersion,
      progress: progress,
      hasPendingRequest: hasPending,
      updatedAt: new Date().toISOString()
    };

    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
    await HistoryService.log(doc.id, user, action, previousState, newState, comment);
    return docs[docIndex];
  }
};

export const HistoryService = {
  getHistory: async (docId: string): Promise<DocHistory[]> => {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
    return history.filter((h: DocHistory) => h.documentId === docId).sort((a: any, b: any) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  },
  log: async (docId: string, user: User, action: string, prev: DocState, next: DocState, comment: string) => {
    const history = JSON.parse(localStorage.getItem(STORAGE_KEYS.HISTORY) || '[]');
    const newEntry: DocHistory = {
      id: `hist-${Date.now()}`, documentId: docId, userId: user.id, userName: user.name,
      action, previousState: prev, newState: next, comment, timestamp: new Date().toISOString()
    };
    history.push(newEntry);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  }
};
export const AssignmentService = {
  getUnassignedDocs: async (): Promise<Document[]> => { return [] },
  getWorkload: async (): Promise<AnalystWorkload[]> => { return [] },
  assignDocument: async (docId: string, analystId: string, adminId: string, reason?: string) => {},
  suggestAnalyst: async (): Promise<User | null> => { return null }
};
