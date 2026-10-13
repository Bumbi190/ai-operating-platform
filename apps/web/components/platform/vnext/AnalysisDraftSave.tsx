'use client'
import { useState, useRef, useEffect, useId } from 'react'
import type { SaveSelector } from '@/lib/atlas/project-analytics/analysis-review-contract'
import styles from './AnalysisDraftHistory.module.css'
export function AnalysisDraftSave({ slug, selector }: { slug: string; selector: SaveSelector }) {
  const [pending, setPending] = useState(false),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false)
  const [saved, setSaved] = useState<{ id: string; href: string } | null>(null)
  const link = useRef<HTMLAnchorElement>(null),
    errorId = useId()
  useEffect(() => {
    if (saved) link.current?.focus()
  }, [saved])
  async function save() {
    if (pending) return
    setPending(true)
    setError('')
    setConflict(false)
    const controller = new AbortController(),
      timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch('/api/projects/' + encodeURIComponent(slug) + '/atlas/analysis-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(selector),
        signal: controller.signal,
        cache: 'no-store',
      })
      if (response.status === 409) {
        setConflict(true)
        setError('Underlaget eller åtkomsten har ändrats. Läs in projektet igen för en ny bedömning.')
        return
      }
      if (response.status === 401 || response.status === 404) {
        setError('Åtkomsten behöver kontrolleras igen. Läs in projektet på nytt.')
        setConflict(true)
        return
      }
      if (response.status !== 200 && response.status !== 201) throw Error()
      const result = await response.json()
      if (
        typeof result.id !== 'string' ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(result.id) ||
        typeof result.created !== 'boolean' ||
        (response.status === 201) !== result.created
      )
        throw Error()
      const href = '/projects/' + encodeURIComponent(slug) + '/atlas/analysis-drafts/' + result.id
      if (result.href !== href) throw Error()
      setSaved({ id: result.id, href })
    } catch {
      setError('Sparandet kunde inte bekräftas. Försök igen; samma underlag sparas bara en gång.')
    } finally {
      clearTimeout(timeout)
      setPending(false)
    }
  }
  return (
    <div className={styles.save}>
      {saved ? (
        <div role="status">
          <p>Sparat analysutkast · Att granska</p>
          <a ref={link} href={saved.href}>
            Öppna analysutkast <span className={styles.identifier}>{saved.id}</span>
          </a>
        </div>
      ) : (
        <>
          <button
            type="button"
            disabled={pending || conflict}
            aria-busy={pending}
            aria-describedby={error ? errorId : undefined}
            onClick={save}
          >
            {pending ? 'Sparar analysutkast…' : error && !conflict ? 'Försök spara igen' : 'Spara analysutkast'}
          </button>
          {error && (
            <p id={errorId} role="alert">
              {error}
            </p>
          )}
          {conflict && <a href={'/projects/' + encodeURIComponent(slug)}>Läs in projektet igen</a>}
        </>
      )}
    </div>
  )
}
