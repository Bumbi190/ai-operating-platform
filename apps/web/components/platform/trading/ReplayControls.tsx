import React from 'react'
import {
  PLAYBACK_SPEEDS,
  isAtEnd,
  isAtStart,
  replayProgress,
  type PlaybackSpeed,
  type ReplayCursor,
  type ReplayEvent,
} from '@/lib/trading/replay'
import styles from './AtlasMarketView.module.css'

/**
 * Replay transport.
 *
 * Development UI, not the future graph-first terminal. It exists to prove the
 * replay engine works and to make the cursor visible; the proper design pass
 * comes when real data flows.
 *
 * The time shown is MARKET time — the instant of the event under the cursor —
 * never the browser's clock. Those are different clocks and this surface says
 * which one it is showing.
 */

export interface ReplayControlsProps {
  cursor: ReplayCursor
  events: readonly ReplayEvent[]
  /** Market time at the cursor, already rendered by the Time Foundation. */
  marketTimeLabel: string
  marketZoneLabel: string
  onPlayPause: () => void
  onStepBackward: () => void
  onStepForward: () => void
  onReset: () => void
  onSeek: (position: number) => void
  onSpeed: (speed: PlaybackSpeed) => void
}

export function ReplayControls({
  cursor,
  events,
  marketTimeLabel,
  marketZoneLabel,
  onPlayPause,
  onStepBackward,
  onStepForward,
  onReset,
  onSeek,
  onSpeed,
}: ReplayControlsProps) {
  const atEnd = isAtEnd(cursor, events)
  const atStart = isAtStart(cursor)
  const progress = replayProgress(cursor, events)
  // -1 is a real position: before the first event, nothing has been observed.
  const stepLabel = cursor.position < 0 ? 'start' : String(cursor.position + 1)

  return (
    <section className={styles.replayBar} aria-label="Replay" data-testid="replay-controls">
      <div className={styles.replayTransport} role="group" aria-label="Replay-kontroller">
        <button
          type="button"
          className={styles.replayButton}
          onClick={onReset}
          disabled={atStart}
          aria-label="Återställ replay"
          data-testid="replay-reset"
        >
          ⏮
        </button>
        <button
          type="button"
          className={styles.replayButton}
          onClick={onStepBackward}
          disabled={atStart}
          aria-label="Föregående steg"
          data-testid="replay-prev"
        >
          ◀
        </button>
        <button
          type="button"
          className={styles.replayButton}
          data-primary="true"
          onClick={onPlayPause}
          disabled={atEnd}
          aria-pressed={cursor.playing}
          aria-label={cursor.playing ? 'Pausa replay' : 'Spela replay'}
          data-testid="replay-playpause"
        >
          {cursor.playing ? '❚❚' : '▶'}
        </button>
        <button
          type="button"
          className={styles.replayButton}
          onClick={onStepForward}
          disabled={atEnd}
          aria-label="Nästa steg"
          data-testid="replay-next"
        >
          ▶
        </button>
      </div>

      <label className={styles.replayScrubber}>
        <span className={styles.srOnly}>Replay-position</span>
        <input
          type="range"
          min={-1}
          max={Math.max(events.length - 1, 0)}
          step={1}
          value={cursor.position}
          onChange={(event) => onSeek(Number(event.target.value))}
          aria-valuetext={`Steg ${stepLabel} av ${events.length}`}
          data-testid="replay-scrubber"
        />
      </label>

      <div className={styles.replayReadout} data-testid="replay-readout">
        <span className={styles.replayStep}>
          {stepLabel} / {events.length}
        </span>
        <span className={styles.replayProgress}>{Math.round(progress * 100)}%</span>
        <span className={styles.replayClock}>
          {marketTimeLabel}
          {/*
            Named explicitly. A replay clock that looked like a wall clock would
            invite exactly the confusion the market/wall split exists to prevent.
          */}
          <span className={styles.replayClockLabel}>marknadstid · {marketZoneLabel}</span>
        </span>
      </div>

      <div className={styles.replaySpeeds} role="group" aria-label="Uppspelningshastighet">
        {PLAYBACK_SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={styles.replaySpeed}
            aria-pressed={cursor.speed === speed}
            data-active={cursor.speed === speed || undefined}
            onClick={() => onSpeed(speed as PlaybackSpeed)}
          >
            {speed}×
          </button>
        ))}
      </div>
    </section>
  )
}
