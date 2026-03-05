
import React, { useState, useEffect, useMemo } from 'react';
import { ReferentService, HierarchyService } from '../services/firebaseBackend';
import { Referent, FullHierarchy, ProcessNode, User, UserRole, UserHierarchy } from '../types';
import { 
    UserPlus, Search, Edit, Trash2, X, Save, Building, Mail, Briefcase, 
    Loader2, AlertTriangle, FolderTree, Layers, Network, CheckSquare, Square, ChevronRight, Lock, CheckCircle2, Info, Users, Filter, Plus, UserCheck
} from 'lucide-react';

interface Props {
    user: User;
}

type ViewMode = 'BY_PROCESS' | 'BY_REFERENT';

const AdminReferents: React.FC<Props> = ({ user }) => {
    const [referents, setReferents] = useState<Referent[]>([]);
    const [fullHierarchy, setFullHierarchy] = useState<FullHierarchy>({});
    const [userHierarchy, setUserHierarchy] = useState<UserHierarchy | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('BY_PROCESS');
    const [searchTerm, setSearchTerm] = useState('');
    const [modalSearchTerm, setModalSearchTerm] = useState('');
    
    // Filters for Process View
    const [filterProject, setFilterProject] = useState('');
    const [filterMacro, setFilterMacro] = useState('');
    const [filterProcess, setFilterProcess] = useState('');
    const [filterMicroSearch, setFilterMicroSearch] = useState('');
    const [showOnlyEmpty, setShowOnlyEmpty] = useState(false);

    // Modals
    const [showReferentForm, setShowReferentForm] = useState(false);
    const [showLinkModal, setShowLinkModal] = useState<{ docId: string, name: string, currentReferentIds: string[] } | null>(null);
    const [editingReferentId, setEditingReferentId] = useState<string | null>(null);

    // Referent Form State
    const [refName, setRefName] = useState('');
    const [refEmail, setRefEmail] = useState('');
    const [refSpecialty, setRefSpecialty] = useState('');
    const [refOrganization, setRefOrganization] = useState('');

    const isAnalyst = user.role === UserRole.ANALYST;

    useEffect(() => {
        loadData();
    }, [user.id]);

    const loadData = async () => {
        setLoading(true);
        try {
            const [r, fh] = await Promise.all([
                ReferentService.getAll(),
                HierarchyService.getFullHierarchy()
            ]);
            
            setFullHierarchy(fh);
            setReferents(r);

            if (isAnalyst) {
                const uh = await HierarchyService.getUserHierarchy(user.id);
                setUserHierarchy(uh);
            } else {
                setUserHierarchy(null);
            }
        } catch (e) { 
            console.error(e); 
        } finally { 
            setLoading(false); 
        }
    };

    // --- REFERENT MANAGEMENT ---
    const handleSaveReferent = async (e: React.FormEvent) => {
        e.preventDefault();
        const data = { name: refName, email: refEmail, specialty: refSpecialty, organization: refOrganization };
        try {
            if (editingReferentId) {
                await ReferentService.update(editingReferentId, data);
            } else {
                await ReferentService.create(data);
            }
            setShowReferentForm(false);
            resetRefForm();
            await loadData();
        } catch (e) { alert("Error al guardar referente"); }
    };

    const resetRefForm = () => {
        setEditingReferentId(null); setRefName(''); setRefEmail(''); setRefSpecialty(''); setRefOrganization('');
    };

    const handleEditReferent = (r: Referent) => {
        setEditingReferentId(r.id);
        setRefName(r.name);
        setRefEmail(r.email);
        setRefSpecialty(r.specialty);
        setRefOrganization(r.organization);
        setShowReferentForm(true);
    };

    const handleDeleteReferent = async (id: string) => {
        if (!window.confirm("¿Eliminar referente globalmente? Se desvinculará de todos los procesos.")) return;
        try {
            await ReferentService.delete(id);
            await loadData();
        } catch (e) { alert("Error al eliminar"); }
    };

    // --- LINKING MANAGEMENT ---
    const handleOpenLinkModal = (node: ProcessNode) => {
        setModalSearchTerm('');
        setShowLinkModal({ 
            docId: node.docId, 
            name: node.name, 
            currentReferentIds: node.referentIds || [] 
        });
    };

    const handleToggleLink = async (docId: string, referentId: string, isLinked: boolean) => {
        if (!showLinkModal) return;
        
        const newIds = isLinked 
            ? showLinkModal.currentReferentIds.filter(id => id !== referentId)
            : [...showLinkModal.currentReferentIds, referentId];
        
        try {
            await HierarchyService.updateMicroprocessReferents(docId, newIds);
            setShowLinkModal({ ...showLinkModal, currentReferentIds: newIds });
            // Actualizar cache local para evitar recarga total inmediata si es posible, 
            // pero loadData es más seguro para mantener consistencia
            await loadData();
        } catch (e) { alert("Error al actualizar vínculo"); }
    };

    // --- HIERARCHY DATA PROCESSING ---
    const processList = useMemo(() => {
        const list: { project: string, macro: string, process: string, node: ProcessNode, canEdit: boolean }[] = [];
        
        Object.keys(fullHierarchy).forEach(proj => {
            if (filterProject && proj !== filterProject) return;
            
            Object.keys(fullHierarchy[proj]).forEach(macro => {
                if (filterMacro && macro !== filterMacro) return;
                Object.keys(fullHierarchy[proj][macro]).forEach(proc => {
                    if (filterProcess && proc !== filterProcess) return;
                    fullHierarchy[proj][macro][proc].forEach(node => {
                        const matchesSearch = !filterMicroSearch || node.name.toLowerCase().includes(filterMicroSearch.toLowerCase());
                        const isEmpty = !node.referentIds || node.referentIds.length === 0;
                        
                        if (matchesSearch && (!showOnlyEmpty || isEmpty)) {
                            const canEdit = !isAnalyst || (
                                (userHierarchy?.[proj] && 
                                userHierarchy[proj][macro] && 
                                userHierarchy[proj][macro][proc]?.includes(node.name)) ?? false
                            );
                            list.push({ project: proj, macro, process: proc, node, canEdit });
                        }
                    });
                });
            });
        });
        return list;
    }, [fullHierarchy, userHierarchy, isAnalyst, filterProject, filterMacro, filterProcess, filterMicroSearch, showOnlyEmpty]);

    const availableProjects = Object.keys(fullHierarchy).sort();
    const availableMacros = filterProject ? Object.keys(fullHierarchy[filterProject] || {}).sort() : [];
    const availableProcesses = (filterProject && filterMacro) ? Object.keys(fullHierarchy[filterProject][filterMacro] || {}).sort() : [];

    const filteredReferents = referents.filter(r => 
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const coverageStats = useMemo(() => {
        const total = processList.length;
        const covered = processList.filter(p => p.node.referentIds && p.node.referentIds.length > 0).length;
        const percentage = total > 0 ? Math.round((covered / total) * 100) : 0;
        return { total, covered, percentage };
    }, [processList]);

    if (loading && referents.length === 0) return <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2" /> Cargando gestión de referentes...</div>;

    return (
        <div className="space-y-6 pb-12">
            {/* HEADER & VIEW TOGGLE */}
            <div className="flex flex-col md:flex-row justify-between md:items-end gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Gestión de Referentes</h1>
                    <p className="text-slate-500">Asegure la cobertura de validadores técnicos por microproceso.</p>
                </div>
                <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
                    <button 
                        onClick={() => setViewMode('BY_PROCESS')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'BY_PROCESS' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Network size={14} /> Por Procesos
                    </button>
                    <button 
                        onClick={() => setViewMode('BY_REFERENT')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest transition-all ${viewMode === 'BY_REFERENT' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Users size={14} /> Directorio Maestro
                    </button>
                </div>
            </div>

            {viewMode === 'BY_PROCESS' ? (
                <>
                    {/* COVERAGE SUMMARY */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600">
                                <Layers size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Microprocesos</p>
                                <p className="text-2xl font-bold text-slate-900">{coverageStats.total}</p>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600">
                                <CheckCircle2 size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Con Referente</p>
                                <p className="text-2xl font-bold text-slate-900">{coverageStats.covered}</p>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex items-center gap-4">
                            <div className="w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center text-amber-600">
                                <Info size={24} />
                            </div>
                            <div>
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Cobertura Actual</p>
                                <div className="flex items-end gap-2">
                                    <p className="text-2xl font-bold text-slate-900">{coverageStats.percentage}%</p>
                                    <div className="flex-1 h-2 w-24 bg-slate-100 rounded-full mb-2 overflow-hidden">
                                        <div className="h-full bg-indigo-500 transition-all" style={{ width: `${coverageStats.percentage}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* PROCESS VIEW FILTERS */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Proyecto</label>
                                <select value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setFilterMacro(''); setFilterProcess(''); }} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10">
                                    <option value="">TODOS LOS PROYECTOS</option>
                                    {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Macroproceso</label>
                                <select value={filterMacro} onChange={(e) => { setFilterMacro(e.target.value); setFilterProcess(''); }} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10" disabled={!filterProject}>
                                    <option value="">TODOS</option>
                                    {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Proceso</label>
                                <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className="w-full p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10" disabled={!filterMacro}>
                                    <option value="">TODOS</option>
                                    {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Buscar Microproceso</label>
                                <div className="relative">
                                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                    <input 
                                        type="text" 
                                        placeholder="Nombre..." 
                                        value={filterMicroSearch}
                                        onChange={(e) => setFilterMicroSearch(e.target.value)}
                                        className="w-full pl-10 p-2.5 border border-slate-200 rounded-lg text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500/10"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-50">
                            <label className="flex items-center gap-2 cursor-pointer group">
                                <div 
                                    onClick={() => setShowOnlyEmpty(!showOnlyEmpty)}
                                    className={`w-10 h-5 rounded-full transition-all relative ${showOnlyEmpty ? 'bg-amber-500' : 'bg-slate-200'}`}
                                >
                                    <div className={`absolute top-1 w-3 h-3 rounded-full bg-white transition-all ${showOnlyEmpty ? 'left-6' : 'left-1'}`} />
                                </div>
                                <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900 transition-colors">Mostrar solo procesos sin referente</span>
                            </label>
                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                                {processList.length} Microprocesos encontrados
                            </div>
                        </div>
                    </div>

                    {/* PROCESS LIST */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-200">
                                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Microproceso / Jerarquía</th>
                                    <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Referentes Asignados</th>
                                    <th className="p-4 text-right text-[10px] font-black text-slate-400 uppercase tracking-widest">Acciones</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {processList.map(item => {
                                    const assignedRefs = referents.filter(r => item.node.referentIds?.includes(r.id));
                                    const isEmpty = assignedRefs.length === 0;
                                    
                                    return (
                                        <tr key={item.node.docId} className={`group hover:bg-slate-50/50 transition-colors ${!item.canEdit ? 'opacity-70' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-bold text-slate-900 text-sm">{item.node.name}</span>
                                                    {!item.canEdit && <span title="Fuera de tu alcance de gestión"><Lock size={12} className="text-slate-300" /></span>}
                                                </div>
                                                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter mt-0.5">
                                                    {item.project} <ChevronRight size={8} className="inline mx-0.5" /> {item.macro} <ChevronRight size={8} className="inline mx-0.5" /> {item.process}
                                                </div>
                                            </td>
                                            <td className="p-4">
                                                <div className="flex flex-wrap gap-1.5">
                                                    {isEmpty ? (
                                                        <span className="flex items-center gap-1 px-2 py-1 bg-amber-50 text-amber-600 border border-amber-100 rounded-md text-[10px] font-black uppercase tracking-tighter">
                                                            <AlertTriangle size={10} /> Sin Referente
                                                        </span>
                                                    ) : (
                                                        assignedRefs.map(r => (
                                                            <span key={r.id} className="px-2 py-1 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-md text-[10px] font-bold flex items-center gap-1">
                                                                <UserCheck size={10} /> {r.name}
                                                            </span>
                                                        ))
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={() => handleOpenLinkModal(item.node)}
                                                    disabled={!item.canEdit}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all
                                                        ${item.canEdit ? 'bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white shadow-sm' : 'bg-slate-100 text-slate-400 cursor-not-allowed'}`}
                                                >
                                                    <Network size={12} /> Gestionar Vínculos
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {processList.length === 0 && (
                            <div className="p-20 text-center flex flex-col items-center">
                                <Layers size={48} className="text-slate-100 mb-4" />
                                <p className="text-slate-400 font-bold italic">No se encontraron microprocesos con los filtros aplicados.</p>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* REFERENT DIRECTORY VIEW */}
                    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
                        <div className="relative w-full max-w-md">
                            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input 
                                type="text"
                                placeholder="Buscar referente por nombre, email o especialidad..."
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            />
                        </div>
                        <button 
                            onClick={() => { resetRefForm(); setShowReferentForm(true); }}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-medium text-sm"
                        >
                            <UserPlus size={18} /> Nuevo Referente
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {filteredReferents.map(r => (
                            <div key={r.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 group hover:border-indigo-300 transition-all flex flex-col">
                                <div className="flex justify-between items-start mb-4">
                                    <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg border border-indigo-100">
                                        {r.name.charAt(0)}
                                    </div>
                                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleEditReferent(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Editar Ficha"><Edit size={16}/></button>
                                        {(user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) && (
                                            <button onClick={() => handleDeleteReferent(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar Globalmente"><Trash2 size={16}/></button>
                                        )}
                                    </div>
                                </div>
                                <h3 className="font-bold text-slate-900 text-lg mb-1 leading-tight">{r.name}</h3>
                                <div className="space-y-2 text-xs text-slate-600 flex-1">
                                    <div className="flex items-center gap-2"><Briefcase size={14} className="text-slate-400" /> {r.specialty}</div>
                                    <div className="flex items-center gap-2"><Building size={14} className="text-slate-400" /> {r.organization}</div>
                                    <div className="flex items-center gap-2 group/email relative">
                                        <Mail size={14} className="text-slate-400" /> 
                                        <span className="truncate flex-1">{r.email}</span>
                                        <button 
                                            onClick={() => { navigator.clipboard.writeText(r.email); alert("Email copiado"); }}
                                            className="ml-2 p-1 bg-slate-100 rounded opacity-0 group-hover/email:opacity-100 transition-opacity"
                                            title="Copiar Email"
                                        >
                                            <CheckSquare size={10} />
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </>
            )}

            {/* MODAL: LINK REFERENTS TO PROCESS */}
            {showLinkModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                                    <Network size={20} className="text-indigo-600"/>
                                    Vincular Referentes
                                </h3>
                                <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Proceso: {showLinkModal.name}</p>
                            </div>
                            <button onClick={() => setShowLinkModal(null)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24} /></button>
                        </div>
                        
                        <div className="p-6 flex-1 overflow-y-auto space-y-6">
                            <div className="relative">
                                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text" 
                                    placeholder="Buscar en el directorio maestro..." 
                                    className="w-full pl-10 p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10"
                                    value={modalSearchTerm}
                                    onChange={(e) => setModalSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="space-y-2">
                                <div className="flex justify-between items-center px-2">
                                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Directorio de Expertos</h4>
                                    <button 
                                        onClick={() => { resetRefForm(); setShowReferentForm(true); }}
                                        className="text-[10px] font-black text-indigo-600 uppercase tracking-widest hover:underline flex items-center gap-1"
                                    >
                                        <Plus size={12} /> Crear Nuevo Experto
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 gap-2">
                                    {referents.filter(r => !modalSearchTerm || r.name.toLowerCase().includes(modalSearchTerm.toLowerCase())).map(r => {
                                        const isLinked = showLinkModal.currentReferentIds.includes(r.id);
                                        return (
                                            <div 
                                                key={r.id} 
                                                onClick={() => handleToggleLink(showLinkModal.docId, r.id, isLinked)}
                                                className={`flex items-center justify-between p-3 rounded-xl border transition-all cursor-pointer group
                                                    ${isLinked ? 'bg-indigo-50 border-indigo-200' : 'bg-white border-slate-100 hover:border-indigo-200'}`}
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black
                                                        ${isLinked ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'}`}>
                                                        {r.name.charAt(0)}
                                                    </div>
                                                    <div>
                                                        <p className={`text-sm font-bold ${isLinked ? 'text-indigo-900' : 'text-slate-700'}`}>{r.name}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">{r.specialty} • {r.organization}</p>
                                                    </div>
                                                </div>
                                                <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all
                                                    ${isLinked ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-200 text-transparent group-hover:border-indigo-300'}`}>
                                                    <CheckCircle2 size={14} />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                        
                        <div className="p-5 border-t border-slate-100 bg-slate-50 flex justify-end">
                            <button 
                                onClick={() => setShowLinkModal(null)}
                                className="px-8 py-2.5 bg-slate-900 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-slate-800 transition-all"
                            >
                                Finalizar Gestión
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* MODAL: CREATE/EDIT REFERENT DATA */}
            {showReferentForm && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
                        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
                            <h3 className="font-black text-slate-800 uppercase tracking-tight flex items-center gap-2">
                                <UserPlus size={18} className="text-indigo-600" />
                                {editingReferentId ? 'Editar Referente' : 'Nuevo Referente'}
                            </h3>
                            <button onClick={() => setShowReferentForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        <form onSubmit={handleSaveReferent} className="p-6 space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Nombre Completo</label>
                                <input type="text" value={refName} onChange={(e) => setRefName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10" required />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Email Institucional</label>
                                <input type="email" value={refEmail} onChange={(e) => setRefEmail(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10" required />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Especialidad</label>
                                    <input type="text" value={refSpecialty} onChange={(e) => setRefSpecialty(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10" required />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase ml-1">Proyecto/Nodo</label>
                                    <select value={refOrganization} onChange={(e) => setRefOrganization(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl text-sm font-bold outline-none bg-white" required>
                                        <option value="">Seleccionar...</option>
                                        <option value="HPC">HPC</option>
                                        <option value="HSR">HSR</option>
                                        <option value="GENERAL">GENERAL</option>
                                    </select>
                                </div>
                            </div>
                            <div className="pt-4 flex gap-3">
                                <button type="button" onClick={() => setShowReferentForm(false)} className="flex-1 py-3 text-slate-400 font-black text-xs uppercase tracking-widest">Cancelar</button>
                                <button type="submit" className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-100 hover:bg-indigo-700 transition-all">
                                    {editingReferentId ? 'Guardar Cambios' : 'Crear Registro'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminReferents;
