
import React, { useEffect, useState, useMemo } from 'react';
import { DocumentService, UserService, HierarchyService, normalizeHeader } from '../services/firebaseBackend';
import { Document, User, DocState, UserRole, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    CalendarRange, Filter, Search, ChevronLeft, ChevronRight, 
    Loader2, Clock, AlertTriangle, CheckCircle2, User as UserIcon,
    Calendar, Layers, Briefcase, Info, TrendingUp, Save, X, ArrowRight, FileSpreadsheet, Download
} from 'lucide-react';

interface Props {
    user: User;
}

const DEFAULT_EXECUTIVE_DEADLINE = '2026-06-30T23:59:59Z';
const DOC_TYPE_ORDER: DocType[] = ['AS IS', 'FCE', 'PM', 'TO BE'];

const AdminGantt: React.FC<Props> = ({ user }) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [updatingId, setUpdatingId] = useState<string | null>(null);

    // Filters
    const [filterProject, setFilterProject] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Modal State
    const [editModalDoc, setEditModalDoc] = useState<Document | null>(null);
    const [newDeadline, setNewDeadline] = useState('');

    // Permission check
    const canEditDates = user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR;
    const isAnalyst = user.role === UserRole.ANALYST;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [docs, fullHierarchy] = await Promise.all([
                DocumentService.getAll(),
                HierarchyService.getFullHierarchy()
            ]);

            // Mapeamos documentos reales para búsqueda rápida
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

            // Reconstruimos la lista unificada basada en la jerarquía oficial
            const unifiedList: Document[] = [];
            Object.keys(fullHierarchy).forEach(proj => {
                Object.keys(fullHierarchy[proj]).forEach(macro => {
                    Object.keys(fullHierarchy[proj][macro]).forEach(proc => {
                        fullHierarchy[proj][macro][proc].forEach(node => {
                            if (node.active === false) return;
                            
                            // FILTRO PARA ANALISTAS: Solo microprocesos donde esté asignado
                            if (isAnalyst && !node.assignees?.includes(user.id)) return;
                            
                            // Determinamos qué tipos son requeridos para este microproceso
                            const requiredTypes = node.requiredTypes?.length > 0 
                                ? node.requiredTypes 
                                : ['AS IS', 'FCE', 'PM', 'TO BE'];

                            // Iteramos en el orden solicitado pero solo si es requerido
                            DOC_TYPE_ORDER.forEach(type => {
                                if (!requiredTypes.includes(type)) return;

                                const key = `${normalizeHeader(proj)}|${normalizeHeader(node.name)}|${normalizeHeader(type)}`;
                                
                                if (realDocMap.has(key)) {
                                    unifiedList.push({ ...realDocMap.get(key)!, project: proj, microprocess: node.name, assignees: node.assignees });
                                } else {
                                    // Documento virtual no iniciado (solo si es requerido)
                                    unifiedList.push({
                                        id: `virtual-${key}`,
                                        title: `${node.name} - ${type}`,
                                        description: 'Pendiente de inicio',
                                        project: proj,
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

    const handleUpdateDeadline = async () => {
        if (!canEditDates || !editModalDoc || !newDeadline) return;
        
        if (editModalDoc.id.startsWith('virtual-')) {
            alert("Inicie el documento antes de asignar un plazo especial.");
            return;
        }

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
        if (documents.length === 0) return;
        
        const headers = ['PROYECTO', 'MICROPROCESO', 'ENTREGABLE', 'ESTADO', 'AVANCE', 'FECHA INICIO', 'FECHA META', 'SITUACION'];
        const rows = documents.map(doc => {
            const statusInfo = getStatusInfo(doc);
            const deadline = doc.expectedEndDate ? new Date(doc.expectedEndDate) : new Date(DEFAULT_EXECUTIVE_DEADLINE);
            return [
                doc.project || '-',
                doc.microprocess || '-',
                doc.docType || '-',
                STATE_CONFIG[doc.state].label.split('(')[0],
                `${doc.progress}%`,
                new Date(doc.createdAt).toLocaleDateString(),
                deadline.toLocaleDateString(),
                statusInfo.label
            ];
        });

        const csvContent = [headers.join(';'), ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))].join('\n');
        const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `SGD_Gantt_Estrategico_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const getStatusInfo = (doc: Document) => {
        const now = new Date();
        const created = new Date(doc.createdAt);
        const deadline = doc.expectedEndDate ? new Date(doc.expectedEndDate) : new Date(DEFAULT_EXECUTIVE_DEADLINE);
        
        if (doc.state === DocState.APPROVED) return { status: 'DONE', color: 'bg-emerald-500', label: 'Completado' };
        if (now > deadline && doc.state !== DocState.NOT_STARTED) return { status: 'OVERDUE', color: 'bg-rose-500', label: 'Atrasado' };
        if (doc.state === DocState.NOT_STARTED) return { status: 'PENDING', color: 'bg-slate-300', label: 'No Iniciado' };

        const totalDuration = deadline.getTime() - created.getTime();
        const elapsed = now.getTime() - created.getTime();
        const ratio = elapsed / totalDuration;
        
        if (ratio > 0.8 && doc.progress < 80) return { status: 'RISK', color: 'bg-amber-500', label: 'En Riesgo' };
        return { status: 'ON_TRACK', color: 'bg-indigo-500', label: 'En Plazo' };
    };

    const groupedData = useMemo(() => {
        const filtered = documents.filter(d => {
            if (filterProject && d.project !== filterProject) return false;
            if (searchTerm) {
                const term = searchTerm.toLowerCase();
                return d.microprocess?.toLowerCase().includes(term) || d.title.toLowerCase().includes(term);
            }
            return true;
        });

        const groups: Record<string, Record<string, Document[]>> = {};
        filtered.forEach(doc => {
            const p = doc.project || 'Sin Proyecto';
            const m = doc.microprocess || 'General';
            if (!groups[p]) groups[p] = {};
            if (!groups[p][m]) groups[p][m] = [];
            groups[p][m].push(doc);
        });

        return groups;
    }, [documents, filterProject, searchTerm]);

    if (loading) return (
        <div className="flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="animate-spin text-indigo-600 mb-2" size={32} />
            <p className="text-slate-500 font-black uppercase tracking-widest text-[10px]">Generando Reporte Ejecutivo...</p>
        </div>
    );

    return (
        <div className="space-y-6 pb-20 max-w-[1600px] mx-auto animate-fadeIn">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 flex items-center gap-3">
                        <div className="p-2 bg-slate-900 rounded-xl text-white shadow-lg">
                            <CalendarRange size={24} />
                        </div>
                        Control Estratégico de Plazos
                    </h1>
                    <p className="text-slate-500 text-sm mt-1 font-medium">Seguimiento de entregables requeridos (Meta Corporativa: Junio 2026).</p>
                </div>
                <button 
                    onClick={handleExportExcel}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-emerald-200 transition-all active:scale-95"
                >
                    <FileSpreadsheet size={18} />
                    Exportar Reporte
                </button>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 flex flex-wrap gap-4 items-center justify-between">
                <div className="flex items-center gap-4 flex-1">
                    <div className="flex items-center gap-2 bg-slate-50 p-2 px-3 rounded-xl border border-slate-200">
                        <Briefcase size={16} className="text-slate-400" />
                        <select 
                            value={filterProject} 
                            onChange={(e) => setFilterProject(e.target.value)}
                            className="bg-transparent text-xs font-black text-slate-700 outline-none uppercase tracking-widest"
                        >
                            <option value="">TODOS LOS PROYECTOS</option>
                            <option value="HPC">HPC</option>
                            <option value="HSR">HSR</option>
                        </select>
                    </div>

                    <div className="relative flex-1 max-w-md">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar microproceso..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-4 focus:ring-indigo-500/5 outline-none font-bold"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-6 px-6 py-1 border-l border-slate-100 hidden lg:flex">
                    <LegendItem color="bg-indigo-500" label="En Plazo" />
                    <LegendItem color="bg-rose-500" label="Atrasado" />
                    <LegendItem color="bg-amber-500" label="En Riesgo" />
                    <LegendItem color="bg-slate-300" label="Pendiente" />
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead className="bg-slate-900 text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] border-b border-slate-800">
                            <tr>
                                <th className="px-8 py-5 w-40">Proyecto</th>
                                <th className="px-8 py-5">Microproceso / Entregables</th>
                                <th className="px-8 py-5 w-48">Estado Operativo</th>
                                <th className="px-8 py-5 w-80">Cronograma (Avance vs Meta)</th>
                                <th className={`px-8 py-5 text-right w-24 ${!canEditDates ? 'opacity-0 pointer-events-none' : ''}`}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {Object.keys(groupedData).length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-32 text-center">
                                        <div className="flex flex-col items-center opacity-20">
                                            <Search size={48} className="mb-4" />
                                            <p className="text-sm font-black uppercase tracking-widest text-slate-900">Sin registros asignados</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : Object.keys(groupedData).map(project => (
                                <React.Fragment key={project}>
                                    {Object.keys(groupedData[project]).map((micro, mIdx) => (
                                        <React.Fragment key={`${project}-${micro}`}>
                                            {groupedData[project][micro].map((doc, dIdx) => {
                                                const statusInfo = getStatusInfo(doc);
                                                const isFirstInMicro = dIdx === 0;

                                                return (
                                                    <tr key={doc.id} className="hover:bg-slate-50/60 transition-all group">
                                                        <td className="px-8 py-5 align-top">
                                                            {isFirstInMicro && (
                                                                <span className="inline-block px-3 py-1 bg-slate-900 text-white rounded-lg text-[9px] font-black tracking-widest">
                                                                    {project}
                                                                </span>
                                                            )}
                                                        </td>

                                                        <td className="px-8 py-5 align-top">
                                                            {isFirstInMicro && (
                                                                <div className="mb-4">
                                                                    <h4 className="text-sm font-black text-slate-900 uppercase tracking-tighter">{micro}</h4>
                                                                </div>
                                                            )}
                                                            <div className={`flex items-center gap-4 pl-4 border-l-2 py-1 ${doc.state === DocState.NOT_STARTED ? 'border-slate-200' : 'border-indigo-500'}`}>
                                                                <div className={`p-1.5 rounded-lg ${doc.state === DocState.NOT_STARTED ? 'bg-slate-100 text-slate-400' : 'bg-indigo-50 text-indigo-600 shadow-sm'}`}>
                                                                    <Layers size={14} />
                                                                </div>
                                                                <div className="flex flex-col">
                                                                    <span className={`text-[11px] font-black uppercase tracking-wide ${doc.state === DocState.NOT_STARTED ? 'text-slate-400' : 'text-slate-800'}`}>
                                                                        {doc.docType}
                                                                    </span>
                                                                    {doc.state !== DocState.NOT_STARTED && (
                                                                        <span className="text-[9px] text-slate-400 font-mono mt-0.5">V{doc.version}</span>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td className="px-8 py-5 align-top">
                                                            <div className="flex flex-col gap-2 mt-1">
                                                                <div className={`inline-flex px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-tighter border w-fit shadow-sm ${STATE_CONFIG[doc.state].color}`}>
                                                                    {STATE_CONFIG[doc.state].label.split('(')[0]}
                                                                </div>
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-24 bg-slate-100 rounded-full h-1.5 overflow-hidden border border-slate-200">
                                                                        <div 
                                                                            className={`h-full transition-all duration-1000 ${doc.state === DocState.APPROVED ? 'bg-emerald-500' : 'bg-slate-900'}`} 
                                                                            style={{ width: `${doc.progress}%` }}
                                                                        ></div>
                                                                    </div>
                                                                    <span className="text-[10px] font-black text-slate-900">{doc.progress}%</span>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td className="px-8 py-5 align-top">
                                                            <div className="space-y-2 mt-1">
                                                                <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-wider">
                                                                    <span className="text-slate-400">Inicio: {new Date(doc.createdAt).toLocaleDateString()}</span>
                                                                    <span className={statusInfo.status === 'OVERDUE' ? 'text-rose-600 font-black' : 'text-slate-800 font-black'}>
                                                                        Meta: {new Date(doc.expectedEndDate || DEFAULT_EXECUTIVE_DEADLINE).toLocaleDateString()}
                                                                    </span>
                                                                </div>
                                                                <div className="relative h-6 bg-slate-100 rounded-xl border border-slate-200 overflow-hidden shadow-inner p-1">
                                                                    <div 
                                                                        className={`h-full rounded-lg transition-all duration-1000 ${statusInfo.color} flex items-center justify-end px-2 shadow-sm`}
                                                                        style={{ width: `${doc.progress > 5 ? doc.progress : 5}%` }}
                                                                    >
                                                                        {doc.progress > 15 && <TrendingUp size={12} className="text-white opacity-40" />}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        <td className="px-8 py-5 align-top text-right">
                                                            {canEditDates && (
                                                                <button 
                                                                    disabled={doc.id.startsWith('virtual-')}
                                                                    onClick={() => {
                                                                        setEditModalDoc(doc);
                                                                        setNewDeadline(doc.expectedEndDate ? doc.expectedEndDate.split('T')[0] : DEFAULT_EXECUTIVE_DEADLINE.split('T')[0]);
                                                                    }}
                                                                    className={`p-2.5 rounded-xl border transition-all active:scale-90 ${doc.id.startsWith('virtual-') ? 'bg-slate-50 text-slate-200 border-slate-100 cursor-not-allowed' : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-600 hover:border-indigo-200 hover:shadow-md'}`}
                                                                >
                                                                    <Calendar size={18} />
                                                                </button>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                            <tr><td colSpan={5} className="h-6 bg-slate-50/40 border-y border-slate-100"></td></tr>
                                        </React.Fragment>
                                    ))}
                                </React.Fragment>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 p-5 rounded-3xl flex items-start gap-4 shadow-xl">
                <div className="p-2 bg-indigo-600 rounded-xl text-white">
                    <Info size={20} />
                </div>
                <div className="text-xs text-slate-400 leading-relaxed">
                    <p className="text-white font-black uppercase tracking-widest mb-1">Nota de Gestión</p>
                    <p>
                        {isAnalyst 
                          ? "Solo se visualizan los microprocesos y entregables bajo su asignación directa. Los plazos son de carácter informativo."
                          : "Solo se visualizan los entregables requeridos según la matriz de procesos institucional. Los plazos meta asumen el 30 de Junio de 2026 como fecha de término corporativa global, a menos que el Administrador defina un plazo específico."}
                    </p>
                </div>
            </div>

            {canEditDates && editModalDoc && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn">
                    <div className="bg-white rounded-[2.5rem] shadow-2xl w-full max-w-md overflow-hidden border border-white/20">
                        <div className="p-8 border-b border-slate-100 bg-slate-50/50">
                            <div className="flex justify-between items-center mb-6">
                                <div className="p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                                    <Clock className="text-indigo-600" size={24} />
                                </div>
                                <button onClick={() => setEditModalDoc(null)} className="text-slate-400 hover:text-slate-900">
                                    <X size={28} />
                                </button>
                            </div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">Redefinir Plazo Meta</h3>
                            <p className="text-slate-500 text-sm mt-1 font-medium">Ajuste de cronograma para informe estratégico.</p>
                        </div>

                        <div className="p-8 space-y-6">
                            <div className="p-5 bg-slate-900 rounded-3xl border border-slate-800">
                                <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Entregable</p>
                                <p className="text-sm font-black text-white leading-tight uppercase">{editModalDoc.title}</p>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] ml-2">Nueva Fecha de Entrega</label>
                                <input 
                                    type="date" 
                                    value={newDeadline}
                                    min={editModalDoc.createdAt.split('T')[0]}
                                    onChange={(e) => setNewDeadline(e.target.value)}
                                    className="w-full p-5 bg-slate-50 border border-slate-200 rounded-3xl focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-600 outline-none text-slate-900 font-black"
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button 
                                    onClick={() => setEditModalDoc(null)}
                                    className="flex-1 py-4 text-xs font-black uppercase text-slate-400"
                                >
                                    Cancelar
                                </button>
                                <button 
                                    onClick={handleUpdateDeadline}
                                    disabled={!newDeadline || updatingId === editModalDoc.id}
                                    className="flex-[2] bg-indigo-600 hover:bg-indigo-700 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl disabled:opacity-50 flex items-center justify-center gap-2"
                                >
                                    {updatingId === editModalDoc.id ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    Guardar Plazo
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
    <div className="flex items-center gap-2.5">
        <div className={`w-3 h-3 rounded-full ${color} shadow-sm`}></div>
        <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{label}</span>
    </div>
);

export default AdminGantt;
