
import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService } from '../services/firebaseBackend';
import { Document, User, UserRole, DocState, DocType, FullHierarchy } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    Plus, Clock, CheckCircle, Filter, X, Calendar, ArrowRight, Activity, 
    BookOpen, Users, ShieldCheck, ArrowUp, ArrowDown, ArrowUpDown, Loader2,
    User as UserIcon, Database, AlertTriangle, Archive, PlayCircle
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DashboardProps {
  user: User;
}

// Extend Document interface locally to handle the "Required" flag for the Dashboard view
interface DashboardDoc extends Document {
    isRequired: boolean; // True if it matches the Matrix, False if it's an extra historical doc
}

type SortKey = 'project' | 'microprocess' | 'state' | 'updatedAt';
type QuickFilterType = 'ALL' | 'NOT_STARTED' | 'IN_PROCESS' | 'REFERENT' | 'CONTROL' | 'FINISHED';

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  const [mergedDocs, setMergedDocs] = useState<DashboardDoc[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSystemEmpty, setIsSystemEmpty] = useState(false);

  // Filters State
  const [filterProject, setFilterProject] = useState('');
  const [filterAnalyst, setFilterAnalyst] = useState('');
  const [filterMacro, setFilterMacro] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterDocType, setFilterDocType] = useState('');
  const [filterState, setFilterState] = useState(''); // Dropdown state filter
  
  // Quick Stats Filter (Cards)
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('ALL');

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'updatedAt',
    direction: 'desc'
  });

  useEffect(() => {
    loadData();
  }, []);

  // Helper to normalize strings for robust comparison
  const normalize = (str: string | undefined) => {
      if (!str) return '';
      return str.trim().toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  };

  const loadData = async () => {
    setLoading(true);
    try {
        const [realDocsData, users, fullHierarchy] = await Promise.all([
            DocumentService.getAll(),
            UserService.getAll(),
            HierarchyService.getFullHierarchy()
        ]);

        setAllUsers(users);

        const hierarchyKeys = Object.keys(fullHierarchy);
        
        if (hierarchyKeys.length === 0 && realDocsData.length === 0) {
            setIsSystemEmpty(true);
            setMergedDocs([]);
            setLoading(false);
            return;
        }
        setIsSystemEmpty(false);

        // 1. Map Real Docs for fast lookup & Deduplication
        const realDocMap = new Map<string, Document>();
        const processedDocIds = new Set<string>();

        realDocsData.forEach(doc => {
            if (doc.project && (doc.microprocess || doc.title)) {
                // Assuming format "Microprocess Name - Type" if microprocess field is empty
                const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
                
                const docType = doc.docType || 'AS IS';
                const key = `${normalize(doc.project)}|${normalize(microName)}|${normalize(docType)}`;
                
                // Keep the most recent version if duplicates exist (by updatedAt)
                const existing = realDocMap.get(key);
                if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                    realDocMap.set(key, { ...doc, microprocess: microName, docType: docType as DocType });
                }
            }
        });

        // 2. Generate Virtual List based on Hierarchy Rules (THE SOURCE OF TRUTH)
        const finalDocsList: DashboardDoc[] = [];

        hierarchyKeys.forEach(proj => {
            Object.keys(fullHierarchy[proj]).forEach(macro => {
                Object.keys(fullHierarchy[proj][macro]).forEach(proc => {
                    const nodes = fullHierarchy[proj][macro][proc];
                    nodes.forEach(node => {
                        if (node.active === false) return; 

                        const requiredTypes = (node.requiredTypes && node.requiredTypes.length > 0) 
                            ? node.requiredTypes 
                            : ['AS IS', 'FCE', 'PM', 'TO BE'];

                        requiredTypes.forEach(type => {
                            const key = `${normalize(proj)}|${normalize(node.name)}|${normalize(type)}`;
                            
                            if (realDocMap.has(key)) {
                                const realDoc = realDocMap.get(key)!;
                                finalDocsList.push({
                                    ...realDoc,
                                    macroprocess: macro,
                                    process: proc,
                                    project: proj,
                                    assignees: (node.assignees && node.assignees.length > 0) ? node.assignees : (realDoc.assignees || []),
                                    isRequired: true // <--- MARK AS REQUIRED (Matches Matrix)
                                });
                                processedDocIds.add(realDoc.id); 
                            } else {
                                // Create Virtual Placeholder
                                finalDocsList.push({
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
                                    assignedTo: node.assignees?.[0] || '',
                                    assignees: node.assignees || [],
                                    state: DocState.NOT_STARTED,
                                    version: '-',
                                    progress: 0,
                                    files: [],
                                    createdAt: new Date().toISOString(),
                                    updatedAt: new Date(0).toISOString(), 
                                    hasPendingRequest: false,
                                    isRequired: true // <--- MARK AS REQUIRED (Placeholder from Matrix)
                                });
                            }
                        });
                    });
                });
            });
        });

        // 3. Add Orphans (Documents that exist but match NO active matrix requirement)
        realDocMap.forEach((doc) => {
            if (!processedDocIds.has(doc.id)) {
                finalDocsList.push({
                    ...doc,
                    macroprocess: doc.macroprocess || 'Sin Clasificar',
                    process: doc.process || 'Sin Clasificar',
                    isRequired: false // <--- MARK AS NOT REQUIRED (Extra/Historic)
                });
            }
        });

        setMergedDocs(finalDocsList);

    } catch (error) {
        console.error("Error loading dashboard data:", error);
    } finally {
        setLoading(false);
    }
  };

  // --- 1. CONTEXT FILTERING (Dropdowns Only) ---
  const contextDocs = useMemo(() => {
      let filtered = mergedDocs;

      if (filterProject) filtered = filtered.filter(d => d.project === filterProject);
      
      if (filterAnalyst) {
          filtered = filtered.filter(d => {
              return d.assignees && d.assignees.includes(filterAnalyst);
          });
      }

      if (filterMacro) filtered = filtered.filter(d => d.macroprocess === filterMacro);
      if (filterProcess) filtered = filtered.filter(d => d.process === filterProcess);
      if (filterDocType) filtered = filtered.filter(d => d.docType === filterDocType);
      if (filterState) filtered = filtered.filter(d => d.state === filterState);

      return filtered;
  }, [mergedDocs, filterProject, filterAnalyst, filterMacro, filterProcess, filterDocType, filterState]);

  // --- 2. STATS CALCULATION (ONLY COUNT REQUIRED DOCS) ---
  const stats = useMemo(() => {
      // Filter the context to only include REQUIRED documents for stats
      const requiredDocs = contextDocs.filter(d => d.isRequired);

      return {
        total: requiredDocs.length,
        notStarted: requiredDocs.filter(d => d.state === DocState.NOT_STARTED).length,
        inProcess: requiredDocs.filter(d => d.state === DocState.INITIATED || d.state === DocState.IN_PROCESS || d.state === DocState.INTERNAL_REVIEW).length,
        referent: requiredDocs.filter(d => d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW).length,
        control: requiredDocs.filter(d => d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW).length,
        finished: requiredDocs.filter(d => d.state === DocState.APPROVED).length
      };
  }, [contextDocs]);

  // --- 3. TABLE FILTERING (Context + Quick Filter) ---
  const tableDocs = useMemo(() => {
      let filtered = contextDocs;

      // Apply Quick Filter (Cards) - Applies to ALL documents (Required + Orphans) visible in table
      if (quickFilter !== 'ALL') {
          switch (quickFilter) {
              case 'NOT_STARTED': filtered = filtered.filter(d => d.state === DocState.NOT_STARTED); break;
              case 'IN_PROCESS': filtered = filtered.filter(d => d.state === DocState.INITIATED || d.state === DocState.IN_PROCESS || d.state === DocState.INTERNAL_REVIEW); break;
              case 'REFERENT': filtered = filtered.filter(d => d.state === DocState.SENT_TO_REFERENT || d.state === DocState.REFERENT_REVIEW); break;
              case 'CONTROL': filtered = filtered.filter(d => d.state === DocState.SENT_TO_CONTROL || d.state === DocState.CONTROL_REVIEW); break;
              case 'FINISHED': filtered = filtered.filter(d => d.state === DocState.APPROVED); break;
          }
      }
      return filtered;
  }, [contextDocs, quickFilter]);

  // --- 4. SORTING ---
  const sortedDocs = useMemo(() => {
      return [...tableDocs].sort((a, b) => {
          // Priority Sort: Required first, then Orphans
          if (a.isRequired !== b.isRequired) {
              return a.isRequired ? -1 : 1;
          }

          const modifier = sortConfig.direction === 'asc' ? 1 : -1;
          switch (sortConfig.key) {
              case 'updatedAt': 
                  const timeA = new Date(a.updatedAt).getTime();
                  const timeB = new Date(b.updatedAt).getTime();
                  return (timeA - timeB) * modifier;
              case 'project': return (a.project || '').localeCompare(b.project || '') * modifier;
              case 'microprocess': return (a.microprocess || '').localeCompare(b.microprocess || '') * modifier;
              case 'state': return (a.progress - b.progress) * modifier;
              default: return 0;
          }
      });
  }, [tableDocs, sortConfig]);


  const chartData = [
    { name: 'No Iniciado', value: stats.notStarted, color: '#e2e8f0' },
    { name: 'En Proceso', value: stats.inProcess, color: '#3b82f6' },
    { name: 'Referente', value: stats.referent, color: '#a855f7' },
    { name: 'Control', value: stats.control, color: '#f97316' },
    { name: 'Finalizado', value: stats.finished, color: '#22c55e' },
  ].filter(d => d.value > 0);

  const handleSort = (key: SortKey) => {
      setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc' });
  };

  const handleQuickFilter = (type: QuickFilterType) => {
      setQuickFilter(quickFilter === type ? 'ALL' : type);
  };

  const clearFilters = () => {
      setFilterProject('');
      setFilterAnalyst('');
      setFilterMacro('');
      setFilterProcess('');
      setFilterDocType('');
      setFilterState('');
      setQuickFilter('ALL');
  };

  const SortIcon = ({ column }: { column: SortKey }) => (
      sortConfig.key === column ? (sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-indigo-600"/> : <ArrowDown size={12} className="text-indigo-600"/>) : <ArrowUpDown size={12} className="opacity-30 group-hover:opacity-100"/>
  );

  const availableProjects = useMemo(() => {
      const set = new Set(mergedDocs.map(d => d.project).filter(Boolean));
      return Array.from(set).sort();
  }, [mergedDocs]);

  const availableMacros = useMemo(() => {
      const docs = filterProject ? mergedDocs.filter(d => d.project === filterProject) : mergedDocs;
      const set = new Set(docs.map(d => d.macroprocess).filter(Boolean));
      return Array.from(set).sort();
  }, [mergedDocs, filterProject]);

  const availableProcesses = useMemo(() => {
      let docs = mergedDocs;
      if (filterProject) docs = docs.filter(d => d.project === filterProject);
      if (filterMacro) docs = docs.filter(d => d.macroprocess === filterMacro);
      const set = new Set(docs.map(d => d.process).filter(Boolean));
      return Array.from(set).sort();
  }, [mergedDocs, filterProject, filterMacro]);

  const getUserName = (id: string) => {
      const u = allUsers.find(user => user.id === id);
      return u ? u.name : 'Sin Asignar';
  };

  const isAssignedToMe = (doc: DashboardDoc) => {
      return doc.assignees && doc.assignees.includes(user.id);
  };

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Actualizando dashboard...</div>;

  if (isSystemEmpty) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6">
                  <Database size={40} className="text-indigo-600" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Sistema sin Inicializar</h2>
              <p className="text-slate-500 max-w-md mb-8">
                  La matriz de procesos está vacía. Para visualizar el avance, es necesario cargar la estructura de procesos inicial.
              </p>
              {(user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) ? (
                  <Link 
                    to="/admin/assignments" 
                    className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-md transition-transform active:scale-95"
                  >
                      <Database size={18} className="mr-2" />
                      Ir a Carga de Datos
                  </Link>
              ) : (
                  <div className="flex items-center gap-2 text-amber-600 bg-amber-50 px-4 py-2 rounded-lg border border-amber-100">
                      <AlertTriangle size={18} />
                      <span>Contacte al administrador para inicializar el sistema.</span>
                  </div>
              )}
          </div>
      );
  }

  const hasActiveFilters = filterProject || filterAnalyst || filterMacro || filterProcess || filterDocType || filterState;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex justify-between items-center">
        <div><h1 className="text-2xl font-bold text-slate-900">Dashboard</h1><p className="text-slate-500">Vista general</p></div>
        {user.role === UserRole.ANALYST && <Link to="/new" className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center shadow-sm font-medium"><Plus size={18} className="mr-2"/> Nueva Solicitud</Link>}
      </div>

      {/* STATS CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Doc. Requeridos" value={stats.total} icon={BookOpen} color="bg-slate-50 text-slate-600 border-slate-200" onClick={() => handleQuickFilter('ALL')} isActive={quickFilter === 'ALL'}/>
        <StatCard title="No Iniciado" value={stats.notStarted} icon={Clock} color="bg-white text-slate-600 border-slate-200" onClick={() => handleQuickFilter('NOT_STARTED')} isActive={quickFilter === 'NOT_STARTED'}/>
        <StatCard title="En Proceso" value={stats.inProcess} icon={Activity} color="bg-blue-50 text-blue-600 border-blue-100" onClick={() => handleQuickFilter('IN_PROCESS')} isActive={quickFilter === 'IN_PROCESS'}/>
        <StatCard title="Referente" value={stats.referent} icon={Users} color="bg-purple-50 text-purple-600 border-purple-100" onClick={() => handleQuickFilter('REFERENT')} isActive={quickFilter === 'REFERENT'}/>
        <StatCard title="Control Gestión" value={stats.control} icon={ShieldCheck} color="bg-orange-50 text-orange-600 border-orange-100" onClick={() => handleQuickFilter('CONTROL')} isActive={quickFilter === 'CONTROL'}/>
        <StatCard title="Terminados" value={stats.finished} icon={CheckCircle} color="bg-green-50 text-green-600 border-green-100" onClick={() => handleQuickFilter('FINISHED')} isActive={quickFilter === 'FINISHED'}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* MAIN TABLE */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col">
            
            {/* FILTER BAR */}
            <div className="p-4 border-b border-slate-100 bg-white">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm">
                        <Filter size={16} /> Filtros de Visualización
                    </div>
                    {hasActiveFilters && (
                        <button 
                            onClick={clearFilters}
                            className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium transition-colors"
                        >
                            <X size={14} /> Limpiar filtros
                        </button>
                    )}
                </div>
                <div className="flex flex-wrap gap-3">
                    <select value={filterProject} onChange={(e) => { setFilterProject(e.target.value); setFilterMacro(''); setFilterProcess(''); }} className="text-xs p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 w-32">
                        <option value="">Proyecto (Todos)</option>
                        {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    <select value={filterAnalyst} onChange={(e) => setFilterAnalyst(e.target.value)} className="text-xs p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 w-36">
                        <option value="">Analista (Todos)</option>
                        {allUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </select>

                    <select value={filterMacro} onChange={(e) => { setFilterMacro(e.target.value); setFilterProcess(''); }} className="text-xs p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 w-40">
                        <option value="">Macro (Todos)</option>
                        {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className="text-xs p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 w-40">
                        <option value="">Proceso (Todos)</option>
                        {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    <select value={filterDocType} onChange={(e) => setFilterDocType(e.target.value)} className="text-xs p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 w-32">
                        <option value="">Doc (Todos)</option>
                        {['AS IS', 'FCE', 'PM', 'TO BE'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="text-xs p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none focus:ring-1 focus:ring-indigo-500 w-36">
                        <option value="">Estado (Todos)</option>
                        {Object.keys(STATE_CONFIG).map(k => <option key={k} value={k}>{STATE_CONFIG[k as DocState].label.split('(')[0]}</option>)}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto flex-1">
                <table className="w-full text-xs text-left">
                    <thead className="text-[10px] text-slate-400 uppercase font-bold bg-white border-b border-slate-100">
                        <tr>
                            <th className="px-4 py-3 cursor-pointer group" onClick={() => handleSort('project')}>PROYECTO</th>
                            <th className="px-4 py-3">JERARQUÍA (MACRO / PROCESO)</th>
                            <th className="px-4 py-3 cursor-pointer group" onClick={() => handleSort('microprocess')}>MICROPROCESO</th>
                            <th className="px-4 py-3">DOCUMENTO</th>
                            <th className="px-4 py-3 cursor-pointer group" onClick={() => handleSort('state')}>ESTADO ACTUAL</th>
                            <th className="px-4 py-3 cursor-pointer group text-right" onClick={() => handleSort('updatedAt')}>ÚLTIMA ACTIVIDAD <SortIcon column="updatedAt"/></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {sortedDocs.length === 0 ? <tr><td colSpan={6} className="p-8 text-center text-slate-400">Sin resultados.</td></tr> : sortedDocs.map((doc, idx) => (
                            <tr 
                                key={`${doc.id}-${idx}`} 
                                className={`transition-colors ${
                                    !doc.isRequired 
                                        ? 'bg-gray-100 hover:bg-gray-200' // <--- VISUALIZACIÓN GRIS PARA DOCUMENTOS "EXTRA"
                                        : 'hover:bg-slate-50'
                                }`}
                            >
                                {/* PROYECTO */}
                                <td className={`px-4 py-3 font-bold align-top ${!doc.isRequired ? 'text-gray-500' : 'text-slate-700'}`}>{doc.project}</td>
                                
                                {/* JERARQUÍA */}
                                <td className={`px-4 py-3 align-top ${!doc.isRequired ? 'text-gray-400' : ''}`}>
                                    <div className={`font-bold ${!doc.isRequired ? 'text-gray-500' : 'text-slate-700'}`}>{doc.macroprocess}</div>
                                    <div className={`${!doc.isRequired ? 'text-gray-400' : 'text-slate-500'}`}>{doc.process}</div>
                                </td>
                                
                                {/* MICROPROCESO & ANALISTA */}
                                <td className="px-4 py-3 align-top">
                                    <div className={`font-bold mb-1 ${!doc.isRequired ? 'text-gray-600' : 'text-slate-800'}`}>
                                        {doc.microprocess}
                                        {!doc.isRequired && <span className="ml-2 text-[9px] uppercase bg-gray-200 text-gray-500 px-1 rounded">No Requerido</span>}
                                    </div>
                                    <div className={`flex items-center gap-1 ${!doc.isRequired ? 'text-gray-400' : 'text-slate-500'}`} title="Analista Asignado">
                                        <UserIcon size={10} />
                                        <span className={`text-[10px] font-medium ${!doc.isRequired ? 'text-gray-500' : 'text-indigo-600'}`}>
                                            {doc.assignees && doc.assignees.length > 0 
                                                ? getUserName(doc.assignees[0]) 
                                                : 'Sin Asignar'}
                                        </span>
                                    </div>
                                </td>
                                
                                {/* DOCUMENTO (TYPE & LINK) */}
                                <td className="px-4 py-3 align-top">
                                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold mb-1 ${
                                        !doc.isRequired 
                                            ? 'bg-gray-200 text-gray-500 border-gray-300' 
                                            : 'bg-indigo-50 text-indigo-700 border-indigo-100'
                                    }`}>
                                        {doc.docType}
                                    </span>
                                    {/* LINK UNIFICADO "VER DETALLE" */}
                                    <Link 
                                        to={`/doc/${doc.id}`} 
                                        state={{ docData: doc }} // Pasamos el doc en state para manejar virtuales
                                        className={`flex items-center gap-1 text-[10px] font-bold ${!doc.isRequired ? 'text-gray-500 hover:text-gray-700' : 'text-indigo-500 hover:text-indigo-700'}`}
                                    >
                                        Ver Detalle <ArrowRight size={10}/>
                                    </Link>
                                </td>
                                
                                {/* ESTADO ACTUAL */}
                                <td className="px-4 py-3 align-top">
                                    <div className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mb-1 border ${
                                        !doc.isRequired 
                                            ? 'bg-gray-200 text-gray-500 border-gray-300' 
                                            : STATE_CONFIG[doc.state].color
                                    }`}>
                                        {STATE_CONFIG[doc.state].label.split('(')[0]}
                                    </div>
                                    <div className={`text-[10px] font-mono ${!doc.isRequired ? 'text-gray-400' : 'text-slate-500'}`}>
                                        Ver: {doc.version} ({doc.progress}%)
                                    </div>
                                </td>
                                
                                {/* ÚLTIMA ACTIVIDAD */}
                                <td className="px-4 py-3 align-top text-right">
                                    {doc.state !== DocState.NOT_STARTED ? (
                                        <div className="flex flex-col items-end">
                                            <div className={`flex items-center gap-1 font-medium ${!doc.isRequired ? 'text-gray-500' : 'text-slate-600'}`}>
                                                <Calendar size={10} />
                                                {new Date(doc.updatedAt).toLocaleDateString()}
                                            </div>
                                            <span className="text-[10px] text-slate-400">
                                                {new Date(doc.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                            </span>
                                        </div>
                                    ) : (
                                        <span className="text-slate-300 text-[10px]">-</span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        {/* RIGHT COLUMN: CHART & SUMMARY */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 min-h-[250px] flex flex-col items-center justify-center">
                <h3 className="font-bold text-center mb-2 text-slate-700 text-sm">Estado (Requeridos)</h3>
                {chartData.length > 0 ? (
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie 
                                    data={chartData} 
                                    cx="50%" cy="50%" 
                                    innerRadius={50} outerRadius={70} 
                                    paddingAngle={2} 
                                    dataKey="value"
                                >
                                    {chartData.map((e, i) => <Cell key={i} fill={e.color}/>)}
                                </Pie>
                                <Tooltip contentStyle={{fontSize: '12px'}}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : <p className="text-center text-slate-400 text-xs">Sin datos requeridos.</p>}
                
                <div className="flex flex-wrap justify-center gap-2 mt-2">
                    {chartData.map((d, i) => (
                        <div key={i} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{backgroundColor: d.color}}></span>
                            <span className="text-[10px] text-slate-500">{d.name}</span>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-indigo-50 rounded-xl shadow-sm border border-indigo-100 p-4">
                <h3 className="font-bold text-indigo-900 text-sm mb-3">Resumen de Cumplimiento</h3>
                <p className="text-xs text-indigo-700 mb-3">
                    Visualizando {contextDocs.length} filas totales.<br/>
                    <strong>{stats.total} documentos requeridos.</strong>
                </p>
                <ul className="space-y-2 text-xs">
                    <li className="border-t border-indigo-200 pt-1 flex justify-between text-slate-600">
                        <span>No Iniciados:</span> <span>{stats.notStarted}</span>
                    </li>
                    <li className="flex justify-between text-blue-600 font-medium">
                        <span>En Proceso:</span> <span>{stats.inProcess}</span>
                    </li>
                    <li className="flex justify-between text-purple-600 font-medium">
                        <span>Referente:</span> <span>{stats.referent}</span>
                    </li>
                    <li className="flex justify-between text-orange-600 font-medium">
                        <span>Control Gestión:</span> <span>{stats.control}</span>
                    </li>
                    <li className="border-t border-indigo-200 pt-1 flex justify-between text-green-600 font-bold">
                        <span>Terminados:</span> <span>{stats.finished}</span>
                    </li>
                </ul>
                <div className="mt-4 pt-3 border-t border-indigo-200 text-[10px] text-slate-500 flex items-center gap-2">
                    <Archive size={12} />
                    <span>Los registros en <span className="font-bold text-gray-500">GRIS</span> son históricos/extra y no suman al cumplimiento.</span>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color, isActive, onClick }: any) => (
    <div onClick={onClick} className={`p-3 rounded-xl shadow-sm border cursor-pointer flex items-center space-x-3 transition-all ${isActive ? 'ring-2 ring-indigo-200 scale-105' : 'hover:border-indigo-300'} ${color}`}>
        <div className="p-1.5 bg-white/50 rounded-lg"><Icon size={18}/></div>
        <div>
            <p className="text-[9px] uppercase font-bold opacity-70">{title}</p>
            <p className="text-lg font-bold leading-none">{value}</p>
        </div>
    </div>
);

export default Dashboard;
