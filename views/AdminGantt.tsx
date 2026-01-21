import React, { useEffect, useState, useMemo } from 'react';
import { DocumentService, UserService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, UserRole, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    CalendarRange, Search, Loader2, Clock, 
    Calendar, Layers, TrendingUp, Save, X, ArrowRight, 
    FileSpreadsheet, CheckCircle, ZoomIn, ZoomOut, Activity, Target
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
            Object.keys(fullHierarchy).forEach(proj => {
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

    // Timeline Configuration (Solo Años y Meses)
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
            // Escala Histórica 2023-2025
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
                <div className="flex gap-2">
                    <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
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

            {/* LEYENDA INTERACTIVA */}
            <div className="flex flex-wrap items-center justify-center gap-4 py-2 px-6 bg-slate-50 border border-slate-100 rounded-2xl shadow-inner">
                <FilterableLegend color="bg-emerald-500" label="Terminado" active={statusFilter === 'DONE'} onClick={() => setStatusFilter(statusFilter === 'DONE' ? 'ALL' : 'DONE')} />
                <FilterableLegend color="bg-indigo-500" label="En Plazo" active={statusFilter === 'ON_TRACK'} onClick={() => setStatusFilter(statusFilter === 'ON_TRACK' ? 'ALL' : 'ON_TRACK')} />
                <FilterableLegend color="bg-amber-500" label="En Riesgo" active={statusFilter === 'RISK'} onClick={() => setStatusFilter(statusFilter === 'RISK' ? 'ALL' : 'RISK')} />
                <FilterableLegend color="bg-rose-500" label="Atrasado" active={statusFilter === 'OVERDUE'} onClick={() => setStatusFilter(statusFilter === 'OVERDUE' ? 'ALL' : 'OVERDUE')} />
                <FilterableLegend color="bg-slate-300" label="No Iniciado" active={statusFilter === 'PENDING'} onClick={() => setStatusFilter(statusFilter === 'PENDING' ? 'ALL' : 'PENDING')} />
                {statusFilter !== 'ALL' && (
                    <button onClick={() => setStatusFilter('ALL')} className="text-[9px] font-black text-indigo-600 uppercase border-b border-indigo-600 hover:text-indigo-800 transition-colors ml-4">Ver Todos</button>
                )}
            </div>

            {/* TABLA GANTT */}
            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse min-w-[1300px]">
                        <thead className="bg-slate-900 text-[10px] text-slate-400 font-black uppercase tracking-[0.15em] border-b border-slate-800">
                            <tr>
                                <th className="px-6 py-5 w-32">Proyecto</th>
                                <th className="px-6 py-5 w-64">Microproceso / Tipo</th>
                                <th className="px-6 py-5 w-48">Estado Actual</th>
                                <th className="px-6 py-5 w-48">Estado Operativo</th>
                                <th className="px-6 py-5">
                                    <div className="flex items-center justify-between mb-2">
                                        <span>Cronograma ({viewScale === 'MONTHS' ? currentYear : '2023-2025'})</span>
                                        <div className="flex gap-1 text-[8px] font-bold opacity-60">
                                            <span>Inicio</span> <ArrowRight size={8} /> <span>Meta</span>
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
                                <tr><td colSpan={6} className="py-24 text-center opacity-30 italic">No se encontraron registros.</td></tr>
                            ) : Object.keys(groupedData).map(project => (
                                <React.Fragment key={project}>
                                    {Object.keys(groupedData[project]).map((micro, mIdx) => (
                                        <React.Fragment key={`${project}-${micro}`}>
                                            {groupedData[project][micro].map((doc, dIdx) => {
                                                const statusInfo = getStatusInfo(doc);
                                                const isFirstInMicro = dIdx === 0;
                                                const isApproved = doc.state === DocState.APPROVED;
                                                
                                                // Lógica de Barras: El inicio es siempre la fecha de creación/migración (última actividad al momento de carga inicial).
                                                const barStart = doc.createdAt;
                                                const barEnd = isApproved ? doc.updatedAt : (doc.expectedEndDate || DEFAULT_EXECUTIVE_DEADLINE);

                                                const startPos = getPositionInGantt(barStart);
                                                const endPos = getPositionInGantt(barEnd);
                                                const duration = Math.max(1.5, endPos - startPos);

                                                return (
                                                    <tr key={doc.id} className="hover:bg-slate-50/60 transition-all group">
                                                        <td className="px-6 py-4 align-top">
                                                            {isFirstInMicro && (
                                                                <span className="inline-block px-2 py-0.5 bg-slate-900 text-white rounded-md text-[9px] font-black tracking-widest uppercase">
                                                                    {project}
                                                                </span>
                                                            )}
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                            {isFirstInMicro && <h4 className="text-[11px] font-black text-slate-800 uppercase tracking-tighter mb-2 line-clamp-1" title={micro}>{micro}</h4>}
                                                            <div className={`flex items-center gap-2 pl-3 border-l-2 py-0.5 ${doc.state === DocState.NOT_STARTED ? 'border-slate-200' : 'border-indigo-500'}`}>
                                                                <span className={`text-[10px] font-black ${doc.state === DocState.NOT_STARTED ? 'text-slate-400' : 'text-slate-800'}`}>{doc.docType}</span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                            <div className="flex flex-col gap-1">
                                                                <div className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black border self-start ${doc.state === DocState.NOT_STARTED ? 'bg-slate-50 text-slate-400 border-slate-200' : STATE_CONFIG[doc.state].color}`}>
                                                                    {STATE_CONFIG[doc.state].label.split('(')[0].trim()}
                                                                </div>
                                                                <div className="text-[10px] font-mono font-bold text-slate-400">
                                                                    {doc.progress}% Completado
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                            <div className="flex items-center gap-2">
                                                                <div className={`w-2 h-2 rounded-full ${statusInfo.color}`}></div>
                                                                <span className="text-[10px] font-black text-slate-700 uppercase tracking-tighter">
                                                                    {statusInfo.label}
                                                                </span>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 align-top">
                                                            <div className="relative h-12 flex items-center">
                                                                {/* Grid Background */}
                                                                <div className="absolute inset-0 grid grid-cols-12 pointer-events-none opacity-5">
                                                                    {timelineHeaders.map((_, i) => <div key={i} className={`border-r border-slate-900 last:border-0 ${viewScale === 'MONTHS' ? 'col-span-1' : 'col-span-4'}`}></div>)}
                                                                </div>
                                                                
                                                                {/* Indicador de HOY (solo en vista mensual) */}
                                                                {viewScale === 'MONTHS' && todayPos > 0 && todayPos < 100 && (
                                                                    <div className="absolute top-0 bottom-0 w-px bg-rose-500/30 z-10" style={{ left: `${todayPos}%` }}>
                                                                        <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-rose-500"></div>
                                                                    </div>
                                                                )}

                                                                {/* Main Bar */}
                                                                <div 
                                                                    className={`absolute h-7 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden shadow-sm transition-all group-hover:scale-[1.01] cursor-help`}
                                                                    style={{ left: `${startPos}%`, width: `${duration}%` }}
                                                                    title={`Periodo: ${new Date(barStart).toLocaleDateString()} al ${new Date(barEnd).toLocaleDateString()}`}
                                                                >
                                                                    {/* Progress Fill */}
                                                                    <div 
                                                                        className={`h-full ${statusInfo.color} flex items-center px-3 transition-all duration-1000 ease-out`}
                                                                        style={{ width: `${isApproved ? 100 : doc.progress}%` }}
                                                                    >
                                                                        <div className="flex items-center gap-2 overflow-hidden">
                                                                            {isApproved ? <CheckCircle size={10} className="text-white shrink-0" /> : <Activity size={10} className="text-white shrink-0 animate-pulse" />}
                                                                            <span className="text-[8px] font-black text-white whitespace-nowrap opacity-95 uppercase tracking-tighter">
                                                                                {isApproved ? 'Cerrado' : `${doc.progress}%`}
                                                                            </span>
                                                                        </div>
                                                                    </div>
                                                                    
                                                                    {/* Meta Marker */}
                                                                    {!isApproved && duration > 10 && (
                                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2">
                                                                            <Target size={10} className="text-slate-300 opacity-40" />
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="px-6 py-4 align-top text-right">
                                                            {(canEditDates && !isAnalyst && !doc.id.startsWith('virtual-') && !isApproved) && (
                                                                <button onClick={() => { setEditModalDoc(doc); setNewDeadline(doc.expectedEndDate ? doc.expectedEndDate.split('T')[0] : DEFAULT_EXECUTIVE_DEADLINE.split('T')[0]); }} className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                    <Calendar size={14} />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr><td colSpan={6} className="h-4 bg-slate-50/30"></td></tr>
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            ))}
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