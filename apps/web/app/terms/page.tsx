import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Terms of Service — The Prompt',
  description: 'Terms of Service for The Prompt AI news platform.',
}

export default function TermsPage() {
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
          Terms of Service
        </span>
      </header>

      {/* Content */}
      <div style={{ maxWidth: 720, margin: '0 auto', padding: '72px 40px 120px' }}>

        <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.62)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 16 }}>
          Last updated: May 2025
        </p>

        <h1 style={{ fontSize: 40, fontWeight: 700, lineHeight: 1.15, marginBottom: 40, letterSpacing: '-0.5px' }}>
          Terms of Service
        </h1>

        <p style={bodyText}>
          These Terms of Service (&quot;Terms&quot;) govern your access to and use of The Prompt platform (&quot;Service&quot;), operated by The Prompt Media. By accessing or using the Service, you agree to be bound by these Terms.
        </p>

        <Section title="1. Description of Service">
          <p style={bodyText}>
            The Prompt is an AI-powered media automation platform that generates short-form video content about artificial intelligence news and developments. The platform uses AI models to write scripts, generate voiceovers, create images, and produce videos for distribution on social media platforms including TikTok and Instagram.
          </p>
        </Section>

        <Section title="2. Eligibility">
          <p style={bodyText}>
            You must be at least 18 years of age to use this Service. By using the Service, you represent and warrant that you meet this requirement and have the legal authority to agree to these Terms.
          </p>
        </Section>

        <Section title="3. AI-Generated Content Disclaimer">
          <p style={bodyText}>
            All video scripts, voiceovers, images, and media produced by the Service are generated using artificial intelligence. While we strive for factual accuracy and journalistic integrity:
          </p>
          <ul style={listStyle}>
            <li style={listItem}>AI-generated content may contain errors, omissions, or inaccuracies. Users are responsible for reviewing all content before publishing.</li>
            <li style={listItem}>The Prompt does not guarantee the accuracy, completeness, or timeliness of AI-generated scripts or news summaries.</li>
            <li style={listItem}>AI-generated images are synthetic and do not depict real people, events, or locations.</li>
            <li style={listItem}>Content should not be relied upon as professional advice of any kind.</li>
          </ul>
        </Section>

        <Section title="4. Third-Party Platform Integrations">
          <p style={bodyText}>
            The Service enables publishing to third-party platforms including TikTok and Instagram. By connecting these accounts:
          </p>
          <ul style={listStyle}>
            <li style={listItem}>You grant us permission to publish content to those platforms on your behalf.</li>
            <li style={listItem}>You are responsible for ensuring your use complies with each platform&apos;s own Terms of Service and Community Guidelines.</li>
            <li style={listItem}>You may revoke this access at any time through your account settings.</li>
          </ul>
        </Section>

        <Section title="5. No Liability for Third-Party Platform Outages">
          <p style={bodyText}>
            The Prompt is not responsible for outages, disruptions, API changes, or policy updates by third-party platforms including TikTok, Instagram, Meta, Anthropic, ElevenLabs, or any other service provider we integrate with. Service interruptions caused by third-party platforms are outside our control and do not constitute a breach of these Terms.
          </p>
        </Section>

        <Section title="6. Acceptable Use">
          <p style={bodyText}>You agree not to use the Service to:</p>
          <ul style={listStyle}>
            <li style={listItem}>Generate or distribute false, misleading, defamatory, or harmful content.</li>
            <li style={listItem}>Violate any applicable laws, regulations, or third-party platform policies.</li>
            <li style={listItem}>Infringe the intellectual property rights of others.</li>
            <li style={listItem}>Attempt to circumvent security measures or access the platform in unauthorized ways.</li>
            <li style={listItem}>Use the platform to generate content targeting or harassing individuals.</li>
          </ul>
        </Section>

        <Section title="7. Intellectual Property">
          <p style={bodyText}>
            Content you generate using the Service — including scripts, videos, and images — is owned by you, subject to any limitations imposed by applicable AI service provider terms. The Prompt brand, platform design, and underlying technology remain our intellectual property.
          </p>
        </Section>

        <Section title="8. Limitation of Liability">
          <p style={bodyText}>
            To the fullest extent permitted by law, The Prompt and its operators shall not be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service, including but not limited to: loss of revenue, loss of data, reputational damage, or service interruptions.
          </p>
          <p style={bodyText}>
            Our total liability to you for any claims arising under these Terms shall not exceed the amount you paid us in the twelve months preceding the claim.
          </p>
        </Section>

        <Section title="9. Disclaimers">
          <p style={bodyText}>
            The Service is provided &quot;as is&quot; and &quot;as available&quot; without warranties of any kind, either express or implied, including but not limited to warranties of merchantability, fitness for a particular purpose, or non-infringement. We do not warrant that the Service will be uninterrupted, error-free, or free of harmful components.
          </p>
        </Section>

        <Section title="10. Account Termination">
          <p style={bodyText}>
            We reserve the right to suspend or terminate accounts that violate these Terms, at our sole discretion. You may delete your account at any time by contacting us. Upon termination, your data will be retained for up to 30 days before deletion.
          </p>
        </Section>

        <Section title="11. Modifications to Terms">
          <p style={bodyText}>
            We may update these Terms from time to time. Continued use of the Service after changes are posted constitutes acceptance of the updated Terms. We will notify users of material changes via email or a notice on the platform.
          </p>
        </Section>

        <Section title="12. Governing Law">
          <p style={bodyText}>
            These Terms are governed by the laws of Sweden, without regard to conflict of law principles. Any disputes arising under these Terms shall be subject to the exclusive jurisdiction of the courts of Sweden.
          </p>
        </Section>

        <Section title="13. Contact">
          <p style={bodyText}>
            For questions about these Terms, please contact us at:
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
