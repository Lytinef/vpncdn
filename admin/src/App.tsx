import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth/AuthContext';
import { Layout } from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Payments from './pages/Payments';
import Nodes from './pages/Nodes';
import Bypass from './pages/Bypass';
import Versions from './pages/Versions';
import Broadcast from './pages/Broadcast';

export default function App() {
  const { admin, loading } = useAuth();

  if (loading) return <div className="center">Загрузка…</div>;

  if (!admin) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/users" element={<Users />} />
        <Route path="/users/:id" element={<UserDetail />} />
        <Route path="/payments" element={<Payments />} />
        <Route path="/nodes" element={<Nodes />} />
        <Route path="/bypass" element={<Bypass />} />
        <Route path="/versions" element={<Versions />} />
        <Route path="/broadcast" element={<Broadcast />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}
