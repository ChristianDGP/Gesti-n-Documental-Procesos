
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService, HierarchyService, determineStateFromVersion, formatVersionForDisplay, isEvenVersion } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, UserRole } from '../types';
import { STATE_CONFIG } from '../constants';
import { History, AlertTriangle, RefreshCw, CheckCircle2, Search, Loader2, Info, ArrowRight, X, ExternalLink, FileText, Slash, ChevronDown, Layers } from 'lucide-react';

interface Props {
    user: User;
}

interface HierarchyInconsistency {
    type: 'HIERARCHY';
    project: string;
    macro: string;
    process: string;
    micro: string;
    length: number;
    docId: string; // process_matrix docId
}

const AdminEventLog: React.FC<Props> = ({ user }) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy | null>(null);
    const [loading, setLoading] = useState(true);
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [discardingId, setDiscardingId] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    
    // Estado para manejar la selección manual de estados en la tabla
    const [manualStates, setManualStates] = useState<Record<string, DocState>>({});
    const [togglingId, setTogglingId] = useState<string | null>(null);
    
    const canAudit = user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR || user.canAuditEvents;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [docsData, hierarchyData] = await Promise.all([
                DocumentService.getAll(),
                HierarchyService.getFullHierarchy()
            ]);
            
            setDocuments(docsData);
            setHierarchy(hierarchyData);
            
            // Inicializar estados manuales con el estado actual registrado
            const initialManual: Record<string, DocState> = {};
            docsData.forEach(d => {
                initialManual[d.id] = d.state;
            });
            setManualStates(initialManual);
        } catch (error) {
            console.error("Error loading data for event log:", error);
        } finally {
            setLoading(false);
        }
    };

    const hierarchyInconsistencies = useMemo(() => {
        if (!hierarchy) return [];
        const inconsistencies: HierarchyInconsistency[] = [];
        
        Object.entries(hierarchy).forEach(([project, macros]) => {
            Object.entries(macros).forEach(([macro, processes]) => {
                Object.entries(processes).forEach(([process, nodes]) => {
                    nodes.forEach(node => {
                        if (node.name.length > 35) {
                            inconsistencies.push({
                                type: 'HIERARCHY',
                                project,
                                macro,
                                process,
                                micro: node.name,
                                length: node.name.length,
                                docId: node.docId
                            });
                        }
                    });
                });
            });
        });
        
        return inconsistencies;
    }, [hierarchy]);

    const inconsistentDocs = useMemo(() => {
        return documents.filter(doc => {
            const expectedInfo = determineStateFromVersion(doc.version);
            const expectedState = expectedInfo.state;
            const isStale = [DocState.SENT_TO_REFERENT, DocState.SENT_TO_CONTROL].includes(expectedState) && 
                            (new Date().getTime() - new Date(doc.updatedAt).getTime() > 30 * 24 * 60 * 60 * 1000);

            // La expectativa del sistema es que si hay una alerta, sea por estancamiento o porque es un estado de revisión.
            // Pero si hasPendingRequest es false en un estado de revisión, lo aceptamos como un "rechazo procesado".
            const expectedPending = isStale ? true : doc.hasPendingRequest;

            const isEvenAndPending = isEvenVersion(doc.version) && doc.hasPendingRequest;
            const isInconsistent = doc.state !== expectedState || (isStale && !doc.hasPendingRequest) || isEvenAndPending;
            
            // Nueva validación: Longitud de nomenclatura > 60
            const typeMap: Record<string, string> = { 'AS IS': 'ASIS', 'TO BE': 'TOBE', 'FCE': 'FCE', 'PM': 'PM' };
            const typeCode = typeMap[doc.docType || ''] || doc.docType || '';
            const fullNomenclature = `${doc.project} - ${doc.microprocess} - ${typeCode} - ${doc.version}`;
            const isTooLong = fullNomenclature.length > 60;

            const shouldShow = isInconsistent || isTooLong;

            // Si el administrador ya descartó esta combinación específica, no la mostramos como inconsistente
            const currentHash = `${doc.version}|${doc.state}${isTooLong ? '|TOOLONG' : ''}`;
            if (shouldShow && doc.ignoredInconsistency === currentHash) {
                return false;
            }

            return shouldShow;
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

    const filteredHierarchyInconsistent = useMemo(() => {
        if (!searchTerm) return hierarchyInconsistencies;
        const term = searchTerm.toLowerCase();
        return hierarchyInconsistencies.filter(h => 
            h.micro.toLowerCase().includes(term) || 
            h.project.toLowerCase().includes(term)
        );
    }, [hierarchyInconsistencies, searchTerm]);

    const handleSync = async (docId: string) => {
        setSyncingId(docId);
        try {
            // Usamos el estado seleccionado manualmente en el listbox
            const forcedState = manualStates[docId];
            await DocumentService.syncMetadata(docId, user, forcedState);
            // Actualizar localmente para reflejar el cambio inmediato
            await loadData();
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
            await loadData();
        } catch (e: any) {
            alert("Error al descartar: " + e.message);
        } finally {
            setDiscardingId(null);
        }
    };



    const handleManualStateChange = (docId: string, newState: DocState) => {
        setManualStates(prev => ({ ...prev, [docId]: newState }));
    };

    const handleTogglePending = async (docId: string, currentStatus: boolean) => {
        if (togglingId) return;
        setTogglingId(docId);
        try {
            await DocumentService.masterUpdate(docId, user, { 
                hasPendingRequest: !currentStatus,
                comment: `Cambio manual de Alerta de Gestión (Solicitud Pendiente) a ${!currentStatus ? 'ACTIVA' : 'INACTIVA'} vía Log de Eventos.`
            });
            await loadData();
        } catch (e: any) {
            alert("Error al cambiar estado de solicitud: " + e.message);
        } finally {
            setTogglingId(null);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Analizando integridad de la base de datos...</div>;

    const totalInconsistencies = inconsistentDocs.length + hierarchyInconsistencies.length;

    return (
        <div className="space-y-6 pb-12 animate-fadeIn max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <History className="text-indigo-600" />
                        Log de Eventos e Integridad
                    </h1>
                    <p className="text-slate-500">Buffer de inconsistencias detectadas automáticamente en metadatos y estructura.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Documentos Analizados</p>
                    <p className="text-3xl font-black text-slate-900">{documents.length}</p>
                </div>
                <div className={`bg-white p-6 rounded-2xl border shadow-sm transition-colors ${inconsistentDocs.length > 0 ? 'border-amber-200' : 'border-slate-200'}`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inconsistencias Docs</p>
                    <p className={`text-3xl font-black ${inconsistentDocs.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{inconsistentDocs.length}</p>
                </div>
                <div className={`bg-white p-6 rounded-2xl border shadow-sm transition-colors ${hierarchyInconsistencies.length > 0 ? 'border-red-200' : 'border-slate-200'}`}>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inconsistencias Estructura</p>
                    <p className={`text-3xl font-black ${hierarchyInconsistencies.length > 0 ? 'text-red-600' : 'text-slate-900'}`}>{hierarchyInconsistencies.length}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Integridad Global</p>
                    <p className="text-3xl font-black text-slate-900">
                        {documents.length > 0 ? Math.round(((documents.length + (hierarchy ? 100 : 0) - totalInconsistencies) / (documents.length + (hierarchy ? 100 : 0))) * 100) : 100}%
                    </p>
                </div>
            </div>

            {/* Sección de Estructura */}
            {hierarchyInconsistencies.length > 0 && (
                <div className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden">
                    <div className="p-4 bg-red-50 border-b border-red-100 flex items-center gap-2 text-red-700 font-bold text-sm">
                        <Layers size={18} className="text-red-500" />
                        Inconsistencias en Estructura (Nombres de Microproceso {'>'} 35 carac.)
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-[10px] text-slate-400 uppercase font-bold bg-slate-50/50 border-b border-slate-100">
                                <tr>
                                    <th className="px-6 py-4">Proyecto / Macro / Proceso</th>
                                    <th className="px-6 py-4">Microproceso</th>
                                    <th className="px-6 py-4">Longitud</th>
                                    <th className="px-6 py-4 text-right">Acción</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {filteredHierarchyInconsistent.map((h, idx) => (
                                    <tr key={idx} className="hover:bg-red-50/30 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{h.project}</div>
                                            <div className="text-[11px] text-slate-600 font-medium">{h.macro} / {h.process}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-800">{h.micro}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-red-600 font-black">{h.length} / 35</span>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <Link 
                                                to="/admin/structure"
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                                            >
                                                <ArrowRight size={12} />
                                                Corregir
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
                <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-2 text-slate-700 font-bold text-sm">
                        <AlertTriangle size={18} className={inconsistentDocs.length > 0 ? 'text-amber-500' : 'text-green-500'} />
                        Listado de Inconsistencias en Documentos
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
                                            <p className="font-bold text-slate-500">¡Documentos Íntegros!</p>
                                            <p className="text-xs">No se han detectado inconsistencias en los metadatos de archivos.</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredInconsistent.map(doc => {
                                const info = determineStateFromVersion(doc.version);
                                const isStale = [DocState.SENT_TO_REFERENT, DocState.SENT_TO_CONTROL].includes(info.state) && 
                                                (new Date().getTime() - new Date(doc.updatedAt).getTime() > 30 * 24 * 60 * 60 * 1000);
                                
                                const isEvenAndPending = isEvenVersion(doc.version) && doc.hasPendingRequest;
                                const isPendingMismatch = (isStale && !doc.hasPendingRequest) || isEvenAndPending;
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
                                                    disabled={!canAudit}
                                                    className={`appearance-none w-full pl-3 pr-8 py-1.5 rounded-lg text-[10px] font-bold border transition-all outline-none focus:ring-2 focus:ring-indigo-500/20
                                                        ${STATE_CONFIG[currentManualState].color} ${!canAudit ? 'cursor-not-allowed opacity-80' : 'cursor-pointer'}`}
                                                >
                                                    {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
                                                        <option key={key} value={key} className="bg-white text-slate-700">{cfg.label.split('(')[0].trim()}</option>
                                                    ))}
                                                </select>
                                                <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                            </div>
                                            <div className="mt-2 flex items-center gap-2">
                                                <label className="flex items-center gap-2 cursor-pointer group/check">
                                                    <div className="relative flex items-center justify-center">
                                                        <input 
                                                            type="checkbox" 
                                                            checked={doc.hasPendingRequest || false}
                                                            onChange={() => handleTogglePending(doc.id, !!doc.hasPendingRequest)}
                                                            disabled={!canAudit || togglingId === doc.id}
                                                            className="peer sr-only"
                                                        />
                                                        <div className={`w-8 h-4 rounded-full transition-colors duration-200 ease-in-out ${doc.hasPendingRequest ? 'bg-blue-600' : 'bg-slate-300'} peer-disabled:opacity-50`}></div>
                                                        <div className={`absolute left-0.5 w-3 h-3 bg-white rounded-full shadow-sm transition-transform duration-200 ease-in-out transform ${doc.hasPendingRequest ? 'translate-x-4' : 'translate-x-0'}`}></div>
                                                    </div>
                                                    <span className={`text-[9px] font-black uppercase tracking-widest ${doc.hasPendingRequest ? 'text-blue-700' : 'text-slate-500'}`}>
                                                        {togglingId === doc.id ? 'Ajustando...' : (doc.hasPendingRequest ? 'SOLICITUD: ACTIVA' : 'SOLICITUD: INACTIVA')}
                                                    </span>
                                                </label>
                                            </div>
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
                                                        {isEvenAndPending ? 'Alerta en Rechazo (v.par)' : 'Alerta desincronizada'}
                                                    </div>
                                                )}
                                                {(() => {
                                                    const typeMap: Record<string, string> = { 'AS IS': 'ASIS', 'TO BE': 'TOBE', 'FCE': 'FCE', 'PM': 'PM' };
                                                    const typeCode = typeMap[doc.docType || ''] || doc.docType || '';
                                                    const fullNomenclature = `${doc.project} - ${doc.microprocess} - ${typeCode} - ${doc.version}`;
                                                    if (fullNomenclature.length > 60) {
                                                        return (
                                                            <div className="flex items-center gap-1.5 text-red-600 text-[11px] font-bold bg-red-50/50 px-2 py-1 rounded border border-red-100">
                                                                <AlertTriangle className="w-3 h-3" />
                                                                Nombre Excesivo ({fullNomenclature.length} carac.)
                                                            </div>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                {doc.state === info.state && !isPendingMismatch && !(`${doc.project} - ${doc.microprocess} - ${({ 'AS IS': 'ASIS', 'TO BE': 'TOBE', 'FCE': 'FCE', 'PM': 'PM' } as Record<string, string>)[doc.docType || ''] || doc.docType || ''} - ${doc.version}`.length > 60) && (
                                                    <div className="flex items-center gap-1.5 text-green-600 text-[11px] font-bold">
                                                        <CheckCircle2 className="w-3 h-3" />
                                                        Coherente por nomenclatura
                                                    </div>
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                {(() => {
                                                    const typeMap: Record<string, string> = { 'AS IS': 'ASIS', 'TO BE': 'TOBE', 'FCE': 'FCE', 'PM': 'PM' };
                                                    const typeCode = typeMap[doc.docType || ''] || doc.docType || '';
                                                    const fullNomenclature = `${doc.project} - ${doc.microprocess} - ${typeCode} - ${doc.version}`;
                                                    if (fullNomenclature.length > 60 && canAudit) {
                                                        return (
                                                            <Link 
                                                                to="/admin/structure"
                                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 text-white hover:bg-amber-600 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 shadow-sm"
                                                            >
                                                                <ArrowRight className="w-3 h-3" />
                                                                Gestionar
                                                            </Link>
                                                        );
                                                    }
                                                    return null;
                                                })()}
                                                {canAudit && (
                                                    <>
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
                                                    </>
                                                )}
                                                {!canAudit && <span className="text-[10px] text-slate-400 italic">Solo lectura</span>}
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
