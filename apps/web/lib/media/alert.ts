/**
 * alert.ts — Admin-alerting för The Prompt pipeline.
 *
 * Wrapper runt sendAdminNotification() med The Prompt-specifik formattering.
 * Används av alla cron-routes för att notifiera André när något går fel.
 *
 * Kräver:
 *   BREVO_API_KEY        — Brevo API-nyckel
 *   BREVO_ADMIN_EMAIL    — André:s mailadress (mottagare)
 *   BREVO_FROM_EMAIL_FAMILJE — avsändaradress (tills platform får egen domän)
 */

import { sendAdminNotification } from '@/lib/email/brevo'

const VERCEL_LOGS_URL = 'https://vercel.com/bumbi190s-projects/ai-operating-platform-web/logs'

// ─── Typer ────────────────────────────────────────────────────────────────────

export type AlertSeverity = 'error' | 'warning' | 'info'

export interface PipelineAlertOptions {
  cronRoute:   string          // t.ex. 'cron/autonomous', 'cron/publish'
  step:        string          // t.ex. 'news_hunt', 'instagram_publish'
  error:       string          // Felmeddelandet
  severity?:   AlertSeverity  // default: 'error'
  context?:    Record<string, string | number | null>  // Extra info (scriptId, hook etc.)
}

// ─── Intern HTML-builder ──────────────────────────────────────────────────────

function buildAlertHtml(opts: PipelineAlertOptions & { ranAt: string }): string {
  const severityColor = opts.severity === 'warning' ? '#d97706' : '#dc2626'
  const severityLabel = opts.severity === 'warning' ? '⚠️ Varning' : '🚨 Fel'

  const contextRows = opts.context
    ? Object.entries(opts.context)
        .filter(([, v]) => v != null)
        .map(([k, v]) => `
          <tr>
            <td style="padding:5px 8px;font-size:12px;color:#888;white-space:nowrap">${k}</td>
            <td style="padding:5px 8px;font-size:12px;color:#444;font-family:monospace">${v}</td>
          </tr>`)
        .join('')
    : ''

  return `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9f9f9;padding:20px;margin:0">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden">

    <div style="background:#111;padding:16px 24px;border-bottom:3px solid ${severityColor}">
      <p style="margin:0;font-size:11px;color:#666;letter-spacing:1px;text-transform:uppercase">The Prompt — Pipeline Alert</p>
      <h2 style="margin:4px 0 0;font-size:18px;color:#fff">${severityLabel}: ${opts.step.replace(/_/g, ' ')}</h2>
    </div>

    <div style="padding:24px">
      <p style="margin:0 0 6px;font-size:12px;color:#999">Route: <code style="background:#f5f5f5;padding:2px 6px;border-radius:3px">/api/media/${opts.cronRoute}</code></p>
      <p style="margin:0 0 16px;font-size:12px;color:#999">Tid: ${opts.ranAt}</p>

      <div style="background:#fef2f2;border:1px solid #fecaca;border-radius:6px;padding:14px;margin-bottom:16px">
        <p style="margin:0;font-size:13px;color:#991b1b;line-height:1.6;font-family:monospace;white-space:pre-wrap;word-break:break-all">${opts.error}</p>
      </div>

      ${contextRows ? `
      <table style="width:100%;border-collapse:collapse;border:1px solid #eee;border-radius:6px;overflow:hidden;margin-bottom:16px">
        ${contextRows}
      </table>` : ''}

      <a href="${VERCEL_LOGS_URL}"
         style="display:inline-block;padding:10px 20px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">
        Öppna Vercel-loggar →
      </a>
    </div>

    <div style="padding:12px 24px;background:#f9f9f9;border-top:1px solid #eee">
      <p style="margin:0;font-size:11px;color:#bbb">AI Operating Platform &mdash; The Prompt Pipeline Monitor</p>
    </div>
  </div>
</body></html>`
}

// ─── Publik API ───────────────────────────────────────────────────────────────

/**
 * Skickar ett pipeline-felmeddelande till André via Brevo.
 * Non-blocking — kastar aldrig, loggar bara om mailet misslyckas.
 */
export async function sendPipelineAlert(opts: PipelineAlertOptions): Promise<void> {
  const ranAt = new Date().toISOString()
  const severity = opts.severity ?? 'error'

  const emoji    = severity === 'warning' ? '⚠️' : '🚨'
  const subject  = `${emoji} The Prompt: ${opts.step.replace(/_/g, ' ')} misslyckades`
  const html     = buildAlertHtml({ ...opts, severity, ranAt })

  const result = await sendAdminNotification(subject, html)

  if (!result?.success) {
    console.error(`[alert] Kunde inte skicka alert-mail för ${opts.cronRoute}/${opts.step}:`, result?.error)
  } else {
    console.log(`[alert] Alert skickat: ${subject}`)
  }
}

/**
 * Skickar en påminnelse om att ett token löper ut snart.
 */
export async function sendTokenExpiryWarning(platform: string, daysLeft: number, expiresAt: string): Promise<void> {
  const subject = `⏰ The Prompt: ${platform}-token löper ut om ${daysLeft} dagar`

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9f9f9;padding:20px;margin:0">
  <div style="max-width:580px;margin:0 auto;background:#fff;border-radius:8px;border:1px solid #e5e5e5;overflow:hidden">
    <div style="background:#111;padding:16px 24px;border-bottom:3px solid #d97706">
      <p style="margin:0;font-size:11px;color:#666;letter-spacing:1px;text-transform:uppercase">The Prompt — Token-varning</p>
      <h2 style="margin:4px 0 0;font-size:18px;color:#fff">⏰ ${platform}-token löper ut snart</h2>
    </div>
    <div style="padding:24px">
      <p style="font-size:14px;color:#444;line-height:1.6">
        <strong>${platform}</strong>-tokenet löper ut om <strong style="color:#d97706">${daysLeft} dagar</strong> (${expiresAt}).
      </p>
      <p style="font-size:14px;color:#444;line-height:1.6">
        Den månatliga refresh-cronen borde ha förnyat det automatiskt. Kontrollera att <code>META_APP_ID</code> och <code>META_APP_SECRET</code> är satta i Vercel och att refresh-cronen körde utan fel.
      </p>
      <a href="${VERCEL_LOGS_URL}"
         style="display:inline-block;padding:10px 20px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">
        Öppna Vercel-loggar →
      </a>
    </div>
  </div>
</body></html>`

  const result = await sendAdminNotification(subject, html)
  if (!result?.success) {
    console.error(`[alert] Kunde inte skicka token-varning för ${platform}:`, result?.error)
  }
}
