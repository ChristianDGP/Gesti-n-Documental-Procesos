import React, { useState, useEffect } from 'react';
import { AssignmentService, UserService } from '../services/mockBackend';
import { Document, AnalystWorkload, User, UserRole } from '../types';
import { 
  Users, FileText, ArrowRight, UserCheck, BarChart, 
  Briefcase, AlertCircle, RefreshCw, Zap 
} from 'lucide-react';

interface Props {
  user: User; // Admin User
}

const AdminAssignments: React.FC<Props> = ({ user }) => {
  const [unassignedDocs, setUnassignedDocs] = useState<Document[]>([]);
  const [workload, setWorkload] = useState<AnalystWorkload[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Modal State
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [selectedAnalystId, setSelectedAnalystId] = useState<string>('');
  const [assignReason, setAssignReason] = useState('');
  const [isAutoAssigning, setIsAutoAssigning] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    const [docs, work] = await Promise.all([
      AssignmentService.getUnassignedDocs(),
      AssignmentService.getWorkload()
    ]);
    setUnassignedDocs(docs);
    setWorkload(work);
    setLoading(false);
  };

  const handleOpenAssignModal = (doc: Document) => {
    setSelectedDoc(doc);
    setSelectedAnalystId('');
    setAssignReason('');
  };

  const handleCloseModal = () => {
    setSelectedDoc(null);
  };

  const handleAssign = async () => {
    if (!selectedDoc || !selectedAnalystId) return;
    try {
      await AssignmentService.assignDocument(selectedDoc.id, selectedAnalystId, user.id, assignReason);
      handleCloseModal();
      await loadData();
    } catch (error: any) {
      alert(error.message);
    }
  };

  const handleAutoAssign = async () => {
    if (!selectedDoc) return;
    setIsAutoAssigning(true);
    try {
      // Simulate "AI" thinking
      await new Promise(r => setTimeout(r, 800));
      const recommendedUser = await AssignmentService.suggestAnalyst();
      
      if (recommendedUser) {
        setSelectedAnalystId(recommendedUser.id);
        setAssignReason('Asignación automática basada en carga laboral.');
      } else {
        alert('No se encontraron analistas disponibles.');
      }
    } finally {
      setIsAutoAssigning(false);
    }
  };

  if (loading) return <div className="p-8 text-center text-slate-500">Cargando panel de asignaciones...</div>;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Asignación de Documentos</h1>
        <p className="text-slate-500">Gestione la carga de trabajo y distribuya solicitudes pendientes.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Unassigned Documents */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
             <h2 className="font-semibold text-slate-800 flex items-center gap-2">
               <FileText className="text-orange-500" size={20} />
               Pendientes de Asignación ({unassignedDocs.length})
             </h2>
             <button onClick={loadData} className="text-slate-400 hover:text-indigo-600 transition-colors">
               <RefreshCw size={18} />
             </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
             {unassignedDocs.length === 0 ? (
               <div className="p-12 text-center text-slate-400">
                 <UserCheck size={48} className="mx-auto mb-3 opacity-50" />
                 <p>¡Excelente! No hay documentos pendientes de asignación.</p>
               </div>
             ) : (
               <ul className="divide-y divide-slate-100">
                 {unassignedDocs.map(doc => (
                   <li key={doc.id} className="p-4 hover:bg-slate-50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                     <div>
                       <div className="flex items-center gap-2 mb-1">
                         <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-600">
                           {doc.id.split('-')[0]}
                         </span>
                         <span className="text-xs text-slate-400">{new Date(doc.createdAt).toLocaleDateString()}</span>
                       </div>
                       <h3 className="font-medium text-slate-900">{doc.title}</h3>
                       <p className="text-sm text-slate-500 truncate max-w-md">{doc.description}</p>
                     </div>
                     <button 
                       onClick={() => handleOpenAssignModal(doc)}
                       className="shrink-0 flex items-center justify-center px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
                     >
                       Asignar
                       <ArrowRight size={16} className="ml-2" />
                     </button>
                   </li>
                 ))}
               </ul>
             )}
          </div>
        </div>

        {/* Right Column: Workload Dashboard */}
        <div className="space-y-4">
           <h2 className="font-semibold text-slate-800 flex items-center gap-2">
             <BarChart className="text-blue-500" size={20} />
             Carga de Trabajo
           </h2>
           
           <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
             {workload.map(item => {
               // Calculate load percentage (assuming 10 is max capacity for visual)
               const loadPercent = Math.min((item.activeDocs / 10) * 100, 100);
               let colorClass = 'bg-green-500';
               if (item.activeDocs > 4) colorClass = 'bg-yellow-500';
               if (item.activeDocs > 8) colorClass = 'bg-red-500';

               return (
                 <div key={item.analyst.id} className="border-b border-slate-50 last:border-0 pb-3 last:pb-0">
                   <div className="flex items-center gap-3 mb-2">
                     <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                       <img src={item.analyst.avatar} alt="avatar" className="w-full h-full object-cover" />
                     </div>
                     <div className="flex-1">
                       <p className="text-sm font-medium text-slate-800">{item.analyst.name}</p>
                       <p className="text-xs text-slate-500">{item.activeDocs} docs activos</p>
                     </div>
                   </div>
                   
                   <div className="w-full bg-slate-100 rounded-full h-2 mb-1">
                     <div className={`h-2 rounded-full transition-all duration-500 ${colorClass}`} style={{ width: `${loadPercent}%` }} />
                   </div>
                   <div className="flex justify-between text-[10px] text-slate-400">
                      <span>Completados: {item.completedDocs}</span>
                      <span>Capacidad Est.</span>
                   </div>
                 </div>
               );
             })}
             {workload.length === 0 && <p className="text-sm text-slate-400 text-center">No hay analistas registrados.</p>}
           </div>
        </div>
      </div>

      {/* Assignment Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fadeIn">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h3 className="text-lg font-bold text-slate-800">Asignar Documento</h3>
              <p className="text-sm text-slate-500 truncate">{selectedDoc.title}</p>
            </div>
            
            <div className="p-6 space-y-4">
              {/* Auto Assign Button */}
              <button 
                onClick={handleAutoAssign}
                disabled={isAutoAssigning}
                className="w-full flex items-center justify-center gap-2 p-3 bg-indigo-50 border border-indigo-100 rounded-lg text-indigo-700 font-medium hover:bg-indigo-100 transition-colors"
              >
                {isAutoAssigning ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
                {isAutoAssigning ? 'Analizando carga...' : 'Sugerir Analista (Auto)'}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-500">O selección manual</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Analista Responsable</label>
                <select 
                  value={selectedAnalystId}
                  onChange={(e) => setSelectedAnalystId(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">Seleccione un analista...</option>
                  {workload.map(w => (
                    <option key={w.analyst.id} value={w.analyst.id}>
                      {w.analyst.name} ({w.activeDocs} docs)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Motivo / Observación</label>
                <textarea 
                  value={assignReason}
                  onChange={(e) => setAssignReason(e.target.value)}
                  className="w-full p-2 border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
                  rows={2}
                  placeholder="Ej: Asignación por especialidad..."
                />
              </div>
            </div>

            <div className="p-4 bg-slate-50 flex justify-end gap-3">
              <button 
                onClick={handleCloseModal}
                className="px-4 py-2 text-slate-600 hover:text-slate-800 text-sm font-medium"
              >
                Cancelar
              </button>
              <button 
                onClick={handleAssign}
                disabled={!selectedAnalystId}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm text-sm font-medium"
              >
                Confirmar Asignación
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminAssignments;