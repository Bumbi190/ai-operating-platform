/**
 * lib/email/briefingEmail.ts
 *
 * Renderar Executive Briefing som ett mejl — så operatören får dagens läge
 * och topp-prioriteringar i inkorgen varje morgon, även utan att öppna appen.
 */

import type { ExecutiveBriefing } from '@/lib/os/briefing'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://ai-operating-platform-web.vercel.app'

const DOT_COLOR: Record<'red' | 'amber' | 'green', string> = {
  red: '#f87171', amber: '#fbbf24', green: '#34d399',
}

export function buildBriefingEmail(b: ExecutiveBriefing): { subject: string; html: string } {
  const subject = b.attentionCount === 0
    ? `${b.greeting}, ${b.operatorName} · allt lugnt idag`
    : `${b.greeting}, ${b.operatorName} · ${b.attentionCount} ${b.attentionCount === 1 ? 'sak' : 'saker'} behöver dig`

  const lines = b.lines.map(l => `
    <tr>
      <td style="padding: 6px 0; vertical-align: top; width: 18px;">
        <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${DOT_COLOR[l.dot]};"></span>
      </td>
      <td style="padding: 6px 0; font-size: 14px; color: #1f2937;">
        <strong style="color:#111827;">${escapeHtml(l.business)}</strong>
        <span style="color:#6b7280;"> — ${escapeHtml(l.message)}</span>
      </td>
    </tr>`).join('')

  const rec = b.recommended && b.recommended.severity !== 'info' ? `
    <div style="margin: 20px 32px; padding: 16px; background: #fdf6ec; border: 1px solid #f0d9b5; border-radius: 12px;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #b8860b; margin-bottom: 6px;">Rekommenderad åtgärd</div>
      <div style="font-size: 15px; font-weight: 600; color: #111827;">${escapeHtml(b.recommended.title)}</div>
      <div style="font-size: 13px; color: #6b7280; margin-top: 4px;">${escapeHtml(b.recommended.reason)}</div>
      <div style="margin-top: 12px;">
        <a href="${APP_URL}/action-center" style="display:inline-block; background:#6366f1; color:#fff; text-decoration:none; font-size:13px; font-weight:600; padding:9px 16px; border-radius:8px;">Öppna Action Center</a>
        ${b.recommendedEta ? `<span style="font-size:12px; color:#9ca3af; margin-left:12px;">Uppskattad tid: ${escapeHtml(b.recommendedEta)}</span>` : ''}
      </div>
    </div>` : ''

  const html = `
  <div style="max-width: 600px; margin: 32px auto; background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
    <div style="background: #0d1120; padding: 24px 32px;">
      <div style="font-size: 11px; font-weight: 700; letter-spacing: 0.16em; text-transform: uppercase; color: #a5b4fc;">${escapeHtml(b.dateLabel)} · Dagens briefing</div>
      <div style="font-size: 22px; font-weight: 700; color: #fff; margin-top: 6px;">${b.greeting}, ${escapeHtml(b.operatorName)}</div>
      <div style="font-size: 14px; color: #cbd5e1; margin-top: 6px;">${escapeHtml(b.headline)}</div>
    </div>

    <div style="padding: 20px 32px;">
      <table style="width:100%; border-collapse: collapse;">${lines}</table>
    </div>

    ${rec}

    <div style="padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af;">
      <a href="${APP_URL}/dashboard" style="color:#6366f1; text-decoration:none;">Öppna Omnira</a>
      · Dagens intäkter: ${b.revenueTodaySek > 0 ? Math.round(b.revenueTodaySek) + ' kr' : '—'}
      · Automatisk morgonbriefing
    </div>
  </div>`

  return { subject, html }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
