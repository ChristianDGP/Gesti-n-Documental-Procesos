
import React, { useState, useEffect, useMemo } from 'react';
import { ReferentService, HierarchyService } from '../services/firebaseBackend';
import { Referent, FullHierarchy, ProcessNode, User, UserRole, UserHierarchy } from '../types';
import { 
    UserPlus, Search, Edit, Trash2, X, Save, Building, Mail, Briefcase, 
    Loader2, AlertTriangle, FolderTree, Layers, Network, CheckSquare, Square, ChevronRight, Lock, CheckCircle2, Info
} from 'lucide-react';

interface Props {
    user: User;
}

const AdminReferents: React.FC<Props> = ({ user }) => {
    const [referents, setReferents] = useState<Referent[]>([]);
    const [fullHierarchy, setFullHierarchy] = useState<FullHierarchy>({});
    const [userHierarchy, setUserHierarchy] = useState<UserHierarchy | null>(null);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [organization, setOrganization] = useState('');

    // Hierarchy Selection for linking
    const [linkProject, setLinkProject] = useState('');
    const [linkMacro, setLinkMacro] = useState('');
    const [linkProcess, setLinkProcess] = useState('');
    const [linkMicroSearch, setLinkMicroSearch] = useState('');
    
    // El analista solo puede manipular estos IDs
    const [selectedMicroIds, setSelectedMicroIds] = useState<string[]>([]);
    // Estos IDs ya estaban vinculados y el analista NO puede tocarlos (pertenecen a otros)
    const [lockedMicroIds, setLockedMicroIds] = useState<string[]>([]);

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

    // Detectar duplicados mientras escribe el email
    const duplicateReferent = useMemo(() => {
        if (!email || editingId) return null;
        return referents.find(r => r.email.toLowerCase() === email.toLowerCase());
    }, [email, referents, editingId]);

    const handleUseDuplicate = () => {
        if (duplicateReferent) {
            handleEdit(duplicateReferent);
        }
    };

    const handleEdit = (r: Referent) => {
        setEditingId(r.id);
        setName(r.name);
        setEmail(r.email);
        setSpecialty(r.specialty);
        setOrganization(r.organization);
        
        const mySelectable: string[] = [];
        const externalLocked: string[] = [];

        // Clasificar vínculos actuales según permisos
        Object.keys(fullHierarchy).forEach(proj => {
            Object.keys(fullHierarchy[proj]).forEach(macro => {
                Object.keys(fullHierarchy[proj][macro]).forEach(proc => {
                    fullHierarchy[proj][macro][proc].forEach(node => {
                        if (node.referentIds?.includes(r.id)) {
                            // ¿Tengo permiso sobre este microproceso?
                            const hasPermission = !isAnalyst || (
                                (userHierarchy?.[proj] && 
                                userHierarchy[proj][macro] && 
                                userHierarchy[proj][macro][proc]?.includes(node.name)) ?? false
                            );

                            if (hasPermission) {
                                mySelectable.push(node.docId);
                            } else {
                                externalLocked.push(node.docId);
                            }
                        }
                    });
                });
            });
        });

        setSelectedMicroIds(mySelectable);
        setLockedMicroIds(externalLocked);
        setShowForm(true);
    };

    const resetForm = () => {
        setEditingId(null); setName(''); setEmail(''); setSpecialty(''); setOrganization('');
        setLinkProject(''); setLinkMacro(''); setLinkProcess(''); setLinkMicroSearch('');
        setSelectedMicroIds([]); setLockedMicroIds([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        
        // El set final para el backend es la unión de lo que el analista eligió + lo que estaba bloqueado para él
        const finalIdsToLink = Array.from(new Set([...selectedMicroIds, ...lockedMicroIds]));

        const data = { name, email, specialty, organization };
        try {
            let refId = editingId;
            if (editingId) {
                await ReferentService.update(editingId, data);
            } else {
                const newRef = await ReferentService.create(data);
                refId = newRef.id;
            }
            
            if (refId) {
                await HierarchyService.updateReferentLinks(refId, finalIdsToLink);
            }

            setShowForm(false);
            resetForm();
            await loadData();
        } catch (e) { alert("Error al guardar"); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Está seguro de eliminar este referente? Esta acción es global y se desvinculará de todos los microprocesos del sistema.")) return;
        try {
            await ReferentService.delete(id);
            await loadData();
        } catch (e) { alert("Error al eliminar"); }
    };

    const filteredMicros = useMemo(() => {
        let list: { project: string, macro: string, process: string, node: ProcessNode, canEdit: boolean }[] = [];
        
        Object.keys(fullHierarchy).forEach(proj => {
            if (linkProject && proj !== linkProject) return;
            
            Object.keys(fullHierarchy[proj]).forEach(macro => {
                if (linkMacro && macro !== linkMacro) return;
                Object.keys(fullHierarchy[proj][macro]).forEach(proc => {
                    if (linkProcess && proc !== linkProcess) return;
                    fullHierarchy[proj][macro][proc].forEach(node => {
                        const matchesSearch = !linkMicroSearch || node.name.toLowerCase().includes(linkMicroSearch.toLowerCase());
                        
                        if (matchesSearch) {
                            // Determinar si el usuario actual puede editar este nodo
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
    }, [fullHierarchy, userHierarchy, isAnalyst, linkProject, linkMacro, linkProcess, linkMicroSearch]);

    const availableProjects = useMemo(() => {
        // En el selector de filtros mostramos todo, pero la edición se restringe luego
        return Object.keys(fullHierarchy).sort();
    }, [fullHierarchy]);

    const availableMacros = linkProject ? Object.keys(fullHierarchy[linkProject] || {}).sort() : [];
    const availableProcesses = (linkProject && linkMacro) ? Object.keys(fullHierarchy[linkProject][linkMacro] || {}).sort() : [];

    const handleToggleMicro = (docId: string, canEdit: boolean) => {
        if (!canEdit) return; // Protección UI
        setSelectedMicroIds(prev => 
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const filteredReferents = referents.filter(r => 
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.specialty.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.email.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading && referents.length === 0) return <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2" /> Cargando referentes y permisos...</div>;

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Mantenedor de Referentes</h1>
                    <p className="text-slate-500">Gestión centralizada de expertos técnicos y validadores.</p>
                </div>
                <button 
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-medium"
                >
                    <UserPlus size={18} /> Nuevo Referente
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col md:flex-row gap-4 justify-between items-center">
                <div className="relative w-full max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text"
                        placeholder="Buscar por nombre, email o especialidad..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
                <div className="text-xs text-slate-400 font-medium">
                    {referents.length} Referentes en el sistema
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredReferents.map(r => (
                    <div key={r.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 group hover:border-indigo-300 transition-all flex flex-col">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 font-bold text-lg border border-indigo-100">
                                {r.name.charAt(0)}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded" title="Editar / Vincular"><Edit size={16}/></button>
                                {(user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) && (
                                    <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded" title="Eliminar Registro Global"><Trash2 size={16}/></button>
                                )}
                            </div>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg mb-1 leading-tight">{r.name}</h3>
                        <div className="space-y-2 text-xs text-slate-600 flex-1">
                            <div className="flex items-center gap-2"><Briefcase size={14} className="text-slate-400" /> {r.specialty}</div>
                            <div className="flex items-center gap-2"><Building size={14} className="text-slate-400" /> {r.organization}</div>
                            <div className="flex items-center gap-2 truncate"><Mail size={14} className="text-slate-400" /> {r.email}</div>
                        </div>
                        <div className="mt-4 pt-4 border-t border-slate-50 flex justify-between items-center">
                             <button onClick={() => handleEdit(r)} className="text-indigo-600 hover:text-indigo-800 text-[10px] font-black uppercase tracking-widest flex items-center gap-1">
                                Vincular Procesos <ChevronRight size={12} />
                             </button>
                        </div>
                    </div>
                ))}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                            <div>
                                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                    {editingId ? <Edit size={20} className="text-indigo-600"/> : <UserPlus size={20} className="text-indigo-600"/>}
                                    {editingId ? 'Gestionar Referente' : 'Nuevo Registro de Referente'}
                                </h3>
                                {editingId && <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">ID: {editingId}</p>}
                            </div>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={24} /></button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
                            {/* SECCIÓN 1: DATOS DEL REFERENTE */}
                            <div className="space-y-6">
                                <div className="space-y-4">
                                    <h4 className="font-black text-xs text-slate-400 border-b border-slate-100 pb-2 uppercase tracking-[0.1em] flex items-center gap-2">
                                        <Mail size={14} /> Información de Contacto
                                    </h4>
                                    
                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase ml-1">Email Institucional</label>
                                        <div className="relative">
                                            <input 
                                                type="email" 
                                                value={email} 
                                                onChange={(e) => setEmail(e.target.value)} 
                                                className={`w-full p-3 border rounded-xl outline-none focus:ring-4 transition-all font-bold text-sm
                                                    ${duplicateReferent ? 'border-amber-400 bg-amber-50 focus:ring-amber-500/10' : 'border-slate-200 focus:ring-indigo-500/10'}`} 
                                                placeholder="ejemplo@minsal.cl"
                                                required 
                                            />
                                            {duplicateReferent && (
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    <AlertTriangle className="text-amber-500" size={18} />
                                                </div>
                                            )}
                                        </div>
                                        
                                        {duplicateReferent && (
                                            <div className="mt-3 p-3 bg-amber-100 border border-amber-200 rounded-xl animate-fadeIn">
                                                <p className="text-[11px] text-amber-800 font-bold leading-tight">
                                                    Este referente ya existe en el sistema como <b>"{duplicateReferent.name}"</b>.
                                                </p>
                                                <button 
                                                    type="button" 
                                                    onClick={handleUseDuplicate}
                                                    className="mt-2 text-[10px] bg-amber-600 text-white px-3 py-1.5 rounded-lg font-black uppercase tracking-tighter hover:bg-amber-700 transition-all"
                                                >
                                                    Cargar ficha existente
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <div>
                                        <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase ml-1">Nombre Completo</label>
                                        <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold text-sm" placeholder="Nombre y Apellido" required />
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase ml-1">Especialidad / Cargo</label>
                                            <input type="text" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold text-sm" placeholder="Ej: Jefe de Unidad" required />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-black text-slate-400 mb-1 uppercase ml-1">Proyecto / Nodo</label>
                                            <select value={organization} onChange={(e) => setOrganization(e.target.value)} className="w-full p-3 border border-slate-200 rounded-xl outline-none focus:ring-4 focus:ring-indigo-500/10 font-bold text-sm bg-white" required>
                                                <option value="">Seleccione...</option>
                                                <option value="HPC">HPC</option>
                                                <option value="HSR">HSR</option>
                                                <option value="GENERAL">GENERAL</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100">
                                    <div className="flex items-start gap-3">
                                        <Info className="text-indigo-600 mt-0.5" size={18} />
                                        <div>
                                            <p className="text-[11px] font-black text-indigo-900 uppercase mb-1">Nota sobre duplicidad</p>
                                            <p className="text-[11px] text-indigo-700 leading-relaxed">
                                                Si el referente ya fue creado por otro analista, el sistema no permitirá crear una segunda ficha idéntica. Usted podrá vincular esa ficha existente a sus procesos asignados.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 2: ALCANCE DE VINCULACIÓN */}
                            <div className="space-y-4 flex flex-col h-full border-l border-slate-100 lg:pl-10">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                                    <h4 className="font-black text-xs text-slate-400 uppercase tracking-[0.1em] flex items-center gap-2">
                                        <Network size={14} /> Alcance de Validación
                                    </h4>
                                    <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full">
                                        {selectedMicroIds.length + lockedMicroIds.length} Vínculos
                                    </span>
                                </div>
                                
                                {/* FILTROS */}
                                <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <label className="block text-[9px] font-black text-slate-400 uppercase ml-1">Proyecto</label>
                                            <select value={linkProject} onChange={(e) => { setLinkProject(e.target.value); setLinkMacro(''); setLinkProcess(''); }} className="w-full text-[10px] p-2 border border-slate-200 rounded-lg outline-none font-bold">
                                                <option value="">TODOS</option>
                                                {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-[9px] font-black text-slate-400 uppercase ml-1">Macro</label>
                                            <select value={linkMacro} onChange={(e) => { setLinkMacro(e.target.value); setLinkProcess(''); }} className="w-full text-[10px] p-2 border border-slate-200 rounded-lg outline-none font-bold" disabled={!linkProject}>
                                                <option value="">TODAS</option>
                                                {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-[9px] font-black text-slate-400 uppercase ml-1">Proceso</label>
                                            <select value={linkProcess} onChange={(e) => setLinkProcess(e.target.value)} className="w-full text-[10px] p-2 border border-slate-200 rounded-lg outline-none font-bold" disabled={!linkMacro}>
                                                <option value="">TODOS</option>
                                                {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    <div className="relative">
                                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text" 
                                            placeholder="FILTRAR POR NOMBRE DE MICROPROCESO..." 
                                            value={linkMicroSearch}
                                            onChange={(e) => setLinkMicroSearch(e.target.value)}
                                            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500/10 placeholder:text-slate-300"
                                        />
                                    </div>
                                </div>

                                {/* LISTADO CON SCOPE PROTECTION */}
                                <div className="flex-1 overflow-y-auto border border-slate-100 rounded-2xl bg-white shadow-inner max-h-[300px] custom-scrollbar">
                                    {filteredMicros.length === 0 ? (
                                        <div className="p-10 text-center flex flex-col items-center">
                                            <Layers size={32} className="text-slate-100 mb-2" />
                                            <p className="text-xs text-slate-400 font-bold italic">No hay resultados para el filtro aplicado.</p>
                                        </div>
                                    ) : (
                                        <div className="divide-y divide-slate-50">
                                            {filteredMicros.map(item => {
                                                const isMine = item.canEdit;
                                                const isCurrentlySelected = selectedMicroIds.includes(item.node.docId);
                                                const isLockedByOther = lockedMicroIds.includes(item.node.docId);
                                                
                                                return (
                                                    <label 
                                                        key={item.node.docId} 
                                                        className={`flex items-center gap-4 p-3 transition-all group
                                                            ${!isMine ? 'opacity-60 bg-slate-50/30 cursor-not-allowed' : 'hover:bg-indigo-50 cursor-pointer'}`}
                                                    >
                                                        <div className="relative flex items-center">
                                                            <input 
                                                                type="checkbox" 
                                                                checked={isCurrentlySelected || isLockedByOther}
                                                                onChange={() => handleToggleMicro(item.node.docId, isMine)}
                                                                disabled={!isMine}
                                                                className={`peer h-5 w-5 appearance-none rounded-lg border transition-all
                                                                    ${!isMine 
                                                                        ? 'bg-slate-200 border-slate-300' 
                                                                        : 'border-slate-300 checked:bg-indigo-600 checked:border-indigo-600 cursor-pointer'}`}
                                                            />
                                                            <CheckSquare className="absolute w-5 h-5 text-white opacity-0 peer-checked:opacity-100 pointer-events-none p-0.5" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <div className="flex items-center gap-2">
                                                                <p className={`text-xs font-black truncate ${!isMine ? 'text-slate-400' : 'text-slate-800'}`}>
                                                                    {item.node.name}
                                                                </p>
                                                                {!isMine && isLockedByOther && (
                                                                    <div className="flex items-center gap-1 text-[8px] bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter" title="Vinculado por otro analista">
                                                                        <Lock size={8}/> Reservado
                                                                    </div>
                                                                )}
                                                                {isMine && (
                                                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity text-[8px] bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded font-black uppercase tracking-tighter">
                                                                        Tu Gestión
                                                                    </div>
                                                                )}
                                                            </div>
                                                            <p className="text-[9px] text-slate-400 flex items-center gap-1 mt-0.5 font-bold uppercase tracking-widest">
                                                                {item.project} <ChevronRight size={8}/> {item.macro}
                                                            </p>
                                                        </div>
                                                    </label>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                                
                                {isAnalyst && (
                                    <div className="flex items-start gap-2 px-2 py-1">
                                        <Lock size={12} className="text-slate-300 mt-0.5" />
                                        <p className="text-[9px] text-slate-400 font-bold leading-tight uppercase tracking-tighter">
                                            Solo puedes vincular referentes a microprocesos asignados a tu perfil. Los vínculos de otros analistas están bloqueados para su protección.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="lg:col-span-2 flex justify-end items-center pt-6 gap-4 border-t border-slate-100">
                                <button type="button" onClick={() => setShowForm(false)} className="px-6 py-2 text-slate-400 hover:text-slate-700 font-black text-xs uppercase tracking-widest transition-all">Cancelar</button>
                                <button type="submit" className="flex items-center gap-2 px-10 py-3 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-xl shadow-indigo-100 hover:bg-indigo-700 hover:shadow-indigo-200 active:scale-95 transition-all">
                                    <CheckCircle2 size={18} /> {editingId ? 'Actualizar Ficha' : 'Guardar Nuevo Referente'}
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
