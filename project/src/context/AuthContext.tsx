import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { identifyOneSignalUser } from '../lib/oneSignal'

interface AuthResult {
  error: string | null
  message?: string
  isAdmin?: boolean
}

interface AuthContextType {
  session: Session | null
  user: User | null
  role: 'user' | 'admin'
  isAdmin: boolean
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signUp: (email: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const ADMIN_EMAILS = new Set(['francktazoh@gmail.com', 'admin@gmail.com'])

function isAdminEmail(email: string | undefined): boolean {
  return email !== undefined && ADMIN_EMAILS.has(email.trim().toLowerCase())
}

function authErrorMessage(message: string, status?: number) {
  const normalizedMessage = message.toLowerCase()
  if (status === 429 || normalizedMessage.includes('too many requests') || normalizedMessage.includes('rate limit')) {
    return 'Trop de tentatives d’inscription ou de connexion. Attendez quelques minutes avant de réessayer. Cette limite est appliquée par Supabase.'
  }
  if (status !== undefined && status >= 500) {
    return `Erreur du service d’authentification (${status}) : ${message}`
  }
  if (normalizedMessage.includes('invalid login credentials')) return 'Adresse email ou mot de passe incorrect.'
  if (normalizedMessage.includes('already registered')) return 'Cette adresse email possède déjà un compte. Connectez-vous.'
  if (normalizedMessage.includes('password')) return 'Le mot de passe doit contenir au moins 6 caractères.'
  if (status !== undefined) return `Erreur d’authentification (${status}) : ${message}`
  return `Erreur d’authentification : ${message}`
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession)
    })

    return () => {
      listener.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (loading) return
    identifyOneSignalUser(session?.user.id ?? null).catch((error: unknown) => {
      console.error('OneSignal user identification failed:', error)
    })
  }, [loading, session?.user.id])

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: authErrorMessage(error.message, error.status) }
    setSession(data.session)
    return { error: null, isAdmin: isAdminEmail(data.user.email) }
  }

  const signUp = async (email: string, password: string): Promise<AuthResult> => {
    const redirectUrl = import.meta.env.VITE_SUPABASE_REDIRECT_URL?.trim()
    const signupOptions = redirectUrl ? { emailRedirectTo: redirectUrl } : undefined

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      ...(signupOptions ? { options: signupOptions } : {}),
    })

    if (error) return { error: authErrorMessage(error.message, error.status) }
    if (data.session) {
      setSession(data.session)
    } else {
      return {
        error: null,
        message: 'Un email de confirmation vient d’être envoyé. Confirmez votre adresse email avant de vous connecter.',
      }
    }
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{
      session,
      user: session?.user ?? null,
      role: isAdminEmail(session?.user.email) ? 'admin' : 'user',
      isAdmin: isAdminEmail(session?.user.email),
      loading,
      signIn,
      signUp,
      signOut,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
