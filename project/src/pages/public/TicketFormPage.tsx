import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowLeft, Upload, CheckCircle, Loader2, Calendar, MapPin, Phone, Lock, Mail, Copy, Smartphone } from 'lucide-react'
import { supabase, STORAGE_BUCKET } from '../../lib/supabase'
import { TableSeat, PaymentMethod, EventSettings } from '../../types'
import { useAuth } from '../../context/AuthContext'

export default function TicketFormPage() {
  const navigate = useNavigate()
  const { user, signIn, signUp } = useAuth()
  const [tables, setTables] = useState<TableSeat[]>([])
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([])
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [accountMessage, setAccountMessage] = useState<string | null>(null)
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [accountMode, setAccountMode] = useState<'signin' | 'signup'>('signin')
  const [accountEmail, setAccountEmail] = useState('')
  const [accountPassword, setAccountPassword] = useState('')
  const [accountLoading, setAccountLoading] = useState(false)
  const [paymentCodeMessage, setPaymentCodeMessage] = useState<string | null>(null)
  const [paymentMode, setPaymentMode] = useState<'full' | 'installment'>('full')
  const [trancheAmount, setTrancheAmount] = useState('')

  const [formData, setFormData] = useState({
    full_name: '',
    phone: '',
    email: '',
    table_id: '',
    payment_method_id: '',
    quantity: 1,
  })

  useEffect(() => {
    Promise.all([
      supabase.from('tables').select('*').eq('is_active', true).order('name'),
      supabase.from('payment_methods').select('*').eq('is_active', true).order('name'),
      supabase.from('event_settings').select('*').limit(1).maybeSingle(),
    ]).then(([tablesRes, paymentsRes, settingsRes]) => {
      setTables(tablesRes.data || [])
      setPaymentMethods(paymentsRes.data || [])
      setSettings(settingsRes.data)
      setLoading(false)
    })
  }, [])

  useEffect(() => {
    const email = user?.email
    if (email) setFormData(current => ({ ...current, email }))
  }, [user])

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setAccountMessage(null)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail.trim())) {
      setError('Veuillez saisir une adresse email valide')
      return
    }
    if (accountPassword.length < 6) {
      setError('Le mot de passe doit contenir au moins 6 caractères')
      return
    }

    setAccountLoading(true)
    const result = accountMode === 'signin'
      ? await signIn(accountEmail.trim(), accountPassword)
      : await signUp(accountEmail.trim(), accountPassword)
    setAccountLoading(false)
    if (result.error) {
      setError(result.error)
    } else if (result.message) {
      setAccountMessage(result.message)
      setAccountMode('signin')
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setError('Le fichier ne doit pas dépasser 5 Mo')
        return
      }
      setProofFile(file)
      setPreviewUrl(URL.createObjectURL(file))
      setError(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!formData.full_name.trim() || !formData.phone.trim()) {
      setError('Veuillez remplir tous les champs obligatoires')
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email.trim())) {
      setError('Veuillez saisir une adresse email valide')
      return
    }
    if (!formData.table_id) {
      setError('Veuillez choisir une table')
      return
    }
    if (!formData.payment_method_id) {
      setError('Veuillez choisir un mode de paiement')
      return
    }
    if (!proofFile) {
      setError('Veuillez importer la preuve de paiement')
      return
    }
    if (paymentMode === 'installment' && (!selectedTable || !Number(trancheAmount) || Number(trancheAmount) > totalPrice)) {
      setError('Saisissez un montant de tranche valide, inférieur ou égal au total')
      return
    }

    setSubmitting(true)

    try {
      const fileExt = proofFile.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(filePath, proofFile)

      if (uploadError) throw uploadError

      const { data: requestId, error: insertError } = await supabase.rpc('submit_ticket_request', {
        p_full_name: formData.full_name.trim(),
        p_phone: formData.phone.trim(),
        p_email: formData.email.trim(),
        p_table_id: formData.table_id,
        p_payment_method_id: formData.payment_method_id,
        p_payment_proof_path: filePath,
        p_quantity: formData.quantity,
        p_payment_mode: paymentMode,
        p_payment_amount: paymentMode === 'installment' ? Number(trancheAmount) : totalPrice,
      })

      if (insertError) throw insertError

      let trancheId: string | null = null
      if (paymentMode === 'installment') {
        const { data: tranche } = await supabase
          .from('ticket_payment_tranches')
          .select('id')
          .eq('request_id', requestId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        trancheId = tranche?.id || null
      }

      const { error: notificationError } = await supabase.functions.invoke('send-ticket-request-email', {
        body: { request_id: requestId, tranche_id: trancheId },
      })
      navigate('/my-tickets', {
        state: notificationError
          ? { notificationWarning: 'Votre demande est enregistrée, mais l’email de notification aux administrateurs n’a pas pu être envoyé.' }
          : {},
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Une erreur est survenue lors de la soumission')
    } finally {
      setSubmitting(false)
    }
  }

  const selectedTable = tables.find(t => t.id === formData.table_id)
  const totalPrice = selectedTable ? Number(selectedTable.price) * formData.quantity : 0
  const paymentAmount = paymentMode === 'installment' ? Number(trancheAmount) : totalPrice
  const selectedPaymentMethod = paymentMethods.find(method => method.id === formData.payment_method_id)
  const ussdReceiver = selectedPaymentMethod?.receiver_number.replace(/\D/g, '') || ''
  const ussdAmount = String(Math.round(paymentAmount))
  const ussdCode = selectedPaymentMethod?.ussd_template
    ? selectedPaymentMethod.ussd_template
      .replace(/\{\{receiver\}\}/g, ussdReceiver)
      .replace(/\{\{amount\}\}/g, ussdAmount)
      .trim()
    : ''
  const needsReceiver = selectedPaymentMethod?.ussd_template.includes('{{receiver}}') ?? false
  const isValidUssdCode = /^[0-9*#]+$/.test(ussdCode) &&
    (!needsReceiver || Boolean(ussdReceiver)) &&
    Boolean(selectedTable) &&
    paymentAmount > 0 &&
    paymentAmount <= totalPrice

  const copyUssdCode = async () => {
    try {
      await navigator.clipboard.writeText(ussdCode)
      setPaymentCodeMessage('Code copié. Ouvrez le composeur de votre téléphone pour l’exécuter.')
    } catch {
      setPaymentCodeMessage('Copie indisponible sur cet appareil. Sélectionnez et copiez le code manuellement.')
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-accent-600 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#100806] text-gray-900">
      {/* Header */}
      <div className="border-b border-accent-400/70 bg-[radial-gradient(ellipse_at_top,#3a180e,#100806_72%)] text-white">
        <div className="mx-auto max-w-3xl px-4 py-7 sm:px-6 sm:py-8">
          <Link to="/" className="inline-flex items-center gap-2 text-gray-300 hover:text-white transition-colors mb-4">
            <ArrowLeft className="w-4 h-4" />
            Retour à l'accueil
          </Link>
          <h1 className="display-font mb-2 text-4xl font-bold text-accent-300 sm:text-5xl">Réserver ma place</h1>
          {settings && (
            <div className="flex flex-col gap-2 text-sm text-gray-300 sm:flex-row sm:items-center sm:gap-4">
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {settings.event_name}
              </span>
              {settings.event_location && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {settings.event_location}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 sm:py-10">
        {error && (
          <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}
        {accountMessage && (
          <div role="status" className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {accountMessage}
          </div>
        )}

        {!user ? (
          <div className="rounded-2xl border border-accent-400/30 bg-[#fffdf7] p-5 shadow-[0_18px_60px_rgba(0,0,0,.35)] sm:p-8">
            <div className="mb-6 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#3a180e] text-accent-300"><Phone className="h-6 w-6" /></div>
              <h2 className="mt-4 text-xl font-bold text-gray-900">{accountMode === 'signin' ? 'Retrouver mon compte' : 'Créer mon compte'}</h2>
              <p className="mt-2 text-sm leading-6 text-gray-500">Connectez-vous avec votre email pour retrouver vos demandes et billets depuis n’importe quel appareil.</p>
            </div>
            <form onSubmit={handleAccountSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Adresse email</label>
                <div className="relative"><Mail className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input type="email" autoComplete="email" value={accountEmail} onChange={e => setAccountEmail(e.target.value)} className="input-field pl-11" placeholder="vous@exemple.com" required /></div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-gray-700">Mot de passe</label>
                <div className="relative"><Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input type="password" value={accountPassword} onChange={e => setAccountPassword(e.target.value)} className="input-field pl-11" placeholder="6 caractères minimum" minLength={6} required /></div>
              </div>
              <button type="submit" disabled={accountLoading} className="btn-primary w-full">{accountLoading ? 'Connexion en cours...' : accountMode === 'signin' ? 'Se connecter' : 'Créer mon compte'}</button>
            </form>
            <button type="button" onClick={() => { setAccountMode(accountMode === 'signin' ? 'signup' : 'signin'); setError(null); setAccountMessage(null) }} className="mt-5 block w-full text-center text-sm font-medium text-accent-700 hover:underline">
              {accountMode === 'signin' ? 'Je n’ai pas encore de compte' : 'J’ai déjà un compte'}
            </button>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6 rounded-2xl border border-accent-400/30 bg-[#fffdf7] p-4 shadow-[0_18px_60px_rgba(0,0,0,.35)] sm:p-6 md:p-8">
          {/* Personal Info */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Informations personnelles</h2>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nom complet <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.full_name}
                onChange={e => setFormData({ ...formData, full_name: e.target.value })}
                className="input-field"
                placeholder="Jean Dupont"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Numéro de téléphone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({ ...formData, phone: e.target.value })}
                className="input-field"
                placeholder="+225 07 00 00 00 00"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Adresse email <span className="text-red-500">*</span>
              </label>
              <input
                type="email"
                autoComplete="email"
                value={formData.email}
                className="input-field"
                readOnly
                required
              />
              <p className="mt-1 text-xs text-gray-500">L’adresse confirmée de votre compte recevra la décision de l’administration.</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">
                Nombre de places
              </label>
              <input
                type="number"
                min="1"
                
               
                value={formData.quantity}
                onChange={e => setFormData({ ...formData, quantity: Math.max(1, Math.min(10, parseInt(e.target.value) || 1)) })}
                className="input-field w-24"
              />
            </div>
          </div>

          <hr className="border-gray-100" />

          {/* Table Selection */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Choisir une table</h2>
            {tables.length === 0 ? (
              <p className="text-gray-500 text-sm">Aucune table disponible pour le moment.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {tables.map(table => (
                  <button
                    key={table.id}
                    type="button"
                    onClick={() => setFormData({ ...formData, table_id: table.id })}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      formData.table_id === table.id
                        ? 'border-accent-500 bg-accent-50'
                        : 'border-gray-200 hover:border-accent-300'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="font-semibold text-gray-900">{table.name}</p>
                        <p className="text-sm text-gray-500">Capacité: {table.capacity} personnes</p>
                      </div>
                      <p className="font-bold text-accent-600">{Number(table.price).toLocaleString()} F</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedTable && (
            <>
              <hr className="border-gray-100" />
              <div className="space-y-4">
                <h2 className="text-lg font-semibold text-gray-900">Type de paiement</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <button type="button" onClick={() => setPaymentMode('full')} className={`rounded-xl border-2 p-4 text-left ${paymentMode === 'full' ? 'border-accent-500 bg-accent-50' : 'border-gray-200'}`}>
                    <p className="font-semibold text-gray-900">Payer le montant total</p>
                    <p className="mt-1 text-sm text-gray-600">{totalPrice.toLocaleString('fr-FR')} F</p>
                  </button>
                  {settings?.installment_payments_enabled && (
                    <button type="button" onClick={() => setPaymentMode('installment')} className={`rounded-xl border-2 p-4 text-left ${paymentMode === 'installment' ? 'border-accent-500 bg-accent-50' : 'border-gray-200'}`}>
                      <p className="font-semibold text-gray-900">Payer par tranche</p>
                      <p className="mt-1 text-sm text-gray-600">Plusieurs versements validés jusqu’au total.</p>
                    </button>
                  )}
                </div>
                {paymentMode === 'installment' && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-gray-700">Montant de ce versement</label>
                    <div className="flex items-center gap-2">
                      <input type="number" min="1" max={totalPrice} step="1" value={trancheAmount} onChange={event => setTrancheAmount(event.target.value)} className="input-field" placeholder={`Maximum ${totalPrice.toLocaleString('fr-FR')} F`} />
                      <span className="shrink-0 text-sm font-bold text-gray-700">F CFA</span>
                    </div>
                    <p className="mt-2 text-xs text-gray-500">Solde à payer après ce versement : {Math.max(0, totalPrice - (Number(trancheAmount) || 0)).toLocaleString('fr-FR')} F. Votre demande sera créée avec un versement en attente de validation.</p>
                  </div>
                )}
              </div>
            </>
          )}

          <hr className="border-gray-100" />

          {/* Payment Method */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Mode de paiement</h2>
            {paymentMethods.length === 0 ? (
              <p className="text-gray-500 text-sm">Aucun mode de paiement disponible pour le moment.</p>
            ) : (
              <div className="space-y-3">
                {paymentMethods.map(method => (
                  <div key={method.id}>
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, payment_method_id: method.id })}
                      className={`w-full text-left p-4 rounded-xl border-2 transition-all ${
                        formData.payment_method_id === method.id
                          ? 'border-accent-500 bg-accent-50'
                          : 'border-gray-200 hover:border-accent-300'
                      }`}
                    >
                      <p className="font-semibold text-gray-900">{method.name}</p>
                      <p className="text-sm text-gray-600 mt-1">{method.account_details}</p>
                      {method.instructions && (
                        <p className="text-xs text-gray-400 mt-1 italic">{method.instructions}</p>
                      )}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {selectedTable && (
            <div className="rounded-xl border border-accent-200 bg-[#f7eee0] p-4">
              <div className="flex justify-between items-center">
                <span className="text-gray-600">{paymentMode === 'installment' ? 'Montant de cette tranche' : 'Total à payer'}</span>
                <span className="text-2xl font-bold text-accent-600">{(paymentMode === 'installment' ? paymentAmount : totalPrice).toLocaleString()} F</span>
              </div>
            </div>
          )}

          {selectedPaymentMethod?.ussd_template && (
            <section className="space-y-3 rounded-xl border border-gray-200 bg-white p-4" aria-labelledby="ussd-payment-heading">
              <h2 id="ussd-payment-heading" className="font-semibold text-gray-900">Payer par USSD</h2>
              {isValidUssdCode ? (
                <>
                  <p className="text-sm text-gray-600">
                    Le bouton peut ouvrir le composeur de votre téléphone avec ce code. Selon votre appareil et votre opérateur, vous devrez peut-être confirmer l’exécution.
                  </p>
                  <code className="block break-all rounded-lg bg-gray-100 p-3 font-mono text-sm text-gray-900">{ussdCode}</code>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <a
                      href={`tel:${encodeURIComponent(ussdCode)}`}
                      className="btn-primary inline-flex items-center justify-center gap-2"
                    >
                      <Smartphone className="h-4 w-4" />
                      Ouvrir le composeur
                    </a>
                    <button
                      type="button"
                      onClick={copyUssdCode}
                      className="btn-secondary inline-flex items-center justify-center gap-2"
                    >
                      <Copy className="h-4 w-4" />
                      Copier le code
                    </button>
                  </div>
                  {paymentCodeMessage && <p role="status" className="text-sm text-gray-600">{paymentCodeMessage}</p>}
                </>
              ) : (
                <p className="text-sm text-amber-700">
                  Le code USSD n’est pas prêt. Vérifiez le numéro du compte, le montant et le modèle configuré par l’administration.
                </p>
              )}
              {selectedPaymentMethod.instructions && (
                <p className="text-sm italic text-gray-500">{selectedPaymentMethod.instructions}</p>
              )}
            </section>
          )}

          <hr className="border-gray-100" />

          {/* Payment Proof Upload */}
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-gray-900">Preuve de paiement</h2>
            <p className="text-sm text-gray-500">Importez une capture d'écran ou une photo de votre paiement (max 5 Mo)</p>

            <label className="block">
              <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                proofFile ? 'border-green-500 bg-green-50' : 'border-gray-300 hover:border-accent-400 hover:bg-accent-50'
              }`}>
                {previewUrl && proofFile?.type.startsWith('image/') ? (
                  <div className="space-y-3">
                    <img src={previewUrl} alt="Aperçu" className="max-h-48 mx-auto rounded-lg" />
                    <p className="text-sm text-green-600 flex items-center justify-center gap-1">
                      <CheckCircle className="w-4 h-4" />
                      {proofFile.name}
                    </p>
                  </div>
                ) : proofFile ? (
                  <p className="text-sm text-green-600 flex items-center justify-center gap-1">
                    <CheckCircle className="w-4 h-4" />
                    {proofFile.name}
                  </p>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-8 h-8 text-gray-400 mx-auto" />
                    <p className="text-sm text-gray-500">Cliquez pour importer votre preuve</p>
                  </div>
                )}
              </div>
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} className="hidden" />
            </label>
          </div>

          <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            Votre demande reste en attente jusqu’à sa validation par l’administration. Aucun billet ni QR code n’est créé avant son approbation.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Soumission en cours...
              </>
            ) : (
              'Valider ma réservation'
            )}
          </button>
        </form>
        )}
      </div>
    </div>
  )
}
