import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { Login } from './pages/Login'
import { InvoicesList } from './pages/InvoicesList'
import { InvoiceDetail } from './pages/InvoiceDetail'
import { InvoiceForm } from './pages/InvoiceForm'
import { Clients } from './pages/Clients'
import { ClientForm } from './pages/ClientForm'
import { Dashboard } from './pages/Dashboard'
import { Recurring } from './pages/Recurring'
import { Settings } from './pages/Settings'

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <p className="text-center text-sm text-slate-400 py-16">Loading…</p>
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<PrivateRoute><InvoicesList /></PrivateRoute>} />
      <Route path="/invoices/new" element={<PrivateRoute><InvoiceForm /></PrivateRoute>} />
      <Route path="/invoices/:id" element={<PrivateRoute><InvoiceDetail /></PrivateRoute>} />
      <Route path="/invoices/:id/edit" element={<PrivateRoute><InvoiceForm /></PrivateRoute>} />
      <Route path="/clients" element={<PrivateRoute><Clients /></PrivateRoute>} />
      <Route path="/clients/new" element={<PrivateRoute><ClientForm /></PrivateRoute>} />
      <Route path="/clients/:id/edit" element={<PrivateRoute><ClientForm /></PrivateRoute>} />
      <Route path="/dashboard" element={<PrivateRoute><Dashboard /></PrivateRoute>} />
      <Route path="/recurring" element={<PrivateRoute><Recurring /></PrivateRoute>} />
      <Route path="/settings" element={<PrivateRoute><Settings /></PrivateRoute>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </BrowserRouter>
  )
}
