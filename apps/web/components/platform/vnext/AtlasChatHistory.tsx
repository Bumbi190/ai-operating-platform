'use client'

/**
 * Atlas Chat — the operator's conversation history.
 *
 * Grouped as the replaced page grouped it. Deleting goes to the existing
 * `DELETE /api/conversations/[id]` — which removes the messages too — and only
 * after an explicit, inline confirmation. A refused delete says so; the list is
 * refreshed only when the route answered success.
 */

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { DELETE_CONFIRM, DELETE_FAILED, type ChatHistoryGroup } from '@/lib/os/chat-shared'
import styles from './AtlasChat.module.css'

export function AtlasChatHistory({ groups }: { groups: ChatHistoryGroup[] }) {
  const router = useRouter()
  const [confirming, setConfirming] = useState<string | null>(null)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [failed, setFailed] = useState<string | null>(null)

  async function remove(id: string) {
    setDeleting(id)
    setFailed(null)
    try {
      const res = await fetch(`/api/conversations/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        setFailed(id)
        return
      }
      setConfirming(null)
      router.refresh()
    } catch {
      setFailed(id)
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      {groups.map((group) => (
        <section key={group.label} className={styles.group} aria-label={group.label}>
          <h3 className={styles.groupLabel}>{group.label}</h3>
          <ul className={styles.rows}>
            {group.conversations.map((conversation) => {
              const busy = deleting === conversation.id
              const meta = [conversation.projectName, conversation.updatedLabel].filter(Boolean).join(' · ')
              return (
                <li key={conversation.id} className={styles.row} data-deleting={busy ? 'true' : undefined}>
                  <Link href={conversation.href} className={styles.rowLink}>
                    <span className={styles.rowTitle}>{conversation.title}</span>
                    {meta && <span className={styles.rowMeta}>{meta}</span>}
                  </Link>
                  {confirming === conversation.id ? (
                    <div
                      className={styles.confirm}
                      role="group"
                      aria-label="Bekräfta radering"
                      onKeyDown={(event) => { if (event.key === 'Escape' && !busy) setConfirming(null) }}
                    >
                      <span className={styles.confirmText}>{DELETE_CONFIRM}</span>
                      <button type="button" className={styles.danger} onClick={() => void remove(conversation.id)} disabled={busy}>
                        {busy ? 'Raderar …' : 'Radera'}
                      </button>
                      <button type="button" className={styles.quiet} onClick={() => setConfirming(null)} disabled={busy}>
                        Avbryt
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className={styles.delete}
                      aria-label={`Radera ${conversation.title}`}
                      onClick={() => { setFailed(null); setConfirming(conversation.id) }}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  )}
                  {failed === conversation.id && <p className={styles.rowError} role="status">{DELETE_FAILED}</p>}
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </>
  )
}
