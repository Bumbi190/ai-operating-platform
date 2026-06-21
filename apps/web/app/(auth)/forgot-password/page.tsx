'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      // Supabase will append ?code=... to this URL.
      // /auth/confirm exchanges the code and detects type=recovery → /update-password.
      redirectTo: `${window.location.origin}/auth/confirm`,
    })

    if (error) {
      setError(error.message)
    } else {
      setSent(true)
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm space-y-8 px-6">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-primary text-primary-foreground text-xl font-bold mb-4">
            ⚡
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Återställ lösenord</h1>
          <p className="text-sm text-muted-foreground">
            Vi skickar en länk för att sätta ett nytt lösenord
          </p>
        </div>

        {sent ? (
          /* ── Confirmation view ─────────────────────────────────────────── */
          <div className="space-y-4">
            <div className="rounded-lg border border-border bg-card p-6 text-center space-y-2">
              <div className="text-2xl">📬</div>
              <p className="font-medium">Kolla din inbox</p>
              <p className="text-sm text-muted-foreground">
                Om <strong>{email}</strong> finns i systemet har vi skickat
                en länk för lösenordsåterställning.
              </p>
            </div>
            <a
              href="/login"
              className="block w-full rounded-md border border-input bg-background px-4 py-2 text-center text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              Tillbaka till inloggning
            </a>
          </div>
        ) : (
          /* ── Email form ────────────────────────────────────────────────── */
          <form onSubmit={handleSubmit} className="space-y-4">
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

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Skickar...' : 'Skicka återställningslänk'}
            </button>

            <a
              href="/login"
              className="block w-full rounded-md border border-input bg-background px-4 py-2 text-center text-sm text-muted-foreground hover:bg-accent transition-colors"
            >
              Tillbaka till inloggning
            </a>
          </form>
        )}
      </div>
    </div>
  )
}
