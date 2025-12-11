import React from 'react'; // Ya no necesitamos useState/useEffect aquí
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
// import { AuthService } from './services/mockBackend'; 

import { UserRole } from './types'; // Mantenemos UserRole para la lógica de rutas
import { logoutUser } from './services/firebaseAuthService'; // Importamos el logout real
import { useAuthStatus } from './hooks/useAuthStatus'; // Importamos el hook real de Firebase Auth


const App: React.FC = () => {
    // ==========================================================
    // 1. REEMPLAZO DEL ESTADO DEL USUARIO CON EL HOOK REAL
    // ==========================================================
    // user (simulado) y cargando (simulado) son reemplazados por el hook
    const { usuarioFirebase, cargando, userConRoles } = useAuthStatus(); 

    // Nota: El mockAuthService ya no es necesario, pero mantenemos userConRoles
    // que simula tener los roles (isAdmin) asignados
    const user = userConRoles; // Asignación temporal para mantener la sintaxis de rutas


    const handleLogout = async () => {
        await logoutUser(); // Usamos la función de logout real de Firebase
    };
    
    // Si el hook está cargando, mostramos un estado de espera.
    if (cargando) {
        return <div>Cargando autenticación...</div>;
    }

    return (
        <HashRouter>
            <Routes>
                {/* La ruta de login ya no necesita onLogin */}
                <Route 
                    path="/login" 
                    element={!user ? <Login /> : <Navigate to="/" />} 
                />
                
                <Route
                    path="*"
                    element={
                        // 2. LA LÓGICA DE REDIRECCIÓN AHORA DEPENDE DE 'user' (que viene del hook)
                        user ? (
                            <Layout user={user} onLogout={handleLogout}>
                                <Routes>
                                    <Route path="/" element={<Dashboard user={user} />} />
                                    <Route path="/inbox" element={<Buffer user={user} />} />
                                    <Route path="/new" element={<CreateDocument user={user} />} />
                                    <Route path="/doc/:id" element={<DocumentDetail user={user} />} />
                                    <Route path="/profile" element={<Profile user={user} />} /> {/* handleLogin/onUpdate ya no se necesita aquí */}
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