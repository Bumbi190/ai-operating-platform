/**
 * lib/bugs/report.ts
 *
 * reportBug() — den centrala push-kanalen för buggövervakning.
 *
 *   1. Härleder severity (om ej given) via rena regler — ingen LLM.
 *   2. Debounce: samma dedupe_key inom DEBOUNCE_MIN minuter buntas (en rad,
 *      max ett mail) så du inte spammas vid återkommande fel.
 *   3. Bygger en gratis fix-prompt-mall.
 *   4. Skriver raden till bug_reports (project_id-scopat).
 *   5. ENDAST om severity = 'critical' (akut) → direktmail via Brevo, annars
 *      stannar fyndet tyst i panelen.
 *
 * reportBug är ett side-channel: den får ALDRIG kasta upp i anroparen. All
 * felhantering sväljs och loggas.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { sendAdminNotification } from '@/lib/email/brevo'
import { buildFixPrompt } from './fix-prompt'
import { classifySeverity, shouldEmail, severityIcon, type SeveritySignals } from './severity'
import type { BugSeverity, ReportBugInput } from './types'

const DEBOUNCE_MIN = 30

export interface ReportBugResult {
  ok: boolean
  created: boolean
  emailed: boolean
  deduped: boolean
  id?: string
  error?: string
}

function makeDedupeKey(input: ReportBugInput): string {
  if (input.dedupeKey) return input.dedupeKey
  const proj = input.projectId ?? 'platform'
  const norm = input.title.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120)
  return `${input.source}:${proj}:${norm}`
}

function buildEmailHtml(args: {
  severity: BugSeverity
  title: string
  projectName?: string | null
  detail?: string | null
  fixPrompt: string
}): string {
  const icon = severityIcon(args.severity)
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="margin:0 0 4px">${icon} Akut bugg — ${esc(args.title)}</h2>
      ${args.projectName ? `<p style="margin:0 0 8px;color:#666">Projekt: ${esc(args.projectName)}</p>` : ''}
      ${args.detail ? `<p style="white-space:pre-wrap">${esc(args.detail)}</p>` : ''}
      <h3 style="margin:16px 0 4px">Klistra in i Claude-chatten:</h3>
      <pre style="background:#f5f5f5;padding:12px;border-radius:8px;white-space:pre-wrap;font-size:13px">${esc(args.fixPrompt)}</pre>
    </div>`
}

export async function reportBug(input: ReportBugInput): Promise<ReportBugResult> {
  try {
    const db = createAdminClient()

    // 1. Severity
    const signals: SeveritySignals = { occurrences: input.occurrences ?? 1 }
    const severity: BugSeverity =
      input.severity ?? classifySeverity(`${input.title} ${input.detail ?? ''}`, signals)

    // 2. Debounce — finns redan en öppen rad med samma nyckel nyligen?
    const dedupeKey = makeDedupeKey(input)
    const since = new Date(Date.now() - DEBOUNCE_MIN * 60_000).toISOString()
    const { data: existing } = await (db as any)
      .from('bug_reports')
      .select('id, emailed_at')
      .eq('dedupe_key', dedupeKey)
      .eq('status', 'open')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      return { ok: true, created: false, emailed: false, deduped: true, id: existing[0].id }
    }

    // 3. Fix-prompt (gratis mall)
    const fixPrompt = buildFixPrompt({
      projectName: input.projectName,
      domain: input.domain,
      title: input.title,
      status: severity,
      message: input.detail,
      area: input.area,
      repro: input.repro,
    })

    // 4. Skriv raden
    const { data: inserted, error } = await (db as any)
      .from('bug_reports')
      .insert({
        project_id: input.projectId ?? null,
        source: input.source,
        severity,
        title: input.title,
        detail: input.detail ?? null,
        area: input.area ?? null,
        repro: input.repro ?? null,
        fix_prompt: fixPrompt,
        dedupe_key: dedupeKey,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[reportBug] insert misslyckades:', error.message)
      return { ok: false, created: false, emailed: false, deduped: false, error: error.message }
    }

    const id = inserted?.id as string

    // 5. Akut → mail
    let emailed = false
    if (shouldEmail(severity)) {
      const subject = `${severityIcon(severity)} Akut bugg: ${input.title}`
      const html = buildEmailHtml({
        severity, title: input.title, projectName: input.projectName,
        detail: input.detail, fixPrompt,
      })
      const res = await sendAdminNotification(subject, html)
      emailed = !!(res && (res as any).success !== false)
      if (emailed) {
        await (db as any).from('bug_reports').update({ emailed_at: new Date().toISOString() }).eq('id', id)
      }
    }

    return { ok: true, created: true, emailed, deduped: false, id }
  } catch (err: any) {
    console.error('[reportBug] oväntat fel:', err?.message ?? err)
    return { ok: false, created: false, emailed: false, deduped: false, error: err?.message }
  }
}
