import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { ArrowLeft, Calendar, MapPin, Phone, CheckCircle, Clock, XCircle, Loader2, Table2, CreditCard, Printer, Download, Scissors, ShieldCheck } from 'lucide-react'
import { supabase, supabaseUrl } from '../../lib/supabase'
import { TicketWithRelations, EventSettings } from '../../types'

export default function TicketStatusPage() {
  const { token } = useParams<{ token: string }>()
  const [ticket, setTicket] = useState<TicketWithRelations | null>(null)
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (!token) return
    let active = true
    setLoading(true)
    setTicket(null)
    setQrUrl(null)
    setNotFound(false)
    setLoadError(false)

    const loadTicket = async (firstLoad: boolean) => {
      const [ticketRes, settingsRes] = await Promise.all([
        supabase.from('tickets').select('*, table:tables(*), payment_method:payment_methods(*)').eq('qr_token', token).maybeSingle(),
        firstLoad ? supabase.from('event_settings').select('*').limit(1).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (!active) return
      if (ticketRes.error) {
        setLoadError(true)
        setNotFound(false)
        setLoading(false)
        return
      }
      if (!ticketRes.data) { setNotFound(true); setLoading(false); return }
      const nextTicket = ticketRes.data as TicketWithRelations
      setLoadError(false)
      setNotFound(false)
      setTicket(nextTicket)
      localStorage.setItem('glamour_ticket_cache', JSON.stringify(nextTicket))
      if (settingsRes.data) setSettings(settingsRes.data as EventSettings)
      if (firstLoad) setQrUrl(await QRCode.toDataURL(nextTicket.qr_token, { width: 420, margin: 2, color: { dark: '#031b3b', light: '#ffffff' } }))
      setLoading(false)
    }

    loadTicket(true)
    const refreshTimer = window.setInterval(() => loadTicket(false), 5000)
    return () => { active = false; window.clearInterval(refreshTimer) }
  }, [token])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-[#100806]"><Loader2 className="h-8 w-8 animate-spin text-accent-300" /></div>
  if (notFound) return <div className="flex min-h-screen items-center justify-center bg-[#100806] px-6"><div className="text-center"><XCircle className="mx-auto h-16 w-16 text-red-400" /><h1 className="mt-4 text-2xl font-bold text-white">Billet introuvable</h1><p className="mt-2 text-gray-300">Ce QR code ne correspond à aucun billet.</p><Link to="/" className="btn-primary mt-6 inline-flex">Retour à l'accueil</Link></div></div>
  if (loadError && !ticket) return <div className="flex min-h-screen items-center justify-center bg-[#100806] px-6"><div className="text-center"><XCircle className="mx-auto h-16 w-16 text-amber-300" /><h1 className="mt-4 text-2xl font-bold text-white">Billet temporairement inaccessible</h1><p className="mt-2 text-gray-300">Impossible de charger ce billet. Vérifiez votre connexion puis réessayez.</p><button onClick={() => window.location.reload()} className="btn-primary mt-6">Réessayer</button></div></div>
  if (!ticket) return null

  const statusConfig = {
    pending: { label: 'En attente de validation', icon: Clock, color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-300' },
    approved: { label: 'Billet validé', icon: CheckCircle, color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-300' },
    rejected: { label: 'Billet refusé', icon: XCircle, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-300' },
    used: { label: 'Billet déjà utilisé', icon: CheckCircle, color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-300' },
  }
  const status = statusConfig[ticket.status]
  const StatusIcon = status.icon
  const eventDate = settings?.event_date ? new Date(settings.event_date) : new Date('2026-12-17T18:00:00')
  const eventName = settings?.event_name || 'Soirée Chic & Glamour'
  const eventLocation = settings?.event_location || 'À préciser'
  const total = ticket.table ? Number(ticket.table.price) * ticket.quantity : 0

  return (
    <div className="ticket-page min-h-screen bg-[#100806] px-3 py-6 sm:px-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-[760px] items-center justify-between">
        <Link to="/" className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-accent-300"><ArrowLeft className="h-4 w-4" /> Retour à l'accueil</Link>
        <span className="text-xs text-gray-400">Billet numérique sécurisé</span>
      </div>

      <article className="ticket-sheet mx-auto max-w-[760px] overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="ticket-header relative bg-[radial-gradient(ellipse_at_top,#4a1b0f,#170806_58%,#080504)] px-6 py-8 text-center text-white sm:px-12">
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-accent-400" />
          <p className="text-[10px] font-semibold tracking-[0.35em] text-accent-200 sm:text-xs">IPD-YAOUNDÉ PRÉSENTE</p>
          <p className="display-font mt-3 text-5xl font-bold leading-none sm:text-6xl">Soirée Chic</p>
          <p className="display-font text-5xl font-bold italic leading-none text-accent-300 sm:text-6xl">&amp; Glamour</p>
          <div className="mx-auto mt-5 flex max-w-xs items-center gap-3"><span className="h-px flex-1 bg-accent-400" /><span className="text-xs font-bold tracking-[0.22em] text-accent-200">2ÈME ÉDITION</span><span className="h-px flex-1 bg-accent-400" /></div>
        </header>

        <div className={`ticket-status ${status.bg} ${status.border} flex items-center justify-center gap-2 border-b px-5 py-3`}><StatusIcon className={`h-5 w-5 ${status.color}`} /><span className={`text-sm font-bold ${status.color}`}>{status.label}</span></div>

        <div className="ticket-content grid gap-8 p-6 sm:grid-cols-[1fr_240px] sm:p-10">
          <section>
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent-600">Billet officiel</p>
            <h1 className="ticket-buyer-name mt-2 text-3xl font-bold uppercase tracking-wide text-[#160806]">{ticket.full_name}</h1>
            <p className="mt-1 flex items-center gap-1 text-sm text-gray-500"><Phone className="h-3 w-3" /> {ticket.phone}</p>

            <div className="ticket-details mt-8 grid grid-cols-1 gap-5 min-[420px]:grid-cols-2">
              <div><p className="ticket-label"><Calendar className="h-3.5 w-3.5" /> Date</p><p className="ticket-value">{eventDate.toLocaleDateString('fr-FR')}</p><p className="text-xs text-gray-500">À partir de 18h</p></div>
              <div><p className="ticket-label"><MapPin className="h-3.5 w-3.5" /> Lieu</p><p className="ticket-value">{eventLocation}</p></div>
              <div><p className="ticket-label"><Table2 className="h-3.5 w-3.5" /> Table</p><p className="ticket-value">{ticket.table?.name || 'N/A'}</p></div>
              <div><p className="ticket-label"><CreditCard className="h-3.5 w-3.5" /> Places</p><p className="ticket-value">{ticket.quantity}</p></div>
            </div>

            <div className="ticket-motto mt-8 border-y border-dashed border-accent-400 py-5"><p className="display-font text-3xl italic text-accent-600">Tenue élégante exigée</p><p className="mt-1 text-[10px] font-semibold tracking-[0.32em] text-[#031b3b]">ÉLÉGANCE · TALENT · GLAMOUR</p></div>
            <div className="ticket-note mt-6 flex items-center gap-2 text-xs text-gray-500"><ShieldCheck className="h-4 w-4 text-green-600" /> Billet nominatif, valable pour une seule entrée.</div>
          </section>

          <aside className="ticket-qr flex flex-col items-center justify-center border-t border-gray-200 pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            <div className="ticket-qr-frame rounded-xl border-4 border-[#031b3b] p-3"><img src={qrUrl || ''} alt="QR code du billet" className="h-48 w-48" /></div>
            <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-widest text-gray-500">À présenter à l'entrée</p>
            <p className="mt-2 break-all text-center font-mono text-[9px] text-gray-400">{ticket.qr_token}</p>
            <div className="mt-6 rounded-lg bg-[#f7eee0] px-5 py-3 text-center"><p className="text-[10px] uppercase text-gray-500">Montant</p><p className="text-2xl font-bold text-[#160806]">{total.toLocaleString()} F</p></div>
          </aside>
        </div>

        <footer className="ticket-footer flex flex-col items-start justify-between gap-4 border-t-2 border-dashed border-accent-400 bg-[#f7eee0] px-6 py-5 sm:flex-row sm:items-center sm:px-10"><div><p className="text-xs font-bold uppercase tracking-widest text-[#160806]">{eventName}</p><p className="mt-1 text-xs text-gray-500">Conservez ce billet jusqu'à l'entrée.</p></div><Scissors className="no-print h-5 w-5 rotate-90 text-accent-600" /></footer>
      </article>

      <div className="no-print mx-auto mt-5 flex max-w-[760px] flex-col justify-center gap-3 sm:flex-row"><button onClick={() => window.print()} className="btn-primary inline-flex items-center justify-center gap-2"><Printer className="h-4 w-4" /> Imprimer / enregistrer en PDF</button>{ticket.status === 'approved' || ticket.status === 'used' ? <a href={`${supabaseUrl}/functions/v1/download-ticket-pdf?token=${encodeURIComponent(ticket.qr_token)}`} className="btn-secondary inline-flex items-center justify-center gap-2"><Download className="h-4 w-4" /> Télécharger le billet PDF</a> : null}</div>
    </div>
  )
}
