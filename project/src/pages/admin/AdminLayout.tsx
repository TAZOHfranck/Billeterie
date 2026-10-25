import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Ticket as TicketIcon, Table2, CreditCard, Settings, ScanLine, LogOut, QrCode } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'

const navItems = [
  { to: '/admin', label: 'Accueil', icon: LayoutDashboard, end: true },
  { to: '/admin/tickets', label: 'Billets', icon: TicketIcon },
  { to: '/admin/scanner', label: 'Scan', icon: ScanLine },
  { to: '/admin/tables', label: 'Tables', icon: Table2 },
  { to: '/admin/payments', label: 'Paiements', icon: CreditCard },
  { to: '/admin/settings', label: 'Réglages', icon: Settings },
]

export default function AdminLayout() {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/admin/login')
  }

  return (
    <div className="min-h-screen bg-gray-50 md:flex">
      {/* Sidebar - Desktop */}
      <aside className="hidden md:flex w-64 bg-gray-900 flex-col fixed h-screen">
        <div className="p-6">
          <div className="flex items-center gap-2 text-white">
            <div className="w-10 h-10 rounded-lg bg-accent-500 flex items-center justify-center">
              <QrCode className="w-5 h-5" />
            </div>
            <div>
              <p className="font-bold">Admin Panel</p>
              <p className="text-xs text-gray-400">Ticketing System</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-accent-500 text-gray-950'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-gray-800">
          <p className="text-xs text-gray-500 mb-2 truncate">{user?.email}</p>
          <button
            onClick={handleSignOut}
            className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm w-full px-2 py-1"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Mobile Top Header */}
      <header className="md:hidden fixed top-0 left-0 right-0 bg-gray-900 z-30 h-14 flex items-center justify-between px-4">
        <div className="flex items-center gap-2 text-white">
          <div className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center">
            <QrCode className="w-4 h-4" />
          </div>
          <span className="font-bold text-sm">Admin</span>
        </div>
        <button
          onClick={handleSignOut}
          className="text-gray-400 hover:text-white p-2"
          title="Déconnexion"
        >
          <LogOut className="w-5 h-5" />
        </button>
      </header>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 z-30 border-t border-gray-800 safe-area-pb">
        <div className="flex items-center justify-around px-1 py-1.5">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 px-1.5 py-1 rounded-lg text-[10px] font-medium transition-colors min-w-0 flex-1 ${
                  isActive
                    ? 'text-accent-400'
                    : 'text-gray-500'
                }`
              }
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span className="truncate w-full text-center">{item.label}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 md:ml-64 pt-14 md:pt-0 pb-20 md:pb-0 min-h-screen">
        <Outlet />
      </main>
    </div>
  )
}
