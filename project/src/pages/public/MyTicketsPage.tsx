import { useEffect, useState } from 'react'
import { Link, Navigate, useLocation } from 'react-router-dom'
import { ArrowLeft, Bell, Calendar, Loader2, LogOut, Ticket as TicketIcon, Upload } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { supabase, STORAGE_BUCKET } from '../../lib/supabase'
import { requestOneSignalPermission } from '../../lib/oneSignal'
import { TicketRequest, TicketWithRelations } from '../../types'

export default function MyTicketsPage() {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [tickets, setTickets] = useState<TicketWithRelations[]>([])
  const [requests, setRequests] = useState<TicketRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pushMessage, setPushMessage] = useState<string | null>(null)
  const [trancheRequestId, setTrancheRequestId] = useState<string | null>(null)
  const [trancheAmount, setTrancheAmount] = useState('')
  const [trancheProof, setTrancheProof] = useState<File | null>(null)
  const [trancheLoading, setTrancheLoading] = useState(false)
  const [trancheMessage, setTrancheMessage] = useState<string | null>(null)
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
      supabase.from('ticket_requests').select('*, table:tables(*), payment_method:payment_methods(*), ticket:tickets(qr_token), tranches:ticket_payment_tranches(*)').eq('user_id', user.id).order('created_at', { ascending: false }),
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
  const submitTranche = async (request: TicketRequest) => {
    setTrancheMessage(null)
    const amount = Number(trancheAmount)
    const remaining = Number(request.target_amount) - Number(request.approved_amount)
    if (!trancheProof || amount <= 0 || amount > remaining) {
      setTrancheMessage('Saisissez un montant valide et ajoutez la preuve du versement.')
      return
    }

    setTrancheLoading(true)
    try {
      const fileExt = trancheProof.name.split('.').pop()
      const filePath = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from(STORAGE_BUCKET).upload(filePath, trancheProof)
      if (uploadError) throw uploadError

      const { data: trancheId, error: submitError } = await supabase.rpc('submit_ticket_payment_tranche', {
        p_request_id: request.id,
        p_payment_proof_path: filePath,
        p_amount: amount,
      })
      if (submitError) throw submitError

      await supabase.functions.invoke('send-ticket-request-email', {
        body: { request_id: request.id, tranche_id: trancheId },
      })

      setTrancheRequestId(null)
      setTrancheAmount('')
      setTrancheProof(null)
      setTrancheMessage('Versement enregistré. Il attend la validation de l’administration.')
      const { data } = await supabase
        .from('ticket_requests')
        .select('*, table:tables(*), payment_method:payment_methods(*), ticket:tickets(qr_token), tranches:ticket_payment_tranches(*)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
      setRequests((data || []) as TicketRequest[])
    } catch (error) {
      setTrancheMessage(error instanceof Error ? error.message : 'Impossible d’enregistrer le versement.')
    } finally {
      setTrancheLoading(false)
    }
  }

  const enablePushNotifications = async () => {
    if (!user) return
    setPushMessage(null)
    try {
      const enabled = await requestOneSignalPermission(user.id)
      setPushMessage(enabled
        ? 'Les notifications push sont activées sur cet appareil.'
        : 'Les notifications ne sont pas autorisées. Vérifiez les réglages de votre navigateur.')
    } catch {
      setPushMessage('Impossible d’activer les notifications. Vérifiez que votre navigateur les prend en charge.')
    }
  }

  return (
    <div className="min-h-screen bg-[#100806] px-4 py-6 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-3xl">
        <div className="mb-6 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-accent-300"><ArrowLeft className="h-4 w-4" /> Accueil</Link>
          <button onClick={() => signOut()} className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"><LogOut className="h-4 w-4" /> Déconnexion</button>
        </div>
        <div className="mb-8"><p className="text-xs font-bold uppercase tracking-[0.3em] text-accent-300">Espace personnel</p><h1 className="display-font mt-2 text-5xl font-bold text-white">Mes réservations</h1><p className="mt-2 text-sm text-gray-400">Retrouvez ici vos demandes en attente et vos billets validés.</p><button onClick={enablePushNotifications} className="btn-secondary mt-4 inline-flex items-center gap-2"><Bell className="h-4 w-4" /> Activer les notifications push</button>{pushMessage && <p role="status" className="mt-2 text-sm text-gray-300">{pushMessage}</p>}</div>

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
                {request.status === 'pending' && request.payment_mode === 'installment' && (
                  <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-sm font-semibold text-amber-900">Paiement par tranche</p>
                    <div className="mt-2 grid grid-cols-3 gap-2 text-sm">
                      <div><span className="block text-xs text-gray-500">Total</span><strong>{Number(request.target_amount).toLocaleString('fr-FR')} F</strong></div>
                      <div><span className="block text-xs text-gray-500">Validé</span><strong className="text-green-700">{Number(request.approved_amount).toLocaleString('fr-FR')} F</strong></div>
                      <div><span className="block text-xs text-gray-500">Restant</span><strong className="text-red-700">{Math.max(0, Number(request.target_amount) - Number(request.approved_amount)).toLocaleString('fr-FR')} F</strong></div>
                    </div>
                    {request.tranches?.length ? (
                      <ul className="mt-3 space-y-1 text-xs text-gray-600">
                        {request.tranches.map(tranche => (
                          <li key={tranche.id} className="flex flex-col gap-1 border-b border-amber-100 pb-2"><span className="flex justify-between gap-2"><span>{Number(tranche.amount).toLocaleString('fr-FR')} F · {new Date(tranche.created_at).toLocaleDateString('fr-FR')}</span><span>{tranche.status === 'approved' ? 'Validé' : tranche.status === 'rejected' ? 'Refusé' : 'En attente'}</span></span>{tranche.status === 'approved' && <Link to={`/payment-receipt/${encodeURIComponent(tranche.receipt_token)}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-accent-700 hover:underline">Voir / imprimer le ticket du versement</Link>}</li>
                        ))}
                      </ul>
                    ) : null}
                    {request.status === 'pending' && request.payment_status !== 'paid' && trancheRequestId !== request.id ? (
                      <button type="button" onClick={() => { setTrancheRequestId(request.id); setTrancheAmount(''); setTrancheProof(null); setTrancheMessage(null) }} className="btn-primary mt-4 inline-flex">Ajouter un versement</button>
                    ) : null}
                  </div>
                )}
                {trancheRequestId === request.id && (
                  <div className="mt-3 space-y-3 rounded-xl border border-gray-200 bg-white p-4">
                    {(() => {
                      const remaining = Math.max(0, Number(request.target_amount) - Number(request.approved_amount))
                      const receiver = request.payment_method?.receiver_number?.replace(/\D/g, '') || ''
                      const code = (request.payment_method?.ussd_template || '')
                        .replace(/\{\{receiver\}\}/g, receiver)
                        .replace(/\{\{amount\}\}/g, String(Math.round(Number(trancheAmount) || 0)))
                      const validCode = /^[0-9*#]+$/.test(code) && (!request.payment_method?.ussd_template.includes('{{receiver}}') || Boolean(receiver))
                      return (
                        <>
                          <label className="block text-sm font-medium text-gray-700">Montant du nouveau versement</label>
                          <input type="number" min="1" max={remaining} step="1" value={trancheAmount} onChange={event => setTrancheAmount(event.target.value)} className="input-field" />
                          {validCode && Number(trancheAmount) > 0 && (
                            <div className="rounded-lg bg-gray-50 p-3">
                              <p className="text-xs text-gray-500">Code USSD du versement</p>
                              <code className="mt-1 block break-all font-mono text-sm">{code}</code>
                              <a href={`tel:${encodeURIComponent(code)}`} className="btn-primary mt-3 inline-flex">Ouvrir le composeur</a>
                            </div>
                          )}
                          <label className="block"><span className="mb-1 block text-sm font-medium text-gray-700">Preuve de versement</span><input type="file" accept="image/*,.pdf" onChange={event => setTrancheProof(event.target.files?.[0] || null)} className="input-field" /></label>
                          <div className="flex gap-2"><button type="button" onClick={() => submitTranche(request)} disabled={trancheLoading} className="btn-primary inline-flex items-center gap-2"><Upload className="h-4 w-4" />{trancheLoading ? 'Enregistrement...' : 'Envoyer la tranche'}</button><button type="button" onClick={() => setTrancheRequestId(null)} className="btn-secondary">Annuler</button></div>
                        </>
                      )
                    })()}
                  </div>
                )}
                {trancheMessage && <p role="status" className="mt-3 text-sm text-amber-700">{trancheMessage}</p>}
                {request.status === 'pending' && <p className="mt-3 text-sm text-amber-700">Votre demande est en cours de vérification. Aucun billet n’a encore été émis.</p>}
                {request.status === 'approved' && request.ticket?.qr_token && <Link to={`/ticket/${request.ticket.qr_token}`} className="btn-primary mt-4 inline-flex">Afficher le billet validé</Link>}
                {request.status === 'rejected' && <p className="mt-3 text-sm text-red-700">La demande a été refusée. Consultez votre notification push pour plus d’informations.</p>}
              </div>
            ))}
            {tickets.map(ticket => <Link key={ticket.id} to={`/ticket/${ticket.qr_token}`} className="block rounded-2xl border border-accent-400/30 bg-[#fffdf7] p-5 text-gray-900 transition hover:-translate-y-0.5 hover:border-accent-400 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-widest text-accent-700">{ticket.table?.name || 'Billet événement'}</p><h2 className="mt-1 text-lg font-bold">{ticket.full_name}</h2></div><span className={`badge ${ticket.status === 'approved' ? 'badge-approved' : ticket.status === 'rejected' ? 'badge-rejected' : ticket.status === 'used' ? 'badge-used' : 'badge-pending'}`}>{statusLabel[ticket.status]}</span></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-gray-500"><span className="inline-flex items-center gap-1"><Calendar className="h-4 w-4" /> {new Date(ticket.created_at).toLocaleDateString('fr-FR')}</span><span>{ticket.quantity} place(s)</span><span className="font-mono text-xs">{ticket.qr_token.slice(0, 8)}...</span></div></Link>)}
          </div>
        )}
      </div>
    </div>
  )
}
