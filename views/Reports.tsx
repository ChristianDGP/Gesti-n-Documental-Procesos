import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService, HistoryService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, DocType, UserRole, DocHistory } from '../types';
import { STATE_CONFIG } from '../constants';
import AdminBI from './AdminBI';
import { 
    PieChart, Pie, Cell, BarChart, Bar, LabelList, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
    Users, CheckCircle, Clock, FileText, Filter, LayoutDashboard, Briefcase, Loader2, ArrowRight, Target, TrendingUp, AlertTriangle, Activity, ShieldAlert, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, BarChart2, TableProperties, FileSpreadsheet, ZoomIn, ZoomOut, Layers, PlayCircle, FastForward, Info, ShieldCheck, X, FolderTree, Database, Network, ChevronDown, UserCheck
} from 'lucide-react';

interface Props {
    user: User;
}

interface ReportDoc extends Document {
    isVirtual?: boolean;
}

interface StuckDoc extends ReportDoc {
    daysStuck: number;
}

const STATE_COLOR_MAP: Record<string, string> = {
    'No Iniciado': '#94a3b8',
    'En Proceso': '#3b82f6',
    'Referente': '#a855f7',
    'Control': '#f97316',
    'Terminados': '#22c55e'
};

const TYPE_COLORS: Record<string, string> = {
    'AS IS': '#3b82f6',
    'FCE': '#f87171',
    'PM': '#facc15',
    'TO BE': '#22c55e'
};

const STUCK_ITEMS_PER_PAGE = 6;

type ChartScale = 'ANNUAL' | 'MONTHLY' | 'WEEKLY';

const Reports: React.FC<Props> = ({ user }) => {
    const navigate = useNavigate();
    const isAnalyst = user.role === UserRole.ANALYST;

    const [realDocs, setRealDocs] = useState<Document[]>([]);
    const [history, setHistory] = useState<DocHistory[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy>({});

    const isDocTypeRequired = (project: string, macro: string, process: string, micro: string, type: DocType): boolean => {
        const normProj = normalizeHeader(project);
        const normMacro = normalizeHeader(macro);
        const normProc = normalizeHeader(process);
        const normMicro = normalizeHeader(micro);

        const projKey = Object.keys(hierarchy).find(k => normalizeHeader(k) === normProj);
        if (!projKey || !hierarchy[projKey]) return true;

        const macroKey = Object.keys(hierarchy[projKey]).find(k => normalizeHeader(k) === normMacro);
        if (!macroKey || !hierarchy[projKey][macroKey]) return true;

        const procKey = Object.keys(hierarchy[projKey][macroKey]).find(k => normalizeHeader(k) === normProc);
        if (!procKey || !hierarchy[projKey][macroKey][procKey]) return true;

        const nodes = hierarchy[projKey][macroKey][procKey];
        const node = nodes.find(n => normalizeHeader(n.name) === normMicro);
        if (!node) return true;
        if (node.active === false) return false;
        const reqs = node.requiredTypes?.length ? node.requiredTypes : ['AS IS', 'FCE', 'PM', 'TO BE'];
        return reqs.includes(type);
    };
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    
    const location = useLocation();
    
    const [activeTab, setActiveTab] = useState<'REPORTS' | 'SUMMARY' | 'CLOSURE' | 'MAP' | 'BI'>(() => {
        if (location.state?.tab === 'BI' && ((user.role as any) === UserRole.ADMIN || user.canAccessBIQueryBuilder)) return 'BI';
        if (user.canAccessReportGestion !== false) return 'REPORTS';
        if (user.canAccessReportContinuity !== false) return 'SUMMARY';
        if (user.canAccessReportMonthly !== false) return 'CLOSURE';
        if ((user.role as any) === UserRole.ADMIN || user.canAccessReportCoverage) return 'MAP';
        if ((user.role as any) === UserRole.ADMIN || user.canAccessBIQueryBuilder) return 'BI';
        return 'REPORTS';
    });
    const [chartScale, setChartScale] = useState<ChartScale>('MONTHLY');
    const [cfdRange, setCfdRange] = useState<3 | 6 | 12>(6);
    const [selectedChartDocType, setSelectedChartDocType] = useState<'AS IS' | 'FCE' | 'PM' | 'TO BE'>('AS IS');

    // Redirección si no tiene acceso a la pestaña activa (por si acaso)
    useEffect(() => {
        const isAdmin = user.role === UserRole.ADMIN;
        if (activeTab === 'REPORTS' && !isAdmin && user.canAccessReportGestion === false) {
             if (isAdmin || user.canAccessReportContinuity !== false) setActiveTab('SUMMARY');
             else if (isAdmin || user.canAccessReportMonthly !== false) setActiveTab('CLOSURE');
             else if (isAdmin || user.canAccessReportCoverage) setActiveTab('MAP');
             else if (isAdmin || user.canAccessBIQueryBuilder) setActiveTab('BI');
        }
        if (activeTab === 'SUMMARY' && !isAdmin && user.canAccessReportContinuity === false) {
             if (isAdmin || user.canAccessReportGestion !== false) setActiveTab('REPORTS');
             else if (isAdmin || user.canAccessReportMonthly !== false) setActiveTab('CLOSURE');
             else if (isAdmin || user.canAccessReportCoverage) setActiveTab('MAP');
             else if (isAdmin || user.canAccessBIQueryBuilder) setActiveTab('BI');
        }
        if (activeTab === 'CLOSURE' && !isAdmin && user.canAccessReportMonthly === false) {
             if (isAdmin || user.canAccessReportGestion !== false) setActiveTab('REPORTS');
             else if (isAdmin || user.canAccessReportContinuity !== false) setActiveTab('SUMMARY');
             else if (isAdmin || user.canAccessReportCoverage) setActiveTab('MAP');
             else if (isAdmin || user.canAccessBIQueryBuilder) setActiveTab('BI');
        }
        if (activeTab === 'MAP' && !isAdmin && !user.canAccessReportCoverage) {
             if (isAdmin || user.canAccessReportGestion !== false) setActiveTab('REPORTS');
             else if (isAdmin || user.canAccessReportContinuity !== false) setActiveTab('SUMMARY');
             else if (isAdmin || user.canAccessReportMonthly !== false) setActiveTab('CLOSURE');
             else if (isAdmin || user.canAccessBIQueryBuilder) setActiveTab('BI');
        }
        if (activeTab === 'BI' && !isAdmin && !user.canAccessBIQueryBuilder) {
             if (isAdmin || user.canAccessReportGestion !== false) setActiveTab('REPORTS');
             else if (isAdmin || user.canAccessReportContinuity !== false) setActiveTab('SUMMARY');
             else if (isAdmin || user.canAccessReportMonthly !== false) setActiveTab('CLOSURE');
             else if (isAdmin || user.canAccessReportCoverage) setActiveTab('MAP');
        }
    }, [user, activeTab]);

    const [filterProject, setFilterProject] = useState('');
    const [filterAnalyst, setFilterAnalyst] = useState(isAnalyst ? user.id : '');
    const [activeType, setActiveType] = useState<string | null>(null);
    const [mapDocTypeFilter, setMapDocTypeFilter] = useState<'TODOS' | 'AS IS' | 'FCE' | 'PM' | 'TO BE'>('TODOS');
    const [mapSubTab, setMapSubTab] = useState<'DIAGRAM' | 'REPORTS'>('DIAGRAM');

    const [macroClassifications, setMacroClassifications] = useState<Record<string, 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE'>>({});

    const getMacroCategory = (macroName: string): 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE' => {
        if (macroClassifications[macroName]) {
            return macroClassifications[macroName];
        }
        const name = macroName.toLowerCase();
        const STRATEGIC_KEYWORDS = ["relaciones", "publicas", "proyectos", "agenda", "estrategia", "calidad", "planificacion", "direccion", "informes", "mesa de ayuda", "reuniones", "coordinacion", "convenios"];
        const SUPPORT_KEYWORDS = ["mantenimiento", "equipos", "infraestructura", "roperia", "remuneracion", "compras", "bodegas", "remuneraciones", "capacitacion", "contratacion", "trato laboral", "beneficios", "liquidacion", "recaudacion", "activos", "finanzas", "contabilidad", "auditoria", "reportes", "reclutamiento", "personal", "recurs", "humano", "ti", "informatica", "soporte", "tecnico"];
        
        if (STRATEGIC_KEYWORDS.some(key => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(key))) {
            return 'ESTRATEGICO';
        }
        if (SUPPORT_KEYWORDS.some(key => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(key))) {
            return 'SOPORTE';
        }
        return 'OPERATIVO';
    };

    const handleUpdateMacroCategory = async (macroName: string, category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE') => {
        try {
            await HierarchyService.saveMacroClassification(macroName, category);
            setMacroClassifications(prev => ({ ...prev, [macroName]: category }));
        } catch (e) {
            console.error("Error setting macro classification", e);
            alert("Error al guardar la clasificación.");
        }
    };

    const [coverageSearch, setCoverageSearch] = useState('');
    const [coveragePage, setCoveragePage] = useState(1);

    const [activeMapProject, setActiveMapProject] = useState<string>('HPC');

    const [expandedMacros, setExpandedMacros] = useState<Record<string, boolean>>({});
    const [expandedProcesses, setExpandedProcesses] = useState<Record<string, boolean>>({});
    const [expandedMicroStateMacros, setExpandedMicroStateMacros] = useState<Record<string, boolean>>({});
    const [expandedMicroStateProcesses, setExpandedMicroStateProcesses] = useState<Record<string, boolean>>({});
    const [expandedThreeMacros, setExpandedThreeMacros] = useState<Record<string, boolean>>({});
    const [expandedThreeProcesses, setExpandedThreeProcesses] = useState<Record<string, boolean>>({});
    const [expandedPendingCompletedMacros, setExpandedPendingCompletedMacros] = useState<Record<string, boolean>>({});
    const [expandedPendingCompletedProcesses, setExpandedPendingCompletedProcesses] = useState<Record<string, boolean>>({});
    const [expandedProgressPercentMacros, setExpandedProgressPercentMacros] = useState<Record<string, boolean>>({});
    const [expandedProgressPercentProcesses, setExpandedProgressPercentProcesses] = useState<Record<string, boolean>>({});
    const [expandedFlowPhasesMacros, setExpandedFlowPhasesMacros] = useState<Record<string, boolean>>({});
    const [expandedFlowPhasesProcesses, setExpandedFlowPhasesProcesses] = useState<Record<string, boolean>>({});

    const [microDrillDown, setMicroDrillDown] = useState<{ title: string, color: string, items: {name: string, project: string, ids: string[]}[] } | null>(null);
    const [selectedMacroDetail, setSelectedMacroDetail] = useState<any | null>(null);

    const [closureMonth, setClosureMonth] = useState(() => {
        const d = new Date();
        const startLimit = new Date(2025, 11, 1);
        const selected = d > startLimit ? d : startLimit;
        return `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}`;
    });
    const [closurePage, setClosurePage] = useState(1);
    const [stuckPage, setStuckPage] = useState(1);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [d, u, h, hist, classif] = await Promise.all([
                DocumentService.getAll(),
                UserService.getAll(),
                HierarchyService.getFullHierarchy(),
                HistoryService.getAll(),
                HierarchyService.getMacroClassifications()
            ]);
            setRealDocs(d);
            setUsers(u);
            setHierarchy(h);
            setHistory(hist);
            setMacroClassifications(classif);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const unifiedData = useMemo(() => {
        if (Object.keys(hierarchy).length === 0) return [];
        const unifiedList: ReportDoc[] = [];
        const realDocMap = new Map<string, Document>();
        
        realDocs.forEach(doc => {
            if (doc.project && (doc.microprocess || doc.title)) {
                const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
                const docType = doc.docType || 'AS IS';
                const key = `${normalizeHeader(doc.project)}|${normalizeHeader(microName)}|${normalizeHeader(docType)}`;
                
                const existing = realDocMap.get(key);
                if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                    realDocMap.set(key, { ...doc, microprocess: microName, docType: docType as DocType });
                }
            }
        });

        Object.keys(hierarchy).forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    hierarchy[proj][macro][proc].forEach(node => {
                        if (node.active === false) return;
                        const requiredTypes = node.requiredTypes?.length ? node.requiredTypes : ['AS IS', 'FCE', 'PM', 'TO BE'];
                        requiredTypes.forEach(type => {
                            const key = `${normalizeHeader(proj)}|${normalizeHeader(node.name)}|${normalizeHeader(type)}`;
                            if (realDocMap.has(key)) {
                                const realDoc = realDocMap.get(key)!;
                                unifiedList.push({ 
                                    ...realDoc, 
                                    macroprocess: macro, 
                                    process: proc, 
                                    project: proj, 
                                    assignees: (node.assignees && node.assignees.length > 0) ? node.assignees : (realDoc.assignees || []),
                                    isVirtual: false 
                                });
                            } else {
                                unifiedList.push({ 
                                    id: `virtual-${key}`, 
                                    title: `${node.name} - ${type}`, 
                                    project: proj, 
                                    macroprocess: macro,
                                    process: proc,
                                    microprocess: node.name, 
                                    docType: type as DocType, 
                                    state: DocState.NOT_STARTED, 
                                    updatedAt: new Date(0).toISOString(), 
                                    assignees: node.assignees || [], 
                                    isVirtual: true 
                                } as any);
                            }
                        });
                    });
                });
            });
        });
        return unifiedList;
    }, [realDocs, hierarchy]);

    const filteredDocs = useMemo(() => {
        let docs = unifiedData;
        if (filterProject) docs = docs.filter(d => d.project === filterProject);
        if (filterAnalyst) docs = docs.filter(d => d.assignees?.includes(filterAnalyst));
        return docs;
    }, [unifiedData, filterProject, filterAnalyst]);

    const microStats = useMemo(() => {
        const groups: Record<string, { project: string, name: string, states: DocState[], ids: string[] }> = {};
        
        filteredDocs.forEach(d => {
            const key = `${d.project}|${d.microprocess}`;
            if (!groups[key]) groups[key] = { project: d.project!, name: d.microprocess!, states: [], ids: [] };
            groups[key].states.push(d.state);
            groups[key].ids.push(d.id);
        });

        const stats = {
            total: [] as {name: string, project: string, ids: string[]}[],
            notStarted: [] as {name: string, project: string, ids: string[]}[],
            inProcess: [] as {name: string, project: string, ids: string[]}[],
            referent: [] as {name: string, project: string, ids: string[]}[],
            control: [] as {name: string, project: string, ids: string[]}[],
            finished: [] as {name: string, project: string, ids: string[]}[]
        };

        Object.values(groups).forEach(group => {
            const microItem = { name: group.name, project: group.project, ids: group.ids };
            stats.total.push(microItem);
            const allApproved = group.states.length > 0 && group.states.every(s => s === DocState.APPROVED);
            const hasControl = group.states.some(s => [DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(s));
            const hasReferent = group.states.some(s => [DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW].includes(s));
            const hasProgress = group.states.some(s => s !== DocState.NOT_STARTED);

            if (allApproved) stats.finished.push(microItem);
            else if (hasControl) stats.control.push(microItem);
            else if (hasReferent) stats.referent.push(microItem);
            else if (hasProgress) stats.inProcess.push(microItem);
            else stats.notStarted.push(microItem);
        });
        return stats;
    }, [filteredDocs]);

    const kpis = useMemo(() => {
        const now = new Date().getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
        const approved = filteredDocs.filter(d => d.state === DocState.APPROVED);
        const overdueInternal = filteredDocs.filter(d => d.state === DocState.INTERNAL_REVIEW && (now - new Date(d.updatedAt).getTime()) > thirtyDaysMs);
        const overdueReferent = filteredDocs.filter(d => (d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW) && (now - new Date(d.updatedAt).getTime()) > thirtyDaysMs);
        const overdueControl = filteredDocs.filter(d => (d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW) && (now - new Date(d.updatedAt).getTime()) > thirtyDaysMs);

        return { 
            total: filteredDocs.length, 
            totalIds: filteredDocs.map(d => d.id),
            approved: approved.length, 
            approvedIds: approved.map(d => d.id),
            overdueInternalIds: overdueInternal.map(d => d.id),
            overdueReferentIds: overdueReferent.map(d => d.id),
            overdueControlIds: overdueControl.map(d => d.id)
        };
    }, [filteredDocs]);

    const agileFlowStats = useMemo(() => {
        const stats = {
            backlog: { count: 0, ids: [] as string[] },
            development: { count: 0, ids: [] as string[] },
            referent: { count: 0, ids: [] as string[] },
            control: { count: 0, ids: [] as string[] },
            done: { count: 0, ids: [] as string[] }
        };
        filteredDocs.forEach(d => {
            if (d.state === DocState.NOT_STARTED) { stats.backlog.count++; stats.backlog.ids.push(d.id); }
            else if (d.state === DocState.APPROVED) { stats.done.count++; stats.done.ids.push(d.id); }
            else if (d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW) { stats.referent.count++; stats.referent.ids.push(d.id); }
            else if (d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW) { stats.control.count++; stats.control.ids.push(d.id); }
            else { stats.development.count++; stats.development.ids.push(d.id); }
        });
        return stats;
    }, [filteredDocs]);

    const cfdData = useMemo(() => {
        const data: any[] = [];
        const now = new Date();
        const currentMonthIdx = now.getMonth();
        const currentYearIdx = now.getFullYear();
        const historyByDoc: Record<string, DocHistory[]> = {};
        history.forEach(h => { if (!historyByDoc[h.documentId]) historyByDoc[h.documentId] = []; historyByDoc[h.documentId].push(h); });
        for (let i = cfdRange - 1; i >= 0; i--) {
            const targetDate = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthLabel = targetDate.toLocaleString('es-ES', { month: 'short' });
            const isCurrentPeriod = targetDate.getMonth() === currentMonthIdx && targetDate.getFullYear() === currentYearIdx;
            const endOfMonth = new Date(targetDate.getFullYear(), targetDate.getMonth() + 1, 0, 23, 59, 59);
            const endOfMonthISO = endOfMonth.toISOString();
            
            const ids = { 'No Iniciado': [] as string[], 'En Proceso': [] as string[], 'Referente': [] as string[], 'Control': [] as string[], 'Terminados': [] as string[] };
            let noIniciado = 0, enProceso = 0, referente = 0, control = 0, terminado = 0;
            
            filteredDocs.forEach(doc => {
                let stateToCount: DocState = DocState.NOT_STARTED;
                if (isCurrentPeriod) stateToCount = doc.state;
                else if (doc.isVirtual) stateToCount = DocState.NOT_STARTED;
                else {
                    const docHistory = (historyByDoc[doc.id] || []).filter(h => h.timestamp <= endOfMonthISO);
                    if (docHistory.length > 0) { 
                        const latestEntry = docHistory.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0]; 
                        stateToCount = latestEntry.newState; 
                    }
                    else { 
                        const createdDate = new Date(doc.createdAt || doc.updatedAt); 
                        if (createdDate <= endOfMonth) stateToCount = doc.state; 
                        else stateToCount = DocState.NOT_STARTED; 
                    }
                }
                
                if (stateToCount === DocState.APPROVED) { terminado++; ids.Terminados.push(doc.id); }
                else if ([DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(stateToCount)) { control++; ids.Control.push(doc.id); }
                else if ([DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW].includes(stateToCount)) { referente++; ids.Referente.push(doc.id); }
                else if (stateToCount === DocState.NOT_STARTED) { noIniciado++; ids['No Iniciado'].push(doc.id); }
                else { enProceso++; ids['En Proceso'].push(doc.id); }
            });
            
            data.push({ 
                month: monthLabel, 
                'No Iniciado': noIniciado, 
                'En Proceso': enProceso, 
                'Referente': referente, 
                'Control': control, 
                'Terminados': terminado,
                ids
            });
        }
        return data;
    }, [filteredDocs, history, cfdRange]);

    const closureBoardData = useMemo(() => {
        if (!closureMonth || !unifiedData.length) return [];
        const [year, month] = closureMonth.split('-').map(Number);
        const lastDayOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString();
        const historyByDoc: Record<string, DocHistory[]> = {};
        history.forEach(h => { if (!historyByDoc[h.documentId]) historyByDoc[h.documentId] = []; historyByDoc[h.documentId].push(h); });
        const microMap: Record<string, { project: string, macro: string, process: string, micro: string, docs: Record<string, { state: DocState, version: string }> }> = {};
        unifiedData.forEach(d => {
            if (filterProject && d.project !== filterProject) return;
            if (filterAnalyst && !d.assignees?.includes(filterAnalyst)) return;
            const microKey = `${d.project}|${d.macroprocess}|${d.process}|${d.microprocess}`;
            if (!microMap[microKey]) microMap[microKey] = { project: d.project!, macro: d.macroprocess!, process: d.process!, micro: d.microprocess!, docs: {} };
            let stateAtClosure = DocState.NOT_STARTED; let versionAtClosure = '-';
            if (!d.isVirtual) {
                const docHistory = historyByDoc[d.id] || [];
                const lastEntry = docHistory.filter(h => h.timestamp <= lastDayOfMonth).sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
                if (lastEntry) { stateAtClosure = lastEntry.newState; versionAtClosure = lastEntry.version || d.version; } 
                else { const docTimestamp = d.updatedAt ? new Date(d.updatedAt).toISOString() : ''; if (docTimestamp && docTimestamp <= lastDayOfMonth) { stateAtClosure = d.state; versionAtClosure = d.version; } }
            }
            if (d.docType) microMap[microKey].docs[d.docType] = { state: stateAtClosure, version: versionAtClosure };
        });
        return Object.values(microMap).sort((a, b) => a.project.localeCompare(b.project) || a.macro.localeCompare(b.macro) || a.process.localeCompare(b.process) || a.micro.localeCompare(b.micro));
    }, [closureMonth, unifiedData, history, filterProject, filterAnalyst]);

    const closureSummary = useMemo(() => {
        const stats = {
            notStarted: 0,
            inProcess: 0,
            referent: 0,
            control: 0,
            finished: 0
        };
        
        closureBoardData.forEach(item => {
            Object.values(item.docs).forEach(doc => {
                if (doc.state === DocState.NOT_STARTED) stats.notStarted++;
                else if (doc.state === DocState.APPROVED) stats.finished++;
                else if (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW) stats.referent++;
                else if (doc.state === DocState.SENT_TO_CONTROL || doc.state === DocState.CONTROL_REVIEW) stats.control++;
                else stats.inProcess++;
            });
        });
        
        return stats;
    }, [closureBoardData]);

    const coverageAnalytics = useMemo(() => {
        const groups: Record<string, { 
            project: string;
            macroprocess: string;
            process: string;
            microprocess: string;
            docs: Record<string, { state: DocState; version: string; id: string; assignees: string[] }>;
            totalRequired: number;
            totalApproved: number;
            totalInProcess: number;
        }> = {};

        filteredDocs.forEach(d => {
            const key = `${d.project}|${d.macroprocess}|${d.process}|${d.microprocess}`;
            if (!groups[key]) {
                groups[key] = {
                    project: d.project || '',
                    macroprocess: d.macroprocess || '',
                    process: d.process || '',
                    microprocess: d.microprocess || '',
                    docs: {},
                    totalRequired: 0,
                    totalApproved: 0,
                    totalInProcess: 0
                };
            }
            
            const docType = d.docType || 'AS IS';
            groups[key].docs[docType] = {
                state: d.state,
                version: d.version || '1.0',
                id: d.id,
                assignees: d.assignees || []
            };
            
            groups[key].totalRequired++;
            if (d.state === DocState.APPROVED) {
                groups[key].totalApproved++;
            } else if (d.state !== DocState.NOT_STARTED) {
                groups[key].totalInProcess++;
            }
        });

        const list = Object.values(groups).sort((a, b) => 
            a.project.localeCompare(b.project) || 
            a.macroprocess.localeCompare(b.macroprocess) || 
            a.process.localeCompare(b.process) || 
            a.microprocess.localeCompare(b.microprocess)
        );

        let totalMicro = list.length;
        let totalDocsRequired = filteredDocs.length;
        let totalDocsApproved = filteredDocs.filter(d => d.state === DocState.APPROVED).length;
        let totalDocsInProcess = filteredDocs.filter(d => d.state !== DocState.APPROVED && d.state !== DocState.NOT_STARTED).length;
        let totalDocsNotStarted = filteredDocs.filter(d => d.state === DocState.NOT_STARTED).length;

        let microsFullyCovered = 0;
        let microsPartiallyCovered = 0;
        let microsNotStarted = 0;

        list.forEach(g => {
            if (g.totalApproved === g.totalRequired && g.totalRequired > 0) {
                microsFullyCovered++;
            } else if (g.totalApproved > 0 || g.totalInProcess > 0) {
                microsPartiallyCovered++;
            } else {
                microsNotStarted++;
            }
        });

        const macroRollups: Record<string, { macro: string; total: number; approved: number }> = {};
        list.forEach(g => {
            const mKey = `${g.project} - ${g.macroprocess}`;
            if (!macroRollups[mKey]) {
                macroRollups[mKey] = { macro: mKey, total: 0, approved: 0 };
            }
            macroRollups[mKey].total += g.totalRequired;
            macroRollups[mKey].approved += g.totalApproved;
        });

        const macroProgressData = Object.values(macroRollups).map(r => ({
            name: r.macro,
            percentage: r.total > 0 ? Math.round((r.approved / r.total) * 100) : 0,
            approved: r.approved,
            total: r.total
        })).sort((a, b) => b.percentage - a.percentage);

        return {
            list,
            totalMicro,
            totalDocsRequired,
            totalDocsApproved,
            totalDocsInProcess,
            totalDocsNotStarted,
            microsFullyCovered,
            microsPartiallyCovered,
            microsNotStarted,
            macroProgressData
        };
    }, [filteredDocs]);

    const processMapData = useMemo(() => {
        const list = coverageAnalytics.list;
        const macros: Record<string, {
            project: string;
            macroprocess: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            totalRequired: number;
            totalApproved: number;
            totalInProcess: number;
            microprocesses: typeof list;
        }> = {};
        
        list.forEach(g => {
            const mKey = `${g.project} - ${g.macroprocess}`;
            if (!macros[mKey]) {
                macros[mKey] = {
                    project: g.project,
                    macroprocess: g.macroprocess,
                    category: getMacroCategory(g.macroprocess),
                    totalRequired: 0,
                    totalApproved: 0,
                    totalInProcess: 0,
                    microprocesses: []
                };
            }
            
            macros[mKey].totalRequired += g.totalRequired;
            macros[mKey].totalApproved += g.totalApproved;
            macros[mKey].totalInProcess += g.totalInProcess;
            macros[mKey].microprocesses.push(g);
        });
        
        return Object.values(macros);
    }, [coverageAnalytics.list, macroClassifications]);

    const availableMapProjects: string[] = useMemo(() => {
        const projs = Array.from(new Set(unifiedData.map(m => m.project).filter((p): p is string => Boolean(p))))
            .filter(p => p.toUpperCase() !== 'REU');
        if (projs.length === 0) return ['HPC', 'HSR'];
        return projs;
    }, [unifiedData]);

    const mapCoverageAnalytics = useMemo(() => {
        const groups: Record<string, { 
            project: string;
            macroprocess: string;
            process: string;
            microprocess: string;
            docs: Record<string, { state: DocState; version: string; id: string; assignees: string[] }>;
            totalRequired: number;
            totalApproved: number;
            totalInProcess: number;
        }> = {};

        // Filter filteredDocs by docType if mapDocTypeFilter is not 'TODOS'
        const docsToUse = mapDocTypeFilter === 'TODOS' 
            ? filteredDocs 
            : filteredDocs.filter(d => (d.docType || 'AS IS') === mapDocTypeFilter);

        docsToUse.forEach(d => {
            const key = `${d.project}|${d.macroprocess}|${d.process}|${d.microprocess}`;
            if (!groups[key]) {
                groups[key] = {
                    project: d.project || '',
                    macroprocess: d.macroprocess || '',
                    process: d.process || '',
                    microprocess: d.microprocess || '',
                    docs: {},
                    totalRequired: 0,
                    totalApproved: 0,
                    totalInProcess: 0
                };
            }
            
            const docType = d.docType || 'AS IS';
            groups[key].docs[docType] = {
                state: d.state,
                version: d.version || '1.0',
                id: d.id,
                assignees: d.assignees || []
            };
            
            groups[key].totalRequired++;
            if (d.state === DocState.APPROVED) {
                groups[key].totalApproved++;
            } else if (d.state !== DocState.NOT_STARTED) {
                groups[key].totalInProcess++;
            }
        });

        const list = Object.values(groups).sort((a, b) => 
            a.project.localeCompare(b.project) || 
            a.macroprocess.localeCompare(b.macroprocess) || 
            a.process.localeCompare(b.process) || 
            a.microprocess.localeCompare(b.microprocess)
        );

        return { list };
    }, [filteredDocs, mapDocTypeFilter]);

    const filteredProcessMapDataByProject = useMemo(() => {
        // 1. Find all unique macroprocesses in the entire list (regardless of project, but excluding 'REU')
        const uniqueMacrosSet = new Set<string>();
        mapCoverageAnalytics.list.forEach(g => {
            if (g.project && g.project.toUpperCase() === 'REU') return;
            if (g.macroprocess) uniqueMacrosSet.add(g.macroprocess);
        });
        const allUniqueMacroNames = Array.from(uniqueMacrosSet).sort();

        // 2. Map of macroprocess name -> list of unique process names (across all projects, but excluding 'REU')
        const macroToProcessesMap: Record<string, string[]> = {};
        mapCoverageAnalytics.list.forEach(g => {
            if (g.project && g.project.toUpperCase() === 'REU') return;
            if (!g.macroprocess) return;
            if (!macroToProcessesMap[g.macroprocess]) {
                macroToProcessesMap[g.macroprocess] = [];
            }
            const pName = g.process || 'Sin Proceso';
            if (!macroToProcessesMap[g.macroprocess].includes(pName)) {
                macroToProcessesMap[g.macroprocess].push(pName);
            }
        });
        // Sort processes within each macroprocess alphabetically for standardization
        Object.keys(macroToProcessesMap).forEach(key => {
            macroToProcessesMap[key].sort();
        });

        // 3. For each unique macroprocess, build the standardized macro object for activeMapProject
        return allUniqueMacroNames.map(macroName => {
            const category = getMacroCategory(macroName);
            
            // Filter list to get items that belong to BOTH this macroprocess and the activeMapProject
            const activeProjectItems = mapCoverageAnalytics.list.filter(g => 
                g.macroprocess === macroName && 
                g.project === activeMapProject
            );

            const totalRequired = activeProjectItems.reduce((acc, curr) => acc + curr.totalRequired, 0);
            const totalApproved = activeProjectItems.reduce((acc, curr) => acc + curr.totalApproved, 0);
            const totalInProcess = activeProjectItems.reduce((acc, curr) => acc + curr.totalInProcess, 0);

            // Build standard processes array with metrics specific to the active project
            const standardProcessesList = (macroToProcessesMap[macroName] || []).map(pName => {
                // Find items for this specific process in active project
                const processItems = activeProjectItems.filter(g => (g.process || 'Sin Proceso') === pName);
                const pRequired = processItems.reduce((acc, curr) => acc + curr.totalRequired, 0);
                const pApproved = processItems.reduce((acc, curr) => acc + curr.totalApproved, 0);
                return {
                    processName: pName,
                    totalRequired: pRequired,
                    totalApproved: pApproved
                };
            });

            return {
                project: activeMapProject,
                macroprocess: macroName,
                category,
                totalRequired,
                totalApproved,
                totalInProcess,
                microprocesses: activeProjectItems, // legacy compatibility
                standardGroupedProcesses: standardProcessesList
            };
        });
    }, [mapCoverageAnalytics.list, activeMapProject, macroClassifications]);

    const categoryProgress = useMemo(() => {
        const getProgressForCategory = (category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE') => {
            const items = filteredProcessMapDataByProject.filter(m => m.category === category);
            const totalRequired = items.reduce((sum, item) => sum + (item.totalRequired || 0), 0);
            const totalApproved = items.reduce((sum, item) => sum + (item.totalApproved || 0), 0);
            return totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0;
        };
        return {
            ESTRATEGICO: getProgressForCategory('ESTRATEGICO'),
            OPERATIVO: getProgressForCategory('OPERATIVO'),
            SOPORTE: getProgressForCategory('SOPORTE'),
        };
    }, [filteredProcessMapDataByProject]);

    const totalProjectProgress = useMemo(() => {
        const totalRequired = filteredProcessMapDataByProject.reduce((sum, item) => sum + (item.totalRequired || 0), 0);
        const totalApproved = filteredProcessMapDataByProject.reduce((sum, item) => sum + (item.totalApproved || 0), 0);
        return totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0;
    }, [filteredProcessMapDataByProject]);

    const microprocessReportingStats = useMemo(() => {
        const grouped: Record<string, {
            microName: string;
            macroName: string;
            processName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            docs: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { state: DocState; isVirtual: boolean; id: string; isRequired: boolean }>;
        }> = {};

        let projectDocs = unifiedData.filter(d => d.project === activeMapProject);
        if (filterAnalyst) {
            projectDocs = projectDocs.filter(d => d.assignees?.includes(filterAnalyst));
        }

        const isFilteredByAnalyst = Boolean(filterAnalyst);

        projectDocs.forEach(d => {
            const micro = d.microprocess || 'Sin Clasificar';
            const macro = d.macroprocess || 'Sin Clasificar';
            const proc = d.process || 'Sin Clasificar';
            const cat = getMacroCategory(macro);

            if (!grouped[micro]) {
                grouped[micro] = {
                    microName: micro,
                    macroName: macro,
                    processName: proc,
                    category: cat,
                    docs: {
                        'AS IS': { state: DocState.NOT_STARTED, isVirtual: true, id: '', isRequired: isFilteredByAnalyst ? false : isDocTypeRequired(activeMapProject, macro, proc, micro, 'AS IS') },
                        'FCE': { state: DocState.NOT_STARTED, isVirtual: true, id: '', isRequired: isFilteredByAnalyst ? false : isDocTypeRequired(activeMapProject, macro, proc, micro, 'FCE') },
                        'PM': { state: DocState.NOT_STARTED, isVirtual: true, id: '', isRequired: isFilteredByAnalyst ? false : isDocTypeRequired(activeMapProject, macro, proc, micro, 'PM') },
                        'TO BE': { state: DocState.NOT_STARTED, isVirtual: true, id: '', isRequired: isFilteredByAnalyst ? false : isDocTypeRequired(activeMapProject, macro, proc, micro, 'TO BE') }
                    }
                };
            }
            
            const type = (d.docType || 'AS IS') as 'AS IS' | 'FCE' | 'PM' | 'TO BE';
            if (grouped[micro].docs[type]) {
                grouped[micro].docs[type] = {
                    state: d.state,
                    isVirtual: d.isVirtual || false,
                    id: d.id,
                    isRequired: isDocTypeRequired(activeMapProject, macro, proc, micro, type)
                };
            }
        });

        return Object.values(grouped).sort((a, b) => a.microName.localeCompare(b.microName));
    }, [unifiedData, activeMapProject, hierarchy, filterAnalyst]);

    const projectDocTypeStats = useMemo(() => {
        const stats: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { total: number; approved: number; inProcess: number; initiated: number; notStarted: number; notRequired: number }> = {
            'AS IS': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'FCE': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'PM': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'TO BE': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 }
        };

        microprocessReportingStats.forEach(micro => {
            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(type => {
                const doc = micro.docs[type];
                stats[type].total++;
                if (!doc.isRequired) {
                    stats[type].notRequired++;
                } else if (doc.state === DocState.APPROVED) {
                    stats[type].approved++;
                } else if (doc.state === DocState.NOT_STARTED) {
                    stats[type].notStarted++;
                } else if (doc.state === DocState.INITIATED) {
                    stats[type].initiated++;
                } else {
                    stats[type].inProcess++;
                }
            });
        });

        return stats;
    }, [microprocessReportingStats]);

    const filteredProjectDocTypeStats = useMemo(() => {
        const stats: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { total: number; approved: number; inProcess: number; initiated: number; notStarted: number; notRequired: number }> = {
            'AS IS': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'FCE': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'PM': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'TO BE': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 }
        };

        microprocessReportingStats.forEach(micro => {
            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(type => {
                if (mapDocTypeFilter !== 'TODOS' && type !== mapDocTypeFilter) return;
                const doc = micro.docs[type];
                stats[type].total++;
                if (!doc.isRequired) {
                    stats[type].notRequired++;
                } else if (doc.state === DocState.APPROVED) {
                    stats[type].approved++;
                } else if (doc.state === DocState.NOT_STARTED) {
                    stats[type].notStarted++;
                } else if (doc.state === DocState.INITIATED) {
                    stats[type].initiated++;
                } else {
                    stats[type].inProcess++;
                }
            });
        });

        return stats;
    }, [microprocessReportingStats, mapDocTypeFilter]);

    const projectChartData = useMemo(() => {
        return (['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(type => {
            const stats = filteredProjectDocTypeStats[type] || { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 };
            const requiredTotal = stats.total - stats.notRequired;
            return {
                name: type,
                'No Iniciado': stats.notStarted,
                'En Proceso': stats.inProcess + stats.initiated,
                'Aprobados': stats.approved,
                'No Requerido': stats.notRequired,
                total: stats.total,
                percentage: requiredTotal > 0 ? Math.round((stats.approved / requiredTotal) * 100) : 0
            };
        });
    }, [filteredProjectDocTypeStats]);

    const macroprocessDocTypeStats = useMemo(() => {
        const grouped: Record<string, {
            macroName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { total: number; approved: number; inProcess: number; notStarted: number }>;
            totalRequired: number;
            totalApproved: number;
        }> = {};

        const projectDocs = unifiedData.filter(d => {
            if (d.project !== activeMapProject) return false;
            if (mapDocTypeFilter !== 'TODOS' && (d.docType || 'AS IS') !== mapDocTypeFilter) return false;
            return true;
        });

        projectDocs.forEach(d => {
            const macro = d.macroprocess || 'Sin Clasificar';
            if (!grouped[macro]) {
                grouped[macro] = {
                    macroName: macro,
                    category: getMacroCategory(macro),
                    docTypes: {
                        'AS IS': { total: 0, approved: 0, inProcess: 0, notStarted: 0 },
                        'FCE': { total: 0, approved: 0, inProcess: 0, notStarted: 0 },
                        'PM': { total: 0, approved: 0, inProcess: 0, notStarted: 0 },
                        'TO BE': { total: 0, approved: 0, inProcess: 0, notStarted: 0 }
                    },
                    totalRequired: 0,
                    totalApproved: 0
                };
            }

            const type = (d.docType || 'AS IS') as 'AS IS' | 'FCE' | 'PM' | 'TO BE';
            if (grouped[macro].docTypes[type]) {
                grouped[macro].docTypes[type].total++;
                grouped[macro].totalRequired++;
                if (d.state === DocState.APPROVED) {
                    grouped[macro].docTypes[type].approved++;
                    grouped[macro].totalApproved++;
                } else if (d.state === DocState.NOT_STARTED) {
                    grouped[macro].docTypes[type].notStarted++;
                } else {
                    grouped[macro].docTypes[type].inProcess++;
                }
            }
        });

        return Object.values(grouped).sort((a, b) => {
            const catOrder = { ESTRATEGICO: 1, OPERATIVO: 2, SOPORTE: 3 };
            const orderA = catOrder[a.category] || 99;
            const orderB = catOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.macroName.localeCompare(b.macroName);
        });
    }, [unifiedData, activeMapProject, mapDocTypeFilter]);

    const microprocessDocTypeStats = useMemo(() => {
        const stats: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { total: number; approved: number; inProcess: number; initiated: number; notStarted: number; notRequired: number }> = {
            'AS IS': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'FCE': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'PM': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 },
            'TO BE': { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 }
        };

        microprocessReportingStats.forEach(micro => {
            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(type => {
                const doc = micro.docs[type];
                stats[type].total++;
                if (!doc.isRequired) {
                    stats[type].notRequired++;
                } else if (doc.state === DocState.APPROVED) {
                    stats[type].approved++;
                } else if (doc.state === DocState.NOT_STARTED) {
                    stats[type].notStarted++;
                } else if (doc.state === DocState.INITIATED) {
                    stats[type].initiated++;
                } else {
                    stats[type].inProcess++;
                }
            });
        });

        return stats;
    }, [microprocessReportingStats]);

    const filteredMicroprocessStats = useMemo(() => {
        return microprocessReportingStats.map(micro => {
            const activeTypes = mapDocTypeFilter === 'TODOS' 
                ? (['AS IS', 'FCE', 'PM', 'TO BE'] as const)
                : ([mapDocTypeFilter] as const);

            let totalRequired = 0;
            let approved = 0;
            let inProcess = 0;
            let initiated = 0;
            let notStarted = 0;
            let hasReview = false;

            activeTypes.forEach(type => {
                const doc = micro.docs[type];
                if (doc && doc.id) {
                    totalRequired++;
                    if (doc.state === DocState.APPROVED) {
                        approved++;
                    } else if (doc.state === DocState.NOT_STARTED) {
                        notStarted++;
                    } else if (doc.state === DocState.INITIATED) {
                        initiated++;
                    } else {
                        inProcess++;
                    }
                    
                    if ([DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(doc.state)) {
                        hasReview = true;
                    }
                }
            });

            const progress = totalRequired > 0 ? Math.round((approved / totalRequired) * 100) : 0;
            
            let state: 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED' = 'NOT_STARTED';
            if (totalRequired > 0) {
                if (approved === totalRequired) {
                    state = 'COMPLETED';
                } else if (notStarted === totalRequired) {
                    state = 'NOT_STARTED';
                } else if (hasReview) {
                    state = 'IN_REVIEW';
                } else {
                    state = 'IN_PROGRESS';
                }
            }

            return {
                ...micro,
                totalRequired,
                approvedCount: approved,
                progress,
                state
            };
        });
    }, [microprocessReportingStats, mapDocTypeFilter]);

    const overallMicroprocessProgress = useMemo(() => {
        let totalRequired = 0;
        let totalApproved = 0;
        filteredMicroprocessStats.forEach(m => {
            totalRequired += m.totalRequired;
            totalApproved += m.approvedCount;
        });
        return totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0;
    }, [filteredMicroprocessStats]);

    const microPieData = useMemo(() => {
        let noIniciado = 0;
        let enProceso = 0;
        let aprobados = 0;

        filteredMicroprocessStats.forEach(m => {
            if (m.state === 'COMPLETED') aprobados++;
            else if (m.state === 'NOT_STARTED') noIniciado++;
            else enProceso++; // IN_PROGRESS or IN_REVIEW
        });

        return [
            { name: 'No iniciado', value: noIniciado, color: '#cbd5e1' },
            { name: 'En Proceso', value: enProceso, color: '#3b82f6' },
            { name: 'Aprobados', value: aprobados, color: '#22c55e' }
        ].filter(item => item.value > 0);
    }, [filteredMicroprocessStats]);

    const microCategoryChartData = useMemo(() => {
        const categories = ['ESTRATEGICO', 'OPERATIVO', 'SOPORTE'] as const;
        return categories.map(cat => {
            const items = filteredMicroprocessStats.filter(m => m.category === cat);
            let noIniciado = 0;
            let enProceso = 0;
            let aprobados = 0;

            items.forEach(m => {
                if (m.state === 'COMPLETED') aprobados++;
                else if (m.state === 'NOT_STARTED') noIniciado++;
                else enProceso++;
            });

            let name = 'Estratégico';
            if (cat === 'OPERATIVO') name = 'Operativo';
            else if (cat === 'SOPORTE') name = 'Soporte';

            return {
                name,
                'No iniciado': noIniciado,
                'En Proceso': enProceso,
                'Aprobados': aprobados,
            };
        });
    }, [filteredMicroprocessStats]);

    const macroprocessReportingStats = useMemo(() => {
        const grouped: Record<string, {
            macroName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            processes: Record<string, {
                processName: string;
                microprocesses: Array<{
                    microName: string;
                    docs: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { state: DocState; isVirtual: boolean; id: string; isRequired: boolean }>;
                    totalRequired: number;
                    totalApproved: number;
                    overallProgress: number;
                }>;
                docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { total: number; approved: number }>;
                totalRequired: number;
                totalApproved: number;
                overallProgress: number;
            }>;
            docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { total: number; approved: number }>;
            totalRequired: number;
            totalApproved: number;
            overallProgress: number;
        }> = {};

        microprocessReportingStats.forEach(micro => {
            const macro = micro.macroName;
            const proc = micro.processName;

            if (!grouped[macro]) {
                grouped[macro] = {
                    macroName: macro,
                    category: micro.category,
                    processes: {},
                    docTypes: {
                        'AS IS': { total: 0, approved: 0 },
                        'FCE': { total: 0, approved: 0 },
                        'PM': { total: 0, approved: 0 },
                        'TO BE': { total: 0, approved: 0 }
                    },
                    totalRequired: 0,
                    totalApproved: 0,
                    overallProgress: 0
                };
            }

            if (!grouped[macro].processes[proc]) {
                grouped[macro].processes[proc] = {
                    processName: proc,
                    microprocesses: [],
                    docTypes: {
                        'AS IS': { total: 0, approved: 0 },
                        'FCE': { total: 0, approved: 0 },
                        'PM': { total: 0, approved: 0 },
                        'TO BE': { total: 0, approved: 0 }
                    },
                    totalRequired: 0,
                    totalApproved: 0,
                    overallProgress: 0
                };
            }

            // Calculate microprocess level required/approved
            let microReq = 0;
            let microApp = 0;
            
            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(type => {
                const doc = micro.docs[type];
                if (doc.isRequired) {
                    microReq++;
                    
                    // Add to process level
                    grouped[macro].processes[proc].docTypes[type].total++;
                    grouped[macro].processes[proc].totalRequired++;
                    
                    // Add to macro level
                    grouped[macro].docTypes[type].total++;
                    grouped[macro].totalRequired++;

                    if (doc.state === DocState.APPROVED) {
                        microApp++;
                        
                        // Add to process level
                        grouped[macro].processes[proc].docTypes[type].approved++;
                        grouped[macro].processes[proc].totalApproved++;
                        
                        // Add to macro level
                        grouped[macro].docTypes[type].approved++;
                        grouped[macro].totalApproved++;
                    }
                }
            });

            grouped[macro].processes[proc].microprocesses.push({
                microName: micro.microName,
                docs: micro.docs,
                totalRequired: microReq,
                totalApproved: microApp,
                overallProgress: microReq > 0 ? Math.round((microApp / microReq) * 100) : 0
            });
        });

        // Convert processes Record to sorted Array, calculate progress
        return Object.values(grouped).map(macro => {
            const processesList = Object.values(macro.processes).map(proc => {
                // Sort microprocesses by name
                proc.microprocesses.sort((a, b) => a.microName.localeCompare(b.microName));
                return {
                    ...proc,
                    overallProgress: proc.totalRequired > 0 ? Math.round((proc.totalApproved / proc.totalRequired) * 100) : 0
                };
            }).sort((a, b) => a.processName.localeCompare(b.processName));

            return {
                macroName: macro.macroName,
                category: macro.category,
                processCount: processesList.length,
                microprocessCount: processesList.reduce((acc, p) => acc + p.microprocesses.length, 0),
                processes: processesList,
                docTypes: macro.docTypes,
                totalRequired: macro.totalRequired,
                totalApproved: macro.totalApproved,
                overallProgress: macro.totalRequired > 0 ? Math.round((macro.totalApproved / macro.totalRequired) * 100) : 0
            };
        }).sort((a, b) => {
            const catOrder = { ESTRATEGICO: 1, OPERATIVO: 2, SOPORTE: 3 };
            const orderA = catOrder[a.category] || 99;
            const orderB = catOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.macroName.localeCompare(b.macroName);
        });
    }, [microprocessReportingStats]);

    const renderDocBadges = (dtypes: string[], colorClass: string, titleStr: string, docsMap: any) => {
        if (dtypes.length === 0) return <span className="text-slate-300 text-xs">-</span>;
        return (
            <div className="flex flex-wrap gap-1 justify-center">
                {dtypes.map(dtype => {
                    const doc = docsMap[dtype];
                    const isReal = doc && !doc.isVirtual && doc.id;
                    return (
                        <span
                            key={dtype}
                            onClick={() => isReal && navigate(`/doc/${doc.id}`)}
                            className={`px-1.5 py-0.5 text-[9px] rounded border ${colorClass} font-bold inline-block whitespace-nowrap ${isReal ? 'cursor-pointer transition-all hover:scale-105' : 'cursor-default'}`}
                            title={isReal ? `Ver documento ${dtype} (${titleStr})` : `Documento ${dtype} (${titleStr}) - Requerido`}
                        >
                            {dtype}
                        </span>
                    );
                })}
            </div>
        );
    };

    const macroprocessMicroStateStats = useMemo(() => {
        const grouped: Record<string, {
            macroName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            processes: Record<string, {
                processName: string;
                microprocesses: Array<{
                    microName: string;
                    state: 'NOT_STARTED' | 'IN_PROGRESS' | 'IN_REVIEW' | 'COMPLETED';
                    totalRequired: number;
                    approvedCount: number;
                    progress: number;
                    docs: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', { state: DocState; isVirtual: boolean; id: string; isRequired: boolean }>;
                }>;
                microprocessCount: number;
                noIniciadoCount: number;
                enProcesoCount: number;
                referenteCount: number;
                controlGestionCount: number;
                terminadosCount: number;
            }>;
            microprocessCount: number;
            noIniciadoCount: number;
            enProcesoCount: number;
            referenteCount: number;
            controlGestionCount: number;
            terminadosCount: number;
        }> = {};

        filteredMicroprocessStats.forEach(micro => {
            const macro = micro.macroName;
            const proc = micro.processName;

            if (!grouped[macro]) {
                grouped[macro] = {
                    macroName: macro,
                    category: micro.category,
                    processes: {},
                    microprocessCount: 0,
                    noIniciadoCount: 0,
                    enProcesoCount: 0,
                    referenteCount: 0,
                    controlGestionCount: 0,
                    terminadosCount: 0
                };
            }

            if (!grouped[macro].processes[proc]) {
                grouped[macro].processes[proc] = {
                    processName: proc,
                    microprocesses: [],
                    microprocessCount: 0,
                    noIniciadoCount: 0,
                    enProcesoCount: 0,
                    referenteCount: 0,
                    controlGestionCount: 0,
                    terminadosCount: 0
                };
            }

            // Document-level counting
            let microNoIniciado = 0;
            let microEnProceso = 0;
            let microReferente = 0;
            let microControlGestion = 0;
            let microTerminados = 0;

            const activeTypes = mapDocTypeFilter === 'TODOS' 
                ? (['AS IS', 'FCE', 'PM', 'TO BE'] as const)
                : ([mapDocTypeFilter] as const);

            activeTypes.forEach(dtype => {
                const doc = micro.docs[dtype];
                if (doc && doc.isRequired) {
                    if (doc.state === DocState.APPROVED) {
                        microTerminados++;
                    } else if (doc.state === DocState.NOT_STARTED) {
                        microNoIniciado++;
                    } else if (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW) {
                        microReferente++;
                    } else if (doc.state === DocState.SENT_TO_CONTROL || doc.state === DocState.CONTROL_REVIEW) {
                        microControlGestion++;
                    } else {
                        microEnProceso++;
                    }
                }
            });

            // Increment process level
            grouped[macro].processes[proc].microprocessCount++;
            grouped[macro].processes[proc].noIniciadoCount += microNoIniciado;
            grouped[macro].processes[proc].enProcesoCount += microEnProceso;
            grouped[macro].processes[proc].referenteCount += microReferente;
            grouped[macro].processes[proc].controlGestionCount += microControlGestion;
            grouped[macro].processes[proc].terminadosCount += microTerminados;

            // Increment macro level
            grouped[macro].microprocessCount++;
            grouped[macro].noIniciadoCount += microNoIniciado;
            grouped[macro].enProcesoCount += microEnProceso;
            grouped[macro].referenteCount += microReferente;
            grouped[macro].controlGestionCount += microControlGestion;
            grouped[macro].terminadosCount += microTerminados;

            grouped[macro].processes[proc].microprocesses.push({
                microName: micro.microName,
                state: micro.state,
                totalRequired: micro.totalRequired,
                approvedCount: micro.approvedCount,
                progress: micro.progress,
                docs: micro.docs
            });
        });

        // Convert processes Record to sorted Array
        return Object.values(grouped).map(macro => {
            const processesList = Object.values(macro.processes).map(proc => {
                proc.microprocesses.sort((a, b) => a.microName.localeCompare(b.microName));
                return proc;
            }).sort((a, b) => a.processName.localeCompare(b.processName));

            return {
                macroName: macro.macroName,
                category: macro.category,
                processCount: processesList.length,
                microprocessCount: macro.microprocessCount,
                noIniciadoCount: macro.noIniciadoCount,
                enProcesoCount: macro.enProcesoCount,
                referenteCount: macro.referenteCount,
                controlGestionCount: macro.controlGestionCount,
                terminadosCount: macro.terminadosCount,
                processes: processesList
            };
        }).sort((a, b) => {
            const catOrder = { ESTRATEGICO: 1, OPERATIVO: 2, SOPORTE: 3 };
            const orderA = catOrder[a.category] || 99;
            const orderB = catOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.macroName.localeCompare(b.macroName);
        });
    }, [filteredMicroprocessStats, mapDocTypeFilter]);

    const macroprocessThreeDrillDownStats = useMemo(() => {
        const grouped: Record<string, {
            macroName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            processes: Record<string, {
                processName: string;
                microprocesses: Array<{
                    microName: string;
                    docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                        notRequired: number;
                        notStarted: number;
                        inProcess: number;
                        referent: number;
                        control: number;
                        approved: number;
                    }>;
                    total: number;
                }>;
                docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                    notRequired: number;
                    notStarted: number;
                    inProcess: number;
                    referent: number;
                    control: number;
                    approved: number;
                }>;
                microprocessCount: number;
                total: number;
            }>;
            docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                notRequired: number;
                notStarted: number;
                inProcess: number;
                referent: number;
                control: number;
                approved: number;
            }>;
            processCount: number;
            microprocessCount: number;
            total: number;
        }> = {};

        filteredMicroprocessStats.forEach(micro => {
            const macro = micro.macroName;
            const proc = micro.processName;

            if (!grouped[macro]) {
                grouped[macro] = {
                    macroName: macro,
                    category: micro.category,
                    processes: {},
                    docTypes: {
                        'AS IS': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                        'FCE': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                        'PM': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                        'TO BE': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 }
                    },
                    processCount: 0,
                    microprocessCount: 0,
                    total: 0
                };
            }

            if (!grouped[macro].processes[proc]) {
                grouped[macro].processes[proc] = {
                    processName: proc,
                    microprocesses: [],
                    docTypes: {
                        'AS IS': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                        'FCE': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                        'PM': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                        'TO BE': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 }
                    },
                    microprocessCount: 0,
                    total: 0
                };
            }

            const microDocTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                notRequired: number;
                notStarted: number;
                inProcess: number;
                referent: number;
                control: number;
                approved: number;
            }> = {
                'AS IS': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                'FCE': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                'PM': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 },
                'TO BE': { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 }
            };

            let microTotal = 0;

            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(dtype => {
                const doc = micro.docs[dtype];
                if (!doc || !doc.isRequired) {
                    microDocTypes[dtype].notRequired = 1;
                    grouped[macro].docTypes[dtype].notRequired++;
                    grouped[macro].processes[proc].docTypes[dtype].notRequired++;
                } else {
                    microTotal++;
                    if (doc.state === DocState.APPROVED) {
                        microDocTypes[dtype].approved = 1;
                        grouped[macro].docTypes[dtype].approved++;
                        grouped[macro].processes[proc].docTypes[dtype].approved++;
                    } else if (doc.state === DocState.NOT_STARTED) {
                        microDocTypes[dtype].notStarted = 1;
                        grouped[macro].docTypes[dtype].notStarted++;
                        grouped[macro].processes[proc].docTypes[dtype].notStarted++;
                    } else if (doc.state === DocState.SENT_TO_REFERENT || doc.state === DocState.REFERENT_REVIEW) {
                        microDocTypes[dtype].referent = 1;
                        grouped[macro].docTypes[dtype].referent++;
                        grouped[macro].processes[proc].docTypes[dtype].referent++;
                    } else if (doc.state === DocState.SENT_TO_CONTROL || doc.state === DocState.CONTROL_REVIEW) {
                        microDocTypes[dtype].control = 1;
                        grouped[macro].docTypes[dtype].control++;
                        grouped[macro].processes[proc].docTypes[dtype].control++;
                    } else {
                        microDocTypes[dtype].inProcess = 1;
                        grouped[macro].docTypes[dtype].inProcess++;
                        grouped[macro].processes[proc].docTypes[dtype].inProcess++;
                    }
                }
            });

            grouped[macro].processes[proc].microprocesses.push({
                microName: micro.microName,
                docTypes: microDocTypes,
                total: microTotal
            });

            grouped[macro].processes[proc].microprocessCount++;
            grouped[macro].processes[proc].total += microTotal;
            grouped[macro].microprocessCount++;
            grouped[macro].total += microTotal;
        });

        // Convert processes Record to sorted Array
        return Object.values(grouped).map(macro => {
            const processesList = Object.values(macro.processes).map(proc => {
                proc.microprocesses.sort((a, b) => a.microName.localeCompare(b.microName));
                return proc;
            }).sort((a, b) => a.processName.localeCompare(b.processName));

            return {
                macroName: macro.macroName,
                category: macro.category,
                processCount: processesList.length,
                microprocessCount: macro.microprocessCount,
                processes: processesList,
                docTypes: macro.docTypes,
                total: macro.total
            };
        }).sort((a, b) => {
            const catOrder = { ESTRATEGICO: 1, OPERATIVO: 2, SOPORTE: 3 };
            const orderA = catOrder[a.category] || 99;
            const orderB = catOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.macroName.localeCompare(b.macroName);
        });
    }, [filteredMicroprocessStats]);

    const macroprocessProgressDrillDownStats = useMemo(() => {
        const grouped: Record<string, {
            macroName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            processes: Record<string, {
                processName: string;
                microprocesses: Array<{
                    microName: string;
                    docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                        isRequired: boolean;
                        progress: number | null;
                        state?: DocState;
                    }>;
                    totalRequired: number;
                    totalProgress: number;
                }>;
                docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                    requiredCount: number;
                    sumProgress: number;
                }>;
                microprocessCount: number;
                totalRequired: number;
                sumTotalProgress: number;
            }>;
            docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                requiredCount: number;
                sumProgress: number;
            }>;
            processCount: number;
            microprocessCount: number;
            totalRequired: number;
            sumTotalProgress: number;
        }> = {};

        filteredMicroprocessStats.forEach(micro => {
            const macro = micro.macroName;
            const proc = micro.processName;

            if (!grouped[macro]) {
                grouped[macro] = {
                    macroName: macro,
                    category: micro.category,
                    processes: {},
                    docTypes: {
                        'AS IS': { requiredCount: 0, sumProgress: 0 },
                        'FCE': { requiredCount: 0, sumProgress: 0 },
                        'PM': { requiredCount: 0, sumProgress: 0 },
                        'TO BE': { requiredCount: 0, sumProgress: 0 }
                    },
                    processCount: 0,
                    microprocessCount: 0,
                    totalRequired: 0,
                    sumTotalProgress: 0
                };
            }

            if (!grouped[macro].processes[proc]) {
                grouped[macro].processes[proc] = {
                    processName: proc,
                    microprocesses: [],
                    docTypes: {
                        'AS IS': { requiredCount: 0, sumProgress: 0 },
                        'FCE': { requiredCount: 0, sumProgress: 0 },
                        'PM': { requiredCount: 0, sumProgress: 0 },
                        'TO BE': { requiredCount: 0, sumProgress: 0 }
                    },
                    microprocessCount: 0,
                    totalRequired: 0,
                    sumTotalProgress: 0
                };
            }

            const microDocTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                isRequired: boolean;
                progress: number | null;
                state?: DocState;
            }> = {
                'AS IS': { isRequired: false, progress: null },
                'FCE': { isRequired: false, progress: null },
                'PM': { isRequired: false, progress: null },
                'TO BE': { isRequired: false, progress: null }
            };

            let microRequiredCount = 0;
            let microSumProgress = 0;

            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(dtype => {
                const doc = micro.docs[dtype];
                if (doc && doc.isRequired) {
                    const prog = STATE_CONFIG[doc.state]?.progress ?? 0;
                    microDocTypes[dtype] = {
                        isRequired: true,
                        progress: prog,
                        state: doc.state
                    };
                    microRequiredCount++;
                    microSumProgress += prog;

                    grouped[macro].docTypes[dtype].requiredCount++;
                    grouped[macro].docTypes[dtype].sumProgress += prog;

                    grouped[macro].processes[proc].docTypes[dtype].requiredCount++;
                    grouped[macro].processes[proc].docTypes[dtype].sumProgress += prog;
                } else {
                    microDocTypes[dtype] = {
                        isRequired: false,
                        progress: null
                    };
                }
            });

            const microTotalProgress = microRequiredCount > 0 
                ? Math.round(microSumProgress / microRequiredCount) 
                : 0;

            grouped[macro].processes[proc].microprocesses.push({
                microName: micro.microName,
                docTypes: microDocTypes,
                totalRequired: microRequiredCount,
                totalProgress: microTotalProgress
            });

            grouped[macro].processes[proc].microprocessCount++;
            grouped[macro].processes[proc].totalRequired += microRequiredCount;
            grouped[macro].processes[proc].sumTotalProgress += microSumProgress;

            grouped[macro].microprocessCount++;
            grouped[macro].totalRequired += microRequiredCount;
            grouped[macro].sumTotalProgress += microSumProgress;
        });

        return Object.values(grouped).map(macro => {
            const processesList = Object.values(macro.processes).map(proc => {
                proc.microprocesses.sort((a, b) => a.microName.localeCompare(b.microName));

                const procDocTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                    requiredCount: number;
                    averageProgress: number | null;
                }> = {
                    'AS IS': {
                        requiredCount: proc.docTypes['AS IS'].requiredCount,
                        averageProgress: proc.docTypes['AS IS'].requiredCount > 0
                            ? Math.round(proc.docTypes['AS IS'].sumProgress / proc.docTypes['AS IS'].requiredCount)
                            : null
                    },
                    'FCE': {
                        requiredCount: proc.docTypes['FCE'].requiredCount,
                        averageProgress: proc.docTypes['FCE'].requiredCount > 0
                            ? Math.round(proc.docTypes['FCE'].sumProgress / proc.docTypes['FCE'].requiredCount)
                            : null
                    },
                    'PM': {
                        requiredCount: proc.docTypes['PM'].requiredCount,
                        averageProgress: proc.docTypes['PM'].requiredCount > 0
                            ? Math.round(proc.docTypes['PM'].sumProgress / proc.docTypes['PM'].requiredCount)
                            : null
                    },
                    'TO BE': {
                        requiredCount: proc.docTypes['TO BE'].requiredCount,
                        averageProgress: proc.docTypes['TO BE'].requiredCount > 0
                            ? Math.round(proc.docTypes['TO BE'].sumProgress / proc.docTypes['TO BE'].requiredCount)
                            : null
                    }
                };

                const procTotalProgress = proc.totalRequired > 0
                    ? Math.round(proc.sumTotalProgress / proc.totalRequired)
                    : 0;

                return {
                    processName: proc.processName,
                    microprocesses: proc.microprocesses,
                    microprocessCount: proc.microprocessCount,
                    docTypes: procDocTypes,
                    totalRequired: proc.totalRequired,
                    totalProgress: procTotalProgress
                };
            }).sort((a, b) => a.processName.localeCompare(b.processName));

            const macroDocTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                requiredCount: number;
                averageProgress: number | null;
            }> = {
                'AS IS': {
                    requiredCount: macro.docTypes['AS IS'].requiredCount,
                    averageProgress: macro.docTypes['AS IS'].requiredCount > 0
                        ? Math.round(macro.docTypes['AS IS'].sumProgress / macro.docTypes['AS IS'].requiredCount)
                        : null
                },
                'FCE': {
                    requiredCount: macro.docTypes['FCE'].requiredCount,
                    averageProgress: macro.docTypes['FCE'].requiredCount > 0
                        ? Math.round(macro.docTypes['FCE'].sumProgress / macro.docTypes['FCE'].requiredCount)
                        : null
                },
                'PM': {
                    requiredCount: macro.docTypes['PM'].requiredCount,
                    averageProgress: macro.docTypes['PM'].requiredCount > 0
                        ? Math.round(macro.docTypes['PM'].sumProgress / macro.docTypes['PM'].requiredCount)
                        : null
                },
                'TO BE': {
                    requiredCount: macro.docTypes['TO BE'].requiredCount,
                    averageProgress: macro.docTypes['TO BE'].requiredCount > 0
                        ? Math.round(macro.docTypes['TO BE'].sumProgress / macro.docTypes['TO BE'].requiredCount)
                        : null
                }
            };

            const macroTotalProgress = macro.totalRequired > 0
                ? Math.round(macro.sumTotalProgress / macro.totalRequired)
                : 0;

            return {
                macroName: macro.macroName,
                category: macro.category,
                processCount: processesList.length,
                microprocessCount: macro.microprocessCount,
                processes: processesList,
                docTypes: macroDocTypes,
                totalRequired: macro.totalRequired,
                totalProgress: macroTotalProgress
            };
        }).sort((a, b) => {
            const catOrder = { ESTRATEGICO: 1, OPERATIVO: 2, SOPORTE: 3 };
            const orderA = catOrder[a.category] || 99;
            const orderB = catOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.macroName.localeCompare(b.macroName);
        });
    }, [filteredMicroprocessStats]);

    const macroprocessPendingCompletedDrillDownStats = useMemo(() => {
        const grouped: Record<string, {
            macroName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            processes: Record<string, {
                processName: string;
                microprocesses: Array<{
                    microName: string;
                    docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                        isRequired: boolean;
                        isTerminated: boolean;
                        isNoTerminated: boolean;
                        state?: DocState;
                    }>;
                    totalNoTerminados: number;
                    totalTerminados: number;
                    totalRequired: number;
                }>;
                docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                    noTerminados: number;
                    terminados: number;
                    notRequired: number;
                    total: number;
                }>;
                microprocessCount: number;
                totalNoTerminados: number;
                totalTerminados: number;
                totalRequired: number;
            }>;
            docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                noTerminados: number;
                terminados: number;
                notRequired: number;
                total: number;
            }>;
            processCount: number;
            microprocessCount: number;
            totalNoTerminados: number;
            totalTerminados: number;
            totalRequired: number;
        }> = {};

        filteredMicroprocessStats.forEach(micro => {
            const macro = micro.macroName;
            const proc = micro.processName;

            if (!grouped[macro]) {
                grouped[macro] = {
                    macroName: macro,
                    category: micro.category,
                    processes: {},
                    docTypes: {
                        'AS IS': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 },
                        'FCE': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 },
                        'PM': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 },
                        'TO BE': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 }
                    },
                    processCount: 0,
                    microprocessCount: 0,
                    totalNoTerminados: 0,
                    totalTerminados: 0,
                    totalRequired: 0
                };
            }

            if (!grouped[macro].processes[proc]) {
                grouped[macro].processes[proc] = {
                    processName: proc,
                    microprocesses: [],
                    docTypes: {
                        'AS IS': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 },
                        'FCE': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 },
                        'PM': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 },
                        'TO BE': { noTerminados: 0, terminados: 0, notRequired: 0, total: 0 }
                    },
                    microprocessCount: 0,
                    totalNoTerminados: 0,
                    totalTerminados: 0,
                    totalRequired: 0
                };
            }

            const microDocTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                isRequired: boolean;
                isTerminated: boolean;
                isNoTerminated: boolean;
                state?: DocState;
            }> = {
                'AS IS': { isRequired: false, isTerminated: false, isNoTerminated: false },
                'FCE': { isRequired: false, isTerminated: false, isNoTerminated: false },
                'PM': { isRequired: false, isTerminated: false, isNoTerminated: false },
                'TO BE': { isRequired: false, isTerminated: false, isNoTerminated: false }
            };

            let microNoTerminados = 0;
            let microTerminados = 0;
            let microTotalRequired = 0;

            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(dtype => {
                const doc = micro.docs[dtype];
                if (doc && doc.isRequired) {
                    microTotalRequired++;
                    const isTerm = doc.state === DocState.APPROVED;
                    if (isTerm) {
                        microTerminados++;
                        grouped[macro].docTypes[dtype].terminados++;
                        grouped[macro].processes[proc].docTypes[dtype].terminados++;
                    } else {
                        microNoTerminados++;
                        grouped[macro].docTypes[dtype].noTerminados++;
                        grouped[macro].processes[proc].docTypes[dtype].noTerminados++;
                    }
                    grouped[macro].docTypes[dtype].total++;
                    grouped[macro].processes[proc].docTypes[dtype].total++;

                    microDocTypes[dtype] = {
                        isRequired: true,
                        isTerminated: isTerm,
                        isNoTerminated: !isTerm,
                        state: doc.state
                    };
                } else {
                    grouped[macro].docTypes[dtype].notRequired++;
                    grouped[macro].processes[proc].docTypes[dtype].notRequired++;
                    microDocTypes[dtype] = {
                        isRequired: false,
                        isTerminated: false,
                        isNoTerminated: false
                    };
                }
            });

            grouped[macro].processes[proc].microprocesses.push({
                microName: micro.microName,
                docTypes: microDocTypes,
                totalNoTerminados: microNoTerminados,
                totalTerminados: microTerminados,
                totalRequired: microTotalRequired
            });

            grouped[macro].processes[proc].microprocessCount++;
            grouped[macro].processes[proc].totalNoTerminados += microNoTerminados;
            grouped[macro].processes[proc].totalTerminados += microTerminados;
            grouped[macro].processes[proc].totalRequired += microTotalRequired;

            grouped[macro].microprocessCount++;
            grouped[macro].totalNoTerminados += microNoTerminados;
            grouped[macro].totalTerminados += microTerminados;
            grouped[macro].totalRequired += microTotalRequired;
        });

        return Object.values(grouped).map(macro => {
            const processesList = Object.values(macro.processes).map(proc => {
                proc.microprocesses.sort((a, b) => a.microName.localeCompare(b.microName));
                return proc;
            }).sort((a, b) => a.processName.localeCompare(b.processName));

            return {
                macroName: macro.macroName,
                category: macro.category,
                processCount: processesList.length,
                microprocessCount: macro.microprocessCount,
                processes: processesList,
                docTypes: macro.docTypes,
                totalNoTerminados: macro.totalNoTerminados,
                totalTerminados: macro.totalTerminados,
                totalRequired: macro.totalRequired
            };
        }).sort((a, b) => {
            const catOrder = { ESTRATEGICO: 1, OPERATIVO: 2, SOPORTE: 3 };
            const orderA = catOrder[a.category] || 99;
            const orderB = catOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.macroName.localeCompare(b.macroName);
        });
    }, [filteredMicroprocessStats]);

    const handleExportPendingCompletedExcel = () => {
        if (macroprocessPendingCompletedDrillDownStats.length === 0) return;
        
        const headers = [
            'PROYECTO',
            'CATEGORIA',
            'MACROPROCESO',
            'PROCESO',
            'MICROPROCESO',
            'AS IS (No Terminado)',
            'AS IS (Terminado)',
            'FCE (No Terminado)',
            'FCE (Terminado)',
            'PM (No Terminado)',
            'PM (Terminado)',
            'TO BE (No Terminado)',
            'TO BE (Terminado)',
            'TOTAL NO TERMINADOS',
            'TOTAL TERMINADOS',
            'TOTAL DOCUMENTOS'
        ];

        const rows: string[][] = [];

        macroprocessPendingCompletedDrillDownStats.forEach(macro => {
            macro.processes.forEach(proc => {
                proc.microprocesses.forEach(micro => {
                    const getCounts = (dtype: 'AS IS' | 'FCE' | 'PM' | 'TO BE') => {
                        const dt = micro.docTypes[dtype];
                        if (!dt.isRequired) return { noTerm: 'N/R', term: 'N/R' };
                        return {
                            noTerm: dt.isNoTerminated ? '1' : '0',
                            term: dt.isTerminated ? '1' : '0'
                        };
                    };

                    const asis = getCounts('AS IS');
                    const fce = getCounts('FCE');
                    const pm = getCounts('PM');
                    const tobe = getCounts('TO BE');

                    rows.push([
                        activeMapProject,
                        macro.category,
                        macro.macroName,
                        proc.processName,
                        micro.microName,
                        asis.noTerm,
                        asis.term,
                        fce.noTerm,
                        fce.term,
                        pm.noTerm,
                        pm.term,
                        tobe.noTerm,
                        tobe.term,
                        String(micro.totalNoTerminados),
                        String(micro.totalTerminados),
                        String(micro.totalRequired)
                    ]);
                });
            });
        });

        const csvContent = [
            headers.join(';'),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))
        ].join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Cantidades_Terminados_NoTerminados_${activeMapProject}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const grandTotalsPendingCompleted = useMemo(() => {
        const totals = {
            docTypes: {
                'AS IS': { noTerminados: 0, terminados: 0 },
                'FCE': { noTerminados: 0, terminados: 0 },
                'PM': { noTerminados: 0, terminados: 0 },
                'TO BE': { noTerminados: 0, terminados: 0 }
            },
            totalNoTerminados: 0,
            totalTerminados: 0
        };
        macroprocessPendingCompletedDrillDownStats.forEach(m => {
            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(t => {
                totals.docTypes[t].noTerminados += m.docTypes[t].noTerminados;
                totals.docTypes[t].terminados += m.docTypes[t].terminados;
            });
            totals.totalNoTerminados += m.totalNoTerminados;
            totals.totalTerminados += m.totalTerminados;
        });
        return totals;
    }, [macroprocessPendingCompletedDrillDownStats]);

    const toggleAllPendingCompletedMacros = () => {
        const allExpanded = macroprocessPendingCompletedDrillDownStats.length > 0 && macroprocessPendingCompletedDrillDownStats.every(m => expandedPendingCompletedMacros[m.macroName]);
        const newMacroState: Record<string, boolean> = {};
        const newProcState: Record<string, boolean> = {};
        
        if (!allExpanded) {
            macroprocessPendingCompletedDrillDownStats.forEach(m => {
                newMacroState[m.macroName] = true;
                m.processes.forEach(p => {
                    newProcState[p.processName] = true;
                });
            });
        }
        setExpandedPendingCompletedMacros(newMacroState);
        setExpandedPendingCompletedProcesses(newProcState);
    };

    const handleExportProgressPercentExcel = () => {
        if (macroprocessProgressDrillDownStats.length === 0) return;
        
        const headers = [
            'PROYECTO',
            'CATEGORIA',
            'MACROPROCESO',
            'PROCESO',
            'MICROPROCESO',
            'AVANCE AS IS (%)',
            'AVANCE FCE (%)',
            'AVANCE PM (%)',
            'AVANCE TO BE (%)',
            'AVANCE TOTAL (%)'
        ];

        const rows: string[][] = [];

        macroprocessProgressDrillDownStats.forEach(macro => {
            macro.processes.forEach(proc => {
                proc.microprocesses.forEach(micro => {
                    const getVal = (dtype: 'AS IS' | 'FCE' | 'PM' | 'TO BE') => {
                        const dt = micro.docTypes[dtype];
                        if (!dt.isRequired || dt.progress === null) return 'N/R';
                        return `${dt.progress}%`;
                    };

                    rows.push([
                        activeMapProject,
                        macro.category,
                        macro.macroName,
                        proc.processName,
                        micro.microName,
                        getVal('AS IS'),
                        getVal('FCE'),
                        getVal('PM'),
                        getVal('TO BE'),
                        `${micro.totalProgress}%`
                    ]);
                });
            });
        });

        const csvContent = [
            headers.join(';'),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))
        ].join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Avance_Porcentual_${activeMapProject}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const toggleAllProgressMacros = () => {
        const allExpanded = macroprocessProgressDrillDownStats.length > 0 && macroprocessProgressDrillDownStats.every(m => expandedProgressPercentMacros[m.macroName]);
        const newMacroState: Record<string, boolean> = {};
        const newProcState: Record<string, boolean> = {};
        
        if (!allExpanded) {
            macroprocessProgressDrillDownStats.forEach(m => {
                newMacroState[m.macroName] = true;
                m.processes.forEach(p => {
                    newProcState[p.processName] = true;
                });
            });
        }
        setExpandedProgressPercentMacros(newMacroState);
        setExpandedProgressPercentProcesses(newProcState);
    };

    const macroprocessFlowPhasesDrillDownStats = useMemo(() => {
        const grouped: Record<string, {
            macroName: string;
            category: 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE';
            processes: Record<string, {
                processName: string;
                microprocesses: Array<{
                    microName: string;
                    docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                        isRequired: boolean;
                        dgp: number;
                        referent: number;
                        control: number;
                        approved: number;
                        state?: DocState;
                    }>;
                    totalDgp: number;
                    totalReferent: number;
                    totalControl: number;
                    totalApproved: number;
                    totalRequired: number;
                }>;
                docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                    dgp: number;
                    referent: number;
                    control: number;
                    approved: number;
                    total: number;
                }>;
                microprocessCount: number;
                totalDgp: number;
                totalReferent: number;
                totalControl: number;
                totalApproved: number;
                totalRequired: number;
            }>;
            docTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                dgp: number;
                referent: number;
                control: number;
                approved: number;
                total: number;
            }>;
            processCount: number;
            microprocessCount: number;
            totalDgp: number;
            totalReferent: number;
            totalControl: number;
            totalApproved: number;
            totalRequired: number;
        }> = {};

        filteredMicroprocessStats.forEach(micro => {
            const macro = micro.macroName;
            const proc = micro.processName;

            if (!grouped[macro]) {
                grouped[macro] = {
                    macroName: macro,
                    category: micro.category,
                    processes: {},
                    docTypes: {
                        'AS IS': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 },
                        'FCE': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 },
                        'PM': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 },
                        'TO BE': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 }
                    },
                    processCount: 0,
                    microprocessCount: 0,
                    totalDgp: 0,
                    totalReferent: 0,
                    totalControl: 0,
                    totalApproved: 0,
                    totalRequired: 0
                };
            }

            if (!grouped[macro].processes[proc]) {
                grouped[macro].processes[proc] = {
                    processName: proc,
                    microprocesses: [],
                    docTypes: {
                        'AS IS': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 },
                        'FCE': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 },
                        'PM': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 },
                        'TO BE': { dgp: 0, referent: 0, control: 0, approved: 0, total: 0 }
                    },
                    microprocessCount: 0,
                    totalDgp: 0,
                    totalReferent: 0,
                    totalControl: 0,
                    totalApproved: 0,
                    totalRequired: 0
                };
            }

            const microDocTypes: Record<'AS IS' | 'FCE' | 'PM' | 'TO BE', {
                isRequired: boolean;
                dgp: number;
                referent: number;
                control: number;
                approved: number;
                state?: DocState;
            }> = {
                'AS IS': { isRequired: false, dgp: 0, referent: 0, control: 0, approved: 0 },
                'FCE': { isRequired: false, dgp: 0, referent: 0, control: 0, approved: 0 },
                'PM': { isRequired: false, dgp: 0, referent: 0, control: 0, approved: 0 },
                'TO BE': { isRequired: false, dgp: 0, referent: 0, control: 0, approved: 0 }
            };

            let microDgp = 0;
            let microReferent = 0;
            let microControl = 0;
            let microApproved = 0;
            let microTotalRequired = 0;

            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(dtype => {
                const doc = micro.docs[dtype];
                if (doc && doc.isRequired) {
                    microTotalRequired++;
                    let isDgp = 0;
                    let isRef = 0;
                    let isCtrl = 0;
                    let isApp = 0;

                    const st = doc.state;
                    if ([DocState.NOT_STARTED, DocState.INITIATED, DocState.IN_PROCESS, DocState.INTERNAL_REVIEW].includes(st)) {
                        isDgp = 1;
                        microDgp++;
                        grouped[macro].docTypes[dtype].dgp++;
                        grouped[macro].processes[proc].docTypes[dtype].dgp++;
                    } else if (dtype === 'TO BE') {
                        if ([DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW].includes(st)) {
                            isRef = 1;
                            microReferent++;
                            grouped[macro].docTypes[dtype].referent++;
                            grouped[macro].processes[proc].docTypes[dtype].referent++;
                        } else if ([DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(st)) {
                            isCtrl = 1;
                            microControl++;
                            grouped[macro].docTypes[dtype].control++;
                            grouped[macro].processes[proc].docTypes[dtype].control++;
                        } else if (st === DocState.APPROVED) {
                            isApp = 1;
                            microApproved++;
                            grouped[macro].docTypes[dtype].approved++;
                            grouped[macro].processes[proc].docTypes[dtype].approved++;
                        }
                    } else {
                        // For AS IS, FCE, PM: Referente + Control de Gestión are counted in Referente
                        if ([DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(st)) {
                            isRef = 1;
                            microReferent++;
                            grouped[macro].docTypes[dtype].referent++;
                            grouped[macro].processes[proc].docTypes[dtype].referent++;
                        } else if (st === DocState.APPROVED) {
                            isApp = 1;
                            microApproved++;
                            grouped[macro].docTypes[dtype].approved++;
                            grouped[macro].processes[proc].docTypes[dtype].approved++;
                        }
                    }

                    grouped[macro].docTypes[dtype].total++;
                    grouped[macro].processes[proc].docTypes[dtype].total++;

                    microDocTypes[dtype] = {
                        isRequired: true,
                        dgp: isDgp,
                        referent: isRef,
                        control: isCtrl,
                        approved: isApp,
                        state: doc.state
                    };
                }
            });

            grouped[macro].processes[proc].microprocesses.push({
                microName: micro.microName,
                docTypes: microDocTypes,
                totalDgp: microDgp,
                totalReferent: microReferent,
                totalControl: microControl,
                totalApproved: microApproved,
                totalRequired: microTotalRequired
            });

            grouped[macro].processes[proc].microprocessCount++;
            grouped[macro].processes[proc].totalDgp += microDgp;
            grouped[macro].processes[proc].totalReferent += microReferent;
            grouped[macro].processes[proc].totalControl += microControl;
            grouped[macro].processes[proc].totalApproved += microApproved;
            grouped[macro].processes[proc].totalRequired += microTotalRequired;

            grouped[macro].microprocessCount++;
            grouped[macro].totalDgp += microDgp;
            grouped[macro].totalReferent += microReferent;
            grouped[macro].totalControl += microControl;
            grouped[macro].totalApproved += microApproved;
            grouped[macro].totalRequired += microTotalRequired;
        });

        return Object.values(grouped).map(macro => {
            const processesList = Object.values(macro.processes).map(proc => {
                proc.microprocesses.sort((a, b) => a.microName.localeCompare(b.microName));
                return proc;
            }).sort((a, b) => a.processName.localeCompare(b.processName));

            return {
                macroName: macro.macroName,
                category: macro.category,
                processCount: processesList.length,
                microprocessCount: macro.microprocessCount,
                processes: processesList,
                docTypes: macro.docTypes,
                totalDgp: macro.totalDgp,
                totalReferent: macro.totalReferent,
                totalControl: macro.totalControl,
                totalApproved: macro.totalApproved,
                totalRequired: macro.totalRequired
            };
        }).sort((a, b) => {
            const catOrder = { ESTRATEGICO: 1, OPERATIVO: 2, SOPORTE: 3 };
            const orderA = catOrder[a.category] || 99;
            const orderB = catOrder[b.category] || 99;
            if (orderA !== orderB) return orderA - orderB;
            return a.macroName.localeCompare(b.macroName);
        });
    }, [filteredMicroprocessStats]);

    const grandTotalsFlowPhases = useMemo(() => {
        const totals = {
            docTypes: {
                'AS IS': { dgp: 0, referent: 0, control: 0, approved: 0 },
                'FCE': { dgp: 0, referent: 0, control: 0, approved: 0 },
                'PM': { dgp: 0, referent: 0, control: 0, approved: 0 },
                'TO BE': { dgp: 0, referent: 0, control: 0, approved: 0 }
            },
            totalDgp: 0,
            totalReferent: 0,
            totalControl: 0,
            totalApproved: 0,
            totalRequired: 0
        };
        macroprocessFlowPhasesDrillDownStats.forEach(m => {
            (['AS IS', 'FCE', 'PM', 'TO BE'] as const).forEach(t => {
                totals.docTypes[t].dgp += m.docTypes[t].dgp;
                totals.docTypes[t].referent += m.docTypes[t].referent;
                totals.docTypes[t].control += m.docTypes[t].control;
                totals.docTypes[t].approved += m.docTypes[t].approved;
            });
            totals.totalDgp += m.totalDgp;
            totals.totalReferent += m.totalReferent;
            totals.totalControl += m.totalControl;
            totals.totalApproved += m.totalApproved;
            totals.totalRequired += m.totalRequired;
        });
        return totals;
    }, [macroprocessFlowPhasesDrillDownStats]);

    const handleExportFlowPhasesExcel = () => {
        if (macroprocessFlowPhasesDrillDownStats.length === 0) return;
        
        const headers = [
            'PROYECTO',
            'CATEGORIA',
            'MACROPROCESO',
            'PROCESO',
            'MICROPROCESO',
            'AS IS (DGP)',
            'AS IS (Referente)',
            'AS IS (Terminado)',
            'FCE (DGP)',
            'FCE (Referente)',
            'FCE (Terminado)',
            'PM (DGP)',
            'PM (Referente)',
            'PM (Terminado)',
            'TO BE (DGP)',
            'TO BE (Referente)',
            'TO BE (Control Gestión)',
            'TO BE (Terminado)',
            'TOTAL DGP',
            'TOTAL REFERENTE',
            'TOTAL CONTROL GESTION',
            'TOTAL TERMINADO',
            'TOTAL DOCUMENTOS'
        ];

        const rows: string[][] = [];

        macroprocessFlowPhasesDrillDownStats.forEach(macro => {
            macro.processes.forEach(proc => {
                proc.microprocesses.forEach(micro => {
                    const getPhaseVal = (dtype: 'AS IS' | 'FCE' | 'PM' | 'TO BE', phase: 'dgp' | 'referent' | 'control' | 'approved') => {
                        const dt = micro.docTypes[dtype];
                        if (!dt.isRequired) return 'N/R';
                        if (dtype !== 'TO BE' && phase === 'control') return 'N/A';
                        return dt[phase] > 0 ? '1' : '0';
                    };

                    rows.push([
                        activeMapProject,
                        macro.category,
                        macro.macroName,
                        proc.processName,
                        micro.microName,
                        getPhaseVal('AS IS', 'dgp'),
                        getPhaseVal('AS IS', 'referent'),
                        getPhaseVal('AS IS', 'approved'),
                        getPhaseVal('FCE', 'dgp'),
                        getPhaseVal('FCE', 'referent'),
                        getPhaseVal('FCE', 'approved'),
                        getPhaseVal('PM', 'dgp'),
                        getPhaseVal('PM', 'referent'),
                        getPhaseVal('PM', 'approved'),
                        getPhaseVal('TO BE', 'dgp'),
                        getPhaseVal('TO BE', 'referent'),
                        getPhaseVal('TO BE', 'control'),
                        getPhaseVal('TO BE', 'approved'),
                        String(micro.totalDgp),
                        String(micro.totalReferent),
                        String(micro.totalControl),
                        String(micro.totalApproved),
                        String(micro.totalRequired)
                    ]);
                });
            });
        });

        const csvContent = [
            headers.join(';'),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))
        ].join('\n');

        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `Reporte_Etapas_Gestion_Documental_${activeMapProject}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const toggleAllFlowPhasesMacros = () => {
        const allExpanded = macroprocessFlowPhasesDrillDownStats.length > 0 && macroprocessFlowPhasesDrillDownStats.every(m => expandedFlowPhasesMacros[m.macroName]);
        const newMacroState: Record<string, boolean> = {};
        const newProcState: Record<string, boolean> = {};
        
        if (!allExpanded) {
            macroprocessFlowPhasesDrillDownStats.forEach(m => {
                newMacroState[m.macroName] = true;
                m.processes.forEach(p => {
                    newProcState[p.processName] = true;
                });
            });
        }
        setExpandedFlowPhasesMacros(newMacroState);
        setExpandedFlowPhasesProcesses(newProcState);
    };

    const renderProgressBadge = (val: number | null, isBold = false) => {
        if (val === null) {
            return (
                <span className="text-slate-300 font-semibold text-[11px]">N/R</span>
            );
        }
        
        let colorClass = 'text-slate-500 bg-slate-100 border-slate-200';
        let barColor = 'bg-slate-400';
        if (val === 100) {
            colorClass = 'text-emerald-700 bg-emerald-50 border-emerald-200/80';
            barColor = 'bg-emerald-500';
        } else if (val >= 80) {
            colorClass = 'text-sky-700 bg-sky-50 border-sky-200/80';
            barColor = 'bg-sky-500';
        } else if (val >= 50) {
            colorClass = 'text-indigo-700 bg-indigo-50 border-indigo-200/80';
            barColor = 'bg-indigo-500';
        } else if (val > 0) {
            colorClass = 'text-amber-700 bg-amber-50 border-amber-200/80';
            barColor = 'bg-amber-500';
        }

        return (
            <div className="flex flex-col items-center justify-center gap-1 w-full max-w-[85px] mx-auto">
                <span className={`inline-flex items-center justify-center px-2 py-0.5 rounded-md border text-[11px] ${isBold ? 'font-black' : 'font-bold'} ${colorClass}`}>
                    {val}%
                </span>
                <div className="w-full h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all duration-300`} style={{ width: `${val}%` }} />
                </div>
            </div>
        );
    };

    const renderTotalProgressBadge = (val: number, isHeader = false) => {
        let colorClass = 'text-slate-600 bg-slate-100 border-slate-200';
        let barColor = 'bg-slate-500';
        if (val === 100) {
            colorClass = 'text-emerald-800 bg-emerald-100/80 border-emerald-300';
            barColor = 'bg-emerald-600';
        } else if (val >= 80) {
            colorClass = 'text-sky-800 bg-sky-100/80 border-sky-300';
            barColor = 'bg-sky-600';
        } else if (val >= 50) {
            colorClass = 'text-indigo-800 bg-indigo-100/80 border-indigo-300';
            barColor = 'bg-indigo-600';
        } else if (val > 0) {
            colorClass = 'text-amber-800 bg-amber-100/80 border-amber-300';
            barColor = 'bg-amber-600';
        }

        return (
            <div className="flex items-center justify-center gap-2">
                <span className={`inline-flex items-center justify-center px-2.5 py-0.5 rounded-full border text-[11px] ${isHeader ? 'font-black text-xs' : 'font-extrabold'} shadow-xs ${colorClass}`}>
                    {val}%
                </span>
                <div className="w-10 h-1.5 bg-slate-200 rounded-full overflow-hidden hidden sm:block">
                    <div className={`h-full ${barColor}`} style={{ width: `${val}%` }} />
                </div>
            </div>
        );
    };

    const handleExportMicroPNG = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 950;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Background Gradient
        const grad = ctx.createLinearGradient(0, 0, 0, 950);
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(1, '#f1f5f9');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1200, 950);

        // Decorative top line
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(0, 0, 1200, 12);

        // Title Block
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 24px system-ui, -apple-system, sans-serif';
        ctx.fillText('Reporte de Avance por Microproceso y Gestión Documental', 50, 65);

        // Subtitle / Metadata
        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px system-ui, -apple-system, sans-serif';
        const dateStr = new Date().toLocaleDateString('es-CL', { 
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        const fullProjName = activeMapProject === 'HPC' ? 'Hospital Provincia Cordillera (HPC)' : activeMapProject === 'HSR' ? 'Hospital Sótero del Río (HSR)' : activeMapProject;
        ctx.fillText(`Proyecto: ${fullProjName}  |  Generado: ${dateStr}  |  Filtro Documental: ${mapDocTypeFilter}`, 50, 100);

        // Separator line
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(50, 125);
        ctx.lineTo(1150, 125);
        ctx.stroke();

        const roundRectLocal = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
            c.beginPath();
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r);
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
            c.closePath();
        };

        // --- LEFT COLUMN: AVANCE GENERAL DE MICROPROCESOS (Gauge / Circular) ---
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(15, 23, 42, 0.04)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        roundRectLocal(ctx, 50, 155, 450, 320, 16);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
        ctx.fillText('Avance General de Microprocesos', 80, 200);

        // Circular Gauge
        const centerX = 275;
        const centerY = 325;
        const radius = 80;

        // Background circle
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Active progress arc
        const progressFraction = overallMicroprocessProgress / 100;
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, (-Math.PI / 2) + (2 * Math.PI * progressFraction));
        ctx.stroke();

        // Percentage Text in center
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${overallMicroprocessProgress}%`, centerX, centerY + 10);

        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillText('COMPLETADO', centerX, centerY + 30);
        ctx.textAlign = 'left';

        // Stats details under gauge
        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px system-ui, -apple-system, sans-serif';
        const totalMicros = filteredMicroprocessStats.length;
        const completedMicros = filteredMicroprocessStats.filter(m => m.state === 'COMPLETED').length;
        ctx.fillText(`Total de Microprocesos: ${totalMicros}`, 80, 445);
        ctx.fillText(`Completados: ${completedMicros}`, 290, 445);


        // --- RIGHT COLUMN: AVANCE POR CATEGORIA DE PROCESO (Horizontal Bars) ---
        ctx.fillStyle = '#ffffff';
        roundRectLocal(ctx, 530, 155, 620, 320, 16);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
        ctx.fillText('Avance de Microprocesos por Categoría', 560, 200);

        // Draw State Legend
        ctx.font = '500 11px system-ui, -apple-system, sans-serif';
        
        // No iniciado (Gray)
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(900, 195, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillText('No iniciado', 910, 199);

        // En Proceso (Blue)
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(985, 195, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillText('En Proceso', 995, 199);

        // Aprobados (Green)
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(1070, 195, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillText('Aprobados', 1080, 199);

        const categories = ['ESTRATEGICO', 'OPERATIVO', 'SOPORTE'] as const;
        const catLabels = {
            'ESTRATEGICO': 'Estratégico',
            'OPERATIVO': 'Operativo',
            'SOPORTE': 'Soporte'
        };
        const catColors = {
            'ESTRATEGICO': '#f59e0b',
            'OPERATIVO': '#0ea5e9',
            'SOPORTE': '#a855f7'
        };

        categories.forEach((cat, index) => {
            const yOffset = 235 + (index * 65);
            const items = filteredMicroprocessStats.filter(m => m.category === cat);
            const total = items.length;
            let completed = 0;
            let inReview = 0;
            let inProgress = 0;
            let notStarted = 0;

            items.forEach(m => {
                if (m.state === 'COMPLETED') completed++;
                else if (m.state === 'IN_REVIEW') inReview++;
                else if (m.state === 'IN_PROGRESS') inProgress++;
                else notStarted++;
            });

            const totalActive = completed;
            const totalPending = notStarted;
            const totalInDev = inProgress + inReview;
            const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

            // Label
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
            ctx.fillText(catLabels[cat], 560, yOffset + 15);

            // Detailed state breakdown counts
            ctx.fillStyle = '#64748b';
            ctx.font = '500 11px system-ui, -apple-system, sans-serif';
            const breakdownText = `No iniciado: ${totalPending}  •  En Proceso: ${totalInDev}  •  Aprobados: ${totalActive}`;
            ctx.fillText(breakdownText, 660, yOffset + 15);

            // Percentage label
            ctx.fillStyle = catColors[cat];
            ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${percentage}%`, 1100, yOffset + 15);

            // Progress bar
            ctx.save();
            roundRectLocal(ctx, 560, yOffset + 25, 540, 10, 5);
            ctx.clip();

            // Background
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(560, yOffset + 25, 540, 10);

            if (total > 0) {
                const notStartedWidth = (totalPending / total) * 540;
                const inDevWidth = (totalInDev / total) * 540;
                const approvedWidth = (totalActive / total) * 540;

                // 1. No Iniciado (Gray)
                if (notStartedWidth > 0) {
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillRect(560, yOffset + 25, notStartedWidth, 10);
                }
                // 2. En Proceso (Blue)
                if (inDevWidth > 0) {
                    ctx.fillStyle = '#3b82f6';
                    ctx.fillRect(560 + notStartedWidth, yOffset + 25, inDevWidth, 10);
                }
                // 3. Aprobados (Green)
                if (approvedWidth > 0) {
                    ctx.fillStyle = '#22c55e';
                    ctx.fillRect(560 + notStartedWidth + inDevWidth, yOffset + 25, approvedWidth, 10);
                }
            }
            ctx.restore();
        });


        // --- LOWER SECTION: DETAILED LIST OF MACROPROCESSES (Table-like grid) ---
        ctx.fillStyle = '#ffffff';
        roundRectLocal(ctx, 50, 505, 1100, 390, 16);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 16px system-ui, -apple-system, sans-serif';
        ctx.fillText('Desglose de Gestión Documental por Microproceso', 80, 545);

        // Table Header
        ctx.fillStyle = '#f8fafc';
        roundRectLocal(ctx, 80, 565, 1040, 35, 6);
        ctx.fill();

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.fillText('Macroproceso', 100, 587);
        ctx.fillText('Proc (Cant)', 420, 587);
        ctx.fillText('Microproc (Cant)', 510, 587);
        ctx.fillText('Categoría', 640, 587);
        ctx.fillText('AS IS', 750, 587);
        ctx.fillText('FCE', 810, 587);
        ctx.fillText('PM', 870, 587);
        ctx.fillText('TO BE', 930, 587);
        ctx.fillText('Avance', 1010, 587);

        // List first 5 macroprocesses
        const rows = macroprocessReportingStats.slice(0, 5);
        rows.forEach((row, idx) => {
            const yRow = 615 + (idx * 50);

            // Alternate backgrounds
            if (idx % 2 === 1) {
                ctx.fillStyle = '#f8fafc';
                roundRectLocal(ctx, 80, yRow - 10, 1040, 45, 6);
                ctx.fill();
            }

            // Macroproceso Name
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
            let nameTrimmed = row.macroName;
            if (nameTrimmed.length > 38) nameTrimmed = nameTrimmed.substring(0, 36) + '...';
            ctx.fillText(nameTrimmed, 100, yRow + 17);

            // Procesos (Cantidad)
            ctx.fillStyle = '#475569';
            ctx.font = '500 12px system-ui, -apple-system, sans-serif';
            ctx.fillText(String(row.processCount), 440, yRow + 17);

            // Microprocesos (Cantidad)
            ctx.fillStyle = '#475569';
            ctx.fillText(String(row.microprocessCount), 530, yRow + 17);

            // Category Label
            const catLabel = catLabels[row.category] || row.category;
            ctx.fillStyle = '#ffffff';
            ctx.save();
            ctx.fillStyle = catColors[row.category] || '#64748b';
            roundRectLocal(ctx, 640, yRow + 3, 90, 20, 4);
            ctx.fill();
            ctx.restore();

            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(catLabel.toUpperCase(), 685, yRow + 16);
            ctx.textAlign = 'left';

            // Document Types percentages
            ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
            const dtypes = ['AS IS', 'FCE', 'PM', 'TO BE'] as const;
            dtypes.forEach((dtype, dIdx) => {
                const xOffset = 750 + (dIdx * 60);
                const dstats = row.docTypes[dtype];
                const p = dstats.total > 0 ? Math.round((dstats.approved / dstats.total) * 100) : -1;
                
                if (p >= 0) {
                    ctx.fillStyle = p === 100 ? '#16a34a' : p > 0 ? '#4f46e5' : '#64748b';
                    ctx.fillText(`${p}%`, xOffset, yRow + 17);
                } else {
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillText('N/R', xOffset, yRow + 17);
                }
            });

            // Overall Progress and mini progress bar
            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${row.overallProgress}%`, 1010, yRow + 17);

            // Mini bar
            ctx.fillStyle = '#f1f5f9';
            roundRectLocal(ctx, 1010, yRow + 23, 80, 5, 2.5);
            ctx.fill();

            ctx.fillStyle = '#4f46e5';
            roundRectLocal(ctx, 1010, yRow + 23, (row.overallProgress / 100) * 80, 5, 2.5);
            ctx.fill();
        });

        if (macroprocessReportingStats.length > 5) {
            ctx.fillStyle = '#64748b';
            ctx.font = 'italic 11px system-ui, -apple-system, sans-serif';
            ctx.fillText(`* Mostrando los primeros 5 macroprocesos de un total de ${macroprocessReportingStats.length}.`, 80, 885);
        }

        const link = document.createElement('a');
        link.download = `reporte-avance-microprocesos-${activeMapProject.toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const handleExportPNG = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 1200;
        canvas.height = 950;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Background Gradient
        const grad = ctx.createLinearGradient(0, 0, 0, 950);
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(1, '#f1f5f9');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 1200, 950);

        // Decorative indigo top line
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(0, 0, 1200, 12);

        // Title Block
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
        ctx.fillText('Reporte de Gestión por Procesos y Avance Documental', 50, 65);

        // Subtitle / Metadata
        ctx.fillStyle = '#64748b';
        ctx.font = '500 14px system-ui, -apple-system, sans-serif';
        const dateStr = new Date().toLocaleDateString('es-CL', { 
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        const fullProjName = activeMapProject === 'HPC' ? 'Hospital Provincia Cordillera (HPC)' : activeMapProject === 'HSR' ? 'Hospital Sótero del Río (HSR)' : activeMapProject;
        ctx.fillText(`Proyecto: ${fullProjName}  |  Generado: ${dateStr}  |  Filtro Documental: ${mapDocTypeFilter}`, 50, 100);

        // Separator line
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(50, 125);
        ctx.lineTo(1150, 125);
        ctx.stroke();

        const roundRectLocal = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
            c.beginPath();
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r);
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
            c.closePath();
        };

        // --- LEFT COLUMN: AVANCE GENERAL (Gauge / Circular) ---
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(15, 23, 42, 0.04)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        roundRectLocal(ctx, 50, 155, 450, 320, 16);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
        ctx.fillText('Porcentaje de Avance General', 80, 200);

        // Circular Gauge
        const centerX = 275;
        const centerY = 325;
        const radius = 80;

        // Background circle
        ctx.strokeStyle = '#f1f5f9';
        ctx.lineWidth = 20;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
        ctx.stroke();

        // Active progress arc
        const progressFraction = totalProjectProgress / 100;
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 20;
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, -Math.PI / 2, (-Math.PI / 2) + (2 * Math.PI * progressFraction));
        ctx.stroke();

        // Percentage Text in center
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 36px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`${totalProjectProgress}%`, centerX, centerY + 10);

        ctx.fillStyle = '#4f46e5';
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.fillText('COMPLETADO', centerX, centerY + 30);
        ctx.textAlign = 'left';

        // Stats details under gauge
        ctx.fillStyle = '#64748b';
        ctx.font = '500 13px system-ui, -apple-system, sans-serif';
        let totalReqCount = 0;
        let totalAppCount = 0;
        Object.values(filteredProjectDocTypeStats).forEach(s => {
            totalReqCount += s.total;
            totalAppCount += s.approved;
        });
        ctx.fillText(`Documentos Requeridos: ${totalReqCount}`, 80, 445);
        ctx.fillText(`Aprobados: ${totalAppCount}`, 290, 445);


        // --- RIGHT COLUMN: AVANCE POR DOCUMENTO (Horizontal Bars) ---
        ctx.fillStyle = '#ffffff';
        roundRectLocal(ctx, 530, 155, 620, 320, 16);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
        ctx.fillText('Avance Detallado por Tipo de Documento', 560, 200);

        // Draw State Legend
        ctx.font = '500 11px system-ui, -apple-system, sans-serif';
        
        // No Iniciado (Gray)
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(900, 195, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillText('No Iniciado', 910, 199);

        // En Proceso (Blue)
        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.arc(985, 195, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillText('En Proceso', 995, 199);

        // Aprobados (Green)
        ctx.fillStyle = '#22c55e';
        ctx.beginPath();
        ctx.arc(1070, 195, 4, 0, 2 * Math.PI);
        ctx.fill();
        ctx.fillStyle = '#64748b';
        ctx.fillText('Aprobados', 1080, 199);

        const types = ['AS IS', 'FCE', 'PM', 'TO BE'] as const;
        const typeColors = {
            'AS IS': '#3b82f6',
            'FCE': '#f87171',
            'PM': '#facc15',
            'TO BE': '#22c55e'
        };

        types.forEach((type, index) => {
            const yOffset = 235 + (index * 55);
            const stats = filteredProjectDocTypeStats[type] || { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0 };
            const percentage = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;

            // Label
            ctx.fillStyle = '#1e293b';
            ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
            ctx.fillText(type, 560, yOffset + 15);

            // Detailed state breakdown counts
            ctx.fillStyle = '#64748b';
            ctx.font = '500 11px system-ui, -apple-system, sans-serif';
            const totalInProcess = stats.inProcess + stats.initiated;
            const breakdownText = `No Iniciado: ${stats.notStarted}  •  En Proceso: ${totalInProcess}  •  Aprobados: ${stats.approved}`;
            ctx.fillText(breakdownText, 620, yOffset + 15);

            // Percentage label (approved %)
            ctx.fillStyle = typeColors[type];
            ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${percentage}%`, 1100, yOffset + 15);

            // Progress bar container & clipping to guarantee perfectly rounded outer corners
            ctx.save();
            roundRectLocal(ctx, 560, yOffset + 25, 540, 10, 5);
            ctx.clip();

            // Background
            ctx.fillStyle = '#f1f5f9';
            ctx.fillRect(560, yOffset + 25, 540, 10);

            if (stats.total > 0) {
                const notStartedWidth = (stats.notStarted / stats.total) * 540;
                const inProcessWidth = (totalInProcess / stats.total) * 540;
                const approvedWidth = (stats.approved / stats.total) * 540;

                // 1. No Iniciado (Gray)
                if (notStartedWidth > 0) {
                    ctx.fillStyle = '#cbd5e1';
                    ctx.fillRect(560, yOffset + 25, notStartedWidth, 10);
                }
                // 2. En Proceso (Blue)
                if (inProcessWidth > 0) {
                    ctx.fillStyle = '#3b82f6';
                    ctx.fillRect(560 + notStartedWidth, yOffset + 25, inProcessWidth, 10);
                }
                // 3. Aprobados (Green)
                if (approvedWidth > 0) {
                    ctx.fillStyle = '#22c55e';
                    ctx.fillRect(560 + notStartedWidth + inProcessWidth, yOffset + 25, approvedWidth, 10);
                }
            }
            ctx.restore();
        });

        // --- BOTTOM SECTION: TABLA RESUMEN POR MACROPROCESO ---
        ctx.fillStyle = '#ffffff';
        roundRectLocal(ctx, 50, 500, 1100, 430, 16);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 18px system-ui, -apple-system, sans-serif';
        ctx.fillText('Desglose de Avance de Documentación por Macroproceso', 80, 540);

        // Table Headers
        ctx.fillStyle = '#f8fafc';
        roundRectLocal(ctx, 80, 560, 1040, 35, 8);
        ctx.fill();

        ctx.fillStyle = '#475569';
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.fillText('Macroproceso', 100, 582);
        ctx.fillText('Categoría', 420, 582);
        ctx.fillText('AS IS', 560, 582);
        ctx.fillText('FCE', 680, 582);
        ctx.fillText('PM', 800, 582);
        ctx.fillText('TO BE', 920, 582);
        ctx.fillText('Avance General', 1010, 582);

        const rows = macroprocessDocTypeStats.slice(0, 6);
        const rowHeight = 45;

        rows.forEach((row, rIdx) => {
            const yOffset = 605 + (rIdx * rowHeight);

            if (rIdx % 2 === 1) {
                ctx.fillStyle = '#f8fafc';
                ctx.fillRect(80, yOffset - 10, 1040, rowHeight);
            }

            ctx.strokeStyle = '#f1f5f9';
            ctx.beginPath();
            ctx.moveTo(80, yOffset + rowHeight - 10);
            ctx.lineTo(1120, yOffset + rowHeight - 10);
            ctx.stroke();

            ctx.fillStyle = '#1e293b';
            ctx.font = '600 12px system-ui, -apple-system, sans-serif';
            
            const getLines = (context: CanvasRenderingContext2D, text: string, maxWidth: number): string[] => {
                const words = text.split(' ');
                const lines: string[] = [];
                let currentLine = '';

                for (let n = 0; n < words.length; n++) {
                    const testLine = currentLine + (currentLine ? ' ' : '') + words[n];
                    const metrics = context.measureText(testLine);
                    if (metrics.width > maxWidth && n > 0) {
                        lines.push(currentLine);
                        currentLine = words[n];
                    } else {
                        currentLine = testLine;
                    }
                }
                if (currentLine) {
                    lines.push(currentLine);
                }
                return lines;
            };

            const macroLines = getLines(ctx, row.macroName, 300);
            if (macroLines.length === 1) {
                ctx.fillText(macroLines[0], 100, yOffset + 18);
            } else if (macroLines.length > 1) {
                ctx.fillText(macroLines[0], 100, yOffset + 10);
                let secondLine = macroLines[1];
                if (macroLines.length > 2) {
                    secondLine += '...';
                }
                ctx.fillText(secondLine, 100, yOffset + 24);
            }

            const catColors = {
                ESTRATEGICO: { bg: '#fef3c7', text: '#b45309', label: 'Estratégico' },
                OPERATIVO: { bg: '#e0f2fe', text: '#0369a1', label: 'Operativo' },
                SOPORTE: { bg: '#f3e8ff', text: '#6b21a8', label: 'Soporte' }
            };
            const cat = catColors[row.category] || { bg: '#f1f5f9', text: '#475569', label: row.category };
            ctx.fillStyle = cat.bg;
            roundRectLocal(ctx, 420, yOffset, 90, 20, 6);
            ctx.fill();
            ctx.fillStyle = cat.text;
            ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
            ctx.fillText(cat.label, 435, yOffset + 14);

            const docTypes = ['AS IS', 'FCE', 'PM', 'TO BE'] as const;
            docTypes.forEach((dtype, dIdx) => {
                const xPos = 560 + (dIdx * 120);
                const dstats = row.docTypes[dtype] || { total: 0, approved: 0 };
                const p = dstats.total > 0 ? Math.round((dstats.approved / dstats.total) * 100) : 0;
                const required = dstats.total > 0;

                if (required) {
                    ctx.fillStyle = p === 100 ? '#15803d' : p > 0 ? '#1d4ed8' : '#64748b';
                    ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
                    ctx.fillText(`${p}%`, xPos, yOffset + 18);
                } else {
                    ctx.fillStyle = '#cbd5e1';
                    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
                    ctx.fillText('N/R', xPos, yOffset + 18);
                }
            });

            const progress = row.totalRequired > 0 ? Math.round((row.totalApproved / row.totalRequired) * 100) : 0;
            ctx.fillStyle = '#1e1b4b';
            ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${progress}%`, 1030, yOffset + 18);
        });

        // Render Total Row in Canvas
        const totalYOffset = 605 + (rows.length * rowHeight);
        
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(80, totalYOffset - 10);
        ctx.lineTo(1120, totalYOffset - 10);
        ctx.stroke();
        ctx.lineWidth = 1.0;

        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 12px system-ui, -apple-system, sans-serif';
        ctx.fillText('Total', 100, totalYOffset + 18);

        const docTypes = ['AS IS', 'FCE', 'PM', 'TO BE'] as const;
        docTypes.forEach((dtype, dIdx) => {
            const xPos = 560 + (dIdx * 120);
            const stats = projectDocTypeStats[dtype] || { total: 0, approved: 0 };
            const p = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;

            ctx.fillStyle = p === 100 ? '#15803d' : p > 0 ? '#1d4ed8' : '#64748b';
            ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
            ctx.fillText(`${p}%`, xPos, totalYOffset + 18);
        });

        let totalRequired = 0;
        let totalApproved = 0;
        docTypes.forEach(type => {
            const stats = projectDocTypeStats[type] || { total: 0, approved: 0 };
            totalRequired += stats.total;
            totalApproved += stats.approved;
        });
        const totalOverallProgress = totalRequired > 0 ? Math.round((totalApproved / totalRequired) * 100) : 0;

        ctx.fillStyle = '#1e1b4b';
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(`${totalOverallProgress}%`, 1030, totalYOffset + 18);

        if (macroprocessDocTypeStats.length > 6) {
            ctx.fillStyle = '#64748b';
            ctx.font = 'italic 11px system-ui, -apple-system, sans-serif';
            ctx.fillText(`* Mostrando los primeros 6 macroprocesos de un total de ${macroprocessDocTypeStats.length}.`, 80, totalYOffset + 40);
        }

        const link = document.createElement('a');
        link.download = `reporte-avance-documentos-${activeMapProject.toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    const handleExportMapPNG = () => {
        const canvas = document.createElement('canvas');
        canvas.width = 2000;
        canvas.height = 1350;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Background Gradient
        const grad = ctx.createLinearGradient(0, 0, 0, 1350);
        grad.addColorStop(0, '#f8fafc');
        grad.addColorStop(1, '#f1f5f9');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, 2000, 1350);

        // Decorative indigo top line
        ctx.fillStyle = '#4f46e5';
        ctx.fillRect(0, 0, 2000, 12);

        // Title Block
        ctx.fillStyle = '#0f172a';
        ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
        ctx.fillText('Mapa de Procesos Interactivo', 60, 70);

        // Subtitle / Metadata
        ctx.fillStyle = '#64748b';
        ctx.font = '500 15px system-ui, -apple-system, sans-serif';
        const dateStr = new Date().toLocaleDateString('es-CL', { 
            year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' 
        });
        const fullProjName = activeMapProject === 'HPC' ? 'Hospital Provincia Cordillera (HPC)' : activeMapProject === 'HSR' ? 'Hospital Sótero del Río (HSR)' : activeMapProject;
        ctx.fillText(`Proyecto: ${fullProjName}  |  Generado: ${dateStr}  |  Filtro Documental: ${mapDocTypeFilter}`, 60, 105);

        // Separator line
        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(60, 130);
        ctx.lineTo(1940, 130);
        ctx.stroke();

        const roundRectLocal = (c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
            c.beginPath();
            c.moveTo(x + r, y);
            c.lineTo(x + w - r, y);
            c.quadraticCurveTo(x + w, y, x + w, y + r);
            c.lineTo(x + w, y + h - r);
            c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            c.lineTo(x + r, y + h);
            c.quadraticCurveTo(x, y + h, x, y + h - r);
            c.lineTo(x, y + r);
            c.quadraticCurveTo(x, y, x + r, y);
            c.closePath();
        };

        const wrapText = (c: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number, maxLines: number = 2) => {
            const words = text.split(' ');
            let line = '';
            let lineCount = 0;
            let currentY = y;

            for (let n = 0; n < words.length; n++) {
                const testLine = line + words[n] + ' ';
                const metrics = c.measureText(testLine);
                const testWidth = metrics.width;
                if (testWidth > maxWidth && n > 0) {
                    lineCount++;
                    if (lineCount >= maxLines) {
                        c.fillText(line.trim() + '...', x, currentY);
                        return;
                    }
                    c.fillText(line.trim(), x, currentY);
                    line = words[n] + ' ';
                    currentY += lineHeight;
                } else {
                    line = testLine;
                }
            }
            c.fillText(line.trim(), x, currentY);
        };

        // --- LEFT MARGIN: ENTRADA ---
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(15, 23, 42, 0.03)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        roundRectLocal(ctx, 60, 160, 100, 1110, 12);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        ctx.strokeStyle = '#e2e8f0';
        ctx.lineWidth = 1;
        roundRectLocal(ctx, 60, 160, 100, 1110, 12);
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('ENTRADA', 110, 200);

        ctx.save();
        ctx.translate(110, 715);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
        ctx.fillText('Requisitos esperados por partes interesadas', 0, 0);
        ctx.restore();

        // --- RIGHT MARGIN: SALIDA ---
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(15, 23, 42, 0.03)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;
        roundRectLocal(ctx, 1840, 160, 100, 1110, 12);
        ctx.fill();
        ctx.shadowColor = 'transparent';

        roundRectLocal(ctx, 1840, 160, 100, 1110, 12);
        ctx.stroke();

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('SALIDA', 1890, 200);

        ctx.save();
        ctx.translate(1890, 715);
        ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = '#64748b';
        ctx.font = 'bold 14px system-ui, -apple-system, sans-serif';
        ctx.fillText('Requisitos satisfechos de las partes interesadas', 0, 0);
        ctx.restore();

        // --- CENTER AREA: THE PROCESS LANES ---
        // Row 1: Estratégicos (Amber Theme)
        // Background container for strategic
        ctx.fillStyle = '#fefdfb';
        roundRectLocal(ctx, 180, 160, 1640, 330, 16);
        ctx.fill();
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 1.5;
        roundRectLocal(ctx, 180, 160, 1640, 330, 16);
        ctx.stroke();

        ctx.fillStyle = '#d97706';
        ctx.beginPath();
        ctx.arc(215, 195, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#92400e';
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`Procesos Estratégicos (${activeMapProject})  |  Avance: ${categoryProgress.ESTRATEGICO}%`, 230, 199);

        // Row 2: Operativos (Sky Theme)
        ctx.fillStyle = '#fbfcff';
        roundRectLocal(ctx, 180, 530, 1640, 370, 16);
        ctx.fill();
        ctx.strokeStyle = '#e0f2fe';
        roundRectLocal(ctx, 180, 530, 1640, 370, 16);
        ctx.stroke();

        ctx.fillStyle = '#0284c7';
        ctx.beginPath();
        ctx.arc(215, 565, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#0369a1';
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(`Procesos Operativos (Cadena de Valor) (${activeMapProject})  |  Avance: ${categoryProgress.OPERATIVO}%`, 230, 569);

        // Row 3: Soporte (Purple Theme)
        ctx.fillStyle = '#fafaff';
        roundRectLocal(ctx, 180, 940, 1640, 330, 16);
        ctx.fill();
        ctx.strokeStyle = '#f3e8ff';
        roundRectLocal(ctx, 180, 940, 1640, 330, 16);
        ctx.stroke();

        ctx.fillStyle = '#7c3aed';
        ctx.beginPath();
        ctx.arc(215, 975, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.fillStyle = '#6d28d9';
        ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
        ctx.fillText(`Procesos de Soporte y de Apoyo (${activeMapProject})  |  Avance: ${categoryProgress.SOPORTE}%`, 230, 979);

        // Render macroprocess cards inside each row
        const categories = [
            { id: 'ESTRATEGICO', y: 225, color: '#f59e0b', strokeColor: '#fde68a', bgGrad: ['#fffdfa', '#fffbeb'], progressColor: '#f59e0b', pillText: '#b45309', pillBg: '#fef3c7' },
            { id: 'OPERATIVO', y: 595, color: '#0ea5e9', strokeColor: '#bae6fd', bgGrad: ['#fbfdff', '#f0f9ff'], progressColor: '#0ea5e9', pillText: '#0369a1', pillBg: '#e0f2fe' },
            { id: 'SOPORTE', y: 1005, color: '#a855f7', strokeColor: '#e9d5ff', bgGrad: ['#fdfbff', '#faf5ff'], progressColor: '#a855f7', pillText: '#6d28d9', pillBg: '#f3e8ff' }
        ];

        categories.forEach(cat => {
            const items = filteredProcessMapDataByProject.filter(m => m.category === cat.id);
            if (items.length === 0) {
                ctx.fillStyle = '#94a3b8';
                ctx.font = 'italic 13px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`No hay macroprocesos en esta categoría para ${activeMapProject}.`, 1000, cat.y + 110);
                return;
            }

            const maxRowWidth = 1560;
            const gap = 30;
            let cardWidth = 480;
            let totalWidth = items.length * cardWidth + (items.length - 1) * gap;
            
            if (totalWidth > maxRowWidth) {
                cardWidth = Math.floor((maxRowWidth - (items.length - 1) * gap) / items.length);
            }
            
            const startX = 180 + (1640 - (items.length * cardWidth + (items.length - 1) * gap)) / 2;

            items.forEach((macro, idx) => {
                const cardX = startX + idx * (cardWidth + gap);
                const cardY = cat.y;
                const cardHeight = 240;

                // Draw Card shadow and background
                ctx.fillStyle = '#ffffff';
                ctx.shadowColor = 'rgba(15, 23, 42, 0.04)';
                ctx.shadowBlur = 10;
                ctx.shadowOffsetY = 4;
                roundRectLocal(ctx, cardX, cardY, cardWidth, cardHeight, 12);
                ctx.fill();
                ctx.shadowColor = 'transparent';

                // Gradient interior border overlay or subtle color
                ctx.strokeStyle = cat.strokeColor;
                ctx.lineWidth = 1.5;
                roundRectLocal(ctx, cardX, cardY, cardWidth, cardHeight, 12);
                ctx.stroke();

                // Draw top mini metadata
                ctx.fillStyle = '#94a3b8';
                ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(macro.project || activeMapProject, cardX + 16, cardY + 28);

                // Draw Macroprocess Title
                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 13px system-ui, -apple-system, sans-serif';
                wrapText(ctx, macro.macroprocess, cardX + 16, cardY + 48, cardWidth - 32, 16, 2);

                // Load grouped sub-processes
                let groupedProcesses = macro.standardGroupedProcesses;
                if (!groupedProcesses && macro.microprocesses) {
                    const pMap: Record<string, { processName: string; totalRequired: number; totalApproved: number; }> = {};
                    macro.microprocesses.forEach((m: any) => {
                        const pName = m.process || 'Sin Proceso';
                        if (!pMap[pName]) pMap[pName] = { processName: pName, totalRequired: 0, totalApproved: 0 };
                        pMap[pName].totalRequired += m.totalRequired;
                        pMap[pName].totalApproved += m.totalApproved;
                    });
                    groupedProcesses = Object.values(pMap);
                }
                groupedProcesses = groupedProcesses || [];

                // Render standard processes inside this macroprocess
                ctx.fillStyle = '#94a3b8';
                ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
                ctx.fillText(`PROCESOS (${groupedProcesses.length})`, cardX + 16, cardY + 95);

                const subBoxWidth = Math.max(105, Math.floor((cardWidth - 32 - (Math.min(3, groupedProcesses.length) - 1) * 10) / Math.min(3, groupedProcesses.length)));
                const subBoxHeight = 65;

                groupedProcesses.slice(0, 3).forEach((subp: any, sIdx: number) => {
                    const subX = cardX + 16 + sIdx * (subBoxWidth + 10);
                    const subY = cardY + 106;

                    // Draw process item box
                    ctx.fillStyle = '#f8fafc';
                    ctx.strokeStyle = '#e2e8f0';
                    ctx.lineWidth = 1;
                    roundRectLocal(ctx, subX, subY, subBoxWidth, subBoxHeight, 8);
                    ctx.fill();
                    ctx.stroke();

                    // Text inside process box
                    ctx.fillStyle = '#334155';
                    ctx.font = 'bold 9.5px system-ui, -apple-system, sans-serif';
                    wrapText(ctx, subp.processName, subX + 8, subY + 18, subBoxWidth - 16, 12, 2);

                    // Badge for percentage
                    const pProgress = subp.totalRequired > 0 ? Math.round((subp.totalApproved / subp.totalRequired) * 100) : 0;
                    ctx.fillStyle = '#e0e7ff';
                    roundRectLocal(ctx, subX + 8, subY + 44, 34, 14, 4);
                    ctx.fill();

                    ctx.fillStyle = '#4338ca';
                    ctx.font = 'bold 9px system-ui, -apple-system, sans-serif';
                    ctx.textAlign = 'center';
                    ctx.fillText(`${pProgress}%`, subX + 25, subY + 54);
                    ctx.textAlign = 'left';
                });

                if (groupedProcesses.length > 3) {
                    ctx.fillStyle = '#64748b';
                    ctx.font = 'bold 9.5px system-ui, -apple-system, sans-serif';
                    ctx.fillText(`+ ${groupedProcesses.length - 3} más`, cardX + cardWidth - 65, cardY + 95);
                }

                // Footer section (Progress bar)
                const progress = macro.totalRequired > 0 ? Math.round((macro.totalApproved / macro.totalRequired) * 100) : 0;
                ctx.fillStyle = '#64748b';
                ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                ctx.fillText(`${macro.totalApproved}/${macro.totalRequired} Docs`, cardX + 16, cardY + 205);

                // Progress Badge background
                ctx.fillStyle = cat.pillBg;
                roundRectLocal(ctx, cardX + cardWidth - 56, cardY + 194, 40, 16, 4);
                ctx.fill();

                ctx.fillStyle = cat.pillText;
                ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${progress}%`, cardX + cardWidth - 36, cardY + 206);
                ctx.textAlign = 'left';

                // Draw Progress Bar
                ctx.fillStyle = '#f1f5f9';
                roundRectLocal(ctx, cardX + 16, cardY + 220, cardWidth - 32, 5, 2.5);
                ctx.fill();

                ctx.fillStyle = cat.progressColor;
                roundRectLocal(ctx, cardX + 16, cardY + 220, Math.max(5, Math.floor((cardWidth - 32) * (progress / 100))), 5, 2.5);
                ctx.fill();
            });
        });

        // --- DECORATIVE CONNECTIVITY ARROWS ---
        // Downward arrows from Strategic to Operational
        ctx.fillStyle = '#f59e0b';
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 2;
        [500, 1000, 1500].forEach(ax => {
            ctx.beginPath();
            ctx.moveTo(ax, 498);
            ctx.lineTo(ax, 522);
            ctx.stroke();

            // Arrow Head
            ctx.beginPath();
            ctx.moveTo(ax - 5, 517);
            ctx.lineTo(ax, 522);
            ctx.lineTo(ax + 5, 517);
            ctx.fill();
        });

        // Upward arrows from Support to Operational
        ctx.fillStyle = '#7c3aed';
        ctx.strokeStyle = '#7c3aed';
        ctx.lineWidth = 2;
        [500, 1000, 1500].forEach(ax => {
            ctx.beginPath();
            ctx.moveTo(ax, 932);
            ctx.lineTo(ax, 908);
            ctx.stroke();

            // Arrow Head
            ctx.beginPath();
            ctx.moveTo(ax - 5, 913);
            ctx.lineTo(ax, 908);
            ctx.lineTo(ax + 5, 913);
            ctx.fill();
        });

        // Footer note
        ctx.fillStyle = '#94a3b8';
        ctx.font = 'italic 11px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Gestión de Documentación de Procesos (SGD)  |  visualización optimizada para presentaciones de alto nivel', 1000, 1315);

        const link = document.createElement('a');
        link.download = `mapa-procesos-${activeMapProject.toLowerCase()}-${mapDocTypeFilter.toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
    };

    useEffect(() => {
        if (filterProject) {
            setActiveMapProject(filterProject);
        } else {
            const hpcProj = availableMapProjects.find(p => p.toUpperCase() === 'HPC');
            if (hpcProj) {
                setActiveMapProject(hpcProj);
            } else if (availableMapProjects.length > 0) {
                setActiveMapProject(availableMapProjects[0]);
            }
        }
    }, [filterProject, availableMapProjects]);

    const filteredCoverageList = useMemo(() => {
        const query = coverageSearch.toLowerCase();
        if (!query) return coverageAnalytics.list;
        return coverageAnalytics.list.filter(g => 
            g.macroprocess.toLowerCase().includes(query) ||
            g.process.toLowerCase().includes(query) ||
            g.microprocess.toLowerCase().includes(query)
        );
    }, [coverageAnalytics.list, coverageSearch]);

    const totalCoveragePages = Math.ceil(filteredCoverageList.length / 15);

    const displayedCoverage = useMemo(() => {
        const start = (coveragePage - 1) * 15;
        return filteredCoverageList.slice(start, start + 15);
    }, [filteredCoverageList, coveragePage]);

    const handleExportCoverageCSV = () => {
        let csvContent = "data:text/csv;charset=utf-8,\uFEFF";
        csvContent += "Proyecto,Macroproceso,Proceso,Microproceso,Doc AS IS,Doc FCE,Doc PM,Doc TO BE,Total Requeridos,Total Aprobados,Porcentaje Cobertura\n";
        
        coverageAnalytics.list.forEach(g => {
            const asIsState = g.docs['AS IS']?.state || 'No Iniciado';
            const fceState = g.docs['FCE']?.state || 'No Iniciado';
            const pmState = g.docs['PM']?.state || 'No Iniciado';
            const toBeState = g.docs['TO BE']?.state || 'No Iniciado';
            const percentage = g.totalRequired > 0 ? Math.round((g.totalApproved / g.totalRequired) * 100) : 0;
            
            const row = [
                `"${g.project.replace(/"/g, '""')}"`,
                `"${g.macroprocess.replace(/"/g, '""')}"`,
                `"${g.process.replace(/"/g, '""')}"`,
                `"${g.microprocess.replace(/"/g, '""')}"`,
                `"${asIsState}"`,
                `"${fceState}"`,
                `"${pmState}"`,
                `"${toBeState}"`,
                g.totalRequired,
                g.totalApproved,
                `${percentage}%`
            ].join(",");
            csvContent += row + "\n";
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `Cobertura_Procesos_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const executiveMetrics = useMemo(() => {
        if (!filteredDocs.length) return { stuckDocs: [] as StuckDoc[] };
        const now = new Date().getTime();
        const historyByDoc: Record<string, DocHistory[]> = {};
        history.forEach(h => { if (!historyByDoc[h.documentId]) historyByDoc[h.documentId] = []; historyByDoc[h.documentId].push(h); });
        const stuckDocsList: StuckDoc[] = [];
        filteredDocs.forEach(d => {
            if (d.state === DocState.APPROVED || d.state === DocState.NOT_STARTED) return;
            const docHistory = historyByDoc[d.id] || [];
            const lastTransition = docHistory.filter(h => h.newState === d.state).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
            const stateEntryDate = lastTransition ? new Date(lastTransition.timestamp).getTime() : new Date(d.createdAt).getTime();
            const daysInState = Math.max(0, Math.floor((now - stateEntryDate) / (1000 * 60 * 60 * 24)));
            if (daysInState > 30) stuckDocsList.push({ ...d, daysStuck: daysInState });
        });
        return { stuckDocs: stuckDocsList.sort((a, b) => b.daysStuck - a.daysStuck) };
    }, [history, filteredDocs]);

    const stateData = useMemo(() => {
        const stats = { 
            notStarted: { value: 0, ids: [] as string[] }, 
            inProcess: { value: 0, ids: [] as string[] }, 
            referent: { value: 0, ids: [] as string[] }, 
            control: { value: 0, ids: [] as string[] }, 
            finished: { value: 0, ids: [] as string[] } 
        };
        filteredDocs.forEach(d => {
            if (d.state === DocState.NOT_STARTED) { stats.notStarted.value++; stats.notStarted.ids.push(d.id); }
            else if (d.state === DocState.APPROVED) { stats.finished.value++; stats.finished.ids.push(d.id); }
            else if (d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW) { stats.referent.value++; stats.referent.ids.push(d.id); }
            else if (d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW) { stats.control.value++; stats.control.ids.push(d.id); }
            else { stats.inProcess.value++; stats.inProcess.ids.push(d.id); }
        });
        // Retornamos en el orden exacto solicitado para el gráfico de torta
        return [ 
            { name: 'No Iniciado', ...stats.notStarted }, 
            { name: 'En Proceso', ...stats.inProcess }, 
            { name: 'Referente', ...stats.referent }, 
            { name: 'Control', ...stats.control }, 
            { name: 'Terminados', ...stats.finished } 
        ];
    }, [filteredDocs]);

    const analystData = useMemo(() => {
        const stats: Record<string, { assigned: string[], approved: string[], inProgress: string[] }> = {};
        filteredDocs.forEach(d => {
            d.assignees?.forEach(uid => {
                if (!stats[uid]) stats[uid] = { assigned: [], approved: [], inProgress: [] };
                stats[uid].assigned.push(d.id); 
                if (d.state === DocState.APPROVED) stats[uid].approved.push(d.id); 
                else if (d.state !== DocState.NOT_STARTED) stats[uid].inProgress.push(d.id);
            });
        });
        return Object.keys(stats).map(uid => { 
            const u = users.find(user => user.id === uid); 
            return { 
                name: u ? (u.nickname || u.name.split(' ')[0]) : 'Desc.', 
                Priorizados: stats[uid].assigned.length, 
                EnProceso: stats[uid].inProgress.length, 
                Terminados: stats[uid].approved.length,
                priorizadosIds: stats[uid].assigned,
                enProcesoIds: stats[uid].inProgress,
                terminadosIds: stats[uid].approved
            }; 
        }).sort((a, b) => b.Priorizados - a.Priorizados).slice(0, 10);
    }, [filteredDocs, users]);

    const typeComplianceData = useMemo(() => {
        const types: DocType[] = ['AS IS', 'FCE', 'PM', 'TO BE'];
        return types.map((type) => {
            const docsOfType = filteredDocs.filter(d => d.docType === type);
            const finishedDocs = docsOfType.filter(d => d.state === DocState.APPROVED);
            const percent = docsOfType.length > 0 ? Math.round((finishedDocs.length / docsOfType.length) * 100) : 0;
            return { 
                type, 
                total: docsOfType.length, 
                finished: finishedDocs.length, 
                percent, 
                color: TYPE_COLORS[type], 
                finishedIds: finishedDocs.map(d => d.id), 
                pendingIds: docsOfType.filter(d => d.state !== DocState.APPROVED).map(d => d.id),
                totalIds: docsOfType.map(d => d.id)
            };
        });
    }, [filteredDocs]);

    const evolutionData = useMemo(() => {
        const monthsNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const now = new Date();
        const periods: any[] = [];
        if (chartScale === 'ANNUAL') { for (let i = 4; i >= 0; i--) { const year = now.getFullYear() - i; periods.push({ key: year.toString(), label: year.toString(), 'AS IS': 0, 'FCE': 0, 'PM': 0, 'TO BE': 0, ids: { 'AS IS': [], 'FCE': [], 'PM': [], 'TO BE': [] } }); } } 
        else if (chartScale === 'MONTHLY') { for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const label = `${monthsNames[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`; const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; periods.push({ key: yearMonthKey, label: label, 'AS IS': 0, 'FCE': 0, 'PM': 0, 'TO BE': 0, ids: { 'AS IS': [], 'FCE': [], 'PM': [], 'TO BE': [] } }); } } 
        else if (chartScale === 'WEEKLY') { for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - (i * 7)); const weekNum = Math.ceil(d.getDate() / 7); const label = `S${weekNum}-${monthsNames[d.getMonth()]}`; const firstDayOfYear = new Date(d.getFullYear(), 0, 1); const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000; const weekOfYear = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7); const key = `${d.getFullYear()}-W${weekOfYear}`; periods.push({ key, label, 'AS IS': 0, 'FCE': 0, 'PM': 0, 'TO BE': 0, ids: { 'AS IS': [], 'FCE': [], 'PM': [], 'TO BE': [] } }); } }
        
        filteredDocs.filter(d => d.state === DocState.APPROVED).forEach(d => {
            const date = new Date(d.updatedAt); if (isNaN(date.getTime())) return;
            let docKey = ''; if (chartScale === 'ANNUAL') { docKey = date.getFullYear().toString(); } else if (chartScale === 'MONTHLY') { docKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; } else if (chartScale === 'WEEKLY') { const firstDayOfYear = new Date(date.getFullYear(), 0, 1); const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000; const weekOfYear = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7); docKey = `${date.getFullYear()}-W${weekOfYear}`; }
            const period = periods.find(p => p.key === docKey); 
            if (period && d.docType) {
                period[d.docType]++;
                (period.ids as any)[d.docType].push(d.id);
            }
        });
        return periods;
    }, [filteredDocs, chartScale]);

    const goToDashboard = (ids: string[]) => navigate('/dashboard', { state: { filterIds: ids, fromReport: true } });

    const handleExportClosureExcel = () => {
        if (closureBoardData.length === 0) return;
        const headers = ['PROYECTO', 'MACROPROCESO', 'PROCESO', 'MICROPROCESO', 'Versión AS IS', 'Estado AS IS', 'Versión FCE', 'Estado FCE', 'Versión PM', 'Estado PM', 'Versión TO BE', 'Estado TO BE', 'PERIODO'];
        const rows = closureBoardData.map(item => {
            const getInfo = (type: string) => { const data = item.docs[type]; if (!data) return { v: '-', s: 'No req.' }; return { v: data.version, s: STATE_CONFIG[data.state as DocState]?.label.split('(')[0].trim() || '-' }; };
            const asis = getInfo('AS IS'); const fce = getInfo('FCE'); const pm = getInfo('PM'); const tobe = getInfo('TO BE');
            return [item.project, item.macro, item.process, item.micro, asis.v, asis.s, fce.v, fce.s, pm.v, pm.s, tobe.v, tobe.s, closureMonth];
        });
        const csvContent = [headers.join(';'), ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))].join('\n');
        const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.setAttribute('href', url); link.setAttribute('download', `SGD_Cierre_Mensual_${closureMonth}.csv`);
        link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleCfdZoomIn = () => { if (cfdRange === 12) setCfdRange(6); else if (cfdRange === 6) setCfdRange(3); };
    const handleCfdZoomOut = () => { if (cfdRange === 3) setCfdRange(6); else if (cfdRange === 6) setCfdRange(12); };
    const handleEvolutionZoomIn = () => { if (chartScale === 'ANNUAL') setChartScale('MONTHLY'); else if (chartScale === 'MONTHLY') setChartScale('WEEKLY'); };
    const handleEvolutionZoomOut = () => { if (chartScale === 'WEEKLY') setChartScale('MONTHLY'); else if (chartScale === 'MONTHLY') setChartScale('ANNUAL'); };

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Analizando métricas ejecutivas...</div>;

    const totalStuck = executiveMetrics.stuckDocs.length;
    const totalStuckPages = Math.ceil(totalStuck / 6);
    const displayedStuck = executiveMetrics.stuckDocs.slice((stuckPage - 1) * 6, stuckPage * 6);
    const totalClosureItems = closureBoardData.length;
    const totalClosurePages = Math.ceil(totalClosureItems / 15);
    const displayedClosure = closureBoardData.slice((closurePage - 1) * 15, closurePage * 15);

    const generateMonthOptions = () => {
        const options = []; const startDate = new Date(2025, 11, 1); const now = new Date(); let current = new Date(now.getFullYear(), now.getMonth(), 1); const limit = startDate;
        while (current >= limit) { const val = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`; const label = current.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); options.push(<option key={val} value={val}>{label}</option>); current.setMonth(current.getMonth() - 1); }
        if (options.length === 0) { const val = "2025-12"; const label = startDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }); options.push(<option key={val} value={val}>{label}</option>); }
        return options;
    };

    const getScaleLabel = (scale: string) => {
        switch (scale) {
            case 'ANNUAL': return 'Anual';
            case 'MONTHLY': return 'Mensual';
            case 'WEEKLY': return 'Semanal';
            default: return 'Mensual';
        }
    };

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><LayoutDashboard className="text-indigo-600" /> Panel de Control</h1>
                    <p className="text-slate-500">Métricas institucionales y estados de cumplimiento.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <Filter size={16} className="text-slate-400 ml-2" />
                    <select value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setClosurePage(1); }} className={`bg-transparent text-sm font-medium text-slate-700 outline-none p-1 min-w-[150px] ${!isAnalyst ? 'border-r border-slate-100' : ''}`}>
                        <option value="">Todos los Proyectos</option>
                        {Array.from(new Set(unifiedData.map(d => d.project).filter(Boolean))).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    {!isAnalyst && (
                        <select value={filterAnalyst} onChange={(e) => { setFilterAnalyst(e.target.value); setClosurePage(1); }} className="bg-transparent text-sm font-medium text-slate-700 outline-none p-1 min-w-[150px]">
                            <option value="">Todos los Analistas</option>
                            {users.filter(u => u.role === UserRole.ANALYST).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    )}
                </div>
            </div>

            <div className="flex flex-col sm:flex-row bg-slate-100 p-1 rounded-xl w-fit gap-1">
                {(user.role === UserRole.ADMIN || user.canAccessReportGestion !== false) && (
                    <button onClick={() => setActiveTab('REPORTS')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'REPORTS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><BarChart2 size={18} /> Reportes de Gestión</button>
                )}
                {(user.role === UserRole.ADMIN || user.canAccessReportContinuity !== false) && (
                    <button onClick={() => setActiveTab('SUMMARY')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'SUMMARY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><ShieldAlert size={18} /> Monitor de Continuidad</button>
                )}
                {(user.role === UserRole.ADMIN || user.canAccessReportMonthly !== false) && (
                    <button onClick={() => setActiveTab('CLOSURE')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'CLOSURE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TableProperties size={18} /> Cierre Mensual</button>
                )}
                {(user.role === UserRole.ADMIN || user.canAccessReportCoverage) && (
                    <button onClick={() => setActiveTab('MAP')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'MAP' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Network size={18} /> Gestión por Procesos</button>
                )}
                {(user.role === UserRole.ADMIN || user.canAccessBIQueryBuilder) && (
                    <button onClick={() => setActiveTab('BI')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'BI' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><Database size={18} /> Constructor de Consultas (BI)</button>
                )}
            </div>

            <div className="animate-fadeIn">
                {activeTab === 'REPORTS' && (
                    <section className="space-y-8">
                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1 text-slate-400">
                                <Layers size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Estado de Microprocesos (Jerarquía Agregada)</span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                                <KPICard title="MicroProc. Priorizados" value={microStats.total.length} icon={Layers} color="slate" sub="Universo Total" onClick={() => setMicroDrillDown({title: "Microprocesos Priorizados", color: "slate", items: microStats.total})} canClick={microStats.total.length > 0} />
                                <KPICard title="No Iniciado" value={microStats.notStarted.length} icon={Clock} color="slate" sub="0% avance docs." onClick={() => setMicroDrillDown({title: "Microprocesos No Iniciados", color: "slate", items: microStats.notStarted})} canClick={microStats.notStarted.length > 0} />
                                <KPICard title="En Proceso" value={microStats.inProcess.length} icon={Activity} color="indigo" sub="Docs. en elaboración" onClick={() => setMicroDrillDown({title: "Microprocesos En Proceso", color: "indigo", items: microStats.inProcess})} canClick={microStats.inProcess.length > 0} />
                                <KPICard title="Referente" value={microStats.referent.length} icon={Users} color="amber" sub="En validación experta" onClick={() => setMicroDrillDown({title: "Microprocesos en Referente", color: "amber", items: microStats.referent})} canClick={microStats.referent.length > 0} />
                                <KPICard title="Control Gestión" value={microStats.control.length} icon={ShieldCheck} color="amber" sub="En revisión final CG" onClick={() => setMicroDrillDown({title: "Microprocesos en Control de Gestión", color: "amber", items: microStats.control})} canClick={microStats.control.length > 0} />
                                <KPICard title="Terminados" value={microStats.finished.length} icon={CheckCircle} color="green" sub="100% docs. aprobados" onClick={() => setMicroDrillDown({title: "Microprocesos Terminados", color: "green", items: microStats.finished})} canClick={microStats.finished.length > 0} />
                            </div>
                        </div>

                        {microDrillDown && (
                            <div className="bg-white rounded-xl shadow-md border border-slate-200 animate-slideUp overflow-hidden">
                                <div className={`p-4 border-b border-slate-100 flex justify-between items-center ${microDrillDown.color === 'green' ? 'bg-green-50' : microDrillDown.color === 'indigo' ? 'bg-indigo-50' : microDrillDown.color === 'amber' ? 'bg-amber-50' : 'bg-slate-50'}`}>
                                    <div className="flex items-center gap-3">
                                        <Layers size={18} className={microDrillDown.color === 'green' ? 'text-green-600' : microDrillDown.color === 'indigo' ? 'text-indigo-600' : microDrillDown.color === 'amber' ? 'text-amber-600' : 'text-slate-600'} />
                                        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide">{microDrillDown.title} ({microDrillDown.items.length})</h3>
                                    </div>
                                    <button onClick={() => setMicroDrillDown(null)} className="p-1 hover:bg-white rounded-full transition-colors text-slate-400 hover:text-slate-600">
                                        <X size={20} />
                                    </button>
                                </div>
                                <div className="p-6">
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                                        {microDrillDown.items.map((item, idx) => (
                                            <div key={idx} onClick={() => goToDashboard(item.ids)} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-indigo-400 hover:bg-white transition-all cursor-pointer group">
                                                <div className="p-2 bg-white rounded-lg shadow-sm group-hover:bg-indigo-50 transition-colors">
                                                    <FolderTree size={16} className="text-indigo-500" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600 transition-colors">{item.name}</p>
                                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">{item.project}</p>
                                                </div>
                                                <ArrowRight size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-all" />
                                            </div>
                                        ))}
                                    </div>
                                    <div className="mt-6 flex justify-end">
                                        <button onClick={() => goToDashboard(microDrillDown.items.flatMap(i => i.ids))} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all text-xs font-bold shadow-sm">
                                            <ExternalLink size={14} /> Gestionar todos en Dashboard
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="space-y-3">
                            <div className="flex items-center gap-2 px-1 text-slate-400">
                                <FileText size={14} />
                                <span className="text-[10px] font-bold uppercase tracking-wider">Estado de Documentos (Detalle Individual)</span>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                                <KPICard title="Docs. Totales" value={kpis.total} icon={FileText} color="indigo" sub="Inventario Operativo" onClick={() => goToDashboard(kpis.totalIds)} canClick={kpis.total > 0} />
                                <KPICard title="Alertas Rev. Interna" value={kpis.overdueInternalIds.length} icon={AlertTriangle} color="amber" sub="&gt; 30 días en V0.n" onClick={() => goToDashboard(kpis.overdueInternalIds)} canClick={kpis.overdueInternalIds.length > 0} />
                                <KPICard title="Alertas Referente" value={kpis.overdueReferentIds.length} icon={AlertTriangle} color="amber" sub="&gt; 30 días en V1.n / V1.n.i" onClick={() => goToDashboard(kpis.overdueReferentIds)} canClick={kpis.overdueReferentIds.length > 0} />
                                <KPICard title="Alerta Control Gestión" value={kpis.overdueControlIds.length} icon={AlertTriangle} color="amber" sub="&gt; 30 días en V1.nAR" onClick={() => goToDashboard(kpis.overdueControlIds)} canClick={kpis.overdueControlIds.length > 0} />
                                <KPICard title="Docs. Terminados" value={kpis.approved} icon={CheckCircle} color="green" sub="Cierre Administrativo" onClick={() => goToDashboard(kpis.approvedIds)} canClick={kpis.approved > 0} />
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><Target size={16} /> Cumplimiento por Tipo de Documento</h3>
                            <p className="text-xs text-slate-500 mb-8">Efectividad de entrega sobre el universo total priorizado.</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                {typeComplianceData.map((item) => (
                                    <div key={item.type} className="flex flex-col items-center">
                                        <div className="relative w-28 h-28 mb-3">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={[{ name: 'Aprobados', value: item.percent, ids: item.finishedIds, fill: item.color }, { name: 'Pendientes', value: 100 - item.percent, ids: item.pendingIds, fill: '#f1f5f9' }]} cx="50%" cy="50%" innerRadius={35} outerRadius={50} startAngle={90} endAngle={-270} dataKey="value" stroke="none" onClick={(data: any) => { if (data && data.ids && data.ids.length > 0) goToDashboard(data.ids); }}>
                                                        <Cell key="progress" className="cursor-pointer" />
                                                        <Cell key="bg" className="cursor-pointer" />
                                                    </Pie>
                                                </PieChart>
                                            </ResponsiveContainer>
                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-lg font-extrabold text-slate-800">{item.percent}%</div>
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 uppercase">{item.type}</span>
                                        <span className="text-[10px] text-slate-400 mt-1">{item.finished} de {item.total} aprobados</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className={`grid grid-cols-1 ${isAnalyst ? '' : 'lg:grid-cols-3'} gap-6`}>
                            <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 ${isAnalyst ? '' : 'lg:col-span-1'}`}>
                                <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center gap-2"><Briefcase size={16} /> Distribución por Estado</h3>
                                <div className="h-[250px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={stateData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onClick={(data: any) => { if (data && data.ids && data.ids.length > 0) goToDashboard(data.ids); }}>
                                                {stateData.map((entry, index) => <Cell key={index} fill={STATE_COLOR_MAP[entry.name] || '#94a3b8'} className="cursor-pointer" />)}
                                            </Pie>
                                            <Tooltip />
                                            <Legend layout="horizontal" align="center" verticalAlign="bottom" iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            {!isAnalyst && (
                                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center gap-2"><Users size={16} /> Productividad por Analista</h3>
                                    <div className="h-[250px]">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={analystData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="name" tick={{fontSize: 10}} />
                                            <YAxis allowDecimals={false} tick={{fontSize: 10}} />
                                            <Tooltip cursor={{fill: '#f8fafc'}} />
                                            <Legend />
                                            <Bar dataKey="Priorizados" fill="#94a3b8" radius={[4, 4, 0, 0]} onClick={(data: any) => { if (data && data.priorizadosIds) goToDashboard(data.priorizadosIds); }} className="cursor-pointer" />
                                            <Bar dataKey="EnProceso" name="En Proceso" fill="#3b82f6" radius={[4, 4, 0, 0]} onClick={(data: any) => { if (data && data.enProcesoIds) goToDashboard(data.enProcesoIds); }} className="cursor-pointer" />
                                            <Bar dataKey="Terminados" fill="#22c55e" radius={[4, 4, 0, 0]} onClick={(data: any) => { if (data && data.terminadosIds) goToDashboard(data.terminadosIds); }} className="cursor-pointer" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2"><TrendingUp size={16} /> Evolución de Cierres</h3>
                                    <p className="text-xs text-slate-500">Velocidad de entrega acumulada por periodo. Escala: <b>{getScaleLabel(chartScale)}</b></p>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                                    <button onClick={handleEvolutionZoomOut} disabled={chartScale === 'ANNUAL'} className="p-1.5 hover:bg-white hover:text-indigo-600 disabled:opacity-30 rounded transition-all" title="Zoom Out (Menos detalle / Anual)"><ZoomOut size={18} /></button>
                                    <div className="px-2 text-[10px] font-bold uppercase text-slate-500 min-w-[70px] text-center">{getScaleLabel(chartScale)}</div>
                                    <button onClick={handleEvolutionZoomIn} disabled={chartScale === 'WEEKLY'} className="p-1.5 hover:bg-white hover:text-indigo-600 disabled:opacity-30 rounded transition-all" title="Zoom In (Más detalle / Semanal)"><ZoomIn size={18} /></button>
                                </div>
                            </div>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>{Object.entries(TYPE_COLORS).map(([type, color]) => ( <linearGradient key={type} id={`grad-${type.replace(' ', '')}`} x1="0" x2="0" y2="1"><stop offset="5%" stopColor={color} stopOpacity={0.3}/><stop offset="95%" stopColor={color} stopOpacity={0}/></linearGradient> ))}</defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" tick={{fontSize: 11, fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} tickLine={false} />
                                        <YAxis allowDecimals={false} domain={[0, 'dataMax']} tick={{fontSize: 11, fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} tickLine={false} />
                                        <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                                        <Legend verticalAlign="top" height={40} iconType="circle" onClick={(o) => { const { dataKey } = o; setActiveType(activeType === dataKey ? null : dataKey as string); }} wrapperStyle={{ cursor: 'pointer' }} />
                                        {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => ( 
                                            <Area 
                                                key={type} 
                                                type="monotone" 
                                                dataKey={type} 
                                                stroke={TYPE_COLORS[type]} 
                                                fill={`url(#grad-${type.replace(' ', '')})`} 
                                                strokeWidth={2} 
                                                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                                                activeDot={{ r: 6 }} 
                                                hide={activeType !== null && activeType !== type} 
                                                onClick={(data: any) => { 
                                                    if (data && data.payload && data.payload.ids && data.payload.ids[type]) {
                                                        goToDashboard(data.payload.ids[type]);
                                                    }
                                                }}
                                                className="cursor-pointer"
                                            /> 
                                        ))}
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </section>
                )}

                {activeTab === 'SUMMARY' && (
                    <section className="space-y-6">
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            <AgileBucket title="No Iniciado" value={agileFlowStats.backlog.count} icon={Layers} color="slate" onClick={() => goToDashboard(agileFlowStats.backlog.ids)} />
                            <AgileBucket title="En Proceso" value={agileFlowStats.development.count} icon={PlayCircle} color="blue" onClick={() => goToDashboard(agileFlowStats.development.ids)} />
                            <AgileBucket title="Referente" value={agileFlowStats.referent.count} icon={Users} color="purple" onClick={() => goToDashboard(agileFlowStats.referent.ids)} />
                            <AgileBucket title="Control" value={agileFlowStats.control.count} icon={ShieldCheck} color="orange" onClick={() => goToDashboard(agileFlowStats.control.ids)} />
                            <AgileBucket title="Terminados" value={agileFlowStats.done.count} icon={CheckCircle} color="green" onClick={() => goToDashboard(agileFlowStats.done.ids)} />
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2"><TrendingUp size={18} className="text-indigo-600" /> Diagrama de Flujo Acumulado (CFD)</h3>
                                    <p className="text-xs text-slate-500">Tendencia histórica de estados. Rango: <b>{cfdRange} meses</b></p>
                                </div>
                                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-lg border border-slate-200">
                                    <button onClick={handleCfdZoomOut} disabled={cfdRange === 12} className="p-1.5 hover:bg-white hover:text-indigo-600 disabled:opacity-30 rounded transition-all" title="Zoom Out (Más tiempo)"><ZoomOut size={18} /></button>
                                    <div className="px-2 text-[10px] font-bold uppercase text-slate-500 min-w-[70px] text-center">{cfdRange} Meses</div>
                                    <button onClick={handleCfdZoomIn} disabled={cfdRange === 3} className="p-1.5 hover:bg-white hover:text-indigo-600 disabled:opacity-30 rounded transition-all" title="Zoom In (Más detalle)"><ZoomIn size={18} /></button>
                                </div>
                            </div>
                            <div className="h-[280px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={cfdData}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                        <XAxis dataKey="month" tick={{fontSize: 10}} />
                                        <YAxis tick={{fontSize: 10}} />
                                        <Tooltip />
                                        <Legend verticalAlign="top" align="right" iconType="circle" />
                                        {/* Definimos las áreas en el orden exacto solicitado para que la leyenda sea correcta */}
                                        <Area type="monotone" dataKey="No Iniciado" stackId="1" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.4} onClick={(data: any) => { if (data && data.payload && data.payload.ids) goToDashboard(data.payload.ids['No Iniciado']); }} className="cursor-pointer" />
                                        <Area type="monotone" dataKey="En Proceso" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} onClick={(data: any) => { if (data && data.payload && data.payload.ids) goToDashboard(data.payload.ids['En Proceso']); }} className="cursor-pointer" />
                                        <Area type="monotone" dataKey="Referente" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.4} onClick={(data: any) => { if (data && data.payload && data.payload.ids) goToDashboard(data.payload.ids['Referente']); }} className="cursor-pointer" />
                                        <Area type="monotone" dataKey="Control" stackId="1" stroke="#f97316" fill="#f97316" fillOpacity={0.4} onClick={(data: any) => { if (data && data.payload && data.payload.ids) goToDashboard(data.payload.ids['Control']); }} className="cursor-pointer" />
                                        <Area type="monotone" dataKey="Terminados" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} onClick={(data: any) => { if (data && data.payload && data.payload.ids) goToDashboard(data.payload.ids['Terminados']); }} className="cursor-pointer" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                            <div className="p-6 pb-2">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2"><ShieldAlert size={16} className="text-red-500" /> Alertas de Continuidad (&gt;30 días)</h3>
                                        <p className="text-xs text-slate-500 mt-1">Identificación de documentos con flujo detenido que requieren gestión prioritaria.</p>
                                    </div>
                                    {totalStuck > 0 && (
                                        <button onClick={() => goToDashboard(executiveMetrics.stuckDocs.map(d => d.id))} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-bold text-xs uppercase tracking-wider">
                                            <ExternalLink size={14} /> Gestionar en Dashboard
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 px-6 pb-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {totalStuck === 0 ? ( <div className="col-span-full py-12 text-center text-slate-400"><CheckCircle size={32} className="mx-auto mb-2 text-green-200" /><p className="text-xs">Sin riesgos de continuidad detectados.</p></div> ) : displayedStuck.map((d: StuckDoc) => (
                                        <div key={d.id} onClick={() => navigate(`/doc/${d.id}`)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer group shadow-sm flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{d.project}</span>
                                                    <span className="text-[10px] font-bold px-2 py-1 rounded border bg-red-50 text-red-600 border-red-100 animate-pulse">{d.daysStuck} días</span>
                                                </div>
                                                <h4 className="text-xs font-bold text-slate-800 line-clamp-2 group-hover:text-indigo-600 leading-tight">{d.title}</h4>
                                            </div>
                                            <div className="flex items-center justify-between mt-4">
                                                <div className="flex items-center gap-1 text-[10px] text-slate-500"><Clock size={10} /><span>{new Date(d.updatedAt).toLocaleDateString()}</span></div>
                                                <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${STATE_CONFIG[d.state as DocState].color}`}>{STATE_CONFIG[d.state as DocState].label.split('(')[0]}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            {totalStuck > 6 && (
                                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="text-[11px] text-slate-500">Mostrando {Math.min(totalStuck, (stuckPage - 1) * 6 + 1)} - {Math.min(totalStuck, stuckPage * 6)} de {totalStuck} alertas</div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setStuckPage(p => Math.max(1, p - 1))} disabled={stuckPage === 1} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"><ChevronLeft size={16} /></button>
                                        <button onClick={() => setStuckPage(p => Math.min(totalStuckPages, p + 1))} disabled={stuckPage === totalStuckPages} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"><ChevronRight size={16} /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {activeTab === 'CLOSURE' && (
                    <section className="space-y-6">
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                            <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg"><CalendarDays size={24} /></div>
                                    <div><h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2">Tablero de Cierre Mensual</h3><p className="text-xs text-slate-500 mt-0.5">Estado jerárquico de la matriz al cierre de mes.</p></div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button onClick={handleExportClosureExcel} className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all shadow-sm text-xs font-bold"><FileSpreadsheet size={14} className="text-green-600" /> Exportar Cierre</button>
                                    <div className="h-6 w-px bg-slate-200 mx-1"></div>
                                    <div className="flex items-center gap-2"><label className="text-xs font-bold text-slate-400 uppercase">Periodo:</label><select value={closureMonth} onChange={(e) => { setClosureMonth(e.target.value); setClosurePage(1); }} className="bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">{generateMonthOptions()}</select></div>
                                </div>
                            </div>
                            
                            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex overflow-x-auto gap-4 custom-scrollbar">
                                <div className="flex-1 bg-white border border-slate-200 rounded-lg p-3 shadow-sm min-w-[120px]">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">No Iniciado</p>
                                    <p className="text-2xl font-black text-slate-700">{closureSummary.notStarted}</p>
                                </div>
                                <div className="flex-1 bg-white border border-indigo-200 rounded-lg p-3 shadow-sm min-w-[120px]">
                                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider mb-1">En Proceso</p>
                                    <p className="text-2xl font-black text-indigo-700">{closureSummary.inProcess}</p>
                                </div>
                                <div className="flex-1 bg-white border border-amber-200 rounded-lg p-3 shadow-sm min-w-[120px]">
                                    <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Referente</p>
                                    <p className="text-2xl font-black text-amber-700">{closureSummary.referent}</p>
                                </div>
                                <div className="flex-1 bg-white border border-orange-200 rounded-lg p-3 shadow-sm min-w-[120px]">
                                    <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider mb-1">Control</p>
                                    <p className="text-2xl font-black text-orange-700">{closureSummary.control}</p>
                                </div>
                                <div className="flex-1 bg-white border border-green-200 rounded-lg p-3 shadow-sm min-w-[120px]">
                                    <p className="text-[10px] font-bold text-green-600 uppercase tracking-wider mb-1">Terminados</p>
                                    <p className="text-2xl font-black text-green-700">{closureSummary.finished}</p>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[1500px]">
                                    <thead className="text-[10px] text-slate-400 uppercase font-bold bg-slate-50/50">
                                        <tr><th className="px-4 py-3 border-b border-slate-100">PROYECTO</th><th className="px-4 py-3 border-b border-slate-100">JERARQUÍA (MACRO / PROCESO)</th><th className="px-4 py-3 border-b border-slate-100 sticky left-0 bg-slate-50 z-10 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">MICROPROCESO</th><th className="px-4 py-3 border-b border-slate-100 text-center bg-blue-50/30" colSpan={2}>AS IS</th><th className="px-4 py-3 border-b border-slate-100 text-center bg-red-50/30" colSpan={2}>FCE</th><th className="px-4 py-3 border-b border-slate-100 text-center bg-yellow-50/30" colSpan={2}>PM</th><th className="px-4 py-3 border-b border-slate-100 text-center bg-green-50/30" colSpan={2}>TO BE</th></tr>
                                        <tr className="bg-slate-50/30 text-[8px] text-slate-400"><th colSpan={3} className="border-b border-slate-100 sticky left-0 bg-slate-50/30 z-10"></th><th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th><th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th><th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th><th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th><th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th><th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th><th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th><th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {displayedClosure.length === 0 ? ( <tr><td colSpan={11} className="p-12 text-center text-slate-400 font-medium">Sin datos registrados para los filtros seleccionados.</td></tr> ) : displayedClosure.map((item, idx) => (
                                            <tr key={`${item.project}-${item.micro}-${idx}`} className="hover:bg-slate-50/50 transition-colors text-[10px]">
                                                <td className="px-4 py-4 border-b border-slate-50 font-bold text-slate-700">{item.project}</td>
                                                <td className="px-4 py-4 border-b border-slate-50"><div className="flex flex-col"><span className="font-bold text-slate-700 truncate max-w-[200px]" title={item.macro}>{item.macro}</span><span className="text-slate-500 text-[9px] truncate max-w-[200px]" title={item.process}>{item.process}</span></div></td>
                                                <td className="px-4 py-4 border-b border-slate-50 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]"><span className="font-bold text-indigo-700">{item.micro}</span></td>
                                                {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => { const data = item.docs[type]; if (!data) return ( <React.Fragment key={type}><td className="px-2 py-4 border-b border-slate-50 text-center text-slate-200 italic border-l border-slate-50">-</td><td className="px-2 py-4 border-b border-slate-50 text-center text-slate-200 italic">No req.</td></React.Fragment> ); const cfg = STATE_CONFIG[data.state as DocState]; return ( <React.Fragment key={type}><td className="px-2 py-4 border-b border-slate-50 text-center font-mono font-bold text-slate-600 border-l border-slate-50">{data.version}</td><td className="px-2 py-4 border-b border-slate-50 text-center"><div className={`inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold border shadow-sm ${cfg.color}`}>{cfg.label.split('(')[0].trim()}</div></td></React.Fragment> ); })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {totalClosureItems > 15 && (
                                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                    <div className="text-[11px] text-slate-500">Mostrando {Math.min(totalClosureItems, (closurePage - 1) * 15 + 1)} - {Math.min(totalClosureItems, closurePage * 15)} de {totalClosureItems}</div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setClosurePage(p => Math.max(1, p - 1))} disabled={closurePage === 1} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button>
                                        <div className="flex gap-1">{Array.from({ length: Math.min(5, totalClosurePages) }, (_, i) => { let p = i + 1; if (totalClosurePages > 5 && closurePage > 3) p = closurePage - 2 + i; if (p > totalClosurePages) p = totalClosurePages - (4 - i); if (p < 1) p = i + 1; return (<button key={p} onClick={() => setClosurePage(p)} className={`w-7 h-7 rounded text-[10px] font-bold border transition-all ${closurePage === p ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:border-indigo-400'}`}>{p}</button>); })}</div>
                                        <button onClick={() => setClosurePage(p => Math.min(totalClosurePages, p + 1))} disabled={closurePage === totalClosurePages} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"><ChevronRight size={16} /></button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </section>
                )}

                {activeTab === 'MAP' && (
                    <section className="space-y-6 animate-fadeIn">
                        {/* Summary Header of Process Map */}
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2"><Network size={20} className="text-indigo-600" /> Gestión por Procesos</h3>
                                <p className="text-xs text-slate-500">Representación visual interactiva orientada al cliente y alineada con la Gestión por Procesos de la organización.</p>
                            </div>
                            <div className="flex flex-wrap items-center gap-4">
                                <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-500 bg-slate-50 p-3 rounded-lg border border-slate-100">
                                    <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-500 animate-pulse"></span> <span>Estratégicos · <strong className="font-extrabold text-amber-600">{categoryProgress.ESTRATEGICO}% Avance</strong></span></div>
                                    <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-sky-500 animate-pulse"></span> <span>Operativos · <strong className="font-extrabold text-sky-600">{categoryProgress.OPERATIVO}% Avance</strong></span></div>
                                    <div className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-purple-500 animate-pulse"></span> <span>Soporte · <strong className="font-extrabold text-purple-600">{categoryProgress.SOPORTE}% Avance</strong></span></div>
                                </div>
                                <div className="flex items-center gap-2 bg-indigo-50 border border-indigo-100 p-3 rounded-lg shadow-sm">
                                    <span className="text-xs font-black text-indigo-800 uppercase">Avance Total Proyecto:</span>
                                    <span className="text-sm font-black text-indigo-600 bg-white px-2 py-0.5 rounded shadow-sm border border-indigo-100">{totalProjectProgress}%</span>
                                </div>
                            </div>
                        </div>

                        {/* Sub-tab Navigation for Gestión por Procesos */}
                        <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl border border-slate-200/60 w-fit gap-1">
                            <button
                                onClick={() => setMapSubTab('DIAGRAM')}
                                className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                                    mapSubTab === 'DIAGRAM'
                                        ? 'bg-white text-indigo-600 shadow-sm font-black border border-slate-200/20'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <Network size={15} /> Mapa de Procesos Interactivo
                            </button>
                            <button
                                onClick={() => setMapSubTab('REPORTS')}
                                className={`px-5 py-2.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-2 ${
                                    mapSubTab === 'REPORTS'
                                        ? 'bg-white text-indigo-600 shadow-sm font-black border border-slate-200/20'
                                        : 'text-slate-500 hover:text-slate-800'
                                }`}
                            >
                                <BarChart2 size={15} /> Reportería por Documento y Avance
                            </button>
                        </div>

                        {mapSubTab === 'DIAGRAM' && (
                            <div className="space-y-6 animate-fadeIn">
                                {/* Filtros de Proyecto y de Tipo de Documento */}
                                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200/60 shadow-sm">
                                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Seleccionar de Proyecto:</span>
                                            <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/50 w-fit">
                                                {availableMapProjects.map((proj) => {
                                                    const isActive = activeMapProject === proj;
                                                    let fullName = proj;
                                                    if (proj === 'HPC') fullName = 'Hospital Provincia Cordillera (HPC)';
                                                    else if (proj === 'HSR') fullName = 'Hospital Sótero del Río (HSR)';
                                                    else if (proj === 'REU') fullName = 'Red de Urgencia (REU)';

                                                    return (
                                                        <button
                                                            key={proj}
                                                            onClick={() => setActiveMapProject(proj)}
                                                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                                                                isActive 
                                                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                                                    : 'text-slate-500 hover:text-slate-700'
                                                            }`}
                                                        >
                                                            {fullName}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Filtro de Documento:</span>
                                            <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/50 w-fit">
                                                {(['TODOS', 'AS IS', 'FCE', 'PM', 'TO BE'] as const).map((type) => {
                                                    const isActive = mapDocTypeFilter === type;
                                                    return (
                                                        <button
                                                            key={type}
                                                            onClick={() => setMapDocTypeFilter(type)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border ${
                                                                isActive 
                                                                    ? 'bg-white text-indigo-600 border-slate-200/60 shadow-sm font-black' 
                                                                    : 'text-slate-500 border-transparent hover:text-slate-700'
                                                            }`}
                                                        >
                                                            {type}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Analista:</span>
                                            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                                                {!isAnalyst ? (
                                                    <div className="flex items-center gap-1.5 px-2">
                                                        <Users size={14} className="text-slate-400" />
                                                        <select
                                                            value={filterAnalyst}
                                                            onChange={(e) => setFilterAnalyst(e.target.value)}
                                                            className="bg-transparent text-xs font-bold text-slate-700 outline-none pr-2 cursor-pointer"
                                                        >
                                                            <option value="">Todos los Analistas</option>
                                                            {users.filter(u => u.role === UserRole.ANALYST).map(u => (
                                                                <option key={u.id} value={u.id}>{u.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white rounded-lg shadow-xs flex items-center gap-1.5">
                                                        <UserCheck size={14} className="text-indigo-600" />
                                                        <span>{user.name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end lg:self-center">
                                        <button
                                            onClick={handleExportMapPNG}
                                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
                                        >
                                            <FileSpreadsheet size={16} /> Exportar Mapa (PNG)
                                        </button>
                                    </div>
                                </div>

                                {/* Interactive diagram diagram */}
                                <div className="bg-slate-50 border border-slate-100 rounded-2xl p-6 overflow-x-auto">
                                    <div className="min-w-[1180px] flex gap-5 relative items-stretch">
                                        
                                        {/* LEFT MARGIN: ENTRADA */}
                                        <div className="w-[110px] bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-5 relative shadow-sm flex-shrink-0">
                                            <div className="absolute top-3 left-0 right-0 text-[10.5px] text-slate-400 font-black font-mono text-center tracking-widest">ENTRADA</div>
                                            <p className="text-xs md:text-[13px] font-black text-slate-600 uppercase text-center leading-relaxed tracking-wider select-none [writing-mode:vertical-lr] rotate-180 flex items-center justify-center h-full">
                                                Requisitos esperados por partes interesadas
                                            </p>
                                        </div>

                                        {/* CENTER CONTAINER: VALUES FLOW */}
                                        <div className="flex-1 bg-white border border-slate-200 rounded-2xl p-6 flex flex-col gap-6 shadow-sm relative">
                                            
                                            {/* ROW 1: STRATEGIC */}
                                            <div className="relative">
                                                <div className="text-xs font-black text-amber-700 bg-amber-50 border border-amber-200/80 px-4 py-2 rounded-xl w-fit mb-4 uppercase tracking-wider flex items-center gap-2 shadow-sm">
                                                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span> Procesos Estratégicos ({activeMapProject})
                                                    <span className="text-slate-300">|</span>
                                                    <span className="text-amber-950 font-black">Avance Total: {categoryProgress.ESTRATEGICO}%</span>
                                                </div>
                                                {(() => {
                                                    const items = filteredProcessMapDataByProject.filter(m => m.category === 'ESTRATEGICO');
                                                    const gridClass = items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
                                                    return (
                                                        <div className={`grid ${gridClass} gap-4`}>
                                                            {items.length === 0 ? (
                                                                <div className="col-span-3 p-4 text-center text-xs text-slate-400 italic bg-slate-50 border border-dashed rounded-lg">No hay macroprocesos en esta categoría para {activeMapProject}.</div>
                                                            ) : (
                                                                items.map(macro => (
                                                                    <MacroCard key={`${macro.project}-${macro.macroprocess}`} macro={macro} onTypeSelect={(cat: any) => handleUpdateMacroCategory(macro.macroprocess, cat)} onDetailSelect={setSelectedMacroDetail} />
                                                                ))
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                                {/* Golden Down Arrows */}
                                                <div className="flex justify-around mt-4">
                                                    {[1, 2, 3].map(i => (
                                                        <div key={i} className="flex flex-col items-center">
                                                            <ChevronDown className="text-amber-400/80 animate-bounce duration-1000" size={18} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* ROW 2: OPERATIONAL */}
                                            <div className="relative bg-sky-50/20 p-4 border border-sky-100/50 rounded-xl">
                                                <div className="text-xs font-black text-sky-700 bg-sky-50 border border-sky-200/80 px-4 py-2 rounded-xl w-fit mb-4 uppercase tracking-wider flex items-center gap-2 shadow-sm">
                                                    <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span> Procesos Operativos (Cadena de Valor) ({activeMapProject})
                                                    <span className="text-slate-300">|</span>
                                                    <span className="text-sky-950 font-black">Avance Total: {categoryProgress.OPERATIVO}%</span>
                                                </div>
                                                {(() => {
                                                    const items = filteredProcessMapDataByProject.filter(m => m.category === 'OPERATIVO');
                                                    const gridClass = items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
                                                    return (
                                                        <div className={`grid ${gridClass} gap-4`}>
                                                            {items.length === 0 ? (
                                                                <div className="col-span-3 p-4 text-center text-xs text-slate-400 italic bg-slate-50 border border-dashed rounded-lg">No hay macroprocesos en esta categoría para {activeMapProject}.</div>
                                                            ) : (
                                                                items.map(macro => (
                                                                    <MacroCard key={`${macro.project}-${macro.macroprocess}`} macro={macro} onTypeSelect={(cat: any) => handleUpdateMacroCategory(macro.macroprocess, cat)} onDetailSelect={setSelectedMacroDetail} />
                                                                ))
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                            {/* ROW 3: SUPPORT */}
                                            <div className="relative mt-2">
                                                {/* Purple Up Arrows */}
                                                <div className="flex justify-around mb-4">
                                                    {[1, 2, 3].map(i => (
                                                        <div key={i} className="flex flex-col items-center">
                                                            <ChevronDown className="text-purple-400/80 rotate-180 animate-bounce duration-1000" size={18} />
                                                        </div>
                                                    ))}
                                                </div>
                                                <div className="text-xs font-black text-purple-700 bg-purple-50 border border-purple-200/80 px-4 py-2 rounded-xl w-fit mb-4 uppercase tracking-wider flex items-center gap-2 shadow-sm">
                                                    <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span> Procesos de Soporte y de Apoyo ({activeMapProject})
                                                    <span className="text-slate-300">|</span>
                                                    <span className="text-purple-950 font-black">Avance Total: {categoryProgress.SOPORTE}%</span>
                                                </div>
                                                {(() => {
                                                    const items = filteredProcessMapDataByProject.filter(m => m.category === 'SOPORTE');
                                                    const gridClass = items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3';
                                                    return (
                                                        <div className={`grid ${gridClass} gap-4`}>
                                                            {items.length === 0 ? (
                                                                <div className="col-span-3 p-4 text-center text-xs text-slate-400 italic bg-slate-50 border border-dashed rounded-lg">No hay macroprocesos en esta categoría para {activeMapProject}.</div>
                                                            ) : (
                                                                items.map(macro => (
                                                                    <MacroCard key={`${macro.project}-${macro.macroprocess}`} macro={macro} onTypeSelect={(cat: any) => handleUpdateMacroCategory(macro.macroprocess, cat)} onDetailSelect={setSelectedMacroDetail} />
                                                                ))
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>

                                        </div>

                                        {/* RIGHT MARGIN: SALIDA */}
                                        <div className="w-[110px] bg-white border border-slate-200 rounded-2xl flex items-center justify-center p-5 relative shadow-sm flex-shrink-0">
                                            <div className="absolute top-3 left-0 right-0 text-[10.5px] text-slate-400 font-black font-mono text-center tracking-widest">SALIDA</div>
                                            <p className="text-xs md:text-[13px] font-black text-slate-600 uppercase text-center leading-relaxed tracking-wider select-none [writing-mode:vertical-lr] flex items-center justify-center h-full">
                                                Requisitos satisfechos de las partes interesadas
                                            </p>
                                        </div>

                                    </div>
                                </div>
                            </div>
                        )}

                        {mapSubTab === 'REPORTS' && (
                            <div className="space-y-6 animate-fadeIn">
                                {/* Action Bar / Project Selection & Export Options */}
                                <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                                    <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Proyecto Seleccionado:</span>
                                            <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/50 w-fit">
                                                {availableMapProjects.map((proj) => {
                                                    const isActive = activeMapProject === proj;
                                                    let fullName = proj;
                                                    if (proj === 'HPC') fullName = 'Hospital Provincia Cordillera (HPC)';
                                                    else if (proj === 'HSR') fullName = 'Hospital Sótero del Río (HSR)';
                                                    else if (proj === 'REU') fullName = 'Red de Urgencia (REU)';

                                                    return (
                                                        <button
                                                            key={proj}
                                                            onClick={() => setActiveMapProject(proj)}
                                                            className={`px-4 py-2 rounded-lg text-xs font-black transition-all ${
                                                                isActive 
                                                                    ? 'bg-white text-indigo-600 shadow-sm' 
                                                                    : 'text-slate-500 hover:text-slate-700'
                                                            }`}
                                                        >
                                                            {fullName}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Filtro de Documento:</span>
                                            <div className="flex flex-wrap bg-slate-100 p-1 rounded-xl gap-1 border border-slate-200/50 w-fit">
                                                {(['TODOS', 'AS IS', 'FCE', 'PM', 'TO BE'] as const).map((type) => {
                                                    const isActive = mapDocTypeFilter === type;
                                                    return (
                                                        <button
                                                            key={type}
                                                            onClick={() => setMapDocTypeFilter(type)}
                                                            className={`px-3 py-1.5 rounded-lg text-xs font-extrabold transition-all border ${
                                                                isActive 
                                                                    ? 'bg-white text-indigo-600 border-slate-200/60 shadow-sm font-black' 
                                                                    : 'text-slate-500 border-transparent hover:text-slate-700'
                                                            }`}
                                                        >
                                                            {type}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className="space-y-1.5">
                                            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Analista:</span>
                                            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/50">
                                                {!isAnalyst ? (
                                                    <div className="flex items-center gap-1.5 px-2">
                                                        <Users size={14} className="text-slate-400" />
                                                        <select
                                                            value={filterAnalyst}
                                                            onChange={(e) => setFilterAnalyst(e.target.value)}
                                                            className="bg-transparent text-xs font-bold text-slate-700 outline-none pr-2 cursor-pointer"
                                                        >
                                                            <option value="">Todos los Analistas</option>
                                                            {users.filter(u => u.role === UserRole.ANALYST).map(u => (
                                                                <option key={u.id} value={u.id}>{u.name}</option>
                                                            ))}
                                                        </select>
                                                    </div>
                                                ) : (
                                                    <div className="px-3 py-1.5 text-xs font-bold text-indigo-700 bg-white rounded-lg shadow-xs flex items-center gap-1.5">
                                                        <UserCheck size={14} className="text-indigo-600" />
                                                        <span>{user.name}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 self-end lg:self-center">
                                        <button
                                            onClick={handleExportPNG}
                                            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
                                        >
                                            <FileSpreadsheet size={16} /> Exportar Gráficos (PNG)
                                        </button>
                                        <button
                                            onClick={() => window.print()}
                                            className="px-4 py-2.5 bg-white text-slate-700 border border-slate-200 font-bold text-xs rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-2 shadow-sm whitespace-nowrap"
                                        >
                                            <ExternalLink size={16} /> Imprimir Reporte
                                        </button>
                                    </div>
                                </div>

                                {/* KPI Metrics Row */}
                                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                                    <div 
                                        onClick={() => setMapDocTypeFilter('TODOS')}
                                        className={`cursor-pointer bg-gradient-to-br from-indigo-50 to-indigo-100/50 border rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all duration-300 ${
                                            mapDocTypeFilter === 'TODOS'
                                                ? 'border-indigo-400 ring-4 ring-indigo-100 scale-[1.02]'
                                                : 'border-indigo-200/60 hover:scale-[1.01]'
                                        }`}
                                    >
                                        <div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-[10px] font-black text-indigo-700/80 uppercase tracking-widest block">Avance General</span>
                                                {mapDocTypeFilter === 'TODOS' && (
                                                    <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase rounded-full tracking-wider">Activo</span>
                                                )}
                                            </div>
                                            <span className="text-3xl font-black text-indigo-900 block mt-2">{totalProjectProgress}%</span>
                                        </div>
                                        <p className="text-[11px] text-indigo-600 mt-4 font-semibold">Progreso integral de la documentación del proyecto.</p>
                                    </div>

                                    {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(type => {
                                        const stats = projectDocTypeStats[type] || { total: 0, approved: 0, inProcess: 0, initiated: 0, notStarted: 0, notRequired: 0 };
                                        const requiredTotal = stats.total - stats.notRequired;
                                        const percentage = requiredTotal > 0 ? Math.round((stats.approved / requiredTotal) * 100) : 0;
                                        
                                        const colors = {
                                            'AS IS': { border: 'border-blue-200', bg: 'bg-blue-50/50', text: 'text-blue-700', label: 'Procesos Actuales' },
                                            'FCE': { border: 'border-red-200', bg: 'bg-red-50/50', text: 'text-red-700', label: 'Fichas de Control' },
                                            'PM': { border: 'border-yellow-300', bg: 'bg-yellow-50/50', text: 'text-yellow-700', label: 'Modelos de Procesos' },
                                            'TO BE': { border: 'border-green-200', bg: 'bg-green-50/50', text: 'text-green-700', label: 'Procesos Futuros' }
                                        };
                                        const col = colors[type];

                                        const isFiltered = mapDocTypeFilter !== 'TODOS' && mapDocTypeFilter !== type;
                                        const isActiveFilter = mapDocTypeFilter === type;

                                        return (
                                            <div 
                                                key={type} 
                                                onClick={() => setMapDocTypeFilter(isActiveFilter ? 'TODOS' : type)}
                                                className={`cursor-pointer rounded-xl p-5 shadow-sm flex flex-col justify-between transition-all duration-300 ${
                                                    isFiltered 
                                                        ? 'bg-slate-50/40 border border-slate-200/40 opacity-45 grayscale-[20%]' 
                                                        : isActiveFilter
                                                            ? `bg-white border-2 ${col.border} ring-4 ring-indigo-50 scale-[1.02] relative`
                                                            : `bg-white border ${col.border} hover:scale-[1.01] hover:shadow-md`
                                                }`}
                                            >
                                                <div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block">{type}</span>
                                                        {isActiveFilter && (
                                                            <span className="px-1.5 py-0.5 bg-indigo-600 text-white text-[8px] font-black uppercase rounded-full tracking-wider">Activo</span>
                                                        )}
                                                    </div>
                                                    <span className="text-2xl font-black text-slate-800 block mt-1">{percentage}%</span>
                                                </div>
                                                <div className="mt-4 space-y-1.5 text-[11px] border-t border-slate-100 pt-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-slate-500">No requeridos:</span>
                                                        <span className="font-bold text-slate-400">{stats.notRequired}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-slate-500">No iniciados:</span>
                                                        <span className="font-bold text-slate-700">{stats.notStarted}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-slate-500">En Proceso:</span>
                                                        <span className="font-bold text-indigo-600">{(stats.inProcess + stats.initiated)}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between">
                                                        <span className="font-medium text-slate-500">Aprobados:</span>
                                                        <span className={`font-bold ${col.text}`}>{stats.approved}</span>
                                                    </div>
                                                    <div className="flex items-center justify-between border-t border-dashed border-slate-100 pt-1.5 mt-1.5">
                                                        <span className="font-semibold text-slate-600">Total:</span>
                                                        <span className="font-bold text-slate-800">{stats.total}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                {/* Recharts Visualizations */}
                                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                                    {/* Grouped Bar Chart */}
                                    <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5">
                                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-4">Distribución del Estado de Avance por Tipo de Documento</h4>
                                        <div className="h-[300px]">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <BarChart data={projectChartData} margin={{ top: 20, right: 10, left: -20, bottom: 0 }}>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                    <XAxis dataKey="name" stroke="#94a3b8" fontSize={11} fontWeight={600} tickLine={false} />
                                                    <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} />
                                                    <Tooltip cursor={{ fill: '#f8fafc' }} contentStyle={{ fontSize: '11px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.05)' }} />
                                                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                                                    <Bar dataKey="No Requerido" fill="#e2e8f0" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: '#475569', fontWeight: 'bold' }} />
                                                    <Bar dataKey="No Iniciado" fill="#cbd5e1" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: '#475569', fontWeight: 'bold' }} />
                                                    <Bar dataKey="En Proceso" fill="#3b82f6" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: '#475569', fontWeight: 'bold' }} />
                                                    <Bar dataKey="Aprobados" fill="#22c55e" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: '#475569', fontWeight: 'bold' }} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Doughnut / Pie Chart of States */}
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
                                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-2">Composición Total Documental</h4>
                                        {(() => {
                                            let approved = 0;
                                            let inProcess = 0;
                                            let pending = 0;
                                            let notRequired = 0;
                                            Object.values(filteredProjectDocTypeStats).forEach(s => {
                                                approved += s.approved;
                                                inProcess += s.inProcess + s.initiated;
                                                pending += s.notStarted;
                                                notRequired += s.notRequired;
                                            });
                                            const pieData = [
                                                { name: 'No Requerido', value: notRequired, color: '#e2e8f0' },
                                                { name: 'No Iniciado', value: pending, color: '#cbd5e1' },
                                                { name: 'En Proceso', value: inProcess, color: '#3b82f6' },
                                                { name: 'Aprobados', value: approved, color: '#22c55e' }
                                            ];

                                            return (
                                                <div className="flex-1 flex flex-col justify-center items-center">
                                                    {pieData.reduce((acc, item) => acc + item.value, 0) === 0 ? (
                                                        <div className="text-center text-xs text-slate-400 py-12">No hay documentos cargados en el proyecto.</div>
                                                    ) : (
                                                        <>
                                                            <div className="w-full h-[220px]">
                                                                <ResponsiveContainer width="100%" height="100%">
                                                                    <PieChart>
                                                                        <Pie
                                                                            data={pieData.filter(item => item.value > 0)}
                                                                            cx="50%"
                                                                            cy="50%"
                                                                            innerRadius={50}
                                                                            outerRadius={75}
                                                                            paddingAngle={4}
                                                                            dataKey="value"
                                                                        >
                                                                            {pieData.filter(item => item.value > 0).map((entry, index) => (
                                                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                                                            ))}
                                                                        </Pie>
                                                                        <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                                                    </PieChart>
                                                                </ResponsiveContainer>
                                                            </div>
                                                            <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-[10px] font-bold mt-2">
                                                                {pieData.map(item => (
                                                                    <span key={item.name} className="flex items-center gap-1 text-slate-600 px-1.5 py-0.5 rounded border border-slate-100 bg-slate-50">
                                                                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                                                        {item.name}: {item.value}
                                                                    </span>
                                                                ))}
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            );
                                        })()}
                                    </div>

                                    {/* Doughnut / Pie Chart of Microprocesses */}
                                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col justify-between">
                                        <h4 className="text-xs font-black text-slate-700 uppercase tracking-widest mb-2">Composición del Estado de Microprocesos</h4>
                                        <div className="flex-1 flex flex-col justify-center items-center">
                                            {microPieData.length === 0 ? (
                                                <div className="text-center text-xs text-slate-400 py-12">No hay microprocesos registrados.</div>
                                            ) : (
                                                <>
                                                    <div className="w-full h-[220px]">
                                                        <ResponsiveContainer width="100%" height="100%">
                                                            <PieChart>
                                                                <Pie
                                                                    data={microPieData}
                                                                    cx="50%"
                                                                    cy="50%"
                                                                    innerRadius={50}
                                                                    outerRadius={75}
                                                                    paddingAngle={4}
                                                                    dataKey="value"
                                                                >
                                                                    {microPieData.map((entry, index) => (
                                                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                                                    ))}
                                                                </Pie>
                                                                <Tooltip contentStyle={{ fontSize: '11px', borderRadius: '8px' }} />
                                                            </PieChart>
                                                        </ResponsiveContainer>
                                                    </div>
                                                    <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-[10px] font-bold mt-2">
                                                        {microPieData.map(item => (
                                                            <span key={item.name} className="flex items-center gap-1 text-slate-600 px-1.5 py-0.5 rounded border border-slate-100 bg-slate-50">
                                                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                                                                {item.name}: {item.value}
                                                            </span>
                                                        ))}
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Table 3 - Avance por Macroproceso (Drill Down) */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-6">
                                    <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-950">Desglose de Reportería por Macroproceso ({activeMapProject})</h4>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Avance y estados detallados de la documentación, estructurado por macroprocesos.
                                            </p>
                                        </div>
                                        <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200 shadow-inner">
                                            {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(type => (
                                                <button
                                                    key={type}
                                                    onClick={() => setSelectedChartDocType(type)}
                                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${
                                                        selectedChartDocType === type
                                                            ? 'bg-white text-indigo-600 shadow-sm border border-slate-200/50'
                                                            : 'text-slate-500 hover:text-slate-800'
                                                    }`}
                                                >
                                                    {type}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    {/* Gráfico de Barras por Macroproceso */}
                                    <div className="p-6 border-b border-slate-100 bg-slate-50/30">
                                        <h5 className="text-xs font-bold text-slate-700 mb-4 uppercase tracking-wider">Estados del Documento ({selectedChartDocType}) por Macroproceso</h5>
                                        {macroprocessThreeDrillDownStats.length === 0 ? (
                                            <p className="text-xs text-slate-400 italic">No hay datos disponibles.</p>
                                        ) : (
                                            <div className="h-[400px] w-full">
                                                <ResponsiveContainer width="100%" height="100%">
                                                    <BarChart
                                                        data={macroprocessThreeDrillDownStats.map(macro => {
                                                            const stats = macro.docTypes[selectedChartDocType] || { notRequired: 0, notStarted: 0, inProcess: 0, referent: 0, control: 0, approved: 0 };
                                                            const ni = stats.notStarted;
                                                            const ep = stats.inProcess;
                                                            const ref = stats.referent;
                                                            const cg = stats.control;
                                                            const ter = stats.approved;
                                                            return { 
                                                                name: macro.macroName, 
                                                                'N/I': ni,
                                                                'E/P': ep,
                                                                'REF': ref,
                                                                'C/G': cg,
                                                                'TER': ter,
                                                                total: ni + ep + ref + cg + ter 
                                                            };
                                                        })}
                                                        margin={{ top: 25, right: 30, left: 0, bottom: 80 }}
                                                    >
                                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                                                        <XAxis 
                                                            dataKey="name" 
                                                            axisLine={false} 
                                                            tickLine={false} 
                                                            interval={0}
                                                            tick={(props: any) => {
                                                                const { x, y, payload } = props;
                                                                const text = payload.value || '';
                                                                const words = text.split(' ');
                                                                let lines = [];
                                                                let curr = '';
                                                                words.forEach((w: string) => {
                                                                    if ((curr + w).length > 15) {
                                                                        if (curr) lines.push(curr.trim());
                                                                        curr = w + ' ';
                                                                    } else {
                                                                        curr += w + ' ';
                                                                    }
                                                                });
                                                                if (curr) lines.push(curr.trim());
                                                                
                                                                return (
                                                                    <g transform={`translate(${x},${y})`}>
                                                                        <text x={0} y={0} dy={16} textAnchor="middle" fill="#64748b" fontSize="11" fontWeight="500">
                                                                            {lines.map((line: string, i: number) => (
                                                                                <tspan textAnchor="middle" x={0} dy={i === 0 ? 0 : 14} key={i}>
                                                                                    {line}
                                                                                </tspan>
                                                                            ))}
                                                                        </text>
                                                                    </g>
                                                                );
                                                            }}
                                                        />
                                                        <YAxis 
                                                            axisLine={false} 
                                                            tickLine={false} 
                                                            tick={{ fontSize: 12, fill: '#64748b', fontWeight: 'bold' }}
                                                            allowDecimals={false}
                                                        />
                                                        <Tooltip
                                                            cursor={{ fill: '#f1f5f9' }}
                                                            contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                                            labelStyle={{ color: '#0f172a', fontWeight: 'bold', marginBottom: '4px' }}
                                                        />
                                                        <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 'bold' }} verticalAlign="top" height={36} />
                                                        <Bar dataKey="N/I" stackId="a" fill="#94a3b8" maxBarSize={60}>
                                                            <LabelList dataKey="N/I" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "900" }} formatter={(val: any) => Number(val) > 0 ? val : ''} />
                                                        </Bar>
                                                        <Bar dataKey="E/P" stackId="a" fill="#3b82f6" maxBarSize={60}>
                                                            <LabelList dataKey="E/P" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "900" }} formatter={(val: any) => Number(val) > 0 ? val : ''} />
                                                        </Bar>
                                                        <Bar dataKey="REF" stackId="a" fill="#a855f7" maxBarSize={60}>
                                                            <LabelList dataKey="REF" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "900" }} formatter={(val: any) => Number(val) > 0 ? val : ''} />
                                                        </Bar>
                                                        <Bar dataKey="C/G" stackId="a" fill="#0ea5e9" maxBarSize={60}>
                                                            <LabelList dataKey="C/G" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "900" }} formatter={(val: any) => Number(val) > 0 ? val : ''} />
                                                        </Bar>
                                                        <Bar dataKey="TER" stackId="a" fill="#10b981" maxBarSize={60} radius={[4, 4, 0, 0]}>
                                                            <LabelList dataKey="TER" position="center" fill="#ffffff" style={{ fontSize: "10px", fontWeight: "900" }} formatter={(val: any) => Number(val) > 0 ? val : ''} />
                                                            <LabelList dataKey="total" position="top" style={{ fontSize: "11px", fontWeight: "900", fill: "#334155" }} formatter={(val: any) => Number(val) > 0 ? val : ''} />
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                        )}
                                    </div>
                                    {/* Tabla Drill-down */}
                                    <div className="overflow-x-auto max-w-full pb-8">
                                        <table className="w-full text-left border-collapse min-w-[1400px]">
                                            <thead>
                                                <tr className="bg-slate-100/80 border-b border-slate-200 text-[10px] font-bold text-slate-700">
                                                    <th rowSpan={2} className="px-4 py-3 text-left border-r border-slate-200 min-w-[320px] sticky left-0 bg-slate-100 z-10">
                                                        Procesos
                                                    </th>
                                                    <th colSpan={6} className="px-2 py-1.5 text-center border-r border-slate-200 bg-blue-50/70 font-extrabold text-blue-900">AS IS</th>
                                                    <th colSpan={6} className="px-2 py-1.5 text-center border-r border-slate-200 bg-red-50/70 font-extrabold text-red-900">FCE</th>
                                                    <th colSpan={6} className="px-2 py-1.5 text-center border-r border-slate-200 bg-amber-50/70 font-extrabold text-amber-900">PM</th>
                                                    <th colSpan={6} className="px-2 py-1.5 text-center bg-green-50/70 font-extrabold text-green-900">TO BE</th>
                                                </tr>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[9px] font-bold text-slate-500">
                                                    {['AS IS', 'FCE', 'PM', 'TO BE'].map((t) => (
                                                        <React.Fragment key={t}>
                                                            <th className="px-1 py-1.5 text-center border-r border-slate-200/60 font-semibold" title="No requerido">N/R</th>
                                                            <th className="px-1 py-1.5 text-center border-r border-slate-200/60 font-semibold" title="No Iniciado">N/I</th>
                                                            <th className="px-1 py-1.5 text-center border-r border-slate-200/60 font-semibold" title="En Proceso">E/P</th>
                                                            <th className="px-1 py-1.5 text-center border-r border-slate-200/60 font-semibold" title="Referente">REF</th>
                                                            <th className="px-1 py-1.5 text-center border-r border-slate-200/60 font-semibold" title="Control Gestión">C/G</th>
                                                            <th className="px-1 py-1.5 text-center border-r border-slate-200 font-semibold" title="Terminados (Aprobados)">TER</th>
                                                        </React.Fragment>
                                                    ))}
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs text-slate-700">
                                                {macroprocessThreeDrillDownStats.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={25} className="text-center py-8 text-slate-500 italic">No hay datos disponibles.</td>
                                                    </tr>
                                                ) : (
                                                    macroprocessThreeDrillDownStats.map((row) => {
                                                        const isMacroExpanded = expandedThreeMacros[row.macroName];
                                                        
                                                        return (
                                                            <React.Fragment key={row.macroName}>
                                                                <tr 
                                                                    className="border-b border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors"
                                                                    onClick={() => setExpandedThreeMacros(p => ({ ...p, [row.macroName]: !p[row.macroName] }))}
                                                                >
                                                                    <td className="px-4 py-2 border-r border-slate-200 font-bold text-slate-900 sticky left-0 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                        <div className="flex items-center gap-2">
                                                                            {isMacroExpanded ? <ChevronDown size={14} className="text-indigo-600 font-bold" /> : <ChevronRight size={14} />}
                                                                            <span className="truncate">{row.macroName}</span>
                                                                        </div>
                                                                    </td>
                                                                    {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => {
                                                                        const st = row.docTypes[t];
                                                                        return (
                                                                            <React.Fragment key={t}>
                                                                                <td className="px-1 py-2 text-center border-r border-slate-200/60 text-slate-400 font-medium">{st.notRequired > 0 ? st.notRequired : '-'}</td>
                                                                                <td className="px-1 py-2 text-center border-r border-slate-200/60 text-slate-600 font-medium">{st.notStarted > 0 ? st.notStarted : '-'}</td>
                                                                                <td className="px-1 py-2 text-center border-r border-slate-200/60 text-indigo-600 font-medium">{st.inProcess > 0 ? st.inProcess : '-'}</td>
                                                                                <td className="px-1 py-2 text-center border-r border-slate-200/60 text-purple-600 font-medium">{st.referent > 0 ? st.referent : '-'}</td>
                                                                                <td className="px-1 py-2 text-center border-r border-slate-200/60 text-sky-600 font-medium">{st.control > 0 ? st.control : '-'}</td>
                                                                                <td className="px-1 py-2 text-center border-r border-slate-200 font-bold text-emerald-600">{st.approved > 0 ? st.approved : '-'}</td>
                                                                            </React.Fragment>
                                                                        )
                                                                    })}
                                                                </tr>
                                                                
                                                                {isMacroExpanded && row.processes.map((proc) => {
                                                                    const isProcExpanded = expandedThreeProcesses[proc.processName];
                                                                    return (
                                                                        <React.Fragment key={proc.processName}>
                                                                            <tr 
                                                                                className="border-b border-slate-100 bg-white hover:bg-slate-50/50 cursor-pointer transition-colors"
                                                                                onClick={() => setExpandedThreeProcesses(p => ({ ...p, [proc.processName]: !p[proc.processName] }))}
                                                                            >
                                                                                <td className="px-4 py-2 border-r border-slate-200 font-semibold text-slate-700 pl-8 sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                                    <div className="flex items-center gap-2">
                                                                                        {isProcExpanded ? <ChevronDown size={13} className="text-indigo-600 font-bold" /> : <ChevronRight size={13} />}
                                                                                        <span className="truncate">{proc.processName}</span>
                                                                                    </div>
                                                                                </td>
                                                                                {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => {
                                                                                    const st = proc.docTypes[t];
                                                                                    return (
                                                                                        <React.Fragment key={t}>
                                                                                            <td className="px-1 py-2 text-center border-r border-slate-200/60 text-slate-400">{st.notRequired > 0 ? st.notRequired : '-'}</td>
                                                                                            <td className="px-1 py-2 text-center border-r border-slate-200/60 text-slate-600">{st.notStarted > 0 ? st.notStarted : '-'}</td>
                                                                                            <td className="px-1 py-2 text-center border-r border-slate-200/60 text-indigo-600">{st.inProcess > 0 ? st.inProcess : '-'}</td>
                                                                                            <td className="px-1 py-2 text-center border-r border-slate-200/60 text-purple-600">{st.referent > 0 ? st.referent : '-'}</td>
                                                                                            <td className="px-1 py-2 text-center border-r border-slate-200/60 text-sky-600">{st.control > 0 ? st.control : '-'}</td>
                                                                                            <td className="px-1 py-2 text-center border-r border-slate-200 font-bold text-emerald-600">{st.approved > 0 ? st.approved : '-'}</td>
                                                                                        </React.Fragment>
                                                                                    )
                                                                                })}
                                                                            </tr>
                                                                            
                                                                            {isProcExpanded && proc.microprocesses.map(micro => (
                                                                                <tr key={micro.microName} className="border-b border-slate-50 bg-slate-50/20 hover:bg-slate-50">
                                                                                    <td className="px-4 py-2 text-[11px] border-r border-slate-200 font-medium text-slate-600 pl-12 sticky left-0 bg-white/60 shadow-[2px_0_5px_rgba(0,0,0,0.01)] backdrop-blur-sm">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                                                                            <span className="truncate">{micro.microName}</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => {
                                                                                        const st = micro.docTypes[t];
                                                                                        return (
                                                                                            <React.Fragment key={t}>
                                                                                                <td className="px-1 py-1.5 text-[11px] text-center border-r border-slate-200/60 text-slate-300">{st.notRequired > 0 ? '✓' : '-'}</td>
                                                                                                <td className="px-1 py-1.5 text-[11px] text-center border-r border-slate-200/60 text-slate-400">{st.notStarted > 0 ? '1' : '-'}</td>
                                                                                                <td className="px-1 py-1.5 text-[11px] text-center border-r border-slate-200/60 text-indigo-400">{st.inProcess > 0 ? '1' : '-'}</td>
                                                                                                <td className="px-1 py-1.5 text-[11px] text-center border-r border-slate-200/60 text-purple-400">{st.referent > 0 ? '1' : '-'}</td>
                                                                                                <td className="px-1 py-1.5 text-[11px] text-center border-r border-slate-200/60 text-sky-400">{st.control > 0 ? '1' : '-'}</td>
                                                                                                <td className="px-1 py-1.5 text-[11px] text-center border-r border-slate-200 font-bold text-emerald-500">{st.approved > 0 ? '✓' : '-'}</td>
                                                                                            </React.Fragment>
                                                                                        )
                                                                                    })}
                                                                                </tr>
                                                                            ))}
                                                                        </React.Fragment>
                                                                    )
                                                                })}
                                                            </React.Fragment>
                                                        )
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                                
                                <div className="mt-8 text-xs text-slate-400 text-center flex items-center justify-center gap-2">
                                    <span>N/R: No requerido</span> &bull; 
                                    <span>N/I: No Iniciado</span> &bull; 
                                    <span>E/P: En Proceso</span> &bull; 
                                    <span>REF: Referente</span> &bull; 
                                    <span>C/G: Control Gestión</span> &bull;
                                    <span>TER: Terminados</span>
                                </div>

                                {/* Table - Reporte de Cantidades de Documentos Terminados y No Terminados (Drill Down) */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-8">
                                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                                        <div>
                                            <div className="flex items-center gap-2.5">
                                                <h4 className="text-sm font-bold text-slate-900">
                                                    Reporte de Cantidades de Documentos Terminados y No Terminados ({activeMapProject})
                                                </h4>
                                                <span className="px-2.5 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-black rounded-full border border-blue-200/80 uppercase tracking-wide">
                                                    Cantidades
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Detalle y consolidación jerárquica de cantidades de documentos no terminados (pendientes/en desarrollo) y terminados (aprobados) por tipo documental.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <button
                                                onClick={toggleAllPendingCompletedMacros}
                                                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                                            >
                                                <Layers size={14} className="text-slate-500" />
                                                {macroprocessPendingCompletedDrillDownStats.length > 0 && macroprocessPendingCompletedDrillDownStats.every(m => expandedPendingCompletedMacros[m.macroName]) ? 'Colapsar Todo' : 'Expandir Todo'}
                                            </button>
                                            <button
                                                onClick={handleExportPendingCompletedExcel}
                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                                            >
                                                <FileSpreadsheet size={15} /> Exportar a Excel
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tabla Drill-down de Cantidades */}
                                    <div className="overflow-x-auto max-w-full pb-6">
                                        <table className="w-full text-left border-collapse min-w-[1100px]">
                                            <thead>
                                                <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                                                    <th rowSpan={2} className="px-4 py-3 text-left border-r border-slate-200 min-w-[340px] sticky left-0 bg-slate-100 z-10 align-middle">
                                                        Estructura de Procesos
                                                    </th>
                                                    <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-200 bg-blue-50/70 font-extrabold text-blue-900">
                                                        AS IS
                                                    </th>
                                                    <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-200 bg-red-50/70 font-extrabold text-red-900">
                                                        FCE
                                                    </th>
                                                    <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-200 bg-amber-50/70 font-extrabold text-amber-900">
                                                        PM
                                                    </th>
                                                    <th colSpan={2} className="px-3 py-2 text-center border-r border-slate-200 bg-green-50/70 font-extrabold text-green-900">
                                                        TO BE
                                                    </th>
                                                    <th colSpan={2} className="px-3 py-2 text-center bg-indigo-50/80 font-black text-indigo-950">
                                                        Total General
                                                    </th>
                                                </tr>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600">
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200/60 bg-amber-50/40 text-amber-900 w-[65px]">No Term.</th>
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200 bg-emerald-50/40 text-emerald-900 w-[65px]">Term.</th>
                                                    
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200/60 bg-amber-50/40 text-amber-900 w-[65px]">No Term.</th>
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200 bg-emerald-50/40 text-emerald-900 w-[65px]">Term.</th>
                                                    
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200/60 bg-amber-50/40 text-amber-900 w-[65px]">No Term.</th>
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200 bg-emerald-50/40 text-emerald-900 w-[65px]">Term.</th>
                                                    
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200/60 bg-amber-50/40 text-amber-900 w-[65px]">No Term.</th>
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200 bg-emerald-50/40 text-emerald-900 w-[65px]">Term.</th>
                                                    
                                                    <th className="px-2 py-1.5 text-center border-r border-slate-200/60 bg-amber-100/50 text-amber-950 font-black w-[75px]">No Term.</th>
                                                    <th className="px-2 py-1.5 text-center bg-emerald-100/50 text-emerald-950 font-black w-[75px]">Term.</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs text-slate-700">
                                                {macroprocessPendingCompletedDrillDownStats.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={11} className="text-center py-8 text-slate-500 italic">No hay datos disponibles.</td>
                                                    </tr>
                                                ) : (
                                                    macroprocessPendingCompletedDrillDownStats.map((macro) => {
                                                        const isMacroExpanded = expandedPendingCompletedMacros[macro.macroName];
                                                        
                                                        return (
                                                            <React.Fragment key={macro.macroName}>
                                                                {/* Macroproceso Row */}
                                                                <tr 
                                                                    className="border-b border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors"
                                                                    onClick={() => setExpandedPendingCompletedMacros(p => ({ ...p, [macro.macroName]: !p[macro.macroName] }))}
                                                                >
                                                                    <td className="px-4 py-2.5 border-r border-slate-200 font-bold text-slate-900 sticky left-0 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                        <div className="flex items-center gap-2">
                                                                            {isMacroExpanded ? <ChevronDown size={14} className="text-indigo-600 font-bold" /> : <ChevronRight size={14} />}
                                                                            <span className="truncate">{macro.macroName}</span>
                                                                            <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                                                                {macro.processCount} proc.
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => {
                                                                        const dt = macro.docTypes[t];
                                                                        return (
                                                                            <React.Fragment key={t}>
                                                                                <td className="px-2 py-2 text-center border-r border-slate-200/60 font-semibold text-amber-700">
                                                                                    {dt.noTerminados > 0 ? (
                                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200/60">
                                                                                            {dt.noTerminados}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-300">-</span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="px-2 py-2 text-center border-r border-slate-200 font-semibold text-emerald-700">
                                                                                    {dt.terminados > 0 ? (
                                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200/60">
                                                                                            {dt.terminados}
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className="text-slate-300">-</span>
                                                                                    )}
                                                                                </td>
                                                                            </React.Fragment>
                                                                        );
                                                                    })}
                                                                    <td className="px-2 py-2 text-center border-r border-slate-200/60 bg-amber-50/20">
                                                                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black text-amber-800 bg-amber-100/80 border border-amber-300 shadow-xs">
                                                                            {macro.totalNoTerminados}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-2 py-2 text-center bg-emerald-50/20">
                                                                        <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black text-emerald-800 bg-emerald-100/80 border border-emerald-300 shadow-xs">
                                                                            {macro.totalTerminados}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                                
                                                                {/* Procesos Rows */}
                                                                {isMacroExpanded && macro.processes.map((proc) => {
                                                                    const isProcExpanded = expandedPendingCompletedProcesses[proc.processName];
                                                                    return (
                                                                        <React.Fragment key={proc.processName}>
                                                                            <tr 
                                                                                className="border-b border-slate-100 bg-white hover:bg-slate-50/60 cursor-pointer transition-colors"
                                                                                onClick={() => setExpandedPendingCompletedProcesses(p => ({ ...p, [proc.processName]: !p[proc.processName] }))}
                                                                            >
                                                                                <td className="px-4 py-2 border-r border-slate-200 font-semibold text-slate-700 pl-8 sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                                    <div className="flex items-center gap-2">
                                                                                        {isProcExpanded ? <ChevronDown size={13} className="text-indigo-600 font-bold" /> : <ChevronRight size={13} />}
                                                                                        <span className="truncate">{proc.processName}</span>
                                                                                        <span className="text-[10px] text-slate-400 font-normal">
                                                                                            ({proc.microprocesses.length} microproc.)
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => {
                                                                                    const dt = proc.docTypes[t];
                                                                                    return (
                                                                                        <React.Fragment key={t}>
                                                                                            <td className="px-2 py-2 text-center border-r border-slate-200/60 text-slate-600">
                                                                                                {dt.noTerminados > 0 ? (
                                                                                                    <span className="font-semibold text-amber-700">{dt.noTerminados}</span>
                                                                                                ) : (
                                                                                                    <span className="text-slate-300 font-normal">-</span>
                                                                                                )}
                                                                                            </td>
                                                                                            <td className="px-2 py-2 text-center border-r border-slate-200 text-slate-600">
                                                                                                {dt.terminados > 0 ? (
                                                                                                    <span className="font-bold text-emerald-700">{dt.terminados}</span>
                                                                                                ) : (
                                                                                                    <span className="text-slate-300 font-normal">-</span>
                                                                                                )}
                                                                                            </td>
                                                                                        </React.Fragment>
                                                                                    );
                                                                                })}
                                                                                <td className="px-2 py-2 text-center border-r border-slate-200/60 font-bold text-amber-800 bg-amber-50/10">
                                                                                    {proc.totalNoTerminados}
                                                                                </td>
                                                                                <td className="px-2 py-2 text-center font-black text-emerald-800 bg-emerald-50/10">
                                                                                    {proc.totalTerminados}
                                                                                </td>
                                                                            </tr>
                                                                            
                                                                            {/* Microprocesos Rows */}
                                                                            {isProcExpanded && proc.microprocesses.map(micro => (
                                                                                <tr key={micro.microName} className="border-b border-slate-50 bg-slate-50/20 hover:bg-slate-50/80 transition-colors">
                                                                                    <td className="px-4 py-2 text-[11px] border-r border-slate-200 font-medium text-slate-600 pl-14 sticky left-0 bg-white/70 shadow-[2px_0_5px_rgba(0,0,0,0.01)] backdrop-blur-xs">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-300"></div>
                                                                                            <span className="truncate">{micro.microName}</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => {
                                                                                        const dt = micro.docTypes[t];
                                                                                        return (
                                                                                            <React.Fragment key={t}>
                                                                                                <td className="px-2 py-1.5 text-center border-r border-slate-200/60">
                                                                                                    {!dt.isRequired ? (
                                                                                                        <span className="text-slate-300 text-[10px] font-normal">-</span>
                                                                                                    ) : dt.isNoTerminated ? (
                                                                                                        <span 
                                                                                                            className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200"
                                                                                                            title={`Estado: ${dt.state ? STATE_CONFIG[dt.state]?.label : 'Pendiente'}`}
                                                                                                        >
                                                                                                            1
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <span className="text-slate-300 text-[10px] font-normal">-</span>
                                                                                                    )}
                                                                                                </td>
                                                                                                <td className="px-2 py-1.5 text-center border-r border-slate-200">
                                                                                                    {!dt.isRequired ? (
                                                                                                        <span className="text-slate-300 text-[10px] font-normal">-</span>
                                                                                                    ) : dt.isTerminated ? (
                                                                                                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                                                                            1
                                                                                                        </span>
                                                                                                    ) : (
                                                                                                        <span className="text-slate-300 text-[10px] font-normal">-</span>
                                                                                                    )}
                                                                                                </td>
                                                                                            </React.Fragment>
                                                                                        );
                                                                                    })}
                                                                                    <td className="px-2 py-1.5 text-center border-r border-slate-200/60 font-semibold text-amber-700 text-[11px] bg-amber-50/10">
                                                                                        {micro.totalNoTerminados}
                                                                                    </td>
                                                                                    <td className="px-2 py-1.5 text-center font-bold text-emerald-700 text-[11px] bg-emerald-50/10">
                                                                                        {micro.totalTerminados}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </React.Fragment>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                )}
                                            </tbody>
                                            {macroprocessPendingCompletedDrillDownStats.length > 0 && (
                                                <tfoot className="border-t-2 border-slate-300 bg-slate-100/95 font-bold text-xs text-slate-900 sticky bottom-0">
                                                    <tr>
                                                        <td className="px-4 py-3 border-r border-slate-300 font-black text-slate-900 sticky left-0 bg-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10 uppercase tracking-wide text-[11px]">
                                                            TOTAL GENERAL
                                                        </td>
                                                        {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => {
                                                            const dt = grandTotalsPendingCompleted.docTypes[t];
                                                            return (
                                                                <React.Fragment key={t}>
                                                                    <td className="px-2 py-2.5 text-center border-r border-slate-200/80 bg-amber-50/50">
                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-black text-amber-900 bg-amber-100/80 border border-amber-300 shadow-xs">
                                                                            {dt.noTerminados}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-2 py-2.5 text-center border-r border-slate-300 bg-emerald-50/50">
                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-black text-emerald-900 bg-emerald-100/80 border border-emerald-300 shadow-xs">
                                                                            {dt.terminados}
                                                                        </span>
                                                                    </td>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        <td className="px-2 py-2.5 text-center border-r border-slate-200/80 bg-amber-100/70">
                                                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black text-amber-950 bg-amber-200/90 border border-amber-400 shadow-xs">
                                                                {grandTotalsPendingCompleted.totalNoTerminados}
                                                            </span>
                                                        </td>
                                                        <td className="px-2 py-2.5 text-center bg-emerald-100/70">
                                                            <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-black text-emerald-950 bg-emerald-200/90 border border-emerald-400 shadow-xs">
                                                                {grandTotalsPendingCompleted.totalTerminados}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                </div>

                                {/* Table 4 - Reporte de Porcentaje de Avance por Documento y Proceso (Drill Down) */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-8">
                                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                                        <div>
                                            <div className="flex items-center gap-2.5">
                                                <h4 className="text-sm font-bold text-slate-900">
                                                    Reporte de Porcentaje de Avance por Documento ({activeMapProject})
                                                </h4>
                                                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 text-[10px] font-black rounded-full border border-emerald-200/80 uppercase tracking-wide">
                                                    % de Avance
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Porcentaje de avance por tipo de documento con consolidación y drill-down jerárquico desde macroproceso hasta proceso y microproceso.
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-2.5 flex-wrap">
                                            <button
                                                onClick={toggleAllProgressMacros}
                                                className="px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-xs"
                                            >
                                                <Layers size={14} className="text-slate-500" />
                                                {macroprocessProgressDrillDownStats.length > 0 && macroprocessProgressDrillDownStats.every(m => expandedProgressPercentMacros[m.macroName]) ? 'Colapsar Todo' : 'Expandir Todo'}
                                            </button>
                                            <button
                                                onClick={handleExportProgressPercentExcel}
                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                                            >
                                                <FileSpreadsheet size={15} /> Exportar a Excel
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tabla Drill-down de Porcentajes */}
                                    <div className="overflow-x-auto max-w-full pb-6">
                                        <table className="w-full text-left border-collapse min-w-[1000px]">
                                            <thead>
                                                <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                                                    <th className="px-4 py-3 text-left border-r border-slate-200 min-w-[340px] sticky left-0 bg-slate-100 z-10">
                                                        Estructura de Procesos
                                                    </th>
                                                    <th className="px-3 py-2.5 text-center border-r border-slate-200 bg-blue-50/70 font-extrabold text-blue-900 w-[140px]">
                                                        AS IS (%)
                                                    </th>
                                                    <th className="px-3 py-2.5 text-center border-r border-slate-200 bg-red-50/70 font-extrabold text-red-900 w-[140px]">
                                                        FCE (%)
                                                    </th>
                                                    <th className="px-3 py-2.5 text-center border-r border-slate-200 bg-amber-50/70 font-extrabold text-amber-900 w-[140px]">
                                                        PM (%)
                                                    </th>
                                                    <th className="px-3 py-2.5 text-center border-r border-slate-200 bg-green-50/70 font-extrabold text-green-900 w-[140px]">
                                                        TO BE (%)
                                                    </th>
                                                    <th className="px-3 py-2.5 text-center bg-indigo-50/80 font-black text-indigo-950 w-[150px]">
                                                        Avance Total
                                                    </th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs text-slate-700">
                                                {macroprocessProgressDrillDownStats.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={6} className="text-center py-8 text-slate-500 italic">No hay datos disponibles.</td>
                                                    </tr>
                                                ) : (
                                                    macroprocessProgressDrillDownStats.map((macro) => {
                                                        const isMacroExpanded = expandedProgressPercentMacros[macro.macroName];
                                                        
                                                        return (
                                                            <React.Fragment key={macro.macroName}>
                                                                {/* Macroproceso Row */}
                                                                <tr 
                                                                    className="border-b border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors"
                                                                    onClick={() => setExpandedProgressPercentMacros(p => ({ ...p, [macro.macroName]: !p[macro.macroName] }))}
                                                                >
                                                                    <td className="px-4 py-2.5 border-r border-slate-200 font-bold text-slate-900 sticky left-0 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                        <div className="flex items-center gap-2">
                                                                            {isMacroExpanded ? <ChevronDown size={14} className="text-indigo-600 font-bold" /> : <ChevronRight size={14} />}
                                                                            <span className="truncate">{macro.macroName}</span>
                                                                            <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                                                                {macro.processCount} proc.
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => (
                                                                        <td key={t} className="px-2 py-2 text-center border-r border-slate-200/60">
                                                                            {renderProgressBadge(macro.docTypes[t].averageProgress, true)}
                                                                        </td>
                                                                    ))}
                                                                    <td className="px-3 py-2 text-center bg-indigo-50/20">
                                                                        {renderTotalProgressBadge(macro.totalProgress, true)}
                                                                    </td>
                                                                </tr>
                                                                
                                                                {/* Procesos Rows */}
                                                                {isMacroExpanded && macro.processes.map((proc) => {
                                                                    const isProcExpanded = expandedProgressPercentProcesses[proc.processName];
                                                                    return (
                                                                        <React.Fragment key={proc.processName}>
                                                                            <tr 
                                                                                className="border-b border-slate-100 bg-white hover:bg-slate-50/60 cursor-pointer transition-colors"
                                                                                onClick={() => setExpandedProgressPercentProcesses(p => ({ ...p, [proc.processName]: !p[proc.processName] }))}
                                                                            >
                                                                                <td className="px-4 py-2 border-r border-slate-200 font-semibold text-slate-700 pl-8 sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                                    <div className="flex items-center gap-2">
                                                                                        {isProcExpanded ? <ChevronDown size={13} className="text-indigo-600 font-bold" /> : <ChevronRight size={13} />}
                                                                                        <span className="truncate">{proc.processName}</span>
                                                                                        <span className="text-[10px] font-medium text-slate-400">
                                                                                            ({proc.microprocessCount} micro)
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => (
                                                                                    <td key={t} className="px-2 py-2 text-center border-r border-slate-200/60">
                                                                                        {renderProgressBadge(proc.docTypes[t].averageProgress)}
                                                                                    </td>
                                                                                ))}
                                                                                <td className="px-3 py-2 text-center bg-indigo-50/10">
                                                                                    {renderTotalProgressBadge(proc.totalProgress)}
                                                                                </td>
                                                                            </tr>
                                                                            
                                                                            {/* Microprocesos Rows */}
                                                                            {isProcExpanded && proc.microprocesses.map(micro => (
                                                                                <tr key={micro.microName} className="border-b border-slate-50 bg-slate-50/20 hover:bg-slate-50">
                                                                                    <td className="px-4 py-2 text-[11px] border-r border-slate-200 font-medium text-slate-600 pl-12 sticky left-0 bg-white/60 shadow-[2px_0_5px_rgba(0,0,0,0.01)] backdrop-blur-sm">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <div className="w-1.5 h-1.5 rounded-full bg-slate-300"></div>
                                                                                            <span className="truncate">{micro.microName}</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(t => (
                                                                                        <td key={t} className="px-2 py-1.5 text-[11px] text-center border-r border-slate-200/60">
                                                                                            {renderProgressBadge(micro.docTypes[t].progress)}
                                                                                        </td>
                                                                                    ))}
                                                                                    <td className="px-3 py-1.5 text-[11px] text-center bg-indigo-50/10 font-bold">
                                                                                        {renderTotalProgressBadge(micro.totalProgress)}
                                                                                    </td>
                                                                                </tr>
                                                                            ))}
                                                                        </React.Fragment>
                                                                    )
                                                                })}
                                                            </React.Fragment>
                                                        )
                                                    })
                                                )}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>

                                <div className="mt-6 text-xs text-slate-400 text-center flex items-center justify-center gap-2">
                                    <span>N/R: No requerido</span> &bull; 
                                    <span>0%: No Iniciado</span> &bull; 
                                    <span>10%: Iniciado</span> &bull; 
                                    <span>30%: En Proceso</span> &bull; 
                                    <span>60%: Rev. Interna</span> &bull; 
                                    <span>80%: Referente</span> &bull; 
                                    <span>90%: Control Gestión</span> &bull; 
                                    <span>100%: Aprobado</span>
                                </div>

                                {/* Table 5 - Reporte de Cantidades por Fase de Gestión Documental (Drill Down) */}
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mt-8">
                                    <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
                                        <div>
                                            <div className="flex items-center gap-2.5">
                                                <h4 className="text-sm font-bold text-slate-900">
                                                    Reporte de Cantidades por Fase de Gestión Documental ({activeMapProject})
                                                </h4>
                                                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-black rounded-full border border-indigo-200/80 uppercase tracking-wide">
                                                    Flujo por Etapas
                                                </span>
                                            </div>
                                            <p className="text-xs text-slate-500 mt-1">
                                                Conteo de documentos agrupados por Macroproceso, Proceso y Microproceso en sus respectivas etapas: DGP, Enviados Referente, Control Gestión y Terminado.
                                            </p>
                                        </div>

                                        <div className="flex items-center gap-2.5">
                                            <button
                                                onClick={toggleAllFlowPhasesMacros}
                                                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-2xs whitespace-nowrap"
                                            >
                                                <FolderTree size={14} className="text-indigo-600" />
                                                {macroprocessFlowPhasesDrillDownStats.length > 0 && macroprocessFlowPhasesDrillDownStats.every(m => expandedFlowPhasesMacros[m.macroName])
                                                    ? 'Colapsar Todo'
                                                    : 'Expandir Todo'
                                                }
                                            </button>

                                            <button
                                                onClick={handleExportFlowPhasesExcel}
                                                className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 shadow-sm whitespace-nowrap"
                                            >
                                                <FileSpreadsheet size={15} /> Exportar a Excel
                                            </button>
                                        </div>
                                    </div>

                                    {/* Tabla Drill-down de Fases / Etapas */}
                                    <div className="overflow-x-auto max-w-full pb-6">
                                        <table className="w-full text-left border-collapse min-w-[1250px]">
                                            <thead>
                                                <tr className="bg-slate-100/90 border-b border-slate-200 text-[11px] font-bold text-slate-700">
                                                    <th rowSpan={2} className="px-4 py-3 text-left border-r border-slate-200 min-w-[320px] sticky left-0 bg-slate-100 z-10 align-middle">
                                                        Estructura de Procesos
                                                    </th>
                                                    <th colSpan={3} className="px-3 py-2 text-center border-r border-slate-200 bg-blue-50/70 font-extrabold text-blue-900">
                                                        AS IS
                                                    </th>
                                                    <th colSpan={3} className="px-3 py-2 text-center border-r border-slate-200 bg-red-50/70 font-extrabold text-red-900">
                                                        FCE
                                                    </th>
                                                    <th colSpan={3} className="px-3 py-2 text-center border-r border-slate-200 bg-amber-50/70 font-extrabold text-amber-900">
                                                        PM
                                                    </th>
                                                    <th colSpan={4} className="px-3 py-2 text-center border-r border-slate-200 bg-emerald-50/70 font-extrabold text-emerald-900">
                                                        TO BE
                                                    </th>
                                                    <th colSpan={5} className="px-3 py-2 text-center bg-indigo-50/80 font-black text-indigo-950">
                                                        Total Consolidado
                                                    </th>
                                                </tr>
                                                <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-600">
                                                    {/* AS IS */}
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-blue-50/30 text-blue-900 w-[55px]">DGP</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-purple-50/30 text-purple-900 w-[55px]">Ref.</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200 bg-emerald-50/30 text-emerald-900 w-[55px]">Term.</th>

                                                    {/* FCE */}
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-blue-50/30 text-blue-900 w-[55px]">DGP</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-purple-50/30 text-purple-900 w-[55px]">Ref.</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200 bg-emerald-50/30 text-emerald-900 w-[55px]">Term.</th>

                                                    {/* PM */}
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-blue-50/30 text-blue-900 w-[55px]">DGP</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-purple-50/30 text-purple-900 w-[55px]">Ref.</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200 bg-emerald-50/30 text-emerald-900 w-[55px]">Term.</th>

                                                    {/* TO BE */}
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-blue-50/30 text-blue-900 w-[55px]">DGP</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-purple-50/30 text-purple-900 w-[55px]">Ref.</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-amber-50/40 text-amber-900 w-[55px]">C.G.</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200 bg-emerald-50/30 text-emerald-900 w-[55px]">Term.</th>

                                                    {/* Total Consolidado */}
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-blue-100/40 text-blue-950 font-black w-[60px]">DGP</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-purple-100/40 text-purple-950 font-black w-[60px]">Ref.</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-amber-100/40 text-amber-950 font-black w-[60px]">C.G.</th>
                                                    <th className="px-1.5 py-1.5 text-center border-r border-slate-200/60 bg-emerald-100/40 text-emerald-950 font-black w-[60px]">Term.</th>
                                                    <th className="px-1.5 py-1.5 text-center bg-slate-200/80 text-slate-950 font-black w-[60px]">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-xs text-slate-700">
                                                {macroprocessFlowPhasesDrillDownStats.length === 0 ? (
                                                    <tr>
                                                        <td colSpan={18} className="text-center py-8 text-slate-500 italic">No hay datos disponibles.</td>
                                                    </tr>
                                                ) : (
                                                    macroprocessFlowPhasesDrillDownStats.map((macro) => {
                                                        const isMacroExpanded = expandedFlowPhasesMacros[macro.macroName];
                                                        
                                                        return (
                                                            <React.Fragment key={macro.macroName}>
                                                                {/* Macroproceso Row */}
                                                                <tr 
                                                                    className="border-b border-slate-200 bg-slate-50 hover:bg-slate-100/80 cursor-pointer transition-colors"
                                                                    onClick={() => setExpandedFlowPhasesMacros(p => ({ ...p, [macro.macroName]: !p[macro.macroName] }))}
                                                                >
                                                                    <td className="px-4 py-2.5 border-r border-slate-200 font-bold text-slate-900 sticky left-0 bg-slate-50 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                        <div className="flex items-center gap-2">
                                                                            {isMacroExpanded ? <ChevronDown size={14} className="text-indigo-600 font-bold" /> : <ChevronRight size={14} />}
                                                                            <span className="truncate">{macro.macroName}</span>
                                                                            <span className="text-[10px] font-semibold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                                                                                {macro.processCount} proc.
                                                                            </span>
                                                                        </div>
                                                                    </td>
                                                                    {(['AS IS', 'FCE', 'PM'] as const).map(t => {
                                                                        const dt = macro.docTypes[t];
                                                                        return (
                                                                            <React.Fragment key={t}>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60">
                                                                                    {dt.dgp > 0 ? <span className="font-semibold text-blue-700">{dt.dgp}</span> : <span className="text-slate-300">-</span>}
                                                                                </td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60">
                                                                                    {dt.referent > 0 ? <span className="font-semibold text-purple-700">{dt.referent}</span> : <span className="text-slate-300">-</span>}
                                                                                </td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200">
                                                                                    {dt.approved > 0 ? <span className="font-bold text-emerald-700">{dt.approved}</span> : <span className="text-slate-300">-</span>}
                                                                                </td>
                                                                            </React.Fragment>
                                                                        );
                                                                    })}
                                                                    {/* TO BE */}
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200/60">
                                                                        {macro.docTypes['TO BE'].dgp > 0 ? <span className="font-semibold text-blue-700">{macro.docTypes['TO BE'].dgp}</span> : <span className="text-slate-300">-</span>}
                                                                    </td>
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200/60">
                                                                        {macro.docTypes['TO BE'].referent > 0 ? <span className="font-semibold text-purple-700">{macro.docTypes['TO BE'].referent}</span> : <span className="text-slate-300">-</span>}
                                                                    </td>
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200/60">
                                                                        {macro.docTypes['TO BE'].control > 0 ? <span className="font-semibold text-amber-700">{macro.docTypes['TO BE'].control}</span> : <span className="text-slate-300">-</span>}
                                                                    </td>
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200">
                                                                        {macro.docTypes['TO BE'].approved > 0 ? <span className="font-bold text-emerald-700">{macro.docTypes['TO BE'].approved}</span> : <span className="text-slate-300">-</span>}
                                                                    </td>

                                                                    {/* Totales Consolidados */}
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200/60 bg-blue-50/20">
                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-blue-800 bg-blue-100/80 border border-blue-300">
                                                                            {macro.totalDgp}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200/60 bg-purple-50/20">
                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-purple-800 bg-purple-100/80 border border-purple-300">
                                                                            {macro.totalReferent}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200/60 bg-amber-50/20">
                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-amber-800 bg-amber-100/80 border border-amber-300">
                                                                            {macro.totalControl}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-1.5 py-2 text-center border-r border-slate-200/60 bg-emerald-50/20">
                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-emerald-800 bg-emerald-100/80 border border-emerald-300">
                                                                            {macro.totalApproved}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-1.5 py-2 text-center bg-slate-100/80">
                                                                        <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-slate-900 bg-slate-200 border border-slate-300">
                                                                            {macro.totalRequired}
                                                                        </span>
                                                                    </td>
                                                                </tr>
                                                                
                                                                {/* Procesos Rows */}
                                                                {isMacroExpanded && macro.processes.map((proc) => {
                                                                    const isProcExpanded = expandedFlowPhasesProcesses[proc.processName];
                                                                    return (
                                                                        <React.Fragment key={proc.processName}>
                                                                            <tr 
                                                                                className="border-b border-slate-100 bg-white hover:bg-slate-50/60 cursor-pointer transition-colors"
                                                                                onClick={() => setExpandedFlowPhasesProcesses(p => ({ ...p, [proc.processName]: !p[proc.processName] }))}
                                                                            >
                                                                                <td className="px-4 py-2 border-r border-slate-200 font-semibold text-slate-700 pl-8 sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                                                    <div className="flex items-center gap-2">
                                                                                        {isProcExpanded ? <ChevronDown size={13} className="text-indigo-600 font-bold" /> : <ChevronRight size={13} />}
                                                                                        <span className="truncate">{proc.processName}</span>
                                                                                        <span className="text-[10px] text-slate-400 font-normal">
                                                                                            ({proc.microprocesses.length} microproc.)
                                                                                        </span>
                                                                                    </div>
                                                                                </td>
                                                                                {(['AS IS', 'FCE', 'PM'] as const).map(t => {
                                                                                    const dt = proc.docTypes[t];
                                                                                    return (
                                                                                        <React.Fragment key={t}>
                                                                                            <td className="px-1.5 py-2 text-center border-r border-slate-200/60 text-slate-600">
                                                                                                {dt.dgp > 0 ? <span className="font-semibold text-blue-700">{dt.dgp}</span> : <span className="text-slate-300">-</span>}
                                                                                            </td>
                                                                                            <td className="px-1.5 py-2 text-center border-r border-slate-200/60 text-slate-600">
                                                                                                {dt.referent > 0 ? <span className="font-semibold text-purple-700">{dt.referent}</span> : <span className="text-slate-300">-</span>}
                                                                                            </td>
                                                                                            <td className="px-1.5 py-2 text-center border-r border-slate-200 text-slate-600">
                                                                                                {dt.approved > 0 ? <span className="font-bold text-emerald-700">{dt.approved}</span> : <span className="text-slate-300">-</span>}
                                                                                            </td>
                                                                                        </React.Fragment>
                                                                                    );
                                                                                })}
                                                                                {/* TO BE */}
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60 text-slate-600">
                                                                                    {proc.docTypes['TO BE'].dgp > 0 ? <span className="font-semibold text-blue-700">{proc.docTypes['TO BE'].dgp}</span> : <span className="text-slate-300">-</span>}
                                                                                </td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60 text-slate-600">
                                                                                    {proc.docTypes['TO BE'].referent > 0 ? <span className="font-semibold text-purple-700">{proc.docTypes['TO BE'].referent}</span> : <span className="text-slate-300">-</span>}
                                                                                </td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60 text-slate-600">
                                                                                    {proc.docTypes['TO BE'].control > 0 ? <span className="font-semibold text-amber-700">{proc.docTypes['TO BE'].control}</span> : <span className="text-slate-300">-</span>}
                                                                                </td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200 text-slate-600">
                                                                                    {proc.docTypes['TO BE'].approved > 0 ? <span className="font-bold text-emerald-700">{proc.docTypes['TO BE'].approved}</span> : <span className="text-slate-300">-</span>}
                                                                                </td>

                                                                                {/* Totales */}
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60 font-bold text-blue-800 bg-blue-50/10">{proc.totalDgp}</td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60 font-bold text-purple-800 bg-purple-50/10">{proc.totalReferent}</td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60 font-bold text-amber-800 bg-amber-50/10">{proc.totalControl}</td>
                                                                                <td className="px-1.5 py-2 text-center border-r border-slate-200/60 font-black text-emerald-800 bg-emerald-50/10">{proc.totalApproved}</td>
                                                                                <td className="px-1.5 py-2 text-center font-black text-slate-900 bg-slate-100/50">{proc.totalRequired}</td>
                                                                            </tr>

                                                                            {/* Microprocesos Rows */}
                                                                            {isProcExpanded && proc.microprocesses.map(micro => (
                                                                                <tr key={micro.microName} className="border-b border-slate-50 bg-slate-50/20 hover:bg-slate-50/80 transition-colors">
                                                                                    <td className="px-4 py-2 text-[11px] border-r border-slate-200 font-medium text-slate-600 pl-14 sticky left-0 bg-white/70 shadow-[2px_0_5px_rgba(0,0,0,0.01)] backdrop-blur-xs">
                                                                                        <div className="flex items-center gap-1.5">
                                                                                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-300"></div>
                                                                                            <span className="truncate">{micro.microName}</span>
                                                                                        </div>
                                                                                    </td>
                                                                                    {(['AS IS', 'FCE', 'PM'] as const).map(t => {
                                                                                        const dt = micro.docTypes[t];
                                                                                        return (
                                                                                            <React.Fragment key={t}>
                                                                                                <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60">
                                                                                                    {!dt.isRequired ? <span className="text-slate-300 text-[10px]">-</span> : dt.dgp > 0 ? <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">1</span> : <span className="text-slate-300 text-[10px]">-</span>}
                                                                                                </td>
                                                                                                <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60">
                                                                                                    {!dt.isRequired ? <span className="text-slate-300 text-[10px]">-</span> : dt.referent > 0 ? <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">1</span> : <span className="text-slate-300 text-[10px]">-</span>}
                                                                                                </td>
                                                                                                <td className="px-1.5 py-1.5 text-center border-r border-slate-200">
                                                                                                    {!dt.isRequired ? <span className="text-slate-300 text-[10px]">-</span> : dt.approved > 0 ? <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">1</span> : <span className="text-slate-300 text-[10px]">-</span>}
                                                                                                </td>
                                                                                            </React.Fragment>
                                                                                        );
                                                                                    })}
                                                                                    {/* TO BE */}
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60">
                                                                                        {!micro.docTypes['TO BE'].isRequired ? <span className="text-slate-300 text-[10px]">-</span> : micro.docTypes['TO BE'].dgp > 0 ? <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">1</span> : <span className="text-slate-300 text-[10px]">-</span>}
                                                                                    </td>
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60">
                                                                                        {!micro.docTypes['TO BE'].isRequired ? <span className="text-slate-300 text-[10px]">-</span> : micro.docTypes['TO BE'].referent > 0 ? <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">1</span> : <span className="text-slate-300 text-[10px]">-</span>}
                                                                                    </td>
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60">
                                                                                        {!micro.docTypes['TO BE'].isRequired ? <span className="text-slate-300 text-[10px]">-</span> : micro.docTypes['TO BE'].control > 0 ? <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">1</span> : <span className="text-slate-300 text-[10px]">-</span>}
                                                                                    </td>
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200">
                                                                                        {!micro.docTypes['TO BE'].isRequired ? <span className="text-slate-300 text-[10px]">-</span> : micro.docTypes['TO BE'].approved > 0 ? <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">1</span> : <span className="text-slate-300 text-[10px]">-</span>}
                                                                                    </td>

                                                                                    {/* Totales */}
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60 font-semibold text-blue-700 text-[11px] bg-blue-50/10">{micro.totalDgp}</td>
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60 font-semibold text-purple-700 text-[11px] bg-purple-50/10">{micro.totalReferent}</td>
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60 font-semibold text-amber-700 text-[11px] bg-amber-50/10">{micro.totalControl}</td>
                                                                                    <td className="px-1.5 py-1.5 text-center border-r border-slate-200/60 font-bold text-emerald-700 text-[11px] bg-emerald-50/10">{micro.totalApproved}</td>
                                                                                    <td className="px-1.5 py-1.5 text-center font-black text-slate-900 text-[11px] bg-slate-100/40">{micro.totalRequired}</td>
                                                                                </tr>
                                                                            ))}
                                                                        </React.Fragment>
                                                                    );
                                                                })}
                                                            </React.Fragment>
                                                        );
                                                    })
                                                )}
                                            </tbody>

                                            {macroprocessFlowPhasesDrillDownStats.length > 0 && (
                                                <tfoot className="border-t-2 border-slate-300 bg-slate-100/95 font-bold text-xs text-slate-900 sticky bottom-0">
                                                    <tr>
                                                        <td className="px-4 py-3 border-r border-slate-300 font-black text-slate-900 sticky left-0 bg-slate-100 shadow-[2px_0_5px_rgba(0,0,0,0.04)] z-10 uppercase tracking-wide text-[11px]">
                                                            TOTAL GENERAL
                                                        </td>
                                                        {(['AS IS', 'FCE', 'PM'] as const).map(t => {
                                                            const dt = grandTotalsFlowPhases.docTypes[t];
                                                            return (
                                                                <React.Fragment key={t}>
                                                                    <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-blue-50/50">
                                                                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-black text-blue-900 bg-blue-100/80 border border-blue-300">
                                                                            {dt.dgp}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-purple-50/50">
                                                                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-black text-purple-900 bg-purple-100/80 border border-purple-300">
                                                                            {dt.referent}
                                                                        </span>
                                                                    </td>
                                                                    <td className="px-1.5 py-2.5 text-center border-r border-slate-300 bg-emerald-50/50">
                                                                        <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-black text-emerald-900 bg-emerald-100/80 border border-emerald-300">
                                                                            {dt.approved}
                                                                        </span>
                                                                    </td>
                                                                </React.Fragment>
                                                            );
                                                        })}
                                                        {/* TO BE */}
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-blue-50/50">
                                                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-black text-blue-900 bg-blue-100/80 border border-blue-300">
                                                                {grandTotalsFlowPhases.docTypes['TO BE'].dgp}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-purple-50/50">
                                                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-black text-purple-900 bg-purple-100/80 border border-purple-300">
                                                                {grandTotalsFlowPhases.docTypes['TO BE'].referent}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-amber-50/50">
                                                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-black text-amber-900 bg-amber-100/80 border border-amber-300">
                                                                {grandTotalsFlowPhases.docTypes['TO BE'].control}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-300 bg-emerald-50/50">
                                                            <span className="inline-flex items-center justify-center px-1.5 py-0.5 rounded text-xs font-black text-emerald-900 bg-emerald-100/80 border border-emerald-300">
                                                                {grandTotalsFlowPhases.docTypes['TO BE'].approved}
                                                            </span>
                                                        </td>

                                                        {/* Totales Consolidados */}
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-blue-100/70">
                                                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-blue-950 bg-blue-200/90 border border-blue-400">
                                                                {grandTotalsFlowPhases.totalDgp}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-purple-100/70">
                                                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-purple-950 bg-purple-200/90 border border-purple-400">
                                                                {grandTotalsFlowPhases.totalReferent}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-amber-100/70">
                                                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-amber-950 bg-amber-200/90 border border-amber-400">
                                                                {grandTotalsFlowPhases.totalControl}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-2.5 text-center border-r border-slate-200/80 bg-emerald-100/70">
                                                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-emerald-950 bg-emerald-200/90 border border-emerald-400">
                                                                {grandTotalsFlowPhases.totalApproved}
                                                            </span>
                                                        </td>
                                                        <td className="px-1.5 py-2.5 text-center bg-slate-200/90">
                                                            <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-black text-slate-950 bg-slate-300 border border-slate-400">
                                                                {grandTotalsFlowPhases.totalRequired}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                </tfoot>
                                            )}
                                        </table>
                                    </div>
                                </div>

                                <div className="mt-6 text-xs text-slate-400 text-center flex flex-wrap items-center justify-center gap-3">
                                    <span><strong>DGP:</strong> No Iniciado, Iniciado, En Proceso, Rev. Interna</span> &bull; 
                                    <span><strong>Ref.:</strong> Enviados / En Revisión Referente (e incluye Control de Gestión para AS IS, FCE, PM)</span> &bull; 
                                    <span><strong>C.G.:</strong> Enviados / En Revisión Control de Gestión (Solo TO BE)</span> &bull; 
                                    <span><strong>Term.:</strong> Aprobado</span> &bull; 
                                    <span><strong>Total:</strong> Suma Total de Documentos</span>
                                </div>
                    </div>
                )}

                {/* selectedMacroDetail BREAKOUT PANEL/DRAWER */}
                {selectedMacroDetail && (
                    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-sm animate-fadeIn">
                        <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col animate-slideLeft">
                            {/* Header */}
                            <div className="p-6 border-b border-slate-100 bg-slate-50 flex justify-between items-start">
                                <div className="space-y-1">
                                    <span className="text-[10px] font-extrabold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded w-fit uppercase tracking-widest block">
                                        {selectedMacroDetail.project} — PROCESO {selectedMacroDetail.category}
                                    </span>
                                    <h3 className="text-lg font-black text-slate-900 mt-1">
                                        {selectedMacroDetail.macroprocess}
                                    </h3>
                                    <p className="text-xs text-slate-500">Resumen y estado de avance de la documentación asociada.</p>
                                </div>
                                <button 
                                    onClick={() => setSelectedMacroDetail(null)}
                                    className="p-1.5 text-slate-450 text-slate-400 hover:text-slate-650 hover:bg-slate-150 hover:bg-slate-100 hover:text-slate-600 rounded-lg transition-all"
                                >
                                    <X size={20} />
                                </button>
                            </div>

                            {/* Content */}
                            <div className="flex-1 overflow-y-auto p-6 space-y-6">
                                
                                {/* Key Indicators */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-150/50 text-center">
                                        <span className="text-[9px] font-bold text-slate-400 block uppercase tracking-wide">Microprocesos</span>
                                        <span className="text-base font-black text-slate-800">{selectedMacroDetail.microprocesses.length}</span>
                                    </div>
                                    <div className="bg-green-50/50 p-3 rounded-xl border border-green-100 text-center">
                                        <span className="text-[9px] font-bold text-green-500 block uppercase tracking-wide">Aprobados</span>
                                        <span className="text-base font-black text-green-600">{selectedMacroDetail.totalApproved}</span>
                                    </div>
                                    <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100 text-center">
                                        <span className="text-[9px] font-bold text-indigo-500 block uppercase tracking-wide">Docs Requeridos</span>
                                        <span className="text-base font-black text-indigo-700">{selectedMacroDetail.totalRequired}</span>
                                    </div>
                                </div>

                                {/* Flow detail mapping */}
                                <div className="space-y-4">
                                    <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Apertura de Procesos y Microprocesos</h4>
                                    
                                    {(() => {
                                        const pMap: Record<string, {
                                            processName: string;
                                            totalRequired: number;
                                            totalApproved: number;
                                            items: any[];
                                        }> = {};
                                        
                                        selectedMacroDetail.microprocesses.forEach((m: any) => {
                                            const pName = m.process || 'Sin Proceso';
                                            if (!pMap[pName]) {
                                                pMap[pName] = {
                                                    processName: pName,
                                                    totalRequired: 0,
                                                    totalApproved: 0,
                                                    items: []
                                                };
                                            }
                                            pMap[pName].totalRequired += m.totalRequired;
                                            pMap[pName].totalApproved += m.totalApproved;
                                            pMap[pName].items.push(m);
                                        });

                                        const processesList = Object.values(pMap);

                                        return (
                                            <div className="space-y-6">
                                                {processesList.map((pGroup: any, pIdx: number) => {
                                                    const pProgress = pGroup.totalRequired > 0 ? Math.round((pGroup.totalApproved / pGroup.totalRequired) * 100) : 0;
                                                    const isFocused = selectedMacroDetail.focusProcessName === pGroup.processName;

                                                    return (
                                                        <div 
                                                            key={pGroup.processName + pIdx} 
                                                            className={`border rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${
                                                                isFocused ? 'border-indigo-500 ring-2 ring-indigo-500/20 shadow-md bg-indigo-50/10' : 'border-slate-200 bg-white'
                                                            }`}
                                                        >
                                                            {/* Process level Header breakdown */}
                                                            <div className={`p-5 flex justify-between items-center ${isFocused ? 'bg-indigo-50/40 border-b border-indigo-100' : 'bg-slate-50 border-b border-slate-100'}`}>
                                                                <div className="space-y-1">
                                                                    <div className="flex items-center gap-1.5">
                                                                        {isFocused && <span className="w-1.5 h-1.5 rounded-full bg-indigo-600 animate-pulse"></span>}
                                                                        <span className="text-sm font-black text-slate-800 uppercase tracking-wide">{pGroup.processName}</span>
                                                                    </div>
                                                                    <p className="text-xs text-slate-500 font-bold">Contiene {pGroup.items.length} microproceso(s)</p>
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-xs font-mono font-black text-indigo-700 bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100 shadow-sm">
                                                                        {pProgress}% completitud
                                                                    </span>
                                                                </div>
                                                            </div>

                                                            {/* Content - Microprocesses list */}
                                                            <div className="divide-y divide-slate-100 bg-white">
                                                                {pGroup.items.map((micro: any, mIdx: number) => {
                                                                    return (
                                                                        <div key={micro.microprocess + mIdx} className="p-5 hover:bg-slate-50/30 transition-colors space-y-4">
                                                                            <div className="flex justify-between items-start gap-3">
                                                                                <div>
                                                                                    <span className="text-[14px] font-black text-slate-800 leading-snug block">{micro.microprocess}</span>
                                                                                    {micro.assignees && micro.assignees.length > 0 && (
                                                                                        <p className="text-[10.5px] text-slate-500 font-bold mt-1.5">
                                                                                            Responsables: <span className="text-slate-700">{micro.assignees.join(', ')}</span>
                                                                                        </p>
                                                                                    )}
                                                                                </div>
                                                                                <span className="text-xs font-mono font-black text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg select-none">
                                                                                    {micro.totalRequired > 0 ? Math.round((micro.totalApproved / micro.totalRequired) * 100) : 0}% avance
                                                                                </span>
                                                                            </div>

                                                                            {/* Document Status Columns */}
                                                                            <div className="grid grid-cols-4 gap-3">
                                                                                {(['AS IS', 'FCE', 'PM', 'TO BE'] as const).map(type => {
                                                                                    const isFilteredOut = mapDocTypeFilter !== 'TODOS' && mapDocTypeFilter !== type;
                                                                                    const doc = micro.docs[type];
                                                                                    if (!doc) {
                                                                                        return (
                                                                                            <div key={type} className={`bg-slate-50/50 border border-slate-100 rounded-xl p-2.5 text-center flex flex-col justify-center h-14 transition-all duration-300 ${isFilteredOut ? 'opacity-25 grayscale' : ''}`}>
                                                                                                <span className="text-[11px] text-slate-400 font-black tracking-wider block">{type}</span>
                                                                                                <span className="text-[9.5px] text-slate-400 font-bold italic mt-0.5">No req.</span>
                                                                                            </div>
                                                                                        );
                                                                                    }

                                                                                    const colorClasses: Record<DocState, string> = {
                                                                                        [DocState.NOT_STARTED]: 'bg-slate-50 text-slate-400 border-slate-200/60',
                                                                                        [DocState.INITIATED]: 'bg-indigo-50 text-indigo-600 border-indigo-100',
                                                                                        [DocState.IN_PROCESS]: 'bg-blue-50 text-blue-600 border-blue-105 border-blue-100',
                                                                                        [DocState.INTERNAL_REVIEW]: 'bg-sky-50 text-sky-600 border-sky-101 border-sky-100',
                                                                                        [DocState.SENT_TO_REFERENT]: 'bg-purple-50 text-purple-600 border-purple-101 border-purple-100',
                                                                                        [DocState.REFERENT_REVIEW]: 'bg-purple-100/70 text-purple-700 border-purple-201/60 border-purple-200/60',
                                                                                        [DocState.SENT_TO_CONTROL]: 'bg-orange-50 text-orange-600 border-orange-101 border-orange-100',
                                                                                        [DocState.CONTROL_REVIEW]: 'bg-orange-100/70 text-orange-700 border-orange-201/60 border-orange-200/60',
                                                                                        [DocState.APPROVED]: 'bg-green-50 text-green-655 text-green-655 text-green-650 text-green-600 border-green-200'
                                                                                    };

                                                                                    const labelMap: Record<DocState, string> = {
                                                                                        [DocState.NOT_STARTED]: 'Inactivo',
                                                                                        [DocState.INITIATED]: 'Iniciado',
                                                                                        [DocState.IN_PROCESS]: 'En Proc.',
                                                                                        [DocState.INTERNAL_REVIEW]: 'Rev. Int.',
                                                                                        [DocState.SENT_TO_REFERENT]: 'Recom.',
                                                                                        [DocState.REFERENT_REVIEW]: 'Recom.',
                                                                                        [DocState.SENT_TO_CONTROL]: 'Cierre',
                                                                                        [DocState.CONTROL_REVIEW]: 'Cierre',
                                                                                        [DocState.APPROVED]: 'Aprobado'
                                                                                    };

                                                                                    const styleClass = colorClasses[doc.state as DocState] || 'bg-slate-50 text-slate-400';
                                                                                    const label = labelMap[doc.state as DocState] || doc.state;

                                                                                    return (
                                                                                        <div 
                                                                                            key={type} 
                                                                                            onClick={() => {
                                                                                                if (isFilteredOut) return;
                                                                                                setSelectedMacroDetail(null);
                                                                                                navigate(`/doc/${doc.id}`);
                                                                                            }}
                                                                                            className={`border rounded-xl p-2.5 text-center flex flex-col justify-between h-14 ${styleClass} transition-all duration-300 ${isFilteredOut ? 'opacity-25 grayscale cursor-not-allowed pointer-events-none' : 'cursor-pointer hover:shadow-sm hover:scale-[1.02]'}`}
                                                                                        >
                                                                                            <span className="text-[11px] font-black tracking-wider block">{type}</span>
                                                                                            <div className="flex justify-between items-center text-[9.5px] font-mono leading-none font-bold mt-1">
                                                                                                <span className="opacity-75">v{doc.version}</span>
                                                                                                <span className="uppercase font-black text-[8.5px] tracking-tighter">{label}</span>
                                                                                            </div>
                                                                                        </div>
                                                                                    );
                                                                                })}
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        );
                                    })()}
                                </div>
                            </div>

                            {/* Footer closing panel */}
                            <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                                <button 
                                    onClick={() => setSelectedMacroDetail(null)}
                                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 transition-all rounded-lg shadow-sm"
                                >
                                    Cerrar Detalle
                                </button>
                            </div>
                        </div>
                    </div>
                )}
                </section>
                )}

                {(activeTab === 'BI' && (user.role === UserRole.ADMIN || user.canAccessBIQueryBuilder)) && (
                    <section className="animate-fadeIn">
                        <AdminBI hideHeader />
                    </section>
                )}
            </div>
        </div>
    );
};

const KPICard = ({ title, value, icon: Icon, color, sub, onClick, canClick }: any) => {
    const colorClasses: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100', green: 'bg-green-50 text-green-600 border-green-100', amber: 'bg-amber-50 text-amber-600 border-amber-100', slate: 'bg-slate-50 text-slate-600 border-slate-100' };
    return ( <div onClick={canClick ? onClick : undefined} className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${colorClasses[color] || colorClasses.indigo} ${canClick ? 'cursor-pointer hover:shadow-md transition-all active:scale-95' : ''}`}> <div className="flex justify-between items-start mb-2"><span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{title}</span><Icon size={16} /></div> <div><span className="text-xl font-bold">{value}</span><div className="flex justify-between items-center mt-1"><p className="text-[9px] opacity-80 font-medium">{sub}</p>{canClick && <ArrowRight size={10} className="opacity-60" />}</div></div> </div> );
};

const AgileBucket = ({ title, value, icon: Icon, color, onClick }: any) => {
    const colorMap: Record<string, string> = { 
        slate: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100', 
        blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100', 
        amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100', 
        purple: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100', 
        orange: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
        green: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100' 
    };
    return ( <div onClick={onClick} className={`p-3 rounded-xl border cursor-pointer transition-all active:scale-95 flex flex-col items-center text-center shadow-sm ${colorMap[color]}`}> <div className="p-2 rounded-full bg-white/50 mb-2"><Icon size={18} /></div> <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{title}</span> <span className="text-xl font-extrabold">{value}</span> </div> );
};

const MacroCard = ({ macro, onTypeSelect, onDetailSelect }: any) => {
    const [showOptions, setShowOptions] = useState(false);
    const progress = macro.totalRequired > 0 ? Math.round((macro.totalApproved / macro.totalRequired) * 100) : 0;
    
    const themeClasses = {
        'ESTRATEGICO': 'border-amber-200 bg-gradient-to-br from-amber-50/50 to-white hover:border-amber-400',
        'OPERATIVO': 'border-sky-200 bg-gradient-to-br from-sky-50/50 to-white hover:border-sky-400',
        'SOPORTE': 'border-purple-200 bg-gradient-to-br from-purple-50/50 to-white hover:border-purple-400'
    }[macro.category as 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE'] || 'border-slate-200 bg-white';
    
    const progressColorClasses = {
        'ESTRATEGICO': 'bg-amber-500',
        'OPERATIVO': 'bg-sky-500',
        'SOPORTE': 'bg-purple-500'
    }[macro.category as 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE'] || 'bg-indigo-600';

    const pillBg = {
        'ESTRATEGICO': 'bg-amber-100 text-amber-700',
        'OPERATIVO': 'bg-sky-100 text-sky-700',
        'SOPORTE': 'bg-purple-100 text-purple-700'
    }[macro.category as 'ESTRATEGICO' | 'OPERATIVO' | 'SOPORTE'] || 'bg-slate-100 text-slate-700';

    const groupedProcesses = useMemo(() => {
        if (macro.standardGroupedProcesses) {
            return macro.standardGroupedProcesses;
        }
        const pMap: Record<string, {
            processName: string;
            totalRequired: number;
            totalApproved: number;
        }> = {};
        macro.microprocesses.forEach((m: any) => {
            const pName = m.process || 'Sin Proceso';
            if (!pMap[pName]) {
                pMap[pName] = {
                    processName: pName,
                    totalRequired: 0,
                    totalApproved: 0
                };
            }
            pMap[pName].totalRequired += m.totalRequired;
            pMap[pName].totalApproved += m.totalApproved;
        });
        return Object.values(pMap);
    }, [macro.microprocesses, macro.standardGroupedProcesses]);

    return (
        <div 
            className={`p-5 rounded-2xl border shadow-sm transition-all flex flex-col justify-between cursor-pointer relative group ${themeClasses} hover:shadow min-h-[220px] h-full`}
            onClick={() => onDetailSelect(macro)}
        >
            {/* Quick classification switcher dropdown */}
            <div 
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={(e) => { e.stopPropagation(); setShowOptions(!showOptions); }}
            >
                <div className="px-1.5 py-0.5 rounded bg-slate-100/90 hover:bg-slate-200 transition-all text-[9.5px] font-black text-slate-600 flex items-center gap-0.5">
                    Mover <ChevronDown size={10} />
                </div>
                {showOptions && (
                    <div className="absolute right-0 mt-1 bg-white border border-slate-200 rounded-lg shadow-lg py-1 w-32 z-30 text-start">
                        {(['ESTRATEGICO', 'OPERATIVO', 'SOPORTE'] as const).map(cat => (
                            <button
                                key={cat}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onTypeSelect(cat);
                                    setShowOptions(false);
                                }}
                                className={`w-full text-left px-3 py-1.5 text-[9.5px] font-bold uppercase transition-colors hover:bg-slate-50 ${macro.category === cat ? 'text-indigo-600 bg-indigo-50/50' : 'text-slate-600'}`}
                            >
                                {cat === 'ESTRATEGICO' ? '👉 Estratégico' : cat === 'OPERATIVO' ? '👉 Operativo' : '👉 Soporte'}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            <div className="space-y-1 my-1 pr-8">
                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400 block truncate" title={macro.project}>{macro.project}</span>
                <span className="text-[14.5px] font-black text-slate-800 line-clamp-2 block leading-snug" title={macro.macroprocess}>{macro.macroprocess}</span>
            </div>

            {/* Apertura a nivel de Procesos */}
            <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 flex-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Procesos ({groupedProcesses.length})</span>
                <div className="flex gap-2.5 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-thumb-indigo-200 scrollbar-track-transparent pr-0.5 cursor-grab active:cursor-grabbing">
                    {groupedProcesses.map((p: any, idx: number) => {
                        const pProgress = p.totalRequired > 0 ? Math.round((p.totalApproved / p.totalRequired) * 100) : 0;
                        return (
                            <div 
                                key={p.processName + idx}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onDetailSelect({ ...macro, focusProcessName: p.processName });
                                }}
                                className="flex-shrink-0 w-36 h-[92px] flex flex-col justify-between text-left p-3 bg-slate-50 hover:bg-indigo-50/40 border border-slate-200 hover:border-indigo-300 rounded-xl shadow-sm hover:shadow transition-all duration-200 select-none group/item active:scale-95 cursor-pointer relative"
                            >
                                <span className="font-extrabold text-[11.5px] text-slate-800 leading-snug line-clamp-2" title={p.processName}>
                                    {p.processName}
                                </span>
                                <div className="flex justify-between items-center mt-1">
                                    <span className="font-mono font-black text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-100/50 shadow-sm leading-none">
                                        {pProgress}%
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-1.5 mt-4 pt-3 border-t border-slate-100/60">
                <div className="flex justify-between items-center text-[11px] font-bold font-mono">
                    <span className="text-slate-500">{macro.totalApproved}/{macro.totalRequired} Docs</span>
                    <span className={`${pillBg} px-1.5 rounded`}>{progress}%</span>
                </div>
                
                <div className="w-full bg-slate-200/50 h-1.5 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all duration-500 ${progressColorClasses}`} style={{ width: `${progress}%` }}></div>
                </div>
            </div>
        </div>
    );
};

export default Reports;