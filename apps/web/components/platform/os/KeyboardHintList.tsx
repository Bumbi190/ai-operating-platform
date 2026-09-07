// React is imported explicitly, not just `Fragment`: the rail's own suites
// render this through the classic JSX transform, which needs React in scope.
import React, { Fragment } from 'react'
import type { KeyboardHint } from '@/lib/nav/keyboard-hints'
import styles from './KeyboardHints.module.css'

/**
 * The hints themselves — caps and labels, and nothing else.
 *
 * Extracted so there is exactly ONE way a keyboard hint looks in Omnira. The
 * shell's sticky bar renders this, and so does Atlas Home's project rail, which
 * cannot use the bar: Atlas Home is the locked surface and a sticky strip would
 * sit over its composition. Two mounting points, one presentation, one metadata
 * layer — which is what keeps this from becoming a second hint system.
 *
 * Supplemental by construction: the caller marks the container `aria-hidden`,
 * because every shortcut named here works whether or not it is on screen and
 * the controls themselves carry the semantics.
 */
export function KeyboardHintList({ hints }: { hints: readonly KeyboardHint[] }) {
  return (
    <>
      {hints.map((hint) => (
        <span key={`${hint.keys.join('+')}-${hint.label}`} className={styles.hint}>
          <span className={styles.keys}>
            {hint.keys.map((cap, index) => (
              <Fragment key={`${cap}-${index}`}>
                <kbd className={styles.cap}>{cap}</kbd>
              </Fragment>
            ))}
          </span>
          <span className={styles.label}>{hint.label}</span>
        </span>
      ))}
    </>
  )
}
