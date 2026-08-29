import React from 'react'
import type {
  DisplayDirection,
  DisplaySetupGrade,
  MarketThesis,
  MarketTradeProposal,
  PositionDisplayInfo,
  PropDisplayState,
  RiskDisplayState,
  SetupState,
} from '@/lib/trading/market-view'
import { proposalIsExecutable } from '@/lib/trading/market-view'
import type { SmtState } from '@/lib/trading/market-view'
import {
  ConfirmationRow,
  CountValue,
  PanelSection,
  PriceValue,
  StatePill,
  UnknownValue,
  ValueRow,
  type StateTone,
} from './primitives'
import styles from './AtlasMarketView.module.css'

/**
 * The four right-rail panels: Market Thesis, Setup, Risk, Proposal — plus Prop
 * Mode and position, which share the rail.
 *
 * Every panel is a pure function of reported state. None of them evaluates a
 * rule: the Risk Engine (Fas 5) owns risk rules, the Prop Engine (Fas 9) owns
 * prop rules, and Risk Canonical v1.0 remains authoritative for both. What is
 * on screen is a rendering of a decision made elsewhere.
 */

const DIRECTION_LABELS: Readonly<Record<DisplayDirection, string>> = {
  LONG: 'LONG',
  SHORT: 'SHORT',
  NEUTRAL: 'NEUTRAL',
}

const DIRECTION_TONES: Readonly<Record<DisplayDirection, StateTone>> = {
  LONG: 'positive',
  SHORT: 'negative',
  NEUTRAL: 'neutral',
}

export function DirectionPill({ direction }: { direction: DisplayDirection }) {
  return <StatePill tone={DIRECTION_TONES[direction]}>{DIRECTION_LABELS[direction]}</StatePill>
}

export function GradeBadge({ grade }: { grade: DisplaySetupGrade }) {
  return (
    <span className={styles.gradeBadge} data-grade={grade}>
      {grade === 'NONE' ? 'INGEN' : grade}
    </span>
  )
}

// ─── Market thesis ────────────────────────────────────────────────────────────

export function ThesisPanel({ thesis }: { thesis: MarketThesis }) {
  return (
    <PanelSection eyebrow="Market Thesis" title="Marknadstes" right={<DirectionPill direction={thesis.bias} />}>
      <p className={styles.thesisHeadline}>{thesis.headline}</p>
      <p className={styles.thesisDetail}>{thesis.detail}</p>
      <dl className={styles.valueList}>
        <ValueRow
          label="Vald 4H-open"
          value={
            thesis.anchoredTo ? (
              <PriceValue value={thesis.anchoredTo.price} />
            ) : (
              <UnknownValue label="Ingen vald" />
            )
          }
          hint={thesis.anchoredTo?.label}
        />
      </dl>
    </PanelSection>
  )
}

// ─── Setup ────────────────────────────────────────────────────────────────────

const SMT_LABELS: Readonly<Record<SmtState, string>> = {
  TRUE: 'BEKRÄFTAD',
  FALSE: 'SAKNAS',
  UNKNOWN: 'OKÄND',
}

const SMT_TONES: Readonly<Record<SmtState, StateTone>> = {
  TRUE: 'positive',
  FALSE: 'negative',
  UNKNOWN: 'unknown',
}

const STAGE_LABELS: Readonly<Record<SetupState['stage'], string>> = {
  NONE: 'INGEN',
  DEVELOPING: 'UTVECKLAS',
  CONFIRMED: 'BEKRÄFTAD',
  INVALIDATED: 'OGILTIG',
  UNKNOWN: 'OKÄND',
}

const STAGE_TONES: Readonly<Record<SetupState['stage'], StateTone>> = {
  NONE: 'neutral',
  DEVELOPING: 'warning',
  CONFIRMED: 'positive',
  INVALIDATED: 'negative',
  UNKNOWN: 'unknown',
}

export function SetupPanel({ setup }: { setup: SetupState }) {
  return (
    <PanelSection
      eyebrow="Setup"
      title="Setup"
      right={<StatePill tone={STAGE_TONES[setup.stage]}>{STAGE_LABELS[setup.stage]}</StatePill>}
    >
      <div className={styles.setupSummary}>
        <DirectionPill direction={setup.direction} />
        <GradeBadge grade={setup.grade} />
        <span className={styles.sessionTag}>
          {setup.session === null ? 'Ingen session' : setup.session === 'LONDON' ? 'London' : 'New York'}
        </span>
      </div>

      <div className={styles.confirmationList}>
        <ConfirmationRow label="Likviditetssweep" state={setup.confirmations.liquiditySweep} />
        <ConfirmationRow label="iFVG" state={setup.confirmations.iFvg} description="1m" />
        <ConfirmationRow label="CISD" state={setup.confirmations.cisd} description="1m" />
        {/*
          SMT keeps its canonical tri-state vocabulary (TRUE / FALSE / UNKNOWN)
          rather than being flattened into PresenceState. The canonical rule —
          SMT may lift A to A+ and can never create a trade — is stated in those
          terms, so the panel renders that vocabulary with the same three-state
          visual language instead of translating it into a second one.
        */}
        <div className={styles.confirmationRow}>
          <div className={styles.confirmationLabel}>
            <span>SMT</span>
            <span className={styles.valueHint}>kan endast lyfta A till A+</span>
          </div>
          <StatePill tone={SMT_TONES[setup.confirmations.smt]}>
            {SMT_LABELS[setup.confirmations.smt]}
          </StatePill>
        </div>
      </div>

      {setup.note ? <p className={styles.panelNote}>{setup.note}</p> : null}
    </PanelSection>
  )
}

// ─── Risk ─────────────────────────────────────────────────────────────────────

const RISK_LABELS: Readonly<Record<RiskDisplayState['status'], string>> = {
  CLEAR: 'KLAR',
  BLOCKED: 'BLOCKERAD',
  NOT_EVALUATED: 'EJ UTVÄRDERAD',
  UNKNOWN: 'OKÄND',
}

const RISK_TONES: Readonly<Record<RiskDisplayState['status'], StateTone>> = {
  CLEAR: 'positive',
  BLOCKED: 'negative',
  NOT_EVALUATED: 'neutral',
  UNKNOWN: 'unknown',
}

export function RiskPanel({ risk }: { risk: RiskDisplayState }) {
  const blocked = risk.status === 'BLOCKED'
  return (
    <PanelSection
      eyebrow="Risk"
      title="Riskläge"
      right={<StatePill tone={RISK_TONES[risk.status]}>{RISK_LABELS[risk.status]}</StatePill>}
    >
      <dl className={styles.valueList}>
        <ValueRow
          label="Föreslagen risk"
          value={<PriceValue value={risk.proposedRisk} suffix="USD" />}
          hint={risk.maxRiskPerTrade ? `tak ${risk.maxRiskPerTrade}` : undefined}
        />
        <ValueRow label="Risk %" value={<PriceValue value={risk.riskPercent} suffix="%" />} />
        <ValueRow label="Stoppavstånd" value={<PriceValue value={risk.stopDistance} />} />
        <ValueRow
          label="Realiserad dagsförlust"
          value={<PriceValue value={risk.dailyRealizedLoss} suffix="USD" />}
          hint={risk.dailyLossLimit ? `gräns ${risk.dailyLossLimit}` : undefined}
          tone={blocked ? 'critical' : 'default'}
        />
        <ValueRow
          label="Reserverad risk"
          value={<PriceValue value={risk.reservedRisk} suffix="USD" />}
          hint="pre-entry-kontroll"
        />
        <ValueRow
          label="Försök"
          value={<CountValue value={risk.attemptsUsed} of={risk.maxAttempts} />}
          tone={blocked ? 'critical' : 'default'}
        />
      </dl>
      {risk.note ? <p className={styles.panelNote} data-tone={blocked ? 'critical' : undefined}>{risk.note}</p> : null}
      <p className={styles.panelFootnote}>
        Visat tillstånd. Risk Engine Specification Canonical v1.0 är auktoritativ; ingen regel
        utvärderas i denna vy.
      </p>
    </PanelSection>
  )
}

// ─── Prop mode ────────────────────────────────────────────────────────────────

const PROP_LABELS: Readonly<Record<PropDisplayState['status'], string>> = {
  NOT_CONFIGURED: 'EJ KONFIGURERAD',
  CLEAR: 'KLAR',
  BLOCKED: 'BLOCKERAD',
  UNKNOWN: 'OKÄND',
}

const PROP_TONES: Readonly<Record<PropDisplayState['status'], StateTone>> = {
  NOT_CONFIGURED: 'neutral',
  CLEAR: 'positive',
  BLOCKED: 'negative',
  UNKNOWN: 'unknown',
}

const POSITION_LABELS: Readonly<Record<PositionDisplayInfo['state'], string>> = {
  FLAT: 'FLAT',
  OPEN: 'ÖPPEN',
  UNKNOWN: 'OKÄND',
}

const POSITION_TONES: Readonly<Record<PositionDisplayInfo['state'], StateTone>> = {
  FLAT: 'neutral',
  OPEN: 'warning',
  UNKNOWN: 'unknown',
}

export function PropPanel({
  prop,
  position,
}: {
  prop: PropDisplayState
  position: PositionDisplayInfo
}) {
  return (
    <PanelSection
      eyebrow="Prop / Position"
      title="Prop Mode"
      right={<StatePill tone={PROP_TONES[prop.status]}>{PROP_LABELS[prop.status]}</StatePill>}
    >
      {prop.note ? <p className={styles.panelNote}>{prop.note}</p> : null}
      <dl className={styles.valueList}>
        <ValueRow
          label="Position"
          value={<StatePill tone={POSITION_TONES[position.state]}>{POSITION_LABELS[position.state]}</StatePill>}
        />
        <ValueRow label="Antal" value={<CountValue value={position.quantity} />} />
        <ValueRow label="Snittpris" value={<PriceValue value={position.averagePrice} />} />
      </dl>
      {position.note ? <p className={styles.panelNote}>{position.note}</p> : null}
      <p className={styles.panelFootnote}>
        GATE-09 är öppen. Ingen PropFirmProfile finns och ingen uppfinns här.
      </p>
    </PanelSection>
  )
}

// ─── Proposal ─────────────────────────────────────────────────────────────────

const PROPOSAL_LABELS: Readonly<Record<MarketTradeProposal['status'], string>> = {
  OBSERVATION_ONLY: 'ENDAST OBSERVATION',
  SIMULATED: 'SIMULERAD',
  NO_EXECUTION_PROVIDER: 'INGEN EXECUTION PROVIDER',
}

/**
 * The proposal panel.
 *
 * There is no buy control, no sell control, no approve control and no send
 * control — not disabled ones, none at all. A disabled button is a button
 * someone can enable in a later edit; the absence of the element is the
 * stronger guarantee, and it is what the tests assert.
 *
 * `proposalIsExecutable` is called and rendered rather than assumed. It is
 * total over `MarketProposalStatus`, which has no executable member, so the
 * banner below cannot silently start claiming something is sendable.
 */
export function ProposalPanel({ proposal }: { proposal: MarketTradeProposal }) {
  const executable = proposalIsExecutable(proposal)

  return (
    <PanelSection
      eyebrow="Proposal"
      title="Trade proposal"
      right={<StatePill tone="unknown">{PROPOSAL_LABELS[proposal.status]}</StatePill>}
    >
      <div className={styles.setupSummary}>
        <DirectionPill direction={proposal.direction} />
        <GradeBadge grade={proposal.grade} />
      </div>

      <dl className={styles.valueList}>
        <ValueRow label="Entry" value={<PriceValue value={proposal.entry} />} />
        <ValueRow label="SL" value={<PriceValue value={proposal.stopLoss} />} />
        <ValueRow label="TP" value={<PriceValue value={proposal.takeProfit} />} />
        <ValueRow label="Break-even" value={<PriceValue value={proposal.breakEven} />} />
        <ValueRow label="R:R" value={<PriceValue value={proposal.riskReward} />} hint="minst 2.0" />
      </dl>

      <p className={styles.panelNote}>{proposal.reason}</p>

      <p
        className={styles.executionBoundary}
        data-executable={executable || undefined}
        data-testid="execution-boundary"
      >
        {executable
          ? 'Fel: förslaget rapporterar sig som körbart. Detta läge ska inte kunna uppstå i Stage 1.'
          : 'Inte körbart. Atlas Market View är presentation och kan inte skicka en order — '
            + 'det finns ingen orderväg i detta bygge.'}
      </p>
    </PanelSection>
  )
}