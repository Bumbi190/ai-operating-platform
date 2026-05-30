'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * /auth/confirm — Supabase magic link callback (client-side)
 *
 * Supabase redirects here after email verification with either:
 *   ?code=xxx   (PKCE flow)
 *   #access_token=xxx  (implicit flow / hash fragment)
 *
 * The browser Supabase client handles both automatically via onAuthStateChange
 * and has access to the PKCE code verifier stored in localStorage.
 */
export default function AuthConfirmPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const supabase = createClient()

    // Read code from URL query params (PKCE flow)
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')
    const supabaseError = params.get('error')
    const supabaseErrorDesc = params.get('error_description')

    // Supabase sent back an error (expired OTP, already used, etc.)
    if (supabaseError) {
      setErrorMsg(supabaseErrorDesc ?? supabaseError)
      setStatus('error')
      return
    }

    async function tryLogin() {
      // 1. Try exchanging the PKCE code if present
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          router.replace('/dashboard')
          return
        }
        console.warn('[auth/confirm] Code exchange failed:', error.message)
      }

      // 2. Check if implicit flow already set a session via hash fragment
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace('/dashboard')
        return
      }

      // 3. Listen for SIGNED_IN (handles hash fragment tokens asynchronously)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if (event === 'SIGNED_IN' && session) {
            subscription.unsubscribe()
            router.replace('/dashboard')
          }
        },
      )

      // Timeout after 8s
      setTimeout(() => {
        subscription.unsubscribe()
        setErrorMsg(
          'Inloggningslänken verkar ha löpt ut eller redan använts. Begär en ny länk.',
        )
        setStatus('error')
      }, 8000)
    }

    tryLogin()
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4 p-8">
        {status === 'loading' ? (
          <>
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm text-muted-foreground">Loggar in...</p>
          </>
        ) : (
          <>
            <div className="text-2xl">⚠️</div>
            <p className="font-medium text-destructive">Inloggning misslyckades</p>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">{errorMsg}</p>
            <a
              href="/login"
              className="inline-block mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Tillbaka till inloggning
            </a>
          </>
        )}
      </div>
    </div>
  )
}
