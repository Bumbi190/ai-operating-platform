import type { ReactNode } from 'react'
import Link from 'next/link'
import { formatDistanceToNow } from 'date-fns'
import { sv } from 'date-fns/locale/sv'
import type {
  SettingsChannel,
  SettingsConfigItem,
  SettingsModel,
  SettingsProject,
  SettingsWarning,
} from '@/lib/os/settings'
import {
  ACCOUNT_NOUNS,
  ACCOUNT_PASSWORD_HREF,
  BINDING_ACTION_LABELS,
  CAPABILITY_NOTES,
  CHANNEL_STATUS_NOTE,
  CREDENTIAL_STATE_LABELS,
  HEALTH_LABELS,
  PLATFORM_CONFIG_NOTE,
  PROJECT_SCOPE_NOTE,
  REPLACEMENT_LOG_NOTE,
  UNATTESTED_NAMES,
  UNKNOWN_LABEL,
  UNREADABLE_LABEL,
  VERIFICATION_LABELS,
  YOUTUBE_CLIENT_MISSING_NOTE,
  YOUTUBE_CONNECT_NOTE,
  YOUTUBE_NOTE,
  type ReplaceableChannelId,
  type YouTubeConnectOutcome,
} from '@/lib/os/settings-shared'
import { SettingsCredentialForm } from './SettingsCredentialForm'
import { SettingsVerifyButton } from './SettingsVerifyButton'
import { SettingsYouTubeConnect } from './SettingsYouTubeConnect'
import styles from './SettingsSurface.module.css'

/**
 * Inställningar — `/settings` in vNext.
 *
 * An operator surface: the account, the display preferences, every project this
 * session owns with its social accounts, and which platform configuration is present.
 * Each project is its own block — Project → Platform → Verified External Account →
 * Credential — so the operator always sees which project a credential belongs to
 * before adding or replacing it, and one project's accounts are never shown, offered
 * or implied for another.
 *
 * It reports what the sources say. An unreadable source says so, an absent
 * verification is "unchecked" rather than healthy, and a name no platform has
 * attested is said to be unverified rather than guessed.
 *
 * CREDENTIALS ARE WRITE-ONLY. A channel's status is metadata; no token is read for it.
 * Adding or replacing a credential is the existing route behind
 * `SettingsCredentialForm`, and "Verifiera nu" is `SettingsVerifyButton`; both are
 * rendered only when the loader's capability allows it, and both name the project.
 *
 * `SettingsYouTubeConnect` starts Google's consent for one project's YouTube channel;
 * the callback's closed answer comes back as `youtubeOutcome`.
 *
 * NOTHING HERE WRITES. The component is a server component; its client children post
 * to the credential, verification and YouTube connection routes and nowhere else.
 */
export function SettingsSurface({ model, displayPreferences, youtubeOutcome = null }: {
  model: SettingsModel
  displayPreferences: ReactNode
  youtubeOutcome?: YouTubeConnectOutcome | null
}) {
  return (
    <div className={styles.field}>
      <div className={styles.ambient} aria-hidden />

      <header className={styles.header}>
        <div className={styles.headline}>
          <p className={styles.eyebrow}>Operatörsyta</p>
          <h1 className={styles.title}>Inställningar</h1>
          <p className={styles.lede}>
            Konto, visning, varje projekts sociala konton och plattformens konfiguration — så som källorna
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
          <ProjectsPanel model={model} youtubeOutcome={youtubeOutcome} />
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

// ── Projekt och sociala konton ───────────────────────────────────────────────

function ProjectsPanel({ model, youtubeOutcome }: { model: SettingsModel; youtubeOutcome: YouTubeConnectOutcome | null }) {
  const { capability, projects } = model
  return (
    <section className={styles.panel} aria-labelledby="settings-projects">
      <SectionHead
        id="settings-projects"
        title="Projekt och sociala konton"
        count={projects.state === 'ok' ? projects.items.length : null}
      />
      <p className={styles.meta}>{PROJECT_SCOPE_NOTE}</p>
      <p className={styles.meta}>{CHANNEL_STATUS_NOTE}</p>
      {youtubeOutcome ? (
        <p className={styles.outcome} role="status" data-kind={youtubeOutcome.kind} data-youtube-outcome={youtubeOutcome.code}>
          <span className={styles.outcomeMessage}>YouTube: {youtubeOutcome.message}</span>
        </p>
      ) : null}
      {!capability.allowed ? (
        <p className={styles.locked} role="note" data-reason={capability.reason}>
          {CAPABILITY_NOTES[capability.reason]}
        </p>
      ) : null}
      {projects.state === 'error' ? (
        <p className={styles.note}>{UNREADABLE_LABEL} — dina projekt kunde inte läsas, vilket inte betyder att de saknar konton.</p>
      ) : projects.items.length === 0 ? (
        <p className={styles.note}>Du äger inga projekt ännu.</p>
      ) : (
        <ul className={styles.projects}>
          {projects.items.map((project) => (
            <ProjectBlock key={project.id} project={project} canAct={capability.allowed} />
          ))}
        </ul>
      )}
      <p className={styles.meta}>{REPLACEMENT_LOG_NOTE}</p>
    </section>
  )
}

function ProjectBlock({ project, canAct }: { project: SettingsProject; canAct: boolean }) {
  const headingId = `settings-project-${project.id}`
  return (
    <li className={styles.project} data-project={project.slug ?? project.id}>
      <div className={styles.projectHead}>
        <h3 id={headingId} className={styles.projectTitle}>{project.name}</h3>
        {project.slug ? <code className={styles.code}>{project.slug}</code> : null}
      </div>
      <ul className={styles.channels} aria-labelledby={headingId}>
        {project.channels.map((channel) => (
          <ChannelCard key={channel.id} project={project} channel={channel} canAct={canAct} />
        ))}
      </ul>
    </li>
  )
}

function ChannelCard({ project, channel, canAct }: { project: SettingsProject; channel: SettingsChannel; canAct: boolean }) {
  const { account, credential, health } = channel
  const bound = account.state === 'bound' ? account.bound : null
  const expiresAt = health.expiresAt ?? credential.expiresAt ?? null
  // YouTube's Y1 binding publishes with the platform's Vercel credential until it is connected to the project.
  const transitional = credential.state === 'environment_transitional' || credential.state === 'environment_incomplete'

  return (
    <li className={styles.channel} data-health={health.readable ? health.status : 'unreadable'} data-account={account.state}>
      <div className={styles.channelHead}>
        <h4 className={styles.channelTitle}>{channel.label}</h4>
        <span className={styles.chip} data-credential={credential.state}>{CREDENTIAL_STATE_LABELS[credential.state]}</span>
      </div>

      <AccountLine channel={channel} />

      <dl className={styles.facts}>
        <Fact label="Verifiering">
          {!health.readable ? (
            <span className={styles.absent}>{UNREADABLE_LABEL}</span>
          ) : (
            <span className={styles.healthValue} data-status={health.status}>
              {HEALTH_LABELS[health.status]}
              {health.daysLeft != null ? ` · ${health.daysLeft} dagar kvar` : ''}
            </span>
          )}
        </Fact>
        <Fact label="Senast kontrollerad">
          {health.checkedAt ? (
            <>
              <Rel iso={health.checkedAt} />
              {health.identityVerified ? ' · konto bekräftat' : ' · konto ej bekräftat'}
            </>
          ) : (
            <span className={styles.absent}>ingen registrerad</span>
          )}
        </Fact>
        <Fact label="Utgår">
          {expiresAt ? <Rel iso={expiresAt} /> : <span className={styles.absent}>ingen utgång registrerad</span>}
        </Fact>
        {channel.replaceable || (channel.id === 'youtube' && !transitional) ? (
          <>
            <Fact label="Senast sparad i Omnira">
              {credential.refreshedAt ? <Rel iso={credential.refreshedAt} /> : <span className={styles.absent}>—</span>}
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

      {channel.id === 'youtube' ? (
        <>
          <p className={styles.meta}>{transitional ? YOUTUBE_NOTE : YOUTUBE_CONNECT_NOTE}</p>
          {canAct && account.state !== 'unreadable' ? (
            <>
              {bound ? (
                <SettingsVerifyButton projectId={project.id} projectName={project.name} platform="youtube" />
              ) : null}
              {channel.connectable ? (
                <SettingsYouTubeConnect
                  projectId={project.id}
                  projectName={project.name}
                  mode={!bound ? 'connect' : transitional ? 'migrate' : 'reconnect'}
                />
              ) : (
                <p className={styles.meta}>{YOUTUBE_CLIENT_MISSING_NOTE}</p>
              )}
            </>
          ) : (
            <p className={styles.readOnly}>Endast läsning</p>
          )}
        </>
      ) : canAct && account.state !== 'unreadable' ? (
        <>
          {bound ? (
            <SettingsVerifyButton projectId={project.id} projectName={project.name} platform={channel.id} />
          ) : null}
          <SettingsCredentialForm
            projectId={project.id}
            projectName={project.name}
            platform={channel.id as ReplaceableChannelId}
            boundAccount={bound ? { id: bound.externalAccountId, label: bound.label } : null}
          />
        </>
      ) : (
        <p className={styles.readOnly}>Endast läsning</p>
      )}
    </li>
  )
}

/** The project's account on the platform: who it is, and how that is known. */
function AccountLine({ channel }: { channel: SettingsChannel }) {
  const noun = ACCOUNT_NOUNS[channel.id]
  if (channel.account.state === 'unreadable') {
    return (
      <p className={styles.accountLine}>
        <span className={styles.accountNoun}>{noun}</span> <span className={styles.absent}>{UNREADABLE_LABEL}</span>
      </p>
    )
  }
  if (channel.account.state === 'none') {
    return (
      <p className={styles.accountLine} data-bound="false">
        <span className={styles.accountNoun}>{noun}</span> <span className={styles.absent}>inget konto kopplat</span>
      </p>
    )
  }
  const { bound } = channel.account
  const name = bound.label ? (channel.id === 'instagram' ? `@${bound.label}` : bound.label) : null
  return (
    <div className={styles.account} data-bound="true" data-verification={bound.verification} data-blocked={bound.blocked}>
      <p className={styles.accountLine}>
        <span className={styles.accountNoun}>{noun}</span>{' '}
        {name ? <span className={styles.accountName}>{name}</span> : <span className={styles.absent}>{UNATTESTED_NAMES[channel.id]}</span>}{' '}
        <code className={styles.code}>{bound.externalAccountId}</code>
      </p>
      <p className={styles.accountMeta}>
        {bound.blocked ? 'Spärrad — plattformen rapporterade ett annat konto' : VERIFICATION_LABELS[bound.verification]}
        {' · '}
        <Rel iso={bound.verifiedAt} />
      </p>
    </div>
  )
}

function ReplacementValue({ channel }: { channel: SettingsChannel }) {
  const { state, at, bindingAction } = channel.lastReplacement
  if (state === 'error') return <span className={styles.absent}>{UNREADABLE_LABEL}</span>
  if (at) {
    return (
      <>
        <Rel iso={at} />
        {bindingAction && BINDING_ACTION_LABELS[bindingAction] ? ` · ${BINDING_ACTION_LABELS[bindingAction]}` : ''}
      </>
    )
  }
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
