import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import QRCode from 'qrcode'
import { ArrowLeft, BadgeCheck, Download, Loader2, Printer, XCircle } from 'lucide-react'
import { supabase, supabaseUrl } from '../../lib/supabase'

interface PaymentReceipt {
  receipt_token: string
  amount: number
  decided_at: string
  full_name: string
  phone: string
  quantity: number
  target_amount: number
  approved_amount: number
  table_name: string | null
  payment_method_name: string | null
}

interface EventDetails {
  event_name: string
  event_location: string
}

export default function TicketPaymentReceiptPage() {
  const { token } = useParams<{ token: string }>()
  const [receipt, setReceipt] = useState<PaymentReceipt | null>(null)
  const [event, setEvent] = useState<EventDetails>({ event_name: 'Événement', event_location: 'À préciser' })
  const [qrUrl, setQrUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [error, setError] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    let active = true

    const loadReceipt = async () => {
      setLoading(true)
      setNotFound(false)
      setError(false)
      setLoadError(false)
      const [receiptResult, eventResult] = await Promise.all([
        supabase.rpc('get_approved_tranche_receipt', { p_receipt_token: token }),
        supabase.from('event_settings').select('event_name, event_location').limit(1).maybeSingle(),
      ])

      if (!active) return
      if (receiptResult.error) {
        setLoadError(true)
        setLoading(false)
        return
      }
      if (!receiptResult.data) {
        setNotFound(true)
        setLoading(false)
        return
      }

      const paymentReceipt = receiptResult.data as PaymentReceipt
      try {
        const code = await QRCode.toDataURL(paymentReceipt.receipt_token, {
          width: 420,
          margin: 2,
          color: { dark: '#160806', light: '#ffffff' },
        })
        if (!active) return
        setReceipt(paymentReceipt)
        setQrUrl(code)
        if (eventResult.error) {
          setError(true)
        } else if (eventResult.data) {
          setEvent(eventResult.data)
        }
      } catch {
        if (active) setError(true)
      } finally {
        if (active) setLoading(false)
      }
    }

    if (token) void loadReceipt()
    else {
      setNotFound(true)
      setLoading(false)
    }

    return () => { active = false }
  }, [token, retryCount])

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-[#100806]"><Loader2 className="h-8 w-8 animate-spin text-accent-300" /></div>
  }

  if (loadError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#100806] px-6 text-center">
        <div>
          <XCircle className="mx-auto h-16 w-16 text-amber-300" />
          <h1 className="mt-4 text-2xl font-bold text-white">Ticket temporairement inaccessible</h1>
          <p className="mt-2 text-gray-300">Impossible de charger ce reçu. Réessayez dans quelques instants.</p>
          <button type="button" onClick={() => setRetryCount(count => count + 1)} className="btn-primary mt-6">Réessayer</button>
        </div>
      </div>
    )
  }

  if (notFound || !receipt) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#100806] px-6 text-center">
        <div>
          <XCircle className="mx-auto h-16 w-16 text-red-400" />
          <h1 className="mt-4 text-2xl font-bold text-white">Ticket de versement introuvable</h1>
          <p className="mt-2 text-gray-300">Ce versement n’existe pas ou n’a pas encore été validé.</p>
          <Link to="/my-tickets" className="btn-primary mt-6 inline-flex">Retour à mes réservations</Link>
        </div>
      </div>
    )
  }

  const remaining = Math.max(0, Number(receipt.target_amount) - Number(receipt.approved_amount))
  const receiptPdfUrl = `${supabaseUrl}/functions/v1/download-tranche-receipt?token=${encodeURIComponent(receipt.receipt_token)}`

  return (
    <main className="payment-receipt-page min-h-screen bg-[#100806] px-3 py-6 text-gray-900 sm:px-6 sm:py-10">
      <div className="no-print mx-auto mb-4 flex max-w-[760px] items-center justify-between gap-3">
        <Link to="/my-tickets" className="inline-flex items-center gap-2 text-sm text-gray-300 hover:text-accent-300"><ArrowLeft className="h-4 w-4" /> Mes réservations</Link>
        <span className="text-xs text-gray-400">Ticket de paiement sécurisé</span>
      </div>

      <article className="payment-receipt-sheet mx-auto max-w-[760px] overflow-hidden rounded-2xl border border-accent-400/50 bg-[#fffdf7] shadow-2xl">
        <header className="payment-receipt-header relative bg-[radial-gradient(ellipse_at_top,#4a1b0f,#170806_58%,#080504)] px-6 py-8 text-center text-white sm:px-12">
          <div className="absolute left-0 right-0 top-0 h-1.5 bg-accent-400" />
          <p className="text-[10px] font-semibold tracking-[0.35em] text-accent-200 sm:text-xs">IPD-YAOUNDÉ PRÉSENTE</p>
          <h1 className="display-font mt-3 text-4xl font-bold text-accent-300 sm:text-5xl">{event.event_name}</h1>
          <p className="mt-2 text-xs font-bold uppercase tracking-[0.25em] text-white sm:text-sm">Ticket de paiement par tranche</p>
        </header>

        <div className="flex items-center justify-center gap-2 border-b border-green-200 bg-green-50 px-5 py-3 text-sm font-bold text-green-800">
          <BadgeCheck className="h-5 w-5" /> Versement validé par l’administration
        </div>

        <div className="payment-receipt-content grid gap-8 p-6 sm:grid-cols-[1fr_220px] sm:p-10">
          <section className="payment-receipt-details">
            <p className="text-xs font-bold uppercase tracking-[0.25em] text-accent-600">Reçu nominatif</p>
            <h2 className="mt-2 break-words text-2xl font-bold uppercase text-[#160806] sm:text-3xl">{receipt.full_name}</h2>
            <p className="mt-1 text-sm text-gray-500">{receipt.phone}</p>

            <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-5">
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Montant versé</p><p className="mt-1 text-xl font-bold text-accent-700">{Number(receipt.amount).toLocaleString('fr-FR')} F</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Validé le</p><p className="mt-1 text-sm font-bold text-[#160806]">{receipt.decided_at ? new Date(receipt.decided_at).toLocaleDateString('fr-FR') : '—'}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Table</p><p className="mt-1 font-bold text-[#160806]">{receipt.table_name || 'N/A'}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Nombre de places</p><p className="mt-1 font-bold text-[#160806]">{receipt.quantity}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Mode de paiement</p><p className="mt-1 font-bold text-[#160806]">{receipt.payment_method_name || 'N/A'}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-widest text-gray-500">Lieu</p><p className="mt-1 font-bold text-[#160806]">{event.event_location || 'À préciser'}</p></div>
            </div>

            <div className="mt-7 grid grid-cols-3 gap-2 border-y border-dashed border-accent-400 py-4 text-center">
              <div><p className="text-[9px] font-semibold uppercase text-gray-500">Total</p><p className="mt-1 text-sm font-bold">{Number(receipt.target_amount).toLocaleString('fr-FR')} F</p></div>
              <div><p className="text-[9px] font-semibold uppercase text-gray-500">Cumul validé</p><p className="mt-1 text-sm font-bold text-green-700">{Number(receipt.approved_amount).toLocaleString('fr-FR')} F</p></div>
              <div><p className="text-[9px] font-semibold uppercase text-gray-500">Solde restant</p><p className={`mt-1 text-sm font-bold ${remaining ? 'text-amber-700' : 'text-green-700'}`}>{remaining.toLocaleString('fr-FR')} F</p></div>
            </div>

            <p className="mt-5 break-all text-[10px] text-gray-500">Référence du versement : {receipt.receipt_token}</p>
            <p className="mt-2 text-xs text-gray-500">Ce reçu atteste uniquement la validation de ce versement. Il ne remplace pas le billet d’entrée.</p>
          </section>

          <aside className="payment-receipt-qr flex flex-col items-center justify-center border-t border-gray-200 pt-6 sm:border-l sm:border-t-0 sm:pl-8 sm:pt-0">
            {qrUrl && <div className="rounded-xl border-4 border-[#160806] p-3"><img src={qrUrl} alt="QR code du ticket de versement" className="h-40 w-40" /></div>}
            <p className="mt-3 text-center text-xs text-gray-500">QR code de vérification du reçu</p>
          </aside>
        </div>
      </article>

      {error && <p role="status" className="no-print mx-auto mt-3 max-w-[760px] text-sm text-amber-200">Les informations de l’événement sont temporairement indisponibles.</p>}
      <div className="no-print mx-auto mt-5 flex max-w-[760px] flex-col justify-center gap-3 sm:flex-row">
        <button type="button" onClick={() => window.print()} className="btn-primary inline-flex items-center justify-center gap-2"><Printer className="h-4 w-4" /> Imprimer le ticket</button>
        <a href={receiptPdfUrl} className="btn-secondary inline-flex items-center justify-center gap-2"><Download className="h-4 w-4" /> Télécharger le ticket PDF</a>
      </div>
    </main>
  )
}
