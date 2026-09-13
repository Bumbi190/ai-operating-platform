/**
 * Atlas Chat — the chat home.
 *
 * A server component. The question comes first: a composer and the executive
 * starters the replaced page offered, which open a new conversation and send the
 * question through `?send=`. The operator's own conversations follow, grouped by
 * recency, each deletable after an explicit confirmation.
 *
 * The launcher and the history are the only client code; this file handles no
 * event and states nothing it did not read.
 */

import {
  EMPTY_HISTORY,
  HISTORY_UNREADABLE,
  HOME_LEDE,
  historyCountLabel,
  type ChatHomeModel,
} from '@/lib/os/chat-shared'
import { AtlasChatLauncher } from './AtlasChatLauncher'
import { AtlasChatHistory } from './AtlasChatHistory'
import styles from './AtlasChat.module.css'

export function AtlasChatHome({ model }: { model: ChatHomeModel }) {
  return (
    <div className={styles.field}>
      <div className={styles.column}>
        <header className={styles.homeHeader}>
          <p className={styles.eyebrow}>Atlas · Chat</p>
          <h1 className={styles.homeTitle}>
            {model.operatorName ? `Vad kan jag hjälpa dig med, ${model.operatorName}?` : 'Vad kan jag hjälpa dig med?'}
          </h1>
          <p className={styles.lede}>{HOME_LEDE}</p>
        </header>

        <AtlasChatLauncher chatBase={model.chatBase} />

        <section className={styles.history} aria-labelledby="atlas-chat-history" data-state={model.state}>
          <div className={styles.sectionHead}>
            <h2 id="atlas-chat-history" className={styles.sectionTitle}>Tidigare konversationer</h2>
            {model.state === 'ok' && model.total > 0 && (
              <span className={styles.count}>{historyCountLabel(model.total, model.capped)}</span>
            )}
          </div>
          {model.state === 'error' ? (
            <p className={styles.blocked} role="note">{HISTORY_UNREADABLE}</p>
          ) : model.total === 0 ? (
            <p className={styles.empty}>{EMPTY_HISTORY}</p>
          ) : (
            <AtlasChatHistory groups={model.groups} />
          )}
        </section>
      </div>
    </div>
  )
}

export function AtlasChatHomeLoading() {
  return (
    <div className={styles.field}>
      <div className={styles.column}>
        <header className={styles.homeHeader}>
          <p className={styles.eyebrow}>Atlas · Chat</p>
          <h1 className={styles.homeTitle}>Vad kan jag hjälpa dig med?</h1>
          <p className={styles.lede}>Läser dina konversationer…</p>
        </header>
      </div>
    </div>
  )
}
