'use client'
import { useState, type FormEvent } from 'react'

export default function InviteForm() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage('')
    try {
      const res = await fetch('/api/organization/invitations', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      setMessage(res.ok ? 'Inbjudan skickad. Mottagaren kan följa länken i mejlet.' : 'Kunde inte skicka inbjudan. Kontrollera roll och konfiguration.')
      if (res.ok) setEmail('')
    } catch {
      setMessage('Kunde inte nå servern just nu.')
    } finally {
      setLoading(false)
    }
  }
  return <form onSubmit={invite} style={{ marginTop: 24, display: 'grid', gap: 16 }}>
    <label htmlFor="invited-email">E-postadress</label>
    <input id="invited-email" type="email" required autoComplete="email"
      value={email} onChange={event => setEmail(event.target.value)}
      style={{ padding: 13, background: '#16243a', color: '#fff', border: '1px solid #627897', borderRadius: 8 }} />
    <button type="submit" disabled={loading} style={{ padding: 14, cursor: 'pointer', borderRadius: 8 }}>
      {loading ? 'Skickar…' : 'Skicka inbjudan'}
    </button>
    {message && <p role="status">{message}</p>}
  </form>
}
