'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

/**
 * /update-password — Set a new password after clicking a password-reset link.
 *
 * Supabase's reset flow:
 *   1. resetPasswordForEmail() → email with ?code=... → /auth/confirm
 *   2. /auth/confirm exchanges the code (PKCE), detects type=recovery, redirects here
 *   3. At this point the Supabase session is established (user is signed in)
 *   4. updateUser({ password }) sets the new password on the authenticated user
 *
 * Guard: if no session exists when this page loads, redirect to /login immediately.
 * This prevents the page from being accessible without a valid reset flow.
 */
export default function UpdatePasswordPage() {
  const router = useRouter()

  const [password, setPassword]         = useState('')
  const [confirmPassword, setConfirm]   = useState('')
  const [loading, setLoading]           = useState(false)
  const [sessionChecked, setChecked]    = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [done, setDone]                 = useState(false)

  const supabase = createClient()

  // Guard: verify a session exists (set by /auth/confirm code exchange)
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.replace('/login')
      } else {
        setChecked(true)
      }
    })
  }, [router, supabase])

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
    // Short delay so the user sees the confirmation before being redirected
    setTimeout(() => router.replace('/atlas'), 1500)
  }

  // Still checking session
  if (!sessionChecked) {
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
