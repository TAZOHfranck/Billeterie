import { useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import { LoadingScreen } from './components/LoadingScreen'
import { initializeOneSignal } from './lib/oneSignal'
import LandingPage from './pages/public/LandingPage'
import TicketFormPage from './pages/public/TicketFormPage'
import TicketStatusPage from './pages/public/TicketStatusPage'
import MyTicketsPage from './pages/public/MyTicketsPage'
import AdminLogin from './pages/admin/AdminLogin'
import AdminLayout from './pages/admin/AdminLayout'
import AdminDashboard from './pages/admin/AdminDashboard'
import AdminTickets from './pages/admin/AdminTickets'
import AdminTables from './pages/admin/AdminTables'
import AdminPaymentMethods from './pages/admin/AdminPaymentMethods'
import AdminSettings from './pages/admin/AdminSettings'
import AdminScanner from './pages/admin/AdminScanner'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { session, isAdmin, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!session) return <Navigate to="/admin/login" replace />
  if (!isAdmin) return <Navigate to="/reserve" replace />
  return <>{children}</>
}

export default function App() {
  useEffect(() => {
    initializeOneSignal().catch((error: unknown) => {
      console.error('OneSignal initialization failed:', error)
    })
  }, [])

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/reserve" element={<TicketFormPage />} />
      <Route path="/ticket/:token" element={<TicketStatusPage />} />
      <Route path="/my-tickets" element={<MyTicketsPage />} />
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin" element={<ProtectedRoute><AdminLayout /></ProtectedRoute>}>
        <Route index element={<AdminDashboard />} />
        <Route path="tickets" element={<AdminTickets />} />
        
        <Route path="tables" element={<AdminTables />} />
        <Route path="payments" element={<AdminPaymentMethods />} />
        <Route path="settings" element={<AdminSettings />} />
        <Route path="scanner" element={<AdminScanner />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
