'use client'

import { useEffect, useState } from 'react'

type Metric = { key: string; label: string; value: number | null }
type Report = { project: string; state: string; snapshotDate: string | null; freshness: string | null; metrics: Metric[] }

export default function HandlarborsenViewerPage() {
  const [report, setReport] = useState<Report | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const response = await fetch('/api/viewer/handlarborsen', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal })
        if (!response.ok) {
          setError(response.status === 401 ? 'Logga in för att visa projektet.' : 'Du har inte behörighet att visa den här projektinformationen.')
          return
        }
        const data = await response.json() as Report
        if (!controller.signal.aborted) setReport(data)
      } catch {
        if (!controller.signal.aborted) setError('Statistiken kunde inte hämtas just nu.')
      }
    })()
    return () => controller.abort()
  }, [])
  return (
    <main style={{ minHeight: '100vh', background: '#0b1424', color: '#eef4fc', padding: '48px 20px', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ maxWidth: 960, margin: '0 auto' }}>
        <p style={{ color: '#90a4c0', letterSpacing: 2, fontSize: 12 }}>OMNIRA · PROJEKTÖVERSIKT</p>
        <h1 style={{ fontSize: 34, marginBottom: 8 }}>Handlarbörsen</h1>
        <p style={{ color: '#9eb2cd' }}>Läsbehörig statistikvy · ingen redigering eller åtkomst till Atlas verktyg</p>
        {error && <p role="alert" style={{ marginTop: 32 }}>{error} <a style={{ color: '#b8dbff' }} href="/login">Till inloggning</a></p>}
        {!error && !report && <p role="status">Hämtar tillgänglig statistik…</p>}
        {report && <>
          <p style={{ color: '#9eb2cd', marginTop: 30 }}>Senaste underlag: {report.snapshotDate ?? 'saknas'} · {report.freshness === 'stale' ? 'Kan vara inaktuellt' : report.freshness === 'fresh' ? 'Aktuellt' : 'Ingen verifierad färskhet'}</p>
          {report.metrics.length ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 16, marginTop: 24 }}>
            {report.metrics.map(metric => <div key={metric.key} style={{ border: '1px solid #30425a', borderRadius: 14, padding: 22, background: '#15223a' }}>
              <p style={{ color: '#acbdd2', fontSize: 14 }}>{metric.label}</p>
              <strong style={{ fontSize: 30 }}>{metric.value === null ? '—' : metric.value.toLocaleString('sv-SE')}</strong>
            </div>)}
          </div> : <p>Inga verifierade statistikvärden tillgängliga.</p>}
        </>}
      </div>
    </main>
  )
}
