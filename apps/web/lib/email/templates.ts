/**
 * Email-mallar — AI Operating Platform
 *
 * Tre separata stilar:
 * - Familje-Stunden: barnvänlig, ljus, lila/blå gradient (befintlig stil från FS)
 * - GainPilot: mörkt tema, svart bakgrund, röd accent (#dc2626)
 * - Admin (intern): enkel och funktionell — bara för André
 */

// ─────────────────────────────────────────────
// FAMILJE-STUNDEN — ljus, barnvänlig, exakt samma stil som befintliga FS-mallar
// ─────────────────────────────────────────────

const fsStyles = {
  wrapper: `font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto; padding: 0;`,
  header: `background: linear-gradient(135deg, #E8F6FF 0%, #BFDFFB 50%, #F8E9F0 100%); padding: 40px 30px; text-align: center; border-radius: 20px 20px 0 0;`,
  body: `background: #ffffff; padding: 30px; border-left: 1px solid #E8F6FF; border-right: 1px solid #E8F6FF;`,
  footer: `background: #F8E9F0; padding: 30px; text-align: center; border-radius: 0 0 20px 20px; border: 1px solid #E8F6FF; border-top: none;`,
  btn: `display: inline-block; background: linear-gradient(135deg, #4A80BF 0%, #4A307F 100%); color: #ffffff !important; padding: 16px 40px; text-decoration: none; border-radius: 30px; font-size: 16px; font-weight: bold; margin: 20px 0; box-shadow: 0 4px 15px rgba(74,128,191,0.3);`,
}

function wrapFS(headerContent: string, bodyContent: string, footerContent = '') {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f0f4ff;">
  <div style="${fsStyles.wrapper}">
    <div style="${fsStyles.header}">${headerContent}</div>
    <div style="${fsStyles.body}">${bodyContent}</div>
    <div style="${fsStyles.footer}">${footerContent}</div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────
// GAINPILOT — mörkt tema, svart + röd accent
// ─────────────────────────────────────────────

const gpStyles = {
  wrapper: `font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a0a0a;`,
  header: `background: #0a0a0a; border-top: 3px solid #dc2626; padding: 32px 32px 24px; text-align: center;`,
  body: `background: #111111; padding: 28px 32px; border-left: 1px solid #1f1f1f; border-right: 1px solid #1f1f1f;`,
  footer: `background: #0a0a0a; padding: 20px 32px; text-align: center; border: 1px solid #1f1f1f; border-top: none; border-radius: 0 0 8px 8px;`,
  btn: `display: inline-block; background: #dc2626; color: #ffffff !important; padding: 14px 36px; text-decoration: none; border-radius: 6px; font-size: 15px; font-weight: 700; margin: 20px 0; letter-spacing: 0.5px;`,
  h1: `color: #f2f2f2; font-size: 22px; font-weight: 700; margin: 0 0 8px; letter-spacing: -0.3px;`,
  p: `color: #8c8c8c; font-size: 14px; line-height: 1.6; margin: 0 0 16px;`,
  pLight: `color: #d1d5db; font-size: 14px; line-height: 1.6; margin: 0 0 16px;`,
}

function wrapGP(headerContent: string, bodyContent: string, footerContent = '') {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#000000;">
  <div style="${gpStyles.wrapper}">
    <div style="${gpStyles.header}">${headerContent}</div>
    <div style="${gpStyles.body}">${bodyContent}</div>
    <div style="${gpStyles.footer}">${footerContent}</div>
  </div>
</body>
</html>`
}

// ─────────────────────────────────────────────
// 1. Familje-Stunden: Ny månad upplåst → prenumerant
// ─────────────────────────────────────────────

export interface MonthlyContentReadyEmailData {
  userName: string
  monthTitle: string
  monthDescription: string
  highlights: string[]
  loginUrl: string
}

export function getMonthlyContentReadyEmail(data: MonthlyContentReadyEmailData) {
  const subject = `🎉 ${data.monthTitle} är nu upplåst!`

  const highlightItems = data.highlights
    .map(h => `<li style="padding:6px 0;color:#444;font-size:14px">✨ ${h}</li>`)
    .join('')

  const html = wrapFS(
    `<div style="font-size:48px">🌟</div>
    <h1 style="color:#4A307F;font-size:24px;margin:12px 0 4px">Ny månad upplåst!</h1>
    <p style="color:#4A80BF;font-size:16px;margin:0">${data.monthTitle}</p>`,
    `<p style="color:#333;font-size:16px">Hej ${data.userName}! 💖</p>
    <p style="color:#555;font-size:14px;line-height:1.7">${data.monthDescription}</p>
    <p style="color:#4A307F;font-weight:bold;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:20px 0 8px">Det här månaden innehåller</p>
    <ul style="list-style:none;padding:0;margin:0 0 16px">${highlightItems}</ul>
    <div style="text-align:center">
      <a href="${data.loginUrl}" style="${fsStyles.btn}">Öppna ${data.monthTitle} →</a>
    </div>`,
    `<p style="color:#888;font-size:12px;margin:0">Familje-Stunden &mdash; <a href="https://familje-stunden.se/installera" style="color:#4A80BF">Installera som app</a></p>`
  )

  return { subject, html }
}

// ─────────────────────────────────────────────
// 2. Familje-Stunden: Support-autosvar → användare
// ─────────────────────────────────────────────

export interface FSSupportAutoReplyData {
  userName: string
  originalSubject: string
  agentReply: string
}

export function getFSSupportAutoReplyEmail(data: FSSupportAutoReplyData) {
  const subject = `Re: ${data.originalSubject}`

  const html = wrapFS(
    `<div style="font-size:40px">💌</div>
    <h1 style="color:#4A307F;font-size:20px;margin:12px 0 0">Svar från Familje-Stunden</h1>`,
    `<p style="color:#333;font-size:15px">Hej ${data.userName}! 😊</p>
    <div style="background:#f0f4ff;border-left:4px solid #4A80BF;padding:16px;border-radius:0 8px 8px 0;margin:16px 0">
      <p style="color:#333;font-size:14px;line-height:1.7;margin:0">${data.agentReply}</p>
    </div>
    <p style="color:#777;font-size:13px">Fick du inte svar på din fråga? Svara på detta mail så hjälper vi dig vidare! 💛</p>`,
    `<p style="color:#888;font-size:12px;margin:0">Familje-Stunden Support &mdash; kontakt@familje-stunden.se</p>`
  )

  return { subject, html }
}

// ─────────────────────────────────────────────
// 3. GainPilot: Support-autosvar → användare
// ─────────────────────────────────────────────

export interface GPSupportAutoReplyData {
  userName: string
  originalSubject: string
  agentReply: string
}

export function getGPSupportAutoReplyEmail(data: GPSupportAutoReplyData) {
  const subject = `Re: ${data.originalSubject}`

  const html = wrapGP(
    `<img src="https://www.gainpilot.se/logo.png" alt="GainPilot" style="height:32px;margin-bottom:12px" onerror="this.style.display='none'">
    <h1 style="${gpStyles.h1}">Svar från GainPilot Support</h1>`,
    `<p style="${gpStyles.pLight}">Hej ${data.userName},</p>
    <div style="border-left:3px solid #dc2626;padding:14px 16px;background:#1a0a0a;border-radius:0 6px 6px 0;margin:16px 0">
      <p style="color:#d1d5db;font-size:14px;line-height:1.7;margin:0">${data.agentReply}</p>
    </div>
    <p style="${gpStyles.p}">Inte nöjd med svaret? Svara på detta mail så tittar vi på det direkt.</p>`,
    `<p style="color:#3f3f3f;font-size:12px;margin:0">GainPilot Support &mdash; support@gainpilot.se</p>`
  )

  return { subject, html }
}

// ─────────────────────────────────────────────
// 4. Admin-notiser till André (interna, enkla)
// ─────────────────────────────────────────────

export interface ApprovalPendingEmailData {
  workflowName: string
  projectName: string
  runId: string
  outputPreview: string
  aiScore?: number
  platformUrl: string
}

export function getApprovalPendingEmail(data: ApprovalPendingEmailData): { subject: string; html: string } {
  const subject = `✅ Väntar på godkännande: ${data.workflowName} (${data.projectName})`
  const scoreNote = data.aiScore != null ? ` &mdash; AI-poäng: ${data.aiScore}/100` : ''
  const preview = data.outputPreview.slice(0, 400) + (data.outputPreview.length > 400 ? '…' : '')

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9f9f9;padding:20px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e5e5">
      <p style="font-size:13px;color:#888;margin:0 0 4px">AI OPERATING PLATFORM</p>
      <h2 style="margin:0 0 4px;font-size:18px;color:#111">${data.workflowName}</h2>
      <p style="color:#555;font-size:13px;margin:0 0 16px">${data.projectName}${scoreNote}</p>
      <div style="background:#f5f5f5;border-radius:6px;padding:14px;font-size:13px;color:#444;line-height:1.6;white-space:pre-wrap">${preview}</div>
      <a href="${data.platformUrl}/approvals" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Granska →</a>
    </div>
  </body></html>`

  return { subject, html }
}

export interface BugReportEmailData {
  project: string
  errorCount: number
  errors: Array<{ message: string; count: number; lastSeen: string }>
  runFailures: number
  platformUrl: string
}

export function getBugReportEmail(data: BugReportEmailData): { subject: string; html: string } {
  const subject = `🐛 ${data.project}: ${data.errorCount} fel — ${new Date().toLocaleDateString('sv-SE')}`
  const rows = data.errors
    .map(e => `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px">${e.message}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:13px;color:#dc2626;text-align:right">${e.count}×</td><td style="padding:6px 8px;border-bottom:1px solid #eee;font-size:12px;color:#999;text-align:right">${e.lastSeen}</td></tr>`)
    .join('')

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9f9f9;padding:20px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e5e5">
      <p style="font-size:13px;color:#888;margin:0 0 4px">BUG MONITOR &mdash; ${data.project}</p>
      <h2 style="margin:0 0 4px;font-size:18px;color:#111">${data.errorCount} fel &bull; ${data.runFailures} misslyckade körningar</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:16px">
        <thead><tr>
          <th style="text-align:left;font-size:11px;color:#999;padding:0 8px 6px;border-bottom:2px solid #eee">FEL</th>
          <th style="text-align:right;font-size:11px;color:#999;padding:0 8px 6px;border-bottom:2px solid #eee">ANTAL</th>
          <th style="text-align:right;font-size:11px;color:#999;padding:0 8px 6px;border-bottom:2px solid #eee">SENAST</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <a href="${data.platformUrl}/manager" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Visa i plattformen →</a>
    </div>
  </body></html>`

  return { subject, html }
}

export interface SupportEscalationEmailData {
  project: 'gainpilot' | 'familje-stunden'
  userEmail: string
  subject: string
  message: string
  reason: string
  platformUrl: string
}

export function getSupportEscalationEmail(data: SupportEscalationEmailData): { subject: string; html: string } {
  const projectLabel = data.project === 'gainpilot' ? 'GainPilot' : 'Familje-Stunden'
  const emailSubject = `💬 Support-eskalering (${projectLabel}): ${data.subject}`

  const html = `<!DOCTYPE html><html><body style="font-family:sans-serif;background:#f9f9f9;padding:20px">
    <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:24px;border:1px solid #e5e5e5">
      <p style="font-size:13px;color:#888;margin:0 0 4px">SUPPORT ESKALERING &mdash; ${projectLabel.toUpperCase()}</p>
      <h2 style="margin:0 0 4px;font-size:18px;color:#111">${data.subject}</h2>
      <p style="color:#555;font-size:13px;margin:0 0 4px">Från: <strong>${data.userEmail}</strong></p>
      <p style="color:#dc2626;font-size:12px;margin:0 0 16px">Anledning: ${data.reason}</p>
      <div style="background:#f5f5f5;border-radius:6px;padding:14px;font-size:14px;color:#333;line-height:1.6">${data.message}</div>
      <a href="mailto:${data.userEmail}" style="display:inline-block;margin-top:16px;padding:10px 20px;background:#111;color:#fff;border-radius:6px;text-decoration:none;font-size:13px;font-weight:600">Svara direkt →</a>
    </div>
  </body></html>`

  return { subject: emailSubject, html }
}
