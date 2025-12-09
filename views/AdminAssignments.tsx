
import React, { useState, useEffect } from 'react';
import { HierarchyService, UserService } from '../services/mockBackend';
import { User, UserRole, FullHierarchy, ProcessNode, DocType } from '../types';
import { 
  FolderTree, Search, ChevronRight, ChevronDown, UserPlus, X, Edit, Trash2, FileText
} from 'lucide-react';

interface Props {
  user: User; // Admin User
}

const AdminAssignments: React.FC<Props> = ({ user }) => {
  const [hierarchy, setHierarchy] = useState<FullHierarchy>({});
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({ 'HPC': true, 'HSR': true });

  // Modal State
  const [showModal, setShowModal] = useState(false);
  const [modalProject, setModalProject] = useState('');
  const [modalMacro, setModalMacro] = useState('');
  const [modalProcess, setModalProcess] = useState('');
  const [modalMicro, setModalMicro] = useState('');
  const [currentAssignees, setCurrentAssignees] = useState<string[]>([]);
  const [matrixKeyToUpdate, setMatrixKeyToUpdate] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [h, u] = await Promise.all([
      HierarchyService.getFullHierarchy(),
      UserService.getAll()
    ]);
    setHierarchy(h);
    setAllUsers(u.filter(usr => usr.role === UserRole.ANALYST));
    setLoading(false);
  };

  const toggleProject = (proj: string) => {
    setExpandedProjects(prev => ({ ...prev, [proj]: !prev[proj] }));
  };

  const handleEditAssignment = (
      proj: string, macro: string, proc: string, microObj: ProcessNode
  ) => {
      setModalProject(proj);
      setModalMacro(macro);
      setModalProcess(proc);
      setModalMicro(microObj.name);
      setMatrixKeyToUpdate(microObj.docId);
      setCurrentAssignees([...microObj.assignees]); // Copy
      setShowModal(true);
  };

  const handleAddAssignee = (userId: string) => {
      if (!userId) return;
      if (!currentAssignees.includes(userId)) {
          setCurrentAssignees([...currentAssignees, userId]);
      }
  };

  const handleRemoveAssignee = (userId: string) => {
      setCurrentAssignees(currentAssignees.filter(id => id !== userId));
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!matrixKeyToUpdate) return;

      try {
          await HierarchyService.updateMatrixAssignment(matrixKeyToUpdate, currentAssignees, user.id);
          setShowModal(false);
          await loadData(); // Reload to reflect changes
      } catch (err: any) {
          alert(err.message);
      }
  };

  // Render Badge Helper
  const getTypeColor = (type: DocType) => {
      switch(type) {
          case 'AS IS': return 'bg-blue-100 text-blue-700 border-blue-200';
          case 'FCE': return 'bg-purple-100 text-purple-700 border-purple-200';
          case 'PM': return 'bg-amber-100 text-amber-700 border-amber-200';
          case 'TO BE': return 'bg-green-100 text-green-700 border-green-200';
          default: return 'bg-gray-100 text-gray-700';
      }
  };

  // Flattened Data for Table View within Project
  const getFlattenedRows = (project: string) => {
      const rows: any[] = [];
      const macros = hierarchy[project] || {};
      
      Object.keys(macros).forEach(macro => {
          Object.keys(macros[macro]).forEach(proc => {
              const nodes = macros[macro][proc];
              nodes.forEach(node => {
                  if (searchTerm) {
                      const searchLower = searchTerm.toLowerCase();
                      const match = 
                        macro.toLowerCase().includes(searchLower) ||
                        proc.toLowerCase().includes(searchLower) ||
                        node.name.toLowerCase().includes(searchLower) ||
                        node.assignees.some(aid => allUsers.find(u => u.id === aid)?.name.toLowerCase().includes(searchLower));
                      if (!match) return;
                  }
                  rows.push({ macro, proc, node });
              });
          });
      });
      return rows;
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando matriz de procesos...</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Matriz de Asignaciones</h1>
          <p className="text-slate-500">Gestione los responsables y vea los documentos requeridos por microproceso.</p>
        </div>
        <div className="relative w-full md:w-72">
            <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
                type="text" 
                placeholder="Buscar proceso, documento o analista..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
            />
        </div>
      </div>

      <div className="space-y-4">
        {Object.keys(hierarchy).map(projectKey => {
            const rows = getFlattenedRows(projectKey);
            if (rows.length === 0 && searchTerm) return null;

            return (
                <div key={projectKey} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                    {/* Project Header */}
                    <div 
                        onClick={() => toggleProject(projectKey)}
                        className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors border-b border-slate-200"
                    >
                        <div className="flex items-center gap-2 font-bold text-slate-800 text-lg">
                            {expandedProjects[projectKey] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                            <FolderTree size={20} className="text-indigo-600" />
                            Proyecto {projectKey}
                        </div>
                        <span className="text-xs text-slate-500 font-medium bg-white px-2 py-1 rounded border border-slate-200">
                            {rows.length} Microprocesos
                        </span>
                    </div>

                    {/* Table View */}
                    {expandedProjects[projectKey] && (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="text-xs text-slate-500 uppercase bg-slate-50/50">
                                    <tr>
                                        <th className="px-4 py-3 w-1/4">Jerarquía (Macro / Proceso)</th>
                                        <th className="px-4 py-3 w-1/4">Microproceso</th>
                                        <th className="px-4 py-3 w-1/5">Documentos Definidos</th>
                                        <th className="px-4 py-3 w-1/4">Analistas Responsables</th>
                                        <th className="px-4 py-3 text-right">Acción</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {rows.map((row, idx) => (
                                        <tr key={`${row.node.docId}-${idx}`} className="hover:bg-slate-50 transition-colors">
                                            {/* Jerarquía */}
                                            <td className="px-4 py-3 align-top text-slate-600">
                                                <div className="font-semibold text-xs text-slate-700 mb-0.5">{row.macro}</div>
                                                <div className="text-xs text-slate-500 pl-2 border-l-2 border-slate-200">{row.proc}</div>
                                            </td>
                                            
                                            {/* Microproceso */}
                                            <td className="px-4 py-3 align-top">
                                                <span className="font-medium text-slate-900">{row.node.name}</span>
                                            </td>

                                            {/* Documentos */}
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex flex-wrap gap-1">
                                                    {row.node.requiredTypes && row.node.requiredTypes.length > 0 ? (
                                                        row.node.requiredTypes.map((t: DocType) => (
                                                            <span key={t} className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${getTypeColor(t)}`}>
                                                                {t}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="text-xs text-slate-400 italic">No definidos</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Analistas */}
                                            <td className="px-4 py-3 align-top">
                                                <div className="flex -space-x-2 overflow-hidden py-1">
                                                    {row.node.assignees.length > 0 ? row.node.assignees.map((aid: string) => {
                                                        const u = allUsers.find(user => user.id === aid);
                                                        return u ? (
                                                            <img 
                                                                key={u.id} 
                                                                src={u.avatar} 
                                                                className="inline-block h-6 w-6 rounded-full ring-2 ring-white" 
                                                                title={u.name}
                                                            />
                                                        ) : null;
                                                    }) : (
                                                        <span className="text-xs text-red-400 italic py-1">Sin asignar</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-slate-500 mt-1 truncate">
                                                     {row.node.assignees.map((aid: string) => allUsers.find(u => u.id === aid)?.name).join(', ')}
                                                </div>
                                            </td>

                                            {/* Acciones */}
                                            <td className="px-4 py-3 align-top text-right">
                                                <button 
                                                    onClick={() => handleEditAssignment(projectKey, row.macro, row.proc, row.node)}
                                                    className="text-slate-400 hover:text-indigo-600 p-1.5 hover:bg-indigo-50 rounded transition-colors"
                                                    title="Editar Asignación"
                                                >
                                                    <Edit size={16} />
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                    {rows.length === 0 && (
                                        <tr><td colSpan={5} className="p-4 text-center text-slate-400 text-sm">No se encontraron resultados en este proyecto.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            );
        })}
      </div>

      {/* Edit Assignment Modal */}
      {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
                <div className="p-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">Editar Asignación</h3>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                
                <form onSubmit={handleSubmitAssignment} className="p-6">
                    <div className="mb-6 bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 text-sm">
                        <div className="grid grid-cols-3 gap-y-2">
                             <span className="text-slate-500">Proyecto:</span> <span className="col-span-2 font-medium">{modalProject}</span>
                             <span className="text-slate-500">Proceso:</span> <span className="col-span-2 font-medium">{modalProcess}</span>
                             <span className="text-slate-500 font-bold">Microproceso:</span> <span className="col-span-2 font-bold text-indigo-700">{modalMicro}</span>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">Analistas Asignados</label>
                            <div className="space-y-2 max-h-40 overflow-y-auto border border-slate-200 rounded-lg p-2">
                                {currentAssignees.length === 0 ? (
                                    <p className="text-sm text-slate-400 italic text-center py-2">No hay analistas asignados.</p>
                                ) : (
                                    currentAssignees.map(aid => {
                                        const u = allUsers.find(user => user.id === aid);
                                        return u ? (
                                            <div key={aid} className="flex items-center justify-between p-2 bg-slate-50 rounded border border-slate-100">
                                                <div className="flex items-center gap-2">
                                                    <img src={u.avatar} className="w-6 h-6 rounded-full" />
                                                    <span className="text-sm font-medium text-slate-700">{u.name}</span>
                                                </div>
                                                <button type="button" onClick={() => handleRemoveAssignee(aid)} className="text-red-400 hover:text-red-600">
                                                    <X size={16} />
                                                </button>
                                            </div>
                                        ) : null;
                                    })
                                )}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Agregar Analista</label>
                            <div className="flex gap-2">
                                <select 
                                    className="flex-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                    onChange={(e) => handleAddAssignee(e.target.value)}
                                    value=""
                                >
                                    <option value="">Seleccionar analista para agregar...</option>
                                    {allUsers
                                        .filter(u => !currentAssignees.includes(u.id))
                                        .map(u => (
                                            <option key={u.id} value={u.id}>{u.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-6 gap-3">
                        <button 
                            type="button" 
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm"
                        >
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>
          </div>
      )}
    </div>
  );
};

export default AdminAssignments;
