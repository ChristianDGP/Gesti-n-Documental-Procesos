
import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService, HierarchyService } from '../services/firebaseBackend';
import { Document, User, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { Filter, ArrowRight, Calendar, ListTodo, Activity, FileText, Search, ArrowUp, ArrowDown, ArrowUpDown, X } from 'lucide-react';

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

  const loadData = async () => {
    setLoading(true);
    try {
        // 1. Fetch Documents AND Hierarchy to validate structure existence
        const [allDocs, hierarchy] = await Promise.all([
            DocumentService.getAll(),
            HierarchyService.getFullHierarchy()
        ]);
        
        // 2. Build a Set of VALID and ACTIVE structure keys (Project|Microprocess)
        const validStructureKeys = new Set<string>();

        Object.keys(hierarchy).forEach(proj => {
            Object.keys(hierarchy[proj]).forEach(macro => {
                Object.keys(hierarchy[proj][macro]).forEach(proc => {
                    hierarchy[proj][macro][proc].forEach(node => {
                        // Only include if the node exists and is ACTIVE
                        if (node.active !== false) {
                            validStructureKeys.add(`${proj}|${node.name}`);
                        }
                    });
                });
            });
        });

        // 3. Filtrar mis asignaciones, excluir terminados y VALIDAR ESTRUCTURA
        const myActiveDocs = allDocs.filter(d => 
            d.assignees && 
            d.assignees.includes(user.id) &&
            d.state !== DocState.APPROVED &&
            // Check if the document belongs to an existing/active microprocess
            validStructureKeys.has(`${d.project}|${d.microprocess}`)
        );

        // 4. AGRUPACIÓN Y DEDUPLICACIÓN DE VERSIONES
        const latestDocsMap = new Map<string, Document>();

        myActiveDocs.forEach(doc => {
            const uniqueKey = `${doc.project || 'Gen'}|${doc.microprocess || doc.title}|${doc.docType || 'Gen'}`;
            const existing = latestDocsMap.get(uniqueKey);

            if (!existing || new Date(doc.updatedAt) > new Date(existing.updatedAt)) {
                latestDocsMap.set(uniqueKey, doc);
            }
        });

        const finalDocs = Array.from(latestDocsMap.values());
        setDocs(finalDocs);

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

      // 1. Filter by State Dropdown
      if (filterState) {
          filtered = filtered.filter(d => d.state === filterState);
      }

      // 2. Filter by Search Term
      if (searchTerm) {
          const lowerTerm = searchTerm.toLowerCase();
          filtered = filtered.filter(d => 
              (d.project || '').toLowerCase().includes(lowerTerm) ||
              (d.microprocess || '').toLowerCase().includes(lowerTerm) ||
              (d.title || '').toLowerCase().includes(lowerTerm) ||
              (d.docType || '').toLowerCase().includes(lowerTerm)
          );
      }

      // 3. Sort
      return filtered.sort((a, b) => {
          const modifier = sortConfig.direction === 'asc' ? 1 : -1;

          switch (sortConfig.key) {
              case 'microprocess':
                  const microA = a.microprocess || a.title || '';
                  const microB = b.microprocess || b.title || '';
                  return microA.localeCompare(microB) * modifier;
              
              case 'state':
                  // Sort by logical progress % defined in constants
                  const progA = STATE_CONFIG[a.state]?.progress || 0;
                  const progB = STATE_CONFIG[b.state]?.progress || 0;
                  return (progA - progB) * modifier;

              case 'updatedAt':
                  const dateA = new Date(a.updatedAt).getTime();
                  const dateB = new Date(b.updatedAt).getTime();
                  return (dateA - dateB) * modifier;
              
              default:
                  return 0;
          }
      });
  }, [docs, filterState, searchTerm, sortConfig]);

  // Helper for Sort Icons
  const SortIcon = ({ column }: { column: SortOption }) => {
      if (sortConfig.key !== column) return <ArrowUpDown size={14} className="text-slate-300 ml-1 opacity-0 group-hover:opacity-100 transition-opacity" />;
      return sortConfig.direction === 'asc' 
        ? <ArrowUp size={14} className="text-indigo-600 ml-1" /> 
        : <ArrowDown size={14} className="text-indigo-600 ml-1" />;
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
            <p className="text-slate-500">Documentos activos pendientes de gestión (Últimas versiones).</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* Filter Bar */}
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Activity size={18} className="text-indigo-600" />
                    Mis Pendientes
                </h2>
                
                <div className="flex flex-col md:flex-row items-center gap-3 w-full md:w-auto">
                    {/* SEARCH INPUT */}
                    <div className="relative w-full md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar microproceso, tipo..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 pr-8 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                        {searchTerm && (
                            <button 
                                onClick={() => setSearchTerm('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* STATE FILTER */}
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
                            
                            {/* SORTABLE: MICROPROCESS */}
                            <th 
                                className="px-4 py-3 cursor-pointer hover:bg-slate-100 group select-none transition-colors"
                                onClick={() => handleSort('microprocess')}
                            >
                                <div className="flex items-center">
                                    Microproceso <SortIcon column="microprocess" />
                                </div>
                            </th>
                            
                            <th className="px-4 py-3">Documento / Tipo</th>
                            
                            {/* SORTABLE: STATE */}
                            <th 
                                className="px-4 py-3 cursor-pointer hover:bg-slate-100 group select-none transition-colors"
                                onClick={() => handleSort('state')}
                            >
                                <div className="flex items-center">
                                    Estado Actual <SortIcon column="state" />
                                </div>
                            </th>
                            
                            <th className="px-4 py-3">Versión</th>
                            
                            {/* SORTABLE: UPDATED AT */}
                            <th 
                                className="px-4 py-3 cursor-pointer hover:bg-slate-100 group select-none transition-colors"
                                onClick={() => handleSort('updatedAt')}
                            >
                                <div className="flex items-center">
                                    Última Actualización <SortIcon column="updatedAt" />
                                </div>
                            </th>
                            
                            <th className="px-4 py-3 text-right">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedDocs.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                                {filterState || searchTerm 
                                    ? 'No se encontraron documentos con los filtros aplicados.' 
                                    : '¡Todo al día! No tienes documentos pendientes de gestión.'}
                            </td></tr>
                        ) : (
                            processedDocs.map(doc => (
                                <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
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
                                            ) : (
                                                <span className="text-sm text-slate-600 truncate max-w-[150px]">{doc.title}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATE_CONFIG[doc.state].color}`}>
                                            {STATE_CONFIG[doc.state].label.split('(')[0]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 font-mono text-xs">
                                        {doc.version}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-1.5 text-slate-500">
                                            <Calendar size={14} />
                                            <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3 text-right">
                                        <Link to={`/doc/${doc.id}`} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold inline-flex items-center gap-1 hover:underline">
                                            Gestionar <ArrowRight size={12} />
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
