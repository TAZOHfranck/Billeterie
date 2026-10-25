import { useEffect, useState } from 'react'
import { Ticket as TicketIcon, Clock, CheckCircle, XCircle, Users, TrendingUp, Table2, ScanLine } from 'lucide-react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface Stats {
  total: number
  pending: number
  approved: number
  rejected: number
  used: number
  totalRevenue: number
  totalSeats: number
}

interface RecentTicket {
  id: string
  full_name: string
  phone: string
  status: string
  created_at: string
  table: { name: string; price: number } | null
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentTickets, setRecentTickets] = useState<RecentTicket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      supabase.from('tickets').select('*, table:tables(name, price)'),
      supabase.from('tables').select('*'),
      supabase.from('ticket_requests').select('id').eq('status', 'pending'),
    ]).then(([ticketsRes, tablesRes, requestsRes]) => {
      if (ticketsRes.error || tablesRes.error || requestsRes.error) {
        setError(ticketsRes.error?.message || tablesRes.error?.message || requestsRes.error?.message || 'Impossible de charger le tableau de bord.')
        setLoading(false)
        return
      }

      const tickets = ticketsRes.data || []
      const tables = tablesRes.data || []
      const pendingRequests = requestsRes.data || []

      const totalRevenue = tickets
        .filter(t => t.status === 'approved' || t.status === 'used')
        .reduce((sum, t) => sum + (t.table ? Number(t.table.price) * t.quantity : 0), 0)

      const totalSeats = tickets
        .filter(t => t.status === 'approved' || t.status === 'used')
        .reduce((sum, t) => sum + t.quantity, 0)

      setStats({
        total: tickets.length,
        pending: pendingRequests.length,
        approved: tickets.filter(t => t.status === 'approved').length,
        rejected: tickets.filter(t => t.status === 'rejected').length,
        used: tickets.filter(t => t.status === 'used').length,
        totalRevenue,
        totalSeats,
      })

      setRecentTickets(
        tickets
          .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
          .slice(0, 5)
      )
      setLoading(false)
    })
  }, [])

  if (loading) {
    return <div className="p-6"><div className="animate-pulse space-y-4">
      <div className="h-8 bg-gray-200 rounded w-64"></div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="h-32 bg-gray-200 rounded-xl"></div>)}
      </div>
    </div></div>
  }

  const statCards = [
    { label: 'Total billets', value: stats?.total || 0, icon: TicketIcon, color: 'bg-primary-500', bg: 'bg-primary-50' },
    { label: 'En attente', value: stats?.pending || 0, icon: Clock, color: 'bg-amber-500', bg: 'bg-amber-50' },
    { label: 'Réservations validées', value: (stats?.approved || 0) + (stats?.used || 0), icon: CheckCircle, color: 'bg-green-500', bg: 'bg-green-50' },
    { label: 'Utilisés', value: stats?.used || 0, icon: Users, color: 'bg-blue-500', bg: 'bg-blue-50' },
  ]

  return (
    <div className="p-4 sm:p-6 md:p-8">
      {error && <div className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
      <div className="mb-6 sm:mb-8">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tableau de bord</h1>
        <p className="text-gray-500 text-sm mt-1">Vue d'ensemble de votre événement</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8">
        {statCards.map(card => (
          <div key={card.label} className="card p-5">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${card.bg} flex items-center justify-center`}>
                <card.icon className={`w-5 h-5 ${card.color.replace('bg-', 'text-')}`} />
              </div>
            </div>
            <p className="text-2xl sm:text-3xl font-bold text-gray-900">{card.value}</p>
            <p className="text-xs sm:text-sm text-gray-500 mt-1">{card.label}</p>
          </div>
        ))}
      </div>

      {/* Revenue & Capacity */}
      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500">Revenus validés</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.totalRevenue.toLocaleString() || 0} F</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">Réservations confirmées par l’administration</p>
        </div>

        <div className="card p-5 sm:p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
              <Table2 className="w-5 h-5 text-primary-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm text-gray-500">Places réservées</p>
              <p className="text-xl sm:text-2xl font-bold text-gray-900">{stats?.totalSeats || 0}</p>
            </div>
          </div>
          <p className="text-xs text-gray-400">Total des places dans les billets validés</p>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 gap-3 sm:gap-4 mb-6 sm:mb-8">
        <Link to="/admin/scanner" className="card p-5 sm:p-6 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-accent-50 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <ScanLine className="w-6 h-6 text-accent-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">Scanner un billet</p>
              <p className="text-sm text-gray-500">Vérifier un billet à l'entrée</p>
            </div>
          </div>
        </Link>

        <Link to="/admin/tickets" className="card p-5 sm:p-6 hover:shadow-md transition-shadow group">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center group-hover:scale-110 transition-transform shrink-0">
              <TicketIcon className="w-6 h-6 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">Gérer les billets</p>
              <p className="text-sm text-gray-500">{stats?.pending || 0} en attente de validation</p>
            </div>
          </div>
        </Link>
      </div>

      {/* Recent Tickets */}
      <div className="card p-4 sm:p-6">
        <h2 className="font-semibold text-gray-900 mb-4">Dernières réservations</h2>
        {recentTickets.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">Aucune réservation pour le moment</p>
        ) : (
          <div className="space-y-2">
            {recentTickets.map(ticket => (
              <div key={ticket.id} className="flex items-center justify-between py-3 px-3 sm:px-4 rounded-lg hover:bg-gray-50 transition-colors gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm shrink-0">
                    {ticket.full_name.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 text-sm truncate">{ticket.full_name}</p>
                    <p className="text-xs text-gray-500 truncate">{ticket.table?.name || 'N/A'} · {ticket.phone}</p>
                  </div>
                </div>
                <span className={`badge ${
                  ticket.status === 'pending' ? 'badge-pending' :
                  ticket.status === 'approved' ? 'badge-approved' :
                  ticket.status === 'rejected' ? 'badge-rejected' : 'badge-used'
                }`}>
                  {ticket.status === 'pending' ? 'En attente' :
                   ticket.status === 'approved' ? 'Validé' :
                   ticket.status === 'rejected' ? 'Refusé' : 'Utilisé'}
                </span>
              </div>
            ))}
          </div>
        )}
        <Link to="/admin/tickets" className="block mt-4 text-center text-sm text-primary-600 hover:text-primary-700 font-medium">
          Voir tous les billets →
        </Link>
      </div>
    </div>
  )
}
