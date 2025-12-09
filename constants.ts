import { DocState, UserRole } from './types';

// Maps the business rules to UI properties
export const STATE_CONFIG: Record<DocState, { label: string; color: string; progress: number }> = {
  [DocState.INITIATED]: { label: 'Iniciado (0.0)', color: 'bg-gray-100 text-gray-800', progress: 10 },
  [DocState.IN_PROCESS]: { label: 'En Proceso (0.n)', color: 'bg-blue-100 text-blue-800', progress: 30 },
  [DocState.INTERNAL_REVIEW]: { label: 'Revisión Interna (v0.n)', color: 'bg-yellow-100 text-yellow-800', progress: 60 },
  [DocState.SENT_TO_REFERENT]: { label: 'Enviado a Referente (v1.n)', color: 'bg-purple-100 text-purple-800', progress: 80 },
  [DocState.REFERENT_REVIEW]: { label: 'Revisión Referente (v1.n.i)', color: 'bg-indigo-100 text-indigo-800', progress: 80 },
  [DocState.SENT_TO_CONTROL]: { label: 'Control de Gestión (v1.nAR)', color: 'bg-orange-100 text-orange-800', progress: 90 },
  [DocState.CONTROL_REVIEW]: { label: 'Revisión Control (v1.n.iAR)', color: 'bg-pink-100 text-pink-800', progress: 90 },
  [DocState.APPROVED]: { label: 'Aprobado Final (v1.nACG)', color: 'bg-green-100 text-green-800', progress: 100 },
  [DocState.REJECTED]: { label: 'Rechazado', color: 'bg-red-100 text-red-800', progress: 0 },
};

// Mock Users for Simulation
export const MOCK_USERS = [
  {
    id: 'u1',
    email: 'ana.analista@empresa.com',
    name: 'Ana Analista',
    nickname: 'ana',
    role: UserRole.ANALYST,
    avatar: 'https://picsum.photos/id/101/200/200',
    organization: 'Finanzas',
    password: '123456'
  },
  {
    id: 'u2',
    email: 'carlos.coordinador@empresa.com',
    name: 'Carlos Coordinador',
    nickname: 'carlos',
    role: UserRole.COORDINATOR,
    avatar: 'https://picsum.photos/id/102/200/200',
    organization: 'Finanzas',
    password: '123456'
  },
  {
    id: 'u3',
    email: 'admin@empresa.com',
    name: 'Admin General',
    nickname: 'admin',
    role: UserRole.ADMIN,
    avatar: 'https://picsum.photos/id/103/200/200',
    organization: 'IT',
    password: 'admin'
  }
];