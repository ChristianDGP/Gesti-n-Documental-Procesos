
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService, HistoryService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, DocType, UserRole, DocHistory } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { 
    Users, CheckCircle, Clock, FileText, Filter, LayoutDashboard, Briefcase, Loader2, User as UserIcon, ArrowRight, Target, Info, TrendingUp, AlertTriangle, CircleDashed
} from 'lucide-react';

interface Props {
    user: User;
}

interface ReportDoc extends Document {
    isVirtual?: boolean;
}

const STATE_COLOR_MAP: Record<string, string> = {
    'No Iniciado': '#94a3b8',
    'En Proceso': '#3b82f6',
    'Referente': '#a855f7',
    'Control': '#f97316',
    'Terminados': '#22c55e'
};

const TYPE_COLORS: Record<string, string> = {
    'AS IS': '#3b82f6', // Azul
    'FCE': '#f87171',   // Salmón
    'PM': '#facc15',    // Amarillo
    'TO BE': '#22c55e'  // Verde
};

const Reports: React.FC<Props> = ({ user }) => {
    const navigate = useNavigate();
    const isAnalyst = user.role === UserRole.ANALYST;

    const [realDocs, setRealDocs] = useState<Document[]>([]);
    const [history, setHistory] = useState<DocHistory[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    
    const [filterProject, setFilterProject] = useState('');
    // Si es analista, el filtro por analista se bloquea a su propio ID
    const [filterAnalyst, setFilterAnalyst] = useState(isAnalyst ? user.id : '');

    // Estado para controlar la visibilidad por tipo en el gráfico de áreas
    const [activeType, setActiveType] = useState<string | null>(null);

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
                realDocMap.set(key, { ...doc, microprocess: microName, docType: docType as DocType });
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
                                unifiedList.push({ ...realDocMap.get(key)!, macroprocess: macro, process: proc, project: proj, isVirtual: false });
                            } else {
                                unifiedList.push({ id: `virtual-${key}`, title: `${node.name} - ${type}`, project: proj, microprocess: node.name, docType: type as DocType, state: DocState.NOT_STARTED, updatedAt: new Date(0).toISOString(), assignees: node.assignees || [], isVirtual: true } as any);
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
        // El filtro de analista siempre se aplica
        if (filterAnalyst) docs = docs.filter(d => d.assignees?.includes(filterAnalyst));
        return docs;
    }, [unifiedData, filterProject, filterAnalyst]);

    const kpis = useMemo(() => {
        const now = new Date().getTime();
        const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

        const notStarted = filteredDocs.filter(d => d.state === DocState.NOT_STARTED);
        const approved = filteredDocs.filter(d => d.state === DocState.APPROVED);
        
        // Alertas > 30 días
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

    const stateData = useMemo(() => {
        const stats = {
            notStarted: 0,
            inProcess: 0,
            referent: 0,
            control: 0,
            finished: 0
        };

        filteredDocs.forEach(d => {
            if (d.state === DocState.NOT_STARTED) {
                stats.notStarted++;
            } else if (d.state === DocState.APPROVED) {
                stats.finished++;
            } else if (d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW) {
                stats.referent++;
            } else if (d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW) {
                stats.control++;
            } else {
                // Initiated, In process, Internal Review, Rejected
                stats.inProcess++;
            }
        });

        // Este array define el orden exacto de los segmentos del gráfico
        return [
          { name: 'No Iniciado', value: stats.notStarted },
          { name: 'En Proceso', value: stats.inProcess },
          { name: 'Referente', value: stats.referent },
          { name: 'Control', value: stats.control },
          { name: 'Terminados', value: stats.finished }
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
            const docs = filteredDocs.filter(d => d.docType === type);
            const finished = docs.filter(d => d.state === DocState.APPROVED).length;
            const percent = docs.length > 0 ? Math.round((finished / docs.length) * 100) : 0;
            return { type, total: docs.length, finished, percent, color: TYPE_COLORS[type] };
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
            setActiveType(null); // Segundo clic: mostrar todos
        } else {
            setActiveType(dataKey); // Primer clic: mostrar solo este
        }
    };

    const goToDashboard = (ids: string[]) => navigate('/', { state: { filterIds: ids, fromReport: true } });

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Analizando métricas...</div>;

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutDashboard className="text-indigo-600" /> 
                        {isAnalyst ? 'Mi Reporte de Gestión' : 'Reportes de Gestión'}
                    </h1>
                    <p className="text-slate-500">
                        {isAnalyst ? 'Resumen de mi desempeño y cumplimiento.' : 'Métricas de cumplimiento y cierre de procesos.'}
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

            {/* GRILLA DE KPIS */}
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
                <KPICard title="Requeridos" value={kpis.total} icon={FileText} color="indigo" sub={isAnalyst ? "Mi Carga Total" : "Inventario Requeridos"} onClick={() => goToDashboard(kpis.totalIds)} canClick={kpis.total > 0} />
                
                <KPICard 
                    title="No Iniciados" 
                    value={kpis.notStarted} 
                    icon={CircleDashed} 
                    color="slate" 
                    sub="Pendiente Inicio" 
                    onClick={() => goToDashboard(kpis.notStartedIds)} 
                    canClick={kpis.notStarted > 0} 
                />

                <KPICard 
                    title="Alertas Rev. Interna" 
                    value={kpis.overdueInternalIds.length} 
                    icon={AlertTriangle} 
                    color="amber" 
                    sub="> 30 días en v0.n" 
                    onClick={() => goToDashboard(kpis.overdueInternalIds)} 
                    canClick={kpis.overdueInternalIds.length > 0} 
                />
                
                <KPICard 
                    title="Alertas Referente" 
                    value={kpis.overdueReferentIds.length} 
                    icon={AlertTriangle} 
                    color="amber" 
                    sub="> 30 días en v1.n / v1.n.i" 
                    onClick={() => goToDashboard(kpis.overdueReferentIds)} 
                    canClick={kpis.overdueReferentIds.length > 0} 
                />
                
                <KPICard 
                    title="Alerta Control de Gestión" 
                    value={kpis.overdueControlIds.length} 
                    icon={AlertTriangle} 
                    color="amber" 
                    sub="> 30 días en v1.nAR / v1.n.iAR" 
                    onClick={() => goToDashboard(kpis.overdueControlIds)} 
                    canClick={kpis.overdueControlIds.length > 0} 
                />

                <KPICard title="Terminados" value={kpis.approved} icon={CheckCircle} color="green" sub="Meta Cumplida" onClick={() => goToDashboard(kpis.approvedIds)} canClick={kpis.approved > 0} />
            </div>

            {/* SECCIÓN 1: CUMPLIMIENTO POR TIPO */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><Target size={16} /> Cumplimiento por Tipo de Documento</h3>
                <p className="text-xs text-slate-500 mb-8">Efectividad de entrega sobre el universo total requerido.</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {typeComplianceData.map((item) => (
                        <div key={item.type} className="flex flex-col items-center">
                            <div className="relative w-28 h-28 mb-3">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie data={[{ value: item.percent }, { value: 100 - item.percent }]} cx="50%" cy="50%" innerRadius={35} outerRadius={50} startAngle={90} endAngle={-270} dataKey="value" stroke="none">
                                            <Cell key="progress" fill={item.color} />
                                            <Cell key="bg" fill="#f1f5f9" />
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

            {/* SECCIÓN 2: DISTRIBUCIÓN Y PRODUCTIVIDAD */}
            <div className={`grid grid-cols-1 ${isAnalyst ? '' : 'lg:grid-cols-3'} gap-6`}>
                <div className={`bg-white p-6 rounded-xl shadow-sm border border-slate-200 ${isAnalyst ? '' : 'lg:col-span-1'}`}>
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-4 flex items-center gap-2"><Briefcase size={16} /> Distribución por Estado</h3>
                    <div className="h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={stateData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                    {stateData.map((entry, index) => <Cell key={index} fill={STATE_COLOR_MAP[entry.name] || '#94a3b8'} />)}
                                </Pie>
                                <Tooltip />
                                <Legend 
                                    layout="horizontal" 
                                    align="center" 
                                    verticalAlign="bottom" 
                                    iconType="circle"
                                />
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
                                    <YAxis tick={{fontSize: 10}} />
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

            {/* SECCIÓN 3: EVOLUCIÓN MENSUAL (ANCHO COMPLETO) */}
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
                            <XAxis 
                                dataKey="label" 
                                tick={{fontSize: 11, fill: '#64748b'}} 
                                axisLine={{stroke: '#e2e8f0'}} 
                                tickLine={false} 
                            />
                            <YAxis 
                                tick={{fontSize: 11, fill: '#64748b'}} 
                                axisLine={{stroke: '#e2e8f0'}} 
                                tickLine={false} 
                            />
                            <Tooltip 
                                contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} 
                            />
                            <Legend 
                                verticalAlign="top" 
                                height={40} 
                                iconType="circle" 
                                onClick={handleLegendClick}
                                wrapperStyle={{ cursor: 'pointer' }}
                            />
                            
                            <Area 
                                type="monotone" 
                                dataKey="AS IS" 
                                stroke={TYPE_COLORS['AS IS']} 
                                fill={`url(#grad-ASIS)`} 
                                strokeWidth={2} 
                                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                                activeDot={{ r: 6 }}
                                hide={activeType !== null && activeType !== 'AS IS'}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="FCE" 
                                stroke={TYPE_COLORS['FCE']} 
                                fill={`url(#grad-FCE)`} 
                                strokeWidth={2} 
                                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                                activeDot={{ r: 6 }}
                                hide={activeType !== null && activeType !== 'FCE'}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="PM" 
                                stroke={TYPE_COLORS['PM']} 
                                fill={`url(#grad-PM)`} 
                                strokeWidth={2} 
                                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                                activeDot={{ r: 6 }}
                                hide={activeType !== null && activeType !== 'PM'}
                            />
                            <Area 
                                type="monotone" 
                                dataKey="TO BE" 
                                stroke={TYPE_COLORS['TO BE']} 
                                fill={`url(#grad-TOBE)`} 
                                strokeWidth={2} 
                                dot={{ r: 4, strokeWidth: 2, fill: '#fff' }} 
                                activeDot={{ r: 6 }}
                                hide={activeType !== null && activeType !== 'TO BE'}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
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
