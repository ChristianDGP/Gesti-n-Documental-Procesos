import React, { useState, useEffect } from 'react';
import { UserService, NotificationService, HistoryService } from '../services/firebaseBackend';
import { migrateUserIds } from '../services/dataMigration';
import { User, Notification } from '../types';
import { Search, Mail, RefreshCw, User as UserIcon, AlertTriangle, Database } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    user: User;
}

const AdminInboxManager: React.FC<Props> = ({ user }) => {
    const [users, setUsers] = useState<User[]>([]);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [actorFilter, setActorFilter] = useState<string>('');
    const [showAll, setShowAll] = useState(true);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(false);

    // Get unique actors from notifications
    const actors = Array.from(new Set(notifications.map(n => n.actorName))).sort();

    const filteredNotifications = notifications
        .filter(n => (actorFilter === '' || n.actorName === actorFilter))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const displayedNotifications = showAll ? filteredNotifications : filteredNotifications.slice(0, 20);

    useEffect(() => {
        UserService.getAll().then(users => {
            console.log("Fetched users:", users);
            setUsers(users);
        });
        NotificationService.getAll().then(setNotifications);
    }, []);

    const fetchNotifications = async (userId: string) => {
        setLoading(true);
        setActorFilter(''); // Reset filter when changing user
        try {
            const data = await NotificationService.getByUserId(userId);
            setNotifications(data);
        } catch (error) {
            toast.error("Error al cargar notificaciones");
        } finally {
            setLoading(false);
        }
    };

    const handleResend = async (notif: Notification) => {
        if (!selectedUser) return;
        try {
            await NotificationService.create(
                selectedUser.id,
                notif.documentId,
                notif.type,
                `[REENVÍO] ${notif.title}`,
                notif.message,
                notif.actorName
            );
            await HistoryService.log(
                notif.documentId,
                user,
                'Reenvío de Notificación',
                'N/A' as any,
                'N/A' as any,
                `Notificación re-enviada a ${selectedUser.name}. ID original: ${notif.id}`
            );
            toast.success("Notificación re-enviada exitosamente");
        } catch (error) {
            toast.error("Error al re-enviar notificación");
        }
    };

    const runMigration = async () => {
        if (!confirm("¿Está seguro de que desea ejecutar la migración de IDs de usuario? Esto actualizará las notificaciones antiguas.")) return;
        setLoading(true);
        try {
            const count = await migrateUserIds();
            toast.success(`Migración completada. ${count} notificaciones actualizadas.`);
            NotificationService.getAll().then(setNotifications);
        } catch (error) {
            toast.error("Error al ejecutar la migración");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-bold text-slate-900">Gestión de Bandeja de Entrada</h1>
                <button
                    onClick={runMigration}
                    className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                    <Database size={16} />
                    Ejecutar Migración de IDs
                </button>
            </div>
            
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 grid grid-cols-2 gap-4">
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Para (Analista)</label>
                    <select 
                        className="w-full p-2 border border-slate-300 rounded-lg"
                        onChange={(e) => {
                            const u = users.find(u => u.id === e.target.value) || null;
                            setSelectedUser(u);
                            setShowAll(true); // Show all by default
                            if (u) fetchNotifications(u.id);
                            else setNotifications([]);
                        }}
                    >
                        <option value="">Seleccione un usuario...</option>
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">De (Actor)</label>
                    <select 
                        className="w-full p-2 border border-slate-300 rounded-lg"
                        value={actorFilter}
                        onChange={(e) => setActorFilter(e.target.value)}
                        disabled={!selectedUser || actors.length === 0}
                    >
                        <option value="">Todos los actores...</option>
                        {actors.map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                </div>
            </div>

            {/* Show table regardless of user selection */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-700 flex justify-between items-center">
                    <span>
                        Mostrando {displayedNotifications.length} de {filteredNotifications.length} (Total: {notifications.length}) notificaciones
                        {selectedUser ? ` para ${selectedUser.name}` : ''}
                    </span>
                    {filteredNotifications.length > 20 && (
                        <button 
                            onClick={() => setShowAll(!showAll)}
                            className="text-xs bg-slate-100 hover:bg-slate-200 px-3 py-1 rounded-full text-slate-700"
                        >
                            {showAll ? 'Mostrar menos' : 'Mostrar todas'}
                        </button>
                    )}
                </div>
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-slate-500 text-xs uppercase">
                        <tr>
                            <th className="p-3 text-left">Fecha</th>
                            <th className="p-3 text-left">De</th>
                            <th className="p-3 text-left">Para</th>
                            <th className="p-3 text-left">Título</th>
                            <th className="p-3 text-left">Mensaje</th>
                            <th className="p-3 text-center">Acciones</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {displayedNotifications.map(n => (
                            <tr key={n.id}>
                                <td className="p-3 text-xs text-slate-500">{new Date(n.timestamp).toLocaleString()}</td>
                                <td className="p-3 text-xs font-bold text-slate-700">{n.actorName}</td>
                                <td className="p-3 text-xs text-slate-700">{users.find(u => u.id === n.userId)?.name || `Desconocido (${n.userId})`}</td>
                                <td className="p-3 text-xs font-medium">{n.title}</td>
                                <td className="p-3 text-xs text-slate-600">{n.message}</td>
                                <td className="p-3 text-center">
                                    <button 
                                        onClick={() => handleResend(n)}
                                        className="text-indigo-600 hover:text-indigo-800 font-bold text-xs"
                                    >
                                        Reenviar
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

        </div>
    );
};

export default AdminInboxManager;
