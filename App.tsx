// src/App.tsx
import React from 'react';
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
import Profile from './views/Profile';

// ELIMINAMOS la dependencia de AuthService (Mock Backend)
// Mantenemos estas interfaces para la lógica de rutas
import { UserRole } from './types'; 
import { logoutUser } from './services/firebaseAuthService'; 
import { useAuthStatus } from './hooks/useAuthStatus'; 
import ListaDocumentos from './components/ListaDocumentos';


const App: React.FC = () => {
    // ==========================================================
    // CORRECCIÓN TS2339: Desestructuramos correctamente el hook
    // ==========================================================
    const { user, cargando } = useAuthStatus(); 

    // Usamos 'user' directamente en las rutas para la validación
    const handleLogout = async () => {
        await logoutUser(); 
    };
    
    // Si el hook está cargando, mostramos un estado de espera.
    if (cargando) {
        return <div>Cargando autenticación...</div>;
    }

    return (
        <HashRouter>
            <Routes>
                {/* Login ya no necesita onLogin */}
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
                                    {/* RUTA DE PRUEBA TEMPORAL: Asegúrate que tienes esta línea para probar Firestore */}
                                    <Route path="/" element={<ListaDocumentos />} /> 
                                    {/* <Route path="/" element={<Dashboard user={user} />} /> <-- La original */}
                                    
                                    <Route path="/inbox" element={<Buffer user={user} />} />
                                    <Route path="/new" element={<CreateDocument user={user} />} />
                                    <Route path="/doc/:id" element={<DocumentDetail user={user} />} />
                                    
                                    {/* CORRECCIÓN TS2741: Eliminamos la prop onUpdate que Firebase no necesita */}
                                    <Route path="/profile" element={<Profile user={user} />} /> 

                                    {/* El resto de las rutas de admin son correctas */}
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