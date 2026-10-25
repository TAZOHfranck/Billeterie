import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, X, Loader2, CreditCard } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PaymentMethod } from '../../types'

export default function AdminPaymentMethods() {
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState<PaymentMethod | null>(null)
  const [form, setForm] = useState({ name: '', account_details: '', instructions: '', is_active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = () => {
    supabase.from('payment_methods').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { setMethods(data || []); setLoading(false) })
  }

  useEffect(() => { load() }, [])

  const openAdd = () => {
    setEditing(null)
    setForm({ name: '', account_details: '', instructions: '', is_active: true })
    setShowModal(true)
  }

  const openEdit = (method: PaymentMethod) => {
    setEditing(method)
    setForm({ name: method.name, account_details: method.account_details, instructions: method.instructions, is_active: method.is_active })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Le nom est obligatoire'); return }
    if (!form.account_details.trim()) { setError('Les détails du compte sont obligatoires'); return }
    setSaving(true)
    setError(null)

    if (editing) {
      await supabase.from('payment_methods').update({
        name: form.name.trim(),
        account_details: form.account_details.trim(),
        instructions: form.instructions.trim(),
        is_active: form.is_active,
      }).eq('id', editing.id)
    } else {
      await supabase.from('payment_methods').insert({
        name: form.name.trim(),
        account_details: form.account_details.trim(),
        instructions: form.instructions.trim(),
        is_active: form.is_active,
      })
    }

    setSaving(false)
    setShowModal(false)
    load()
  }

  const remove = async (id: string) => {
    if (!confirm('Supprimer ce mode de paiement ?')) return
    await supabase.from('payment_methods').delete().eq('id', id)
    load()
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
  }

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-6 flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Modes de paiement</h1>
          <p className="text-gray-500 text-sm mt-1">Configurez les moyens de paiement acceptés</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Ajouter
        </button>
      </div>

      {methods.length === 0 ? (
        <div className="card p-12 text-center">
          <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucun mode de paiement configuré</p>
          <button onClick={openAdd} className="btn-primary mt-4">Ajouter un mode</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {methods.map(method => (
            <div key={method.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
                    <CreditCard className="w-5 h-5 text-primary-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900">{method.name}</h3>
                    <span className={`badge ${method.is_active ? 'badge-approved' : 'badge-rejected'}`}>
                      {method.is_active ? 'Actif' : 'Inactif'}
                    </span>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(method)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(method.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-700 font-medium">{method.account_details}</p>
              {method.instructions && (
                <p className="text-xs text-gray-400 mt-2 italic">{method.instructions}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">{editing ? 'Modifier' : 'Nouveau mode de paiement'}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="Ex: Orange Money, Wave, Espèces..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Détails du compte</label>
                  <input
                    type="text"
                    value={form.account_details}
                    onChange={e => setForm({ ...form, account_details: e.target.value })}
                    className="input-field"
                    placeholder="Ex: Numéro: 07 00 00 00 00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Instructions (optionnel)</label>
                  <textarea
                    value={form.instructions}
                    onChange={e => setForm({ ...form, instructions: e.target.value })}
                    className="input-field min-h-20"
                    placeholder="Ex: Envoyez le montant exact puis importez la capture..."
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    className="w-5 h-5 rounded text-primary-600"
                  />
                  <span className="text-sm text-gray-700">Mode actif (visible par les clients)</span>
                </label>
              </div>

              <div className="flex gap-3 mt-6">
                <button onClick={() => setShowModal(false)} className="btn-secondary flex-1">Annuler</button>
                <button onClick={save} disabled={saving} className="btn-primary flex-1 flex items-center justify-center gap-2">
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enregistrer'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
