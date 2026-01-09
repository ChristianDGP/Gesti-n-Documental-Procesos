
import React, { useState, useEffect } from 'react';
import { HierarchyService, UserService, NotificationService } from '../services/firebaseBackend';
import { User, FullHierarchy, ProcessNode, DocType, UserRole } from '../types';
import { 
  FolderTree, Search, ChevronRight, ChevronDown, Plus, X, Edit, Users, CheckSquare, Square, Filter, RefreshCw, AlertCircle, Link, Layers, Trash2, Loader2
} from 'lucide-react';

interface Props {
  user: User;
}

const AdminAssignments: React.FC<Props> = ({ user }) => {
  const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  
  // State for deletion tracking
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  // Filters State
  const [filterProject, setFilterProject] = useState('');
  const [filterMacro, setFilterMacro] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterMicro, setFilterMicro] = useState(''); 
  const [filterAnalyst, setFilterAnalyst] = useState('');

  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({ 'HPC': true, 'HSR': true });

  // Edit Assignment Modal State
  const [showEditModal, setShowEditModal] = useState(false);
  const [modalProject, setModalProject] = useState('');
  const [modalMacro, setModalMacro] = useState('');
  const [modalProcess, setModalProcess] = useState('');
  const [modalMicro, setModalMicro] = useState('');
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [originalAssignees, setOriginalAssignees] = useState<string[]>([]);
  const [matrixKeyToUpdate, setMatrixKeyToUpdate] = useState<string | null>(null);

  // Permission: Admin and Coordinator can both delete and edit
  const canEdit = user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async (showLoader = true) => {
    if (showLoader) setLoading(true);
    try {
        const [h, u] = await Promise.all([
          HierarchyService.getFullHierarchy(),
          UserService.getAll()
        ]);
        setHierarchy(h);
        setAllUsers(u);
    } catch (e) {
        console.error("Error loading assignments data:", e);
    } finally {
        if (showLoader) setLoading(false);
    }
  };

  const handleSeedDefaults = async () => {
      if (!window.confirm("¿Restaurar configuración de procesos por defecto?")) return;
      setSeeding(true);
      try {
          await HierarchyService.seedDefaults();
          await loadData();
      } catch (e: any) {
          alert("Error: " + e.message);
      } finally {
          setSeeding(false);
      }
  };

  const toggleProject = (proj: string) => {
    setExpandedProjects(prev => ({ ...prev, [proj]: !prev[proj] }));
  };

  const handleDelete = async (project: string, macro: string, process: string, id: string, microName: string, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      
      // Fix: Ensure we show the warning even if ID is unusual
      const confirmMsg = `¿Estás seguro de que deseas eliminar el microproceso "${microName}" de la matriz?\n\nEsta acción eliminará la configuración de analistas y documentos requeridos para este nodo.`;

      if(!window.confirm(confirmMsg)) return;

      if (!id) {
          alert("Error: El ID del nodo no es válido.");
          return;
      }

      const cleanId = id.toString().trim();
      
      setHiddenIds(prev => new Set(prev).add(cleanId));
      setDeletingIds(prev => new Set(prev).add(cleanId)); 
      
      setHierarchy(prev => {
          const next = { ...prev };
          if (next[project] && next[project][macro] && next[project][macro][process]) {
              next[project][macro][process] = next[project][macro][process].filter(node => node.docId !== cleanId);
          }
          return next;
      });

      try {
          await HierarchyService.deleteMicroprocess(cleanId);
      } catch (e: any) {
          alert("Error al eliminar del servidor: " + e.message);
          loadData(); // Revert on failure
      } finally {
          setDeletingIds(prev => {
              const next = new Set(prev);
              next.delete(cleanId);
              return next;
          });
      }
  };

  const handleEditAssignment = (proj: string, macro: string, proc: string, microObj: ProcessNode) => {
      setModalProject(proj);
      setModalMacro(macro);
      setModalProcess(proc);
      setModalMicro(microObj.name);
      setMatrixKeyToUpdate(microObj.docId);
      const existing = [...(microObj.assignees || [])];
      setCurrentAssignees(existing);
      setOriginalAssignees(existing);
      setShowEditModal(true);
  };

  const handleAddAssignee = (userId: string) => {
      if (!userId || currentAssignees.includes(userId)) return;
      setCurrentAssignees([...currentAssignees, userId]);
  };

  const handleRemoveAssignee = (userId: string) => {
      setCurrentAssignees(currentAssignees.filter(id => id !== userId));
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!matrixKeyToUpdate) return;
      try {
          await HierarchyService.updateMatrixAssignment(matrixKeyToUpdate, currentAssignees);
          const addedAssignees = currentAssignees.filter(id => !originalAssignees.includes(id));
          if (addedAssignees.length > 0) {
              await Promise.all(addedAssignees.map(async (targetId) => {
                  await NotificationService.create(targetId, matrixKeyToUpdate!, 'ASSIGNMENT', 'Nueva Asignación de Proceso', `Se le ha asignado el proceso: ${modalMicro} (${modalProject})`, user.name);
              }));
          }
          setShowEditModal(false);
          await loadData(false); 
      } catch (err: any) { alert(err.message); }
  };

  const handleToggleRequiredType = async (matrixKey: string, type: DocType) => {
      await HierarchyService.toggleRequiredType(matrixKey, type);
      await loadData(false);
  };

  const getAvailableMacros = () => {
      const macros = new Set<string>();
      Object.keys(hierarchy).forEach(proj => {
          if (filterProject && proj !== filterProject) return;
          Object.keys(hierarchy[proj]).forEach(m => macros.add(m));
      });
      return Array.from(macros).sort();
  };

  const getAvailableProcesses = () => {
      const processes = new Set<string>();
      Object.keys(hierarchy).forEach(proj => {
          if (filterProject && proj !== filterProject) return;
          Object.keys(hierarchy[proj]).forEach(m => {
              if (filterMacro && m !== filterMacro) return;
              Object.keys(hierarchy[proj][m]).forEach(p => processes.add(p));
          });
      });
      return Array.from(processes).sort();
  };

  const getFlattenedRows = (project: string) => {
      const rows: any[] = [];
      const macrosData = hierarchy[project] || {};
      Object.keys(macrosData).forEach(macro => {
          if (filterMacro && macro !== filterMacro) return;
          Object.keys(macrosData[macro]).forEach(proc => {
              if (filterProcess && proc !== filterProcess) return;
              const nodes = macrosData[macro][proc];
              nodes.forEach(node => {
                  if (hiddenIds.has(node.docId) || node.active === false) return; 
                  if (filterMicro && !node.name.toLowerCase().includes(filterMicro.toLowerCase())) return;
                  if (filterAnalyst && (!node.assignees || !node.assignees.includes(filterAnalyst))) return;
                  rows.push({ macro, proc, node });
              });
          });
      });
      return rows;
  };

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Cargando matriz de asignaciones...</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Gestor de Asignaciones</h1><p className="text-slate-500">Administre analistas responsables y requerimientos técnicos.</p></div>
        {user.role === UserRole.ADMIN && (
            <button onClick={handleSeedDefaults} disabled={seeding} className="px-4 py-2 bg-slate-800 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-2 hover:bg-slate-900 transition-all">
                {seeding ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Restablecer Matriz
            </button>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
              <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white outline-none"><option value="">Proyecto (Todos)</option>{Object.keys(hierarchy).map(p => <option key={p} value={p}>{p}</option>)}</select>
              <select value={filterMacro} onChange={(e) => setFilterMacro(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white outline-none"><option value="">Macroproceso (Todos)</option>{getAvailableMacros().map(m => <option key={m} value={m}>{m}</option>)}</select>
              <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white outline-none"><option value="">Proceso (Todos)</option>{getAvailableProcesses().map(p => <option key={p} value={p}>{p}</option>)}</select>
              <div className="relative"><Search size={16} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input type="text" placeholder="Microproceso..." value={filterMicro} onChange={(e) => setFilterMicro(e.target.value)} className="w-full pl-8 p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white outline-none" /></div>
              <select value={filterAnalyst} onChange={(e) => setFilterAnalyst(e.target.value)} className="p-2 border border-slate-300 rounded-lg text-sm bg-slate-50 focus:bg-white outline-none"><option value="">Analista (Todos)</option>{allUsers.filter(u => u.role === UserRole.ANALYST).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </div>
      </div>
      
      <div className="space-y-4">
        {Object.keys(hierarchy).map(projectKey => {
            if (filterProject && projectKey !== filterProject) return null;
            const rows = getFlattenedRows(projectKey);
            if (rows.length === 0) return null;
            return (
                <div key={projectKey} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    <div onClick={() => toggleProject(projectKey)} className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors border-b border-slate-200">
                        <div className="flex items-center gap-2 font-bold text-slate-800 text-lg">{expandedProjects[projectKey] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}<FolderTree size={20} className="text-indigo-600" />Proyecto {projectKey}</div>
                        <span className="text-xs text-slate-500 font-medium bg-white px-2 py-1 rounded border border-slate-200">{rows.length} Microprocesos</span>
                    </div>

                    {expandedProjects[projectKey] && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50"><tr><th className="px-4 py-3 w-1/4">Jerarquía (Macro / Proceso)</th><th className="px-4 py-3 w-1/4">Microproceso</th><th className="px-4 py-3 w-1/5">Documentos Definidos</th><th className="px-4 py-3 w-1/4">Analistas Responsables</th><th className="px-4 py-3 text-right">Acciones</th></tr></thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map((row, idx) => (
                                        <tr key={`${row.node.docId}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-4 py-3 align-top text-slate-600"><div className="font-semibold text-xs text-slate-700 mb-0.5">{row.macro}</div><div className="text-xs text-slate-500 pl-2 border-l-2 border-slate-200">{row.proc}</div></td>
                                            <td className="px-4 py-3 align-top"><span className="font-medium text-slate-900">{row.node.name}</span></td>
                                            <td className="px-4 py-3 align-top"><div className="flex items-center gap-2 flex-wrap">{['AS IS', 'FCE', 'PM', 'TO BE'].map((type) => { const isChecked = row.node.requiredTypes?.includes(type as DocType); return (<button key={type} onClick={() => handleToggleRequiredType(row.node.docId, type as DocType)} className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-all ${isChecked ? 'bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200' : 'bg-slate-50 text-slate-300 border-slate-200 hover:border-slate-300'}`} title={`Alternar ${type}`}>{isChecked ? <CheckSquare size={10} /> : <Square size={10} />}{type}</button>); })}</div></td>
                                            <td className="px-4 py-3 align-top">
                                                {(row.node.assignees?.length > 0) ? (<><div className="flex -space-x-2 overflow-hidden py-1">{row.node.assignees.map((aid: string) => { const u = allUsers.find(user => user.id === aid); if (!u) return <div key={aid} className="inline-flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white bg-slate-200 text-[10px] text-slate-500 font-bold">?</div>; return (<div key={u.id} className="inline-block h-6 w-6 rounded-full ring-2 ring-white bg-indigo-100 overflow-hidden" title={u.name}>{u.avatar ? <img src={u.avatar} className="h-full w-full object-cover" /> : <span className="flex h-full w-full items-center justify-center text-[10px] font-bold text-indigo-700">{u.name.charAt(0)}</span>}</div>); })}</div><div className="text-xs text-slate-500 mt-1 truncate">{row.node.assignees.map((aid: string) => { const u = allUsers.find(user => user.id === aid); return u ? u.name : 'Desc.'; }).join(', ')}</div></>) : (<span className="text-xs text-red-400 italic py-1 block">Sin asignar</span>)}
                                            </td>
                                            <td className="px-4 py-3 align-top text-right">
                                                <div className="flex justify-end gap-1">
                                                    <button onClick={() => handleEditAssignment(projectKey, row.macro, row.proc, row.node)} className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition-colors" title="Editar Asignación"><Users size={16} /></button>
                                                    {canEdit && (
                                                        <button 
                                                            onClick={(e) => handleDelete(projectKey, row.macro, row.proc, row.node.docId, row.node.name, e)}
                                                            className="text-slate-400 hover:text-red-600 p-1.5 hover:bg-red-50 rounded transition-colors"
                                                            title="Eliminar Microproceso"
                                                            disabled={deletingIds.has(row.node.docId)}
                                                        >
                                                            {deletingIds.has(row.node.docId) ? <Loader2 size={16} className="animate-spin text-red-600" /> : <Trash2 size={16} />}
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            );
        })}
      </div>

      {showEditModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center"><h3 className="text-lg font-bold text-slate-800">Editar Asignación</h3><button onClick={() => setShowEditModal(false)}><X size={20} className="text-slate-400" /></button></div>
                <form onSubmit={handleSubmitAssignment} className="p-6">
                    <div className="mb-6 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 text-sm"><div className="grid grid-cols-3 gap-y-2"><span className="text-slate-500">Proyecto:</span> <span className="col-span-2 font-medium">{modalProject}</span><span className="text-slate-500 font-bold">Microproceso:</span> <span className="col-span-2 font-bold text-indigo-700">{modalMicro}</span></div></div>
                    <div className="space-y-4">
                        <div><label className="block text-sm font-medium text-slate-700 mb-2">Analistas Asignados</label><div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">{currentAssignees.length === 0 ? <p className="text-sm text-slate-400 italic text-center py-2">No hay asignados.</p> : currentAssignees.map(aid => { const u = allUsers.find(user => user.id === aid); return (<div key={aid} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100"><div className="flex items-center gap-2">{u && (u.avatar ? <img src={u.avatar} className="w-6 h-6 rounded-full" /> : <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center text-xs text-indigo-700 font-bold">{u.name.charAt(0)}</div>)}<span className="text-sm font-medium text-slate-700">{u ? u.name : `Desc. (${aid})`}</span></div><button type="button" onClick={() => handleRemoveAssignee(aid)} className="text-red-400 hover:text-red-600"><X size={16} /></button></div>); })}</div></div>
                        <div><label className="block text-sm font-medium text-slate-700 mb-1">Agregar Analista</label><select className="w-full p-2 border border-slate-300 rounded-lg text-sm outline-none" onChange={(e) => handleAddAssignee(e.target.value)} value=""><option value="">Seleccionar...</option>{allUsers.filter(u => u.role === UserRole.ANALYST && !currentAssignees.includes(u.id)).map(u => (<option key={u.id} value={u.id}>{u.name}</option>))}</select></div>
                    </div>
                    <div className="flex justify-end pt-6 gap-3"><button type="button" onClick={() => setShowEditModal(false)} className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium">Cancelar</button><button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm">Guardar Cambios</button></div>
                </form>
            </div>
          </div>
      )}
    </div>
  );
};

export default AdminAssignments;
