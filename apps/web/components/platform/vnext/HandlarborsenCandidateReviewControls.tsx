'use client'
import * as React from 'react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import type { CandidateReviewEntry, CandidateReviewStatus } from '@/lib/atlas/project-analytics/handlarborsen-candidate-review-service'

const ENDPOINTS = {
  owner: '/api/projects/handlarborsen/competitors/reviews',
  collaborator: '/api/organization/projects/handlarborsen/competitors/reviews',
} as const
export function reviewEndpointForMode(mode: 'owner' | 'collaborator'): string {
  return ENDPOINTS[mode]
}

const labels: Record<CandidateReviewStatus, string> = {
  pending:'Väntar på granskning',
  interesting:'Intressant – undersök vidare',
  reviewed:'Granskad',
  ignored:'Ignorerad',
}
const choices = [
  { status:'interesting', label:'Markera intressant' },
  { status:'reviewed', label:'Markera granskad' },
  { status:'ignored', label:'Ignorera' },
  { status:'pending', label:'Återöppna för granskning' },
] as const

/**
 * A deliberate human click, then one audited transaction. An existing status
 * never inserts a second record. Never delegates execution or new search URLs.
 */
export function HandlarborsenCandidateReviewControls({ review, mode = 'owner' }: { review: CandidateReviewEntry; mode?: 'owner' | 'collaborator' }) {
  const router = useRouter()
  const [busy,setBusy]=useState(false)
  const [message,setMessage]=useState('')
  async function save(status: CandidateReviewStatus) {
    if (busy || status === review.status) return
    setBusy(true)
    setMessage('')
    try {
      const response = await fetch(reviewEndpointForMode(mode),{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{ 'content-type':'application/json' },
        body:JSON.stringify({ host:review.host,status,requestId:crypto.randomUUID(),
          expectedRevision:review.totalDecisions }),
      })
      if (!response.ok) {
        setMessage(response.status===403 ? 'Beslutet nekades: du saknar behörighet.'
          : response.status===401 ? 'Logga in igen.'
          : response.status===409 ? 'Beslutet måste kontrolleras innan nytt försök.'
          : 'Kunde inte verifiera beslutet. Kontrollera historiken innan nytt försök.')
        return
      }
      const value: unknown=await response.json()
      const outcome=value&&typeof value==='object'&&'status' in value
        ? (value as {status:unknown}).status : null
      setMessage(outcome==='saved' ? 'Beslutet sparades i granskningshistoriken.'
        : outcome==='unchanged'||outcome==='already_applied'
          ? 'Beslutet var redan registrerat. Ingen dubblett skapades.'
          : 'Sparresultatet kunde inte verifieras.')
      router.refresh()
    } catch {
      setMessage('Nätverksfel. Kontrollera historiken före ett nytt försök.')
    } finally {setBusy(false)}
  }
  return <div className="mt-4 rounded-lg border border-cyan-400/20 bg-slate-950/30 p-3">
    <p className="text-sm font-semibold text-slate-100">
      Granskningsstatus: {labels[review.status]}
    </p>
    <p className="mt-1 text-xs text-slate-400">
      Ett mänskligt beslut med revisionshistorik. Ingen automatisk skanning eller avisering aktiveras.
    </p>
    <div className="mt-3 flex flex-wrap gap-2">
      {choices.map(x=><button type="button" key={x.status}
        disabled={busy||x.status===review.status}
        onClick={()=>{void save(x.status)}}
        className="min-h-11 rounded-lg border border-cyan-300/35 bg-slate-800 px-3 py-2 text-sm font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-40">
        {busy?'Sparar …':x.label}
      </button>)}
    </div>
    {message?<p role="status" className="mt-2 text-sm text-cyan-200">{message}</p>:null}
    {review.history.length>0?<details className="mt-3 text-sm text-slate-300">
      <summary className="cursor-pointer">Visa beslutshistorik ({review.totalDecisions} beslut)</summary>
      <ol className="mt-2 space-y-1">
        {review.history.map(event=><li key={event.id}>
          <time dateTime={event.at}>{event.at.slice(0,16).replace('T',' ')} UTC</time>: {labels[event.status]}
        </li>)}
      </ol>
    </details>:null}
  </div>
}
