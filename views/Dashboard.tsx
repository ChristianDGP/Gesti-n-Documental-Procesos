
import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { DocumentService, UserService, HierarchyService } from '../services/firebaseBackend';
import { Document, User, UserRole, DocState, DocType, FullHierarchy } from '../types';
import { STATE_CONFIG } from '../constants';
import { 
    Plus, Clock, CheckCircle, Filter, X, Calendar, ArrowRight, Activity, 
    BookOpen, Users, ShieldCheck, ArrowUp, ArrowDown, ArrowUpDown, Loader2,
    User as UserIcon, Database, AlertTriangle, Archive, PlayCircle, Search,
    ChevronLeft, ChevronRight, FileSpreadsheet
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

interface DashboardProps {
  user: User;
}

interface DashboardDoc extends Document {
    isRequired: boolean;
}

type SortKey = 'project' | 'microprocess' | 'state' | 'updatedAt';
type QuickFilterType = 'ALL' | 'NOT_STARTED' | 'IN_PROCESS' | 'REFERENT' | 'CONTROL' | 'FINISHED';

const ITEMS_PER_PAGE = 10;

const getDocTypeOrder = (type: string | undefined): number => {
    switch (type) {
        case 'AS IS': return 1;
        case 'FCE': return 2;
        case 'PM': return 3;
        case 'TO BE': return 4;
        default: return 99;
    }
};

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  const location = useLocation(); 
  
  const [mergedDocs, setMergedDocs] = useState<DashboardDoc[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSystemEmpty, setIsSystemEmpty] = useState(false);

  // Filtros de Estado
  const [filterProject, setFilterProject] = useState('');
  const [filterMacro, setFilterMacro] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterSearch, setFilterSearch] = useState(''); 
  const [filterDocType, setFilterDocType] = useState('');
  const [filterState, setFilterState] = useState(''); 
  const [filterAnalyst, setFilterAnalyst] = useState('');
  
  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const [externalFilterIds, setExternalFilterIds] = useState<string[] | null>(null);
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('ALL');

  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'project', 
    direction: 'asc'
  });

  useEffect(() => {
    if (location.state?.filterIds && Array.isArray(location.state.filterIds)) {
        setExternalFilterIds(location.state.filterIds);
        setQuickFilter('ALL');
    } else {
        setExternalFilterIds(null);
    }
    loadData();
  }, [location.state]);

  useEffect(() => {
    setCurrentPage(1);
  }, [filterProject, filterMacro, filterProcess, filterSearch, filterDocType, filterState, filterAnalyst, quickFilter, sortConfig]);

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

        const realDocMap = new Map<string, Document>();
        const processedDocIds = new Set<string>();

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
                                    isRequired: true 
                                });
                                processedDocIds.add(realDoc.id); 
                            } else {
                                finalDocsList.push({
                                    id: `virtual-${key}`, 
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
                                    isRequired: true 
                                });
                            }
                        });
                    });
                });
            });
        });

        realDocMap.forEach((doc) => {
            if (!processedDocIds.has(doc.id)) {
                finalDocsList.push({
                    ...doc,
                    macroprocess: doc.macroprocess || 'Sin Clasificar',
                    process: doc.process || 'Sin Clasificar',
                    isRequired: false 
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

  const contextDocs = useMemo(() => {
      let filtered = mergedDocs;

      if (externalFilterIds && externalFilterIds.length > 0) {
          filtered = filtered.filter(d => externalFilterIds.includes(d.id));
      } else {
          if (filterProject) filtered = filtered.filter(d => d.project === filterProject);
          if (filterMacro) filtered = filtered.filter(d => d.macroprocess === filterMacro);
          if (filterProcess) filtered = filtered.filter(d => d.process === filterProcess);
          if (filterDocType) filtered = filtered.filter(d => d.docType === filterDocType);
          if (filterState) filtered = filtered.filter(d => d.state === filterState);
          if (filterAnalyst) filtered = filtered.filter(d => d.assignees && d.assignees.includes(filterAnalyst));
          
          if (filterSearch) {
              const term = filterSearch.toLowerCase();
              filtered = filtered.filter(d => 
                  (d.microprocess || '').toLowerCase().includes(term) || 
                  (d.title || '').toLowerCase().includes(term)
              );
          }
      }

      return filtered;
  }, [mergedDocs, filterProject, filterMacro, filterProcess, filterDocType, filterState, filterAnalyst, filterSearch, externalFilterIds]);

  const stats = useMemo(() => {
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

  // Fix: Added chartData useMemo to resolve missing variable errors in the pie chart section.
  const chartData = useMemo(() => {
    return [
      { name: 'No Iniciado', value: stats.notStarted, color: '#94a3b8' },
      { name: 'En Proceso', value: stats.inProcess, color: '#3b82f6' },
      { name: 'Referente', value: stats.referent, color: '#a855f7' },
      { name: 'Control', value: stats.control, color: '#f97316' },
      { name: 'Terminados', value: stats.finished, color: '#22c55e' }
    ].filter(d => d.value > 0);
  }, [stats]);

  const tableDocs = useMemo(() => {
      let filtered = contextDocs;

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

  const sortedDocs = useMemo(() => {
      return [...tableDocs].sort((a, b) => {
          if (a.isRequired !== b.isRequired) {
              return a.isRequired ? -1 : 1;
          }

          const modifier = sortConfig.direction === 'asc' ? 1 : -1;
          
          switch (sortConfig.key) {
              case 'updatedAt': 
                  const timeA = new Date(a.updatedAt).getTime();
                  const timeB = new Date(b.updatedAt).getTime();
                  return (timeA - timeB) * modifier;
              
              case 'project': 
                  if ((a.project || '') !== (b.project || '')) return (a.project || '').localeCompare(b.project || '') * modifier;
                  if ((a.macroprocess || '') !== (b.macroprocess || '')) return (a.macroprocess || '').localeCompare(b.macroprocess || '') * modifier;
                  if ((a.process || '') !== (b.process || '')) return (a.process || '').localeCompare(b.process || '') * modifier;
                  if ((a.microprocess || '') !== (b.microprocess || '')) return (a.microprocess || '').localeCompare(b.microprocess || '') * modifier;
                  return (getDocTypeOrder(a.docType) - getDocTypeOrder(b.docType)) * modifier;

              case 'microprocess': return (a.microprocess || '').localeCompare(b.microprocess || '') * modifier;
              case 'state': return (a.progress - b.progress) * modifier;
              default: return 0;
          }
      });
  }, [tableDocs, sortConfig]);

  const totalItems = sortedDocs.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const paginatedDocs = useMemo(() => {
      const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
      return sortedDocs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [sortedDocs, currentPage]);

  const handleExportExcel = () => {
      if (sortedDocs.length === 0) return;
      const getUserNames = (ids: string[]) => ids.map(id => allUsers.find(u => u.id === id)?.name || id).join('; ');
      
      // Orden definitivo solicitado: PROYECTO, MACROPROCESO, PROCESO, MICROPROCESO, DOCUMENTO, VERSION, ESTADO, FECHA, ANALISTA
      const headers = ['PROYECTO', 'MACROPROCESO', 'PROCESO', 'MICROPROCESO', 'DOCUMENTO', 'VERSION', 'ESTADO', 'FECHA', 'ANALISTA'];
      const rows = sortedDocs.map(d => {
          // Formateo de fecha DD-MM-YYYY sin hora
          let fechaStr = 'Sin actividad';
          if (d.state !== DocState.NOT_STARTED && d.updatedAt) {
              const date = new Date(d.updatedAt);
              const day = String(date.getDate()).padStart(2, '0');
              const month = String(date.getMonth() + 1).padStart(2, '0');
              const year = date.getFullYear();
              fechaStr = `${day}-${month}-${year}`;
          }

          return [
              d.project || '-',
              d.macroprocess || '-',
              d.process || '-',
              d.microprocess || '-',
              d.docType || '-',
              d.version || '-',
              STATE_CONFIG[d.state]?.label.split('(')[0] || '-',
              fechaStr,
              getUserNames(d.assignees || [])
          ];
      });

      const csvContent = [headers.join(';'), ...rows.map(r => r.map(cell => `"${cell}"`).join(';'))].join('\n');
      const blob = new Blob(["\ufeff", csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `SGD_Reporte_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
  };

  const handleSort = (key: SortKey) => {
      setSortConfig({ key, direction: sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc' });
  };

  // Added handleQuickFilter to fix missing reference errors in StatCard usages
  const handleQuickFilter = (type: QuickFilterType) => {
    setQuickFilter(type);
    setCurrentPage(1);
  };

  const clearFilters = () => {
      setFilterProject(''); setFilterMacro(''); setFilterProcess(''); setFilterSearch(''); 
      setFilterDocType(''); setFilterState(''); setFilterAnalyst(''); setQuickFilter('ALL');
      setExternalFilterIds(null); navigate(location.pathname, { replace: true, state: {} });
  };

  const SortIcon = ({ column }: { column: SortKey }) => (
      sortConfig.key === column ? (sortConfig.direction === 'asc' ? <ArrowUp size={12} className="text-indigo-600"/> : <ArrowDown size={12} className="text-indigo-600"/>) : <ArrowUpDown size={12} className="opacity-30 group-hover:opacity-100"/>
  );

  const availableProjects = useMemo(() => Array.from(new Set(mergedDocs.map(d => d.project).filter(Boolean))).sort(), [mergedDocs]);
  const availableMacros = useMemo(() => {
      const docs = filterProject ? mergedDocs.filter(d => d.project === filterProject) : mergedDocs;
      return Array.from(new Set(docs.map(d => d.macroprocess).filter(Boolean))).sort();
  }, [mergedDocs, filterProject]);
  const availableProcesses = useMemo(() => {
      let docs = mergedDocs;
      if (filterProject) docs = docs.filter(d => d.project === filterProject);
      if (filterMacro) docs = docs.filter(d => d.macroprocess === filterMacro);
      return Array.from(new Set(docs.map(d => d.process).filter(Boolean))).sort();
  }, [mergedDocs, filterProject, filterMacro]);

  const getUserName = (id: string) => allUsers.find(user => user.id === id)?.name || 'Sin Asignar';

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Actualizando dashboard...</div>;

  if (isSystemEmpty) {
      return (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 bg-white rounded-xl shadow-sm border border-slate-200">
              <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-6"><Database size={40} className="text-indigo-600" /></div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Sistema sin Inicializar</h2>
              <p className="text-slate-500 max-w-md mb-8">La matriz de procesos está vacía. Cargue la estructura de procesos para comenzar.</p>
              {(user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) && (
                  <Link to="/admin/assignments" className="flex items-center px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-md transition-transform active:scale-95">
                      <Database size={18} className="mr-2" /> Ir a Carga de Datos
                  </Link>
              )}
          </div>
      );
  }

  const hasActiveFilters = filterProject || filterMacro || filterProcess || filterSearch || filterDocType || filterState || filterAnalyst || externalFilterIds;

  return (
    <div className="space-y-6 pb-12">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div><h1 className="text-2xl font-bold text-slate-900">Dashboard</h1><p className="text-slate-500">Vista general de avance institucional</p></div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
            <button onClick={handleExportExcel} className="flex-1 sm:flex-none px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 flex items-center justify-center shadow-sm font-medium transition-colors">
                <FileSpreadsheet size={18} className="mr-2 text-green-600"/> <span className="hidden md:inline">Exportar Excel</span><span className="md:hidden">Excel</span>
            </button>
            {user.role === UserRole.ANALYST && <Link to="/new" className="flex-1 sm:flex-none px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center justify-center shadow-sm font-medium"><Plus size={18} className="mr-2"/> Nueva Solicitud</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard title="Doc. Requeridos" value={stats.total} icon={BookOpen} color="bg-slate-50 text-slate-600" onClick={() => handleQuickFilter('ALL')} isActive={quickFilter === 'ALL'}/>
        <StatCard title="No Iniciado" value={stats.notStarted} icon={Clock} color="bg-white text-slate-600" onClick={() => handleQuickFilter('NOT_STARTED')} isActive={quickFilter === 'NOT_STARTED'}/>
        <StatCard title="En Proceso" value={stats.inProcess} icon={Activity} color="bg-blue-50 text-blue-600" onClick={() => handleQuickFilter('IN_PROCESS')} isActive={quickFilter === 'IN_PROCESS'}/>
        <StatCard title="Referente" value={stats.referent} icon={Users} color="bg-purple-50 text-purple-600" onClick={() => handleQuickFilter('REFERENT')} isActive={quickFilter === 'REFERENT'}/>
        <StatCard title="Control Gestión" value={stats.control} icon={ShieldCheck} color="bg-orange-50 text-orange-600" onClick={() => handleQuickFilter('CONTROL')} isActive={quickFilter === 'CONTROL'}/>
        <StatCard title="Terminados" value={stats.finished} icon={CheckCircle} color="bg-green-50 text-green-600" onClick={() => handleQuickFilter('FINISHED')} isActive={quickFilter === 'FINISHED'}/>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden flex flex-col min-h-[500px]">
            <div className="p-4 border-b border-slate-100 bg-white">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2 text-indigo-600 font-semibold text-sm"><Filter size={16} /> Filtros de Visualización</div>
                    {hasActiveFilters && <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium"><X size={14} /> Limpiar filtros</button>}
                </div>
                {externalFilterIds ? (
                     <div className="bg-blue-50 border border-blue-100 p-3 rounded-lg mb-2 flex justify-between items-center animate-fadeIn">
                        <span className="text-xs text-blue-700 font-semibold">Filtro Activo: Visualizando {externalFilterIds.length} documentos específicos desde reportes.</span>
                        <button onClick={clearFilters} className="text-xs bg-white border border-blue-200 px-2 py-1 rounded text-blue-600">Mostrar Todo</button>
                     </div>
                ) : (
                    <div className="flex flex-wrap gap-2">
                        <select value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="text-[11px] p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none w-28">
                            <option value="">PROYECTO</option>
                            {availableProjects.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <select value={filterMacro} onChange={(e) => setFilterMacro(e.target.value)} className="text-[11px] p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none w-32">
                            <option value="">MACROPROCESO</option>
                            {availableMacros.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                        <select value={filterProcess} onChange={(e) => setFilterProcess(e.target.value)} className="text-[11px] p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none w-32">
                            <option value="">PROCESO</option>
                            {availableProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <div className="relative w-36">
                            <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input type="text" value={filterSearch} onChange={(e) => setFilterSearch(e.target.value)} placeholder="BUSCAR..." className="w-full text-[11px] pl-7 p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none" />
                        </div>
                        <select value={filterDocType} onChange={(e) => setFilterDocType(e.target.value)} className="text-[11px] p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none w-24">
                            <option value="">DOC</option>
                            <option value="AS IS">AS IS</option>
                            <option value="FCE">FCE</option>
                            <option value="PM">PM</option>
                            <option value="TO BE">TO BE</option>
                        </select>
                        <select value={filterState} onChange={(e) => setFilterState(e.target.value)} className="text-[11px] p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none w-24">
                            <option value="">ESTADO</option>
                            {Object.entries(STATE_CONFIG).map(([key, cfg]) => <option key={key} value={key}>{cfg.label.split('(')[0]}</option>)}
                        </select>
                        <select value={filterAnalyst} onChange={(e) => setFilterAnalyst(e.target.value)} className="text-[11px] p-2 border border-slate-200 rounded-md bg-slate-50 text-slate-600 outline-none w-32">
                            <option value="">ANALISTA</option>
                            {allUsers.filter(u => u.role === UserRole.ANALYST).map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                        </select>
                    </div>
                )}
            </div>

            <div className="overflow-x-auto flex-1">
                <table className="w-full text-[11px] text-left">
                    <thead className="text-[10px] text-slate-400 uppercase font-bold bg-white border-b border-slate-100">
                        <tr>
                            <th className="px-4 py-3 cursor-pointer group" onClick={() => handleSort('project')}>PROYECTO <SortIcon column="project"/></th>
                            <th className="px-4 py-3">JERARQUÍA (MACRO / PROCESO)</th>
                            <th className="px-4 py-3 cursor-pointer group" onClick={() => handleSort('microprocess')}>MICROPROCESO <SortIcon column="microprocess"/></th>
                            <th className="px-4 py-3">DOCUMENTO</th>
                            <th className="px-4 py-3 cursor-pointer group" onClick={() => handleSort('state')}>ESTADO ACTUAL <SortIcon column="state"/></th>
                            <th className="px-4 py-3 text-right cursor-pointer group" onClick={() => handleSort('updatedAt')}>ÚLTIMA ACTIVIDAD <SortIcon column="updatedAt"/></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                        {paginatedDocs.length === 0 ? (
                            <tr><td colSpan={6} className="p-12 text-center text-slate-400"><Search size={40} className="mx-auto mb-2 opacity-20"/><p>Sin resultados.</p></td></tr>
                        ) : paginatedDocs.map((doc, idx) => (
                            <tr key={`${doc.id}-${idx}`} className={`transition-colors ${!doc.isRequired ? 'bg-gray-100 hover:bg-gray-200' : 'hover:bg-slate-50'}`}>
                                <td className={`px-4 py-3 font-bold align-top ${!doc.isRequired ? 'text-gray-500' : 'text-slate-700'}`}>{doc.project}</td>
                                <td className="px-4 py-3 align-top">
                                    <div className={`font-bold ${!doc.isRequired ? 'text-gray-500' : 'text-slate-700'}`}>{doc.macroprocess}</div>
                                    <div className="text-slate-500 text-[10px]">{doc.process}</div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <div className={`font-bold mb-1 ${!doc.isRequired ? 'text-gray-600' : 'text-slate-800'}`}>{doc.microprocess}</div>
                                    <div className="flex items-center gap-1 text-slate-400" title="Analista Asignado">
                                        <UserIcon size={10} /> <span className="text-[10px] truncate max-w-[120px]">{doc.assignees && doc.assignees.length > 0 ? getUserName(doc.assignees[0]) : 'Sin Asignar'}</span>
                                    </div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <span className={`inline-block px-1.5 py-0.5 rounded border text-[10px] font-bold mb-1 ${!doc.isRequired ? 'bg-gray-200 text-gray-400 border-gray-300' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>{doc.docType}</span>
                                    <Link to={`/doc/${doc.id}`} state={{ docData: doc }} className="flex items-center gap-1 text-[10px] font-bold text-indigo-500 hover:text-indigo-700 underline">Ver Detalle</Link>
                                </td>
                                <td className="px-4 py-3 align-top">
                                    <div className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold mb-1 border ${!doc.isRequired ? 'bg-gray-200 text-gray-500 border-gray-300' : STATE_CONFIG[doc.state].color}`}>{STATE_CONFIG[doc.state].label.split('(')[0]}</div>
                                    <div className="text-[10px] font-mono text-slate-500">v{doc.version} ({doc.progress}%)</div>
                                </td>
                                <td className="px-4 py-3 align-top text-right">
                                    {doc.state !== DocState.NOT_STARTED ? (
                                        <div className="text-slate-600 font-medium">{new Date(doc.updatedAt).toLocaleDateString()}</div>
                                    ) : <span className="text-slate-300">-</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalItems > 0 && (
                <div className="px-4 py-3 border-t border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-[11px] text-slate-500">Mostrando <b>{Math.min(totalItems, (currentPage - 1) * ITEMS_PER_PAGE + 1)}</b> a <b>{Math.min(totalItems, currentPage * ITEMS_PER_PAGE)}</b> de <b>{totalItems}</b> registros</div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"><ChevronLeft size={16} /></button>
                        <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                let pageNum = i + 1;
                                if (totalPages > 5 && currentPage > 3) { pageNum = currentPage - 2 + i; if (pageNum > totalPages) pageNum = totalPages - (4 - i); }
                                return <button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={`w-7 h-7 rounded-lg text-xs font-bold border transition-all ${currentPage === pageNum ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:border-indigo-400'}`}>{pageNum}</button>;
                            })}
                        </div>
                        <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-50"><ChevronRight size={16} /></button>
                    </div>
                </div>
            )}
        </div>

        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 min-h-[250px] flex flex-col items-center justify-center">
                <h3 className="font-bold text-center mb-2 text-slate-700 text-xs uppercase">Estado Universo Requerido</h3>
                {chartData.length > 0 ? (
                    <div className="h-44 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={chartData} cx="50%" cy="50%" innerRadius={45} outerRadius={65} paddingAngle={2} dataKey="value">
                                    {chartData.map((e, i) => <Cell key={i} fill={e.color}/>)}
                                </Pie>
                                <Tooltip contentStyle={{fontSize: '11px', borderRadius: '8px'}}/>
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : <p className="text-center text-slate-400 text-[10px]">Sin datos.</p>}
                <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mt-2">
                    {chartData.map((d, i) => (
                        <div key={i} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{backgroundColor: d.color}}></span><span className="text-[9px] text-slate-500 uppercase font-bold">{d.name}</span></div>
                    ))}
                </div>
            </div>
            <div className="bg-indigo-50 rounded-xl shadow-sm border border-indigo-100 p-4">
                <h3 className="font-bold text-indigo-900 text-xs uppercase mb-3">Resumen de Cumplimiento</h3>
                <ul className="space-y-2 text-[11px]">
                    <li className="flex justify-between text-slate-600"><span>No Iniciados:</span> <b>{stats.notStarted}</b></li>
                    <li className="flex justify-between text-blue-600"><span>En Proceso:</span> <b>{stats.inProcess}</b></li>
                    <li className="flex justify-between text-purple-600"><span>Referente:</span> <b>{stats.referent}</b></li>
                    <li className="flex justify-between text-orange-600"><span>Control Gestión:</span> <b>{stats.control}</b></li>
                    <li className="border-t border-indigo-200 pt-1 flex justify-between text-green-600 font-bold"><span>Terminados:</span> <span>{stats.finished}</span></li>
                </ul>
                <div className="mt-4 pt-3 border-t border-indigo-200 text-[9px] text-slate-500 flex items-center gap-2"><Archive size={12} /><span>Registros en <b>GRIS</b> son históricos externos.</span></div>
            </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color, isActive, onClick }: any) => (
    <div onClick={onClick} className={`p-3 rounded-xl shadow-sm border cursor-pointer flex items-center space-x-3 transition-all ${isActive ? 'ring-2 ring-indigo-300 scale-105' : 'hover:border-indigo-300'} ${color} border-transparent`}>
        <div className="p-1.5 bg-white/50 rounded-lg shrink-0"><Icon size={18}/></div>
        <div className="min-w-0">
            <p className="text-[9px] uppercase font-bold opacity-70 truncate">{title}</p>
            <p className="text-lg font-bold leading-none">{value}</p>
        </div>
    </div>
);

export default Dashboard;
