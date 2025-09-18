import { Routes, Route, Navigate } from 'react-router-dom'
import AuthProvider from './contexts/AuthContext'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard-Advanced'
import Employees from './pages/Employees'
import Departments from './pages/Departments'
import Requests from './pages/Requests'
import Reports from './pages/Reports'

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="departments" element={<Departments />} />
          <Route path="requests" element={<Requests />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<div className="p-4"><h2>Configurações em desenvolvimento</h2></div>} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AuthProvider>
  )
}

export default App