import { User, Document, DocState, DocHistory, UserRole, DocFile, AssignmentLog, AnalystWorkload } from '../types';
import { MOCK_USERS, STATE_CONFIG, INITIAL_DATA_LOAD, NAME_TO_ID_MAP } from '../constants';

const STORAGE_KEYS = {
  DOCS: 'sga_docs_v2026_b',
  HISTORY: 'sga_history_v2026_b',
  SESSION: 'sga_session_v2026_b',
  USERS: 'sga_users_v2026_b',
  ASSIGNMENTS: 'sga_assignments_v2026_b'
};

// Initialize LocalStorage with seed data if empty
const initializeStorage = () => {
  if (!localStorage.getItem(STORAGE_KEYS.USERS)) {
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(MOCK_USERS));
  }

  if (!localStorage.getItem(STORAGE_KEYS.DOCS)) {
    const seedDocs: Document[] = [];
    const adminUser = MOCK_USERS.find(u => u.role === UserRole.ADMIN) || MOCK_USERS[0];
    
    // Process the INITIAL_DATA_LOAD matrix
    // Format: [Project, Macro, Process, Micro, Names]
    let counter = 1;
    
    INITIAL_DATA_LOAD.forEach(row => {
        // Safety check to ensure row has data
        if (!row || row.length < 5) return;

        const [project, macro, process, micro, namesStr] = row;
        
        // Handle multiple assignees (e.g., "Andrea/Javiera")
        const rawNames = namesStr ? namesStr.split('/') : [];
        const assigneeIds: string[] = [];
        
        rawNames.forEach(name => {
            const cleanName = name.trim();
            if (NAME_TO_ID_MAP[cleanName]) {
                assigneeIds.push(NAME_TO_ID_MAP[cleanName]);
            }
        });

        // Ensure at least one ID found, otherwise default to admin or skip
        if (assigneeIds.length === 0) return;

        // Create a "Ficha" or initial document for this process
        const docId = `doc-init-${counter++}`;
        const primaryAssignee = assigneeIds[0];
        
        seedDocs.push({
            id: docId,
            title: `${project} - ${micro}`,
            description: `Documentación matriz para microproceso: ${micro} (${process}).`,
            
            // Hierarchy Metadata
            project: project,
            macroprocess: macro,
            process: process,
            microprocess: micro,

            authorId: adminUser.id,
            authorName: adminUser.name,
            
            assignedTo: primaryAssignee, // Legacy support
            assignees: assigneeIds,      // Multi-assignee support
            assignedByName: 'Sistema',
            
            state: DocState.INITIATED,
            version: '0.0',
            progress: 10,
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
};

initializeStorage();

// --- SERVICES ---

export const HierarchyService = {
  /**
   * Returns the full hierarchy tree based on current documents (which represent the matrix).
   * Structure: Project -> Macro -> Process -> Micro -> Assignees
   */
  getFullHierarchy: async () => {
    const docs = await DocumentService.getAll();
    const tree: any = {};

    docs.forEach(doc => {
      if (!doc.project || !doc.macroprocess || !doc.process || !doc.microprocess) return;

      if (!tree[doc.project]) tree[doc.project] = {};
      if (!tree[doc.project][doc.macroprocess]) tree[doc.project][doc.macroprocess] = {};
      if (!tree[doc.project][doc.macroprocess][doc.process]) tree[doc.project][doc.macroprocess][doc.process] = [];

      // Check if microprocess already added to avoid duplicates
      const existing = tree[doc.project][doc.macroprocess][doc.process].find((m: any) => m.name === doc.microprocess);
      if (!existing) {
        tree[doc.project][doc.macroprocess][doc.process].push({
          name: doc.microprocess,
          docId: doc.id,
          assignees: doc.assignees || []
        });
      }
    });

    return tree;
  },

  /**
   * Returns a hierarchy tree filtered by the user's assignments.
   * Used for "New Document" selectors.
   */
  getUserHierarchy: async (userId: string) => {
    const docs = await DocumentService.getAll();
    const tree: any = {};

    docs.forEach(doc => {
      // Filter: Must be assigned to user OR be the author
      const isAssigned = doc.assignees && doc.assignees.includes(userId);
      const isAuthor = doc.authorId === userId; // Allow author to select their own processes too

      if ((isAssigned || isAuthor) && doc.project && doc.macroprocess && doc.process && doc.microprocess) {
        if (!tree[doc.project]) tree[doc.project] = {};
        if (!tree[doc.project][doc.macroprocess]) tree[doc.project][doc.macroprocess] = {};
        if (!tree[doc.project][doc.macroprocess][doc.process]) tree[doc.project][doc.macroprocess][doc.process] = [];

        const existing = tree[doc.project][doc.macroprocess][doc.process].find((m: string) => m === doc.microprocess);
        if (!existing) {
          tree[doc.project][doc.macroprocess][doc.process].push(doc.microprocess);
        }
      }
    });

    return tree;
  },

  /**
   * Updates the assignment for a specific microprocess (represented by a doc).
   * This mimics "Reassigning" the responsibility for a process.
   */
  updateMatrixAssignment: async (docId: string, newAnalystId: string, adminId: string) => {
    await AssignmentService.assignDocument(docId, newAnalystId, adminId, 'Reasignación desde Matriz Administrativa');
  }
};

export const UserService = {
  getAll: async (): Promise<User[]> => {
    return JSON.parse(localStorage.getItem(STORAGE_KEYS.USERS) || '[]');
  },

  create: async (userData: Omit<User, 'id' | 'avatar'>): Promise<User> => {
    const users = await UserService.getAll();
    if (users.find(u => u.email === userData.email)) {
      throw new Error('El correo ya está registrado.');
    }
    if (userData.nickname && users.find(u => u.nickname === userData.nickname)) {
      throw new Error('El nombre de usuario (nickname) ya está en uso.');
    }

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

    // Validation (simplified)
    if (userData.email && users.find(u => u.email === userData.email && u.id !== id)) {
        throw new Error('El correo ya está registrado por otro usuario.');
    }
    if (userData.nickname && users.find(u => u.nickname === userData.nickname && u.id !== id)) {
        throw new Error('El nickname ya está en uso por otro usuario.');
    }

    const updatedUser = { ...users[index], ...userData };
    // Preserve avatar if not provided (mock logic)
    if (!userData.avatar) {
        updatedUser.avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(updatedUser.name)}&background=random`;
    }

    users[index] = updatedUser;
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
    
    // Update session if self-edit
    const currentSession = AuthService.getCurrentUser();
    if (currentSession && currentSession.id === id) {
        localStorage.setItem(STORAGE_KEYS.SESSION, JSON.stringify(updatedUser));
    }

    return updatedUser;
  },

  delete: async (id: string) => {
    let users = await UserService.getAll();
    // Prevent deleting self (in a real app check current user session)
    users = users.filter(u => u.id !== id);
    localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
  }
};

export const AuthService = {
  login: async (input: string, password?: string): Promise<User> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const users = await UserService.getAll();
    let user: User | undefined;

    // 1. HARDCODED ADMIN CHECK (Requested functionality)
    if (input === 'admin' && password === 'admin') {
      user = users.find(u => u.role === UserRole.ADMIN);
      if (!user) {
         user = MOCK_USERS.find(u => u.role === UserRole.ADMIN);
      }
    } else {
      // 2. Standard Login
      user = users.find(u => 
        u.email === input || 
        u.nickname === input || 
        u.name === input
      );

      if (!user) {
         throw new Error('Usuario no encontrado.');
      }

      const storedPassword = user.password || '123456';
      
      if (password !== storedPassword) {
        throw new Error('Contraseña incorrecta');
      }
    }
    
    if (!user) {
      throw new Error('Error desconocido.');
    }
    
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
    return docs.sort((a: Document, b: Document) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  },

  getById: async (id: string): Promise<Document | null> => {
    const docs = JSON.parse(localStorage.getItem(STORAGE_KEYS.DOCS) || '[]');
    return docs.find((d: Document) => d.id === id) || null;
  },

  create: async (
    title: string, 
    description: string, 
    author: User,
    initialState?: DocState,
    initialVersion?: string,
    initialProgress?: number,
    file?: File,
    hierarchy?: { project: string, macro: string, process: string, micro: string }
  ): Promise<Document> => {
    
    const state = initialState || DocState.INITIATED;
    const version = initialVersion || '0.0';
    const progress = initialProgress !== undefined ? initialProgress : 10;
    
    // Implicit assignment logic for Analyst creating their own doc
    const assigneeIds = author.role === UserRole.ANALYST ? [author.id] : [];

    const newDoc: Document = {
      id: `doc-${Date.now()}`,
      title,
      description,
      authorId: author.id,
      authorName: author.name,
      assignedTo: assigneeIds[0], // Legacy
      assignees: assigneeIds,
      state: state,
      version: version,
      progress: progress,
      files: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      
      // Inject Hierarchy if provided
      project: hierarchy?.project,
      macroprocess: hierarchy?.macro,
      process: hierarchy?.process,
      microprocess: hierarchy?.micro
    };

    if (file) {
        if (file.name.length > 55) {
             throw new Error('El nombre del archivo no puede exceder 55 caracteres.');
        }
        const newFile: DocFile = {
            id: `file-${Date.now()}`,
            name: file.name,
            size: file.size,
            type: file.type,
            url: URL.createObjectURL(file), // Mock blob storage
            uploadedAt: new Date().toISOString()
        };
        newDoc.files.push(newFile);
    }

    const docs = await DocumentService.getAll();
    docs.push(newDoc);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
    
    await HistoryService.log(newDoc.id, author, 'Creación', state, state, 'Documento creado e iniciado automáticamente.');
    
    return newDoc;
  },

  delete: async (id: string) => {
    let docs = await DocumentService.getAll();
    docs = docs.filter(d => d.id !== id);
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
  },

  uploadFile: async (docId: string, file: File, user: User): Promise<DocFile> => {
    if (file.name.length > 55) {
      throw new Error('El nombre del archivo no puede exceder 55 caracteres.');
    }

    const newFile: DocFile = {
      id: `file-${Date.now()}`,
      name: file.name,
      size: file.size,
      type: file.type,
      url: URL.createObjectURL(file), // Mock blob storage
      uploadedAt: new Date().toISOString()
    };

    const docs = await DocumentService.getAll();
    const docIndex = docs.findIndex(d => d.id === docId);
    if (docIndex === -1) throw new Error('Documento no encontrado');

    docs[docIndex].files.push(newFile);
    docs[docIndex].updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));
    
    return newFile;
  },

  transitionState: async (docId: string, user: User, action: 'ADVANCE' | 'REJECT' | 'APPROVE', comment: string): Promise<Document> => {
    const docs = await DocumentService.getAll();
    const docIndex = docs.findIndex(d => d.id === docId);
    if (docIndex === -1) throw new Error('Documento no encontrado');

    const doc = docs[docIndex];
    const previousState = doc.state;
    let newState = doc.state;
    let newVersion = doc.version;
    
    switch (action) {
      case 'ADVANCE':
        if (doc.state === DocState.INITIATED) {
           newState = DocState.IN_PROCESS;
           newVersion = '0.1';
        } else if (doc.state === DocState.IN_PROCESS) {
           const currentDecimal = parseInt(doc.version.split('.')[1]);
           newVersion = `0.${currentDecimal + 1}`;
        }
        break;

      case 'APPROVE':
        if (doc.state === DocState.IN_PROCESS && user.role === UserRole.ANALYST) {
           newState = DocState.INTERNAL_REVIEW;
           newVersion = `v${doc.version}`;
        } else if (doc.state === DocState.INTERNAL_REVIEW && user.role === UserRole.COORDINATOR) {
           newState = DocState.SENT_TO_REFERENT;
           newVersion = 'v1.0';
        } else if (doc.state === DocState.SENT_TO_REFERENT && user.role === UserRole.COORDINATOR) {
            newState = DocState.SENT_TO_CONTROL;
            newVersion = `v${doc.version.substring(1)}AR`;
        } else if (doc.state === DocState.SENT_TO_CONTROL && user.role === UserRole.ADMIN) {
            newState = DocState.APPROVED;
            newVersion = doc.version.replace('AR', 'ACG');
        }
        break;
      
      case 'REJECT':
        if (previousState === DocState.INTERNAL_REVIEW) {
           newState = DocState.IN_PROCESS;
           comment = `RECHAZADO: ${comment}`;
        } else {
           newState = DocState.REJECTED;
        }
        break;
    }

    const progress = STATE_CONFIG[newState]?.progress || doc.progress;

    docs[docIndex] = {
      ...doc,
      state: newState,
      version: newVersion,
      progress: progress,
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
      id: `hist-${Date.now()}`,
      documentId: docId,
      userId: user.id,
      userName: user.name,
      action,
      previousState: prev,
      newState: next,
      comment,
      timestamp: new Date().toISOString()
    };
    history.push(newEntry);
    localStorage.setItem(STORAGE_KEYS.HISTORY, JSON.stringify(history));
  }
};

export const AssignmentService = {
  // Get all documents that don't have an assignee
  getUnassignedDocs: async (): Promise<Document[]> => {
    const docs = await DocumentService.getAll();
    // Check if assignees array is empty
    return docs.filter(d => (!d.assignees || d.assignees.length === 0) && d.state !== DocState.APPROVED && d.state !== DocState.REJECTED);
  },

  // Get current workload for all analysts
  getWorkload: async (): Promise<AnalystWorkload[]> => {
    const users = await UserService.getAll();
    const analysts = users.filter(u => u.role === UserRole.ANALYST);
    const docs = await DocumentService.getAll();
    const assignments = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS) || '[]');

    return analysts.map(analyst => {
      // Check if analyst ID is in the assignees list
      const activeDocs = docs.filter(d => d.assignees && d.assignees.includes(analyst.id) && d.state !== DocState.APPROVED && d.state !== DocState.REJECTED).length;
      const completedDocs = docs.filter(d => d.assignees && d.assignees.includes(analyst.id) && d.state === DocState.APPROVED).length;
      
      // Find last assignment date
      const lastAssign = assignments
        .filter((a: AssignmentLog) => a.analystId === analyst.id)
        .sort((a: any, b: any) => new Date(b.assignedAt).getTime() - new Date(a.assignedAt).getTime())[0];

      return {
        analyst,
        activeDocs,
        completedDocs,
        lastAssignment: lastAssign ? lastAssign.assignedAt : undefined
      };
    });
  },

  // Assign a document manually
  assignDocument: async (docId: string, analystId: string, adminId: string, reason?: string) => {
    const docs = await DocumentService.getAll();
    const docIndex = docs.findIndex(d => d.id === docId);
    if (docIndex === -1) throw new Error('Documento no encontrado');

    const users = await UserService.getAll();
    const analyst = users.find(u => u.id === analystId);
    const admin = users.find(u => u.id === adminId);
    
    if (!analyst) throw new Error('Analista no encontrado');

    // Update Document - Replace or Add? Assuming manual assignment via this method sets/overrides the primary
    // For now, let's append if not exists
    const currentAssignees = docs[docIndex].assignees || [];
    if (!currentAssignees.includes(analystId)) {
        currentAssignees.push(analystId);
    }

    docs[docIndex].assignedTo = analystId; // Update legacy pointer to newest
    docs[docIndex].assignees = currentAssignees;
    docs[docIndex].assignedByName = admin?.name || 'Administrador';
    docs[docIndex].updatedAt = new Date().toISOString();
    
    localStorage.setItem(STORAGE_KEYS.DOCS, JSON.stringify(docs));

    // Log Assignment
    const assignments = JSON.parse(localStorage.getItem(STORAGE_KEYS.ASSIGNMENTS) || '[]');
    const newAssignment: AssignmentLog = {
      id: `assign-${Date.now()}`,
      documentId: docId,
      analystId,
      assignedBy: adminId,
      assignedAt: new Date().toISOString(),
      reason
    };
    assignments.push(newAssignment);
    localStorage.setItem(STORAGE_KEYS.ASSIGNMENTS, JSON.stringify(assignments));

    // Add to history
    await HistoryService.log(docId, admin!, 'Asignación', docs[docIndex].state, docs[docIndex].state, `Asignado a ${analyst.name}. Motivo: ${reason || 'Asignación manual'}`);
  },

  // Auto-assign suggestions based on least workload
  suggestAnalyst: async (): Promise<User | null> => {
    const workload = await AssignmentService.getWorkload();
    if (workload.length === 0) return null;
    
    // Sort by active docs (ascending)
    workload.sort((a, b) => a.activeDocs - b.activeDocs);
    
    return workload[0].analyst;
  }
};