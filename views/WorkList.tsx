
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService } from '../services/firebaseBackend';
import { Document, User, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { Filter, ArrowRight, Calendar, ListTodo, Activity, CheckCircle, Clock, Layers, FileText } from 'lucide-react';

interface Props {
  user: User;
}

const WorkList: React.FC<Props> = ({ user }) => {
  const [docs, setDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [filterState, setFilterState] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
        const allDocs = await DocumentService.getAll();
        
        // 1. Filtrar mis asignaciones y excluir terminados
        const myActiveDocs = allDocs.filter(d => 
            d.assignees && 
            d.assignees.includes(user.id) &&
            d.state !== DocState.APPROVED
        );

        // 2. AGRUPACIÓN Y DEDUPLICACIÓN DE VERSIONES
        // Clave de agrupación: Proyecto + Microproceso + Tipo de Documento.
        // Objetivo: Si tengo FCE v0.0 y FCE v0.1, solo mostrar FCE v0.1.
        //           Pero si tengo FCE v0.1 y TO BE v0.0, mostrar ambos.
        const latestDocsMap = new Map<string, Document>();

        myActiveDocs.forEach(doc => {
            // Usamos un identificador único compuesto
            const uniqueKey = `${doc.project || 'Gen'}|${doc.microprocess || doc.title}|${doc.docType || 'Gen'}`;
            
            const existing = latestDocsMap.get(uniqueKey);

            // Si no existe, o si el actual es más reciente que el que tenemos guardado, lo actualizamos
            if (!existing || new Date(doc.updatedAt) > new Date(existing.updatedAt)) {
                latestDocsMap.set(uniqueKey, doc);
            }
        });

        // Convertimos el Map a Array
        const finalDocs = Array.from(latestDocsMap.values());

        // 3. Ordenar para visualización (Proyecto -> Microproceso -> Tipo)
        finalDocs.sort((a, b) => {
            const projA = a.project || '';
            const projB = b.project || '';
            if (projA !== projB) return projA.localeCompare(projB);

            const microA = a.microprocess || a.title;
            const microB = b.microprocess || b.title;
            if (microA !== microB) return microA.localeCompare(microB);

            const typeA = a.docType || '';
            const typeB = b.docType || '';
            return typeA.localeCompare(typeB);
        });

        setDocs(finalDocs);

    } catch (error) {
        console.error("Error loading work list:", error);
    } finally {
        setLoading(false);
    }
  };

  const getFilteredDocs = () => {
      if (!filterState) return docs;
      return docs.filter(d => d.state === filterState);
  };

  const filteredDocs = getFilteredDocs();

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
            <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between flex-wrap gap-3">
                <h2 className="font-semibold text-slate-800 flex items-center gap-2">
                    <Activity size={18} className="text-indigo-600" />
                    Mis Pendientes
                </h2>
                
                <div className="flex items-center gap-3">
                    <select 
                        value={filterState} 
                        onChange={(e) => setFilterState(e.target.value)}
                        className="text-sm p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                    >
                        <option value="">Estado (Todos)</option>
                        {Object.keys(STATE_CONFIG).filter(k => k !== DocState.APPROVED).map(key => (
                            <option key={key} value={key}>{STATE_CONFIG[key as DocState].label.split('(')[0]}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                    <thead className="text-xs text-slate-500 uppercase bg-slate-50">
                        <tr>
                            <th className="px-4 py-3">Proyecto / Macro</th>
                            <th className="px-4 py-3">Microproceso</th>
                            <th className="px-4 py-3">Documento / Tipo</th>
                            <th className="px-4 py-3">Estado Actual</th>
                            <th className="px-4 py-3">Versión</th>
                            <th className="px-4 py-3">Última Actualización</th>
                            <th className="px-4 py-3">Acción</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredDocs.length === 0 ? (
                            <tr><td colSpan={7} className="p-8 text-center text-slate-400">
                                {filterState ? 'No hay documentos en este estado.' : '¡Todo al día! No tienes documentos pendientes de gestión.'}
                            </td></tr>
                        ) : (
                            filteredDocs.map(doc => (
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
                                    <td className="px-4 py-3">
                                        <Link to={`/doc/${doc.id}`} className="text-indigo-600 hover:text-indigo-800 text-xs font-bold flex items-center gap-1 hover:underline">
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
