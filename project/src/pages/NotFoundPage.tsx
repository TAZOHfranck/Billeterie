import { Link } from 'react-router-dom'
import { ArrowLeft, CircleHelp } from 'lucide-react'

export default function NotFoundPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#100806] px-6 text-white">
      <div className="max-w-lg text-center">
        <CircleHelp className="mx-auto h-16 w-16 text-accent-300" aria-hidden="true" />
        <p className="mt-6 text-sm font-bold uppercase tracking-[0.3em] text-accent-300">Erreur 404</p>
        <h1 className="display-font mt-2 text-5xl font-bold">Page introuvable</h1>
        <p className="mt-4 text-gray-300">
          La page que vous recherchez n’existe pas ou n’est plus disponible.
        </p>
        <Link to="/" className="btn-primary mt-8 inline-flex items-center gap-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Retour à l’accueil
        </Link>
      </div>
    </main>
  )
}
