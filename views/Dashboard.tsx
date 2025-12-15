
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { DocumentService, HierarchyService, UserService } from '../services/firebaseBackend';
import { Document, User, UserRole, DocState, DocType, FullHierarchy } from '../types';
import { STATE_CONFIG } from '../constants';
import { Plus, FileText, Clock, CheckCircle, AlertTriangle, Filter, Trash2, Users, Search, X, Calendar, Inbox, ArrowRight, Activity, BookOpen, UserCheck, ShieldCheck, ArrowUp, ArrowDown, ArrowUpDown, PauseCircle, PlayCircle, Loader2 } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  user: User;
}

type SortKey = 'project' | 'microprocess' | 'state' | 'updatedAt';
type QuickFilterType = 'ALL' | 'REQUIRED' | 'NOT_STARTED' | 'IN_PROCESS' | 'REFERENT' | 'CONTROL' | 'FINISHED';

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  const [docs, setDocs] = useState<Document[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [filterProject, setFilterProject] = useState('');
  const [filterMacro, setFilterMacro] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterDocType, setFilterDocType] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterAnalyst, setFilterAnalyst] = useState('');
  
  // Quick Filter State (Stat Cards)
  const [quickFilter, setQuickFilter] = useState<QuickFilterType>('ALL');

  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({
    key: 'updatedAt',
    direction: 'desc' // Default: Newest first
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const [realDocsData, hierarchy, users] = await Promise.all([
            DocumentService.getAll(),
            HierarchyService.getFullHierarchy(),
            UserService.getAll()
        ]);

        // 0. BUILD REQUIREMENTS MAP
        const requirementsMap = new Map<string, Set<string>>();
        
        Object.keys(hierarchy).forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    hierarchy[proj][macro][proc].forEach(node => {
                        if (node.active === false) return; 
                        if (!node.requiredTypes || node.requiredTypes.length === 0) return;
                        
                        const key = `${proj}|${node.name}`;
                        requirementsMap.set(key, new Set(node.requiredTypes));
                    });
                });
            });
        });

        // 1. DEDUPLICATION of Real Docs (Golden Rule: Latest updatedAt wins)
        const latestDocsMap = new Map<string, Document>();
        
        realDocsData.forEach(doc => {
            const proj = doc.project || '';
            const micro = doc.microprocess || doc.title; 
            const type = doc.docType || '';

            // Check if required in Matrix
            const reqKey = `${proj}|${micro}`;
            const allowedTypes = requirementsMap.get(reqKey);
            if (!allowedTypes || !allowedTypes.has(type)) {
                return; // Skip if not in matrix requirements
            }

            const uniqueKey = `${proj}|${micro}|${type}`;
            const existing = latestDocsMap.get(uniqueKey);
            
            // SIMPLIFIED LOGIC: Newest timestamp wins. Period.
            // This ensures state transitions (like REJECT) which update the timestamp are reflected immediately.
            if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                latestDocsMap.set(uniqueKey, doc);
            }
        });
        
        // 2. VIRTUAL DOC GENERATION
        const virtualDocs: Document[] = [];
        
        Object.keys(hierarchy).forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    hierarchy[proj][macro][proc].forEach(node => {
                        if (node.active === false) return;

                        node.requiredTypes.forEach(type => {
                            const uniqueKey = `${proj}|${node.name}|${type}`;
                            
                            // Only create virtual if NO real doc exists for this key
                            if (!latestDocsMap.has(uniqueKey)) {
                                const virtualDoc: Document = {
                                    id: `virtual_${uniqueKey.replace(/\|/g, '_')}`, 
                                    title: `${node.name} - ${type}`,
                                    description: 'Pendiente de inicio',
                                    project: proj,
                                    macroprocess: macro,
                                    process: proc,
                                    microprocess: node.name,
                                    docType: type as DocType,
                                    state: DocState.NOT_STARTED,
                                    version: '-',
                                    progress: 0,
                                    assignees: node.assignees || [], 
                                    authorId: 'system',
                                    authorName: 'Sistema',
                                    files: [],
                                    createdAt: new Date().toISOString(),
                                    updatedAt: '' 
                                };
                                virtualDocs.push(virtualDoc);
                            }
                        });
                    });
                });
            });
        });

        // 3. MERGE
        const allDocs = [...Array.from(latestDocsMap.values()), ...virtualDocs];
        setDocs(allDocs);
        setAllUsers(users);

    } catch (error) {
        console.error("Error loading dashboard data:", error);
    } finally {
        setLoading(false);
    }
  };

  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.preventDefault(); 
    e.stopPropagation();
    // Virtual docs cannot be deleted via API (they exist because of the matrix)
    if (id.startsWith('virtual_')) {
        alert("Este es un documento requerido por la estructura. Para eliminarlo, debe quitar el microproceso en el gestor de Estructura o desmarcar el tipo de documento en Asignaciones.");
        return;
    }

    if (!window.confirm('¿Eliminar este documento permanentemente?')) return;
    await DocumentService.delete(id);
    await loadData();
  };

  // Helper to get formatted assignees names (returns array of names for display filtering)
  const getAssigneesNames = (doc: Document): string[] => {
      if (!doc.assignees || doc.assignees.length === 0) return [doc.authorName]; 
      return doc.assignees
          .map(id => allUsers.find(u => u.id === id)?.name)
          .filter((name): name is string => !!name);
  };

  const handleQuickFilterClick = (type: QuickFilterType) => {
      if (quickFilter === type) {
          setQuickFilter('ALL'); 
      } else {
          setQuickFilter(type);
          setFilterState(''); 
      }
  };

  // --- FILTERING LOGIC ---
  // 1. Get Context Docs (Filtered by dropdowns EXCEPT State)
  //    This ensures stats reflect the selected Project/Macro/etc.
  const getContextDocs = () => {
      let filtered = docs;
      if (filterProject) filtered = filtered.filter(d => d.project === filterProject);
      if (filterMacro) filtered = filtered.filter(d => d.macroprocess === filterMacro);
      if (filterProcess) filtered = filtered.filter(d => d.process === filterProcess);
      if (filterDocType) filtered = filtered.filter(d => d.docType === filterDocType);
      if (filterAnalyst) {
          filtered = filtered.filter(d => {
              const assigneeIds = d.assignees || [];
              return assigneeIds.includes(filterAnalyst);
          });
      }
      return filtered;
  };

  // 2. Get Final Display Docs (Context + State Filter)
  const getFinalDisplayDocs = (contextDocs: Document[]) => {
      let filtered = contextDocs;
      
      // Apply State Filter (Dropdown OR QuickFilter)
      if (filterState) {
          filtered = filtered.filter(d => d.state === filterState);
      } else if (quickFilter !== 'ALL') {
          switch (quickFilter) {
              case 'NOT_STARTED':
                  filtered = filtered.filter(d => d.state === DocState.NOT_STARTED);
                  break;
              case 'IN_PROCESS':
                  filtered = filtered.filter(d => 
                      d.state === DocState.INITIATED || 
                      d.state === DocState.IN_PROCESS || 
                      d.state === DocState.INTERNAL_REVIEW
                  );
                  break;
              case 'REFERENT':
                  filtered = filtered.filter(d => 
                      d.state === DocState.SENT_TO_REFERENT || 
                      d.state === DocState.REFERENT_REVIEW
                  );
                  break;
              case 'CONTROL':
                  filtered = filtered.filter(d => 
                      d.state === DocState.SENT_TO_CONTROL || 
                      d.state === DocState.CONTROL_REVIEW
                  );
                  break;
              case 'FINISHED':
                  filtered = filtered.filter(d => d.state === DocState.APPROVED);
                  break;
              case 'REQUIRED':
                  // All are effectively required in this view
                  break;
          }
      }
      return filtered;
  };

  // Sorting Logic
  const handleSort = (key: SortKey) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  const getSortedDocs = (filtered: Document[]) => {
      return [...filtered].sort((a, b) => {
          const modifier = sortConfig.direction === 'asc' ? 1 : -1;
          
          switch (sortConfig.key) {
              case 'updatedAt':
                  // Handle empty date for virtual docs (treat as old)
                  const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : -1;
                  const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : -1;
                  return (timeA - timeB) * modifier;
              case 'project':
                  return (a.project || '').localeCompare(b.project || '') * modifier;
              case 'microprocess':
                  const nameA = a.microprocess || a.title;
                  const nameB = b.microprocess || b.title;
                  return nameA.localeCompare(nameB) * modifier;
              case 'state':
                   return (a.progress - b.progress) * modifier;
              default:
                  return 0;
          }
      });
  };

  const contextDocs = getContextDocs();
  const filteredDocs = getFinalDisplayDocs(contextDocs);
  const sortedDocs = getSortedDocs(filteredDocs);

  // Extract unique values for dropdowns from the FULL deduplicated list
  const baseDocs = docs;

  const uniqueProjects = Array.from(new Set(baseDocs.map(d => d.project).filter(Boolean))) as string[];
  
  const uniqueMacros = Array.from(new Set(
      baseDocs.filter(d => !filterProject || d.project === filterProject)
      .map(d => d.macroprocess).filter(Boolean)
  )) as string[];
  
  const uniqueProcesses = Array.from(new Set(
      baseDocs.filter(d => (!filterProject || d.project === filterProject) && (!filterMacro || d.macroprocess === filterMacro))
      .map(d => d.process).filter(Boolean)
  )) as string[];

  const uniqueDocTypes = Array.from(new Set(
      baseDocs.filter(d => 
        (!filterProject || d.project === filterProject) && 
        (!filterMacro || d.macroprocess === filterMacro) &&
        (!filterProcess || d.process === filterProcess)
      )
      .map(d => d.docType).filter(Boolean)
  )) as string[];

  // Flattened list of individual analysts
  const uniqueAnalysts = Array.from(new Set(
      baseDocs.filter(d => 
        (!filterProject || d.project === filterProject) && 
        (!filterMacro || d.macroprocess === filterMacro)
      )
      .flatMap(d => getAssigneesNames(d))
  )).sort() as string[];
  
  // Stats Calculation (Based on CONTEXT docs, not Final Filtered Docs)
  // This ensures that if you filter by Project "HPC", the stats show numbers for HPC.
  // But if you click "Finished" card, the stats don't change (showing context distribution).
  const stats = {
    totalRequired: contextDocs.length,
    notStarted: contextDocs.filter(d => d.state === DocState.NOT_STARTED).length,
    inProcess: contextDocs.filter(d => 
        d.state === DocState.INITIATED || 
        d.state === DocState.IN_PROCESS || 
        d.state === DocState.INTERNAL_REVIEW
    ).length,
    referent: contextDocs.filter(d => 
        d.state === DocState.SENT_TO_REFERENT || 
        d.state === DocState.REFERENT_REVIEW
    ).length,
    control: contextDocs.filter(d => 
        d.state === DocState.SENT_TO_CONTROL || 
        d.state === DocState.CONTROL_REVIEW
    ).length,
    finished: contextDocs.filter(d => d.state === DocState.APPROVED).length
  };

  const chartData = [
    { name: 'No Iniciado', value: stats.notStarted, color: '#cbd5e1' },
    { name: 'En Proceso', value: stats.inProcess, color: '#3b82f6' },
    { name: 'Referente', value: stats.referent, color: '#a855f7' },
    { name: 'Control Gestión', value: stats.control, color: '#f97316' },
    { name: 'Terminados', value: stats.finished, color: '#22c55e' },
  ].filter(d => d.value > 0);

  const clearFilters = () => {
      setFilterProject('');
      setFilterMacro('');
      setFilterProcess('');
      setFilterDocType('');
      setFilterState('');
      setFilterAnalyst('');
      setQuickFilter('ALL');
  };

  const hasFilters = filterProject || filterMacro || filterProcess || filterDocType || filterState || filterAnalyst || quickFilter !== 'ALL';

  const SortIcon = ({ column }: { column: SortKey }) => {
      if (sortConfig.key !== column) return <ArrowUpDown size={14} className="text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />;
      return sortConfig.direction === 'asc' 
        ? <ArrowUp size={14} className="text-indigo-600" /> 
        : <ArrowDown size={14} className="text-indigo-600" />;
  };

  const handleVirtualDocClick = (doc: Document) => {
      // Pass pre-filled data to CreateDocument via location state
      navigate('/new', {
          state: {
              prefill: {
                  project: doc.project,
                  macro: doc.macroprocess,
                  process: doc.process,
                  micro: doc.microprocess,
                  docType: doc.docType
              }
          }
      });
  };

  // Show analyst filter for everyone now
  const showAnalystFilter = true; 

  if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Actualizando dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500">Vista general</p>
        </div>
        <div className="flex gap-2">
            {user.role === UserRole.ADMIN && (
                <Link to="/admin/users" className="inline-flex items-center justify-center px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                    <Users size={18} className="mr-2" />
                    Gestionar Usuarios
                </Link>
            )}
            {user.role === UserRole.ANALYST && (
                <Link to="/new" className="inline-flex items-center justify-center px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
                    <Plus size={18} className="mr-2" />
                    Nueva Solicitud
                </Link>
            )}
        </div>
      </div>

      {/* Stats Cards - Interactive */}
      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
        <StatCard 
            title="Doc. Requeridos" 
            value={stats.totalRequired} 
            icon={BookOpen} 
            color="bg-slate-100 text-slate-600" 
            isActive={quickFilter === 'REQUIRED'}
            onClick={() => handleQuickFilterClick('REQUIRED')}
        />
        <StatCard 
            title="No Iniciado" 
            value={stats.notStarted} 
            icon={Clock} 
            color="bg-slate-50 text-slate-400 border-slate-200" 
            isActive={quickFilter === 'NOT_STARTED'}
            onClick={() => handleQuickFilterClick('NOT_STARTED')}
        />
        <StatCard 
            title="En Proceso" 
            value={stats.inProcess} 
            icon={Activity} 
            color="bg-blue-100 text-blue-600" 
            isActive={quickFilter === 'IN_PROCESS'}
            onClick={() => handleQuickFilterClick('IN_PROCESS')}
        />
        <StatCard 
            title="Referente" 
            value={stats.referent} 
            icon={Users} 
            color="bg-purple-100 text-purple-600" 
            isActive={quickFilter === 'REFERENT'}
            onClick={() => handleQuickFilterClick('REFERENT')}
        />
        <StatCard 
            title="Control Gestión" 
            value={stats.control} 
            icon={ShieldCheck} 
            color="bg-orange-100 text-orange-600" 
            isActive={quickFilter === 'CONTROL'}
            onClick={() => handleQuickFilterClick('CONTROL')}
        />
        <StatCard 
            title="Terminados" 
            value={stats.finished} 
            icon={CheckCircle} 
            color="bg-green-100 text-green-600" 
            isActive={quickFilter === 'FINISHED'}
            onClick={() => handleQuickFilterClick('FINISHED')}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Document List (Takes up 3 columns) */}
        <div className="lg:col-span-3 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50">
                <div className="flex items-center justify-between mb-3">
                    <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                        <Filter size={18} className="text-indigo-600" />
                        Todos los Documentos
                    </h2>
                    {hasFilters && (
                        <button onClick={clearFilters} className="text-xs text-red-500 flex items-center gap-1 hover:underline">
                            <X size={14} /> Limpiar filtros
                        </button>
                    )}
                </div>
                
                {quickFilter !== 'ALL' && (
                    <div className="mb-3 px-3 py-2 bg-indigo-50 border border-indigo-100 rounded-lg text-sm text-indigo-700 flex items-center justify-between">
                        <span>
                            Filtrando por: <strong>
                                {quickFilter === 'REQUIRED' && 'Total Requeridos'}
                                {quickFilter === 'NOT_STARTED' && 'No Iniciados'}
                                {quickFilter === 'IN_PROCESS' && 'En Proceso'}
                                {quickFilter === 'REFERENT' && 'En Referente'}
                                {quickFilter === 'CONTROL' && 'Control de Gestión'}
                                {quickFilter === 'FINISHED' && 'Terminados'}
                            </strong>
                        </span>
                        <button onClick={() => setQuickFilter('ALL')} className="text-indigo-500 hover:text-indigo-800"><X size={16}/></button>
                    </div>
                )}

                <div className={`grid grid-cols-1 gap-3 ${showAnalystFilter ? 'md:grid-cols-6' : 'md:grid-cols-5'}`}>
                    <select 
                        value={filterProject} 
                        onChange={(e) => setFilterProject(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Proyecto (Todos)</option>
                        {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    {showAnalystFilter && (
                         <select 
                            value={filterAnalyst} 
                            onChange={(e) => setFilterAnalyst(e.target.value)}
                            className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            <option value="">Analista (Todos)</option>
                            {allUsers
                                .filter(u => u.role === UserRole.ANALYST)
                                .map(u => <option key={u.id} value={u.id}>{u.name}</option>)
                            }
                        </select>
                    )}

                    <select 
                        value={filterMacro} 
                        onChange={(e) => setFilterMacro(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Macro (Todos)</option>
                        {uniqueMacros.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>

                    <select 
                        value={filterProcess} 
                        onChange={(e) => setFilterProcess(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Proceso (Todos)</option>
                        {uniqueProcesses.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    <select 
                        value={filterDocType} 
                        onChange={(e) => setFilterDocType(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Doc (Todos)</option>
                        {uniqueDocTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>

                    <select 
                        value={filterState} 
                        onChange={(e) => {
                            setFilterState(e.target.value);
                            setQuickFilter('ALL'); // Disable quick filter if manual state is selected
                        }}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                        disabled={quickFilter !== 'ALL' && quickFilter !== 'REQUIRED'}
                    >
                        <option value="">Estado (Todos)</option>
                        {Object.keys(STATE_CONFIG).map(key => (
                            <option key={key} value={key}>{STATE_CONFIG[key as DocState].label.split('(')[0]}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th 
                                className="px-4 py-3 cursor-pointer hover:bg-slate-100 group select-none"
                                onClick={() => handleSort('project')}
                            >
                                <div className="flex items-center gap-1">
                                    PROYECTO <SortIcon column="project" />
                                </div>
                            </th>
                            <th className="px-4 py-3">Jerarquía (Macro / Proceso)</th>
                            <th 
                                className="px-4 py-3 cursor-pointer hover:bg-slate-100 group select-none"
                                onClick={() => handleSort('microprocess')}
                            >
                                <div className="flex items-center gap-1">
                                    MICROPROCESO <SortIcon column="microprocess" />
                                </div>
                            </th>
                            <th className="px-4 py-3">Documento</th>
                            <th 
                                className="px-4 py-3 cursor-pointer hover:bg-slate-100 group select-none"
                                onClick={() => handleSort('state')}
                            >
                                <div className="flex items-center gap-1">
                                    Estado Actual <SortIcon column="state" />
                                </div>
                            </th>
                            <th 
                                className="px-4 py-3 cursor-pointer hover:bg-slate-100 group select-none"
                                onClick={() => handleSort('updatedAt')}
                            >
                                <div className="flex items-center gap-1">
                                    Última Actividad <SortIcon column="updatedAt" />
                                </div>
                            </th>
                            {user.role === UserRole.ADMIN && <th className="px-4 py-3 text-right">Admin</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {sortedDocs.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-400">No se encontraron documentos con los filtros aplicados.</td></tr>
                        ) : (
                            sortedDocs.map(doc => {
                                const isVirtual = doc.id.startsWith('virtual_');
                                const isRequired = true; // All items in this unified view are relevant
                                
                                const rowClass = isVirtual
                                    ? "border-b border-slate-50 bg-slate-50/80 text-slate-500 hover:bg-indigo-50/30 transition-colors"
                                    : "border-b border-slate-50 hover:bg-slate-50 transition-colors";
                                
                                const isNotStarted = doc.state === DocState.NOT_STARTED;

                                return (
                                    <tr key={doc.id} className={rowClass}>
                                        <td className="px-4 py-3 font-bold">
                                            {doc.project}
                                        </td>
                                        <td className="px-4 py-3 text-xs">
                                            <div className="font-medium">{doc.macroprocess}</div>
                                            <div>{doc.process}</div>
                                        </td>
                                        <td className="px-4 py-3 font-medium">
                                            {doc.microprocess || doc.title}
                                            
                                            {/* VISUALIZACIÓN VERTICAL DE ANALISTAS */}
                                            {showAnalystFilter && doc.assignees && doc.assignees.length > 0 && (
                                                <div className="flex flex-col gap-1 mt-1">
                                                    {doc.assignees.map(aid => {
                                                        const u = allUsers.find(user => user.id === aid);
                                                        return u ? (
                                                            <div key={aid} className="flex items-center gap-1 text-[10px] text-indigo-600">
                                                                <Users size={10} /> {u.name}
                                                            </div>
                                                        ) : null;
                                                    })}
                                                </div>
                                            )}
                                            {(!doc.assignees || doc.assignees.length === 0) && (
                                                <div className="text-[10px] text-red-300 italic mt-1">Sin asignar</div>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col items-start gap-1">
                                                {doc.docType && (
                                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                                                        isRequired 
                                                        ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
                                                        : 'bg-slate-200 text-slate-500 border-slate-300'
                                                    }`}>
                                                        {doc.docType}
                                                    </span>
                                                )}
                                                
                                                {isVirtual ? (
                                                    <button onClick={() => handleVirtualDocClick(doc)} className="text-sm flex items-center text-indigo-500 hover:text-indigo-700 hover:underline">
                                                        <PlayCircle size={14} className="mr-1"/> Iniciar Proceso
                                                    </button>
                                                ) : (
                                                    <Link to={`/doc/${doc.id}`} className="text-sm flex items-center hover:underline text-indigo-600 hover:text-indigo-800">
                                                        Ver Detalle <ArrowRight size={12} className="ml-1" />
                                                    </Link>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            <div className="flex flex-col items-start gap-1">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATE_CONFIG[doc.state].color}`}>
                                                    {STATE_CONFIG[doc.state].label.split('(')[0]}
                                                </span>
                                                {!isNotStarted && (
                                                    <span className="text-xs font-mono ml-1">
                                                        Ver: {doc.version} ({doc.progress}%)
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-4 py-3">
                                            {doc.updatedAt ? (
                                                <>
                                                    <div className="flex items-center gap-1.5">
                                                        <Calendar size={14} className={isRequired ? "text-slate-400" : "text-slate-300"} />
                                                        <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                                                    </div>
                                                    <div className="text-xs pl-5 opacity-70">
                                                        {new Date(doc.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) !== 'Invalid Date' 
                                                            ? new Date(doc.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                                            : ''
                                                        }
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="text-xs text-slate-400 italic flex items-center gap-1">
                                                    <Clock size={12} /> Pendiente
                                                </div>
                                            )}
                                        </td>
                                        {user.role === UserRole.ADMIN && (
                                            <td className="px-4 py-3 text-right">
                                                <button 
                                                    onClick={(e) => handleDeleteDoc(doc.id, e)}
                                                    className={`text-slate-400 hover:text-red-600 transition-colors p-1 ${isVirtual ? 'opacity-30 cursor-help' : ''}`}
                                                    title={isVirtual ? "Gestione la estructura para eliminar este requisito" : "Eliminar Documento"}
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </td>
                                        )}
                                    </tr>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Chart Column */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center min-h-[300px]">
                <h2 className="font-semibold text-slate-800 w-full mb-4 text-center">Estado General</h2>
                {chartData.length > 0 ? (
                    /* FIX: Enforce minHeight on parent AND strict minWidth/minHeight on ResponsiveContainer to prevent 0x0 render crash */
                    <div className="w-full h-64 min-h-[256px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={200} minHeight={200}>
                            <PieChart>
                                <Pie
                                    data={chartData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {chartData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <p className="text-slate-400 text-center text-sm px-4">No hay datos requeridos para los filtros seleccionados.</p>
                )}
            </div>

            {/* Quick Summary Box */}
            <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
                <h3 className="font-bold text-indigo-900 mb-2">Resumen</h3>
                <p className="text-sm text-indigo-700 mb-4">
                    Visualizando {filteredDocs.length} procesos totales.
                </p>
                <ul className="text-sm space-y-2 text-indigo-800">
                    <li className="flex justify-between border-b border-indigo-200 pb-1">
                        <span>Total Requeridos:</span>
                        <span className="font-bold">{stats.totalRequired}</span>
                    </li>
                    <li className="flex justify-between border-b border-indigo-200 pb-1">
                        <span>No Iniciados:</span>
                        <span className="font-bold text-slate-500">{stats.notStarted}</span>
                    </li>
                    <li className="flex justify-between border-b border-indigo-200 pb-1">
                        <span>Terminados:</span>
                        <span className="font-bold text-green-600">{stats.finished}</span>
                    </li>
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color, isActive, onClick }: any) => (
    <div 
        onClick={onClick}
        className={`bg-white p-3 rounded-xl shadow-sm border transition-all cursor-pointer flex items-center space-x-3 hover:shadow-md select-none
        ${isActive ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/20' : 'border-slate-200 hover:border-indigo-300'}`}
    >
        <div className={`p-2 rounded-lg ${color}`}>
            <Icon size={20} />
        </div>
        <div>
            <p className="text-slate-500 text-[10px] font-bold uppercase leading-tight">{title}</p>
            <p className={`text-xl font-bold leading-tight ${isActive ? 'text-indigo-700' : 'text-slate-900'}`}>{value}</p>
        </div>
    </div>
);

export default Dashboard;
