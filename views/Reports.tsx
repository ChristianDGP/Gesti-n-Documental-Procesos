
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, DocType, UserRole } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { 
    TrendingUp, Users, AlertTriangle, CheckCircle, Clock, FileText, Filter, LayoutDashboard, Briefcase, Loader2, User as UserIcon, ArrowRight, Target
} from 'lucide-react';

interface Props {
    user: User;
}

// Extends Document to handle "Virtual" documents (not yet created but required)
interface ReportDoc extends Document {
    isVirtual?: boolean;
    requiredType?: string;
}

// Color Map matching Dashboard
const STATE_COLOR_MAP: Record<string, string> = {
    'No Iniciado': '#e2e8f0', // Slate 200
    'En Proceso': '#3b82f6',  // Blue 500
    'En Revisión': '#a855f7', // Purple 500 (Mix of Referente/Control)
    'Rechazado': '#ef4444',   // Red 500
    'Aprobado': '#22c55e'     // Green 500
};

// Colores actualizados según la imagen de referencia (Azul, Salmón, Amarillo, Verde)
const TYPE_COLORS: Record<string, string> = {
    'AS IS': '#3b82f6', // Azul
    'FCE': '#f87171',   // Salmón / Rojo claro
    'PM': '#facc15',    // Amarillo
    'TO BE': '#22c55e'  // Verde
};

const Reports: React.FC<Props> = ({ user }) => {
    const navigate = useNavigate();
    const [realDocs, setRealDocs] = useState<Document[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    
    // Filters
    const [filterProject, setFilterProject] = useState('');
    const [filterAnalyst, setFilterAnalyst] = useState('');

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [d, u, h] = await Promise.all([
                DocumentService.getAll(),
                UserService.getAll(),
                HierarchyService.getFullHierarchy()
            ]);
            setRealDocs(d);
            setUsers(u);
            setHierarchy(h);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    // --- DATA PROCESSING ---

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
                    const nodes = hierarchy[proj][macro][proc];
                    nodes.forEach(node => {
                        if (node.active === false) return;
                        const requiredTypes = (node.requiredTypes && node.requiredTypes.length > 0) 
                            ? node.requiredTypes : ['AS IS', 'FCE', 'PM', 'TO BE'];

                        requiredTypes.forEach(type => {
                            const key = `${normalizeHeader(proj)}|${normalizeHeader(node.name)}|${normalizeHeader(type)}`;
                            if (realDocMap.has(key)) {
                                const realDoc = realDocMap.get(key)!;
                                unifiedList.push({ ...realDoc, macroprocess: macro, process: proc, project: proj, assignees: (node.assignees && node.assignees.length > 0) ? node.assignees : (realDoc.assignees || []), isVirtual: false });
                            } else {
                                unifiedList.push({ id: `virtual-${key}`, title: `${node.name} - ${type}`, description: 'Pendiente de inicio', project: proj, macroprocess: macro, process: proc, microprocess: node.name, docType: type as DocType, authorId: '', authorName: '', assignedTo: node.assignees?.[0] || '', assignees: node.assignees || [], state: DocState.NOT_STARTED, version: '-', progress: 0, files: [], createdAt: new Date().toISOString(), updatedAt: new Date(0).toISOString(), hasPendingRequest: false, isVirtual: true, requiredType: type });
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
        if (filterAnalyst) docs = docs.filter(d => d.assignees && d.assignees.includes(filterAnalyst));
        return docs;
    }, [unifiedData, filterProject, filterAnalyst]);

    const kpis = useMemo(() => {
        const approvedDocs = filteredDocs.filter(d => d.state === DocState.APPROVED);
        const thirtyDaysAgo = new Date(); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const isStalled = (d: ReportDoc) => !d.isVirtual && d.state !== DocState.NOT_STARTED && new Date(d.updatedAt) < thirtyDaysAgo;

        const internalStates = [DocState.INITIATED, DocState.IN_PROCESS, DocState.INTERNAL_REVIEW];
        const referentStates = [DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW];
        const controlStates = [DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW];

        return { 
            total: filteredDocs.length, totalIds: filteredDocs.map(d => d.id),
            approved: approvedDocs.length, approvedIds: approvedDocs.map(d => d.id),
            stalledInternal: filteredDocs.filter(d => internalStates.includes(d.state) && isStalled(d)).length,
            stalledInternalIds: filteredDocs.filter(d => internalStates.includes(d.state) && isStalled(d)).map(d => d.id),
            stalledReferent: filteredDocs.filter(d => referentStates.includes(d.state) && isStalled(d)).length,
            stalledReferentIds: filteredDocs.filter(d => referentStates.includes(d.state) && isStalled(d)).map(d => d.id),
            stalledControl: filteredDocs.filter(d => controlStates.includes(d.state) && isStalled(d)).length,
            stalledControlIds: filteredDocs.filter(d => controlStates.includes(d.state) && isStalled(d)).map(d => d.id)
        };
    }, [filteredDocs]);

    const stateData = useMemo(() => {
        const counts: Record<string, number> = { 'No Iniciado': 0, 'En Proceso': 0, 'En Revisión': 0, 'Rechazado': 0, 'Aprobado': 0 };
        filteredDocs.forEach(d => {
            let key = 'En Proceso';
            if (d.state === DocState.NOT_STARTED) key = 'No Iniciado';
            else if (d.state === DocState.APPROVED) key = 'Aprobado';
            else if (d.state === DocState.REJECTED) key = 'Rechazado';
            else if ([DocState.INTERNAL_REVIEW, DocState.SENT_TO_REFERENT, DocState.SENT_TO_CONTROL, DocState.REFERENT_REVIEW, DocState.CONTROL_REVIEW].includes(d.state)) key = 'En Revisión';
            counts[key] = (counts[key] || 0) + 1;
        });
        return Object.keys(counts).filter(k => counts[k] > 0).map(name => ({ name, value: counts[name] }));
    }, [filteredDocs]);

    const analystData = useMemo(() => {
        const stats: Record<string, { assigned: number, approved: number, inProgress: number }> = {};
        filteredDocs.forEach(d => {
            if (d.assignees) {
                d.assignees.forEach(uid => {
                    if (!stats[uid]) stats[uid] = { assigned: 0, approved: 0, inProgress: 0 };
                    stats[uid].assigned += 1;
                    if (d.state === DocState.APPROVED) stats[uid].approved += 1;
                    else if (d.state !== DocState.NOT_STARTED) stats[uid].inProgress += 1;
                });
            }
        });
        return Object.keys(stats).map(uid => {
            const u = users.find(user => user.id === uid);
            return { name: u ? (u.nickname || u.name.split(' ')[0]) : 'Desc.', Requeridos: stats[uid].assigned, EnProceso: stats[uid].inProgress, Terminados: stats[uid].approved };
        }).sort((a, b) => b.Requeridos - a.Requeridos).slice(0, 10);
    }, [filteredDocs, users]);

    // Data for circular compliance gauges
    const typeComplianceData = useMemo(() => {
        const types: DocType[] = ['AS IS', 'FCE', 'PM', 'TO BE'];
        return types.map(type => {
            const docsOfType = filteredDocs.filter(d => d.docType === type);
            const total = docsOfType.length;
            const finished = docsOfType.filter(d => d.state === DocState.APPROVED).length;
            const percent = total > 0 ? Math.round((finished / total) * 100) : 0;
            return { type, total, finished, percent, color: TYPE_COLORS[type] };
        });
    }, [filteredDocs]);

    const velocityData = useMemo(() => {
        const activityMap: Record<string, number> = {};
        filteredDocs.filter(d => !d.isVirtual && d.state !== DocState.NOT_STARTED).forEach(d => {
            const date = new Date(d.updatedAt);
            const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            activityMap[sortKey] = (activityMap[sortKey] || 0) + 1;
        });
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return Object.keys(activityMap).sort().map(key => {
            const [year, month] = key.split('-');
            const mIdx = parseInt(month) - 1;
            return { name: months[mIdx], fullLabel: `${months[mIdx]} ${year}`, actividad: activityMap[key] };
        });
    }, [filteredDocs]);

    const availableProjects = useMemo(() => Array.from(new Set(unifiedData.map(d => d.project).filter(Boolean))), [unifiedData]);

    const goToDashboard = (ids: string[]) => navigate('/', { state: { filterIds: ids, fromReport: true } });

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Generando reporte...</div>;

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><LayoutDashboard className="text-indigo-600" /> Reportes de Gestión</h1>
                    <p className="text-slate-500">Métricas basadas en la Matriz de Asignaciones (Universo Total).</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <Filter size={16} className="text-slate-400 ml-2" />
                    <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="bg-transparent text-sm font-medium text-slate-700 outline-none p-1 cursor-pointer min-w-[150px] border-r border-slate-100">
                        <option value="">Todos los Proyectos</option>
                        {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                    <div className="flex items-center gap-1 px-2">
                        <UserIcon size={14} className="text-slate-400" />
                        <select value={filterAnalyst} onChange={(e) => setFilterAnalyst(e.target.value)} className="bg-transparent text-sm font-medium text-slate-700 outline-none p-1 cursor-pointer min-w-[150px]">
                            <option value="">Todos los Analistas</option>
                            {users.filter(u => u.role === UserRole.ANALYST).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* KPIs */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <KPICard title="Total Requeridos" value={kpis.total} icon={FileText} color="indigo" sub="Universo Total" onClick={() => goToDashboard(kpis.totalIds)} canClick={kpis.total > 0} />
                <KPICard title="Interno > 30d" value={kpis.stalledInternal} icon={Clock} color="orange" sub="Sin avance reciente" onClick={() => goToDashboard(kpis.stalledInternalIds)} canClick={kpis.stalledInternal > 0} />
                <KPICard title="Referente > 30d" value={kpis.stalledReferent} icon={Clock} color="orange" sub="Sin avance reciente" onClick={() => goToDashboard(kpis.stalledReferentIds)} canClick={kpis.stalledReferent > 0} />
                <KPICard title="Control > 30d" value={kpis.stalledControl} icon={Clock} color="orange" sub="Sin avance reciente" onClick={() => goToDashboard(kpis.stalledControlIds)} canClick={kpis.stalledControl > 0} />
                <KPICard title="Terminados" value={kpis.approved} icon={CheckCircle} color="green" sub="100% Aprobados" onClick={() => goToDashboard(kpis.approvedIds)} canClick={kpis.approved > 0} />
            </div>

            {/* SECCIÓN 1: CUMPLIMIENTO POR TIPO (OCUPA TODO EL ANCHO ARRIBA) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2">
                    <Target size={16} /> Cumplimiento por Tipo de Documento
                </h3>
                <p className="text-xs text-slate-500 mb-8">Progreso de documentos terminados vs requeridos en el universo total.</p>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {typeComplianceData.map((item) => (
                        <div key={item.type} className="flex flex-col items-center">
                            <div className="relative w-28 h-28 mb-3">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { value: item.percent },
                                                { value: 100 - item.percent }
                                            ]}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={35}
                                            outerRadius={50}
                                            startAngle={90}
                                            endAngle={-270}
                                            dataKey="value"
                                            stroke="none"
                                        >
                                            <Cell key="progress" fill={item.color} />
                                            <Cell key="bg" fill="#f1f5f9" />
                                        </Pie>
                                    </PieChart>
                                </ResponsiveContainer>
                                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                                    <span className="text-lg font-extrabold text-slate-800">{item.percent}%</span>
                                </div>
                            </div>
                            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">{item.type}</span>
                            <span className="text-[10px] text-slate-400 mt-1">{item.finished} de {item.total}</span>
                        </div>
                    ))}
                </div>
            </div>

            {/* SECCIÓN 2: ESTADOS Y ANALISTAS (POSICIÓN INTERMEDIA) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-1 flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><Briefcase size={16} /> Estado del Universo</h3>
                    <p className="text-xs text-slate-500 mb-6">Distribución detallada por estado actual.</p>
                    <div className="flex-1 min-h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={stateData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                    {stateData.map((entry, index) => <Cell key={`cell-${index}`} fill={STATE_COLOR_MAP[entry.name] || '#94a3b8'} />)}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><Users size={16} /> Gestión por Analista</h3>
                    <p className="text-xs text-slate-500 mb-6">Comparativa: Requeridos vs. En Proceso vs. Terminados.</p>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analystData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{fontSize: 12}} />
                                <YAxis tick={{fontSize: 12}} />
                                <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} cursor={{fill: '#f8fafc'}} />
                                <Legend />
                                <Bar dataKey="Requeridos" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="EnProceso" name="En Proceso" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="Terminados" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* SECCIÓN 3: EVOLUCIÓN MENSUAL (ANCHO COMPLETO AL FINAL) */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2"><Clock size={16} /> Evolución Mensual</h3>
                <p className="text-xs text-slate-500 mb-6">Volumen de actividad (actualizaciones) cronológicas.</p>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={velocityData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                            <defs>
                                <linearGradient id="colorAct" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/><stop offset="95%" stopColor="#8884d8" stopOpacity={0}/></linearGradient>
                            </defs>
                            <XAxis dataKey="name" tick={{fontSize: 12}} />
                            <YAxis tick={{fontSize: 12}} />
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                            <Tooltip labelFormatter={(label, payload) => payload[0]?.payload.fullLabel || label} />
                            <Area type="monotone" dataKey="actividad" stroke="#8884d8" fillOpacity={1} fill="url(#colorAct)" />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

const KPICard = ({ title, value, icon: Icon, color, sub, onClick, canClick }: any) => {
    const colorClasses: Record<string, string> = { indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100', blue: 'bg-blue-50 text-blue-600 border-blue-100', green: 'bg-green-50 text-green-600 border-green-100', orange: 'bg-orange-50 text-orange-600 border-orange-100', red: 'bg-red-50 text-red-600 border-red-100' };
    return (
        <div onClick={canClick ? onClick : undefined} className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${colorClasses[color] || colorClasses.indigo} ${canClick ? 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-opacity-50 hover:ring-indigo-300 transition-all active:scale-95' : ''}`}>
            <div className="flex justify-between items-start mb-2"><span className="text-xs font-bold uppercase tracking-wider opacity-70">{title}</span><Icon size={18} /></div>
            <div><span className="text-2xl font-bold">{value}</span><div className="flex justify-between items-center mt-1"><p className="text-[10px] opacity-80 font-medium">{sub}</p>{canClick && <ArrowRight size={12} className="opacity-60" />}</div></div>
        </div>
    );
};

export default Reports;
