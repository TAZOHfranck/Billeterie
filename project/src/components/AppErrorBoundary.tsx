import { Component, ErrorInfo, ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowLeft, RotateCw } from 'lucide-react'

interface AppErrorBoundaryProps {
  children: ReactNode
}

interface AppErrorBoundaryState {
  hasError: boolean
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): AppErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Application rendering failed:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#100806] px-6 text-white">
          <div className="max-w-lg text-center">
            <AlertTriangle className="mx-auto h-14 w-14 text-accent-300" aria-hidden="true" />
            <h1 className="display-font mt-5 text-4xl font-bold">La page n’a pas pu s’afficher</h1>
            <p className="mt-3 text-gray-300">
              Réessayez ou retournez à l’accueil pour poursuivre votre réservation.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <button
                type="button"
                onClick={() => this.setState({ hasError: false })}
                className="btn-primary inline-flex items-center justify-center gap-2"
              >
                <RotateCw className="h-4 w-4" aria-hidden="true" />
                Réessayer
              </button>
              <Link to="/" className="btn-secondary inline-flex items-center justify-center gap-2">
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Accueil
              </Link>
            </div>
          </div>
        </main>
      )
    }

    return this.props.children
  }
}
