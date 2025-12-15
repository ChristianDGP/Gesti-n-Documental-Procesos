
import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService, HierarchyService } from '../services/firebaseBackend';
import { Document, User, DocState, UserRole, DocType } from '../types';
import { STATE_CONFIG } from '../constants';
import { Filter, ArrowRight, Calendar, ListTodo, Activity, FileText, Search, ArrowUp, ArrowDown, ArrowUpDown, X, AlertTriangle, PlayCircle } from 'lucide-react';

interface Props {
  user: User;
}

type SortOption = 'microprocess' | 'state' | 'updatedAt';

const WorkList: React.FC<Props> = ({ user }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters & Search State
  const [filterState, setFilterState] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Sorting State
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
        
        // 1. Map Real Docs for lookup
        const realDocMap = new Map<string, Document>();
        realDocsData.forEach(doc => {
            if (doc.project && (doc.microprocess || doc.title)) {
                const microName = doc.microprocess || doc.title.split(' - ')[0] || doc.title;
                const docType = doc.docType || 'AS IS';
                const key = `${normalize(doc.project)}|${normalize(microName)}|${normalize(docType)}`;
                
                // Use latest
                const existing = realDocMap.get(key);
                if (!existing || new Date(doc.updatedAt).getTime() > new Date(existing.updatedAt).getTime()) {
                    realDocMap.set(key, { ...doc, microprocess: microName, docType: docType as DocType });
                }
            }
        });

        // 2. Build Work List from Hierarchy (Assignments)
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
                                // Exists in DB
                                const realDoc = realDocMap.get(key)!;
                                
                                // LOGIC: Show if assigned OR if it's pending review and I'm a coordinator
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
                                // Virtual (Not Started)
                                // Only show not started if explicitly assigned
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

        // 3. Add any "Real" documents that might be assigned but outside hierarchy (Orphans)
        realDocMap.forEach((doc) => {
            const isAssigned = doc.assignees && doc.assignees.includes(user.id);
            const isPendingReview = isCoordOrAdmin && reviewStates.includes(doc.state);
            
            if ((isAssigned || isPendingReview) && doc.state !== DocState.APPROVED) {
                const exists = myWorkList.some(d => d.id === doc.id);
                if (!exists) {
                    myWorkList.push(doc);
                }
            }
        });

        setDocs(myWorkList);

    } catch (error) {
        console.error("Error loading work list:", error);
    } finally {
        setLoading(false);
    }
  };

  // --- SORT HANDLER ---
  const handleSort = (key: SortOption) => {
      let direction: 'asc' | 'desc' = 'asc';
      if (sortConfig.key === key && sortConfig.direction === 'asc') {
          direction = 'desc';
      }
      setSortConfig({ key, direction });
  };

  // --- FILTER & SORT LOGIC ---
  const processedDocs = useMemo(() => {
      let filtered = [...docs];

      if (filterState) {
          filtered = filtered.filter(d => d.state === filterState);
      }

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
  }, [docs, filterState, searchTerm, sortConfig]);

  const SortIcon = ({ column }: { column: SortOption }) => {
      if (sortConfig.key !== column) return <ArrowUpDown size={14} className="text-slate-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
      return sortConfig.direction === 'asc' ? <ArrowUp size={14} className="text-indigo-600 ml-1" /> : <ArrowDown size={14} className="text-indigo-600 ml-1" />;
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando lista de trabajo...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                <ListTodo className="text-indigo-600" />
                Lista de Trabajo
            </h1>
            <p className="text-slate-500">
                {user.role === UserRole.ANALYST ? 'Mis asignaciones pendientes.' : 'Revisiones y asignaciones pendientes.'}
            </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Activity size={18} className="text-indigo-600" />
                    Mis Pendientes
                </h2>
                
                <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-8 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        {searchTerm && (
                            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><X size={14} /></button>
                        )}
                    </div>

                    <div className="relative w-full md:w-auto">
                        <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <select 
                            value={filterState} 
                            onChange={(e) => setFilterState(e.target.value)}
                            className="w-full md:w-auto pl-9 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white cursor-pointer"
                        >
                            <option value="">Estado (Todos)</option>
                            {Object.keys(STATE_CONFIG).filter(k => k !== DocState.APPROVED).map(key => (
                                <option key={key} value={key}>{STATE_CONFIG[key as DocState].label.split('(')[0]}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-4 py-3">Proyecto / Macro</th>
                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 group" onClick={() => handleSort('microprocess')}>Microproceso <SortIcon column="microprocess" /></th>
                            <th className="px-4 py-3">Documento</th>
                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 group" onClick={() => handleSort('state')}>Estado <SortIcon column="state" /></th>
                            <th className="px-4 py-3 cursor-pointer hover:bg-slate-100 group" onClick={() => handleSort('updatedAt')}>Fecha <SortIcon column="updatedAt" /></th>
                            <th className="px-4 py-3 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedDocs.length === 0 ? (
                            <tr><td colSpan={6} className="p-8 text-center text-slate-400">Todo al día. No hay pendientes.</td></tr>
                        ) : (
                            processedDocs.map((doc, idx) => (
                                <tr key={`${doc.id}-${idx}`} className={`border-b border-slate-50 hover:bg-slate-50 transition-colors ${doc.hasPendingRequest ? 'bg-indigo-50/30' : ''}`}>
                                    <td className="px-4 py-3">
                                        <div className="font-bold text-slate-700">{doc.project}</div>
                                        <div className="text-xs text-slate-500">{doc.macroprocess}</div>
                                    </td>
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                        {doc.microprocess || 'General'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <FileText size={16} className="text-indigo-400" />
                                            {doc.docType ? (
                                                <span className="text-[11px] font-bold px-1.5 py-0.5 rounded border bg-indigo-50 text-indigo-700 border-indigo-200">
                                                    {doc.docType}
                                                </span>
                                            ) : <span className="text-sm text-slate-600 truncate max-w-[150px]">{doc.title}</span>}
                                            {doc.hasPendingRequest && (
                                                <span className="flex items-center text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-bold animate-pulse" title="Requiere Atención">
                                                    <AlertTriangle size={10} className="mr-1"/> Solicitud
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATE_CONFIG[doc.state].color}`}>
                                            {STATE_CONFIG[doc.state].label.split('(')[0]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <Calendar size={14} />
                                            <span>{doc.state === DocState.NOT_STARTED ? '-' : new Date(doc.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link 
                                            to={`/doc/${doc.id}`} 
                                            state={{ docData: doc }}
                                            className="text-indigo-600 hover:text-indigo-800 text-xs font-bold inline-flex items-center gap-1 hover:underline"
                                        >
                                            Ver Detalle <ArrowRight size={12} />
                                        </Link>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
      </div>
    </div>
  );
};

export default WorkList;
