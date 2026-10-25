import { useEffect, useState, useCallback } from 'react'
import { Search, Loader2, CheckCircle, XCircle, Eye, Filter, Download } from 'lucide-react'
import { supabase, STORAGE_BUCKET } from '../../lib/supabase'
import { TicketRequest, TicketWithRelations, TicketStatus } from '../../types'

type FilterStatus = 'all' | TicketStatus

export default function AdminTickets() {
  const [tickets, setTickets] = useState<TicketWithRelations[]>([])
  const [requests, setRequests] = useState<TicketRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [ticketError, setTicketError] = useState<string | null>(null)
  const [requestsLoading, setRequestsLoading] = useState(true)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<FilterStatus>('all')
  const [selectedTicket, setSelectedTicket] = useState<TicketWithRelations | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [proofUrl, setProofUrl] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)

  const loadTickets = useCallback(() => {
    setLoading(true)
    supabase
      .from('tickets')
      .select('*, table:tables(*), payment_method:payment_methods(*)')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          setTicketError(error.message)
        } else {
          setTickets(data as TicketWithRelations[] || [])
          setTicketError(null)
        }
        setLoading(false)
      })
  }, [])

  const loadRequests = useCallback(async () => {
    setRequestsLoading(true)
    const { data, error } = await supabase
      .from('ticket_requests')
      .select('*, table:tables(*), payment_method:payment_methods(*), ticket:tickets(qr_token)')
      .order('created_at', { ascending: false })

    if (error) {
      setRequestError(error.message)
    } else {
      setRequests((data || []) as TicketRequest[])
      setRequestError(null)
    }
    setRequestsLoading(false)
  }, [])

  useEffect(() => {
    loadTickets()
    loadRequests()
  }, [loadTickets, loadRequests])

  const loadProofUrl = async (path: string | null) => {
    if (!path) { setProofUrl(null); return }
    const { data } = await supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    setProofUrl(data.publicUrl)
  }

  const updateStatus = async (ticket: TicketWithRelations, status: TicketStatus, notes?: string) => {
    setActionLoading(true)
    const updates: Record<string, unknown> = { status, updated_at: new Date().toISOString() }
    if (notes !== undefined) updates.admin_notes = notes

    const { error } = await supabase.from('tickets').update(updates).eq('id', ticket.id)
    if (!error) {
      loadTickets()
      if (selectedTicket?.id === ticket.id) {
        setSelectedTicket({ ...ticket, status, admin_notes: notes ?? ticket.admin_notes })
      }
    } else {
      setTicketError(`Impossible de mettre à jour le billet : ${error.message}`)
    }
    setActionLoading(false)
    setShowRejectModal(false)
    setRejectNotes('')
  }

  const sendDecisionPush = async (requestId: string) => {
    setActionLoading(true)
    setRequestError(null)
    const { data, error } = await supabase.functions.invoke('send-ticket-decision-push', {
      body: { request_id: requestId },
    })
    await loadRequests()
    if (error) {
      setRequestError(`La décision est enregistrée, mais la notification push n’a pas pu être envoyée : ${error.message}`)
    } else if (data?.status === 'failed') {
      setRequestError(`La notification push n’a pas pu être envoyée : ${data.error || 'erreur OneSignal inconnue'}`)
    } else if (data?.status === 'sending') {
      setRequestError('La notification push est déjà en cours d’envoi. Réessayez dans quelques instants.')
    }
    setActionLoading(false)
  }

  const decideRequest = async (request: TicketRequest, decision: 'approved' | 'rejected') => {
    setActionLoading(true)
    setRequestError(null)
    const { error } = await supabase.rpc('decide_ticket_request', {
      p_request_id: request.id,
      p_decision: decision,
      p_admin_notes: '',
    })

    if (error) {
      setRequestError(`La décision n’a pas été enregistrée : ${error.message}`)
      setActionLoading(false)
      return
    }

    const { data, error: pushError } = await supabase.functions.invoke('send-ticket-decision-push', {
      body: { request_id: request.id },
    })
    await Promise.all([loadRequests(), loadTickets()])
    if (pushError) {
      setRequestError(`La décision est enregistrée, mais la notification push n’a pas pu être envoyée : ${pushError.message}`)
    } else if (data?.status === 'failed') {
      setRequestError(`La décision est enregistrée, mais la notification push n’a pas pu être envoyée : ${data.error || 'erreur OneSignal inconnue'}`)
    }
    setActionLoading(false)
  }

  const filtered = tickets.filter(t => {
    const matchesSearch = t.full_name.toLowerCase().includes(search.toLowerCase()) ||
      t.phone.includes(search) ||
      t.qr_token.toLowerCase().includes(search.toLowerCase())
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const statusBadge = (status: TicketStatus) => {
    const map = {
      pending: { class: 'badge-pending', label: 'En attente' },
      approved: { class: 'badge-approved', label: 'Validé' },
      rejected: { class: 'badge-rejected', label: 'Refusé' },
      used: { class: 'badge-used', label: 'Utilisé' },
    }
    return map[status]
  }

  const openTicket = (token: string) => {
    window.open(`/ticket/${token}`, '_blank', 'noopener,noreferrer')
  }

  const exportCSV = () => {
    const headers = ['Nom', 'Téléphone', 'Table', 'Paiement', 'Places', 'Statut', 'Date']
    const rows = filtered.map(t => [
      t.full_name,
      t.phone,
      t.table?.name || '',
      t.payment_method?.name || '',
      t.quantity,
      statusBadge(t.status).label,
      new Date(t.created_at).toLocaleString('fr-FR'),
    ])
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `billets-${Date.now()}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Demandes et billets</h1>
          <p className="text-gray-500 text-sm mt-1">Un billet et son QR code sont créés uniquement après validation.</p>
        </div>
        <button onClick={exportCSV} className="btn-secondary flex items-center gap-2 self-start">
          <Download className="w-4 h-4" />
          Exporter CSV
        </button>
      </div>

      {requestError && <div role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{requestError}</div>}

      <div className="card mb-6 overflow-hidden">
        <div className="border-b border-gray-100 p-4 sm:p-5">
          <h2 className="font-semibold text-gray-900">Demandes de réservation</h2>
          <p className="mt-1 text-sm text-gray-500">Les demandes en attente ne possèdent pas encore de billet ni de QR code.</p>
        </div>
        {requestsLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary-600" /></div>
        ) : requests.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-500">Aucune demande enregistrée.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Client</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Réservation</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Statut</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {requests.map(request => {
                  const proofUrl = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(request.payment_proof_path).data.publicUrl
                  const qrToken = request.ticket?.qr_token
                  const requestStatus = request.status === 'pending'
                    ? { className: 'badge-pending', label: 'En attente' }
                    : request.status === 'approved'
                      ? { className: 'badge-approved', label: 'Validée' }
                      : { className: 'badge-rejected', label: 'Refusée' }
                  const pushStatus = request.push_status === 'sent'
                    ? 'Notification push envoyée'
                    : request.push_status === 'sending'
                      ? 'Notification push en cours'
                      : request.push_status === 'failed'
                        ? 'Échec de la notification push'
                        : request.push_status === 'pending' && request.status !== 'pending'
                          ? 'Notification push à envoyer'
                          : null

                  return (
                    <tr key={request.id} className="align-top">
                      <td className="px-4 py-4">
                        <p className="font-medium text-gray-900">{request.full_name}</p>
                        <p className="text-sm text-gray-500">{request.phone}</p>
                        <p className="text-sm text-gray-500">{request.email}</p>
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        <p>{request.table?.name || 'Table indisponible'} · {request.quantity} place(s)</p>
                        <p className="text-xs text-gray-500">{request.payment_method?.name || 'Paiement indisponible'}</p>
                        <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs text-primary-600 hover:underline">Voir la preuve</a>
                        {request.admin_notes && <p className="mt-2 text-xs text-amber-700">{request.admin_notes}</p>}
                        {qrToken && <button onClick={() => openTicket(qrToken)} className="mt-2 block text-xs text-primary-600 hover:underline">Ouvrir le billet émis</button>}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`badge ${requestStatus.className}`}>{requestStatus.label}</span>
                        {pushStatus && <p className={`mt-2 text-xs ${request.push_status === 'failed' ? 'text-red-600' : 'text-gray-500'}`}>{pushStatus}</p>}
                        {request.push_error && <p className="mt-1 max-w-56 text-xs text-red-600">{request.push_error}</p>}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          {request.status === 'pending' && (
                            <>
                              <button onClick={() => decideRequest(request, 'approved')} className="btn-success inline-flex items-center gap-1 px-3 py-2 text-xs" disabled={actionLoading}>
                                <CheckCircle className="h-4 w-4" /> Valider
                              </button>
                              <button onClick={() => decideRequest(request, 'rejected')} className="btn-danger inline-flex items-center gap-1 px-3 py-2 text-xs" disabled={actionLoading}>
                                <XCircle className="h-4 w-4" /> Refuser
                              </button>
                            </>
                          )}
                          {request.status !== 'pending' && request.push_status !== 'sent' && (
                            <button onClick={() => sendDecisionPush(request.id)} className="btn-secondary px-3 py-2 text-xs" disabled={actionLoading}>
                              Renvoyer la notification push
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {ticketError && <div role="alert" className="mb-5 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">{ticketError}</div>}

      {/* Filters */}
      <div className="card p-4 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-11"
              placeholder="Rechercher par nom, téléphone, QR code..."
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-gray-400" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as FilterStatus)}
              className="input-field cursor-pointer"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending">En attente</option>
              <option value="approved">Validés</option>
              <option value="rejected">Refusés</option>
              <option value="used">Utilisés</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tickets Table */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-primary-600 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500">Aucun billet trouvé</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-100">
                <tr>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Client</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Table</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3 hidden md:table-cell">Paiement</th>
                  <th className="text-left text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Statut</th>
                  <th className="text-right text-xs font-semibold text-gray-500 uppercase tracking-wider px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(ticket => {
                  const badge = statusBadge(ticket.status)
                  return (
                    <tr key={ticket.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-gray-600 font-semibold text-sm">
                            {ticket.full_name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-gray-900 text-sm">{ticket.full_name}</p>
                            <p className="text-xs text-gray-500">{ticket.phone} · {ticket.quantity} place(s)</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{ticket.table?.name || 'N/A'}</td>
                      <td className="px-6 py-4 text-sm text-gray-700 hidden md:table-cell">{ticket.payment_method?.name || 'N/A'}</td>
                      <td className="px-6 py-4">
                        <span className={`badge ${badge.class}`}>{badge.label}</span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-end gap-1 sm:gap-2 flex-wrap">
                          <button
                            onClick={() => openTicket(ticket.qr_token)}
                            className="p-2 rounded-lg hover:bg-accent-50 text-accent-600 transition-colors"
                            title="Ouvrir et imprimer le billet"
                          >
                            <Download className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setSelectedTicket(ticket); loadProofUrl(ticket.payment_proof_path) }}
                            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
                            title="Voir détails"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          {ticket.status === 'pending' && (
                            <>
                              <button
                                onClick={() => updateStatus(ticket, 'approved')}
                                className="btn-success text-xs sm:text-sm flex items-center gap-1 px-2 sm:px-3"
                                disabled={actionLoading}
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span className="hidden sm:inline">Valider</span>
                              </button>
                              <button
                                onClick={() => { setSelectedTicket(ticket); setShowRejectModal(true) }}
                                className="btn-danger text-sm"
                                disabled={actionLoading}
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          {ticket.status === 'approved' && (
                            <button
                              onClick={() => updateStatus(ticket, 'pending')}
                              className="btn-secondary text-xs sm:text-sm px-2 sm:px-3"
                              disabled={actionLoading}
                            >
                              <span className="hidden sm:inline">Remettre en attente</span>
                              <span className="sm:hidden">Attente</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedTicket && !showRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedTicket(null)}>
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="p-4 sm:p-6">
              <div className="flex justify-between items-start mb-4">
                <h2 className="text-lg sm:text-xl font-bold text-gray-900">Détails du billet</h2>
                <button onClick={() => setSelectedTicket(null)} className="text-gray-400 hover:text-gray-600 p-1">
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-400">Nom complet</p>
                    <p className="font-medium text-gray-900">{selectedTicket.full_name}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-400">Téléphone</p>
                    <p className="font-medium text-gray-900">{selectedTicket.phone}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-400">Table</p>
                    <p className="font-medium text-gray-900">{selectedTicket.table?.name || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-400">Mode de paiement</p>
                    <p className="font-medium text-gray-900">{selectedTicket.payment_method?.name || 'N/A'}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-400">Places</p>
                    <p className="font-medium text-gray-900">{selectedTicket.quantity}</p>
                  </div>
                  <div className="p-3 rounded-lg bg-gray-50">
                    <p className="text-xs text-gray-400">Total</p>
                    <p className="font-medium text-gray-900">
                      {selectedTicket.table ? (Number(selectedTicket.table.price) * selectedTicket.quantity).toLocaleString() : 0} F
                    </p>
                  </div>
                </div>

                <div className="p-3 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400 mb-1">Statut</p>
                  <span className={`badge ${statusBadge(selectedTicket.status).class}`}>{statusBadge(selectedTicket.status).label}</span>
                </div>

                {selectedTicket.admin_notes && (
                  <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                    <p className="text-xs text-amber-600 mb-1">Notes admin</p>
                    <p className="text-sm text-amber-800">{selectedTicket.admin_notes}</p>
                  </div>
                )}

                <div>
                  <p className="text-xs text-gray-400 mb-2">Preuve de paiement</p>
                  {proofUrl ? (
                    <a href={proofUrl} target="_blank" rel="noopener noreferrer" className="block">
                      <img src={proofUrl} alt="Preuve de paiement" className="w-full rounded-lg border border-gray-200 max-h-64 object-contain bg-gray-50" />
                      <p className="text-xs text-primary-600 mt-1 text-center">Cliquez pour agrandir</p>
                    </a>
                  ) : (
                    <p className="text-sm text-gray-400 italic">Aucune preuve fournie</p>
                  )}
                </div>

                <div className="p-3 rounded-lg bg-gray-50">
                  <p className="text-xs text-gray-400">QR Token</p>
                  <p className="font-mono text-xs text-gray-600 break-all">{selectedTicket.qr_token}</p>
                </div>

                {selectedTicket.status === 'pending' && (
                  <div className="flex flex-col sm:flex-row gap-3 pt-2">
                    <button
                      onClick={() => updateStatus(selectedTicket, 'approved')}
                      className="btn-success flex-1 flex items-center justify-center gap-2"
                      disabled={actionLoading}
                    >
                      <CheckCircle className="w-5 h-5" />
                      Valider le paiement
                    </button>
                    <button
                      onClick={() => setShowRejectModal(true)}
                      className="btn-danger flex-1 flex items-center justify-center gap-2"
                      disabled={actionLoading}
                    >
                      <XCircle className="w-5 h-5" />
                      Refuser
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Modal */}
      {showRejectModal && selectedTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setShowRejectModal(false); setRejectNotes('') }}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-4 sm:p-6">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4">Refuser le billet</h2>
              <p className="text-sm text-gray-500 mb-4">Ajoutez une raison du refus (visible par le client)</p>
              <textarea
                value={rejectNotes}
                onChange={e => setRejectNotes(e.target.value)}
                className="input-field min-h-24"
                placeholder="Ex: Paiement non reçu, montant incorrect..."
              />
              <div className="flex gap-3 mt-4">
                <button onClick={() => { setShowRejectModal(false); setRejectNotes('') }} className="btn-secondary flex-1">
                  Annuler
                </button>
                <button
                  onClick={() => updateStatus(selectedTicket, 'rejected', rejectNotes)}
                  className="btn-danger flex-1"
                  disabled={actionLoading}
                >
                  Confirmer le refus
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
