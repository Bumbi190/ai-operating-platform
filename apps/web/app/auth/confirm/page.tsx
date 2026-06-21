'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * /auth/confirm — Supabase email callback (client-side)
 *
 * Handles three distinct flows that all land here with a ?code= param:
 *
 *   1. Magic Link login        → type absent or 'magiclink' → redirect /atlas
 *   2. Password reset          → type='recovery'            → redirect /update-password
 *   3. Invite / email confirm  → type='invite' or 'signup'  → redirect /atlas
 *
 * Also handles implicit flow (tokens in hash fragment, no code).
 *
 * The server-side /auth/callback route handles the happy-path PKCE exchange first;
 * this page is the client-side fallback for when that fails, and the primary handler
 * for the hash-fragment implicit flow.
 */
export default function AuthConfirmPage() {
  const router = useRouter()
  const [status, setStatus] = useState<'loading' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const supabase = createClient()

    const params = new URLSearchParams(window.location.search)
    const code           = params.get('code')
    const type           = params.get('type')   // set by Supabase on password-reset links
    const supabaseError  = params.get('error')
    const supabaseErrDesc = params.get('error_description')

    // Supabase sent back an error (expired OTP, already used, etc.)
    if (supabaseError) {
      setErrorMsg(supabaseErrDesc ?? supabaseError)
      setStatus('error')
      return
    }

    /**
     * Determine where to redirect after a successful session.
     * type='recovery' means the user clicked a password-reset link — send them
     * to /update-password to set their new password.
     * All other types (magic link, invite, email verification) go to /atlas.
     */
    function successRedirect(): string {
      return type === 'recovery' ? '/update-password' : '/atlas'
    }

    async function tryLogin() {
      // 1. Try exchanging the PKCE code if present
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code)
        if (!error) {
          router.replace(successRedirect())
          return
        }
        console.warn('[auth/confirm] Code exchange failed:', error.message)
      }

      // 2. Check if implicit flow already set a session via hash fragment
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        router.replace(successRedirect())
        return
      }

      // 3. Listen for SIGNED_IN (handles hash fragment tokens asynchronously)
      const { data: { subscription } } = supabase.auth.onAuthStateChange(
        (event, session) => {
          if ((event === 'SIGNED_IN' || event === 'PASSWORD_RECOVERY') && session) {
            subscription.unsubscribe()
            router.replace(successRedirect())
          }
        },
      )

      // Timeout after 8s
      setTimeout(() => {
        subscription.unsubscribe()
        setErrorMsg(
          'Länken verkar ha löpt ut eller redan använts. Begär en ny länk.',
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
