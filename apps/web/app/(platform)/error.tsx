'use client'

import { useEffect } from 'react'

/**
 * Platform error boundary. Scoped to the (platform) segment so a failing page
 * degrades inside the authenticated shell instead of replacing the whole app
 * with default Next.js chrome.
 *
 * Deliberately does not render `error.message` — a server error can carry
 * internal detail, and this surface is not a debugging console. The digest is
 * shown because it is the safe correlation handle for the server log.
 */
export default function PlatformError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[platform] render error', error)
  }, [error])

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div
        className="w-full max-w-md rounded-2xl p-8 text-center"
        style={{
          border: '1px solid var(--omnira-edge)',
          background: 'var(--omnira-glass-2)',
        }}
      >
        <p
          className="font-mono text-[10px] uppercase"
          style={{ letterSpacing: '0.18em', color: 'var(--omnira-amber)' }}
        >
          Fel · ytan kunde inte visas
        </p>
        <h1
          className="mt-3 text-[17px] font-medium"
          style={{ color: 'var(--omnira-text-0)' }}
        >
          Något gick fel här
        </h1>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: 'var(--omnira-text-2)' }}
        >
          Resten av plattformen fungerar. Försök igen — om det återkommer finns
          detaljerna i serverloggen.
        </p>
        {error.digest ? (
          <p
            className="mt-3 font-mono text-[10px]"
            style={{ color: 'var(--omnira-text-3)' }}
          >
            {error.digest}
          </p>
        ) : null}
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex items-center rounded-full px-4 py-2 text-[12px] transition-colors"
          style={{
            border: '1px solid var(--omnira-edge-hover)',
            color: 'var(--omnira-text-1)',
            background: 'var(--omnira-glass-1)',
          }}
        >
          Försök igen
        </button>
      </div>
    </div>
  )
}
