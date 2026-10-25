import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'

interface AuthResult {
  error: string | null
}

interface AuthContextType {
  session: Session | null
  user: User | null
  loading: boolean
  signIn: (email: string, password: string) => Promise<AuthResult>
  signInWithPhone: (phone: string, password: string) => Promise<AuthResult>
  signUpWithPhone: (phone: string, password: string) => Promise<AuthResult>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

function phoneAccountEmail(phone: string) {
  const digits = phone.replace(/\D/g, '')
  return `customer_${digits}@ticketing.local`
}

function authErrorMessage(message: string) {
  if (message.toLowerCase().includes('invalid login credentials')) return 'Numéro ou mot de passe incorrect.'
  if (message.toLowerCase().includes('already registered')) return 'Ce numéro possède déjà un compte. Connectez-vous.'
  if (message.toLowerCase().includes('password')) return 'Le mot de passe doit contenir au moins 6 caractères.'
  return 'Impossible de traiter la demande pour le moment.'
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

  const signIn = async (email: string, password: string): Promise<AuthResult> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error ? authErrorMessage(error.message) : null }
  }

  const signInWithPhone = async (phone: string, password: string): Promise<AuthResult> => {
    return signIn(phoneAccountEmail(phone), password)
  }

  const signUpWithPhone = async (phone: string, password: string): Promise<AuthResult> => {
    const email = phoneAccountEmail(phone)
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { phone: phone.trim() } },
    })

    if (error) return { error: authErrorMessage(error.message) }
    if (!data.session) return signIn(email, password)
    return { error: null }
  }

  const signOut = async () => {
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signIn, signInWithPhone, signUpWithPhone, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
