export type SeverityLevel = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
export type EnforcementType = 'BLOCKING' | 'WARNING' | 'INFO';

export interface ProcessStage {
  id: string;
  number: number;
  name: string;
  description: string;
  responsibleRole: string;
  substeps: string[];
  criticalControlPoints: string[];
  estimatedTimeMinutes: number;
  failureImpact: SeverityLevel | string;
}

export interface GovernanceRule {
  id: string;
  code: string;
  title: string;
  description: string;
  severity: SeverityLevel;
  enforcementType: EnforcementType;
}

export interface ProcessRole {
  id: string;
  name: string;
  responsibilities: string[];
}

export interface ProcessIntegration {
  id: string;
  systemName: string;
  protocol: string;
  endpoint: string;
  authentication: string;
}

export interface WordProcessMeta {
  code?: string;
  name?: string;
  version?: string;
  owner?: string;
  type?: string;
}

export interface ProcessKpi {
  name: string;
  metric: string;
  target: string;
  frequency: string;
}

export interface SipocData {
  suppliers: string[];
  inputs: string[];
  processName: string;
  outputs: string[];
  customers: string[];
}

export interface WordProcessStep {
  id: string;
  name: string;
  roleId: string;
  description: string;
  inputs: string[];
  outputs: string[];
  duration: string;
  rules: string[];
}

export interface WordBusinessRule {
  id: string;
  description: string;
  type: string;
}

export interface WordProcessRole {
  id: string;
  title: string;
  responsibility: string;
}

export interface ParsedWordProcess {
  id: string;
  meta: WordProcessMeta;
  purpose: string;
  scope: string;
  kpis: ProcessKpi[];
  sipoc: SipocData;
  roles: WordProcessRole[];
  steps: WordProcessStep[];
  businessRules: WordBusinessRule[];
}

export interface UpProcess {
  id: string;
  name: string;
  description: string;
  version: string;
  lastUpdated: string;
  project?: string;
  macroprocess?: string;
  process?: string;
  microprocess?: string;
  docType?: string;
  docState?: string;
  docAuthor?: string;
  docComment?: string;
  docFileUrl?: string;
  docFileName?: string;
  stages: ProcessStage[];
  governanceRules: GovernanceRule[];
  roles: ProcessRole[];
  integrations: ProcessIntegration[];
  asIsContext?: string;
  toBeOptimizations?: string;
  fceFactors?: string[];
  suppliers?: string;
  customers?: string;
  glossary?: Array<{ term: string; definition: string }>;
  subprocesses?: Array<{ id?: string; code?: string; name: string; activities: string[] }>;
  sipocRows?: Array<{ supplier: string; input: string; processName: string; output: string; customer: string }>;
  // Word extraction fields
  meta?: WordProcessMeta;
  purpose?: string;
  scope?: string;
  kpis?: ProcessKpi[];
  sipoc?: SipocData;
  wordRoles?: WordProcessRole[];
  steps?: WordProcessStep[];
  businessRules?: WordBusinessRule[];
}

export interface SavedProcessEntry {
  id: string; // Document ID prefixed with proc_
  savedAt: string; // "24/07/2026, 09:30:00"
  process: UpProcess;
}

export interface SimulationLog {
  id: string;
  timestamp: string;
  stageNumber: number;
  stageName: string;
  role: string;
  status: 'SUCCESS' | 'WARNING' | 'FAILURE' | 'SKIPPED';
  durationSeconds: number;
  message: string;
  ruleViolated?: string;
}

export interface SimulationMetrics {
  totalExecutionTimeSeconds: number;
  stagesCompleted: number;
  deviationsDetected: number;
  criticalViolations: number;
  complianceRate: number; // percentage 0-100
}

export type CodeLang = 'typescript' | 'python' | 'csharp' | 'java' | 'curl';
