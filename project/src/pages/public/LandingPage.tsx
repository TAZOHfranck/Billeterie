import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { CalendarDays, MapPin, Ticket, ArrowRight, Phone, Star, Sparkles, Crown, Shirt } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { EventSettings } from '../../types'
import { useAuth } from '../../context/AuthContext'

export default function LandingPage() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<EventSettings | null>(null)
  const [savedTicketToken, setSavedTicketToken] = useState<string | null>(null)

  useEffect(() => {
    setSavedTicketToken(localStorage.getItem('glamour_ticket_token'))
    supabase.from('event_settings').select('*').limit(1).maybeSingle().then(({ data }) => setSettings(data))
  }, [])

  const eventDate = settings?.event_date ? new Date(settings.event_date) : null
  const dateParts = eventDate
    ? { day: eventDate.toLocaleDateString('fr-FR', { day: 'numeric' }), month: eventDate.toLocaleDateString('fr-FR', { month: 'long' }), year: eventDate.getFullYear() }
    : { day: '17', month: 'décembre', year: 2026 }
  const location = settings?.event_location || 'À préciser'
  const eventName = settings?.event_name || 'Soirée Chic & Glamour'

  return (
    <div className="min-h-screen overflow-hidden bg-[#080504] text-white">
      <section className="relative isolate min-h-[760px] overflow-hidden bg-[radial-gradient(ellipse_at_center_top,#3a180e_0%,#160907_42%,#080504_78%)]">
        <div className="curtain curtain-left" />
        <div className="curtain curtain-right" />
        <div className="absolute inset-0 -z-10 opacity-30 bg-[radial-gradient(circle_at_50%_42%,rgba(246,189,47,.55),transparent_2%,transparent_25%),radial-gradient(circle_at_50%_42%,rgba(246,189,47,.15),transparent_48%)]" />
        <div className="absolute bottom-0 left-1/2 -z-10 h-56 w-[720px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(168,54,32,.35),transparent_68%)] blur-2xl" />

        <div className="relative mx-auto max-w-6xl px-5 pb-20 pt-8 text-center sm:px-8 sm:pt-12">
          <div className="mx-auto flex max-w-2xl items-center justify-center gap-3 text-[10px] font-semibold tracking-[0.28em] text-accent-300 sm:text-xs sm:tracking-[0.42em]">
            <span className="h-px flex-1 bg-accent-400/80" /> IPD-YAOUNDÉ PRÉSENTE <span className="h-px flex-1 bg-accent-400/80" />
          </div>

          <div className="mx-auto mt-8 flex h-16 w-16 items-center justify-center rounded-full border border-accent-400/70 bg-black/30 text-accent-300 shadow-[0_0_30px_rgba(246,189,47,.2)] sm:mt-12 sm:h-20 sm:w-20">
            <Crown className="h-8 w-8 sm:h-10 sm:w-10" />
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.35em] text-gray-300">L'Institut Perfektes<span style={{ fontSize: '0.75rem', letterSpacing: '0.35em' }}>&nbsp;Deutsch</span></p>
          <p className="display-font mt-8 text-5xl font-bold leading-[0.82] text-white drop-shadow-[0_4px_20px_rgba(246,189,47,.35)] sm:text-8xl">Soirée Chic</p>
          <p className="display-font text-6xl font-bold italic leading-none text-accent-300 drop-shadow-[0_4px_20px_rgba(246,189,47,.35)] sm:text-9xl">&amp; Glamour</p>
          <div className="mx-auto mt-7 flex max-w-md items-center gap-3"><span className="h-px flex-1 bg-accent-400" /><span className="border-y border-accent-400 px-3 py-2 text-xs font-bold tracking-[0.22em] text-accent-200 sm:px-5 sm:text-sm">2ÈME ÉDITION</span><span className="h-px flex-1 bg-accent-400" /></div>
          <p className="mx-auto mt-6 max-w-xl text-sm leading-7 text-gray-300 sm:text-base">Une soirée d'exception sous le signe de l'élégance, du talent et du glamour.</p>

          <div className="mx-auto mt-12 grid max-w-4xl gap-3 text-left sm:mt-16 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-accent-400/50">
            <div className="flex items-center gap-4 border border-accent-400/40 bg-black/40 p-4 backdrop-blur-sm sm:border-0 sm:px-6 sm:text-center sm:block">
              <CalendarDays className="h-8 w-8 shrink-0 text-accent-300 sm:mx-auto" />
              <div><p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-accent-200">Jeudi</p><p className="text-xl font-bold capitalize text-white">{dateParts.day} {dateParts.month}</p><p className="text-sm text-gray-300">{dateParts.year} · 18H00</p></div>
            </div>
            <div className="flex items-center gap-4 border border-accent-400/40 bg-black/40 p-4 backdrop-blur-sm sm:border-0 sm:px-6 sm:text-center sm:block">
              <MapPin className="h-8 w-8 shrink-0 text-accent-300 sm:mx-auto" />
              <div><p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-accent-200">Lieu</p><p className="text-xl font-bold text-white">{location}</p><p className="text-sm text-gray-300">Yaoundé</p></div>
            </div>
            <div className="flex items-center gap-4 border border-accent-400/40 bg-black/40 p-4 backdrop-blur-sm sm:border-0 sm:px-6 sm:text-center sm:block">
              <Shirt className="h-8 w-8 shrink-0 text-accent-300 sm:mx-auto" />
              <div><p className="mt-1 text-xs font-bold uppercase tracking-[0.2em] text-accent-200">Dress code</p><p className="text-xl font-bold text-white">Chic &amp; glamour</p><p className="text-sm text-gray-300">Tenue élégante exigée</p></div>
            </div>
          </div>

          <Link to="/reserve" className="mt-10 inline-flex items-center gap-3 rounded-full border border-accent-300 bg-accent-500 px-8 py-4 text-base font-bold text-[#170b03] shadow-[0_8px_40px_rgba(246,189,47,.25)] transition hover:-translate-y-1 hover:bg-accent-300 sm:mt-12 sm:px-10 sm:text-lg">
            <Ticket className="h-5 w-5" /> Réserver mon billet <ArrowRight className="h-5 w-5" />
          </Link>
          {savedTicketToken && <Link to={`/ticket/${savedTicketToken}`} className="mt-4 block text-sm font-semibold text-accent-200 underline-offset-4 hover:underline">Retrouver mon billet enregistré</Link>}
          {user && <Link to="/my-tickets" className="mt-3 block text-sm font-semibold text-accent-200 underline-offset-4 hover:underline">Voir tous mes billets</Link>}
        </div>
      </section>

      <section className="relative border-t border-accent-400/70 bg-[#100806] px-5 py-14 sm:px-8 sm:py-20">
        <div className="mx-auto max-w-5xl">
          <div className="mb-10 text-center"><p className="text-xs font-bold uppercase tracking-[0.35em] text-accent-300">Une nuit inoubliable</p><h2 className="display-font mt-2 text-5xl font-bold text-white sm:text-6xl">Au programme</h2></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {['Concours Miss & Master', 'Danse · Chant · Interprétation', 'Jeux et animations', 'Prix de la plus belle tenue'].map((item, index) => (
              <div key={item} className="rounded-xl border border-accent-400/25 bg-black/30 p-5 text-center transition hover:-translate-y-1 hover:border-accent-400/70">
                <Sparkles className="mx-auto h-6 w-6 text-accent-300" /><p className="mt-3 text-sm font-semibold text-gray-200">{item}</p><span className="mt-3 block text-xs text-accent-500">0{index + 1}</span>
              </div>
            ))}
          </div>
          <div className="mt-12 grid gap-8 border-y border-accent-400/40 py-8 md:grid-cols-[1fr_auto_1fr] md:items-center">
            <div className="text-center md:text-left"><p className="text-xs font-bold uppercase tracking-[0.25em] text-accent-300">Infoline</p><p className="mt-2 flex items-center justify-center gap-2 font-semibold text-white md:justify-start"><Phone className="h-4 w-4 text-accent-300" /> {settings?.contact_phone || '+237 6 73 24 97 91'}</p><p className="mt-1 text-sm text-gray-400">+237 6 88 65 15 35</p></div>
            <div className="text-center"><p className="text-xs uppercase tracking-[0.3em] text-accent-300">Billet à partir de</p><p className="display-font text-5xl font-bold text-accent-300">8 000</p><p className="text-xs font-semibold tracking-widest text-gray-300">FCFA</p></div>
            <div className="text-center md:text-right"><p className="display-font text-3xl italic text-accent-300">Élégance</p><p className="text-sm text-gray-400">Talent · Passion · Glamour</p></div>
          </div>
        </div>
      </section>

      <footer className="border-t border-white/10 bg-black px-5 py-7 text-center text-sm text-gray-500"><p>{eventName} · Votre billet est validé par QR code à l'entrée.</p>{user ? <Link to="/my-tickets" className="mt-2 inline-block text-accent-300 hover:underline">Mes billets</Link> : <Link to="/reserve" className="mt-2 inline-block text-accent-300 hover:underline">Créer mon compte client</Link>}<br /><Link to="/admin/login" className="mt-2 inline-block text-gray-600 hover:text-accent-300 hover:underline">Accès administration</Link></footer>
    </div>
  )
}
