
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService, HistoryService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, DocType, UserRole, DocHistory } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
    Users, CheckCircle, Clock, FileText, Filter, LayoutDashboard, Briefcase, Loader2, ArrowRight, Target, TrendingUp, AlertTriangle, Activity, ShieldAlert, ChevronLeft, ChevronRight, ExternalLink
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

const Reports: React.FC<Props> = ({ user }) => {
    const navigate = useNavigate();
    const isAnalyst = user.role === UserRole.ANALYST;

    const [realDocs, setRealDocs] = useState<Document[]>([]);
    const [history, setHistory] = useState<DocHistory[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [filterProject, setFilterProject] = useState('');
    const [filterAnalyst, setFilterAnalyst] = useState(isAnalyst ? user.id : '');
    const [activeType, setActiveType] = useState<string | null>(null);

    // Paginación para documentos críticos
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

    const kpis = useMemo(() => {
        const now = new Date().getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

        const notStarted = filteredDocs.filter(d => d.state === DocState.NOT_STARTED);
        const approved = filteredDocs.filter(d => d.state === DocState.APPROVED);
        
        const overdueInternal = filteredDocs.filter(d => 
            d.state === DocState.INTERNAL_REVIEW && 
            (now - new Date(d.updatedAt).getTime()) > thirtyDaysMs
        );
        
        const overdueReferent = filteredDocs.filter(d => 
            (d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW) && 
            (now - new Date(d.updatedAt).getTime()) > thirtyDaysMs
        );

        const overdueControl = filteredDocs.filter(d => 
            (d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW) && 
            (now - new Date(d.updatedAt).getTime()) > thirtyDaysMs
        );

        return { 
            total: filteredDocs.length, 
            totalIds: filteredDocs.map(d => d.id),
            notStarted: notStarted.length,
            notStartedIds: notStarted.map(d => d.id),
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
            
            if (daysInState > 30) {
                stuckDocsList.push({ ...d, daysStuck: daysInState });
            }
        });

        return { 
            stuckDocs: stuckDocsList.sort((a, b) => b.daysStuck - a.daysStuck)
        };
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
            if (d.state === DocState.NOT_STARTED) {
                stats.notStarted.value++;
                stats.notStarted.ids.push(d.id);
            } else if (d.state === DocState.APPROVED) {
                stats.finished.value++;
                stats.finished.ids.push(d.id);
            } else if (d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW) {
                stats.referent.value++;
                stats.referent.ids.push(d.id);
            } else if (d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW) {
                stats.control.value++;
                stats.control.ids.push(d.id);
            } else {
                stats.inProcess.value++;
                stats.inProcess.ids.push(d.id);
            }
        });

        return [
          { name: 'No Iniciado', ...stats.notStarted },
          { name: 'En Proceso', ...stats.inProcess },
          { name: 'Referente', ...stats.referent },
          { name: 'Control', ...stats.control },
          { name: 'Terminados', ...stats.finished }
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
            const pendingDocs = docsOfType.filter(d => d.state !== DocState.APPROVED);
            const percent = docsOfType.length > 0 ? Math.round((finishedDocs.length / docsOfType.length) * 100) : 0;
            return { 
                type, 
                total: docsOfType.length, 
                finished: finishedDocs.length, 
                percent, 
                color: TYPE_COLORS[type],
                finishedIds: finishedDocs.map(d => d.id),
                pendingIds: pendingDocs.map(d => d.id)
            };
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
            periods.push({ 
                key: yearMonthKey, 
                label: label, 
                'AS IS': 0, 
                'FCE': 0, 
                'PM': 0, 
                'TO BE': 0 
            });
        }

        filteredDocs.filter(d => d.state === DocState.APPROVED).forEach(d => {
            const date = new Date(d.updatedAt);
            if (isNaN(date.getTime())) return;
            const docKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            const period = periods.find(p => p.key === docKey);
            if (period && d.docType) {
                period[d.docType]++;
            }
        });

        return periods;
    }, [filteredDocs]);

    const handleLegendClick = (o: any) => {
        const { dataKey } = o;
        if (activeType === dataKey) {
            setActiveType(null);
        } else {
            setActiveType(dataKey);
        }
    };

    const goToDashboard = (ids: string[]) => navigate('/', { state: { filterIds: ids, fromReport: true } });

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Analizando métricas ejecutivas...</div>;

    const totalStuck = executiveMetrics.stuckDocs.length;
    const totalStuckPages = Math.ceil(totalStuck / STUCK_ITEMS_PER_PAGE);
    const displayedStuck = executiveMetrics.stuckDocs.slice((stuckPage - 1) * STUCK_ITEMS_PER_PAGE, stuckPage * STUCK_ITEMS_PER_PAGE);

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutDashboard className="text-indigo-600" /> 
                        {isAnalyst ? 'Mi Reporte de Gestión' : 'Reportes de Gestión'}
                    </h1>
                    <p className="text-slate-500">
                        {isAnalyst ? 'Resumen de mi desempeño y cumplimiento.' : 'Métricas estratégicas y control de flujo documental.'}
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <Filter size={16} className="text-slate-400 ml-2" />
                    <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className={`bg-transparent text-sm font-medium text-slate-700 outline-none p-1 min-w-[150px] ${!isAnalyst ? 'border-r border-slate-100' : ''}`}>
                        <option value="">Todos los Proyectos</option>
                        {Array.from(new Set(unifiedData.map(d => d.project).filter(Boolean))).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    
                    {!isAnalyst && (
                        <select value={filterAnalyst} onChange={(e) => setFilterAnalyst(e.target.value)} className="bg-transparent text-sm font-medium text-slate-700 outline-none p-1 min-w-[150px]">
                            <option value="">Todos los Analistas</option>
                            {users.filter(u => u.role === UserRole.ANALYST).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    )}
                </div>
            </div>

            {/* KPIs PRINCIPALES */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <KPICard title="Requeridos" value={kpis.total} icon={FileText} color="indigo" sub={isAnalyst ? "Mi Carga Total" : "Inventario Requeridos"} onClick={() => goToDashboard(kpis.totalIds)} canClick={kpis.total > 0} />
                <KPICard title="Alertas Rev. Interna" value={kpis.overdueInternalIds.length} icon={AlertTriangle} color="amber" sub="> 30 días en v0.n" onClick={() => goToDashboard(kpis.overdueInternalIds)} canClick={kpis.overdueInternalIds.length > 0} />
                <KPICard title="Alertas Referente" value={kpis.overdueReferentIds.length} icon={AlertTriangle} color="amber" sub="> 30 días en v1.n / v1.n.i" onClick={() => goToDashboard(kpis.overdueReferentIds)} canClick={kpis.overdueReferentIds.length > 0} />
                <KPICard title="Alerta Control de Gestión" value={kpis.overdueControlIds.length} icon={AlertTriangle} color="amber" sub="> 30 días en v1.nAR / v1.n.iAR" onClick={() => goToDashboard(kpis.overdueControlIds)} canClick={kpis.overdueControlIds.length > 0} />
                <KPICard title="Terminados" value={kpis.approved} icon={CheckCircle} color="green" sub="Meta Cumplida" onClick={() => goToDashboard(kpis.approvedIds)} canClick={kpis.approved > 0} />
            </div>

            {/* CUMPLIMIENTO POR TIPO */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><Target size={16} /> Cumplimiento por Tipo de Documento</h3>
                <p className="text-xs text-slate-500 mb-8">Efectividad de entrega sobre el universo total requerido.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {typeComplianceData.map((item) => (
                        <div key={item.type} className="flex flex-col items-center">
                            <div className="relative w-28 h-28 mb-3">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie 
                                            data={[
                                                { name: 'Aprobados', value: item.percent, ids: item.finishedIds, fill: item.color }, 
                                                { name: 'Pendientes', value: 100 - item.percent, ids: item.pendingIds, fill: '#f1f5f9' }
                                            ]} 
                                            cx="50%" 
                                            cy="50%" 
                                            innerRadius={35} 
                                            outerRadius={50} 
                                            startAngle={90} 
                                            endAngle={-270} 
                                            dataKey="value" 
                                            stroke="none"
                                            onClick={(data) => {
                                                if (data && data.ids && data.ids.length > 0) {
                                                    goToDashboard(data.ids);
                                                }
                                            }}
                                        >
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
                                <Pie 
                                    data={stateData} 
                                    cx="50%" 
                                    cy="50%" 
                                    innerRadius={60} 
                                    outerRadius={80} 
                                    paddingAngle={5} 
                                    dataKey="value"
                                    onClick={(data) => {
                                        if (data && data.ids && data.ids.length > 0) {
                                            goToDashboard(data.ids);
                                        }
                                    }}
                                >
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
                                        <stop offset="5%" stopColor={color} stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor={color} stopOpacity={0}/>
                                    </linearGradient>
                                ))}
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <XAxis dataKey="label" tick={{fontSize: 11, fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} tickLine={false} />
                            <YAxis allowDecimals={false} domain={[0, 'dataMax']} tick={{fontSize: 11, fill: '#64748b'}} axisLine={{stroke: '#e2e8f0'}} tickLine={false} />
                            <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} />
                            <Legend verticalAlign="top" height={40} iconType="circle" onClick={handleLegendClick} wrapperStyle={{ cursor: 'pointer' }} />
                            <Area type="monotone" dataKey="AS IS" stroke={TYPE_COLORS['AS IS']} fill={`url(#grad-ASIS)`} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} hide={activeType !== null && activeType !== 'AS IS'} />
                            <Area type="monotone" dataKey="FCE" stroke={TYPE_COLORS['FCE']} fill={`url(#grad-FCE)`} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} hide={activeType !== null && activeType !== 'FCE'} />
                            <Area type="monotone" dataKey="PM" stroke={TYPE_COLORS['PM']} fill={`url(#grad-PM)`} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} hide={activeType !== null && activeType !== 'PM'} />
                            <Area type="monotone" dataKey="TO BE" stroke={TYPE_COLORS['TO BE']} fill={`url(#grad-TOBE)`} strokeWidth={2} dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} activeDot={{ r: 6 }} hide={activeType !== null && activeType !== 'TO BE'} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* MONITOR DE CONTINUIDAD CON PAGINACIÓN EN EL FOOTER */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
                <div className="p-6 pb-2">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
                        <div>
                            <h3 className="text-sm font-bold text-slate-700 uppercase flex items-center gap-2">
                                <ShieldAlert size={16} className="text-red-500" /> Monitor de Continuidad
                            </h3>
                            <p className="text-xs text-slate-500 mt-1">Documentos con más de 30 días sin cambios de estado. Priorice la revisión de estos ítems.</p>
                        </div>
                        {totalStuck > 0 && (
                            <button 
                                onClick={() => goToDashboard(executiveMetrics.stuckDocs.map(d => d.id))}
                                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-bold text-xs uppercase tracking-wider"
                            >
                                <ExternalLink size={14} /> Ver Consolidado en Dashboard
                            </button>
                        )}
                    </div>
                </div>
                
                <div className="flex-1 px-6 pb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {totalStuck === 0 ? (
                            <div className="col-span-full py-12 text-center text-slate-400">
                                <CheckCircle size={32} className="mx-auto mb-2 text-green-200" />
                                <p className="text-xs">No se detectan riesgos de continuidad.</p>
                            </div>
                        ) : displayedStuck.map((d: StuckDoc) => (
                            <div 
                                key={d.id} 
                                onClick={() => navigate(`/doc/${d.id}`)}
                                className="p-4 bg-slate-50 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all cursor-pointer group shadow-sm flex flex-col justify-between"
                            >
                                <div>
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-[10px] font-bold text-indigo-600 uppercase bg-indigo-50 px-2 py-1 rounded border border-indigo-100">{d.project}</span>
                                        <span className="text-[10px] font-bold px-2 py-1 rounded border bg-red-50 text-red-600 border-red-100">
                                            {d.daysStuck} días
                                        </span>
                                    </div>
                                    <h4 className="text-xs font-bold text-slate-800 line-clamp-2 group-hover:text-indigo-600 leading-tight">{d.title}</h4>
                                </div>
                                <div className="flex items-center justify-between mt-4">
                                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                                        <Clock size={10} />
                                        <span>última actividad: {new Date(d.updatedAt).toLocaleDateString()}</span>
                                    </div>
                                    <div className={`text-[9px] font-bold px-1.5 py-0.5 rounded border ${STATE_CONFIG[d.state as DocState].color}`}>
                                        {STATE_CONFIG[d.state as DocState].label.split('(')[0]}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* FOOTER DE PAGINACIÓN (REFERENCIA IMAGEN) */}
                {totalStuck > 0 && (
                    <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4 mt-auto">
                        <div className="text-[11px] text-slate-500 font-medium">
                            Mostrando <b>{Math.min(totalStuck, (stuckPage - 1) * STUCK_ITEMS_PER_PAGE + 1)}</b> a <b>{Math.min(totalStuck, stuckPage * STUCK_ITEMS_PER_PAGE)}</b> de <b>{totalStuck}</b> registros críticos
                        </div>
                        <div className="flex items-center gap-2">
                            <button 
                                onClick={() => setStuckPage(prev => Math.max(1, prev - 1))} 
                                disabled={stuckPage === 1} 
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                            >
                                <ChevronLeft size={16} className="text-slate-600" />
                            </button>
                            <div className="flex items-center gap-1">
                                {Array.from({ length: totalStuckPages }, (_, i) => i + 1).map(pageNum => (
                                    <button 
                                        key={pageNum} 
                                        onClick={() => setStuckPage(pageNum)} 
                                        className={`w-8 h-8 rounded-lg text-xs font-bold border transition-all ${
                                            stuckPage === pageNum 
                                                ? 'bg-indigo-600 text-white border-indigo-600' 
                                                : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-400'
                                        }`}
                                    >
                                        {pageNum}
                                    </button>
                                ))}
                            </div>
                            <button 
                                onClick={() => setStuckPage(prev => Math.min(totalStuckPages, prev + 1))} 
                                disabled={stuckPage === totalStuckPages} 
                                className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50 transition-colors shadow-sm"
                            >
                                <ChevronRight size={16} className="text-slate-600" />
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const KPICard = ({ title, value, icon: Icon, color, sub, onClick, canClick }: any) => {
    const colorClasses: Record<string, string> = { 
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100', 
        green: 'bg-green-50 text-green-600 border-green-100',
        amber: 'bg-amber-50 text-amber-600 border-amber-100',
        slate: 'bg-slate-50 text-slate-600 border-slate-100'
    };
    return (
        <div onClick={canClick ? onClick : undefined} className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${colorClasses[color] || colorClasses.indigo} ${canClick ? 'cursor-pointer hover:shadow-md transition-all active:scale-95' : ''}`}>
            <div className="flex justify-between items-start mb-2"><span className="text-xs font-bold uppercase tracking-wider opacity-70">{title}</span><Icon size={18} /></div>
            <div><span className="text-2xl font-bold">{value}</span><div className="flex justify-between items-center mt-1"><p className="text-[10px] opacity-80 font-medium">{sub}</p>{canClick && <ArrowRight size={12} className="opacity-60" />}</div></div>
        </div>
    );
};

export default Reports;
