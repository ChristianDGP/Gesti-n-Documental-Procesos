import React, { useEffect, useState, useMemo } from 'react';
import { DocumentService, UserService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, UserRole, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    CalendarRange, Search, Loader2, Clock, 
    Calendar, Layers, TrendingUp, Save, X, ArrowRight, 
    FileSpreadsheet, CheckCircle, ZoomIn, ZoomOut, Activity, Target,
    ChevronRight, ChevronDown, Maximize2, Minimize2
} from 'lucide-react';

interface Props {
    user: User;
}

const DEFAULT_EXECUTIVE_DEADLINE = '2026-06-30T23:59:59Z';
const DOC_TYPE_ORDER: DocType[] = ['AS IS', 'FCE', 'PM', 'TO BE'];

type ViewScale = 'YEARS' | 'MONTHS';
type StatusFilter = 'DONE' | 'ON_TRACK' | 'RISK' | 'OVERDUE' | 'PENDING' | 'ALL';

const AdminGantt: React.FC<Props> = ({ user }) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    // Estado de Expansión
    const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});
    const [expandedMicros, setExpandedMicros] = useState<Record<string, boolean>>({});

    // Filtros
    const [filterProject, setFilterProject] = useState('');
    const [filterMacro, setFilterMacro] = useState('');
    const [filterProcess, setFilterProcess] = useState('');
    const [filterAnalyst, setFilterAnalyst] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

    // Estado de Vista
    const [viewScale, setViewScale] = useState<ViewScale>('MONTHS');
    const currentYear = new Date().getFullYear();

    // Modal
    const [editModalDoc, setEditModalDoc] = useState<Document | null>(null);
    const [newDeadline, setNewDeadline] = useState('');

    const canEditDates = user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR;
    const isAnalyst = user.role === UserRole.ANALYST;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [docs, fullHierarchy, usersList] = await Promise.all([
                DocumentService.getAll(),
                HierarchyService.getFullHierarchy(),
                UserService.getAll()
            ]);

            setAllUsers(usersList);

            const realDocMap = new Map<string, Document>();
            docs.forEach(doc => {
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

            const unifiedList: Document[] = [];
            const initialProjects: Record<string, boolean> = {};
            
            Object.keys(fullHierarchy).forEach(proj => {
                initialProjects[proj] = true; // Por defecto expandidos
                Object.keys(fullHierarchy[proj]).forEach(macro => {
                    Object.keys(fullHierarchy[proj][macro]).forEach(proc => {
                        fullHierarchy[proj][macro][proc].forEach(node => {
                            if (node.active === false) return;
                            if (isAnalyst && !node.assignees?.includes(user.id)) return;
                            
                            const requiredTypes = node.requiredTypes?.length > 0 
                                ? node.requiredTypes 
                                : ['AS IS', 'FCE', 'PM', 'TO BE'];

                            DOC_TYPE_ORDER.forEach(type => {
                                if (!requiredTypes.includes(type)) return;
                                const key = `${normalizeHeader(proj)}|${normalizeHeader(node.name)}|${normalizeHeader(type)}`;
                                
                                if (realDocMap.has(key)) {
                                    unifiedList.push({ 
                                        ...realDocMap.get(key)!, 
                                        project: proj, 
                                        macroprocess: macro,
                                        process: proc,
                                        microprocess: node.name, 
                                        assignees: node.assignees 
                                    });
                                } else {
                                    unifiedList.push({
                                        id: `virtual-${key}`,
                                        title: `${node.name} - ${type}`,
                                        description: 'Pendiente de inicio',
                                        project: proj,
                                        macroprocess: macro,
                                        process: proc,
                                        microprocess: node.name,
                                        docType: type,
                                        state: DocState.NOT_STARTED,
                                        version: '-',
                                        progress: 0,
                                        files: [],
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date(0).toISOString(),
                                        assignees: node.assignees || [],
                                        authorId: '',
                                        authorName: 'Sistema'
                                    } as Document);
                                }
                            });
                        });
                    });
                });
            });

            setDocuments(unifiedList);
            setExpandedProjects(initialProjects);
        } catch (e) {
            console.error("Error loading Gantt data", e);
        } finally {
            setLoading(false);
        }
    };

    const getStatusInfo = (doc: Document) => {
        const now = new Date();
        const deadline = doc.expectedEndDate ? new Date(doc.expectedEndDate) : new Date(DEFAULT_EXECUTIVE_DEADLINE);
        
        if (doc.state === DocState.APPROVED) return { status: 'DONE' as const, color: 'bg-emerald-500', label: 'Terminado' };
        if (doc.state === DocState.NOT_STARTED) return { status: 'PENDING' as const, color: 'bg-slate-300', label: 'No Iniciado' };
        
        if (now > deadline) return { status: 'OVERDUE' as const, color: 'bg-rose-500', label: 'Atrasado' };

        const created = new Date(doc.createdAt);
        const totalDuration = deadline.getTime() - created.getTime();
        const elapsed = now.getTime() - created.getTime();
        const ratio = elapsed / totalDuration;
        
        if (ratio > 0.8 && doc.progress < 80) return { status: 'RISK' as const, color: 'bg-amber-500', label: 'En Riesgo' };
        return { status: 'ON_TRACK' as const, color: 'bg-indigo-500', label: 'En Plazo' };
    };

    const filteredDocuments = useMemo(() => {
        return documents.filter(d => {
            if (filterProject && d.project !== filterProject) return false;
            if (filterMacro && d.macroprocess !== filterMacro) return false;
            if (filterProcess && d.process !== filterProcess) return false;
            if (filterAnalyst && !d.assignees?.includes(filterAnalyst)) return false;
            if (statusFilter !== 'ALL' && getStatusInfo(d).status !== statusFilter) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return d.microprocess?.toLowerCase().includes(term) || d.title.toLowerCase().includes(term);
            }
            return true;
        });
    }, [documents, filterProject, filterMacro, filterProcess, filterAnalyst, statusFilter, searchTerm]);

    const groupedData = useMemo(() => {
        const groups: Record<string, Record<string, Document[]>> = {};
        filteredDocuments.forEach(doc => {
            const p = doc.project || 'Sin Proyecto';
            const m = doc.microprocess || 'General';
            if (!groups[p]) groups[p] = {};
            if (!groups[p][m]) groups[p][m] = [];
            groups[p][m].push(doc);
        });
        return groups;
    }, [filteredDocuments]);

    const availableMacros = useMemo(() => Array.from(new Set(documents.filter(d => !filterProject || d.project === filterProject).map(d => d.macroprocess).filter(Boolean))).sort(), [documents, filterProject]);
    const availableProcesses = useMemo(() => Array.from(new Set(documents.filter(d => (!filterProject || d.project === filterProject) && (!filterMacro || d.macroprocess === filterMacro)).map(d => d.process).filter(Boolean))).sort(), [documents, filterProject, filterMacro]);

    // Timeline Configuration
    const timelineHeaders = useMemo(() => {
        if (viewScale === 'MONTHS') return ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        return ['2023', '2024', '2025'];
    }, [viewScale]);

    const getPositionInGantt = (dateStr: string) => {
        const date = new Date(dateStr).getTime();
        if (viewScale === 'MONTHS') {
            const startOfYear = new Date(currentYear, 0, 1).getTime();
            const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59).getTime();
            if (date <= startOfYear) return 0;
            if (date >= endOfYear) return 100;
            return ((date - startOfYear) / (endOfYear - startOfYear)) * 100;
        } else {
            const startRange = new Date(2023, 0, 1).getTime();
            const endRange = new Date(2025, 11, 31, 23, 59, 59).getTime();
            if (date <= startRange) return 0;
            if (date >= endRange) return 100;
            return ((date - startRange) / (endRange - startRange)) * 100;
        }
    };

    const handleUpdateDeadline = async () => {
        if (!canEditDates || !editModalDoc || !newDeadline) return;
        setUpdatingId(editModalDoc.id);
        try {
            await DocumentService.updateDeadline(editModalDoc.id, new Date(newDeadline).toISOString());
            setEditModalDoc(null);
            await loadData();
        } catch (e) {
            alert("Error al actualizar la fecha");
        } finally {
            setUpdatingId(null);
        }
    };

    const handleExportExcel = () => {
        if (filteredDocuments.length === 0) return;
        const headers = ['PROYECTO', 'MACROPROCESO', 'PROCESO', 'MICROPROCESO', 'TIPO', 'ESTADO ACTUAL', 'ESTADO OPERATIVO', 'INICIO', 'META', 'SITUACION'];
        const rows = filteredDocuments.map(doc => {
            const status = getStatusInfo(doc);
            const deadline = doc.expectedEndDate ? new Date(doc.expectedEndDate) : new Date(DEFAULT_EXECUTIVE_DEADLINE);
            return [
                doc.project, doc.macroprocess, doc.process, doc.microprocess, doc.docType, `${STATE_CONFIG[doc.state].label.split('(')[0].trim()} (${doc.progress}%)`, 
                STATE_CONFIG[doc.state].label.split('(')[0], 
                new Date(doc.createdAt).toLocaleDateString(), deadline.toLocaleDateString(), status.label
            ];
        });
        const csvContent = [headers.join(';'), ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))].join('\n');
        const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url); link.setAttribute('download', `SGD_Gantt_Estrategico_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden'; document.body.appendChild(link); link.click(); document.body.removeChild(link);
    };

    const toggleProject = (proj: string) => {
        setExpandedProjects(prev => ({ ...prev, [proj]: !prev[proj] }));
    };

    const toggleMicro = (proj: string, micro: string) => {
        const key = `${proj}-${micro}`;
        setExpandedMicros(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const expandAll = () => {
        const allP: Record<string, boolean> = {};
        const allM: Record<string, boolean> = {};
        Object.keys(groupedData).forEach(p => {
            allP[p] = true;
            Object.keys(groupedData[p]).forEach(m => {
                allM[`${p}-${m}`] = true;
            });
        });
        setExpandedProjects(allP);
        setExpandedMicros(allM);
    };

    const collapseAll = () => {
        setExpandedProjects({});
        setExpandedMicros({});
    };

    const todayPos = useMemo(() => getPositionInGantt(new Date().toISOString()), [viewScale]);

    return (
        <div className="space-y-6 pb-20 max-w-[1600px] mx-auto animate-fadeIn">
            {/* CABECERA */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg">
                            <CalendarRange size={24} />
                        </div>
                        Diagrama Gantt
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 font-medium italic">Cronograma Táctico Institucional y Control de Plazos.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm mr-2">
                        <button onClick={expandAll} className="p-2 hover:bg-slate-50 text-slate-600 rounded-lg" title="Expandir Todo"><Maximize2 size={16} /></button>
                        <button onClick={collapseAll} className="p-2 hover:bg-slate-50 text-slate-600 rounded-lg" title="Contraer Todo"><Minimize2 size={16} /></button>
                    </div>
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm mr-2">
                        <button onClick={() => setViewScale('YEARS')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewScale === 'YEARS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Años</button>
                        <button onClick={() => setViewScale('MONTHS')} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${viewScale === 'MONTHS' ? 'bg-slate-900 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}>Meses</button>
                    </div>
                    <button onClick={handleExportExcel} className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95">
                        <FileSpreadsheet size={18} /> Exportar
                    </button>
                </div>
            </div>

            {/* FILTROS */}
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 items-end">
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Proyecto</label>
                    <select value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setFilterMacro(''); setFilterProcess(''); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <option value="">TODOS</option>
                        <option value="HPC">HPC</option>
                        <option value="HSR">HSR</option>
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Macroproceso</label>
                    <select value={filterMacro} onChange={(e) => { setFilterMacro(e.target.value); setFilterProcess(''); }} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <option value="">TODOS</option>
                        {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </div>
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Proceso</label>
                    <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
                        <option value="">TODOS</option>
                        {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
                {!isAnalyst && (
                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Analista</label>
                        <select value={filterAnalyst} onChange={(e) => setFilterAnalyst(e.target.value)} className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20">
                            <option value="">TODOS</option>
                            {allUsers.filter(u => u.role === UserRole.ANALYST).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                )}
                <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Buscar Microproceso</label>
                    <div className="relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Ej: Admisión..." className="w-full pl-9 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/20" />
                    </div>
                </div>
            </div>

            {/* TABLA GANTT JERÁRQUICA */}
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1300px]">
                        <thead className="bg-slate-900 text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] border-b border-slate-800">
                            <tr>
                                <th className="px-6 py-5 w-64">Jerarquía Organizacional</th>
                                <th className="px-6 py-5 w-48">Tipo / Estado</th>
                                <th className="px-6 py-5 w-40 text-center">Progreso</th>
                                <th className="px-6 py-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span>Cronograma Táctico</span>
                                        <div className="flex gap-4 text-[8px] font-bold opacity-60">
                                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-rose-500 rounded-full"></div> Atrasado</div>
                                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-indigo-500 rounded-full"></div> En Plazo</div>
                                            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-emerald-500 rounded-full"></div> Terminado</div>
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-12 gap-0 border-t border-slate-800/50 mt-2">
                                        {timelineHeaders.map((h, i) => (
                                            <div key={i} className={`text-center py-2 border-r border-slate-800/20 last:border-0 ${viewScale === 'MONTHS' ? 'col-span-1' : 'col-span-4'}`}>
                                                {h}
                                            </div>
                                        ))}
                                    </div>
                                </th>
                                <th className="px-6 py-5 w-16 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {Object.keys(groupedData).length === 0 ? (
                                <tr><td colSpan={5} className="py-24 text-center opacity-30 italic">No se encontraron registros.</td></tr>
                            ) : Object.keys(groupedData).map(project => {
                                const isProjectExpanded = expandedProjects[project];
                                // Fix: Explicitly cast flattened array to Document[] and type reduce parameters to resolve unknown property access and arithmetic errors
                                const projectDocs = Object.values(groupedData[project]).flat() as Document[];
                                const projectAverageProgress = projectDocs.length > 0 
                                    ? Math.round(projectDocs.reduce((acc: number, d: Document) => acc + d.progress, 0) / projectDocs.length)
                                    : 0;

                                return (
                                    <React.Fragment key={project}>
                                        {/* HEADER DE PROYECTO */}
                                        <tr onClick={() => toggleProject(project)} className="bg-slate-50 cursor-pointer hover:bg-slate-100 transition-colors group">
                                            <td className="px-6 py-4 font-black text-slate-800 flex items-center gap-2">
                                                {isProjectExpanded ? <ChevronDown size={18} className="text-indigo-600" /> : <ChevronRight size={18} className="text-slate-400" />}
                                                <span className="bg-slate-900 text-white px-2 py-0.5 rounded text-[10px] tracking-widest">{project}</span>
                                                <span className="text-xs ml-2 text-slate-500 font-medium">({Object.keys(groupedData[project]).length} microprocesos)</span>
                                            </td>
                                            <td className="px-6 py-4"></td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="text-[10px] font-black text-indigo-600">{projectAverageProgress}% AVG</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                {!isProjectExpanded && (
                                                    <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                                                        <div className="h-full bg-indigo-500 transition-all duration-700" style={{ width: `${projectAverageProgress}%` }}></div>
                                                    </div>
                                                )}
                                            </td>
                                            <td className="px-6 py-4"></td>
                                        </tr>

                                        {isProjectExpanded && Object.keys(groupedData[project]).map((micro) => {
                                            const microKey = `${project}-${micro}`;
                                            const isMicroExpanded = expandedMicros[microKey];
                                            const microDocs = groupedData[project][micro];
                                            const microAverageProgress = Math.round(microDocs.reduce((acc, d) => acc + d.progress, 0) / microDocs.length);

                                            return (
                                                <React.Fragment key={microKey}>
                                                    {/* HEADER DE MICROPROCESO */}
                                                    <tr onClick={() => toggleMicro(project, micro)} className="bg-white cursor-pointer hover:bg-slate-50/80 transition-colors border-l-4 border-indigo-500">
                                                        <td className="px-10 py-3 font-bold text-slate-700 flex items-center gap-2">
                                                            {isMicroExpanded ? <ChevronDown size={14} className="text-indigo-500" /> : <ChevronRight size={14} className="text-slate-300" />}
                                                            <span className="text-xs uppercase tracking-tight truncate max-w-[300px]">{micro}</span>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            {!isMicroExpanded && (
                                                                <div className="flex gap-1">
                                                                    {microDocs.map(d => (
                                                                        <div key={d.id} className={`w-2 h-2 rounded-full ${getStatusInfo(d).color}`} title={d.docType}></div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-3 text-center">
                                                            <span className="text-[10px] font-bold text-slate-500">{microAverageProgress}%</span>
                                                        </td>
                                                        <td className="px-6 py-3">
                                                            {!isMicroExpanded && (
                                                                <div className="h-1 w-full bg-slate-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-indigo-400" style={{ width: `${microAverageProgress}%` }}></div>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-3"></td>
                                                    </tr>

                                                    {/* FILAS DE DOCUMENTOS INDIVIDUALES */}
                                                    {isMicroExpanded && microDocs.map((doc) => {
                                                        const statusInfo = getStatusInfo(doc);
                                                        const isApproved = doc.state === DocState.APPROVED;
                                                        const barStart = doc.createdAt;
                                                        const barEnd = isApproved ? doc.updatedAt : (doc.expectedEndDate || DEFAULT_EXECUTIVE_DEADLINE);
                                                        const startPos = getPositionInGantt(barStart);
                                                        const endPos = getPositionInGantt(barEnd);
                                                        const duration = Math.max(1.5, endPos - startPos);

                                                        return (
                                                            <tr key={doc.id} className="hover:bg-indigo-50/30 transition-all group bg-slate-50/20">
                                                                <td className="px-16 py-3">
                                                                    <div className="flex items-center gap-2">
                                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-200"></div>
                                                                        <span className="text-[10px] font-black text-slate-500 uppercase">{doc.docType}</span>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-3">
                                                                    <div className={`inline-block px-2 py-0.5 rounded-full text-[8px] font-black border ${doc.state === DocState.NOT_STARTED ? 'bg-white text-slate-300 border-slate-100' : STATE_CONFIG[doc.state].color}`}>
                                                                        {STATE_CONFIG[doc.state].label.split('(')[0].trim()}
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-3 text-center">
                                                                    <span className="text-[9px] font-mono text-slate-400 font-bold">{doc.progress}%</span>
                                                                </td>
                                                                <td className="px-6 py-3">
                                                                    <div className="relative h-8 flex items-center">
                                                                        {/* Grid Background */}
                                                                        <div className="absolute inset-0 grid grid-cols-12 pointer-events-none opacity-[0.03]">
                                                                            {timelineHeaders.map((_, i) => <div key={i} className={`border-r border-slate-900 last:border-0 ${viewScale === 'MONTHS' ? 'col-span-1' : 'col-span-4'}`}></div>)}
                                                                        </div>
                                                                        
                                                                        {/* Indicador de HOY */}
                                                                        {viewScale === 'MONTHS' && todayPos > 0 && todayPos < 100 && (
                                                                            <div className="absolute top-0 bottom-0 w-px bg-rose-500/20 z-10" style={{ left: `${todayPos}%` }}></div>
                                                                        )}

                                                                        {/* Main Bar */}
                                                                        <div 
                                                                            className="absolute h-4 rounded-full bg-slate-100 border border-slate-200 overflow-hidden shadow-sm transition-all group-hover:scale-[1.01] cursor-help"
                                                                            style={{ left: `${startPos}%`, width: `${duration}%` }}
                                                                            title={`Plazo: ${new Date(barStart).toLocaleDateString()} al ${new Date(barEnd).toLocaleDateString()}`}
                                                                        >
                                                                            <div 
                                                                                className={`h-full ${statusInfo.color} transition-all duration-1000 ease-out`}
                                                                                style={{ width: `${isApproved ? 100 : doc.progress}%` }}
                                                                            ></div>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                                <td className="px-6 py-3 text-right">
                                                                    {(canEditDates && !isAnalyst && !doc.id.startsWith('virtual-') && !isApproved) && (
                                                                        <button onClick={() => { setEditModalDoc(doc); setNewDeadline(doc.expectedEndDate ? doc.expectedEndDate.split('T')[0] : DEFAULT_EXECUTIVE_DEADLINE.split('T')[0]); }} className="p-1 text-slate-300 hover:text-indigo-600 transition-colors">
                                                                            <Calendar size={12} />
                                                                        </button>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                </React.Fragment>
                                            );
                                        })}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* MODAL AJUSTE DE FECHA */}
            {canEditDates && !isAnalyst && editModalDoc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
                    <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20">
                        <div className="p-8 border-b border-slate-100">
                            <div className="flex justify-between items-center mb-6">
                                <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
                                    <Clock size={24} />
                                </div>
                                <button onClick={() => setEditModalDoc(null)} className="text-slate-400 hover:text-slate-900 transition-colors">
                                    <X size={28} />
                                </button>
                            </div>
                            <h3 className="text-xl font-black text-slate-900">Ajustar Fecha Meta</h3>
                            <p className="text-slate-500 text-xs font-medium uppercase tracking-widest mt-1">Estrategia Institucional</p>
                        </div>
                        <div className="p-8 space-y-6">
                            <div className="bg-slate-900 p-4 rounded-2xl text-white">
                                <span className="text-[8px] font-black uppercase text-indigo-400 block mb-1">Entregable</span>
                                <span className="text-xs font-black uppercase">{editModalDoc.title}</span>
                            </div>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-2">Nueva Fecha Compromiso</label>
                                <input type="date" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} min={editModalDoc.createdAt.split('T')[0]} className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-indigo-500/10 outline-none font-black text-sm" />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button onClick={() => setEditModalDoc(null)} className="flex-1 py-4 text-xs font-black uppercase text-slate-400 hover:text-slate-600 transition-colors">Cerrar</button>
                                <button onClick={handleUpdateDeadline} disabled={!newDeadline || updatingId === editModalDoc.id} className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 disabled:opacity-50 flex items-center justify-center gap-2">
                                    {updatingId === editModalDoc.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Actualizar
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const FilterableLegend = ({ color, label, active, onClick }: { color: string, label: string, active: boolean, onClick: () => void }) => (
    <button 
        onClick={onClick}
        className={`flex items-center gap-2.5 px-4 py-2 rounded-full border transition-all active:scale-95 ${active ? 'bg-white border-indigo-200 shadow-md ring-2 ring-indigo-500/10 scale-105' : 'border-transparent hover:bg-white/60'}`}
    >
        <div className={`w-3 h-3 rounded-full ${color} shadow-sm ${active ? 'animate-pulse' : ''}`}></div>
        <span className={`text-[10px] font-black uppercase tracking-widest transition-colors ${active ? 'text-indigo-600' : 'text-slate-500'}`}>{label}</span>
    </button>
);

export default AdminGantt;