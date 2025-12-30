
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService, HistoryService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, DocType, UserRole, DocHistory } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
    Users, CheckCircle, Clock, FileText, Filter, LayoutDashboard, Briefcase, Loader2, ArrowRight, Target, TrendingUp, AlertTriangle, Activity, ShieldAlert, CalendarDays, ChevronLeft, ChevronRight, ExternalLink, BarChart2, ClipboardList, TableProperties, FileSpreadsheet
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

const STUCK_ITEMS_PER_PAGE = 9;
const CLOSURE_ITEMS_PER_PAGE = 15;

const Reports: React.FC<Props> = ({ user }) => {
    const navigate = useNavigate();
    const isAnalyst = user.role === UserRole.ANALYST;

    const [realDocs, setRealDocs] = useState<Document[]>([]);
    const [history, setHistory] = useState<DocHistory[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [activeTab, setActiveTab] = useState<'REPORTS' | 'SUMMARY' | 'CLOSURE'>('REPORTS');

    const [filterProject, setFilterProject] = useState('');
    const [filterAnalyst, setFilterAnalyst] = useState(isAnalyst ? user.id : '');
    const [activeType, setActiveType] = useState<string | null>(null);

    const [closureMonth, setClosureMonth] = useState(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
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

    const closureBoardData = useMemo(() => {
        if (!closureMonth || !unifiedData.length) return [];
        
        const [year, month] = closureMonth.split('-').map(Number);
        const lastDayOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString();
        
        const historyByDoc: Record<string, DocHistory[]> = {};
        history.forEach(h => {
            if (!historyByDoc[h.documentId]) historyByDoc[h.documentId] = [];
            historyByDoc[h.documentId].push(h);
        });

        const microMap: Record<string, { project: string, macro: string, process: string, micro: string, docs: Record<string, { state: DocState, version: string }> }> = {};

        unifiedData.forEach(d => {
            if (filterProject && d.project !== filterProject) return;
            if (filterAnalyst && !d.assignees?.includes(filterAnalyst)) return;

            const microKey = `${d.project}|${d.macroprocess}|${d.process}|${d.microprocess}`;
            if (!microMap[microKey]) {
                microMap[microKey] = { project: d.project!, macro: d.macroprocess!, process: d.process!, micro: d.microprocess!, docs: {} };
            }

            let stateAtClosure = DocState.NOT_STARTED;
            let versionAtClosure = '-';
            
            if (!d.isVirtual) {
                const docHistory = historyByDoc[d.id] || [];
                const lastEntry = docHistory
                    .filter(h => h.timestamp <= lastDayOfMonth)
                    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))[0];
                
                if (lastEntry) {
                    stateAtClosure = lastEntry.newState;
                    versionAtClosure = d.version; 
                }
            }

            if (d.docType) {
                microMap[microKey].docs[d.docType] = { state: stateAtClosure, version: versionAtClosure };
            }
        });

        return Object.values(microMap).sort((a, b) => {
            const pComp = a.project.localeCompare(b.project);
            if (pComp !== 0) return pComp;
            const mComp = a.macro.localeCompare(b.macro);
            if (mComp !== 0) return mComp;
            const prComp = a.process.localeCompare(b.process);
            if (prComp !== 0) return prComp;
            return a.micro.localeCompare(b.micro);
        });
    }, [closureMonth, unifiedData, history, filterProject, filterAnalyst]);

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

    const executiveMetrics = useMemo(() => {
        if (!filteredDocs.length) return { stuckDocs: [] as StuckDoc[] };
        const now = new Date().getTime();
        const historyByDoc: Record<string, DocHistory[]> = {};
        history.forEach(h => {
            if (!historyByDoc[h.documentId]) historyByDoc[h.documentId] = [];
            historyByDoc[h.documentId].push(h);
        });

        const stuckDocsList: StuckDoc[] = [];
        filteredDocs.forEach(d => {
            if (d.state === DocState.APPROVED || d.state === DocState.NOT_STARTED) return;
            const docHistory = historyByDoc[d.id] || [];
            const lastTransition = docHistory
                .filter(h => h.newState === d.state)
                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())[0];
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
        return [
          { name: 'No Iniciado', ...stats.notStarted }, { name: 'En Proceso', ...stats.inProcess }, { name: 'Referente', ...stats.referent }, { name: 'Control', ...stats.control }, { name: 'Terminados', ...stats.finished }
        ];
    }, [filteredDocs]);

    const analystData = useMemo(() => {
        const stats: Record<string, { assigned: number, approved: number, inProgress: number }> = {};
        filteredDocs.forEach(d => {
            d.assignees?.forEach(uid => {
                if (!stats[uid]) stats[uid] = { assigned: 0, approved: 0, inProgress: 0 };
                stats[uid].assigned++;
                if (d.state === DocState.APPROVED) stats[uid].approved++;
                else if (d.state !== DocState.NOT_STARTED) stats[uid].inProgress++;
            });
        });
        return Object.keys(stats).map(uid => {
            const u = users.find(user => user.id === uid);
            return { name: u ? (u.nickname || u.name.split(' ')[0]) : 'Desc.', Requeridos: stats[uid].assigned, EnProceso: stats[uid].inProgress, Terminados: stats[uid].approved };
        }).sort((a, b) => b.Requeridos - a.Requeridos).slice(0, 10);
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
        for (let i = 11; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const label = `${monthsNames[d.getMonth()]}-${String(d.getFullYear()).slice(-2)}`;
            const yearMonthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            periods.push({ key: yearMonthKey, label: label, 'AS IS': 0, 'FCE': 0, 'PM': 0, 'TO BE': 0 });
        }
        filteredDocs.filter(d => d.state === DocState.APPROVED).forEach(d => {
            const date = new Date(d.updatedAt);
            if (isNaN(date.getTime())) return;
            const docKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const period = periods.find(p => p.key === docKey);
            if (period && d.docType) period[d.docType]++;
        });
        return periods;
    }, [filteredDocs]);

    const goToDashboard = (ids: string[]) => navigate('/', { state: { filterIds: ids, fromReport: true } });

    const handleExportClosureExcel = () => {
        if (closureBoardData.length === 0) return;
        
        const headers = [
            'PROYECTO', 'MACROPROCESO', 'PROCESO', 'MICROPROCESO', 
            'Versión AS IS', 'Estado AS IS', 
            'Versión FCE', 'Estado FCE', 
            'Versión PM', 'Estado PM', 
            'Versión TO BE', 'Estado TO BE', 
            'PERIODO'
        ];
        
        const rows = closureBoardData.map(item => {
            const getInfo = (type: string) => {
                const data = item.docs[type];
                if (!data) return { v: '-', s: 'No req.' };
                return { v: data.version, s: STATE_CONFIG[data.state]?.label.split('(')[0].trim() || '-' };
            };

            const asis = getInfo('AS IS');
            const fce = getInfo('FCE');
            const pm = getInfo('PM');
            const tobe = getInfo('TO BE');

            return [
                item.project,
                item.macro,
                item.process,
                item.micro,
                asis.v, asis.s,
                fce.v, fce.s,
                pm.v, pm.s,
                tobe.v, tobe.s,
                closureMonth
            ];
        });

        const csvContent = [headers.join(';'), ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))].join('\n');
        const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `SGD_Cierre_Mensual_${closureMonth}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Analizando métricas ejecutivas...</div>;

    const totalStuck = executiveMetrics.stuckDocs.length;
    const totalStuckPages = Math.ceil(totalStuck / STUCK_ITEMS_PER_PAGE);
    const displayedStuck = executiveMetrics.stuckDocs.slice((stuckPage - 1) * STUCK_ITEMS_PER_PAGE, stuckPage * STUCK_ITEMS_PER_PAGE);

    const totalClosureItems = closureBoardData.length;
    const totalClosurePages = Math.ceil(totalClosureItems / CLOSURE_ITEMS_PER_PAGE);
    const displayedClosure = closureBoardData.slice((closurePage - 1) * CLOSURE_ITEMS_PER_PAGE, closurePage * CLOSURE_ITEMS_PER_PAGE);

    const generateMonthOptions = () => {
        const options = [];
        const now = new Date();
        for (let i = 0; i < 12; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = d.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            options.push(<option key={val} value={val}>{label}</option>);
        }
        return options;
    };

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutDashboard className="text-indigo-600" /> 
                        Panel Estratégico de Control
                    </h1>
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
                <button
                    onClick={() => setActiveTab('REPORTS')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                        activeTab === 'REPORTS'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <BarChart2 size={18} />
                    1. Reportes de Gestión
                </button>
                <button
                    onClick={() => setActiveTab('SUMMARY')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                        activeTab === 'SUMMARY'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <ShieldAlert size={18} />
                    2. Monitor de Continuidad
                </button>
                <button
                    onClick={() => setActiveTab('CLOSURE')}
                    className={`flex items-center gap-2 px-6 py-2.5 rounded-lg text-sm font-bold transition-all ${
                        activeTab === 'CLOSURE'
                        ? 'bg-white text-indigo-600 shadow-sm'
                        : 'text-slate-500 hover:text-slate-700'
                    }`}
                >
                    <TableProperties size={18} />
                    3. Cierre Mensual
                </button>
            </div>

            <div className="animate-fadeIn">
                {activeTab === 'REPORTS' && (
                    <section className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            <KPICard title="Requeridos" value={kpis.total} icon={FileText} color="indigo" sub={isAnalyst ? "Mi Carga Total" : "Inventario Requeridos"} onClick={() => goToDashboard(kpis.totalIds)} canClick={kpis.total > 0} />
                            <KPICard title="Alertas Rev. Interna" value={kpis.overdueInternalIds.length} icon={AlertTriangle} color="amber" sub="> 30 días en v0.n" onClick={() => goToDashboard(kpis.overdueInternalIds)} canClick={kpis.overdueInternalIds.length > 0} />
                            <KPICard title="Alertas Referente" value={kpis.overdueReferentIds.length} icon={AlertTriangle} color="amber" sub="> 30 días en v1.n / v1.n.i" onClick={() => goToDashboard(kpis.overdueReferentIds)} canClick={kpis.overdueReferentIds.length > 0} />
                            <KPICard title="Alerta Control de Gestión" value={kpis.overdueControlIds.length} icon={AlertTriangle} color="amber" sub="> 30 días en v1.nAR / v1.n.iAR" onClick={() => goToDashboard(kpis.overdueControlIds)} canClick={kpis.overdueControlIds.length > 0} />
                            <KPICard title="Terminados" value={kpis.approved} icon={CheckCircle} color="green" sub="Meta Cumplida" onClick={() => goToDashboard(kpis.approvedIds)} canClick={kpis.approved > 0} />
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
                            <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><TrendingUp size={16} /> Evolución Mensual</h3>
                            <p className="text-xs text-slate-500 mb-6">Velocidad de cierre: Cantidad de documentos terminados mensualmente por tipo.</p>
                            <div className="h-[350px] w-full">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={evolutionData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <defs>
                                            {Object.entries(TYPE_COLORS).map(([type, color]) => (
                                                <linearGradient key={type} id={`grad-${type.replace(' ', '')}`} x1="0" y1="0" x2="0" y2="1">
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
                        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                            <div className="p-6 pb-2">
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2"><ShieldAlert size={16} className="text-red-500" /> Monitor de Continuidad</h3>
                                        <p className="text-xs text-slate-500 mt-1">Documentos con más de 30 días sin cambios de estado.</p>
                                    </div>
                                    {totalStuck > 0 && (
                                        <button onClick={() => goToDashboard(executiveMetrics.stuckDocs.map(d => d.id))} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-bold text-xs uppercase tracking-wider">
                                            <ExternalLink size={14} /> Ver en Dashboard
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="flex-1 px-6 pb-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {totalStuck === 0 ? (
                                        <div className="col-span-full py-12 text-center text-slate-400">
                                            <CheckCircle size={32} className="mx-auto mb-2 text-green-200" /><p className="text-xs">Sin riesgos de continuidad.</p>
                                        </div>
                                    ) : displayedStuck.map((d: StuckDoc) => (
                                        <div key={d.id} onClick={() => navigate(`/doc/${d.id}`)} className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer group shadow-sm flex flex-col justify-between">
                                            <div>
                                                <div className="flex justify-between items-start mb-2">
                                                    <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{d.project}</span>
                                                    <span className="text-[10px] font-bold px-2 py-1 rounded border bg-red-50 text-red-600 border-red-100">{d.daysStuck} días</span>
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
                            {totalStuck > STUCK_ITEMS_PER_PAGE && (
                                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                                    <div className="text-[11px] text-slate-500">Mostrando {Math.min(totalStuck, (stuckPage - 1) * STUCK_ITEMS_PER_PAGE + 1)} - {Math.min(totalStuck, stuckPage * STUCK_ITEMS_PER_PAGE)} de {totalStuck}</div>
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
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2">Tablero de Cierre Mensual</h3>
                                        <p className="text-xs text-slate-500 mt-0.5">Estado jerárquico de la matriz al cierre de mes.</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <button 
                                        onClick={handleExportClosureExcel}
                                        className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-all shadow-sm text-xs font-bold"
                                    >
                                        <FileSpreadsheet size={14} className="text-green-600" />
                                        Exportar Cierre
                                    </button>
                                    <div className="h-6 w-px bg-slate-200 mx-1"></div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs font-bold text-slate-400 uppercase">Periodo:</label>
                                        <select value={closureMonth} onChange={(e) => { setClosureMonth(e.target.value); setClosurePage(1); }} className="bg-slate-50 border border-slate-200 text-sm font-bold text-slate-700 p-2 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500">
                                            {generateMonthOptions()}
                                        </select>
                                    </div>
                                </div>
                            </div>

                            <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse min-w-[1500px]">
                                    <thead className="text-[10px] text-slate-400 uppercase font-bold bg-slate-50/50">
                                        <tr>
                                            <th className="px-4 py-3 border-b border-slate-100">PROYECTO</th>
                                            <th className="px-4 py-3 border-b border-slate-100">JERARQUÍA (MACRO / PROCESO)</th>
                                            <th className="px-4 py-3 border-b border-slate-100 sticky left-0 bg-slate-50 z-10 w-64 shadow-[2px_0_5px_rgba(0,0,0,0.05)]">MICROPROCESO</th>
                                            <th className="px-4 py-3 border-b border-slate-100 text-center bg-blue-50/30" colSpan={2}>AS IS</th>
                                            <th className="px-4 py-3 border-b border-slate-100 text-center bg-red-50/30" colSpan={2}>FCE</th>
                                            <th className="px-4 py-3 border-b border-slate-100 text-center bg-yellow-50/30" colSpan={2}>PM</th>
                                            <th className="px-4 py-3 border-b border-slate-100 text-center bg-green-50/30" colSpan={2}>TO BE</th>
                                        </tr>
                                        <tr className="bg-slate-50/30 text-[8px] text-slate-400">
                                            <th colSpan={3} className="border-b border-slate-100 sticky left-0 bg-slate-50/30 z-10"></th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center border-l border-slate-100">Versión</th>
                                            <th className="px-2 py-1 border-b border-slate-100 text-center">Estado</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {displayedClosure.length === 0 ? (
                                            <tr><td colSpan={11} className="p-12 text-center text-slate-400 font-medium">Sin datos registrados para los filtros seleccionados.</td></tr>
                                        ) : displayedClosure.map((item, idx) => (
                                            <tr key={`${item.project}-${item.micro}-${idx}`} className="hover:bg-slate-50/50 transition-colors text-[10px]">
                                                <td className="px-4 py-4 border-b border-slate-50 font-bold text-slate-700">{item.project}</td>
                                                <td className="px-4 py-4 border-b border-slate-50">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-700 truncate max-w-[200px]" title={item.macro}>{item.macro}</span>
                                                        <span className="text-slate-500 text-[9px] truncate max-w-[200px]" title={item.process}>{item.process}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-4 border-b border-slate-50 sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                                                    <span className="font-bold text-indigo-700">{item.micro}</span>
                                                </td>
                                                {['AS IS', 'FCE', 'PM', 'TO BE'].map(type => {
                                                    const data = item.docs[type];
                                                    if (!data) return (
                                                        <React.Fragment key={type}>
                                                            <td className="px-2 py-4 border-b border-slate-50 text-center text-slate-200 italic border-l border-slate-50">-</td>
                                                            <td className="px-2 py-4 border-b border-slate-50 text-center text-slate-200 italic">No req.</td>
                                                        </React.Fragment>
                                                    );
                                                    
                                                    const cfg = STATE_CONFIG[data.state as DocState];
                                                    return (
                                                        <React.Fragment key={type}>
                                                            <td className="px-2 py-4 border-b border-slate-50 text-center font-mono font-bold text-slate-600 border-l border-slate-50">
                                                                {data.version}
                                                            </td>
                                                            <td className="px-2 py-4 border-b border-slate-50 text-center">
                                                                <div className={`inline-flex px-2 py-0.5 rounded-full text-[8px] font-bold uppercase border shadow-sm ${cfg.color}`}>
                                                                    {cfg.label.split('(')[0].trim()}
                                                                </div>
                                                            </td>
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {totalClosureItems > CLOSURE_ITEMS_PER_PAGE && (
                                <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between">
                                    <div className="text-[11px] text-slate-500">Mostrando {Math.min(totalClosureItems, (closurePage - 1) * CLOSURE_ITEMS_PER_PAGE + 1)} - {Math.min(totalClosureItems, closurePage * CLOSURE_ITEMS_PER_PAGE)} de {totalClosureItems}</div>
                                    <div className="flex items-center gap-2">
                                        <button onClick={() => setClosurePage(p => Math.max(1, p - 1))} disabled={closurePage === 1} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors"><ChevronLeft size={16} /></button>
                                        <div className="flex gap-1">
                                            {Array.from({ length: Math.min(5, totalClosurePages) }, (_, i) => {
                                                let p = i + 1;
                                                if (totalClosurePages > 5 && closurePage > 3) p = closurePage - 2 + i;
                                                if (p > totalClosurePages) p = totalClosurePages - (4 - i);
                                                if (p < 1) p = i + 1;
                                                return (
                                                    <button key={p} onClick={() => setClosurePage(p)} className={`w-7 h-7 rounded text-[10px] font-bold border transition-all ${closurePage === p ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:border-indigo-400'}`}>{p}</button>
                                                );
                                            })}
                                        </div>
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
            <div className="flex justify-between items-start mb-2"><span className="text-xs font-bold uppercase tracking-wider opacity-70">{title}</span><Icon size={18} /></div>
            <div><span className="text-2xl font-bold">{value}</span><div className="flex justify-between items-center mt-1"><p className="text-[10px] opacity-80 font-medium">{sub}</p>{canClick && <ArrowRight size={12} className="opacity-60" />}</div></div>
        </div>
    );
};

export default Reports;
