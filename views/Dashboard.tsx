
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService } from '../services/mockBackend';
import { Document, User, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { Plus, FileText, Clock, CheckCircle, AlertTriangle, Filter, Trash2, Users, Search, X, Calendar, Inbox, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  user: User;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter States
  const [filterProject, setFilterProject] = useState('');
  const [filterMacro, setFilterMacro] = useState('');
  const [filterProcess, setFilterProcess] = useState('');
  const [filterState, setFilterState] = useState('');

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = async () => {
    setLoading(true);
    const data = await DocumentService.getAll();
    setDocs(data);
    setLoading(false);
  };

  const handleDeleteDoc = async (id: string, e: React.MouseEvent) => {
    e.preventDefault(); // Prevent navigation
    if (!window.confirm('¿Eliminar este documento permanentemente?')) return;
    await DocumentService.delete(id);
    await loadDocs();
  };

  const getFilteredDocs = () => {
    let filtered = docs;
    
    // 1. Role based base filtering
    if (user.role === UserRole.ANALYST) {
      filtered = docs.filter(d => 
        d.authorId === user.id || 
        (d.assignees && d.assignees.includes(user.id)) ||
        d.assignedTo === user.id
      );
    }

    // 2. Explicit Filters
    if (filterProject) {
        filtered = filtered.filter(d => d.project === filterProject);
    }
    if (filterMacro) {
        filtered = filtered.filter(d => d.macroprocess === filterMacro);
    }
    if (filterProcess) {
        filtered = filtered.filter(d => d.process === filterProcess);
    }
    if (filterState) {
        filtered = filtered.filter(d => d.state === filterState);
    }

    return filtered;
  };

  const filteredDocs = getFilteredDocs();

  // Extract unique values for dropdowns based on available docs (Cascading optional, here flat for simplicity)
  const uniqueProjects = Array.from(new Set(docs.map(d => d.project).filter(Boolean))) as string[];
  const uniqueMacros = Array.from(new Set(docs.filter(d => !filterProject || d.project === filterProject).map(d => d.macroprocess).filter(Boolean))) as string[];
  const uniqueProcesses = Array.from(new Set(docs.filter(d => !filterMacro || d.macroprocess === filterMacro).map(d => d.process).filter(Boolean))) as string[];
  
  // Calculate Stats (Global for the user, unaffected by temporary filters)
  const baseDocs = user.role === UserRole.ANALYST ? 
    docs.filter(d => d.authorId === user.id || (d.assignees && d.assignees.includes(user.id))) : 
    docs;

  const stats = {
    total: baseDocs.length,
    pending: baseDocs.filter(d => d.state === DocState.INTERNAL_REVIEW || d.state === DocState.SENT_TO_REFERENT || d.state === DocState.SENT_TO_CONTROL).length,
    approved: baseDocs.filter(d => d.state === DocState.APPROVED).length,
    inProcess: baseDocs.filter(d => d.state === DocState.IN_PROCESS || d.state === DocState.INITIATED).length
  };

  const chartData = [
    { name: 'En Proceso', value: stats.inProcess, color: '#3b82f6' },
    { name: 'Pendientes', value: stats.pending, color: '#eab308' },
    { name: 'Aprobados', value: stats.approved, color: '#22c55e' },
  ].filter(d => d.value > 0);

  const clearFilters = () => {
      setFilterProject('');
      setFilterMacro('');
      setFilterProcess('');
      setFilterState('');
  };

  const hasFilters = filterProject || filterMacro || filterProcess || filterState;

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando dashboard...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
            <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            <p className="text-slate-500">Vista general para {user.name} ({user.role})</p>
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard title="Total Documentos" value={stats.total} icon={FileText} color="bg-slate-100 text-slate-600" />
        <StatCard title="En Proceso" value={stats.inProcess} icon={Clock} color="bg-blue-100 text-blue-600" />
        <StatCard title="Pendiente Aprobación" value={stats.pending} icon={AlertTriangle} color="bg-yellow-100 text-yellow-600" />
        <StatCard title="Aprobados" value={stats.approved} icon={CheckCircle} color="bg-green-100 text-green-600" />
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
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    <select 
                        value={filterProject} 
                        onChange={(e) => setFilterProject(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Proyecto (Todos)</option>
                        {uniqueProjects.map(p => <option key={p} value={p}>{p}</option>)}
                    </select>

                    <select 
                        value={filterMacro} 
                        onChange={(e) => setFilterMacro(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                        <option value="">Macroproceso (Todos)</option>
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
                        value={filterState} 
                        onChange={(e) => setFilterState(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
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
                            <th className="px-4 py-3">PROYECTO</th>
                            <th className="px-4 py-3">Jerarquía (Macro / Proceso)</th>
                            <th className="px-4 py-3">MICROPROCESO</th>
                            <th className="px-4 py-3">Documento</th>
                            <th className="px-4 py-3">Estado Actual</th>
                            <th className="px-4 py-3">Última Actividad</th>
                            {user.role === UserRole.ADMIN && <th className="px-4 py-3 text-right">Admin</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDocs.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-400">No se encontraron documentos con los filtros aplicados.</td></tr>
                        ) : (
                            filteredDocs.map(doc => (
                                <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                    {/* COL 1: PROYECTO */}
                                    <td className="px-4 py-3 font-bold text-slate-700">
                                        {doc.project}
                                    </td>

                                    {/* COL 2: Jerarquía */}
                                    <td className="px-4 py-3 text-xs text-slate-600">
                                        <div className="font-medium text-slate-700">{doc.macroprocess}</div>
                                        <div className="text-slate-500">{doc.process}</div>
                                    </td>

                                    {/* COL 3: MICROPROCESO */}
                                    <td className="px-4 py-3 font-medium text-slate-800">
                                        {doc.microprocess || doc.title}
                                    </td>

                                    {/* COL 4: Documento (Tipo + Link) */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col items-start gap-1">
                                            {doc.docType && (
                                                <span className="bg-indigo-50 text-indigo-700 text-[10px] font-bold px-1.5 py-0.5 rounded border border-indigo-100">
                                                    {doc.docType}
                                                </span>
                                            )}
                                            <Link to={`/doc/${doc.id}`} className="text-sm text-indigo-600 hover:text-indigo-800 hover:underline flex items-center">
                                                Ver Detalle <ArrowRight size={12} className="ml-1" />
                                            </Link>
                                        </div>
                                    </td>

                                    {/* COL 5: Estado Actual */}
                                    <td className="px-4 py-3">
                                        <div className="flex flex-col items-start gap-1">
                                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATE_CONFIG[doc.state].color}`}>
                                                {STATE_CONFIG[doc.state].label.split('(')[0]}
                                            </span>
                                            <span className="text-xs font-mono text-slate-500 ml-1">
                                                Ver: {doc.version} ({doc.progress}%)
                                            </span>
                                        </div>
                                    </td>

                                    {/* COL 6: Última Actividad */}
                                    <td className="px-4 py-3">
                                        <div className="flex items-center text-slate-600 gap-1.5">
                                            <Calendar size={14} className="text-slate-400" />
                                            <span>{new Date(doc.updatedAt).toLocaleDateString()}</span>
                                        </div>
                                        <div className="text-xs text-slate-400 pl-5">
                                            {new Date(doc.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </td>

                                    {/* Admin Actions */}
                                    {user.role === UserRole.ADMIN && (
                                        <td className="px-4 py-3 text-right">
                                            <button 
                                                onClick={(e) => handleDeleteDoc(doc.id, e)}
                                                className="text-slate-400 hover:text-red-600 transition-colors p-1"
                                                title="Eliminar Documento"
                                            >
                                                <Trash2 size={16} />
                                            </button>
                                        </td>
                                    )}
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>

        {/* Chart Column (Takes up 1 column) */}
        <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center min-h-[300px]">
                <h2 className="font-semibold text-slate-800 w-full mb-4 text-center">Distribución General</h2>
                {chartData.length > 0 ? (
                    <div className="w-full h-64">
                        <ResponsiveContainer width="100%" height="100%">
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
                    <p className="text-slate-400">No hay suficientes datos.</p>
                )}
            </div>

            {/* Quick Summary Box */}
            <div className="bg-indigo-50 rounded-xl p-5 border border-indigo-100">
                <h3 className="font-bold text-indigo-900 mb-2">Resumen</h3>
                <p className="text-sm text-indigo-700 mb-4">
                    Visualizando {filteredDocs.length} de {docs.length} documentos.
                </p>
                <ul className="text-sm space-y-1 text-indigo-800">
                    <li className="flex justify-between">
                        <span>Filtrados:</span>
                        <span className="font-bold">{filteredDocs.length}</span>
                    </li>
                    {hasFilters && (
                         <li className="flex justify-between pt-2 border-t border-indigo-200 mt-2">
                            <span>Filtros activos:</span>
                            <span>Si</span>
                        </li>
                    )}
                </ul>
            </div>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color }: any) => (
    <div className={`bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center space-x-4`}>
        <div className={`p-3 rounded-lg ${color}`}>
            <Icon size={24} />
        </div>
        <div>
            <p className="text-slate-500 text-xs font-medium uppercase">{title}</p>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
        </div>
    </div>
);

export default Dashboard;
