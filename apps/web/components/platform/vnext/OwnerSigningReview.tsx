import type { BrokerSettingsModel } from '@/lib/atlas/code-broker/types'
import { ownerSigningReviewPreview } from '@/lib/atlas/model-router/windows-owner-review-preview'
import styles from './OwnerSigningReview.module.css'

/**
 * Preview-only panel on the existing operator settings screen.
 *
 * There is intentionally NO action/button, no network request and no
 * authentication or permission decision here. A future real approval needs
 * a separate authenticated, per-action, CSRF-protected and audited server
 * endpoint; this visual cannot be upgraded into authority by a prop.
 */
export function OwnerSigningReview({ model }: { model: BrokerSettingsModel }) {
  const preview=ownerSigningReviewPreview(model)

  return (
    <section className={styles.root} aria-labelledby="windows-owner-review-title"
      data-owner-consent-mode="read-only" data-review-state={preview.state}>
      <div className={styles.head}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>WINDOWS TPM · SÄKERHETSGRANSKNING</p>
          <h3 className={styles.title} id="windows-owner-review-title">
            Godkännande av enskild signering
          </h3>
          <p className={styles.intro}>Här ska ägaren senare granska exakt vilken
            enhetsregistrering Atlas ber Windows att signera. Funktionen är
            inte aktiverad.</p>
        </div>
        <span className={styles.locked}>Låst · endast granskning</span>
      </div>

      <div className={styles.state} role="status">
        <div className={styles.stateMarker} aria-hidden="true" />
        <div className={styles.stateText}>
          <strong>{preview.title}</strong>
          <p>{preview.description}</p>
        </div>
      </div>

      {preview.operatorSettingsEligible && preview.hostId ? (
        <dl className={styles.facts}>
          <div className={styles.fact}>
            <dt>Registrerad värdreferens</dt>
            <dd>{preview.hostId}</dd>
          </div>
          {preview.expiresAt ? (
            <div className={styles.fact}>
              <dt>Utmaning giltig till (serverns ögonblicksbild)</dt>
              <dd>{preview.expiresAt}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className={styles.gates} aria-label="Villkor före framtida signering">
        <div className={styles.gate}>
          <span className={styles.gateStep}>01</span>
          <div>
            <strong>Verifierat ägarbeslut</strong>
            <span>Separat bekräftelse för en exakt registreringssignatur</span>
          </div>
          <span className={styles.unavailable}>Ej aktivt</span>
        </div>
        <div className={styles.gate}>
          <span className={styles.gateStep}>02</span>
          <div>
            <strong>Skyddad servernyckel och engångskontroll</strong>
            <span>Betrodd utfärdare, byggidentitet och återspelningsskydd</span>
          </div>
          <span className={styles.unavailable}>Ej verifierat</span>
        </div>
        <div className={styles.gate}>
          <span className={styles.gateStep}>03</span>
          <div>
            <strong>Windows signerar endast godkänd utmaning</strong>
            <span>TPM-signerare med låst ändamål och granskad release</span>
          </div>
          <span className={styles.unavailable}>Ej aktiverat</span>
        </div>
      </div>

      <details className={styles.details}>
        <summary>Vad kommer ägaren behöva bekräfta?</summary>
        <p>Enhetens värd-ID, den offentliga TPM-nyckelns fingeravtryck,
          det avsedda kodförrådet, kontrollerad byggversion och
          engångsutmaningens giltighet. Hemliga engångskoder ska aldrig
          kopieras till den här vyn eller loggas i klartext.</p>
        <p>Även ett godkänt signeringsbevis ger bara en väntande broker.
          Aktivering och kodkörning kräver separata beslut och ordinarie
          säkerhets- och budgetkontroller.</p>
      </details>
      <p className={styles.footer}>
        Ingen begäran om godkännande kan skickas härifrån.
        Atlas kan inte signera, registrera enheter eller starta kodjobb
        genom denna vy.
      </p>
    </section>
  )
}
