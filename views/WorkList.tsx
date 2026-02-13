
import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService, HierarchyService, formatVersionForDisplay } from '../services/firebaseBackend';
import { Document, User, DocState, UserRole, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
  Filter, ArrowRight, Calendar, ListTodo, Activity, FileText, 
  Search, ArrowUp, ArrowDown, ArrowUpDown, X, AlertTriangle, 
  Layers, Network, FolderTree, ChevronDown 
} from 'lucide-react';

interface Props {
  user: User;
}

type SortOption = 'microprocess' | 'state' | 'updatedAt';

const WorkList: React.FC<Props> = ({ user }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Filtros de Búsqueda
  const [filterProject, setFilterProject] = useState('');
  const [filterMacro, setFilterMacro] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterState, setFilterState] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Ordenamiento
  const [sortConfig, setSortConfig] = useState<{ key: SortOption; direction: 'asc' | 'desc' }>({
    key: 'updatedAt',
    direction: 'desc'
  });

  useEffect(() => {
    loadData();
  }, []);

  const normalize = (str: string | undefined) => {
      if (!str) return '';
      return str.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const loadData = async () => {
    setLoading(true);
    try {
        const [realDocsData, hierarchy] = await Promise.all([
            DocumentService.getAll(),
            HierarchyService.getFullHierarchy()
        ]);
        
        const realDocMap = new Map<string, Document>();
        realDocsData.forEach(doc => {
            if (doc.project && (doc.microprocess || doc.title)) {
                const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
                const docType = doc.docType || 'AS IS';
                const key = `${normalize(doc.project)}|${normalize(microName)}|${normalize(docType)}`;
                
                const existing = realDocMap.get(key);
                if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                    realDocMap.set(key, { ...doc, microprocess: microName, docType: docType as DocType });
                }
            }
        });

        const myWorkList: Document[] = [];
        const hierarchyKeys = Object.keys(hierarchy);
        const isCoordOrAdmin = user.role === UserRole.COORDINATOR || user.role === UserRole.ADMIN;
        const reviewStates = [
            DocState.INTERNAL_REVIEW, 
            DocState.SENT_TO_REFERENT, 
            DocState.REFERENT_REVIEW, 
            DocState.SENT_TO_CONTROL, 
            DocState.CONTROL_REVIEW
        ];

        hierarchyKeys.forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    const nodes = hierarchy[proj][macro][proc];
                    nodes.forEach(node => {
                        if (node.active === false) return; 

                        const requiredTypes = (node.requiredTypes && node.requiredTypes.length > 0) 
                            ? node.requiredTypes 
                            : ['AS IS', 'FCE', 'PM', 'TO BE'];

                        requiredTypes.forEach(type => {
                            const key = `${normalize(proj)}|${normalize(node.name)}|${normalize(type)}`;
                            
                            if (realDocMap.has(key)) {
                                const realDoc = realDocMap.get(key)!;
                                const isAssigned = node.assignees && node.assignees.includes(user.id);
                                const isPendingReview = isCoordOrAdmin && reviewStates.includes(realDoc.state);

                                if ((isAssigned || isPendingReview) && realDoc.state !== DocState.APPROVED) {
                                    myWorkList.push({
                                        ...realDoc,
                                        macroprocess: macro,
                                        process: proc,
                                        project: proj,
                                        assignees: node.assignees
                                    });
                                }
                            } else {
                                const isAssigned = node.assignees && node.assignees.includes(user.id);
                                if (isAssigned) {
                                    myWorkList.push({
                                        id: `virtual-${key}-${Date.now()}`,
                                        title: `${node.name} - ${type}`,
                                        description: 'Pendiente de inicio',
                                        project: proj,
                                        macroprocess: macro,
                                        process: proc,
                                        microprocess: node.name,
                                        docType: type as DocType,
                                        authorId: '',
                                        authorName: '',
                                        assignedTo: user.id,
                                        assignees: node.assignees,
                                        state: DocState.NOT_STARTED,
                                        version: '-',
                                        progress: 0,
                                        files: [],
                                        createdAt: new Date().toISOString(),
                                        updatedAt: new Date(0).toISOString(), 
                                        hasPendingRequest: false
                                    });
                                }
                            }
                        });
                    });
                });
            });
        });

        setDocs(myWorkList);
    } catch (error) {
        console.error("Error loading work list:", error);
    } finally {
        setLoading(false);
    }
  };

  const availableProjects = useMemo(() => Array.from(new Set(docs.map(d => d.project).filter(Boolean))).sort(), [docs]);
  const availableMacros = useMemo(() => {
    let list = docs;
    if (filterProject) list = list.filter(d => d.project === filterProject);
    return Array.from(new Set(list.map(d => d.macroprocess).filter(Boolean))).sort();
  }, [docs, filterProject]);
  const availableProcesses = useMemo(() => {
    let list = docs;
    if (filterProject) list = list.filter(d => d.project === filterProject);
    if (filterMacro) list = list.filter(d => d.macroprocess === filterMacro);
    return Array.from(new Set(list.map(d => d.process).filter(Boolean))).sort();
  }, [docs, filterProject, filterMacro]);

  const processedDocs = useMemo(() => {
      let filtered = [...docs];
      if (filterProject) filtered = filtered.filter(d => d.project === filterProject);
      if (filterMacro) filtered = filtered.filter(d => d.macroprocess === filterMacro);
      if (filterProcess) filtered = filtered.filter(d => d.process === filterProcess);
      if (filterState) filtered = filtered.filter(d => d.state === filterState);
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          filtered = filtered.filter(d => 
              (d.project || '').toLowerCase().includes(lowerTerm) ||
              (d.microprocess || '').toLowerCase().includes(lowerTerm) ||
              (d.title || '').toLowerCase().includes(lowerTerm)
          );
      }
      return filtered.sort((a, b) => {
          const modifier = sortConfig.direction === 'asc' ? 1 : -1;
          switch (sortConfig.key) {
              case 'microprocess': return (a.microprocess || '').localeCompare(b.microprocess || '') * modifier;
              case 'state': return ((STATE_CONFIG[a.state]?.progress || 0) - (STATE_CONFIG[b.state]?.progress || 0)) * modifier;
              case 'updatedAt': return (new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()) * modifier;
              default: return 0;
          }
      });
  }, [docs, filterProject, filterMacro, filterProcess, filterState, searchTerm, sortConfig]);

  const handleSort = (key: SortOption) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
      setSortConfig({ key, direction });
  };

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Activity className="animate-spin mb-2" />Cargando lista de trabajo...</div>;

  return (
    <div className="space-y-6 pb-20 animate-fadeIn">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
                <ListTodo className="text-indigo-600" size={28} />
                Lista de Trabajo
            </h1>
            <p className="text-slate-400 font-bold text-xs uppercase tracking-tight">
                Revisiones y asignaciones pendientes.
            </p>
        </div>
      </div>

      {/* FILTROS DE BÚSQUEDA - Estilo Imagen de Referencia */}
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-indigo-600 font-black text-[10px] uppercase tracking-[0.15em] ml-1">
          <Filter size={14} /> FILTROS DE BÚSQUEDA
        </div>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="relative">
              <FolderTree className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterProject} 
                onChange={(e) => { setFilterProject(e.target.value); setFilterMacro(''); setFilterProcess(''); }}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">PROYECTO</option>
                {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Layers className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterMacro} 
                onChange={(e) => { setFilterMacro(e.target.value); setFilterProcess(''); }}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">MACROPROCESO</option>
                {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Network className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterProcess} 
                onChange={(e) => setFilterProcess(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">PROCESO</option>
                {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Activity className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <select 
                value={filterState} 
                onChange={(e) => setFilterState(e.target.value)}
                className="w-full pl-10 pr-8 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none appearance-none cursor-pointer shadow-sm"
              >
                <option value="">ESTADO</option>
                {Object.keys(STATE_CONFIG).filter(k => k !== DocState.APPROVED).map(key => (
                    <option key={key} value={key}>{STATE_CONFIG[key as DocState].label.split('(')[0]}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" size={14} />
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="BUSCAR..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest focus:ring-4 focus:ring-indigo-500/5 focus:border-indigo-500 outline-none shadow-sm placeholder:text-slate-300"
              />
            </div>
        </div>
      </div>

      {/* TABLA - Diseño de nivel único con Estética Dashboard en Columna Estado */}
      <div className="bg-white rounded-3xl shadow-xl shadow-indigo-100/20 border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-[0.15em] border-b border-slate-100">
                <th className="px-6 py-5">PROYECTO / MACRO</th>
                <th className="px-6 py-5">MICROPROCESO</th>
                <th className="px-6 py-5">DOCUMENTO</th>
                <th className="px-6 py-5">ESTADO ACTUAL</th>
                <th className="px-6 py-5 cursor-pointer group" onClick={() => handleSort('updatedAt')}>
                  <div className="flex items-center gap-1">
                    FECHA 
                    {sortConfig.key === 'updatedAt' ? (
                      sortConfig.direction === 'asc' ? <ArrowUp size={10} className="text-indigo-600" /> : <ArrowDown size={10} className="text-indigo-600" />
                    ) : <ArrowUpDown size={10} className="opacity-0 group-hover:opacity-100" />}
                  </div>
                </th>
                <th className="px-6 py-5 text-right">ACCIÓN</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {processedDocs.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-20 text-center text-slate-300 font-bold italic uppercase tracking-widest">No hay tareas pendientes en este contexto</td></tr>
              ) : (
                processedDocs.map((doc, idx) => {
                  const status = STATE_CONFIG[doc.state];
                  return (
                    <tr key={`${doc.id}-${idx}`} className="group hover:bg-slate-50/50 transition-all">
                      <td className="px-6 py-5">
                        <div className="text-[11px] font-black text-slate-800 uppercase tracking-tighter mb-0.5">{doc.project}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-tight truncate max-w-[180px]">{doc.macroprocess}</div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-[11px] font-black text-slate-700 uppercase tracking-tight">
                          {doc.microprocess || 'General'}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <FileText size={18} className="text-slate-300" />
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black px-2 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-100 shadow-sm">
                              {doc.docType || 'AS IS'}
                            </span>
                            {doc.hasPendingRequest && (
                              <span className="flex items-center gap-1 text-[9px] font-black text-red-600 px-2 py-0.5 rounded border border-red-200 bg-red-50 animate-pulse">
                                <AlertTriangle size={10} /> SOLICITUD
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* ESTADO ACTUAL - Estética Dashboard */}
                      <td className="px-6 py-5">
                        <div className="flex flex-col">
                            <div className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold border w-fit mb-1 ${status.color}`}>
                                {status.label.split('(')[0].trim()}
                            </div>
                            <div className="text-[10px] font-mono text-slate-500 font-bold">
                                {formatVersionForDisplay(doc.version)} ({status.progress}%)
                            </div>
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-2 text-slate-500 font-bold text-[10px]">
                          <Calendar size={12} className="text-slate-300" />
                          <span>{doc.state === DocState.NOT_STARTED ? '-' : new Date(doc.updatedAt).toLocaleDateString('es-CL')}</span>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right">
                        <Link 
                          to={`/doc/${doc.id}`} 
                          state={{ docData: doc }}
                          className="text-indigo-600 hover:text-indigo-800 text-[10px] font-black uppercase tracking-[0.1em] inline-flex items-center gap-2 group/link transition-all"
                        >
                          Ver Detalle 
                          <ArrowRight size={14} className="group-hover/link:translate-x-1 transition-transform" />
                        </Link>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WorkList;
