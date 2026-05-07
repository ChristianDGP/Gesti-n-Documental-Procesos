
import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DocumentService, HierarchyService, NotificationService, UserService, determineStateFromVersion, formatVersionForDisplay, isEvenVersion } from '../services/firebaseBackend';
import { Document, User, DocState, FullHierarchy, UserRole, Notification as AppNotification, DocHistory } from '../types';
import { STATE_CONFIG } from '../constants';
import { History, AlertTriangle, RefreshCw, CheckCircle2, Search, Loader2, Info, ArrowRight, ExternalLink, FileText, Slash, ChevronDown, Layers, BellOff, MessageSquare, Trash2, MailWarning, List } from 'lucide-react';

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
    docId: string;
}

interface MessageInconsistency {
    type: 'ORPHAN' | 'MISSING_ALERT' | 'SILENT_REQUEST';
    id: string;
    description: string;
    docId?: string;
    docTitle?: string;
    userId?: string;
    userName?: string;
    senderId?: string;
    senderName?: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
    title: string;
    timestamp: string;
}

const AdminEventLog: React.FC<Props> = ({ user }) => {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [notifications, setNotifications] = useState<AppNotification[]>([]);
    const [allUsers, setAllUsers] = useState<User[]>([]);
    const [hierarchy, setHierarchy] = useState<FullHierarchy | null>(null);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<'docs' | 'messages'>('docs');
    const [syncingId, setSyncingId] = useState<string | null>(null);
    const [discardingId, setDiscardingId] = useState<string | null>(null);
    const [repairingPart, setRepairingPart] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState('');
    const [manualStates, setManualStates] = useState<Record<string, DocState>>({});
    const [togglingId, setTogglingId] = useState<string | null>(null);
    const [reassignMap, setReassignMap] = useState<Record<string, string>>({});
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
    
    const canAudit = user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR || user.canAuditEvents;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        setLoading(true);
        try {
            const [docsData, hierarchyData, notifsData, usersData] = await Promise.all([
                DocumentService.getAll(),
                HierarchyService.getFullHierarchy(),
                NotificationService.getAll(),
                UserService.getAll()
            ]);
            
            setDocuments(docsData);
            setHierarchy(hierarchyData);
            setNotifications(notifsData);
            setAllUsers(usersData);
            
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

    const messagingInconsistencies = useMemo(() => {
        const inconsistencies: MessageInconsistency[] = [];
        const usersMap: Record<string, string> = {};
        allUsers.forEach(u => {
            usersMap[u.id] = u.name;
        });

        documents.forEach(doc => {
            const isRejection = isEvenVersion(doc.version);
            const isApproval = doc.state === DocState.APPROVED;

            if (isRejection || isApproval) {
                const recipients = new Set<string>();
                if (doc.assignedTo && doc.assignedTo !== 'system') recipients.add(doc.assignedTo);
                if (doc.assignees) doc.assignees.forEach(uid => recipients.add(uid));

                recipients.forEach(uid => {
                    const eventType = isRejection ? 'Rechazo' : 'Aprobación';
                    const hasNotif = notifications.some(n => 
                        n.documentId === doc.id && 
                        n.userId === uid && 
                        n.title.includes(eventType) && 
                        n.title.includes(formatVersionForDisplay(doc.version))
                    );

                    if (!hasNotif) {
                        const eventTypeTitle = isRejection ? 'Rechazo' : 'Aprobación';
                        const displayVersion = formatVersionForDisplay(doc.version);
                        
                        // Buscamos si existe alguna notificación de este mismo evento para OTRO usuario
                        // para intentar recuperar el nombre de quien realizó la acción (actorName)
                        const peerNotif = notifications.find(n => 
                            n.documentId === doc.id && 
                            n.title.includes(eventTypeTitle) && 
                            n.title.includes(displayVersion)
                        );

                        inconsistencies.push({
                            type: 'MISSING_ALERT',
                            id: `${doc.id}-${uid}-${eventType}`,
                            docId: doc.id,
                            docTitle: doc.title,
                            userId: uid,
                            userName: usersMap[uid] || 'Usuario Desconocido',
                            senderId: peerNotif ? 'peer-resolved' : 'system',
                            senderName: peerNotif ? peerNotif.actorName : 'Sistema',
                            title: `Falta alerta de ${eventType}: ${doc.project}`,
                            description: `Documento en versión ${displayVersion} no ha notificado al usuario responsable del evento de ${eventType}.`,
                            severity: isRejection ? 'MEDIUM' : 'HIGH',
                            timestamp: doc.updatedAt
                        });
                    }
                });
            }
        });

        return inconsistencies.sort((a, b) => {
            const dateA = new Date(a.timestamp).getTime();
            const dateB = new Date(b.timestamp).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }, [documents, notifications, sortOrder]);

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
            const expectedPending = isEvenVersion(doc.version) ? false : doc.hasPendingRequest;
            const isPendingMismatch = doc.hasPendingRequest !== expectedPending;

            const isInconsistent = doc.state !== expectedState || isPendingMismatch;
            
            const typeMap: Record<string, string> = { 'AS IS': 'ASIS', 'TO BE': 'TOBE', 'FCE': 'FCE', 'PM': 'PM' };
            const typeCode = typeMap[doc.docType || ''] || doc.docType || '';
            const fullNomenclature = `${doc.project} - ${doc.microprocess} - ${typeCode} - ${doc.version}`;
            const isTooLong = fullNomenclature.length > 60;

            const shouldShow = isInconsistent || isTooLong;
            const currentHash = `${doc.version}|${doc.state}${isTooLong ? '|TOOLONG' : ''}`;
            
            if (shouldShow && doc.ignoredInconsistency === currentHash) {
                return false;
            }

            return shouldShow;
        });
    }, [documents]);

    const filteredInconsistent = useMemo(() => {
        let docs = [...inconsistentDocs];
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            docs = docs.filter(d => 
                d.title.toLowerCase().includes(term) || 
                (d.microprocess && d.microprocess.toLowerCase().includes(term)) ||
                (d.project && d.project.toLowerCase().includes(term))
            );
        }
        
        return docs.sort((a, b) => {
            const dateA = new Date(a.updatedAt).getTime();
            const dateB = new Date(b.updatedAt).getTime();
            return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        });
    }, [inconsistentDocs, searchTerm, sortOrder]);

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
            const forcedState = manualStates[docId];
            await DocumentService.syncMetadata(docId, user, forcedState);
            await loadData();
        } catch (e: any) {
            alert("Error al sincronizar: " + e.message);
        } finally {
            setSyncingId(null);
        }
    };

    const handleDiscard = async (docId: string, version: string, state: string) => {
        if (!window.confirm("¿Está seguro de descartar esta inconsistencia?")) return;
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
                comment: `Cambio manual de Alerta de Gestión vía Log.`
            });
            await loadData();
        } catch (e: any) {
            alert("Error al cambiar estado: " + e.message);
        } finally {
            setTogglingId(null);
        }
    };

    const handleRepairMessaging = async (type: string, payload?: any) => {
        const targetId = payload?.id || type;
        setRepairingPart(targetId);
        try {
            if (type === 'ORPHAN') {
                if (window.confirm("¿Eliminar todas las notificaciones huérfanas?")) {
                    const orphans = messagingInconsistencies.filter(i => i.type === 'ORPHAN');
                    for (const o of orphans) {
                        await NotificationService.delete(o.id);
                    }
                }
            } else if (type === 'MISSING_ALERT' && payload) {
                const { docId, userId, title: issueTitle } = payload;
                const docObj = documents.find(d => d.id === docId);
                
                // Si hay una reasignación seleccionada, primero corregimos el documento
                const selectedNewUserId = reassignMap[targetId];
                let finalUserId = userId;

                if (selectedNewUserId && docObj) {
                    finalUserId = selectedNewUserId;
                    // Actualizamos el documento para que el error no persista
                    await DocumentService.masterUpdate(docId, user, {
                        assignedTo: selectedNewUserId,
                        comment: `Reasignación automática vía Log de Integridad por ID desconocido.`
                    });
                }

                if (docObj) {
                    const isApproval = issueTitle.includes('Aprobación');
                    const eventTypeLabel = isApproval ? 'Aprobación' : 'Rechazo';
                    const displayVersion = formatVersionForDisplay(docObj.version);
                    const notifTitle = `Notificación Recuperada: ${eventTypeLabel} ${docObj.project}`;
                    const notifMsg = `Su documento ha recibido una ${eventTypeLabel.toLowerCase()} (${displayVersion}).`;
                    await NotificationService.create(finalUserId, docId, isApproval ? 'APPROVAL' : 'REJECTION', notifTitle, notifMsg, 'Sistema (Reparación)');
                }
            }
            await loadData();
            // Limpiar la selección de reasignación para este ítem
            setReassignMap(prev => {
                const next = { ...prev };
                delete next[targetId];
                return next;
            });
        } catch (e: any) {
            alert("Error en reparación: " + e.message);
        } finally {
            setRepairingPart(null);
        }
    };

    if (loading) return <div className="p-8 text-center text-slate-500 flex flex-col items-center"><Loader2 className="animate-spin mb-2" /> Analizando integridad...</div>;

    const totalInconsistencies = inconsistentDocs.length + hierarchyInconsistencies.length;
    const totalMessagingIssues = messagingInconsistencies.length;

    return (
        <div className="space-y-6 pb-12 animate-fadeIn max-w-6xl mx-auto">
            {/* Header SECCIÓN */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
                        <History className="text-indigo-600" size={28} />
                        Log de Eventos e Integridad
                    </h1>
                    <p className="text-slate-500 text-sm">Auditoría automática de consistencia en documentos y flujo de mensajería.</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
                    <button 
                        onClick={() => setActiveTab('docs')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'docs' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <Layers size={14} />
                        Documentos
                    </button>
                    <button 
                        onClick={() => setActiveTab('messages')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeTab === 'messages' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                    >
                        <MessageSquare size={14} />
                        Mensajería
                    </button>
                    <div className="w-px h-4 bg-slate-200 mx-1"></div>
                    <button 
                        onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${sortOrder === 'asc' ? 'text-indigo-600' : 'text-slate-500'}`}
                        title="Cambiar orden por fecha"
                    >
                        <List size={14} className={sortOrder === 'asc' ? 'rotate-180' : ''} />
                        {sortOrder === 'asc' ? 'Anteriores First' : 'Recientes First'}
                    </button>
                    <button 
                        onClick={loadData}
                        className="p-2 text-slate-400 hover:text-indigo-600 transition-colors"
                        title="Refrescar"
                    >
                        <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Stats Rápido */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Inconsistencias Docs</p>
                    <p className={`text-3xl font-black ${inconsistentDocs.length > 0 ? 'text-amber-600' : 'text-slate-900'}`}>{inconsistentDocs.length}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Alertas Estructura</p>
                    <p className={`text-3xl font-black ${hierarchyInconsistencies.length > 0 ? 'text-red-600' : 'text-slate-900'}`}>{hierarchyInconsistencies.length}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Integridad Mensajería</p>
                    <p className={`text-3xl font-black ${totalMessagingIssues > 0 ? 'text-indigo-600' : 'text-slate-900'}`}>{totalMessagingIssues}</p>
                </div>
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Estado Global</p>
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={24} className={totalInconsistencies + totalMessagingIssues === 0 ? 'text-green-500' : 'text-slate-200'} />
                        <span className="text-xl font-bold">{totalInconsistencies + totalMessagingIssues === 0 ? 'Sano' : 'Requiere Gestión'}</span>
                    </div>
                </div>
            </div>

            {activeTab === 'docs' ? (
                <div className="space-y-6">
                    {/* Alertas de Jerarquía */}
                    {hierarchyInconsistencies.length > 0 && (
                        <div className="bg-white rounded-2xl shadow-sm border border-red-200 overflow-hidden">
                            <div className="p-4 bg-red-50 text-red-700 font-bold text-sm flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Layers size={18} className="text-red-500" />
                                    Inconsistencias Estructura (Nombres {'>'} 35 carac.)
                                </div>
                                <span className="text-[10px] bg-red-100 px-2 py-0.5 rounded-full">{hierarchyInconsistencies.length} afectados</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                    <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b">
                                        <tr>
                                            <th className="px-6 py-4 text-left">Microproceso</th>
                                            <th className="px-6 py-4 text-left">Proyecto / Macro</th>
                                            <th className="px-6 py-4 text-left">Longitud</th>
                                            <th className="px-6 py-4 text-right">Acción</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {filteredHierarchyInconsistent.map((h, i) => (
                                            <tr key={i} className="hover:bg-red-50/20 transition-colors">
                                                <td className="px-6 py-4 font-bold text-slate-800">{h.micro}</td>
                                                <td className="px-6 py-4 text-xs text-slate-500">{h.project} / {h.macro}</td>
                                                <td className="px-6 py-4">
                                                    <span className="font-mono text-red-600 font-black">{h.length} / 35</span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <Link to="/admin/structure" className="inline-flex items-center gap-1 px-3 py-1 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all">
                                                        Corregir <ArrowRight size={10} />
                                                    </Link>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    {/* Tabla de Documentos Inconsistentes */}
                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                         <div className="p-4 border-b bg-slate-50 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div className="text-sm font-bold text-slate-700 flex items-center gap-2">
                                <FileText size={18} className="text-indigo-500" />
                                Inconsistencias Metadatos Archivos
                            </div>
                            <div className="relative w-full md:w-64">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input 
                                    type="text" placeholder="Buscar por microproceso..." 
                                    className="w-full pl-9 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>
                         </div>
                         <div className="overflow-x-auto">
                             <table className="w-full text-sm">
                                <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b">
                                    <tr>
                                        <th className="px-6 py-4 text-left">Documento / Proyecto</th>
                                        <th className="px-6 py-4 text-left">Estado (Edición Manual)</th>
                                        <th className="px-6 py-4 text-left">Fecha de Cambio</th>
                                        <th className="px-6 py-4 text-left">Sugerencia Nomenclatura</th>
                                        <th className="px-6 py-4 text-right">Auditoría</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {filteredInconsistent.length === 0 ? (
                                        <tr>
                                            <td colSpan={5} className="py-20 text-center">
                                                <div className="flex flex-col items-center justify-center text-slate-400">
                                                    <CheckCircle2 size={48} className="text-green-200 mb-3" />
                                                    <p className="font-bold text-slate-500">Documentos Limpios</p>
                                                    <p className="text-xs">No hay inconsistencias de metadatos detectadas.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredInconsistent.map(doc => {
                                        const info = determineStateFromVersion(doc.version);
                                        const currentManualState = manualStates[doc.id] || doc.state;
                                        return (
                                            <tr key={doc.id} className="hover:bg-slate-50/50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-800 leading-tight">{doc.title}</div>
                                                    <div className="text-[10px] text-slate-400 font-mono mt-1">{doc.version} • {doc.project}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-2">
                                                        <div className="relative">
                                                            <select 
                                                                value={currentManualState}
                                                                onChange={(e) => handleManualStateChange(doc.id, e.target.value as DocState)}
                                                                className={`appearance-none w-full pl-3 pr-8 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${STATE_CONFIG[currentManualState].color}`}
                                                            >
                                                                {Object.entries(STATE_CONFIG).map(([key, cfg]) => (
                                                                    <option key={key} value={key} className="bg-white text-slate-700">{cfg.label.split('(')[0]}</option>
                                                                ))}
                                                            </select>
                                                            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                                                        </div>
                                                        <button 
                                                            onClick={() => handleTogglePending(doc.id, !!doc.hasPendingRequest)}
                                                            disabled={togglingId === doc.id}
                                                            className={`flex items-center gap-2 text-[9px] font-black uppercase tracking-widest ${doc.hasPendingRequest ? 'text-blue-600' : 'text-slate-400 font-medium'}`}
                                                        >
                                                            {togglingId === doc.id ? <Loader2 size={10} className="animate-spin" /> : <div className={`w-2 h-2 rounded-full ${doc.hasPendingRequest ? 'bg-blue-600' : 'bg-slate-300'}`} />}
                                                            {doc.hasPendingRequest ? 'Alertas: Activa' : 'Alertas: Inactiva'}
                                                        </button>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-xs font-mono text-slate-500">
                                                    {new Date(doc.updatedAt).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        {doc.state !== info.state && (
                                                            <div className="text-[10px] font-bold text-rose-600 bg-rose-50 px-2 py-0.5 rounded border border-rose-100 flex items-center gap-1">
                                                                <AlertTriangle size={10} /> Esperado: {STATE_CONFIG[info.state].label.split('(')[0]}
                                                            </div>
                                                        )}
                                                        {isEvenVersion(doc.version) && doc.hasPendingRequest && (
                                                            <div className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 flex items-center gap-1">
                                                                <MailWarning size={10} /> Alerta en Versión Par
                                                            </div>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <div className="flex justify-end gap-2">
                                                        <button 
                                                            onClick={() => handleDiscard(doc.id, doc.version, doc.state)} 
                                                            disabled={discardingId === doc.id}
                                                            className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-all"
                                                            title="Descartar Inconsistencia"
                                                        >
                                                            {discardingId === doc.id ? <Loader2 size={16} className="animate-spin" /> : <Slash size={16} />}
                                                        </button>
                                                        <button 
                                                            onClick={() => handleSync(doc.id)} 
                                                            disabled={syncingId === doc.id}
                                                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-indigo-700 shadow-sm flex items-center gap-2"
                                                        >
                                                            {syncingId === doc.id ? <RefreshCw size={14} className="animate-spin" /> : <RefreshCw size={14} />}
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
                    </div>
                </div>
            ) : (
                /* Integridad de Mensajería */
                <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden min-h-[400px]">
                    <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 flex flex-col md:flex-row justify-between items-center gap-4">
                        <div className="text-sm font-bold text-indigo-700 flex items-center gap-2">
                            <MessageSquare size={18} className="text-indigo-500" />
                            Buffer de Fallos en Notificaciones y Alertas
                        </div>
                        {messagingInconsistencies.some(i => i.type === 'ORPHAN') && (
                            <button 
                                onClick={() => handleRepairMessaging('ORPHAN')}
                                disabled={repairingPart === 'ORPHAN'}
                                className="px-4 py-2 bg-red-600 text-white rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-red-700 transition-all flex items-center gap-2 shadow-sm disabled:opacity-50"
                            >
                                <Trash2 size={12} />
                                Limpiar Huérfanos
                            </button>
                        )}
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead className="bg-slate-50 text-[10px] font-bold uppercase text-slate-400 border-b">
                                <tr>
                                    <th className="px-6 py-4 text-left">Documento</th>
                                    <th className="px-6 py-4 text-left">Evento / Descripción</th>
                                    <th className="px-6 py-4 text-left">Envía</th>
                                    <th className="px-6 py-4 text-left">Destinatario</th>
                                    <th className="px-6 py-4 text-left">Fecha</th>
                                    <th className="px-6 py-4 text-right">Reparación</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {messagingInconsistencies.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} className="py-20 text-center">
                                            <div className="flex flex-col items-center justify-center text-slate-400">
                                                <CheckCircle2 size={48} className="text-green-200 mb-3" />
                                                <p className="font-bold text-slate-500">Bandeja Coherente</p>
                                                <p className="text-xs">No hay problemas de mensajería detectados.</p>
                                            </div>
                                        </td>
                                    </tr>
                                ) : messagingInconsistencies.map((issue, idx) => (
                                    <tr key={idx} className="hover:bg-indigo-50/20 transition-colors">
                                        <td className="px-6 py-4">
                                            <div className="font-bold text-slate-900">{issue.docTitle}</div>
                                            <div className="text-[10px] text-slate-400 font-mono">{issue.docId}</div>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-2 mb-1">
                                                <div className={`w-2 h-2 rounded-full ${issue.title.includes('Aprobación') ? 'bg-green-500' : 'bg-red-500'}`} />
                                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-700">{issue.title.includes('Aprobación') ? 'APROBACIÓN' : 'RECHAZO'}</div>
                                            </div>
                                            <p className="text-xs text-slate-500">{issue.description}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase">{issue.senderName}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <div className="w-5 h-5 rounded-full bg-indigo-100 flex items-center justify-center text-[8px] font-black text-indigo-600 border border-indigo-200">
                                                    {(issue.userName && issue.userName !== 'Usuario Desconocido' ? issue.userName : '??').substring(0, 2).toUpperCase()}
                                                </div>
                                                <div className="flex flex-col gap-1">
                                                    {issue.userName === 'Usuario Desconocido' ? (
                                                        <div className="flex flex-col gap-1">
                                                            <span className="text-[10px] font-bold text-red-500">ID Desconocido ({issue.userId})</span>
                                                            <div className="relative">
                                                                <select 
                                                                    className="w-full pl-2 pr-6 py-1 border border-red-200 rounded text-[9px] font-bold bg-white outline-none focus:ring-1 focus:ring-red-400 appearance-none"
                                                                    value={reassignMap[issue.id] || ''}
                                                                    onChange={(e) => setReassignMap(prev => ({ ...prev, [issue.id]: e.target.value }))}
                                                                >
                                                                    <option value="">Reasignar a...</option>
                                                                    {allUsers.filter(u => u.role !== UserRole.ADMIN).map(u => (
                                                                        <option key={u.id} value={u.id}>{u.name}</option>
                                                                    ))}
                                                                </select>
                                                                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-red-400 pointer-events-none" />
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] font-bold text-slate-600">{issue.userName}</span>
                                                    )}
                                                </div>
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-xs font-mono text-slate-500">
                                            {new Date(issue.timestamp).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <button 
                                                onClick={() => handleRepairMessaging('MISSING_ALERT', issue)}
                                                disabled={repairingPart === issue.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all shadow-sm"
                                            >
                                                {repairingPart === issue.id ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                                                Notificar
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminEventLog;
