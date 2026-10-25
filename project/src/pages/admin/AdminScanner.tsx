import { useEffect, useRef, useState, useCallback } from 'react'
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode'
import { ScanLine, Loader2, CheckCircle, XCircle, AlertCircle, Camera, RotateCcw, Keyboard, History, X, Table2, CreditCard, Phone, CameraOff } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { TicketWithRelations } from '../../types'

type ScanStatus = 'success' | 'already_used' | 'not_found' | 'not_approved' | 'error'

interface ScanResult {
  status: ScanStatus
  ticket?: TicketWithRelations
  message: string
}

interface HistoryEntry {
  token: string
  name: string
  status: ScanStatus
  time: string
}

function beep(ok: boolean) {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain); gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.value = ok ? 880 : 330
    gain.gain.setValueAtTime(0.18, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25)
    osc.start(); osc.stop(ctx.currentTime + 0.25)
  } catch { /* audio not available */ }
}

export default function AdminScanner() {
  const { user } = useAuth()
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const isProcessing = useRef(false)
  const [scanning, setScanning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [result, setResult] = useState<ScanResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [manualToken, setManualToken] = useState('')
  const [showManual, setShowManual] = useState(false)
  const [history, setHistory] = useState<HistoryEntry[]>([])
  const [showHistory, setShowHistory] = useState(false)
  const mountId = 'qr-camera-mount'

  const stopScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        if (scannerRef.current.isScanning) await scannerRef.current.stop()
        scannerRef.current.clear()
      } catch { /* ignore */ }
      scannerRef.current = null
    }
    const mount = document.getElementById(mountId)
    if (mount) mount.innerHTML = ''
    setScanning(false)
  }, [])

  const addToHistory = (entry: HistoryEntry) => {
    setHistory(prev => [entry, ...prev].slice(0, 20))
  }

  const verifyTicket = useCallback(async (token: string) => {
    if (isProcessing.current) return
    isProcessing.current = true
    setLoading(true)
    setError(null)

    try {
      const { data, error: queryError } = await supabase
        .from('tickets')
        .select('*, table:tables(*), payment_method:payment_methods(*)')
        .eq('qr_token', token.trim())
        .maybeSingle()

      if (queryError || !data) {
        beep(false)
        setResult({ status: 'not_found', message: 'Billet introuvable. Ce QR code ne correspond à aucun billet.' })
        addToHistory({ token, name: '—', status: 'not_found', time: new Date().toLocaleTimeString('fr-FR') })
        setLoading(false)
        isProcessing.current = false
        return
      }

      const ticket = data as TicketWithRelations

      if (ticket.status === 'rejected') {
        beep(false)
        setResult({ status: 'not_approved', ticket, message: 'Ce billet a été refusé par l\'administration.' })
        addToHistory({ token, name: ticket.full_name, status: 'not_approved', time: new Date().toLocaleTimeString('fr-FR') })
      } else if (ticket.status === 'pending') {
        beep(false)
        setResult({ status: 'not_approved', ticket, message: 'Ce billet est encore en attente de validation du paiement.' })
        addToHistory({ token, name: ticket.full_name, status: 'not_approved', time: new Date().toLocaleTimeString('fr-FR') })
      } else if (ticket.status === 'used') {
        beep(false)
        setResult({
          status: 'already_used',
          ticket,
          message: `Ce billet a déjà été utilisé${ticket.scanned_at ? ` le ${new Date(ticket.scanned_at).toLocaleString('fr-FR')}` : ''}.`,
        })
        addToHistory({ token, name: ticket.full_name, status: 'already_used', time: new Date().toLocaleTimeString('fr-FR') })
      } else if (ticket.status === 'approved') {
        const { error: updateError } = await supabase
          .from('tickets')
          .update({
            status: 'used',
            scanned_at: new Date().toISOString(),
            scanned_by: user?.id ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', ticket.id)

        if (updateError) {
          beep(false)
          setResult({ status: 'error', message: 'Erreur lors du marquage du billet.' })
          addToHistory({ token, name: ticket.full_name, status: 'error', time: new Date().toLocaleTimeString('fr-FR') })
        } else {
          beep(true)
          if (navigator.vibrate) navigator.vibrate(200)
          setResult({
            status: 'success',
            ticket: { ...ticket, status: 'used' },
            message: 'Entrée autorisée — bonsoir !',
          })
          addToHistory({ token, name: ticket.full_name, status: 'success', time: new Date().toLocaleTimeString('fr-FR') })
        }
      }
    } catch {
      beep(false)
      setResult({ status: 'error', message: 'Une erreur est survenue lors de la vérification.' })
    }
    setLoading(false)
    isProcessing.current = false
  }, [user])

  const startScanner = useCallback(async () => {
    setError(null)
    setResult(null)
    setStarting(true)

    try {
      await stopScanner()

      const mount = document.getElementById(mountId)
      if (!mount) {
        setError('Conteneur de scan introuvable.')
        setStarting(false)
        return
      }

      mount.innerHTML = ''

      const html5Qrcode = new Html5Qrcode(mountId, {
        formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
        verbose: false,
      })
      scannerRef.current = html5Qrcode

      const mountWidth = mount.clientWidth || 300
      const boxSize = Math.min(220, Math.floor(mountWidth * 0.7))

      await html5Qrcode.start(
        { facingMode: 'environment' },
        {
          fps: 10,
          qrbox: { width: boxSize, height: boxSize },
          aspectRatio: 1.0,
        },
        (decodedText: string) => {
          if (isProcessing.current) return
          stopScanner()
          verifyTicket(decodedText)
        },
        () => {}
      )
      setScanning(true)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('Permission') || msg.includes('denied') || msg.includes('NotAllowed')) {
        setError('Accès caméra refusé. Autorisez la caméra dans votre navigateur, puis réessayez.')
      } else if (msg.includes('NotFound') || msg.includes('device') || msg.includes('No camera')) {
        setError('Aucune caméra détectée. Utilisez la saisie manuelle ci-dessous.')
      } else {
        setError('Impossible de démarrer la caméra. Utilisez la saisie manuelle ci-dessous.')
      }
      setShowManual(true)
    } finally {
      setStarting(false)
    }
  }, [stopScanner, verifyTicket])

  const handleRescan = () => {
    setResult(null)
    startScanner()
  }

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!manualToken.trim()) return
    stopScanner()
    verifyTicket(manualToken)
  }

  useEffect(() => {
    return () => { stopScanner() }
  }, [stopScanner])

  const successCount = history.filter(h => h.status === 'success').length

  const statusConfig: Record<ScanStatus, { icon: typeof CheckCircle; color: string; bg: string; border: string; title: string }> = {
    success: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', border: 'border-green-300', title: 'Entrée autorisée' },
    already_used: { icon: AlertCircle, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-300', title: 'Déjà utilisé' },
    not_found: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-300', title: 'Billet invalide' },
    not_approved: { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-300', title: 'Billet non validé' },
    error: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-300', title: 'Erreur' },
  }

  return (
    <div className="p-6 md:p-8">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Scanner QR</h1>
          <p className="text-gray-500 text-sm mt-1">Scannez le QR code du billet pour vérifier l'entrée</p>
        </div>
        {history.length > 0 && (
          <button onClick={() => setShowHistory(true)} className="btn-secondary flex items-center gap-2 text-sm">
            <History className="w-4 h-4" />
            Historique ({successCount})
          </button>
        )}
      </div>

      {result && (
        <div className="max-w-md mx-auto mb-6">
          <div className={`card p-6 border-2 ${statusConfig[result.status].border} ${statusConfig[result.status].bg}`}>
            <div className="text-center mb-4">
              {(() => {
                const SIcon = statusConfig[result.status].icon
                return <SIcon className={`w-16 h-16 mx-auto ${statusConfig[result.status].color}`} />
              })()}
              <p className={`font-bold text-lg mt-3 ${statusConfig[result.status].color.replace('600', '800')}`}>
                {statusConfig[result.status].title}
              </p>
              <p className="text-sm text-gray-600 mt-1">{result.message}</p>
            </div>

            {result.ticket && (
              <div className="space-y-2 rounded-lg bg-white p-4">
                <div className="flex items-center gap-2 border-b border-gray-100 pb-2 mb-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 font-semibold text-gray-700">
                    {result.ticket.full_name.charAt(0).toUpperCase()}
                  </div>
                  <span className="font-bold text-gray-900">{result.ticket.full_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-gray-500"><Phone className="h-3.5 w-3.5" /> Téléphone</span>
                  <span className="font-medium text-gray-900">{result.ticket.phone}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-gray-500"><Table2 className="h-3.5 w-3.5" /> Table</span>
                  <span className="font-medium text-gray-900">{result.ticket.table?.name || 'N/A'}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="flex items-center gap-1 text-gray-500"><CreditCard className="h-3.5 w-3.5" /> Places</span>
                  <span className="font-medium text-gray-900">{result.ticket.quantity}</span>
                </div>
              </div>
            )}

            <button onClick={handleRescan} className="btn-primary mt-4 flex w-full items-center justify-center gap-2">
              <RotateCcw className="h-5 w-5" />
              Scanner un autre billet
            </button>
          </div>
        </div>
      )}

      {!result && (
        <div className="mx-auto max-w-md">
          {error && (
            <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              <CameraOff className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="card p-6">
            <div className="relative overflow-hidden rounded-xl bg-gray-900" style={{ width: '100%', height: '320px' }}>
              <div id={mountId} style={{ width: '100%', height: '100%' }} />

              {!scanning && !starting && (
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <Camera className="mb-4 h-16 w-16 text-gray-400" />
                  <p className="px-4 text-center text-sm text-gray-400">Cliquez sur le bouton pour démarrer la caméra</p>
                </div>
              )}
              {(starting || loading) && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-gray-900/80">
                  <Loader2 className="h-8 w-8 animate-spin text-white" />
                </div>
              )}
              {scanning && (
                <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                  <div className="rounded-lg border-2 border-accent-400/80" style={{ width: '220px', height: '220px', boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)' }} />
                </div>
              )}
            </div>

            {!scanning ? (
              <div className="mt-4 space-y-2">
                <button onClick={startScanner} disabled={starting} className="btn-primary flex w-full items-center justify-center gap-2">
                  {starting ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
                  {starting ? 'Démarrage...' : 'Démarrer le scan'}
                </button>
                <button onClick={() => { setError(null); setShowManual(true) }} className="flex w-full items-center justify-center gap-2 text-sm text-gray-500 hover:text-gray-700">
                  <Keyboard className="h-4 h-4" />
                  Saisie manuelle du code
                </button>
              </div>
            ) : (
              <button onClick={stopScanner} className="btn-secondary mt-4 w-full">Arrêter le scan</button>
            )}
          </div>

          {showManual && !scanning && (
            <form onSubmit={handleManualSubmit} className="card mt-4 p-4">
              <label className="mb-1.5 block text-sm font-medium text-gray-700">Code du billet</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={manualToken}
                  onChange={e => setManualToken(e.target.value)}
                  className="input-field flex-1 font-mono text-xs"
                  placeholder="Collez le code QR du billet"
                  autoFocus
                />
                <button type="submit" className="btn-primary flex items-center gap-1" disabled={!manualToken.trim() || loading}>
                  <CheckCircle className="h-4 w-4" />
                  Vérifier
                </button>
              </div>
              <p className="mt-2 text-xs text-gray-400">Utile si la caméra ne fonctionne pas.</p>
            </form>
          )}

          <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="text-sm text-blue-700">
              Le scan nécessite l'autorisation de la caméra. Sur iPhone, utilisez Safari. Le billet doit avoir été validé par l'administration avant de pouvoir être scanné à l'entrée.
            </p>
          </div>
        </div>
      )}

      {showHistory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowHistory(false)}>
          <div className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6" onClick={e => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Historique des scans</h2>
              <button onClick={() => setShowHistory(false)} className="text-gray-400 hover:text-gray-600"><X className="h-5 w-5" /></button>
            </div>
            {history.length === 0 ? (
              <p className="py-8 text-center text-sm text-gray-500">Aucun scan effectué</p>
            ) : (
              <div className="space-y-2">
                {history.map((h, i) => {
                  const sc = statusConfig[h.status]
                  const SIcon = sc.icon
                  return (
                    <div key={i} className="flex items-center gap-3 rounded-lg bg-gray-50 p-3">
                      <SIcon className={`h-5 w-5 shrink-0 ${sc.color}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-gray-900">{h.name}</p>
                        <p className="truncate font-mono text-[10px] text-gray-400">{h.token}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-medium text-gray-600">{sc.title}</p>
                        <p className="text-[10px] text-gray-400">{h.time}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            <button onClick={() => { setHistory([]); setShowHistory(false) }} className="mt-4 w-full text-center text-sm text-red-500 hover:text-red-600">Effacer l'historique</button>
          </div>
        </div>
      )}
    </div>
  )
}
