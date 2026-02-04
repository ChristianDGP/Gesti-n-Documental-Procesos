
export enum UserRole {
  ADMIN = 'ADMIN',
  COORDINATOR = 'COORDINATOR',
  ANALYST = 'ANALYST',
  GUEST = 'GUEST',
}

export interface User {
  id: string;
  email: string;
  name: string;
  nickname?: string;
  role: UserRole;
  avatar: string;
  organization: string;
  password?: string;
  active?: boolean;
  canAccessReports?: boolean;
  canAccessReferents?: boolean;
  canAccessGantt?: boolean;
}

export interface Referent {
  id: string;
  name: string;
  email: string;
  specialty: string;
  organization: string;
}

export enum DocState {
  NOT_STARTED = 'NOT_STARTED',
  INITIATED = 'INITIATED',
  IN_PROCESS = 'IN_PROCESS',
  INTERNAL_REVIEW = 'INTERNAL_REVIEW',
  SENT_TO_REFERENT = 'SENT_TO_REFERENT',
  REFERENT_REVIEW = 'REFERENT_REVIEW',
  SENT_TO_CONTROL = 'SENT_TO_CONTROL',
  CONTROL_REVIEW = 'CONTROL_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export type DocType = 'AS IS' | 'FCE' | 'PM' | 'TO BE';

export interface DocFile {
  id: string;
  name: string;
  size: number;
  type: string;
  url: string;
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
  version?: string;
  comment: string;
  timestamp: string;
}

export interface Notification {
  id: string;
  userId: string;
  documentId: string;
  type: 'ASSIGNMENT' | 'APPROVAL' | 'REJECTION' | 'COMMENT' | 'UPLOAD';
  title: string;
  message: string;
  isRead: boolean;
  timestamp: string;
  actorName: string;
}

export interface Document {
  id: string;
  title: string;
  description: string;
  project?: string;
  macroprocess?: string;
  process?: string;
  microprocess?: string;
  docType?: DocType;
  authorId: string;
  authorName: string;
  assignedTo?: string;
  assignees: string[];
  assignedByName?: string;
  state: DocState;
  version: string;
  progress: number;
  hasPendingRequest?: boolean;
  files: DocFile[];
  createdAt: string;
  updatedAt: string;
  expectedEndDate?: string;
}

export interface ProcessNode {
  name: string;
  docId: string;
  assignees: string[];
  referentIds?: string[];
  requiredTypes: DocType[];
  active?: boolean;
}

export interface FullHierarchy {
  [project: string]: {
    [macro: string]: {
      [process: string]: ProcessNode[];
    };
  };
}

export interface UserHierarchy {
  [project: string]: {
    [macro: string]: {
      [process: string]: string[];
    };
  };
}

export interface ParsedFilenameResult {
  valido: boolean;
  errores: string[];
  proyecto?: 'HPC' | 'HSR';
  microproceso?: string;
  tipo?: string;
  nomenclatura?: string;
  estado?: string;
  porcentaje?: number;
}
