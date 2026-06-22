'use client'

import { Suspense, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

function LoginForm() {
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')

  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState<string | null>(urlError)

  // Magic Link fallback — hidden by default, shown via toggle
  const [magicMode, setMagicMode] = useState(false)
  const [magicSent, setMagicSent] = useState(false)

  const supabase = createClient()

  // ── Primary: email + password ─────────────────────────────────────────────
  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithPassword({ email, password })

    if (error) {
      // Supabase returns "Invalid login credentials" for both wrong email and
      // wrong password — keep message generic to avoid leaking account existence.
      setError('Fel e-post eller lösenord.')
    }
    // On success: Supabase sets the session cookie; middleware redirects to /dashboard.
    setLoading(false)
  }

  // ── Fallback: Magic Link (OTP) ────────────────────────────────────────────
  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/confirm` },
    })

    if (error) {
      setError(error.message)
    } else {
      setMagicSent(true)
    }
    setLoading(false)
  }

  // ── Magic Link sent confirmation ──────────────────────────────────────────
  if (magicSent) {
    return (
      <div className="w-full max-w-sm space-y-8 px-6">
        <div className="rounded-lg border border-border bg-card p-6 text-center space-y-2">
          <div className="text-2xl">📬</div>
          <p className="font-medium">Kolla din inbox</p>
          <p className="text-sm text-muted-foreground">
            Vi skickade en inloggningslänk till <strong>{email}</strong>
          </p>
        </div>
        <button
          type="button"
          onClick={() => { setMagicSent(false); setMagicMode(false) }}
          className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
        >
          Tillbaka
        </button>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-8 px-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground text-xl font-bold mb-4">
          ⚡
        </div>
        <h1 className="text-2xl font-bold tracking-tight">AI Ops Platform</h1>
        <p className="text-sm text-muted-foreground">
          Centraliserad kontroll för dina AI-agenter
        </p>
      </div>

      {magicMode ? (
        /* ── Magic Link form ─────────────────────────────────────────────── */
        <form onSubmit={handleMagicLink} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email-magic" className="text-sm font-medium">
              E-postadress
            </label>
            <input
              id="email-magic"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@exempel.se"
              required
              autoComplete="email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Skickar...' : 'Skicka inloggningslänk'}
          </button>

          <button
            type="button"
            onClick={() => { setMagicMode(false); setError(null) }}
            className="w-full rounded-md border border-input bg-background px-4 py-2 text-sm text-muted-foreground hover:bg-accent transition-colors"
          >
            Tillbaka till lösenord
          </button>
        </form>
      ) : (
        /* ── Password form (primary) ─────────────────────────────────────── */
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              E-postadress
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="du@exempel.se"
              required
              autoComplete="email"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className="text-sm font-medium">
                Lösenord
              </label>
              <a
                href="/forgot-password"
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Glömt lösenord?
              </a>
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loggar in...' : 'Logga in'}
          </button>

          {/* Magic Link fallback — secondary, unobtrusive */}
          <div className="pt-2 text-center">
            <button
              type="button"
              onClick={() => { setMagicMode(true); setError(null) }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Logga in med e-postlänk istället
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="w-full max-w-sm px-6 text-center text-muted-foreground">Laddar...</div>}>
      <LoginForm />
    </Suspense>
  )
}
