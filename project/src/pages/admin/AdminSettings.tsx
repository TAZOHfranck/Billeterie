import { useEffect, useState } from 'react'
import { Save, Loader2, Calendar, MapPin, Phone, Mail, Image as ImageIcon } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { EventSettings } from '../../types'

export default function AdminSettings() {
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState({
    event_name: '',
    event_date: '',
    event_location: '',
    event_description: '',
    contact_phone: '',
    contact_email: '',
    banner_url: '',
  })

  useEffect(() => {
    supabase.from('event_settings').select('*').limit(1).maybeSingle().then(({ data }) => {
      if (data) {
        setSettings(data)
        setForm({
          event_name: data.event_name,
          event_date: data.event_date ? new Date(data.event_date).toISOString().slice(0, 16) : '',
          event_location: data.event_location || '',
          event_description: data.event_description || '',
          contact_phone: data.contact_phone || '',
          contact_email: data.contact_email || '',
          banner_url: data.banner_url || '',
        })
      }
      setLoading(false)
    })
  }, [])

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setSaved(false)

    await supabase.from('event_settings').update({
      event_name: form.event_name,
      event_date: form.event_date ? new Date(form.event_date).toISOString() : null,
      event_location: form.event_location,
      event_description: form.event_description,
      contact_phone: form.contact_phone,
      contact_email: form.contact_email,
      banner_url: form.banner_url,
      updated_at: new Date().toISOString(),
    }).eq('id', settings.id)

    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  if (loading) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-primary-600 animate-spin" /></div>
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-2xl">
      <div className="mb-6">
        <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Paramètres de l'événement</h1>
        <p className="text-gray-500 text-sm mt-1">Configurez les informations affichées sur la page publique</p>
      </div>

      <div className="card p-6 space-y-5">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Nom de l'événement</label>
          <input
            type="text"
            value={form.event_name}
            onChange={e => setForm({ ...form, event_name: e.target.value })}
            className="input-field"
            placeholder="Ex: Soirée VIP 2026"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
            <Calendar className="w-4 h-4 text-gray-400" />
            Date et heure
          </label>
          <input
            type="datetime-local"
            value={form.event_date}
            onChange={e => setForm({ ...form, event_date: e.target.value })}
            className="input-field"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
            <MapPin className="w-4 h-4 text-gray-400" />
            Lieu
          </label>
          <input
            type="text"
            value={form.event_location}
            onChange={e => setForm({ ...form, event_location: e.target.value })}
            className="input-field"
            placeholder="Ex: Salle des Fêtes, Abidjan"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5">Description</label>
          <textarea
            value={form.event_description}
            onChange={e => setForm({ ...form, event_description: e.target.value })}
            className="input-field min-h-24"
            placeholder="Décrivez votre événement..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
            <Phone className="w-4 h-4 text-gray-400" />
            Téléphone de contact
          </label>
          <input
            type="tel"
            value={form.contact_phone}
            onChange={e => setForm({ ...form, contact_phone: e.target.value })}
            className="input-field"
            placeholder="+225 07 00 00 00 00"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
            <Mail className="w-4 h-4 text-gray-400" />
            Email de contact
          </label>
          <input
            type="email"
            value={form.contact_email}
            onChange={e => setForm({ ...form, contact_email: e.target.value })}
            className="input-field"
            placeholder="contact@exemple.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1">
            <ImageIcon className="w-4 h-4 text-gray-400" />
            URL de l'image de bannière
          </label>
          <input
            type="url"
            value={form.banner_url}
            onChange={e => setForm({ ...form, banner_url: e.target.value })}
            className="input-field"
            placeholder="https://..."
          />
          {form.banner_url && (
            <img src={form.banner_url} alt="Aperçu bannière" className="mt-2 w-full h-32 object-cover rounded-lg" />
          )}
        </div>

        <div className="flex items-center gap-3 pt-2">
          <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Enregistrer
          </button>
          {saved && <span className="text-green-600 text-sm font-medium">Enregistré avec succès !</span>}
        </div>
      </div>
    </div>
  )
}
