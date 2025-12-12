
export enum UserRole {
  ADMIN = 'ADMIN',
  COORDINATOR = 'COORDINATOR',
  ANALYST = 'ANALYST',
}

export interface User {
  id: string;
  email: string;
  name: string;
  nickname?: string; // Short username
  role: UserRole;
  avatar: string;
  organization: string;
  password?: string; // Added for mock auth
}

export enum DocState {
  INITIATED = 'INITIATED',               // 0.0 - 10%
  IN_PROCESS = 'IN_PROCESS',             // 0.n - 30%
  INTERNAL_REVIEW = 'INTERNAL_REVIEW',   // v0.n - 60%
  SENT_TO_REFERENT = 'SENT_TO_REFERENT', // v1.n - 80%
  REFERENT_REVIEW = 'REFERENT_REVIEW',   // v1.n.i - N/A
  SENT_TO_CONTROL = 'SENT_TO_CONTROL',   // v1.nAR - 90%
  CONTROL_REVIEW = 'CONTROL_REVIEW',     // v1.n.iAR - N/A
  APPROVED = 'APPROVED',                 // v1.nACG - 100%
  REJECTED = 'REJECTED'                  // Workflow Loopback
}

export type DocType = 'AS IS' | 'FCE' | 'PM' | 'TO BE';

export interface DocFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string; // Blob URL in this mock
  uploadedAt: string;
}

export interface DocHistory {
  id: string;
  documentId: string;
  userId: string;
  userName: string;
  action: string;
  previousState: DocState;
  newState: DocState;
  comment: string;
  timestamp: string;
}

// New Interface for Inbox System
export interface Notification {
  id: string;
  userId: string; // Recipient
  documentId: string;
  type: 'ASSIGNMENT' | 'APPROVAL' | 'REJECTION' | 'COMMENT';
  title: string;
  message: string;
  isRead: boolean;
  timestamp: string;
  actorName: string; // Who triggered it
}

export interface Document {
  id: string;
  title: string;
  description: string;
  
  // Hierarchy Metadata
  project?: string;
  macroprocess?: string;
  process?: string;
  microprocess?: string;
  docType?: DocType; // New field

  authorId: string;
  authorName: string;
  
  assignedTo?: string; // Legacy/Primary Display
  assignees: string[]; // Multi-user assignment support
  assignedByName?: string; // Name of Admin who assigned
  
  state: DocState;
  version: string;
  progress: number;
  hasPendingRequest?: boolean; // Flag for Buffer visibility

  files: DocFile[];
  createdAt: string;
  updatedAt: string;
}

// Assignment Module Types
export interface AssignmentLog {
  id: string;
  documentId: string;
  analystId: string;
  assignedBy: string; // Admin ID
  assignedAt: string;
  reason?: string;
}

export interface AnalystWorkload {
  analyst: User;
  activeDocs: number;
  completedDocs: number; // Approved
  lastAssignment?: string;
}

export interface ParsedFilenameResult {
  valido: boolean;
  proyecto?: 'HPC' | 'HSR';
  microproceso?: string;
  tipo?: string;
  nomenclatura?: string;
  estado?: string;
  porcentaje?: number;
  explicacion?: string;
  errores: string[];
}

// Hierarchy Types for strict typing
export interface UserHierarchy {
  [project: string]: {
    [macro: string]: {
      [process: string]: string[]; // Array of microprocess names
    };
  };
}

export interface ProcessNode {
  name: string;
  docId: string; // This acts as the matrix ID
  assignees: string[];
  requiredTypes: DocType[]; // List of types defined in initial load
  active?: boolean; // Soft Delete support
}

export interface FullHierarchy {
  [project: string]: {
    [macro: string]: {
      [process: string]: ProcessNode[]; // Array of nodes with metadata
    };
  };
}

// Response for mock API
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}
