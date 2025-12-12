
import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Login from './views/Login';
import Dashboard from './views/Dashboard';
import CreateDocument from './views/CreateDocument';
import DocumentDetail from './views/DocumentDetail';
import AdminUsers from './views/AdminUsers';
import AdminAssignments from './views/AdminAssignments';
import AdminDatabase from './views/AdminDatabase';
import Buffer from './views/Buffer';
import WorkList from './views/WorkList';
import Profile from './views/Profile';
import { UserRole } from './types'; 
import { logoutUser } from './services/firebaseAuthService'; 
import { useAuthStatus } from './hooks/useAuthStatus'; 
import { RefreshCw } from 'lucide-react';

const App: React.FC = () => {
    const { user, cargando } = useAuthStatus(); 

    const handleLogout = async () => {
        await logoutUser(); 
        window.location.reload();
    };
    
    if (cargando) {
        return (
            <div className="flex flex-col h-screen items-center justify-center bg-slate-50 gap-4">
                <div className="flex items-center gap-2 text-indigo-600 font-semibold animate-pulse">
                    <RefreshCw className="animate-spin" />
                    Cargando aplicación...
                </div>
            </div>
        );
    }

    return (
        <HashRouter>
            <Routes>
                <Route 
                    path="/login" 
                    element={!user ? <Login /> : <Navigate to="/" />} 
                />
                
                <Route
                    path="*"
                    element={
                        user ? (
                            <Layout user={user} onLogout={handleLogout}>
                                <Routes>
                                    <Route path="/" element={<Dashboard user={user} />} />
                                    
                                    <Route path="/inbox" element={<Buffer user={user} />} />
                                    <Route path="/worklist" element={<WorkList user={user} />} />
                                    <Route path="/new" element={<CreateDocument user={user} />} />
                                    <Route path="/doc/:id" element={<DocumentDetail user={user} />} />
                                    
                                    <Route path="/profile" element={<Profile user={user} onUpdate={() => window.location.reload()} />} /> 

                                    {/* Rutas de Administración */}
                                    <Route 
                                        path="/admin/users" 
                                        element={user.role === UserRole.ADMIN ? <AdminUsers /> : <Navigate to="/" />} 
                                    />
                                    <Route 
                                        path="/admin/assignments" 
                                        element={(user.role === UserRole.ADMIN || user.role === UserRole.COORDINATOR) ? <AdminAssignments user={user} /> : <Navigate to="/" />} 
                                    />
                                    <Route 
                                        path="/admin/database" 
                                        element={user.role === UserRole.ADMIN ? <AdminDatabase /> : <Navigate to="/" />} 
                                    />
                                    <Route path="*" element={<Navigate to="/" />} />
                                </Routes>
                            </Layout>
                        ) : (
                            <Navigate to="/login" />
                        )
                    }
                />
            </Routes>
        </HashRouter>
    );
};

export default App;
