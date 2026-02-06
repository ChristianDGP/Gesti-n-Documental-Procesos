
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService, determineStateFromVersion, formatVersionForDisplay } from '../services/firebaseBackend';
import { Document, User, DocState } from '../types';
import { STATE_CONFIG } from '../constants';
import { History, AlertTriangle, RefreshCw, CheckCircle2, Search, Loader2, Info, ArrowRight, X, ExternalLink, FileText, Slash, ChevronDown } from 'lucide-react';

interface Props {
    user: User;
}

const AdminEventLog: React.FC<Props> = ({ user }) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [loading, setLoading] = useState(true);
    const [syncingAll, setSyncingAll] = useState(false);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [discardingId, setDiscardingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Estado para manejar la selección manual de estados en la tabla
    const [manualStates, setManualStates] = useState<Record<string, DocState>>({});

    useEffect(() => {
        loadDocuments();
    }, []);

    const loadDocuments = async () => {
        setLoading(true);
        try {
            const data = await DocumentService.getAll();
            setDocuments(data);
            
            // Inicializar estados manuales con el estado actual registrado
            const initialManual: Record<string, DocState> = {};
            data.forEach(d => {
                initialManual[d.id] = d.state;
            });
            setManualStates(initialManual);
        } catch (error) {
            console.error("Error loading docs for event log:", error);
        } finally {
            setLoading(false);
        }
    };

    const inconsistentDocs = useMemo(() => {
        return documents.filter(doc => {
            const expectedInfo = determineStateFromVersion(doc.version);
            const expectedState = expectedInfo.state;
            const expectedPending = [
                DocState.INTERNAL_REVIEW, 
                DocState.SENT_TO_REFERENT, 
                DocState.REFERENT_REVIEW, 
                DocState.SENT_TO_CONTROL, 
                DocState.CONTROL_REVIEW
            ].includes(expectedState);

            const isInconsistent = doc.state !== expectedState || doc.hasPendingRequest !== expectedPending;
            
            // Si el administrador ya descartó esta combinación específica, no la mostramos como inconsistente
            const currentHash = `${doc.version}|${doc.state}`;
            if (isInconsistent && doc.ignoredInconsistency === currentHash) {
                return false;
            }

            return isInconsistent;
        });
    }, [documents]);

    const filteredInconsistent = useMemo(() => {
        if (!searchTerm) return inconsistentDocs;
        const term = searchTerm.toLowerCase();
        return inconsistentDocs.filter(d => 
            d.title.toLowerCase().includes(term) || 
            d.microprocess?.toLowerCase().includes(term) ||
            d.project?.toLowerCase().includes(term)
        );
    }, [inconsistentDocs, searchTerm]);

    const handleSync = async (docId: string) => {
        setSyncingId(docId);
        try {
            // Usamos el estado seleccionado manualmente en el listbox
            const forcedState = manualStates[docId];
            await DocumentService.syncMetadata(docId, user, forcedState);
            // Actualizar localmente para reflejar el cambio inmediato
            await loadDocuments();
        } catch (e: any) {
            alert("Error al sincronizar: " + e.message);
        } finally {
            setSyncingId(null);
        }
    };

    const handleDiscard = async (docId: string, version: string, state: string) => {
        if (!window.confirm("¿Está seguro de descartar esta inconsistencia? El sistema omitirá esta alerta hasta que el documento cambie de versión o estado.")) return;
        setDiscardingId(docId);
        try {
            await DocumentService.ignoreInconsistency(docId, version, state);
            await loadDocuments();
        } catch (e: any) {
            alert("Error al descartar: " + e.message);
        } finally {
            setDiscardingId(null);
        }
    };

    const handleSyncAll = async () => {
        if (filteredInconsistent.length === 0) return;
        if (!window.confirm(`¿Está seguro de sincronizar automáticamente los ${filteredInconsistent.length} documentos? El sistema aplicará la lógica de nomenclatura institucional a todos ellos.`)) return;
        
        setSyncingAll(true);
        try {
            const promises = filteredInconsistent.map(d => DocumentService.syncMetadata(d.id, user));
            await Promise.all(promises);
            await loadDocuments();
            alert("Sincronización masiva completada con éxito.");
        } catch (e: any) {
            alert("Error en sincronización masiva: " + e.message);
        } finally {
            setSyncingAll(false);
        }
    };

    const handleManualStateChange = (docId: string, newState: DocState) => {
        setManualStates(prev => ({ ...prev, [docId]: newState }));
    };

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Analizando integridad de la base de datos...</div>;

    return (
        <div className="space-y-6 pb-12 animate-fadeIn max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <History className="text-indigo-600" />
                        Log de Eventos e Integridad
                    </h1>
                    <p className="text-slate-500">Buffer de inconsistencias detectadas automáticamente en metadatos.</p>
                </div>
                {inconsistentDocs.length > 0 && (
                    <button 
                        onClick={handleSyncAll}
                        disabled={syncingAll}
                        className="flex items-center gap-2 px-6 py-2.5 bg-amber-600 text-white rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-amber-100 hover:bg-amber-700 transition-all active:scale-95 disabled:opacity-50"
                    >
                        {syncingAll ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Sincronización Masiva ({inconsistentDocs.length})
                    </button>
                )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Documentos Analizados</p>
                    <p className="text-3xl font-black text-slate-900">{documents.length}</p>
                </div>
                <div className={`bg-white p-6 rounded-2xl border shadow-sm transition-colors ${inconsistentDocs.length > 0 ? 'border-amber-200' : 'border-slate-200'}`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inconsistencias Totales</p>
                    <p className={`text-3xl font-black ${inconsistentDocs.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{inconsistentDocs.length}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Integridad del Sistema</p>
                    <p className="text-3xl font-black text-slate-900">
                        {documents.length > 0 ? Math.round(((documents.length - inconsistentDocs.length) / documents.length) * 100) : 100}%
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                        <AlertTriangle size={18} className={inconsistentDocs.length > 0 ? 'text-amber-500' : 'text-green-500'} />
                        Listado de Inconsistencias
                    </div>
                    <div className="relative w-full md:w-64">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input 
                            type="text" 
                            placeholder="Buscar por microproceso..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-9 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                        />
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="text-[10px] text-slate-400 uppercase font-bold bg-slate-50/50 border-b border-slate-100">
                            <tr>
                                <th className="px-6 py-4">Documento / Proyecto</th>
                                <th className="px-6 py-4">Estado Registrado (Editar)</th>
                                <th className="px-6 py-4">Versión Cargada</th>
                                <th className="px-6 py-4">Sugerencia Nomenclatura</th>
                                <th className="px-6 py-4 text-right">Acciones de Auditoría</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {filteredInconsistent.length === 0 ? (
                                <tr>
                                    <td colSpan={5} className="py-20 text-center">
                                        <div className="flex flex-col items-center justify-center text-slate-400">
                                            <CheckCircle2 size={48} className="text-green-200 mb-3" />
                                            <p className="font-bold text-slate-500">¡Sistema Íntegro!</p>
                                            <p className="text-xs">No se han detectado inconsistencias en los metadatos.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredInconsistent.map(doc => {
                                const info = determineStateFromVersion(doc.version);
                                const isPendingMismatch = doc.hasPendingRequest !== [DocState.INTERNAL_REVIEW, DocState.SENT_TO_REFERENT, DocState.REFERENT_REVIEW, DocState.SENT_TO_CONTROL, DocState.CONTROL_REVIEW].includes(info.state);
                                const currentManualState = manualStates[doc.id] || doc.state;
                                
                                return (
                                    <tr key={doc.id} className="hover:bg-amber-50/30 transition-colors group">
                                        <td className="px-6 py-4">
                                            <Link to={`/doc/${doc.id}`} className="block group/title">
                                                <div className="font-black text-slate-800 leading-tight mb-0.5 group-hover/title:text-indigo-600 transition-colors flex items-center gap-1.5">
                                                    <FileText size={14} className="text-slate-300 group-hover/title:text-indigo-400" />
                                                    {doc.title}
                                                </div>
                                            </Link>
                                            <div className="flex items-center gap-2 mt-1">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">{doc.project}</span>
                                                    <span className="text-[9px] text-slate-300">•</span>
                                                    <span className="text-[9px] font-bold text-indigo-500 uppercase">{doc.docType}</span>
                                                </div>
                                                <Link 
                                                    to={`/doc/${doc.id}`} 
                                                    className="text-[9px] font-black text-indigo-600 uppercase tracking-tighter bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                                                >
                                                    Ver Detalle <ExternalLink size={8} />
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="relative group/select">
                                                <select 
                                                    value={currentManualState}
                                                    onChange={(e) => handleManualStateChange(doc.id, e.target.value as DocState)}
                                                    className={`appearance-none w-full pl-3 pr-8 py-1.5 rounded-lg text-[10px] font-bold border transition-all cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20
                                                        ${STATE_CONFIG[currentManualState].color}`}
                                                >
                                                    {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
                                                        <option key={key} value={key} className="bg-white text-slate-700">{cfg.label.split('(')[0].trim()}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                            </div>
                                            {doc.hasPendingRequest && (
                                                <div className="mt-1 text-[8px] font-black text-blue-600 uppercase tracking-tighter flex items-center gap-1 ml-1">
                                                    <div className="w-1 h-1 rounded-full bg-blue-500 animate-pulse"></div>
                                                    Alerta de Gestión Registrada
                                                </div>
                                            )}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded text-[11px] font-black text-slate-600">
                                                {formatVersionForDisplay(doc.version)}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-col gap-1">
                                                {doc.state !== info.state && (
                                                    <div className="flex items-center gap-1.5 text-rose-600 text-[11px] font-bold bg-rose-50/50 px-2 py-1 rounded border border-rose-100">
                                                        <Info className="w-3 h-3" />
                                                        Esperado: {STATE_CONFIG[info.state].label.split('(')[0]}
                                                    </div>
                                                )}
                                                {isPendingMismatch && (
                                                    <div className="flex items-center gap-1.5 text-amber-600 text-[11px] font-bold bg-amber-50/50 px-2 py-1 rounded border border-amber-100">
                                                        <AlertTriangle className="w-3 h-3" />
                                                        Alerta desincronizada
                                                    </div>
                                                )}
                                                {doc.state === info.state && !isPendingMismatch && (
                                                    <div className="flex items-center gap-1.5 text-green-600 text-[11px] font-bold">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Coherente por nomenclatura
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button 
                                                    onClick={() => handleDiscard(doc.id, doc.version, doc.state)}
                                                    disabled={discardingId === doc.id}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 text-slate-600 hover:bg-slate-200 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    {discardingId === doc.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <Slash className="w-3 h-3" />}
                                                    Descartar
                                                </button>
                                                <button 
                                                    onClick={() => handleSync(doc.id)}
                                                    disabled={syncingId === doc.id}
                                                    className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest shadow-md transition-all active:scale-95 disabled:opacity-50"
                                                >
                                                    {syncingId === doc.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                                                    Sincronizar
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                
                {filteredInconsistent.length > 0 && (
                    <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                        <p className="text-[10px] text-slate-500 font-medium italic">
                            * Seleccione manualmente el estado en el listbox y presione "Sincronizar" para forzar la coherencia. El sistema ajustará automáticamente el progreso y las alertas asociadas.
                        </p>
                        <div className="flex items-center gap-4">
                             <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Estado Crítico</span>
                             </div>
                             <div className="flex items-center gap-1.5">
                                <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                                <span className="text-[9px] font-bold text-slate-400 uppercase">Alerta Gestión</span>
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminEventLog;
