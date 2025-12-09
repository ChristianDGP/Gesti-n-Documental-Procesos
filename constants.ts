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
    id: 'admin',
    email: 'admin@empresa.com',
    name: 'Administrador General',
    nickname: 'admin',
    role: UserRole.ADMIN,
    avatar: 'https://ui-avatars.com/api/?name=Admin&background=333&color=fff',
    organization: 'Dirección',
    password: 'admin'
  },
  {
    id: 'u-arebolledo',
    email: 'arebolledo@empresa.com',
    name: 'Alejandra Rebolledo',
    nickname: 'arebolledo',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Alejandra+Rebolledo&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  },
  {
    id: 'u-aorellana',
    email: 'aorellana@empresa.com',
    name: 'Andrea Orellana',
    nickname: 'aorellana',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Andrea+Orellana&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  },
  {
    id: 'u-bsiebold',
    email: 'bsiebold@empresa.com',
    name: 'Barbara Siebold',
    nickname: 'bsiebold',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Barbara+Siebold&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  },
  {
    id: 'u-cvalenzuela',
    email: 'cvalenzuela@empresa.com',
    name: 'Carolina Valenzuela',
    nickname: 'cvalenzuela',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Carolina+Valenzuela&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  },
  {
    id: 'u-caraya',
    email: 'caraya@empresa.com',
    name: 'Christian Araya',
    nickname: 'caraya',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Christian+Araya&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  },
  {
    id: 'u-csalvo',
    email: 'csalvo@empresa.com',
    name: 'Christian Salvo',
    nickname: 'csalvo',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Christian+Salvo&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  },
  {
    id: 'u-jcalquin',
    email: 'jcalquin@empresa.com',
    name: 'Javiera Calquin',
    nickname: 'jcalquin',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Javiera+Calquin&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  },
  {
    id: 'u-mcofre',
    email: 'mcofre@empresa.com',
    name: 'Maximiliano Cofre',
    nickname: 'mcofre',
    role: UserRole.ANALYST,
    avatar: 'https://ui-avatars.com/api/?name=Maximiliano+Cofre&background=random',
    organization: 'Procesos',
    password: 'dgp2026'
  }
];