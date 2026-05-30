/**
 * bugscanner/reportEmail.ts
 *
 * Bygger HTML-mailet för den dagliga buggrapporten.
 */

import type { ScanReport, CheckResult } from './checker'

function statusIcon(status: CheckResult['status']): string {
  switch (status) {
    case 'ok':      return '✅'
    case 'warning': return '⚠️'
    case 'error':   return '🔴'
  }
}

function statusColor(status: CheckResult['status']): string {
  switch (status) {
    case 'ok':      return '#16a34a'
    case 'warning': return '#d97706'
    case 'error':   return '#dc2626'
  }
}

function statusBg(status: CheckResult['status']): string {
  switch (status) {
    case 'ok':      return '#f0fdf4'
    case 'warning': return '#fffbeb'
    case 'error':   return '#fef2f2'
  }
}

export function buildBugReportEmail(report: ScanReport): { subject: string; html: string } {
  const date = new Date(report.timestamp).toLocaleDateString('sv-SE', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
  const time = new Date(report.timestamp).toLocaleTimeString('sv-SE', {
    hour: '2-digit', minute: '2-digit',
  })

  const { ok, warnings, errors, hasIssues } = report.summary

  const subject = hasIssues
    ? `🔴 Buggrapport ${date} — ${errors} fel, ${warnings} varningar`
    : `✅ Buggrapport ${date} — allt OK`

  const checkRows = report.checks.map(check => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 10px 12px; background: ${statusBg(check.status)};">
        <div style="display: flex; align-items: flex-start; gap: 8px;">
          <span style="font-size: 16px; flex-shrink: 0;">${statusIcon(check.status)}</span>
          <div>
            <div style="font-weight: 600; color: #111827; font-size: 13px;">${check.name}</div>
            <div style="color: ${statusColor(check.status)}; font-size: 13px; margin-top: 2px;">${check.message}</div>
            ${check.details ? `<pre style="margin: 6px 0 0; padding: 8px; background: #f9fafb; border-radius: 4px; font-size: 11px; color: #374151; white-space: pre-wrap; word-break: break-word;">${check.details}</pre>` : ''}
          </div>
        </div>
      </td>
    </tr>
  `).join('')

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin: 0; padding: 0; background: #f3f4f6; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;">
  <div style="max-width: 600px; margin: 32px auto; background: #fff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">

    <!-- Header -->
    <div style="background: ${hasIssues ? '#1e1b4b' : '#052e16'}; padding: 28px 32px;">
      <div style="font-size: 22px; font-weight: 700; color: #fff;">
        ${hasIssues ? '🔍 Daglig Buggrapport' : '✅ Daglig Buggrapport'}
      </div>
      <div style="color: #a5b4fc; font-size: 13px; margin-top: 4px;">${date} · ${time}</div>
    </div>

    <!-- Summary bar -->
    <div style="display: flex; border-bottom: 1px solid #e5e7eb;">
      <div style="flex: 1; padding: 16px; text-align: center; border-right: 1px solid #e5e7eb;">
        <div style="font-size: 24px; font-weight: 700; color: #16a34a;">${ok}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">OK</div>
      </div>
      <div style="flex: 1; padding: 16px; text-align: center; border-right: 1px solid #e5e7eb;">
        <div style="font-size: 24px; font-weight: 700; color: #d97706;">${warnings}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">Varningar</div>
      </div>
      <div style="flex: 1; padding: 16px; text-align: center;">
        <div style="font-size: 24px; font-weight: 700; color: #dc2626;">${errors}</div>
        <div style="font-size: 12px; color: #6b7280; margin-top: 2px;">Fel</div>
      </div>
    </div>

    <!-- Checks -->
    <table style="width: 100%; border-collapse: collapse;">
      ${checkRows}
    </table>

    <!-- Footer -->
    <div style="padding: 20px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb;">
      <div style="font-size: 12px; color: #9ca3af;">
        Automatisk buggscanning · AI Operating Platform · Körs dagligen kl 07:00
      </div>
    </div>

  </div>
</body>
</html>
  `.trim()

  return { subject, html }
}
