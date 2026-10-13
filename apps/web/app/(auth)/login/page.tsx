'use client'

import { Suspense, useState, type FormEvent } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { ArrowRight, Check, Eye, EyeOff, Fingerprint, KeyRound, LockKeyhole, Mail, ShieldCheck } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import styles from './login.module.css'

/**
 * Presentation-only refresh of the existing Supabase sign-in flow.
 * Password and OTP routing are intentionally unchanged.
 */
function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const urlError = searchParams.get('error')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(urlError)
  const [magicMode, setMagicMode] = useState(false)
  const [magicSent, setMagicSent] = useState(false)
  const [passwordVisible, setPasswordVisible] = useState(false)

  const supabase = createClient()

  async function handlePasswordLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password })
    if (loginError) {
      // Never distinguish between an unknown user and an invalid password.
      setError('Fel e-post eller lösenord.')
      setLoading(false)
      return
    }
    router.push('/atlas')
  }

  async function handleMagicLink(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: window.location.origin + '/auth/confirm',
        // No account provisioning from a login-only form.
        shouldCreateUser: false,
      },
    })

    if (otpError) {
      setError(otpError.message)
    } else {
      setMagicSent(true)
    }
    setLoading(false)
  }

  function switchMode(next: boolean) {
    setMagicMode(next)
    setError(null)
  }

  return (
    <main className={styles.page}>
      <div className={styles.shell}>
        <section className={styles.showcase} aria-label="Välkommen till Omnira">
          <div className={styles.brand}>
            <span className={styles.brandMark}>
              <Image src="/omnira-favicon.svg" alt="" width={38} height={38} priority />
            </span>
            <span className={styles.brandWords}>
              <span className={styles.brandName}>OMNIRA</span>
              <span className={styles.brandSub}>AI OPERATING SYSTEM</span>
            </span>
          </div>

          <div className={styles.showcaseContent}>
            <span className={styles.eyebrow}><span className={styles.liveDot} /> YOUR INTELLIGENCE COMMAND CENTER</span>
            <h1 className={styles.headline}>Från insikt<br />till <span>handling.</span></h1>
            <p className={styles.showcaseDescription}>
              Samla projekt, intelligens och arbetsflöden i ett operativsystem.
              Atlas hjälper dig att analysera, prioritera och hålla riktningen.
            </p>

            <div className={styles.atlasVisual} aria-hidden="true">
              <div className={styles.axis} />
              <div className={styles.orbitOne} />
              <div className={styles.orbitTwo} />
              <div className={styles.orbitThree} />
              <div className={styles.orbHalo}>
                <div className={styles.orbPulse}>
                  <Image
                    src="/atlas-orb-login-masked.png"
                    alt=""
                    fill
                    sizes="(max-width: 800px) 1px, (max-width: 948px) 275px, (max-width: 1552px) 29vw, 450px"
                    className={styles.orbImage}
                    priority
                  />
                </div>
              </div>
              <div className={styles.orbLabel}>A T L A S</div>
            </div>

            <div className={styles.capabilities} aria-label="Omniras arbetsområden">
              <span>PROJEKT</span>
              <span>INTELLIGENS</span>
              <span>GRANSKNING</span>
            </div>
          </div>
          <p className={styles.showcaseFooter}>OMNIRA OS <span aria-hidden="true">/</span> MÄNNISKAN HAR SISTA ORDET</p>
        </section>

        <section className={styles.authPanel} aria-label="Logga in i Omnira">
          <div className={styles.mobileBrand}>
            <Image src="/omnira-favicon.svg" alt="" width={36} height={36} priority />
            <div><strong>OMNIRA</strong><span>AI OPERATING SYSTEM</span></div>
          </div>
          <div className={styles.loginBox}>
            <span className={styles.panelEyebrow}><span className={styles.panelDot} /> SÄKER ÅTKOMST</span>
            {magicSent ? (
              <div className={styles.successPanel} role="status">
                <span className={styles.successIcon}><Mail size={25} aria-hidden="true" /></span>
                <h2 className={styles.title}>Kolla din inbox</h2>
                <p className={styles.subtitle}>
                  Vi skickade en inloggningslänk till <strong className={styles.emailValue}>{email}</strong>.
                </p>
                <p className={styles.hint}>Öppna länken på samma enhet för att fortsätta.</p>
                <button type="button" className={styles.secondaryButton} onClick={() => { setMagicSent(false); switchMode(false) }}>
                  Tillbaka till lösenord
                </button>
              </div>
            ) : (
              <>
                <h2 className={styles.title}>{magicMode ? 'Logga in med e-postlänk' : 'Välkommen tillbaka'}</h2>
                <p className={styles.subtitle}>
                  {magicMode ? 'Få en säker inloggningslänk skickad till din inkorg.' : 'Logga in för att öppna din arbetsyta i Omnira.'}
                </p>

                <form onSubmit={magicMode ? handleMagicLink : handlePasswordLogin} className={styles.form}>
                  <div className={styles.field}>
                    <label htmlFor="omnira-login-email">E-postadress</label>
                    <div className={styles.inputWrap}>
                      <Mail size={18} aria-hidden="true" className={styles.fieldIcon} />
                      <input
                        id="omnira-login-email"
                        type="email"
                        name="email"
                        autoComplete="email"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="du@foretag.se"
                        required
                        disabled={loading}
                      />
                    </div>
                  </div>

                  {!magicMode && (
                    <div className={styles.field}>
                      <div className={styles.labelRow}>
                        <label htmlFor="omnira-login-password">Lösenord</label>
                        <Link href="/forgot-password" className={styles.inlineLink}>Glömt lösenord?</Link>
                      </div>
                      <div className={styles.inputWrap}>
                        <LockKeyhole size={18} aria-hidden="true" className={styles.fieldIcon} />
                        <input
                          id="omnira-login-password"
                          type={passwordVisible ? 'text' : 'password'}
                          name="password"
                          autoComplete="current-password"
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Ditt lösenord"
                          required
                          disabled={loading}
                        />
                        <button
                          type="button"
                          className={styles.eyeButton}
                          onClick={() => setPasswordVisible(v => !v)}
                          aria-label={passwordVisible ? 'Dölj lösenord' : 'Visa lösenord'}
                          aria-pressed={passwordVisible}
                        >
                          {passwordVisible ? <EyeOff size={19} aria-hidden="true" /> : <Eye size={19} aria-hidden="true" />}
                        </button>
                      </div>
                    </div>
                  )}

                  {error && <p className={styles.error} role="alert">{error}</p>}

                  <button className={styles.submitButton} type="submit" disabled={loading}>
                    {loading ? (magicMode ? 'Skickar länken…' : 'Loggar in…') : magicMode ? 'Skicka inloggningslänk' : 'Öppna Omnira'}
                    {!loading && <ArrowRight size={18} aria-hidden="true" />}
                  </button>
                </form>

                <div className={styles.divider}><span>ELLER</span></div>
                <button type="button" className={styles.switchButton} onClick={() => switchMode(!magicMode)} disabled={loading}>
                  {magicMode ? <KeyRound size={17} aria-hidden="true" /> : <Mail size={17} aria-hidden="true" />}
                  {magicMode ? 'Logga in med lösenord' : 'Logga in med e-postlänk'}
                </button>
              </>
            )}
            <div className={styles.trustRow}>
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Privat arbetsyta. Åtkomst enligt dina behörigheter.</span>
            </div>
          </div>

          <div className={styles.rightFooter}>
            <span><Fingerprint size={14} aria-hidden="true" /> OPERATÖRSÅTKOMST</span>
            <span><Check size={14} aria-hidden="true" /> OMNIRA OS</span>
          </div>
        </section>
      </div>
    </main>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className={styles.loading} role="status">Laddar inloggningen…</div>}>
      <LoginForm />
    </Suspense>
  )
}
