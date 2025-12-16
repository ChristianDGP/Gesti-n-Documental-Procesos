
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area 
} from 'recharts';
import { 
    TrendingUp, Users, AlertTriangle, CheckCircle, Clock, FileText, Filter, LayoutDashboard, Briefcase, Loader2, User as UserIcon, ArrowRight
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

    // --- DATA PROCESSING (Link Matriz vs Realidad) ---

    // Genera el universo completo de documentos (Real + Virtual) basado en la Matriz
    const unifiedData = useMemo(() => {
        if (Object.keys(hierarchy).length === 0) return [];

        const unifiedList: ReportDoc[] = [];
        
        // 1. Indexar documentos reales para búsqueda rápida
        const realDocMap = new Map<string, Document>();
        realDocs.forEach(doc => {
            if (doc.project && (doc.microprocess || doc.title)) {
                const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
                const docType = doc.docType || 'AS IS';
                const key = `${normalizeHeader(doc.project)}|${normalizeHeader(microName)}|${normalizeHeader(docType)}`;
                
                // Keep most recent
                const existing = realDocMap.get(key);
                if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                    realDocMap.set(key, { ...doc, microprocess: microName, docType: docType as DocType });
                }
            }
        });

        // 2. Recorrer la Jerarquía (Lo que DEBE existir)
        Object.keys(hierarchy).forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    const nodes = hierarchy[proj][macro][proc];
                    nodes.forEach(node => {
                        // Skip inactive nodes in hierarchy for reporting
                        if (node.active === false) return;

                        const requiredTypes = (node.requiredTypes && node.requiredTypes.length > 0) 
                            ? node.requiredTypes 
                            : ['AS IS', 'FCE', 'PM', 'TO BE'];

                        requiredTypes.forEach(type => {
                            const key = `${normalizeHeader(proj)}|${normalizeHeader(node.name)}|${normalizeHeader(type)}`;
                            
                            if (realDocMap.has(key)) {
                                // Existe documento real
                                const realDoc = realDocMap.get(key)!;
                                unifiedList.push({
                                    ...realDoc,
                                    macroprocess: macro,
                                    process: proc,
                                    project: proj,
                                    // Ensure assignees are synced with matrix if doc is old
                                    assignees: (node.assignees && node.assignees.length > 0) ? node.assignees : (realDoc.assignees || []),
                                    isVirtual: false
                                });
                            } else {
                                // No existe -> Documento Virtual "No Iniciado"
                                unifiedList.push({
                                    id: `virtual-${key}`, // Special ID for virtual docs
                                    title: `${node.name} - ${type}`,
                                    description: 'Pendiente de inicio',
                                    project: proj,
                                    macroprocess: macro,
                                    process: proc,
                                    microprocess: node.name,
                                    docType: type as DocType,
                                    authorId: '',
                                    authorName: '',
                                    assignedTo: node.assignees?.[0] || '',
                                    assignees: node.assignees || [], // Here we link analysts from Assignments Matrix
                                    state: DocState.NOT_STARTED,
                                    version: '-',
                                    progress: 0,
                                    files: [],
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date(0).toISOString(),
                                    hasPendingRequest: false,
                                    isVirtual: true,
                                    requiredType: type
                                });
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


    // 1. KPI CARDS DATA (Updated Structure)
    const kpis = useMemo(() => {
        const total = filteredDocs.length;
        const totalIds = filteredDocs.map(d => d.id);
        
        const approvedDocs = filteredDocs.filter(d => d.state === DocState.APPROVED);
        const approvedIds = approvedDocs.map(d => d.id);

        // Calculate 30 days threshold
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        // Helper to check stall
        const isStalled = (d: ReportDoc) => {
            if (d.isVirtual || d.state === DocState.NOT_STARTED) return false;
            return new Date(d.updatedAt) < thirtyDaysAgo;
        };

        // Internal Stalled (Initiated, In Process, Internal Review)
        const internalStates = [DocState.INITIATED, DocState.IN_PROCESS, DocState.INTERNAL_REVIEW];
        const stalledInternalDocs = filteredDocs.filter(d => internalStates.includes(d.state) && isStalled(d));
        const stalledInternalIds = stalledInternalDocs.map(d => d.id);

        // Referent Stalled
        const referentStates = [DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW];
        const stalledReferentDocs = filteredDocs.filter(d => referentStates.includes(d.state) && isStalled(d));
        const stalledReferentIds = stalledReferentDocs.map(d => d.id);

        // Control Stalled
        const controlStates = [DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW];
        const stalledControlDocs = filteredDocs.filter(d => controlStates.includes(d.state) && isStalled(d));
        const stalledControlIds = stalledControlDocs.map(d => d.id);

        return { 
            total, totalIds,
            approved: approvedDocs.length, approvedIds,
            stalledInternal: stalledInternalDocs.length, stalledInternalIds,
            stalledReferent: stalledReferentDocs.length, stalledReferentIds,
            stalledControl: stalledControlDocs.length, stalledControlIds
        };
    }, [filteredDocs]);

    // 2. CHART: State Distribution (Using Dashboard Criteria Colors)
    const stateData = useMemo(() => {
        const counts: Record<string, number> = {};
        
        // Initialize specific keys order
        counts['No Iniciado'] = 0;
        counts['En Proceso'] = 0;
        counts['En Revisión'] = 0;
        counts['Rechazado'] = 0;
        counts['Aprobado'] = 0;

        filteredDocs.forEach(d => {
            let key = 'En Proceso';
            if (d.state === DocState.NOT_STARTED) key = 'No Iniciado';
            else if (d.state === DocState.APPROVED) key = 'Aprobado';
            else if (d.state === DocState.REJECTED) key = 'Rechazado';
            else if (d.state === DocState.INTERNAL_REVIEW || d.state === DocState.SENT_TO_REFERENT || d.state === DocState.SENT_TO_CONTROL || d.state === DocState.REFERENT_REVIEW || d.state === DocState.CONTROL_REVIEW) key = 'En Revisión';
            
            counts[key] = (counts[key] || 0) + 1;
        });

        return Object.keys(counts).filter(k => counts[k] > 0).map(name => ({ name, value: counts[name] }));
    }, [filteredDocs]);

    // 3. CHART: Analyst Performance (Independent by State, Renamed)
    const analystData = useMemo(() => {
        const stats: Record<string, { assigned: number, approved: number, inProgress: number }> = {};
        
        filteredDocs.forEach(d => {
            if (d.assignees && d.assignees.length > 0) {
                d.assignees.forEach(uid => {
                    if (!stats[uid]) stats[uid] = { assigned: 0, approved: 0, inProgress: 0 };
                    
                    // "Asignados" refers to Total in Matrix for that user
                    stats[uid].assigned += 1;
                    
                    if (d.state === DocState.APPROVED) {
                        stats[uid].approved += 1;
                    } else if (d.state !== DocState.NOT_STARTED) {
                        stats[uid].inProgress += 1; // Anything started but not approved
                    }
                });
            }
        });

        return Object.keys(stats)
            .map(uid => {
                const userObj = users.find(u => u.id === uid);
                return {
                    name: userObj ? (userObj.nickname || userObj.name.split(' ')[0]) : 'Desc.',
                    Asignados: stats[uid].assigned,
                    Terminados: stats[uid].approved,
                    EnGestion: stats[uid].inProgress,
                };
            })
            .sort((a, b) => b.Asignados - a.Asignados)
            .slice(0, 10);
    }, [filteredDocs, users]);

    // 4. CHART: Compliance by Project (Required vs Finished)
    const projectData = useMemo(() => {
        const projStats: Record<string, { required: number, finished: number }> = {};
        
        const sourceDocs = filterProject ? filteredDocs : unifiedData;

        sourceDocs.forEach(d => {
            const p = d.project || 'Sin Proyecto';
            if (!projStats[p]) projStats[p] = { required: 0, finished: 0 };
            
            projStats[p].required += 1;
            if (d.state === DocState.APPROVED) {
                projStats[p].finished += 1;
            }
        });

        return Object.keys(projStats).map(p => ({
            name: p,
            Requeridos: projStats[p].required,
            Terminados: projStats[p].finished,
            Cumplimiento: Math.round((projStats[p].finished / projStats[p].required) * 100) || 0
        })).sort((a, b) => b.Cumplimiento - a.Cumplimiento);
    }, [unifiedData, filteredDocs, filterProject]);

    // 5. CHART: Monthly Activity
    const velocityData = useMemo(() => {
        const activityMap: Record<string, number> = {};
        const activeDocs = filteredDocs.filter(d => !d.isVirtual && d.state !== DocState.NOT_STARTED);

        activeDocs.forEach(d => {
            const date = new Date(d.updatedAt);
            const sortKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
            activityMap[sortKey] = (activityMap[sortKey] || 0) + 1;
        });

        const sortedKeys = Object.keys(activityMap).sort();
        const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        
        return sortedKeys.map(key => {
            const [year, month] = key.split('-');
            const monthIndex = parseInt(month, 10) - 1;
            return {
                name: `${months[monthIndex]}`,
                fullLabel: `${months[monthIndex]} ${year}`,
                actividad: activityMap[key]
            };
        });
    }, [filteredDocs]);

    const availableProjects = useMemo(() => Array.from(new Set(unifiedData.map(d => d.project).filter(Boolean))), [unifiedData]);

    // Navigation Handler to Dashboard with Filter Package
    const goToDashboard = (ids: string[]) => {
        // We pass the IDs to the Dashboard to filter specifically
        navigate('/', { state: { filterIds: ids, fromReport: true } });
    };

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Generando reporte...</div>;

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <LayoutDashboard className="text-indigo-600" />
                        Reportes de Gestión
                    </h1>
                    <p className="text-slate-500">Métricas basadas en la Matriz de Asignaciones (Universo Total).</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <Filter size={16} className="text-slate-400 ml-2" />
                    
                    {/* Project Filter */}
                    <select 
                        value={filterProject} 
                        onChange={(e) => setFilterProject(e.target.value)}
                        className="bg-transparent text-sm font-medium text-slate-700 outline-none p-1 cursor-pointer min-w-[150px] border-r border-slate-100"
                    >
                        <option value="">Todos los Proyectos</option>
                        {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    {/* Analyst Filter */}
                    <div className="flex items-center gap-1 px-2">
                        <UserIcon size={14} className="text-slate-400" />
                        <select 
                            value={filterAnalyst} 
                            onChange={(e) => setFilterAnalyst(e.target.value)}
                            className="bg-transparent text-sm font-medium text-slate-700 outline-none p-1 cursor-pointer min-w-[150px]"
                        >
                            <option value="">Todos los Analistas</option>
                            {users.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* ROW 1: KPI CARDS (Updated Structure) */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <KPICard 
                    title="Total Requeridos" 
                    value={kpis.total} 
                    icon={FileText} color="indigo" sub="Universo Total" 
                    onClick={() => goToDashboard(kpis.totalIds)}
                    canClick={kpis.total > 0}
                />
                
                {/* Stall Group */}
                <KPICard 
                    title="Interno > 30d" 
                    value={kpis.stalledInternal} 
                    icon={Clock} color="orange" sub="Sin avance reciente" 
                    onClick={() => goToDashboard(kpis.stalledInternalIds)}
                    canClick={kpis.stalledInternal > 0}
                />
                <KPICard 
                    title="Referente > 30d" 
                    value={kpis.stalledReferent} 
                    icon={Clock} color="orange" sub="Sin avance reciente" 
                    onClick={() => goToDashboard(kpis.stalledReferentIds)}
                    canClick={kpis.stalledReferent > 0}
                />
                <KPICard 
                    title="Control > 30d" 
                    value={kpis.stalledControl} 
                    icon={Clock} color="orange" sub="Sin avance reciente" 
                    onClick={() => goToDashboard(kpis.stalledControlIds)}
                    canClick={kpis.stalledControl > 0}
                />

                <KPICard 
                    title="Terminados" 
                    value={kpis.approved} 
                    icon={CheckCircle} color="green" sub="100% Aprobados" 
                    onClick={() => goToDashboard(kpis.approvedIds)}
                    canClick={kpis.approved > 0}
                />
            </div>

            {/* ROW 2: MAIN CHARTS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* 1. PERSPECTIVA INTERNA: ESTADO DE LOS DOCUMENTOS */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-1 flex flex-col">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2">
                        <Briefcase size={16} /> Estado del Universo
                    </h3>
                    <p className="text-xs text-slate-500 mb-6">Distribución detallada por estado actual.</p>
                    
                    <div className="flex-1 min-h-[250px]">
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
                                >
                                    {stateData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={STATE_COLOR_MAP[entry.name] || '#94a3b8'} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend verticalAlign="bottom" height={36}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 2. PERSPECTIVA APRENDIZAJE: DESEMPEÑO DEL EQUIPO (Modificado) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200 lg:col-span-2">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2">
                        <Users size={16} /> Gestión por Analista
                    </h3>
                    <p className="text-xs text-slate-500 mb-6">Comparativa: Asignados vs. Gestión vs. Terminados.</p>

                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                data={analystData}
                                margin={{ top: 20, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" tick={{fontSize: 12}} />
                                <YAxis tick={{fontSize: 12}} />
                                <Tooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    cursor={{fill: '#f8fafc'}}
                                />
                                <Legend />
                                <Bar dataKey="Asignados" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="EnGestion" name="En Gestión" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={20} />
                                <Bar dataKey="Terminados" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* ROW 3: TRENDS & RESULTS */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* 3. PERSPECTIVA RESULTADOS: CUMPLIMIENTO POR PROYECTO (Modificado) */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2">
                        <TrendingUp size={16} /> Cumplimiento por Proyecto
                    </h3>
                    <p className="text-xs text-slate-500 mb-6">Total Requeridos vs. Documentos Terminados.</p>

                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart
                                layout="vertical"
                                data={projectData}
                                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
                            >
                                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 11}} />
                                <Tooltip />
                                <Legend />
                                <Bar dataKey="Requeridos" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={15} />
                                <Bar dataKey="Terminados" fill="#22c55e" radius={[0, 4, 4, 0]} barSize={15} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* 4. PERSPECTIVA CLIENTE: VELOCIDAD */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
                    <h3 className="text-sm font-bold text-slate-700 uppercase mb-1 flex items-center gap-2">
                        <Clock size={16} /> Evolución Mensual
                    </h3>
                    <p className="text-xs text-slate-500 mb-6">Volumen de actividad (actualizaciones) ordenado cronológicamente.</p>

                    <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart
                                data={velocityData}
                                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
                            >
                                <defs>
                                    <linearGradient id="colorAct" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#8884d8" stopOpacity={0.8}/>
                                        <stop offset="95%" stopColor="#8884d8" stopOpacity={0}/>
                                    </linearGradient>
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
        </div>
    );
};

// --- SUBCOMPONENTS ---

const KPICard = ({ title, value, icon: Icon, color, sub, onClick, canClick }: any) => {
    const colorClasses: Record<string, string> = {
        indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100',
        blue: 'bg-blue-50 text-blue-600 border-blue-100',
        green: 'bg-green-50 text-green-600 border-green-100',
        orange: 'bg-orange-50 text-orange-600 border-orange-100',
        red: 'bg-red-50 text-red-600 border-red-100',
    };

    return (
        <div 
            onClick={canClick ? onClick : undefined}
            className={`p-4 rounded-xl border shadow-sm flex flex-col justify-between ${colorClasses[color] || colorClasses.indigo} 
                ${canClick ? 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-opacity-50 hover:ring-indigo-300 transition-all active:scale-95' : ''}
            `}
        >
            <div className="flex justify-between items-start mb-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-70">{title}</span>
                <Icon size={18} />
            </div>
            <div>
                <span className="text-2xl font-bold">{value}</span>
                <div className="flex justify-between items-center mt-1">
                    <p className="text-[10px] opacity-80 font-medium">{sub}</p>
                    {canClick && <ArrowRight size={12} className="opacity-60" />}
                </div>
            </div>
        </div>
    );
};

export default Reports;
