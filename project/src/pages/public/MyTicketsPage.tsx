import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Calendar, Loader2, LogOut, Ticket as TicketIcon } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { TicketRequest, TicketWithRelations } from '../../types'

export default function MyTicketsPage() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [tickets, setTickets] = useState<TicketWithRelations[]>([])
  const [requests, setRequests] = useState<TicketRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const notificationWarning = typeof location.state === 'object' &&
    location.state !== null &&
    'notificationWarning' in location.state &&
    typeof location.state.notificationWarning === 'string'
    ? location.state.notificationWarning
    : null

  useEffect(() => {
    if (!user) return
    let active = true
    Promise.all([
      supabase.from('tickets').select('*, table:tables(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('ticket_requests').select('*, table:tables(*), ticket:tickets(qr_token)').eq('user_id', user.id).order('created_at', { ascending: false }),
    ]).then(([ticketResult, requestResult]) => {
      if (!active) return
      if (ticketResult.error || requestResult.error) {
        setError(ticketResult.error?.message || requestResult.error?.message || 'Impossible de charger vos réservations.')
      } else {
        setTickets((ticketResult.data || []) as TicketWithRelations[])
        setRequests((requestResult.data || []) as TicketRequest[])
      }
      setLoading(false)
    })
    return () => { active = false }
  }, [user])

  if (!user) return <Navigate to="/reserve" replace />

  const statusLabel: Record<string, string> = {
    pending: 'En attente',
    approved: 'Validé',
    rejected: 'Refusé',
    used: 'Utilisé',
  }
  const hasReservations = requests.length > 0 || tickets.length > 0

  return (
    <div className="min-h-screen bg-[#100806] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-accent-300"><ArrowLeft className="h-4 w-4" /> Accueil</Link>
          <button onClick={() => signOut()} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"><LogOut className="h-4 w-4" /> Déconnexion</button>
        </div>
        <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-300">Espace personnel</p><h1 className="display-font mt-2 text-5xl font-bold text-white">Mes réservations</h1><p className="mt-2 text-sm text-gray-400">Retrouvez ici vos demandes en attente et vos billets validés.</p></div>

        {error && <div className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
        {notificationWarning && <div role="status" className="mb-5 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-800">{notificationWarning}</div>}
        {loading ? <div className="flex justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-accent-300" /></div> : !hasReservations ? (
          <div className="rounded-2xl border border-accent-400/30 bg-black/30 p-10 text-center"><TicketIcon className="mx-auto h-10 w-10 text-accent-300" /><p className="mt-4 text-gray-300">Aucune demande ni aucun billet associé à ce compte.</p><Link to="/reserve" className="btn-primary mt-6 inline-flex">Réserver un billet</Link></div>
        ) : (
          <div className="space-y-4">
            {requests.map(request => (
              <div key={request.id} className="rounded-2xl border border-accent-400/30 bg-[#fffdf7] p-5 text-gray-900 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-widest text-accent-700">{request.table?.name || 'Réservation événement'}</p>
                    <h2 className="mt-1 text-lg font-bold">{request.full_name}</h2>
                    <p className="mt-1 text-sm text-gray-500">{request.email}</p>
                  </div>
                  <span className={`badge ${request.status === 'approved' ? 'badge-approved' : request.status === 'rejected' ? 'badge-rejected' : 'badge-pending'}`}>{statusLabel[request.status]}</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500">
                  <span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" /> {new Date(request.created_at).toLocaleDateString('fr-FR')}</span>
                  <span>{request.quantity} place(s)</span>
                </div>
                {request.admin_notes && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{request.admin_notes}</p>}
                {request.status === 'pending' && <p className="mt-3 text-sm text-amber-700">Votre demande est en cours de vérification. Aucun billet n’a encore été émis.</p>}
                {request.status === 'approved' && request.ticket?.qr_token && <Link to={`/ticket/${request.ticket.qr_token}`} className="btn-primary mt-4 inline-flex">Afficher le billet validé</Link>}
                {request.status === 'rejected' && <p className="mt-3 text-sm text-red-700">La demande a été refusée. Consultez votre email pour plus d’informations.</p>}
              </div>
            ))}
            {tickets.map(ticket => <Link key={ticket.id} to={`/ticket/${ticket.qr_token}`} className="block rounded-2xl border border-accent-400/30 bg-[#fffdf7] p-5 text-gray-900 transition hover:-translate-y-0.5 hover:border-accent-400 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-accent-700">{ticket.table?.name || 'Billet événement'}</p><h2 className="mt-1 text-lg font-bold">{ticket.full_name}</h2></div><span className={`badge ${ticket.status === 'approved' ? 'badge-approved' : ticket.status === 'rejected' ? 'badge-rejected' : ticket.status === 'used' ? 'badge-used' : 'badge-pending'}`}>{statusLabel[ticket.status]}</span></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500"><span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" /> {new Date(ticket.created_at).toLocaleDateString('fr-FR')}</span><span>{ticket.quantity} place(s)</span><span className="font-mono text-xs">{ticket.qr_token.slice(0, 8)}...</span></div></Link>)}
          </div>
        )}
      </div>
    </div>
  )
}
