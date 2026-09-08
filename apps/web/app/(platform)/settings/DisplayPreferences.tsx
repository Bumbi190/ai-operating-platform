'use client'

import { useDisplayPreferences } from '@/components/platform/os'
import {
  DISPLAY_SCALES,
  DISPLAY_SCALE_LABELS,
  MOTION_PREFERENCES,
  MOTION_PREFERENCE_HINTS,
  MOTION_PREFERENCE_LABELS,
  type DisplayScale,
  type MotionPreference,
} from '@/lib/ui/display-preferences'
import styles from './DisplayPreferences.module.css'

/**
 * Display scale and motion controls.
 *
 * Both are accessibility preferences, so they are built as real radio groups
 * rather than styled buttons: arrow keys move between options, Space/Enter
 * selects, the group is labelled, and the current value is conveyed by the
 * radio state rather than by colour alone.
 *
 * The provider owns storage and the root attributes; this only reads and sets.
 */
function Group<T extends string>({
  legend,
  hint,
  name,
  options,
  value,
  onChange,
  optionHint,
  disabled,
}: {
  legend: string
  hint: string
  name: string
  options: readonly T[]
  value: T
  onChange: (next: T) => void
  optionHint?: Record<T, string>
  disabled?: boolean
}) {
  return (
    <fieldset className={styles.group} disabled={disabled}>
      <legend className={styles.legend}>{legend}</legend>
      <p className={styles.hint}>{hint}</p>
      <div className={styles.options} role="radiogroup" aria-label={legend}>
        {options.map((option) => (
          <label key={option} className={styles.option} data-selected={option === value}>
            <input
              type="radio"
              name={name}
              value={option}
              checked={option === value}
              onChange={() => onChange(option)}
              className={styles.radio}
            />
            <span className={styles.optionLabel}>
              {name === 'omnira-display-scale'
                ? DISPLAY_SCALE_LABELS[option as DisplayScale]
                : MOTION_PREFERENCE_LABELS[option as MotionPreference]}
            </span>
          </label>
        ))}
      </div>
      {optionHint ? <p className={styles.selectedHint}>{optionHint[value]}</p> : null}
    </fieldset>
  )
}

export function DisplayPreferences() {
  const {
    displayScale, setDisplayScale,
    motionPreference, setMotionPreference,
    resolvedMotion, displayScaleAvailable,
  } = useDisplayPreferences()

  return (
    <div className={styles.root}>
      <Group
        legend="Displaystorlek"
        hint={
          displayScaleAvailable
            ? 'Skalar Omniras gränssnitt. Påverkar inte webbläsarens egen zoom.'
            : 'Tillgänglig i vNext-gränssnittet. Legacy renderas i standardstorlek.'
        }
        name="omnira-display-scale"
        options={DISPLAY_SCALES}
        value={displayScale}
        onChange={setDisplayScale}
        disabled={!displayScaleAvailable}
      />

      <Group
        legend="Rörelse"
        hint="Styr animationer i Omnira. Atlas tillstånd förblir läsbara utan rörelse."
        name="omnira-motion"
        options={MOTION_PREFERENCES}
        value={motionPreference}
        onChange={setMotionPreference}
        optionHint={MOTION_PREFERENCE_HINTS}
      />

      {/* The resolved answer, stated plainly — "Följ systemet" is otherwise
          the one choice whose effect the operator cannot see from the control. */}
      <p className={styles.resolved}>
        Aktiv rörelse just nu:{' '}
        <strong className={styles.resolvedValue}>
          {resolvedMotion === 'reduce' ? 'Reducerad' : 'Full'}
        </strong>
      </p>
    </div>
  )
}
