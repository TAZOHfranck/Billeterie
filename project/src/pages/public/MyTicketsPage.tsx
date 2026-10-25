import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, Calendar, Loader2, LogOut, Ticket as TicketIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { TicketWithRelations } from '../../types'

export default function MyTicketsPage() {
  const { user, signOut } = useAuth()
  const [tickets, setTickets] = useState<TicketWithRelations[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    supabase.from('tickets').select('*, table:tables(*)').eq('user_id', user.id).order('created_at', { ascending: false }).then(({ data }) => {
      setTickets((data || []) as TicketWithRelations[])
      setLoading(false)
    })
  }, [user])

  if (!user) return <Navigate to="/reserve" replace />

  const statusLabel: Record<string, string> = {
    pending: 'En attente',
    approved: 'Validé',
    rejected: 'Refusé',
    used: 'Utilisé',
  }

  return (
    <div className="min-h-screen bg-[#100806] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-accent-300"><ArrowLeft className="h-4 w-4" /> Accueil</Link>
          <button onClick={() => signOut()} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"><LogOut className="h-4 w-4" /> Déconnexion</button>
        </div>
        <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-300">Espace personnel</p><h1 className="display-font mt-2 text-5xl font-bold text-white">Mes billets</h1><p className="mt-2 text-sm text-gray-400">Retrouvez ici toutes vos réservations associées à ce numéro.</p></div>

        {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-accent-300" /></div> : tickets.length === 0 ? (
          <div className="rounded-2xl border border-accent-400/30 bg-black/30 p-10 text-center"><TicketIcon className="mx-auto h-10 w-10 text-accent-300" /><p className="mt-4 text-gray-300">Aucun billet associé à ce compte.</p><Link to="/reserve" className="btn-primary mt-6 inline-flex">Réserver un billet</Link></div>
        ) : (
          <div className="space-y-4">{tickets.map(ticket => <Link key={ticket.id} to={`/ticket/${ticket.qr_token}`} className="block rounded-2xl border border-accent-400/30 bg-[#fffdf7] p-5 text-gray-900 transition hover:-translate-y-0.5 hover:border-accent-400 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-accent-700">{ticket.table?.name || 'Billet événement'}</p><h2 className="mt-1 text-lg font-bold">{ticket.full_name}</h2></div><span className={`badge ${ticket.status === 'approved' ? 'badge-approved' : ticket.status === 'rejected' ? 'badge-rejected' : ticket.status === 'used' ? 'badge-used' : 'badge-pending'}`}>{statusLabel[ticket.status]}</span></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500"><span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" /> {new Date(ticket.created_at).toLocaleDateString('fr-FR')}</span><span>{ticket.quantity} place(s)</span><span className="font-mono text-xs">{ticket.qr_token.slice(0, 8)}...</span></div></Link>)}</div>
        )}
      </div>
    </div>
  )
}
