import React, { useState, useEffect } from 'react';
import { HierarchyService, UserService } from '../services/mockBackend';
import { Document, User, UserRole } from '../types';
import { 
  FolderTree, Search, ChevronRight, ChevronDown, UserPlus, X 
} from 'lucide-react';

interface Props {
  user: User; // Admin User
}

const AdminAssignments: React.FC<Props> = ({ user }) => {
  const [hierarchy, setHierarchy] = useState<any>({});
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
  const [modalAnalyst, setModalAnalyst] = useState('');
  const [existingMicroDocId, setExistingMicroDocId] = useState<string | null>(null);

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

  const handleOpenAssign = (
      proj?: string, macro?: string, proc?: string, microObj?: any
  ) => {
      setModalProject(proj || '');
      setModalMacro(macro || '');
      setModalProcess(proc || '');
      // If editing existing
      if (microObj) {
          setModalMicro(microObj.name);
          setExistingMicroDocId(microObj.docId);
          setModalAnalyst(''); // Reset selection
      } else {
          setModalMicro('');
          setExistingMicroDocId(null);
          setModalAnalyst('');
      }
      setShowModal(true);
  };

  const handleSubmitAssignment = async (e: React.FormEvent) => {
      e.preventDefault();
      if (!modalAnalyst || !existingMicroDocId) {
          // If no existing doc ID, in a real app we would create a new "Microprocess Node" here. 
          // For this mock, we assume we are only assigning to existing Initial Data Load rows.
          alert('Por favor selecciona un microproceso existente de la lista para asignar.');
          return;
      }

      try {
          await HierarchyService.updateMatrixAssignment(existingMicroDocId, modalAnalyst, user.id);
          setShowModal(false);
          await loadData();
      } catch (err: any) {
          alert(err.message);
      }
  };

  // Helper to filter hierarchy based on search
  // Doing a basic render-time filter for visualization
  const matchesSearch = (str: string) => str.toLowerCase().includes(searchTerm.toLowerCase());

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando matriz de procesos...</div>;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Matriz de Asignaciones</h1>
          <p className="text-slate-500">Visualiza y gestiona responsables por jerarquía de procesos.</p>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-64">
                <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input 
                    type="text" 
                    placeholder="Buscar proceso o responsable..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
            </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {Object.keys(hierarchy).map(projectKey => (
            <div key={projectKey} className="border-b border-slate-100 last:border-0">
                {/* Project Header */}
                <div 
                    onClick={() => toggleProject(projectKey)}
                    className="flex items-center justify-between p-4 bg-slate-50 hover:bg-slate-100 cursor-pointer transition-colors"
                >
                    <div className="flex items-center gap-2 font-bold text-slate-800">
                        {expandedProjects[projectKey] ? <ChevronDown size={20} /> : <ChevronRight size={20} />}
                        <FolderTree size={18} className="text-indigo-600" />
                        Proyecto {projectKey}
                    </div>
                </div>

                {/* Macro/Process Tree */}
                {expandedProjects[projectKey] && (
                    <div className="p-4 space-y-6">
                        {Object.keys(hierarchy[projectKey]).map(macroKey => (
                            <div key={macroKey} className="pl-2 border-l-2 border-slate-200">
                                <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide mb-3 pl-4 flex items-center">
                                    <span className="w-2 h-2 bg-slate-400 rounded-full mr-2"></span>
                                    {macroKey}
                                </h3>
                                
                                <div className="pl-4 space-y-4">
                                    {Object.keys(hierarchy[projectKey][macroKey]).map(processKey => (
                                        <div key={processKey} className="bg-white border border-slate-200 rounded-lg p-3 shadow-sm">
                                            <h4 className="text-sm font-semibold text-indigo-700 mb-2 border-b border-slate-100 pb-1">
                                                {processKey}
                                            </h4>
                                            
                                            <div className="grid grid-cols-1 gap-2">
                                                {hierarchy[projectKey][macroKey][processKey].map((microObj: any) => {
                                                    const isVisible = !searchTerm || 
                                                        matchesSearch(projectKey) || 
                                                        matchesSearch(macroKey) || 
                                                        matchesSearch(processKey) || 
                                                        matchesSearch(microObj.name) ||
                                                        microObj.assignees.some((aid: string) => {
                                                            const u = allUsers.find(u => u.id === aid);
                                                            return u && matchesSearch(u.name);
                                                        });

                                                    if (!isVisible) return null;

                                                    return (
                                                        <div key={microObj.docId} className="flex flex-col sm:flex-row sm:items-center justify-between text-sm p-2 hover:bg-slate-50 rounded group">
                                                            <div className="flex-1">
                                                                <span className="font-medium text-slate-800">{microObj.name}</span>
                                                            </div>
                                                            <div className="flex items-center gap-3 mt-2 sm:mt-0">
                                                                <div className="flex -space-x-2">
                                                                    {microObj.assignees.length > 0 ? microObj.assignees.map((aid: string) => {
                                                                        const u = allUsers.find(user => user.id === aid);
                                                                        return u ? (
                                                                            <div key={u.id} className="w-6 h-6 rounded-full border border-white bg-slate-200 overflow-hidden" title={u.name}>
                                                                                <img src={u.avatar} className="w-full h-full object-cover" />
                                                                            </div>
                                                                        ) : null;
                                                                    }) : (
                                                                        <span className="text-xs text-red-400 italic">Sin asignar</span>
                                                                    )}
                                                                </div>
                                                                <button 
                                                                    onClick={() => handleOpenAssign(projectKey, macroKey, processKey, microObj)}
                                                                    className="text-xs bg-white border border-indigo-200 text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded flex items-center gap-1 transition-colors"
                                                                >
                                                                    <UserPlus size={14} />
                                                                    Asignar
                                                                </button>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        ))}
      </div>

      {/* New Assignment Modal */}
      {showModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
                <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                    <h3 className="text-lg font-bold text-slate-800">Gestión de Asignación</h3>
                    <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={20} /></button>
                </div>
                
                <form onSubmit={handleSubmitAssignment} className="p-6 space-y-4">
                    <div className="bg-slate-50 p-4 rounded-lg text-sm space-y-2">
                        <div className="flex justify-between"><span className="text-slate-500">Proyecto:</span> <span className="font-medium">{modalProject}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Macro:</span> <span className="font-medium">{modalMacro}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Proceso:</span> <span className="font-medium">{modalProcess}</span></div>
                        <div className="flex justify-between border-t border-slate-200 pt-2"><span className="text-slate-500 font-bold">Microproceso:</span> <span className="font-bold text-indigo-700">{modalMicro}</span></div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Analista a Asignar / Agregar</label>
                        <select 
                            value={modalAnalyst}
                            onChange={(e) => setModalAnalyst(e.target.value)}
                            className="w-full p-2.5 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                            required
                        >
                            <option value="">Seleccione analista...</option>
                            {allUsers.map(u => (
                                <option key={u.id} value={u.id}>{u.name} ({u.role})</option>
                            ))}
                        </select>
                        <p className="text-xs text-slate-400 mt-1">
                            Nota: Esto agregará al analista a la lista de responsables de este microproceso.
                        </p>
                    </div>

                    <div className="flex justify-end pt-4">
                        <button 
                            type="button" 
                            onClick={() => setShowModal(false)}
                            className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium mr-2"
                        >
                            Cancelar
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 text-sm font-medium shadow-sm"
                        >
                            Guardar Asignación
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