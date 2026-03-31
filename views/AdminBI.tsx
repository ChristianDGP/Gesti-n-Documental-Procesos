import React, { useState, useEffect } from 'react';
import { 
  DocumentService, 
  HistoryService, 
  HierarchyService, 
  ReferentService,
  UserService
} from '../services/firebaseBackend';
import { 
  FileSpreadsheet, 
  Search, 
  Download, 
  Filter, 
  ChevronRight, 
  Database,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  Table,
  History,
  Users,
  ArrowRight,
  RefreshCw
} from 'lucide-react';
import { Document, DocHistory, Referent, User, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { toast } from 'sonner';

type DataSource = 'DOCUMENTS' | 'HISTORY' | 'HIERARCHY';

interface QueryFilter {
  id: string;
  field: string;
  operator: 'equals' | 'contains' | 'greater' | 'less' | 'not_equals';
  value: string;
}

const COLUMN_LABELS: Record<string, string> = {
  id: 'ID Interno',
  project: 'Proyecto',
  macroprocess: 'Macroproceso',
  process: 'Proceso',
  microprocess: 'Microproceso',
  docType: 'Tipo de Documento',
  title: 'Título del Documento',
  description: 'Descripción',
  version: 'Versión',
  state: 'Estado Actual',
  progress: 'Progreso (%)',
  authorName: 'Autor/Analista',
  createdAt: 'Fecha de Creación',
  updatedAt: 'Última Actualización',
  expectedEndDate: 'Fecha Meta (Gantt)',
  documentId: 'ID del Documento',
  userId: 'ID de Usuario',
  userName: 'Usuario que Ejecuta',
  action: 'Acción Realizada',
  previousState: 'Estado Anterior',
  newState: 'Estado Nuevo',
  comment: 'Comentario/Nota',
  timestamp: 'Fecha y Hora',
  assignees: 'Analistas Asignados',
  referents: 'Nombres de Referentes',
  referentEmails: 'Correos de Referentes',
  requiredTypes: 'Documentos Requeridos',
  status: 'Estado de Avance (Matriz)',
  active: 'Estado Activo (Matriz)'
};

interface AdminBIProps {
  hideHeader?: boolean;
}

const AdminBI: React.FC<AdminBIProps> = ({ hideHeader = false }) => {
  const [source, setSource] = useState<DataSource>('DOCUMENTS');
  const [filters, setFilters] = useState<QueryFilter[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  
  // Data state
  const [documents, setDocuments] = useState<Document[]>([]);
  const [history, setHistory] = useState<DocHistory[]>([]);
  const [hierarchy, setHierarchy] = useState<any[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [referents, setReferents] = useState<Referent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [docs, hist, hier, usrs, refs] = await Promise.all([
        DocumentService.getAll(),
        HistoryService.getAll(),
        HierarchyService.getFullHierarchy(),
        UserService.getAll(),
        ReferentService.getAll()
      ]);
      
      // Create a lookup map for hierarchy nodes to speed up enrichment
      const hierarchyLookup: Record<string, any> = {};
      Object.entries(hier).forEach(([proj, macros]: [string, any]) => {
        Object.entries(macros).forEach(([macro, procs]: [string, any]) => {
          Object.entries(procs).forEach(([proc, micros]: [string, any]) => {
            micros.forEach((m: any) => {
              const key = `${proj}|${m.name}`;
              hierarchyLookup[key] = m;
            });
          });
        });
      });

      // Enrich Documents with Referents from Hierarchy
      const enrichedDocs = docs.map(d => {
        const key = `${d.project}|${d.microprocess}`;
        const node = hierarchyLookup[key];
        return {
          ...d,
          referentIds: node?.referentIds || []
        };
      });
      setDocuments(enrichedDocs);
      setHistory(hist);
      
      // Flatten hierarchy and enrich with current status from Documents
      const flatHier: any[] = [];
      Object.entries(hier).forEach(([project, macros]: [string, any]) => {
        Object.entries(macros).forEach(([macro, processes]: [string, any]) => {
          Object.entries(processes).forEach(([process, micros]: [string, any]) => {
            micros.forEach((micro: any) => {
              const relatedDocs = docs.filter(d => d.project === project && d.microprocess === micro.name);
              
              let summaryState = 'No Iniciado';
              if (relatedDocs.length > 0) {
                const allApproved = (micro.requiredTypes || []).every((t: string) => 
                  relatedDocs.some(d => d.docType === t && d.state === DocState.APPROVED)
                );
                summaryState = allApproved ? 'Terminado' : 'En Proceso';
              }

              flatHier.push({
                project,
                macroprocess: macro,
                process,
                microprocess: micro.name,
                assignees: micro.assignees,
                referentIds: micro.referentIds,
                requiredTypes: micro.requiredTypes,
                active: micro.active,
                status: summaryState
              });
            });
          });
        });
      });
      setHierarchy(flatHier);
      setUsers(usrs);
      setReferents(refs);
      
      // Set default columns based on source
      setDefaultColumns('DOCUMENTS');
    } catch (error) {
      console.error(error);
      toast.error('Error al cargar datos para BI');
    } finally {
      setIsLoading(false);
    }
  };

  const setDefaultColumns = (src: DataSource) => {
    if (src === 'DOCUMENTS') {
      setSelectedColumns(['project', 'macroprocess', 'process', 'microprocess', 'docType', 'version', 'state', 'progress', 'authorName', 'updatedAt']);
    } else if (src === 'HISTORY') {
      setSelectedColumns(['documentId', 'userName', 'action', 'previousState', 'newState', 'version', 'comment', 'timestamp']);
    } else if (src === 'HIERARCHY') {
      setSelectedColumns(['project', 'macroprocess', 'process', 'microprocess', 'assignees', 'referents']);
    }
  };

  const handleSourceChange = (newSource: DataSource) => {
    setSource(newSource);
    setFilters([]);
    setDefaultColumns(newSource);
  };

  const addFilter = () => {
    const newFilter: QueryFilter = {
      id: Math.random().toString(36).substr(2, 9),
      field: getAvailableFields()[0]?.key || '',
      operator: 'equals',
      value: ''
    };
    setFilters([...filters, newFilter]);
  };

  const removeFilter = (id: string) => {
    setFilters(filters.filter(f => f.id !== id));
  };

  const updateFilter = (id: string, updates: Partial<QueryFilter>) => {
    setFilters(filters.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const getAvailableFields = () => {
    if (source === 'DOCUMENTS') {
      return [
        { key: 'project', label: 'Proyecto' },
        { key: 'macroprocess', label: 'Macroproceso' },
        { key: 'process', label: 'Proceso' },
        { key: 'microprocess', label: 'Microproceso' },
        { key: 'docType', label: 'Tipo Documento' },
        { key: 'state', label: 'Estado' },
        { key: 'progress', label: 'Progreso (%)' },
        { key: 'authorName', label: 'Autor' },
        { key: 'version', label: 'Versión' },
        { key: 'referents', label: 'Referentes' }
      ];
    } else if (source === 'HISTORY') {
      return [
        { key: 'userName', label: 'Usuario' },
        { key: 'action', label: 'Acción' },
        { key: 'newState', label: 'Estado Nuevo' },
        { key: 'version', label: 'Versión' }
      ];
    } else {
      return [
        { key: 'project', label: 'Proyecto' },
        { key: 'macroprocess', label: 'Macroproceso' },
        { key: 'process', label: 'Proceso' },
        { key: 'microprocess', label: 'Microproceso' },
        { key: 'status', label: 'Estado de Avance' }
      ];
    }
  };

  const getAllColumns = () => {
    if (source === 'DOCUMENTS') {
      return [
        'id', 'project', 'macroprocess', 'process', 'microprocess', 'docType', 
        'title', 'description', 'version', 'state', 'progress', 'authorName', 
        'createdAt', 'updatedAt', 'expectedEndDate', 'referents', 'referentEmails'
      ];
    } else if (source === 'HISTORY') {
      return [
        'id', 'documentId', 'userId', 'userName', 'action', 'previousState', 
        'newState', 'version', 'comment', 'timestamp'
      ];
    } else {
      return [
        'project', 'macroprocess', 'process', 'microprocess', 'assignees', 
        'referents', 'referentEmails', 'requiredTypes', 'active', 'status'
      ];
    }
  };

  const toggleColumn = (col: string) => {
    if (selectedColumns.includes(col)) {
      setSelectedColumns(selectedColumns.filter(c => c !== col));
    } else {
      setSelectedColumns([...selectedColumns, col]);
    }
  };

  const formatValue = (item: any, col: string) => {
    let val = item[col];
    
    if (col === 'assignees' && Array.isArray(val)) {
      return val.map(uid => users.find(u => u.id === uid)?.name || uid).join(', ');
    } else if (col === 'referents') {
      const refIds = item.referentIds || [];
      return refIds
        .map((rid: string) => referents.find(r => r.id === rid)?.name)
        .filter((name: string | undefined): name is string => !!name)
        .join(', ');
    } else if (col === 'referentEmails') {
      const refIds = item.referentIds || [];
      return refIds
        .map((rid: string) => referents.find(r => r.id === rid)?.email)
        .filter((email: string | undefined): email is string => !!email)
        .join(', ');
    } else if (col === 'requiredTypes' && Array.isArray(val)) {
      return val.join(', ');
    } else if (val === undefined || val === null) {
      return '';
    }
    
    return String(val);
  };

  const executeQuery = () => {
    let data: any[] = [];
    if (source === 'DOCUMENTS') data = [...documents];
    else if (source === 'HISTORY') data = [...history];
    else data = [...hierarchy];

    // Apply filters
    const filteredData = data.filter(item => {
      return filters.every(f => {
        const itemValue = String(item[f.field] || '').toLowerCase();
        const filterValue = f.value.toLowerCase();

        switch (f.operator) {
          case 'equals': return itemValue === filterValue;
          case 'contains': return itemValue.includes(filterValue);
          case 'not_equals': return itemValue !== filterValue;
          case 'greater': return parseFloat(itemValue) > parseFloat(filterValue);
          case 'less': return parseFloat(itemValue) < parseFloat(filterValue);
          default: return true;
        }
      });
    });

    return filteredData;
  };

  const handleExport = async () => {
    setIsGenerating(true);
    try {
      const data = executeQuery();
      
      if (data.length === 0) {
        toast.error('No hay resultados para exportar');
        return;
      }

      // Prepare CSV content
      const headers = selectedColumns.map(col => COLUMN_LABELS[col] || col).join(';');
      const rows = data.map(item => {
        return selectedColumns.map(col => {
          const val = formatValue(item, col);
          // Sanitize for CSV
          return `"${String(val).replace(/"/g, '""')}"`;
        }).join(';');
      });

      const csvContent = [headers, ...rows].join('\n');
      const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `reporte_bi_${source.toLowerCase()}_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success(`Reporte generado con ${data.length} registros`);
    } catch (error) {
      console.error(error);
      toast.error('Error al generar el reporte');
    } finally {
      setIsGenerating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <RefreshCw className="animate-spin text-indigo-600" size={32} />
        <p className="text-slate-500 font-medium">Cargando motor de BI...</p>
      </div>
    );
  }

  return (
    <div className={`space-y-6 max-w-7xl mx-auto pb-20 px-4 ${hideHeader ? 'pt-4' : ''}`}>
      {!hideHeader && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Database className="text-indigo-600" />
              Constructor de Consultas BI
            </h1>
            <p className="text-slate-500">Extrae datos crudos y genera reportes personalizados para análisis externo.</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Configuration */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Step 1: Source */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs">1</span>
              Origen de Datos
            </h2>
            <div className="space-y-2">
              <button 
                onClick={() => handleSourceChange('DOCUMENTS')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${source === 'DOCUMENTS' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <Table size={18} />
                <div className="text-left">
                  <p className="font-bold text-sm">Maestro de Documentos</p>
                  <p className="text-xs opacity-70">Estado actual de todos los archivos.</p>
                </div>
              </button>
              <button 
                onClick={() => handleSourceChange('HISTORY')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${source === 'HISTORY' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <History size={18} />
                <div className="text-left">
                  <p className="font-bold text-sm">Historial de Gestiones</p>
                  <p className="text-xs opacity-70">Trazabilidad de cambios y acciones.</p>
                </div>
              </button>
              <button 
                onClick={() => handleSourceChange('HIERARCHY')}
                className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-all ${source === 'HIERARCHY' ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
              >
                <Users size={18} />
                <div className="text-left">
                  <p className="font-bold text-sm">Matriz de Asignaciones</p>
                  <p className="text-xs opacity-70">Jerarquía y responsables vinculados.</p>
                </div>
              </button>
            </div>
          </div>

          {/* Step 4: Export */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs">4</span>
              Generar Reporte
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Se generará un archivo CSV compatible con Excel con los filtros y columnas seleccionados.
            </p>
            <button 
              onClick={handleExport}
              disabled={isGenerating}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 rounded-lg shadow-md transition-all disabled:opacity-50"
            >
              {isGenerating ? (
                <RefreshCw size={18} className="animate-spin" />
              ) : (
                <Download size={18} />
              )}
              EXPORTAR A EXCEL
            </button>
          </div>
        </div>

        {/* Right Column: Filters and Columns */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Step 2: Filters */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs">2</span>
                Definir Filtros (Condiciones)
              </h2>
              <button 
                onClick={addFilter}
                className="text-xs font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-1"
              >
                <Plus size={14} /> Añadir Filtro
              </button>
            </div>

            {filters.length === 0 ? (
              <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-lg">
                <Filter className="mx-auto text-slate-300 mb-2" size={32} />
                <p className="text-sm text-slate-400">No hay filtros aplicados. Se extraerán todos los datos.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filters.map((filter) => (
                  <div key={filter.id} className="flex flex-col sm:flex-row gap-2 items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                    <select 
                      value={filter.field}
                      onChange={(e) => updateFilter(filter.id, { field: e.target.value })}
                      className="w-full sm:w-1/3 text-sm border-slate-200 rounded-md focus:ring-indigo-500"
                    >
                      {getAvailableFields().map(f => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </select>
                    <select 
                      value={filter.operator}
                      onChange={(e) => updateFilter(filter.id, { operator: e.target.value as any })}
                      className="w-full sm:w-1/4 text-sm border-slate-200 rounded-md focus:ring-indigo-500"
                    >
                      <option value="equals">es igual a</option>
                      <option value="contains">contiene</option>
                      <option value="not_equals">no es igual a</option>
                      <option value="greater">es mayor que</option>
                      <option value="less">es menor que</option>
                    </select>
                    <input 
                      type="text"
                      value={filter.value}
                      onChange={(e) => updateFilter(filter.id, { value: e.target.value })}
                      placeholder="Valor..."
                      className="w-full sm:flex-1 text-sm border-slate-200 rounded-md focus:ring-indigo-500"
                    />
                    <button 
                      onClick={() => removeFilter(filter.id)}
                      className="p-2 text-slate-400 hover:text-rose-600 transition-colors"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Step 3: Columns */}
          <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span className="w-6 h-6 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center text-xs">3</span>
              Seleccionar Columnas (Resultado)
            </h2>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
              {getAllColumns().map(col => (
                <button
                  key={col}
                  onClick={() => toggleColumn(col)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border transition-all ${selectedColumns.includes(col) ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'}`}
                >
                  {selectedColumns.includes(col) ? <CheckCircle2 size={14} /> : <div className="w-3.5 h-3.5 rounded-full border border-slate-300"></div>}
                  {COLUMN_LABELS[col] || col}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Full Width Preview Sections */}
        <div className="lg:col-span-3 space-y-6">
          {/* Preview Section */}
          <div className="bg-slate-900 rounded-xl p-6 text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 p-4 opacity-10">
              <Search size={120} />
            </div>
            <div className="relative z-10">
              <h3 className="text-lg font-bold mb-2 flex items-center gap-2">
                <Search size={20} className="text-indigo-400" />
                Vista Previa de la Consulta
              </h3>
              <div className="bg-slate-800/50 p-4 rounded-lg font-mono text-xs text-indigo-300 border border-slate-700">
                <p><span className="text-pink-400">SELECT</span> {selectedColumns.length > 0 ? selectedColumns.map(c => COLUMN_LABELS[c] || c).join(', ') : '*'}</p>
                <p><span className="text-pink-400">FROM</span> {source === 'DOCUMENTS' ? 'Maestro_Documentos' : source === 'HISTORY' ? 'Historial_Gestiones' : 'Matriz_Asignaciones'}</p>
                {filters.length > 0 && (
                  <p>
                    <span className="text-pink-400">WHERE</span> {filters.map((f, i) => (
                      <span key={f.id}>
                        {i > 0 && <span className="text-pink-400"> AND </span>}
                        {COLUMN_LABELS[f.field] || f.field} {f.operator === 'equals' ? '=' : f.operator === 'contains' ? 'LIKE' : f.operator} '{f.value}'
                      </span>
                    ))}
                  </p>
                )}
              </div>
              <div className="mt-4 flex items-center justify-between text-sm">
                <span className="text-slate-400">Resultados estimados: <span className="text-white font-bold">{executeQuery().length}</span></span>
                <div className="flex items-center gap-1 text-indigo-400">
                  <span>Listo para exportar</span>
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          </div>

          {/* Results Preview Grid */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 bg-slate-50 flex justify-between items-center">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Table size={16} className="text-indigo-600" />
                Vista Previa de Datos (Top 10)
              </h3>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                {executeQuery().length} registros encontrados
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    {selectedColumns.map(col => (
                      <th key={col} className="p-3 text-[10px] font-black text-slate-400 uppercase tracking-widest whitespace-nowrap">
                        {COLUMN_LABELS[col] || col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {executeQuery().slice(0, 10).map((item, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                      {selectedColumns.map(col => (
                        <td key={col} className="p-3 text-xs text-slate-600 max-w-[300px] truncate">
                          {formatValue(item, col)}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {executeQuery().length === 0 && (
                    <tr>
                      <td colSpan={selectedColumns.length || 1} className="p-10 text-center text-slate-400 italic text-sm">
                        No hay datos que coincidan con los filtros aplicados.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {executeQuery().length > 10 && (
              <div className="p-3 bg-slate-50 border-t border-slate-100 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Mostrando solo los primeros 10 registros. Use "Exportar" para ver el reporte completo.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminBI;
