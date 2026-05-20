/**
 * Brevo Email Service — AI Operating Platform
 *
 * Skickar transaktionsmejl via Brevo REST API.
 * Väljer automatiskt rätt avsändare baserat på projekt.
 */

export type EmailProject = 'gainpilot' | 'familje-stunden' | 'platform'

export interface SendEmailOptions {
  to: string | { email: string; name?: string }
  subject: string
  html: string
  project?: EmailProject
  replyTo?: string
  cc?: string
}

interface BrevoSender {
  name: string
  email: string
}

function getSender(project: EmailProject = 'platform'): BrevoSender {
  switch (project) {
    case 'gainpilot':
      return {
        name: process.env.BREVO_FROM_NAME_GAINPILOT ?? 'GainPilot',
        email: process.env.BREVO_FROM_EMAIL_GAINPILOT ?? 'no-reply@gainpilot.se',
      }
    case 'familje-stunden':
      return {
        name: process.env.BREVO_FROM_NAME_FAMILJE ?? 'Familje-Stunden',
        email: process.env.BREVO_FROM_EMAIL_FAMILJE ?? 'no-reply@familje-stunden.se',
      }
    case 'platform':
    default:
      // Platform-notiser (buggar, approvals) skickas från Familje-Stunden tills plattformen har egen domän
      return {
        name: 'AI Operating Platform',
        email: process.env.BREVO_FROM_EMAIL_FAMILJE ?? 'no-reply@familje-stunden.se',
      }
  }
}

export async function sendEmail(options: SendEmailOptions): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.BREVO_API_KEY
  if (!apiKey) {
    console.error('[brevo] BREVO_API_KEY saknas')
    return { success: false, error: 'BREVO_API_KEY saknas' }
  }

  const sender = getSender(options.project)

  const toField = typeof options.to === 'string'
    ? [{ email: options.to }]
    : [{ email: options.to.email, name: options.to.name }]

  const body: Record<string, unknown> = {
    sender,
    to: toField,
    subject: options.subject,
    htmlContent: options.html,
  }

  if (options.replyTo) body.replyTo = { email: options.replyTo }
  if (options.cc) body.cc = [{ email: options.cc }]

  try {
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'api-key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      console.error(`[brevo] Fel ${res.status}:`, err)
      return { success: false, error: err }
    }

    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[brevo] Nätverksfel:', msg)
    return { success: false, error: msg }
  }
}

/** Skickar notis till André (admin) */
export async function sendAdminNotification(subject: string, html: string) {
  const adminEmail = process.env.BREVO_ADMIN_EMAIL
  if (!adminEmail) return

  return sendEmail({
    to: adminEmail,
    subject,
    html,
    project: 'platform',
  })
}
