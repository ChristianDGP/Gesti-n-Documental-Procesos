import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService, HistoryService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, DocType, UserRole, DocHistory } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
    Users, CheckCircle, Clock, FileText, Filter, LayoutDashboard, Briefcase, Loader2, ArrowRight, Target, TrendingUp, AlertTriangle, Activity, ShieldAlert, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, BarChart2, TableProperties, FileSpreadsheet, ZoomIn, ZoomOut, Layers, PlayCircle, FastForward, Info, ShieldCheck, X, FolderTree
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
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [activeTab, setActiveTab] = useState<'REPORTS' | 'SUMMARY' | 'CLOSURE'>('REPORTS');
    const [chartScale, setChartScale] = useState<ChartScale>('MONTHLY');
    const [cfdRange, setCfdRange] = useState<3 | 6 | 12>(6);

    const [filterProject, setFilterProject] = useState('');
    const [filterAnalyst, setFilterAnalyst] = useState(isAnalyst ? user.id : '');
    const [activeType, setActiveType] = useState<string | null>(null);

    const [microDrillDown, setMicroDrillDown] = useState<{ title: string, color: string, items: {name: string, project: string, ids: string[]}[] } | null>(null);

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
            const [d, u, h, hist] = await Promise.all([
                DocumentService.getAll(),
                UserService.getAll(),
                HierarchyService.getFullHierarchy(),
                HistoryService.getAll()
            ]);
            setRealDocs(d);
            setUsers(u);
            setHierarchy(h);
            setHistory(hist);
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

    // LÓGICA DE AGREGACIÓN DE MICROPROCESOS (Unidad de Negocio)
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

            // REGLA CRÍTICA: Un microproceso está TERMINADO solo si el 100% de sus documentos requeridos son APPROVED.
            const allApproved = group.states.length > 0 && group.states.every(s => s === DocState.APPROVED);
            
            const hasControl = group.states.some(s => [DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(s));
            const hasReferent = group.states.some(s => [DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW].includes(s));
            const hasProgress = group.states.some(s => s !== DocState.NOT_STARTED);

            if (allApproved) {
                stats.finished.push(microItem);
            } else if (hasControl) {
                stats.control.push(microItem);
            } else if (hasReferent) {
                stats.referent.push(microItem);
            } else if (hasProgress) {
                stats.inProcess.push(microItem);
            } else {
                stats.notStarted.push(microItem);
            }
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
            internalReview: { count: 0, ids: [] as string[] },
            validation: { count: 0, ids: [] as string[] },
            done: { count: 0, ids: [] as string[] }
        };
        filteredDocs.forEach(d => {
            if (d.state === DocState.NOT_STARTED) { stats.backlog.count++; stats.backlog.ids.push(d.id); }
            else if (d.state === DocState.INITIATED || d.state === DocState.IN_PROCESS) { stats.development.count++; stats.development.ids.push(d.id); }
            else if (d.state === DocState.INTERNAL_REVIEW) { stats.internalReview.count++; stats.internalReview.ids.push(d.id); }
            else if ([DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(d.state)) { stats.validation.count++; stats.validation.ids.push(d.id); }
            else if (d.state === DocState.APPROVED) { stats.done.count++; stats.done.ids.push(d.id); }
        });
        return stats;
    }, [filteredDocs]);

    // CFD CON ZOOM DINÁMICO
    const cfdData = useMemo(() => {
        const data: any[] = [];
        const now = new Date();
        
        const historyByDoc: Record<string, DocHistory[]> = {};
        history.forEach(h => {
            if (!historyByDoc[h.documentId]) historyByDoc[h.documentId] = [];
            historyByDoc[h.documentId].push(h);
        });

        // Iterar según el rango dinámico (3, 6 o 12 meses)
        for (let i = cfdRange - 1; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthLabel = d.toLocaleString('es-ES', { month: 'short' });
            const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59);
            const endOfMonthISO = endOfMonth.toISOString();
            
            let backlog = 0, dev = 0, review = 0, validation = 0, done = 0;
            
            filteredDocs.forEach(doc => {
                if (doc.isVirtual) {
                    backlog++;
                } else {
                    const docHistory = (historyByDoc[doc.id] || []).filter(h => h.timestamp <= endOfMonthISO);
                    
                    if (docHistory.length > 0) {
                        const latestEntry = docHistory.sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
                        const state = latestEntry.newState;
                        if (state === DocState.APPROVED) done++;
                        else if ([DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(state)) validation++;
                        else if (state === DocState.INTERNAL_REVIEW) review++;
                        else if (state === DocState.INITIATED || state === DocState.IN_PROCESS) dev++;
                        else backlog++;
                    } else {
                        const createdDate = new Date(doc.createdAt || doc.updatedAt);
                        if (createdDate > endOfMonth) {
                            backlog++;
                        } else {
                            if (doc.state === DocState.NOT_STARTED) backlog++;
                            else dev++;
                        }
                    }
                }
            });
            data.push({ month: monthLabel, 'Backlog': backlog, 'Desarrollo': dev, 'Rev. Interna': review, 'Validación': validation, 'Finalizado': done });
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
        const stats = { notStarted: { value: 0, ids: [] as string[] }, inProcess: { value: 0, ids: [] as string[] }, referent: { value: 0, ids: [] as string[] }, control: { value: 0, ids: [] as string[] }, finished: { value: 0, ids: [] as string[] } };
        filteredDocs.forEach(d => {
            if (d.state === DocState.NOT_STARTED) { stats.notStarted.value++; stats.notStarted.ids.push(d.id); }
            else if (d.state === DocState.APPROVED) { stats.finished.value++; stats.finished.ids.push(d.id); }
            else if (d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW) { stats.referent.value++; stats.referent.ids.push(d.id); }
            else if (d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW) { stats.control.value++; stats.control.ids.push(d.id); }
            else { stats.inProcess.value++; stats.inProcess.ids.push(d.id); }
        });
        return [ { name: 'No Iniciado', ...stats.notStarted }, { name: 'En Proceso', ...stats.inProcess }, { name: 'Referente', ...stats.referent }, { name: 'Control', ...stats.control }, { name: 'Terminados', ...stats.finished } ];
    }, [filteredDocs]);

    const analystData = useMemo(() => {
        const stats: Record<string, { assigned: number, approved: number, inProgress: number }> = {};
        filteredDocs.forEach(d => {
            d.assignees?.forEach(uid => {
                if (!stats[uid]) stats[uid] = { assigned: 0, approved: 0, inProgress: 0 };
                stats[uid].assigned++; if (d.state === DocState.APPROVED) stats[uid].approved++; else if (d.state !== DocState.NOT_STARTED) stats[uid].inProgress++;
            });
        });
        return Object.keys(stats).map(uid => { const u = users.find(user => user.id === uid); return { name: u ? (u.nickname || u.name.split(' ')[0]) : 'Desc.', Requeridos: stats[uid].assigned, EnProceso: stats[uid].inProgress, Terminados: stats[uid].approved }; }).sort((a, b) => b.Requeridos - a.Requeridos).slice(0, 10);
    }, [filteredDocs, users]);

    const typeComplianceData = useMemo(() => {
        const types: DocType[] = ['AS IS', 'FCE', 'PM', 'TO BE'];
        return types.map((type) => {
            const docsOfType = filteredDocs.filter(d => d.docType === type);
            const finishedDocs = docsOfType.filter(d => d.state === DocState.APPROVED);
            const percent = docsOfType.length > 0 ? Math.round((finishedDocs.length / docsOfType.length) * 100) : 0;
            return { type, total: docsOfType.length, finished: finishedDocs.length, percent, color: TYPE_COLORS[type], finishedIds: finishedDocs.map(d => d.id), pendingIds: docsOfType.filter(d => d.state !== DocState.APPROVED).map(d => d.id) };
        });
    }, [filteredDocs]);

    const evolutionData = useMemo(() => {
        const monthsNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        const now = new Date();
        const periods: any[] = [];
        if (chartScale === 'ANNUAL') { for (let i = 4; i >= 0; i--) { const year = now.getFullYear() - i; periods.push({ key: year.toString(), label: year.toString(), 'AS IS': 0, 'FCE': 0, 'PM': 0, 'TO BE': 0 }); } } 
        else if (chartScale === 'MONTHLY') { for (let i = 11; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); const label = `${monthsNames[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`; const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; periods.push({ key: yearMonthKey, label: label, 'AS IS': 0, 'FCE': 0, 'PM': 0, 'TO BE': 0 }); } } 
        else if (chartScale === 'WEEKLY') { for (let i = 7; i >= 0; i--) { const d = new Date(); d.setDate(d.getDate() - (i * 7)); const weekNum = Math.ceil(d.getDate() / 7); const label = `S${weekNum}-${monthsNames[d.getMonth()]}`; const firstDayOfYear = new Date(d.getFullYear(), 0, 1); const pastDaysOfYear = (d.getTime() - firstDayOfYear.getTime()) / 86400000; const weekOfYear = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7); const key = `${d.getFullYear()}-W${weekOfYear}`; periods.push({ key, label, 'AS IS': 0, 'FCE': 0, 'PM': 0, 'TO BE': 0 }); } }
        filteredDocs.filter(d => d.state === DocState.APPROVED).forEach(d => {
            const date = new Date(d.updatedAt); if (isNaN(date.getTime())) return;
            let docKey = ''; if (chartScale === 'ANNUAL') { docKey = date.getFullYear().toString(); } else if (chartScale === 'MONTHLY') { docKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; } else if (chartScale === 'WEEKLY') { const firstDayOfYear = new Date(date.getFullYear(), 0, 1); const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000; const weekOfYear = Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7); docKey = `${date.getFullYear()}-W${weekOfYear}`; }
            const period = periods.find(p => p.key === docKey); if (period && d.docType) period[d.docType]++;
        });
        return periods;
    }, [filteredDocs, chartScale]);

    const goToDashboard = (ids: string[]) => navigate('/', { state: { filterIds: ids, fromReport: true } });

    const handleExportClosureExcel = () => {
        if (closureBoardData.length === 0) return;
        const headers = ['PROYECTO', 'MACROPROCESO', 'PROCESO', 'MICROPROCESO', 'Versión AS IS', 'Estado AS IS', 'Versión FCE', 'Estado FCE', 'Versión PM', 'Estado PM', 'Versión TO BE', 'Estado TO BE', 'PERIODO'];
        const rows = closureBoardData.map(item => {
            const getInfo = (type: string) => { const data = item.docs[type]; if (!data) return { v: '-', s: 'No req.' }; return { v: data.version, s: STATE_CONFIG[data.state as DocState]?.label.split('(')[0].trim() || '-' }; };
            const asis = getInfo('AS IS'); const fce = getInfo('FCE'); const pm = getInfo('PM'); const tobe = getInfo('TO BE');
            return [item.project, item.macro, item.process, item.micro, asis.v, asis.s, fce.v, fce.s, pm.v, pm.s, tobe.v, tobe.s, closureMonth];
        });
        const csvContent = [headers.join(';'), ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))].join('\n');
        const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.setAttribute('href', url); link.setAttribute('download', `SGD_Cierre_Mensual_${closureMonth}.csv`);
        link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const handleCfdZoomIn = () => {
        if (cfdRange === 12) setCfdRange(6);
        else if (cfdRange === 6) setCfdRange(3);
    };

    const handleCfdZoomOut = () => {
        if (cfdRange === 3) setCfdRange(6);
        else if (cfdRange === 6) setCfdRange(12);
    };

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
                <button onClick={() => setActiveTab('REPORTS')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'REPORTS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><BarChart2 size={18} /> 1. Reportes de Gestión</button>
                <button onClick={() => setActiveTab('SUMMARY')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'SUMMARY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><ShieldAlert size={18} /> 2. Monitor de Continuidad</button>
                <button onClick={() => setActiveTab('CLOSURE')} className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab === 'CLOSURE' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}><TableProperties size={18} /> 3. Cierre Mensual</button>
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
                                <KPICard title="MicroProc. Requeridos" value={microStats.total.length} icon={Layers} color="slate" sub="Universo Total" onClick={() => setMicroDrillDown({title: "Microprocesos Requeridos", color: "slate", items: microStats.total})} canClick={microStats.total.length > 0} />
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
                                <KPICard title="Alertas Rev. Interna" value={kpis.overdueInternalIds.length} icon={AlertTriangle} color="amber" sub="&gt; 30 días en v0.n" onClick={() => goToDashboard(kpis.overdueInternalIds)} canClick={kpis.overdueInternalIds.length > 0} />
                                <KPICard title="Alertas Referente" value={kpis.overdueReferentIds.length} icon={AlertTriangle} color="amber" sub="&gt; 30 días en v1.n / v1.n.i" onClick={() => goToDashboard(kpis.overdueReferentIds)} canClick={kpis.overdueReferentIds.length > 0} />
                                <KPICard title="Alerta Control Gestión" value={kpis.overdueControlIds.length} icon={AlertTriangle} color="amber" sub="&gt; 30 días en v1.nAR" onClick={() => goToDashboard(kpis.overdueControlIds)} canClick={kpis.overdueControlIds.length > 0} />
                                <KPICard title="Docs. Terminados" value={kpis.approved} icon={CheckCircle} color="green" sub="Cierre Administrativo" onClick={() => goToDashboard(kpis.approvedIds)} canClick={kpis.approved > 0} />
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                            <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><Target size={16} /> Cumplimiento por Tipo de Documento</h3>
                            <p className="text-xs text-slate-500 mb-8">Efectividad de entrega sobre el universo total requerido.</p>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                                {typeComplianceData.map((item) => (
                                    <div key={item.type} className="flex flex-col items-center">
                                        <div className="relative w-28 h-28 mb-3">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <PieChart>
                                                    <Pie data={[{ name: 'Aprobados', value: item.percent, ids: item.finishedIds, fill: item.color }, { name: 'Pendientes', value: 100 - item.percent, ids: item.pendingIds, fill: '#f1f5f9' }]} cx="50%" cy="50%" innerRadius={35} outerRadius={50} startAngle={90} endAngle={-270} dataKey="value" stroke="none" onClick={(data) => { if (data && data.ids && data.ids.length > 0) goToDashboard(data.ids); }}>
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
                                            <Pie data={stateData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value" onClick={(data) => { if (data && data.ids && data.ids.length > 0) goToDashboard(data.ids); }}>
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
                                                <Tooltip />
                                                <Legend />
                                                <Bar dataKey="Requeridos" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="EnProceso" name="En Proceso" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                                                <Bar dataKey="Terminados" fill="#22c55e" radius={[4, 4, 0, 0]} />
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
                                    <button onClick={() => setChartScale(chartScale === 'ANNUAL' ? 'MONTHLY' : chartScale === 'MONTHLY' ? 'WEEKLY' : 'WEEKLY')} disabled={chartScale === 'ANNUAL'} className="p-1.5 hover:bg-white hover:text-indigo-600 disabled:opacity-30 rounded transition-all" title="Zoom Out (Menos detalle)"><ZoomOut size={18} /></button>
                                    <div className="px-2 text-[10px] font-bold uppercase text-slate-500 min-w-[70px] text-center">{getScaleLabel(chartScale)}</div>
                                    <button onClick={() => setChartScale(chartScale === 'WEEKLY' ? 'MONTHLY' : chartScale === 'MONTHLY' ? 'ANNUAL' : 'ANNUAL')} disabled={chartScale === 'WEEKLY'} className="p-1.5 hover:bg-white hover:text-indigo-600 disabled:opacity-30 rounded transition-all" title="Zoom In (Más detalle)"><ZoomIn size={18} /></button>
                                </div>
                            </div>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            {Object.entries(TYPE_COLORS).map(([type, color]) => (
                                                <linearGradient key={type} id={`grad-${type.replace(' ', '')}`} x1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor={color} stopOpacity={0.3}/><stop offset="95%" stopColor={color} stopOpacity={0}/>
                                                </linearGradient>
                                            ))}
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                        <XAxis dataKey="label" tick={{fontSize: 11, fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} tickLine={false} />
                                        <YAxis allowDecimals={false} domain={[0, 'dataMax']} tick={{fontSize: 11, fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} tickLine={false} />
                                        <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                                        <Legend verticalAlign="top" height={40} iconType="circle" onClick={(o) => { const { dataKey } = o; setActiveType(activeType === dataKey ? null : dataKey as string); }} wrapperStyle={{ cursor: 'pointer' }} />
                                        {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => (
                                            <Area key={type} type="monotone" dataKey={type} stroke={TYPE_COLORS[type]} fill={`url(#grad-${type.replace(' ', '')})`} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} hide={activeType !== null && activeType !== type} />
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
                            <AgileBucket title="Backlog" value={agileFlowStats.backlog.count} icon={Layers} color="slate" onClick={() => goToDashboard(agileFlowStats.backlog.ids)} />
                            <AgileBucket title="En Desarrollo" value={agileFlowStats.development.count} icon={PlayCircle} color="blue" onClick={() => goToDashboard(agileFlowStats.development.ids)} />
                            <AgileBucket title="Rev. Interna" value={agileFlowStats.internalReview.count} icon={FileText} color="amber" onClick={() => goToDashboard(agileFlowStats.internalReview.ids)} />
                            <AgileBucket title="Validación" value={agileFlowStats.validation.count} icon={FastForward} color="purple" onClick={() => goToDashboard(agileFlowStats.validation.ids)} />
                            <AgileBucket title="Finalizado" value={agileFlowStats.done.count} icon={CheckCircle} color="green" onClick={() => goToDashboard(agileFlowStats.done.ids)} />
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
                                        <Area type="monotone" dataKey="Backlog" stackId="1" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.4} />
                                        <Area type="monotone" dataKey="Desarrollo" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.4} />
                                        <Area type="monotone" dataKey="Rev. Interna" stackId="1" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.4} />
                                        <Area type="monotone" dataKey="Validación" stackId="1" stroke="#a855f7" fill="#a855f7" fillOpacity={0.4} />
                                        <Area type="monotone" dataKey="Finalizado" stackId="1" stroke="#22c55e" fill="#22c55e" fillOpacity={0.6} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                            <div className="flex items-start gap-2 bg-slate-50 p-3 rounded-lg border border-slate-100 mt-4">
                                <Info size={16} className="text-slate-400 mt-0.5" />
                                <p className="text-[10px] text-slate-500 leading-relaxed italic"><b>Interpretación CFD:</b> La base (gris) muestra el volumen total pendiente por iniciar. Las capas superiores muestran el avance del trabajo. Un ensanchamiento excesivo de las capas medias indica cuellos de botella en el flujo.</p>
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
                                                {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => { const data = item.docs[type]; if (!data) return ( <React.Fragment key={type}><td className="px-2 py-4 border-b border-slate-50 text-center text-slate-200 italic border-l border-slate-50">-</td><td className="px-2 py-4 border-b border-slate-50 text-center text-slate-200 italic">No req.</td></React.Fragment> ); const cfg = STATE_CONFIG[data.state as DocState]; return ( <React.Fragment key={type}><td className="px-2 py-4 border-b border-slate-50 text-center font-mono font-bold text-slate-600 border-l border-slate-50">{data.version}</td><td className="px-2 py-4 border-b border-slate-50 text-center"><div className={`inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border shadow-sm ${cfg.color}`}>{cfg.label.split('(')[0].trim()}</div></td></React.Fragment> ); })}
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
            </div>
        </div>
    );
};

const KPICard = ({ title, value, icon: Icon, color, sub, onClick, canClick }: any) => {
    const colorClasses: Record<string, string> = { 
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100', green: 'bg-green-50 text-green-600 border-green-100', amber: 'bg-amber-50 text-amber-600 border-amber-100', slate: 'bg-slate-50 text-slate-600 border-slate-100'
    };
    return (
        <div onClick={canClick ? onClick : undefined} className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${colorClasses[color] || colorClasses.indigo} ${canClick ? 'cursor-pointer hover:shadow-md transition-all active:scale-95' : ''}`}>
            <div className="flex justify-between items-start mb-2"><span className="text-[9px] font-bold uppercase tracking-wider opacity-70">{title}</span><Icon size={16} /></div>
            <div><span className="text-xl font-bold">{value}</span><div className="flex justify-between items-center mt-1"><p className="text-[9px] opacity-80 font-medium">{sub}</p>{canClick && <ArrowRight size={10} className="opacity-60" />}</div></div>
        </div>
    );
};

const AgileBucket = ({ title, value, icon: Icon, color, onClick }: any) => {
    const colorMap: Record<string, string> = {
        slate: 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100',
        blue: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
        amber: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
        purple: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
        green: 'bg-green-50 text-green-700 border-green-200 hover:bg-green-100'
    };
    return (
        <div onClick={onClick} className={`p-3 rounded-xl border cursor-pointer transition-all active:scale-95 flex flex-col items-center text-center shadow-sm ${colorMap[color]}`}>
            <div className="p-2 rounded-full bg-white/50 mb-2"><Icon size={18} /></div>
            <span className="text-[10px] font-bold uppercase tracking-wide opacity-80">{title}</span>
            <span className="text-xl font-extrabold">{value}</span>
        </div>
    );
};

// Helper function to map scale to a readable label
const getScaleLabel = (scale: string) => {
    switch (scale) {
        case 'ANNUAL': return 'Anual';
        case 'MONTHLY': return 'Mensual';
        case 'WEEKLY': return 'Semanal';
        default: return 'Mensual';
    }
};

export default Reports;