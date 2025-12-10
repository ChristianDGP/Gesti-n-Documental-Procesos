
import React, { useState, useEffect } from 'react';
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
import { AuthService } from './services/mockBackend';
import { User, UserRole } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const currentUser = AuthService.getCurrentUser();
    if (currentUser) {
      setUser(currentUser);
    }
  }, []);

  const handleLogin = () => {
    const currentUser = AuthService.getCurrentUser();
    setUser(currentUser);
  };

  const handleLogout = () => {
    AuthService.logout();
    setUser(null);
  };

  return (
    <HashRouter>
      <Routes>
        <Route 
          path="/login" 
          element={!user ? <Login onLogin={handleLogin} /> : <Navigate to="/" />} 
        />
        
        <Route
          path="*"
          element={
            user ? (
              <Layout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<Dashboard user={user} />} />
                  <Route path="/inbox" element={<Buffer user={user} />} />
                  <Route path="/new" element={<CreateDocument user={user} />} />
                  <Route path="/doc/:id" element={<DocumentDetail user={user} />} />
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
