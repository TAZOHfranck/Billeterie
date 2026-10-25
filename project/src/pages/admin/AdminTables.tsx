import { useEffect, useState } from 'react'
import { Plus, Edit2, Trash2, X, Loader2, Table2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { TableSeat } from '../../types'

export default function AdminTables() {
  const [tables, setTables] = useState<TableSeat[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [editingTable, setEditingTable] = useState<TableSeat | null>(null)
  const [form, setForm] = useState({ name: '', capacity: 1, price: 0, is_active: true })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadTables = () => {
    supabase.from('tables').select('*').order('created_at', { ascending: true })
      .then(({ data }) => { setTables(data || []); setLoading(false) })
  }

  useEffect(() => { loadTables() }, [])

  const openAdd = () => {
    setEditingTable(null)
    setForm({ name: '', capacity: 1, price: 0, is_active: true })
    setShowModal(true)
  }

  const openEdit = (table: TableSeat) => {
    setEditingTable(table)
    setForm({ name: table.name, capacity: table.capacity, price: Number(table.price), is_active: table.is_active })
    setShowModal(true)
  }

  const save = async () => {
    if (!form.name.trim()) { setError('Le nom est obligatoire'); return }
    setSaving(true)
    setError(null)

    if (editingTable) {
      await supabase.from('tables').update({
        name: form.name.trim(),
        capacity: form.capacity,
        price: form.price,
        is_active: form.is_active,
      }).eq('id', editingTable.id)
    } else {
      await supabase.from('tables').insert({
        name: form.name.trim(),
        capacity: form.capacity,
        price: form.price,
        is_active: form.is_active,
      })
    }

    setSaving(false)
    setShowModal(false)
    loadTables()
  }

  const remove = async (id: string) => {
    if (!confirm('Supprimer cette table ?')) return
    await supabase.from('tables').delete().eq('id', id)
    loadTables()
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
  }

  return (
    <div className="p-4 sm:p-6 md:p-8">
      <div className="mb-6 flex items-start sm:items-center justify-between flex-col sm:flex-row gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Tables</h1>
          <p className="text-gray-500 text-sm mt-1">Configurez les tables disponibles pour la réservation</p>
        </div>
        <button onClick={openAdd} className="btn-primary flex items-center gap-2">
          <Plus className="w-5 h-5" />
          Ajouter
        </button>
      </div>

      {tables.length === 0 ? (
        <div className="card p-12 text-center">
          <Table2 className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Aucune table configurée</p>
          <button onClick={openAdd} className="btn-primary mt-4">Ajouter une table</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {tables.map(table => (
            <div key={table.id} className="card p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-semibold text-gray-900">{table.name}</h3>
                  <span className={`badge ${table.is_active ? 'badge-approved' : 'badge-rejected'}`}>
                    {table.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(table)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(table.id)} className="p-2 rounded-lg hover:bg-red-50 text-red-500 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Capacité: <span className="font-medium text-gray-900">{table.capacity} pers.</span></span>
                <span className="text-primary-600 font-bold">{Number(table.price).toLocaleString()} F</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-gray-900">{editingTable ? 'Modifier la table' : 'Nouvelle table'}</h2>
                <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
              </div>

              {error && <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">{error}</div>}

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de la table</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    className="input-field"
                    placeholder="Ex: Table VIP 1"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Capacité (personnes)</label>
                  <input
                    type="number"
                    min="1"
                    value={form.capacity}
                    onChange={e => setForm({ ...form, capacity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Prix (F)</label>
                  <input
                    type="number"
                    min="0"
                    value={form.price}
                    onChange={e => setForm({ ...form, price: Math.max(0, parseInt(e.target.value) || 0) })}
                    className="input-field"
                  />
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={e => setForm({ ...form, is_active: e.target.checked })}
                    className="w-5 h-5 rounded text-primary-600"
                  />
                  <span className="text-sm text-gray-700">Table active (visible par les clients)</span>
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
