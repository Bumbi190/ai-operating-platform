'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * /update-password — Set a new password after clicking a password-reset link.
 *
 * Recovery flow (why this page is the redirect target, not /auth/confirm):
 *
 *   Supabase PKCE recovery emails redirect to `{redirectTo}?code=xxx`. There is NO
 *   `?type=recovery` in the URL — the flow type is encoded in the code-verifier cookie
 *   as `'verifier/recovery'` by the client SDK. Routing to /update-password directly
 *   makes the intent unambiguous without URL-param or auth-event sniffing.
 *
 * Session establishment — race between auto-detect and manual exchange:
 *
 *   createBrowserClient() sets detectSessionInUrl=true. This means _initialize() may
 *   auto-exchange the code and fire PASSWORD_RECOVERY via setTimeout(fn, 0) before our
 *   useEffect runs. We handle both orderings:
 *
 *   A. Code in URL, auto-detect not yet done: exchangeCodeForSession() succeeds.
 *   B. Code in URL, auto-detect already consumed it: exchangeCodeForSession() fails,
 *      fall back to getSession() which finds the session auto-detect saved.
 *   C. No code (direct navigation without reset flow): getSession() returns null →
 *      redirect to /login.
 *   D. No code, but session exists (logged-in user navigates here): show form.
 *      updateUser() works on any authenticated session.
 */
export default function UpdatePasswordPage() {
  const router = useRouter()

  const [password, setPassword]       = useState('')
  const [confirmPassword, setConfirm] = useState('')
  const [loading, setLoading]         = useState(false)
  const [sessionReady, setReady]      = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [done, setDone]               = useState(false)

  const supabase = createClient()

  useEffect(() => {
    // Read code from the URL — may already be cleaned by auto-detect (case B).
    const params = new URLSearchParams(window.location.search)
    const code = params.get('code')

    async function establishSession() {
      if (code) {
        // Cases A & B: attempt manual exchange.
        // If auto-detect already consumed the code, this returns an error — that's fine.
        const { error: exchangeErr } = await supabase.auth.exchangeCodeForSession(code)
        if (!exchangeErr) {
          // Case A: manual exchange succeeded.
          setReady(true)
          return
        }
        // Case B: code already consumed by auto-detect. Fall through to getSession().
      }

      // Cases B, C, D: check for an existing session.
      const { data: { session } } = await supabase.auth.getSession()
      if (session) {
        setReady(true)
      } else {
        // No session at all — guard against direct navigation.
        router.replace('/login')
      }
    }

    establishSession()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    if (password.length < 8) {
      setError('Lösenordet måste vara minst 8 tecken.')
      return
    }
    if (password !== confirmPassword) {
      setError('Lösenorden matchar inte.')
      return
    }

    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)

    if (error) {
      setError(error.message)
      return
    }

    setDone(true)
    setTimeout(() => router.replace('/atlas'), 1500)
  }

  // ── Loading / session-check spinner ──────────────────────────────────────
  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground text-xl font-bold mb-4">
            ⚡
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Nytt lösenord</h1>
          <p className="text-sm text-muted-foreground">
            Välj ett nytt lösenord för ditt konto
          </p>
        </div>

        {done ? (
          /* ── Success view ──────────────────────────────────────────────── */
          <div className="rounded-lg border border-border bg-card p-6 text-center space-y-2">
            <div className="text-2xl">✅</div>
            <p className="font-medium">Lösenord uppdaterat</p>
            <p className="text-sm text-muted-foreground">Du loggas in automatiskt…</p>
          </div>
        ) : (
          /* ── Password form ─────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="password" className="text-sm font-medium">
                Nytt lösenord
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Minst 8 tecken"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="confirm-password" className="text-sm font-medium">
                Bekräfta lösenord
              </label>
              <input
                id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Upprepa lösenordet"
                required
                minLength={8}
                autoComplete="new-password"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Sparar...' : 'Spara nytt lösenord'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
