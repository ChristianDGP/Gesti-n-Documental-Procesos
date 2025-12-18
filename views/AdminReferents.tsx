import React, { useState, useEffect, useMemo } from 'react';
import { ReferentService, HierarchyService } from '../services/firebaseBackend';
import { Referent, FullHierarchy, ProcessNode } from '../types';
import { 
    UserPlus, Search, Edit, Trash2, X, Save, Building, Mail, Briefcase, 
    Loader2, AlertCircle, FolderTree, Layers, Network, CheckSquare, Square, ChevronRight
} from 'lucide-react';

const AdminReferents: React.FC = () => {
    const [referents, setReferents] = useState<Referent[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [specialty, setSpecialty] = useState('');
    const [organization, setOrganization] = useState(''); // Representa el Proyecto principal

    // Hierarchy Selection for linking
    const [linkProject, setLinkProject] = useState('');
    const [linkMacro, setLinkMacro] = useState('');
    const [linkProcess, setLinkProcess] = useState('');
    const [linkMicroSearch, setLinkMicroSearch] = useState('');
    const [selectedMicroIds, setSelectedMicroIds] = useState<string[]>([]);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [r, h] = await Promise.all([
                ReferentService.getAll(),
                HierarchyService.getFullHierarchy()
            ]);
            setReferents(r);
            setHierarchy(h);
        } catch (e) { console.error(e); } finally { setLoading(false); }
    };

    const handleEdit = (r: Referent) => {
        setEditingId(r.id);
        setName(r.name);
        setEmail(r.email);
        setSpecialty(r.specialty);
        setOrganization(r.organization);
        
        // Cargar microprocesos vinculados actualmente
        const linkedIds: string[] = [];
        Object.keys(hierarchy).forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    hierarchy[proj][macro][proc].forEach(node => {
                        if (node.referentIds?.includes(r.id)) linkedIds.push(node.docId);
                    });
                });
            });
        });
        setSelectedMicroIds(linkedIds);
        setShowForm(true);
    };

    const resetForm = () => {
        setEditingId(null); setName(''); setEmail(''); setSpecialty(''); setOrganization('');
        setLinkProject(''); setLinkMacro(''); setLinkProcess(''); setLinkMicroSearch('');
        setSelectedMicroIds([]);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const data = { name, email, specialty, organization };
        try {
            let refId = editingId;
            if (editingId) {
                await ReferentService.update(editingId, data);
            } else {
                const newRef = await ReferentService.create(data);
                refId = newRef.id;
            }
            
            // Actualizar vinculaciones en la matriz
            if (refId) {
                await HierarchyService.updateReferentLinks(refId, selectedMicroIds);
            }

            setShowForm(false);
            resetForm();
            await loadData();
        } catch (e) { alert("Error al guardar"); }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm("¿Está seguro de eliminar este referente? Se desvinculará de todos los microprocesos.")) return;
        try {
            await ReferentService.delete(id);
            await loadData();
        } catch (e) { alert("Error al eliminar"); }
    };

    // --- FILTRADO DE MICROPROCESOS PARA VINCULACIÓN ---
    const filteredMicros = useMemo(() => {
        let list: { project: string, macro: string, process: string, node: ProcessNode }[] = [];
        
        Object.keys(hierarchy).forEach(proj => {
            if (linkProject && proj !== linkProject) return;
            Object.keys(hierarchy[proj]).forEach(macro => {
                if (linkMacro && macro !== linkMacro) return;
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    if (linkProcess && proc !== linkProcess) return;
                    hierarchy[proj][macro][proc].forEach(node => {
                        const matchesSearch = !linkMicroSearch || node.name.toLowerCase().includes(linkMicroSearch.toLowerCase());
                        if (matchesSearch) {
                            list.push({ project: proj, macro, process: proc, node });
                        }
                    });
                });
            });
        });
        return list;
    }, [hierarchy, linkProject, linkMacro, linkProcess, linkMicroSearch]);

    const availableProjects = Object.keys(hierarchy).sort();
    const availableMacros = linkProject ? Object.keys(hierarchy[linkProject] || {}).sort() : [];
    const availableProcesses = (linkProject && linkMacro) ? Object.keys(hierarchy[linkProject][linkMacro] || {}).sort() : [];

    const handleToggleMicro = (docId: string) => {
        setSelectedMicroIds(prev => 
            prev.includes(docId) ? prev.filter(id => id !== docId) : [...prev, docId]
        );
    };

    const filteredReferents = referents.filter(r => 
        r.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        r.specialty.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading && referents.length === 0) return <div className="p-8 text-center text-slate-500"><Loader2 className="animate-spin mx-auto mb-2" /> Cargando referentes...</div>;

    return (
        <div className="space-y-6 pb-12">
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900">Mantenedor de Referentes</h1>
                    <p className="text-slate-500">Gestión de expertos técnicos y sus asignaciones a microprocesos.</p>
                </div>
                <button 
                    onClick={() => { resetForm(); setShowForm(true); }}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all shadow-md font-medium"
                >
                    <UserPlus size={18} /> Nuevo Referente
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
                <div className="relative max-w-md">
                    <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input 
                        type="text"
                        placeholder="Buscar referente por nombre o especialidad..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-10 p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredReferents.map(r => (
                    <div key={r.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 group hover:border-indigo-300 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-indigo-600 font-bold text-lg">
                                {r.name.charAt(0)}
                            </div>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => handleEdit(r)} className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded"><Edit size={16}/></button>
                                <button onClick={() => handleDelete(r.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded"><Trash2 size={16}/></button>
                            </div>
                        </div>
                        <h3 className="font-bold text-slate-900 text-lg mb-1">{r.name}</h3>
                        <div className="space-y-2 text-xs text-slate-600">
                            <div className="flex items-center gap-2"><Briefcase size={14} className="text-slate-400" /> {r.specialty}</div>
                            <div className="flex items-center gap-2"><FolderTree size={14} className="text-slate-400" /> Proyecto: {r.organization}</div>
                            <div className="flex items-center gap-2"><Mail size={14} className="text-slate-400" /> {r.email}</div>
                        </div>
                    </div>
                ))}
            </div>

            {showForm && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="p-5 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                            <h3 className="text-lg font-bold text-slate-800">{editingId ? 'Editar Referente' : 'Nuevo Referente'}</h3>
                            <button onClick={() => setShowForm(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                        </div>
                        
                        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* SECCIÓN 1: DATOS PERSONALES */}
                            <div className="space-y-4">
                                <h4 className="font-bold text-sm text-slate-700 border-b pb-2 flex items-center gap-2 uppercase tracking-wide">
                                    <Mail size={16} className="text-indigo-600"/> Perfil del Referente
                                </h4>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Nombre Completo</label>
                                    <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Correo Electrónico</label>
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required />
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Especialidad / Cargo</label>
                                        <input type="text" value={specialty} onChange={(e) => setSpecialty(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Proyecto</label>
                                        <select value={organization} onChange={(e) => setOrganization(e.target.value)} className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500" required>
                                            <option value="">Seleccione Proyecto</option>
                                            {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                                            <option value="GENERAL">GENERAL</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* SECCIÓN 2: VINCULACIÓN DE MICROPROCESOS CON FILTROS */}
                            <div className="space-y-4 flex flex-col h-full border-l lg:pl-8">
                                <h4 className="font-bold text-sm text-slate-700 border-b pb-2 flex items-center justify-between uppercase tracking-wide">
                                    <div className="flex items-center gap-2"><Network size={16} className="text-indigo-600"/> Vincular a Microprocesos</div>
                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">{selectedMicroIds.length} asignados</span>
                                </h4>
                                
                                {/* FILTROS JERÁRQUICOS */}
                                <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Proyecto</label>
                                            <select value={linkProject} onChange={(e) => { setLinkProject(e.target.value); setLinkMacro(''); setLinkProcess(''); }} className="w-full text-[10px] p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-400">
                                                <option value="">TODOS</option>
                                                {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Macroproceso</label>
                                            <select value={linkMacro} onChange={(e) => { setLinkMacro(e.target.value); setLinkProcess(''); }} className="w-full text-[10px] p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-400" disabled={!linkProject}>
                                                <option value="">TODOS</option>
                                                {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
                                            </select>
                                        </div>
                                        <div className="space-y-1">
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase">Proceso</label>
                                            <select value={linkProcess} onChange={(e) => setLinkProcess(e.target.value)} className="w-full text-[10px] p-1.5 border border-slate-200 rounded outline-none focus:ring-1 focus:ring-indigo-400" disabled={!linkMacro}>
                                                <option value="">TODOS</option>
                                                {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                                            </select>
                                        </div>
                                    </div>
                                    
                                    {/* BUSCADOR DE MICROS */}
                                    <div className="relative">
                                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input 
                                            type="text" 
                                            placeholder="BUSCAR POR NOMBRE..." 
                                            value={linkMicroSearch}
                                            onChange={(e) => setLinkMicroSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded text-xs outline-none focus:ring-1 focus:ring-indigo-400"
                                        />
                                    </div>
                                </div>

                                {/* LISTADO DE MICROPROCESOS PARA SELECCIONAR */}
                                <div className="flex-1 overflow-y-auto border border-slate-200 rounded-lg bg-slate-50 max-h-[250px]">
                                    {filteredMicros.length === 0 ? (
                                        <div className="p-4 text-center text-slate-400 text-xs italic">No se encontraron microprocesos con los filtros actuales.</div>
                                    ) : (
                                        <div className="divide-y divide-slate-100">
                                            {filteredMicros.map(item => (
                                                <label key={item.node.docId} className="flex items-center gap-3 p-2 hover:bg-white cursor-pointer transition-colors group">
                                                    <div className="relative flex items-center">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={selectedMicroIds.includes(item.node.docId)}
                                                            onChange={() => handleToggleMicro(item.node.docId)}
                                                            className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-slate-300 checked:bg-indigo-600 checked:border-indigo-600"
                                                        />
                                                        <CheckSquare className="absolute w-4 h-4 text-white opacity-0 peer-checked:opacity-100 pointer-events-none p-0.5" />
                                                    </div>
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-slate-800 truncate group-hover:text-indigo-600">{item.node.name}</p>
                                                        <p className="text-[9px] text-slate-500 flex items-center gap-1">
                                                            <span className="font-bold">{item.project}</span> <ChevronRight size={8}/> {item.macro} <ChevronRight size={8}/> {item.process}
                                                        </p>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="lg:col-span-2 flex justify-end pt-4 gap-3 border-t">
                                <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 text-slate-600 font-medium">Cancelar</button>
                                <button type="submit" className="flex items-center gap-2 px-8 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-bold shadow-md">
                                    <Save size={18} /> {editingId ? 'Guardar Cambios' : 'Vincular y Guardar'}
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