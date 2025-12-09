import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService } from '../services/mockBackend';
import { Document, User, UserRole, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { Plus, FileText, Clock, CheckCircle, AlertTriangle, Filter, Trash2, Users } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';

interface DashboardProps {
  user: User;
}

type FilterState = 'ALL' | 'IN_PROCESS' | 'PENDING' | 'APPROVED';

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<FilterState>('ALL');

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
    
    // Role based base filtering
    if (user.role === UserRole.ANALYST) {
      filtered = docs.filter(d => d.authorId === user.id);
    }
    // Coordinator & Admin see all (Admin can edit all, Coordinator can see to approve)

    // Status based filtering (Click on cards)
    if (activeFilter === 'IN_PROCESS') {
        filtered = filtered.filter(d => d.state === DocState.INITIATED || d.state === DocState.IN_PROCESS);
    } else if (activeFilter === 'PENDING') {
        filtered = filtered.filter(d => 
            d.state === DocState.INTERNAL_REVIEW || 
            d.state === DocState.SENT_TO_REFERENT || 
            d.state === DocState.REFERENT_REVIEW ||
            d.state === DocState.SENT_TO_CONTROL ||
            d.state === DocState.CONTROL_REVIEW
        );
    } else if (activeFilter === 'APPROVED') {
        filtered = filtered.filter(d => d.state === DocState.APPROVED);
    }

    return filtered;
  };

  const filteredDocs = getFilteredDocs();

  // Calculate Stats (Global, not filtered by selection)
  const baseDocs = user.role === UserRole.ANALYST ? docs.filter(d => d.authorId === user.id) : docs;
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

      {/* Stats Cards - Clickable for filtering */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 cursor-pointer">
        <StatCard 
            title="Total Documentos" 
            value={stats.total} 
            icon={FileText} 
            color="bg-slate-100 text-slate-600" 
            onClick={() => setActiveFilter('ALL')}
            isActive={activeFilter === 'ALL'}
        />
        <StatCard 
            title="En Proceso" 
            value={stats.inProcess} 
            icon={Clock} 
            color="bg-blue-100 text-blue-600"
            onClick={() => setActiveFilter('IN_PROCESS')}
            isActive={activeFilter === 'IN_PROCESS'}
        />
        <StatCard 
            title="Pendiente Aprobación" 
            value={stats.pending} 
            icon={AlertTriangle} 
            color="bg-yellow-100 text-yellow-600"
            onClick={() => setActiveFilter('PENDING')}
            isActive={activeFilter === 'PENDING'}
        />
        <StatCard 
            title="Aprobados" 
            value={stats.approved} 
            icon={CheckCircle} 
            color="bg-green-100 text-green-600" 
            onClick={() => setActiveFilter('APPROVED')}
            isActive={activeFilter === 'APPROVED'}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document List */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Filter size={18} className="text-slate-400" />
                    {activeFilter === 'ALL' ? 'Todos los Documentos' : 
                     activeFilter === 'IN_PROCESS' ? 'Documentos en Proceso' :
                     activeFilter === 'PENDING' ? 'Pendientes de Aprobación' : 'Documentos Aprobados'}
                </h2>
                {activeFilter !== 'ALL' && (
                    <button onClick={() => setActiveFilter('ALL')} className="text-xs text-indigo-600 hover:underline">
                        Ver todos
                    </button>
                )}
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-4 py-3">Documento</th>
                            <th className="px-4 py-3">Estado</th>
                            <th className="px-4 py-3">Versión</th>
                            <th className="px-4 py-3">Progreso</th>
                            {user.role === UserRole.ADMIN && <th className="px-4 py-3 text-right">Admin</th>}
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDocs.length === 0 ? (
                            <tr><td colSpan={5} className="p-8 text-center text-slate-400">No se encontraron documentos en esta categoría.</td></tr>
                        ) : (
                            filteredDocs.map(doc => (
                                <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                                    <td className="px-4 py-3">
                                        <Link to={`/doc/${doc.id}`} className="font-medium text-indigo-600 hover:text-indigo-800 block">
                                            {doc.title}
                                        </Link>
                                        <span className="text-xs text-slate-400">{doc.authorName}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${STATE_CONFIG[doc.state].color}`}>
                                            {STATE_CONFIG[doc.state].label.split('(')[0]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-slate-600 font-mono text-xs">
                                        {doc.version}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="w-full bg-slate-200 rounded-full h-1.5 max-w-[100px]">
                                            <div 
                                                className="bg-indigo-600 h-1.5 rounded-full" 
                                                style={{ width: `${doc.progress}%` }}
                                            />
                                        </div>
                                    </td>
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

        {/* Chart (Only if data exists) */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 flex flex-col items-center justify-center min-h-[300px]">
             <h2 className="font-semibold text-slate-800 w-full mb-4">Distribución</h2>
             {chartData.length > 0 ? (
                <div className="w-full h-64">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={chartData}
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={80}
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
      </div>
    </div>
  );
};

const StatCard = ({ title, value, icon: Icon, color, onClick, isActive }: any) => (
    <div 
        onClick={onClick}
        className={`bg-white p-4 rounded-xl shadow-sm border transition-all duration-200 flex items-center space-x-4
        ${isActive ? 'border-indigo-500 ring-1 ring-indigo-500 bg-indigo-50/10' : 'border-slate-200 hover:border-indigo-300'}`}
    >
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