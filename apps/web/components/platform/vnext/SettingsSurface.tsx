import type { ReactNode } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import type { SettingsChannel, SettingsConfigItem, SettingsModel, SettingsWarning } from '@/lib/os/settings'
import {
  ACCOUNT_PASSWORD_HREF,
  CAPABILITY_NOTES,
  CHANNEL_STATUS_NOTE,
  CREDENTIAL_SOURCE_LABELS,
  PLATFORM_CONFIG_NOTE,
  REPLACEMENT_LOG_NOTE,
  TOKEN_HEALTH_LABELS,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
  YOUTUBE_NOTE,
  type ReplaceableChannelId,
} from '@/lib/os/settings-shared'
import { SettingsCredentialForm } from './SettingsCredentialForm'
import styles from './SettingsSurface.module.css'

/**
 * Inställningar — `/settings` in vNext.
 *
 * An operator surface: the account, the display preferences, each publishing
 * channel's credential status, and which platform configuration is present. It
 * reports what the sources say. An unreadable source says so, an absent check is
 * "unchecked" rather than healthy, and nothing here claims a version, a stack, a
 * model or a roadmap — the page this replaces printed all four from literals.
 *
 * CREDENTIALS ARE WRITE-ONLY. A channel's status is metadata; no token is read
 * for it. Replacement is the existing route behind `SettingsCredentialForm`, which
 * is rendered only when the loader's capability allows it. Otherwise the channel
 * is read-only and says why, in the route's own terms.
 *
 * NOTHING HERE WRITES. The component is a server component; its one client child
 * posts to the existing endpoint and nowhere else.
 */
export function SettingsSurface({ model, displayPreferences }: { model: SettingsModel; displayPreferences: ReactNode }) {
  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Operatörsyta</p>
          <h1 className={styles.title}>Inställningar</h1>
          <p className={styles.lede}>
            Konto, visning, kanalernas publiceringsuppgifter och plattformens konfiguration — så som källorna
            faktiskt anger dem.
          </p>
        </div>
        <p className={styles.stamp}>
          Läst <Rel iso={model.generatedAt} />
        </p>
      </header>

      <WarningsLane warnings={model.warnings} />

      <div className={styles.columns}>
        <div className={styles.column}>
          <ChannelsPanel model={model} />
        </div>
        <div className={styles.column}>
          <AccountPanel model={model} />
          <section className={styles.panel} aria-labelledby="settings-display">
            <SectionHead id="settings-display" title="Visning" />
            {displayPreferences}
          </section>
          <ConfigPanel config={model.config} />
        </div>
      </div>
    </div>
  )
}

/** The skeleton. Distinct from empty and from unreadable: this one says it is reading. */
export function SettingsSurfaceLoading() {
  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden />
      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Operatörsyta</p>
          <h1 className={styles.title}>Inställningar</h1>
        </div>
      </header>
      <p className={styles.note} role="status">Läser inställningarna …</p>
    </div>
  )
}

// ── Warnings ─────────────────────────────────────────────────────────────────

function WarningsLane({ warnings }: { warnings: SettingsWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <section className={styles.warnings} aria-labelledby="settings-warnings">
      <SectionHead id="settings-warnings" title="Kräver uppmärksamhet" count={warnings.length} />
      <ul className={styles.warningList}>
        {warnings.map((warning) => (
          <li key={warning.id} className={styles.warning} data-tone={warning.tone}>
            <span className={styles.warningTitle}>{warning.title}</span>
            {warning.detail ? <span className={styles.warningDetail}>{warning.detail}</span> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

// ── Kanaler ──────────────────────────────────────────────────────────────────

function ChannelsPanel({ model }: { model: SettingsModel }) {
  const { capability } = model
  return (
    <section className={styles.panel} aria-labelledby="settings-channels">
      <SectionHead id="settings-channels" title="Kanaler" count={model.channels.length} />
      <p className={styles.meta}>{CHANNEL_STATUS_NOTE}</p>
      {!capability.allowed ? (
        <p className={styles.locked} role="note" data-reason={capability.reason}>
          {CAPABILITY_NOTES[capability.reason]}
        </p>
      ) : null}
      <ul className={styles.channels}>
        {model.channels.map((channel) => (
          <ChannelCard key={channel.id} channel={channel} canReplace={capability.allowed} />
        ))}
      </ul>
      <p className={styles.meta}>{REPLACEMENT_LOG_NOTE}</p>
    </section>
  )
}

function ChannelCard({ channel, canReplace }: { channel: SettingsChannel; canReplace: boolean }) {
  const { health } = channel
  const expiresAt = health.expiresAt ?? channel.stored?.expiresAt ?? null
  return (
    <li className={styles.channel} data-health={health.readable ? health.status : 'unreadable'}>
      <div className={styles.channelHead}>
        <h3 className={styles.channelTitle}>{channel.label}</h3>
        <span className={styles.chip} data-source={channel.source}>{CREDENTIAL_SOURCE_LABELS[channel.source]}</span>
      </div>

      <dl className={styles.facts}>
        <Fact label="Token-kontroll">
          {!health.readable ? (
            <span className={styles.absent}>{UNREADABLE_LABEL}</span>
          ) : (
            <span className={styles.healthValue} data-status={health.status}>
              {TOKEN_HEALTH_LABELS[health.status]}
              {health.daysLeft != null ? ` · ${health.daysLeft} dagar kvar` : ''}
            </span>
          )}
        </Fact>
        <Fact label="Senast kontrollerad">
          {health.lastVerifiedAt ? <Rel iso={health.lastVerifiedAt} /> : <span className={styles.absent}>ingen registrerad</span>}
        </Fact>
        <Fact label="Utgår">
          {expiresAt ? <Rel iso={expiresAt} /> : <span className={styles.absent}>ingen utgång registrerad</span>}
        </Fact>
        {channel.replaceable ? (
          <>
            <Fact label="Senast sparad i Omnira">
              {channel.stored?.refreshedAt ? <Rel iso={channel.stored.refreshedAt} /> : <span className={styles.absent}>—</span>}
            </Fact>
            <Fact label="Senast ersatt här">
              <ReplacementValue channel={channel} />
            </Fact>
          </>
        ) : (
          <Fact label="Senast förnyad">
            {health.lastRefreshedAt ? <Rel iso={health.lastRefreshedAt} /> : <span className={styles.absent}>ingen registrerad</span>}
          </Fact>
        )}
      </dl>

      {!channel.replaceable ? (
        <p className={styles.meta}>{YOUTUBE_NOTE}</p>
      ) : canReplace ? (
        <SettingsCredentialForm platform={channel.id as ReplaceableChannelId} />
      ) : (
        <p className={styles.readOnly}>Endast läsning</p>
      )}
    </li>
  )
}

function ReplacementValue({ channel }: { channel: SettingsChannel }) {
  const { state, at } = channel.lastReplacement
  if (state === 'error') return <span className={styles.absent}>{UNREADABLE_LABEL}</span>
  if (state === 'not_read') return <span className={styles.absent}>läses inte utan behörighet</span>
  if (at) return <Rel iso={at} />
  return <span className={styles.absent}>ingen registrerad</span>
}

// ── Konto ────────────────────────────────────────────────────────────────────

function AccountPanel({ model }: { model: SettingsModel }) {
  const { account } = model
  return (
    <section className={styles.panel} aria-labelledby="settings-account">
      <SectionHead id="settings-account" title="Konto" />
      <dl className={styles.pairs}>
        <Pair label="E-post">{account.email ?? <span className={styles.absent}>{UNKNOWN_LABEL}</span>}</Pair>
        <Pair label="Konto-ID"><code className={styles.code}>{account.userId}</code></Pair>
        <Pair label="Inloggning">{account.signInMethod}</Pair>
      </dl>
      {ACCOUNT_PASSWORD_HREF ? (
        <p className={styles.meta}>
          <Link href={ACCOUNT_PASSWORD_HREF} className={styles.inlineLink}>Byt lösenord</Link>
        </p>
      ) : null}
    </section>
  )
}

// ── Plattformskonfiguration ──────────────────────────────────────────────────

function ConfigPanel({ config }: { config: SettingsConfigItem[] }) {
  return (
    <section className={styles.panel} aria-labelledby="settings-config">
      <SectionHead id="settings-config" title="Plattformskonfiguration" />
      <p className={styles.meta}>{PLATFORM_CONFIG_NOTE}</p>
      <ul className={styles.rows}>
        {config.map((item) => {
          const presence = item.set === item.vars.length ? 'set' : item.set === 0 ? 'missing' : 'partial'
          return (
            <li key={item.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowTitle}>{item.label}</span>
                <span className={styles.rowMeta}>{item.purpose}</span>
              </div>
              <span className={styles.chip} data-presence={presence}>
                {presence === 'set' ? 'Satt' : presence === 'missing' ? 'Saknas' : `Delvis · ${item.set} av ${item.vars.length}`}
              </span>
            </li>
          )
        })}
      </ul>
      <details className={styles.diagnostics}>
        <summary className={styles.diagnosticsSummary}>Variabler som kontrolleras</summary>
        <ul className={styles.varList}>
          {config.flatMap((item) => item.vars).map((name) => (
            <li key={name}><code className={styles.code}>{name}</code></li>
          ))}
        </ul>
      </details>
    </section>
  )
}

// ── Small parts ──────────────────────────────────────────────────────────────

function SectionHead({ id, title, count }: { id: string; title: string; count?: number | null }) {
  return (
    <div className={styles.sectionHead}>
      <h2 id={id} className={styles.sectionTitle}>{title}</h2>
      {count != null ? <span className={styles.count}>{count}</span> : null}
    </div>
  )
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.pair}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  )
}

function Rel({ iso }: { iso: string }) {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return <span>{UNKNOWN_LABEL.toLowerCase()} tidpunkt</span>
  return <time dateTime={iso} title={iso}>{formatDistanceToNow(at, { addSuffix: true, locale: sv })}</time>
}
