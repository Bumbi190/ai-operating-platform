'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { BrokerEnrollmentPackage, BrokerSettingsModel, StoredBroker } from '@/lib/atlas/code-broker/types'
import styles from './SettingsSurface.module.css'

const STATUS: Record<StoredBroker['status'], string> = {
  pending: 'Väntar på godkännande', active: 'Godkänd', revoked: 'Återkallad', lost: 'Förlorad', retired: 'Avslutad',
}

export function SettingsBrokerPanel({ model }: { model: BrokerSettingsModel }) {
  const router = useRouter()
  const [enrollment, setEnrollment] = useState<BrokerEnrollmentPackage | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  async function action(name: string, url: string, body?: unknown) {
    setBusy(name); setMessage(null)
    try {
      const response = await fetch(url, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      const result = await response.json() as { enrollment?: BrokerEnrollmentPackage; error?: string }
      if (!response.ok) throw new Error('rejected')
      if (result.enrollment) setEnrollment(result.enrollment)
      setMessage(result.enrollment ? 'Enrollmentpaketet visas en gång nedan.' : 'Brokerstatus uppdaterad.')
      router.refresh()
    } catch {
      setMessage('Åtgärden kunde inte genomföras. Ingen brokerstatus har antagits.')
    } finally { setBusy(null) }
  }

  return (
    <section className={styles.panel} aria-labelledby="settings-broker">
      <div className={styles.sectionHead}>
        <h2 id="settings-broker" className={styles.sectionTitle}>Lokal kodbroker</h2>
        <span className={styles.count}>{model.brokers.length}</span>
      </div>
      <p className={styles.meta}>Identitet och uttryckligt godkännande. Ingen kodkörning, repoåtkomst eller online-status ingår.</p>

      {!model.readable ? <p className={styles.note}>Brokerregistret kunde inte läsas. Det betyder inte att det är tomt.</p> : null}
      {!model.capability.allowed ? (
        <p className={styles.locked}>Endast den konfigurerade plattformsoperatören kan hantera en broker.</p>
      ) : model.readable && model.brokers.length === 0 && !model.openEnrollment ? (
        <p className={styles.note}>Ingen broker konfigurerad.</p>
      ) : null}

      {model.openEnrollment ? (
        <article className={styles.brokerCard} data-broker-state="enrollment">
          <div className={styles.channelHead}>
            <h3 className={styles.channelTitle}>Enrollment väntar</h3>
            <span className={styles.chip}>Ej verifierad</span>
          </div>
          <dl className={styles.facts}>
            <BrokerFact label="Host-ID" value={model.openEnrollment.hostId} mono />
            <BrokerFact label="Går ut" value={model.openEnrollment.expiresAt} />
          </dl>
        </article>
      ) : null}

      {model.brokers.map((broker) => (
        <BrokerCard key={broker.brokerId} broker={broker} busy={busy} action={action} />
      ))}

      {model.capability.allowed && !model.openEnrollment && !model.brokers.some(b => b.status === 'pending' || b.status === 'active') ? (
        <button className={`${styles.primary} ${styles.brokerStart}`} disabled={busy !== null} onClick={() => action('start', '/api/atlas/code-brokers/enrollments')}>
          {busy === 'start' ? 'Startar …' : 'Starta enrollment'}
        </button>
      ) : null}

      {enrollment ? (
        <div className={styles.enrollmentPackage} role="status">
          <strong>Engångspaket · kopiera nu</strong>
          <p>Utgår {enrollment.expiresAt}. Challenge och pairing code lagras inte i klartext av servern.</p>
          <pre>{JSON.stringify(enrollment, null, 2)}</pre>
        </div>
      ) : null}
      {message ? <p className={styles.outcome} role="status">{message}</p> : null}
    </section>
  )
}

function BrokerCard({ broker, busy, action }: {
  broker: StoredBroker
  busy: string | null
  action: (name: string, url: string, body?: unknown) => Promise<void>
}) {
  const terminal = ['revoked', 'lost', 'retired'].includes(broker.status)
  return (
    <article className={styles.brokerCard} data-broker-state={broker.status}>
      <div className={styles.channelHead}>
        <h3 className={styles.channelTitle}>{broker.hostLabel}</h3>
        <span className={styles.chip}>{STATUS[broker.status]}</span>
      </div>
      <dl className={styles.facts}>
        <BrokerFact label="Fingerprint" value={broker.keyThumbprint} mono />
        <BrokerFact label="Host-ID" value={broker.hostId} mono />
        <BrokerFact label="Protokoll" value={`v${broker.protocolVersion} · ${broker.algorithm}`} />
        <BrokerFact label="Broker" value={`${broker.brokerVersion} · ${broker.buildSha256}`} mono />
        <BrokerFact label="Tillåtet repo" value={broker.allowedRepositoryIds.join(', ')} mono />
        <BrokerFact label="Enrollment" value={broker.createdAt} />
        {broker.approvedAt ? <BrokerFact label="Godkänd" value={broker.approvedAt} /> : null}
        {broker.revokedAt ? <BrokerFact label={broker.status === 'lost' ? 'Markerad förlorad' : 'Återkallad'} value={broker.revokedAt} /> : null}
      </dl>
      {broker.revokedReason ? <p className={styles.meta}>Orsak: {broker.revokedReason}</p> : null}
      {!terminal ? (
        <div className={styles.brokerActions}>
          {broker.status === 'pending' ? (
            <button className={styles.primary} disabled={busy !== null} onClick={() => action(`approve-${broker.brokerId}`, `/api/atlas/code-brokers/${broker.brokerId}/approve`)}>Godkänn</button>
          ) : null}
          <button className={styles.secondary} disabled={busy !== null} onClick={() => action(`revoke-${broker.brokerId}`, `/api/atlas/code-brokers/${broker.brokerId}/revoke`)}>Återkalla</button>
          <button className={styles.secondary} disabled={busy !== null} onClick={() => action(`lost-${broker.brokerId}`, `/api/atlas/code-brokers/${broker.brokerId}/lost`)}>Markera förlorad</button>
        </div>
      ) : null}
    </article>
  )
}

function BrokerFact({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className={styles.fact}><dt>{label}</dt><dd className={mono ? styles.code : undefined}>{value}</dd></div>
}
