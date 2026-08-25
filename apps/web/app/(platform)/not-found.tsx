import Link from 'next/link'

/**
 * Platform 404. Scoped to the (platform) segment so it renders inside the
 * authenticated shell — sidebar and command bar stay in place rather than the
 * operator being dropped onto a bare Next.js page.
 *
 * Styled from the --omnira-* token layer only, so it inherits whichever visual
 * generation is active instead of pinning itself to one.
 */
export default function PlatformNotFound() {
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
          style={{ letterSpacing: '0.18em', color: 'var(--omnira-text-3)' }}
        >
          404 · Okänd yta
        </p>
        <h1
          className="mt-3 text-[17px] font-medium"
          style={{ color: 'var(--omnira-text-0)' }}
        >
          Den här sidan finns inte
        </h1>
        <p
          className="mt-2 text-[13px] leading-relaxed"
          style={{ color: 'var(--omnira-text-2)' }}
        >
          Länken kan vara gammal, eller så har ytan flyttat.
        </p>
        <Link
          href="/atlas"
          className="mt-6 inline-flex items-center rounded-full px-4 py-2 text-[12px] transition-colors"
          style={{
            border: '1px solid var(--omnira-edge-hover)',
            color: 'var(--omnira-text-1)',
            background: 'var(--omnira-glass-1)',
          }}
        >
          Tillbaka till Atlas
        </Link>
      </div>
    </div>
  )
}
