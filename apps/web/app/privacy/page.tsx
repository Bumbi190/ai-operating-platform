import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Privacy Policy — The Prompt',
  description: 'Privacy Policy for The Prompt AI news platform.',
}

export default function PrivacyPage() {
  return (
    <main style={{
      backgroundColor: '#07080f',
      minHeight: '100vh',
      color: 'rgba(255,255,255,0.90)',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", Arial, sans-serif',
    }}>
      {/* Header */}
      <header style={{
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: '20px 40px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <span style={{
            fontSize: 18,
            fontWeight: 800,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: '#ffffff',
          }}>
            THE PROMPT
          </span>
        </Link>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.62)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Privacy Policy
        </span>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '72px 40px 120px' }}>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
          Last updated: May 2025
        </p>

        <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.15, marginBottom: 40, letterSpacing: '-0.5px' }}>
          Privacy Policy
        </h1>

        <p style={bodyText}>
          The Prompt (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;) operates an AI-powered media platform that produces and distributes short-form video content about artificial intelligence developments. This Privacy Policy explains how we collect, use, and protect information when you use our platform or connect third-party accounts such as TikTok.
        </p>

        <Section title="1. Information We Collect">
          <p style={bodyText}>We may collect the following categories of information:</p>
          <ul style={listStyle}>
            <li style={listItem}><strong>Account information:</strong> Your email address and authentication credentials when you create an account.</li>
            <li style={listItem}><strong>OAuth tokens:</strong> When you connect a TikTok account or other social media platform, we store the OAuth access token and refresh token required to publish content on your behalf.</li>
            <li style={listItem}><strong>Usage data:</strong> Basic analytics about how you interact with the platform (e.g., which videos you generate or publish).</li>
            <li style={listItem}><strong>Content data:</strong> Scripts, audio, and video assets generated through our pipeline.</li>
          </ul>
        </Section>

        <Section title="2. How We Use Your Information">
          <ul style={listStyle}>
            <li style={listItem}>To authenticate you and provide access to the platform.</li>
            <li style={listItem}>To publish content to connected social media accounts (TikTok, Instagram) on your behalf using stored OAuth tokens.</li>
            <li style={listItem}>To generate AI-produced video scripts, voiceovers, and images using your inputs.</li>
            <li style={listItem}>To improve our services and fix technical issues.</li>
          </ul>
        </Section>

        <Section title="3. OAuth Tokens and Social Platform Access">
          <p style={bodyText}>
            When you connect a TikTok or Instagram account, we store OAuth credentials in an encrypted database. These credentials are used exclusively to publish content that you have reviewed and approved. We do not use these tokens to read your private data, messages, or followers beyond what is required for content publishing.
          </p>
          <p style={bodyText}>
            You may revoke our access at any time by disconnecting the integration from your account settings or directly through the social platform&apos;s security settings.
          </p>
        </Section>

        <Section title="4. Data Storage and Security">
          <p style={bodyText}>
            All data is stored using Supabase, a secure cloud database provider. OAuth tokens and sensitive credentials are stored with encryption at rest. We use HTTPS for all data transmission. We do not store payment card information.
          </p>
        </Section>

        <Section title="5. Data Sharing">
          <p style={bodyText}>
            We do not sell, trade, or rent your personal information to third parties. We may share data only in the following circumstances:
          </p>
          <ul style={listStyle}>
            <li style={listItem}><strong>Service providers:</strong> We use third-party services (Supabase, Vercel, ElevenLabs, Ideogram, Anthropic) to operate the platform. These providers process data solely to provide their services to us.</li>
            <li style={listItem}><strong>Legal requirements:</strong> We may disclose information if required by law or to protect our legal rights.</li>
          </ul>
        </Section>

        <Section title="6. Data Retention">
          <p style={bodyText}>
            We retain account data and generated content for as long as your account is active. OAuth tokens are retained until you disconnect the integration or delete your account. You may request deletion of your data at any time by contacting us.
          </p>
        </Section>

        <Section title="7. Your Rights">
          <p style={bodyText}>You have the right to:</p>
          <ul style={listStyle}>
            <li style={listItem}>Access the personal data we hold about you.</li>
            <li style={listItem}>Request correction or deletion of your data.</li>
            <li style={listItem}>Revoke access to connected social media accounts at any time.</li>
            <li style={listItem}>Export a copy of your data.</li>
          </ul>
        </Section>

        <Section title="8. Cookies">
          <p style={bodyText}>
            We use session cookies for authentication purposes only. We do not use tracking cookies or third-party advertising cookies.
          </p>
        </Section>

        <Section title="9. Children's Privacy">
          <p style={bodyText}>
            The Prompt is not directed at children under the age of 13. We do not knowingly collect personal information from children.
          </p>
        </Section>

        <Section title="10. Changes to This Policy">
          <p style={bodyText}>
            We may update this Privacy Policy from time to time. We will notify users of significant changes by posting the updated policy on this page with a revised date.
          </p>
        </Section>

        <Section title="11. Contact">
          <p style={bodyText}>
            If you have questions about this Privacy Policy or wish to exercise your data rights, please contact us at:
          </p>
          <p style={{ ...bodyText, fontWeight: 600, color: '#ffffff' }}>
            hello@theprompt.media
          </p>
        </Section>

      </div>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.08)',
        padding: '24px 40px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        fontSize: 12,
        color: 'rgba(255,255,255,0.62)',
      }}>
        <span>© 2025 The Prompt. All rights reserved.</span>
        <div style={{ display: 'flex', gap: 24 }}>
          <Link href="/privacy" style={{ color: 'rgba(255,255,255,0.62)', textDecoration: 'none' }}>Privacy</Link>
          <Link href="/terms" style={{ color: 'rgba(255,255,255,0.62)', textDecoration: 'none' }}>Terms</Link>
        </div>
      </footer>
    </main>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 40 }}>
      <h2 style={{
        fontSize: 18,
        fontWeight: 600,
        color: '#ffffff',
        marginBottom: 12,
        marginTop: 0,
        letterSpacing: '-0.2px',
      }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

const bodyText: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.75,
  color: 'rgba(255,255,255,0.65)',
  marginBottom: 12,
  marginTop: 0,
}

const listStyle: React.CSSProperties = {
  paddingLeft: 20,
  margin: '8px 0 12px',
}

const listItem: React.CSSProperties = {
  fontSize: 15,
  lineHeight: 1.75,
  color: 'rgba(255,255,255,0.65)',
  marginBottom: 6,
}
