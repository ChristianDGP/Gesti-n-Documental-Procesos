
import React, { useState, useEffect, useMemo } from 'react';
import { HierarchyService, generateMatrixId } from '../services/firebaseBackend';
import { FullHierarchy, ProcessNode, User, UserRole } from '../types';
import { 
  FolderTree, ChevronRight, ChevronDown, Plus, X, Edit, Trash2, Save, Layers, Network, FolderOpen, FileText, Loader2, Search, Eye, EyeOff, Power, FolderInput, ArrowRight, AlertTriangle
} from 'lucide-react';

interface Props {
    user: User;
}

const AdminHierarchy: React.FC<Props> = ({ user }) => {
  const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
  const [loading, setLoading] = useState(true);
  
  // Selection State
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [selectedMacro, setSelectedMacro] = useState<string | null>(null);
  const [selectedProcess, setSelectedProcess] = useState<string | null>(null);

  // Search State
  const [searchTerm, setSearchTerm] = useState('');

  // View Options
  const [showInactive, setShowInactive] = useState(false);

  // Modal State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addLevel, setAddLevel] = useState<'PROJECT' | 'MACRO' | 'PROCESS' | 'MICRO'>('PROJECT');
  const [newItemName, setNewItemName] = useState('');
  
  // Rename State
  const [renameMode, setRenameMode] = useState<{ level: string, oldName: string } | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Move Modal State
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [moveTarget, setMoveTarget] = useState<{ docId: string, name: string, currentProject: string, currentMacro: string, currentProcess: string } | null>(null);
  const [targetProject, setTargetProject] = useState('');
  const [targetMacro, setTargetMacro] = useState('');
  const [targetProcess, setTargetProcess] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const h = await HierarchyService.getFullHierarchy();
        setHierarchy(h);
    } catch (e) {
        console.error("Error loading hierarchy:", e);
    } finally {
        setLoading(false);
    }
  };

  // --- ACTIONS ---

  const handleAdd = (level: 'PROJECT' | 'MACRO' | 'PROCESS' | 'MICRO') => {
      setAddLevel(level);
      setNewItemName('');
      setShowAddModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!newItemName.trim()) return;
      
      try {
          let project = selectedProject || newItemName;
          let macro = selectedMacro || (addLevel === 'PROJECT' ? 'General' : newItemName);
          let process = selectedProcess || ((addLevel === 'PROJECT' || addLevel === 'MACRO') ? 'General' : newItemName);
          let micro = (addLevel === 'MICRO') ? newItemName : 'Inicio';
          
          if (addLevel === 'PROJECT') project = newItemName;
          if (addLevel === 'MACRO') macro = newItemName;
          if (addLevel === 'PROCESS') process = newItemName;

          await HierarchyService.addMicroprocess(project, macro, process, micro, [], ['AS IS', 'FCE', 'PM', 'TO BE']);
          
          setShowAddModal(false);
          await loadData();
          
          if (addLevel === 'PROJECT') setSelectedProject(newItemName);
          if (addLevel === 'MACRO') setSelectedMacro(newItemName);
          if (addLevel === 'PROCESS') setSelectedProcess(newItemName);
          
      } catch (err: any) {
          alert('Error: ' + err.message);
      }
  };

  const handleToggleStatus = async (id: string, name: string, currentStatus: boolean, e: React.MouseEvent) => {
      e.stopPropagation();
      // Soft delete confirmation
      const action = currentStatus ? "Inactivar" : "Reactivar";
      const confirmMsg = currentStatus 
        ? `¿Inactivar microproceso "${name}"?\nDejará de estar disponible para nuevos documentos, pero se conservará el historial.`
        : `¿Reactivar microproceso "${name}"?`;

      if (!window.confirm(confirmMsg)) return;

      try {
          await HierarchyService.toggleProcessStatus(id, currentStatus);
          await loadData(); // Reload to reflect changes
      } catch (e: any) {
          alert(`Error al ${action.toLowerCase()}: ` + e.message);
      }
  };

  // --- HARD DELETE MICROPROCESS (ADMIN ONLY) ---
  const handleHardDeleteMicro = async (id: string, name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      
      const confirmMsg = `⚠️ PELIGRO: Eliminación Permanente ⚠️\n\n¿Estás seguro de que deseas ELIMINAR definitivamente el microproceso "${name}"?\n\nEsta acción borrará el nodo de la estructura y romperá la relación con los documentos existentes.`;

      if (!window.confirm(confirmMsg)) return;

      // OPTIMISTIC UPDATE: Remove from UI immediately
      setHierarchy(prev => {
          const next = { ...prev };
          // Deep traversal to find and remove the node in local state
          Object.keys(next).forEach(proj => {
              Object.keys(next[proj]).forEach(macro => {
                  Object.keys(next[proj][macro]).forEach(proc => {
                      next[proj][macro][proc] = next[proj][macro][proc].filter(n => n.docId !== id);
                  });
              });
          });
          return next;
      });

      try {
          // No global loading spinner to keep the UI fluid, the item is already gone
          await HierarchyService.deleteMicroprocess(id);
          // Background sync to ensure consistency
          setTimeout(loadData, 500); 
      } catch (e: any) {
          alert("Error al eliminar: " + e.message);
          loadData(); // Revert on error
      }
  };

  // NEW: Delete logic for parent nodes
  const handleDeleteNode = async (level: 'PROJECT' | 'MACRO' | 'PROCESS', name: string, e: React.MouseEvent) => {
      e.stopPropagation();
      
      // Additional safety check on frontend
      if (user.role !== UserRole.ADMIN) {
          alert("Acción no permitida. Solo administradores.");
          return;
      }

      const warningMsg = `⚠️ ADVERTENCIA CRÍTICA ⚠️\n\nEstá a punto de eliminar el ${level}: "${name}".\n\nEsta acción ELIMINARÁ TODOS los datos contenidos en él (Macroprocesos, Procesos y Microprocesos). \n\n¿Está absolutamente seguro?`;
      
      if (!window.confirm(warningMsg)) return;

      try {
          setLoading(true);
          const parentContext = {
              project: selectedProject || undefined,
              macro: selectedMacro || undefined
          };
          
          await HierarchyService.deleteHierarchyNode(level, name, parentContext);
          
          // Clear selections if deleted
          if (level === 'PROJECT' && selectedProject === name) { setSelectedProject(null); setSelectedMacro(null); setSelectedProcess(null); }
          if (level === 'MACRO' && selectedMacro === name) { setSelectedMacro(null); setSelectedProcess(null); }
          if (level === 'PROCESS' && selectedProcess === name) { setSelectedProcess(null); }

          await loadData();
      } catch (err: any) {
          alert("Error al eliminar: " + err.message);
          setLoading(false);
      }
  };

  const handleRenameStart = (level: 'PROJECT' | 'MACRO' | 'PROCESS', oldName: string) => {
      setRenameMode({ level, oldName });
      setRenameValue(oldName);
  };

  const handleRenameSubmit = async () => {
      if (!renameMode || !renameValue.trim() || renameValue === renameMode.oldName) {
          setRenameMode(null);
          return;
      }

      if (!window.confirm(`¿Renombrar "${renameMode.oldName}" a "${renameValue}"?\nEsto actualizará TODOS los microprocesos contenidos en esta carpeta.`)) return;

      try {
          setLoading(true);
          const parentContext = {
              project: selectedProject || undefined,
              macro: selectedMacro || undefined
          };
          
          await HierarchyService.updateHierarchyNode(
              renameMode.level as any, 
              renameMode.oldName, 
              renameValue, 
              parentContext
          );
          
          if (renameMode.level === 'PROJECT' && selectedProject === renameMode.oldName) setSelectedProject(renameValue);
          if (renameMode.level === 'MACRO' && selectedMacro === renameMode.oldName) setSelectedMacro(renameValue);
          if (renameMode.level === 'PROCESS' && selectedProcess === renameMode.oldName) setSelectedProcess(renameValue);

          setRenameMode(null);
          await loadData();
      } catch (e: any) {
          alert('Error al renombrar: ' + e.message);
          setLoading(false);
      }
  };

  // --- MOVE / RELOCATE LOGIC ---
  const handleMoveStart = (micro: ProcessNode, e: React.MouseEvent) => {
      e.stopPropagation();
      setMoveTarget({
          docId: micro.docId,
          name: micro.name,
          currentProject: selectedProject || '',
          currentMacro: selectedMacro || '',
          currentProcess: selectedProcess || ''
      });
      // Pre-fill current values or defaults
      setTargetProject(selectedProject || '');
      setTargetMacro(selectedMacro || '');
      setTargetProcess(selectedProcess || '');
      setShowMoveModal(true);
  };

  const handleMoveSubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!moveTarget || !targetProject || !targetMacro || !targetProcess) return;

      // Verification
      if (targetProject === moveTarget.currentProject && targetMacro === moveTarget.currentMacro && targetProcess === moveTarget.currentProcess) {
          alert("El destino es el mismo que el origen. No se realizaron cambios.");
          setShowMoveModal(false);
          return;
      }

      try {
          setLoading(true);
          await HierarchyService.moveMicroprocess(moveTarget.docId, targetProject, targetMacro, targetProcess);
          setShowMoveModal(false);
          await loadData();
      } catch (err: any) {
          alert('Error al reubicar: ' + err.message);
      } finally {
          setLoading(false);
      }
  };

  // --- MEMOIZED FLATTENED LIST FOR SEARCH ---
  const flatNodes = useMemo(() => {
      const list: { 
          project: string, macro: string, process: string, micro: ProcessNode, path: string 
      }[] = [];

      Object.keys(hierarchy).forEach(proj => {
          Object.keys(hierarchy[proj]).forEach(macro => {
              Object.keys(hierarchy[proj][macro]).forEach(proc => {
                  hierarchy[proj][macro][proc].forEach(node => {
                      if (!showInactive && node.active === false) return;
                      list.push({
                          project: proj,
                          macro: macro,
                          process: proc,
                          micro: node,
                          path: `${proj} > ${macro} > ${proc} > ${node.name}`
                      });
                  });
              });
          });
      });
      return list;
  }, [hierarchy, showInactive]);

  const searchResults = useMemo(() => {
      if (!searchTerm) return [];
      const lower = searchTerm.toLowerCase();
      return flatNodes.filter(item => 
          item.path.toLowerCase().includes(lower) || 
          item.micro.name.toLowerCase().includes(lower)
      );
  }, [searchTerm, flatNodes]);


  // --- RENDER HELPERS ---

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Cargando estructura...</div>;

  // Data Pointers (Standard Column View)
  const projects = Object.keys(hierarchy).sort();
  const macros = selectedProject && hierarchy[selectedProject] ? Object.keys(hierarchy[selectedProject]).sort() : [];
  const processes = selectedProject && selectedMacro && hierarchy[selectedProject][selectedMacro] ? Object.keys(hierarchy[selectedProject][selectedMacro]).sort() : [];
  
  const micros = selectedProject && selectedMacro && selectedProcess && hierarchy[selectedProject][selectedMacro][selectedProcess] 
      ? hierarchy[selectedProject][selectedMacro][selectedProcess] 
      : [];
  
  // Filter micros for the Column View
  const columnMicros = micros.filter(m => showInactive || m.active !== false);

  // Helper for Move Modal Options
  const availableMacros = targetProject && hierarchy[targetProject] ? Object.keys(hierarchy[targetProject]) : [];
  const availableProcesses = targetProject && targetMacro && hierarchy[targetProject][targetMacro] ? Object.keys(hierarchy[targetProject][targetMacro]) : [];


  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2"><Network className="text-indigo-600" /> Mantenedor de Estructura</h1>
          <p className="text-slate-500">Definición jerárquica de Proyectos, Macros y Procesos.</p>
        </div>
        
        <div className="flex items-center gap-3 w-full md:w-auto">
            {/* Show Inactive Toggle */}
            <button 
                onClick={() => setShowInactive(!showInactive)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-colors border ${
                    showInactive ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-500 border-slate-300'
                }`}
            >
                {showInactive ? <Eye size={14} /> : <EyeOff size={14} />}
                {showInactive ? 'Ocultar Inactivos' : 'Ver Inactivos'}
            </button>

            {/* SEARCH INPUT */}
            <div className="relative w-full md:w-64">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar en toda la estructura..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                {searchTerm && (
                    <button 
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
        </div>
      </div>

      {/* CONDITIONAL RENDERING: SEARCH MODE VS COLUMN MODE */}
      {searchTerm ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <h3 className="font-bold text-slate-700">Resultados de Búsqueda</h3>
                  <span className="text-xs text-slate-500">{searchResults.length} coincidencias</span>
              </div>
              <div className="overflow-x-auto">
                  <table className="w-full text-sm text-left">
                      <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                          <tr>
                              <th className="px-4 py-3">Ruta (Breadcrumb)</th>
                              <th className="px-4 py-3">Microproceso</th>
                              <th className="px-4 py-3">Estado</th>
                              <th className="px-4 py-3 text-right">Acciones</th>
                          </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                          {searchResults.map((item) => (
                              <tr key={item.micro.docId} className="hover:bg-slate-50">
                                  <td className="px-4 py-3 text-slate-500">
                                      <div className="flex items-center gap-1 text-xs">
                                          <span className="font-bold text-slate-700">{item.project}</span>
                                          <ChevronRight size={12} />
                                          <span>{item.macro}</span>
                                          <ChevronRight size={12} />
                                          <span>{item.process}</span>
                                      </div>
                                  </td>
                                  <td className="px-4 py-3 font-medium text-slate-800">
                                      {item.micro.name}
                                  </td>
                                  <td className="px-4 py-3">
                                      {item.micro.active !== false ? (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-green-100 text-green-700">Activo</span>
                                      ) : (
                                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">Inactivo</span>
                                      )}
                                  </td>
                                  <td className="px-4 py-3 text-right flex justify-end gap-1">
                                      <button 
                                          onClick={(e) => handleToggleStatus(item.micro.docId, item.micro.name, item.micro.active !== false, e)} 
                                          className={`p-1.5 rounded transition-colors ${
                                              item.micro.active !== false ? 'text-slate-400 hover:text-red-500 hover:bg-red-50' : 'text-slate-400 hover:text-green-600 hover:bg-green-50'
                                          }`}
                                          title={item.micro.active !== false ? "Inactivar" : "Reactivar"}
                                      >
                                          <Power size={16} />
                                      </button>
                                      
                                      {user.role === UserRole.ADMIN && (
                                          <button 
                                              onClick={(e) => handleHardDeleteMicro(item.micro.docId, item.micro.name, e)}
                                              className="p-1.5 rounded text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                              title="Eliminar Definitivamente"
                                          >
                                              <Trash2 size={16} />
                                          </button>
                                      )}
                                  </td>
                              </tr>
                          ))}
                          {searchResults.length === 0 && (
                              <tr><td colSpan={4} className="p-8 text-center text-slate-400">No se encontraron resultados para "{searchTerm}"</td></tr>
                          )}
                      </tbody>
                  </table>
              </div>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 h-[calc(100vh-220px)]">
              {/* STANDARD COLUMN VIEW (SAME AS BEFORE BUT WITH SOFT DELETE BUTTON) */}
              
              {/* COLUMN 1: PROJECTS */}
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Proyectos</h3>
                      <button onClick={() => handleAdd('PROJECT')} className="p-1 hover:bg-indigo-100 text-indigo-600 rounded" title="Nuevo Proyecto"><Plus size={16}/></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {projects.map(p => (
                          <div 
                            key={p} 
                            onClick={() => { setSelectedProject(p); setSelectedMacro(null); setSelectedProcess(null); }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-sm transition-colors group
                                ${selectedProject === p ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                          >
                              <div className="flex items-center gap-2 truncate">
                                  <FolderTree size={16} className={selectedProject === p ? 'text-indigo-500' : 'text-slate-400'} />
                                  <span className="truncate">{p}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={(e) => { e.stopPropagation(); handleRenameStart('PROJECT', p); }} className="text-slate-400 hover:text-indigo-600 p-1"><Edit size={12}/></button>
                                  {user.role === UserRole.ADMIN && (
                                      <button onClick={(e) => handleDeleteNode('PROJECT', p, e)} className="text-slate-400 hover:text-red-600 p-1" title="Eliminar Proyecto"><Trash2 size={12}/></button>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* COLUMN 2: MACROS */}
              <div className={`bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden ${!selectedProject ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Macroprocesos</h3>
                      {selectedProject && <button onClick={() => handleAdd('MACRO')} className="p-1 hover:bg-indigo-100 text-indigo-600 rounded" title="Nueva Macro"><Plus size={16}/></button>}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {macros.length === 0 && <p className="text-xs text-slate-400 text-center py-4 italic">Sin elementos</p>}
                      {macros.map(m => (
                          <div 
                            key={m} 
                            onClick={() => { setSelectedMacro(m); setSelectedProcess(null); }}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-sm transition-colors group
                                ${selectedMacro === m ? 'bg-blue-50 text-blue-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                          >
                              <div className="flex items-center gap-2 truncate">
                                  <FolderOpen size={16} className={selectedMacro === m ? 'text-blue-500' : 'text-slate-400'} />
                                  <span className="truncate">{m}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={(e) => { e.stopPropagation(); handleRenameStart('MACRO', m); }} className="text-slate-400 hover:text-blue-600 p-1"><Edit size={12}/></button>
                                  {user.role === UserRole.ADMIN && (
                                      <button onClick={(e) => handleDeleteNode('MACRO', m, e)} className="text-slate-400 hover:text-red-600 p-1" title="Eliminar Macro"><Trash2 size={12}/></button>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* COLUMN 3: PROCESSES */}
              <div className={`bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden ${!selectedMacro ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Procesos</h3>
                      {selectedMacro && <button onClick={() => handleAdd('PROCESS')} className="p-1 hover:bg-indigo-100 text-indigo-600 rounded" title="Nuevo Proceso"><Plus size={16}/></button>}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {processes.length === 0 && <p className="text-xs text-slate-400 text-center py-4 italic">Sin elementos</p>}
                      {processes.map(proc => (
                          <div 
                            key={proc} 
                            onClick={() => setSelectedProcess(proc)}
                            className={`flex items-center justify-between p-2 rounded-lg cursor-pointer text-sm transition-colors group
                                ${selectedProcess === proc ? 'bg-purple-50 text-purple-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                          >
                              <div className="flex items-center gap-2 truncate">
                                  <Layers size={16} className={selectedProcess === proc ? 'text-purple-500' : 'text-slate-400'} />
                                  <span className="truncate">{proc}</span>
                              </div>
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={(e) => { e.stopPropagation(); handleRenameStart('PROCESS', proc); }} className="text-slate-400 hover:text-purple-600 p-1"><Edit size={12}/></button>
                                  {user.role === UserRole.ADMIN && (
                                      <button onClick={(e) => handleDeleteNode('PROCESS', proc, e)} className="text-slate-400 hover:text-red-600 p-1" title="Eliminar Proceso"><Trash2 size={12}/></button>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>

              {/* COLUMN 4: MICROPROCESSES (LEAVES) */}
              <div className={`bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden ${!selectedProcess ? 'opacity-50 pointer-events-none' : ''}`}>
                  <div className="p-3 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-700 text-xs uppercase tracking-wide">Microprocesos</h3>
                      {selectedProcess && <button onClick={() => handleAdd('MICRO')} className="p-1 hover:bg-indigo-100 text-indigo-600 rounded" title="Nuevo Microproceso"><Plus size={16}/></button>}
                  </div>
                  <div className="flex-1 overflow-y-auto p-2 space-y-1">
                      {columnMicros.length === 0 && <p className="text-xs text-slate-400 text-center py-4 italic">Sin elementos</p>}
                      {columnMicros.map(micro => (
                          <div 
                            key={micro.docId} 
                            className={`flex items-center justify-between p-2 rounded-lg text-sm bg-white border group transition-all ${
                                micro.active === false ? 'border-slate-100 bg-slate-50 text-slate-400 italic' : 'border-slate-100 hover:border-slate-300'
                            }`}
                          >
                              <div className="flex items-center gap-2 truncate">
                                  <FileText size={14} className={micro.active === false ? 'text-slate-300' : 'text-slate-400'} />
                                  <span className="truncate font-medium">{micro.name}</span>
                              </div>
                              
                              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                  {/* MOVE BUTTON */}
                                  <button 
                                    onClick={(e) => handleMoveStart(micro, e)}
                                    className="text-slate-400 hover:text-indigo-600 p-1 hover:bg-indigo-50 rounded"
                                    title="Reubicar (Mover)"
                                  >
                                      <FolderInput size={14} />
                                  </button>
                                  
                                  {/* TOGGLE ACTIVE BUTTON */}
                                  <button 
                                    onClick={(e) => handleToggleStatus(micro.docId, micro.name, micro.active !== false, e)} 
                                    className={`p-1 rounded transition-colors ${
                                        micro.active === false ? 'text-slate-300 hover:text-green-600 hover:bg-green-50' : 'text-slate-300 hover:text-red-500 hover:bg-red-50'
                                    }`}
                                    title={micro.active === false ? "Reactivar" : "Inactivar"}
                                  >
                                      <Power size={14}/>
                                  </button>

                                  {/* HARD DELETE BUTTON (ADMIN ONLY) */}
                                  {user.role === UserRole.ADMIN && (
                                      <button 
                                          onClick={(e) => handleHardDeleteMicro(micro.docId, micro.name, e)}
                                          className="p-1 rounded text-slate-300 hover:text-red-600 hover:bg-red-50 transition-colors"
                                          title="Eliminar Definitivamente"
                                      >
                                          <Trash2 size={14} />
                                      </button>
                                  )}
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          </div>
      )}

      {/* MODAL ADD */}
      {showAddModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Agregar {addLevel}</h3>
                    <button onClick={() => setShowAddModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <form onSubmit={handleCreateSubmit} className="p-6">
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nombre del {addLevel}</label>
                    <input 
                        autoFocus
                        type="text" 
                        value={newItemName}
                        onChange={(e) => setNewItemName(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                        placeholder={`Ingrese nombre para nuevo ${addLevel.toLowerCase()}...`}
                    />
                    <div className="flex justify-end gap-2 mt-6">
                        <button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded text-sm">Cancelar</button>
                        <button type="submit" className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700">Crear</button>
                    </div>
                </form>
            </div>
          </div>
      )}

      {/* MODAL RENAME */}
      {renameMode && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                    <h3 className="font-bold text-slate-800">Renombrar {renameMode.level}</h3>
                    <button onClick={() => setRenameMode(null)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                </div>
                <div className="p-6">
                    <p className="text-xs text-amber-600 bg-amber-50 p-2 rounded mb-4 border border-amber-100">
                        Atención: Esto actualizará todas las referencias en la base de datos.
                    </p>
                    <label className="block text-sm font-medium text-slate-700 mb-2">Nuevo Nombre</label>
                    <input 
                        autoFocus
                        type="text" 
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <div className="flex justify-end gap-2 mt-6">
                        <button onClick={() => setRenameMode(null)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded text-sm">Cancelar</button>
                        <button onClick={handleRenameSubmit} className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700">Guardar Cambios</button>
                    </div>
                </div>
            </div>
          </div>
      )}

      {/* MODAL MOVE (RELOCATE) */}
      {showMoveModal && moveTarget && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                  <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
                      <h3 className="font-bold text-slate-800 flex items-center gap-2">
                          <FolderInput size={20} className="text-indigo-600"/>
                          Reubicar Microproceso
                      </h3>
                      <button onClick={() => setShowMoveModal(false)}><X size={20} className="text-slate-400 hover:text-slate-600"/></button>
                  </div>
                  
                  <form onSubmit={handleMoveSubmit} className="p-6">
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-100 mb-6 text-sm">
                          <span className="text-slate-500">Moviendo:</span> 
                          <span className="font-bold text-slate-800 ml-2">{moveTarget.name}</span>
                          <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                              <span>Desde:</span>
                              <span className="bg-white px-2 py-0.5 rounded border">{moveTarget.currentProject}</span>
                              <ChevronRight size={12}/>
                              <span className="bg-white px-2 py-0.5 rounded border">{moveTarget.currentMacro}</span>
                              <ChevronRight size={12}/>
                              <span className="bg-white px-2 py-0.5 rounded border">{moveTarget.currentProcess}</span>
                          </div>
                      </div>

                      <div className="space-y-4">
                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Proyecto Destino</label>
                              <select 
                                  value={targetProject}
                                  onChange={(e) => {
                                      setTargetProject(e.target.value);
                                      setTargetMacro(''); // Reset downstream
                                      setTargetProcess('');
                                  }}
                                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                              >
                                  {Object.keys(hierarchy).map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Macroproceso Destino</label>
                              <select 
                                  value={targetMacro}
                                  onChange={(e) => {
                                      setTargetMacro(e.target.value);
                                      setTargetProcess('');
                                  }}
                                  disabled={!targetProject}
                                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                  <option value="">-- Seleccionar --</option>
                                  {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
                              </select>
                          </div>

                          <div>
                              <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Proceso Destino</label>
                              <select 
                                  value={targetProcess}
                                  onChange={(e) => setTargetProcess(e.target.value)}
                                  disabled={!targetMacro}
                                  className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                              >
                                  <option value="">-- Seleccionar --</option>
                                  {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                              </select>
                          </div>
                      </div>

                      <div className="flex justify-end gap-2 mt-8">
                          <button type="button" onClick={() => setShowMoveModal(false)} className="px-4 py-2 text-slate-600 hover:bg-slate-50 rounded text-sm font-medium">Cancelar</button>
                          <button 
                            type="submit" 
                            disabled={!targetProcess || loading}
                            className="px-4 py-2 bg-indigo-600 text-white rounded text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                          >
                             {loading && <Loader2 size={14} className="animate-spin"/>}
                             Confirmar Reubicación
                          </button>
                      </div>
                  </form>
              </div>
          </div>
      )}

    </div>
  );
};

export default AdminHierarchy;
