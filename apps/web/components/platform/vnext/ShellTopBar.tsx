'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useId, useRef, useState } from 'react'
import { Bell, LogOut, Search, Settings } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useDismissOnOutside } from './useDismissOnOutside'
import { useAtlas } from '@/lib/atlas/runtime'
import { ATLAS_ORB_STATE_CHIP_LABELS, resolveAtlasOrbState } from '@/lib/atlas/orb-state'
import { OPERATOR_DISPLAY_NAME } from '@/lib/atlas/identity'
import { resolveDestination } from '@/lib/nav/registry'
import { openCommandPalette } from '@/components/platform/os/CommandPaletteHost'
import styles from './ShellTopBar.module.css'

interface ShellTopBarProps {
  /** Pending approvals in the operator's scope, as counted by the server; null when the read failed. */
  pendingApprovals: number | null
}

/**
 * The vNext shell's top bar, after the canonical Atlas Home mockup: one row
 * across the whole window — the OS name over the sidebar, then search, Atlas's
 * status pill, notices and the operator.
 *
 * Nothing here is a second implementation of something the shell owns. Search
 * opens the shell's one ⌘K palette; the pill reads the same runtime the Atlas
 * face does; the bell goes to Granskningar, the only notice source there is,
 * and shows a dot only when the server actually counted something waiting.
 * The avatar opens the operator menu — Inställningar and Logga ut — which in
 * vNext replaces the sidebar's operator card.
 * Desktop only: below 1024px the mobile navigation owns the top of the screen.
 */
export function ShellTopBar({ pendingApprovals }: ShellTopBarProps) {
  const atlas = useAtlas()
  const state = resolveAtlasOrbState({
    voicePhase: atlas.voicePhase,
    executing: atlas.execution,
    awaitingApproval: atlas.awaitingApproval,
    warning: atlas.warning,
  })
  const router = useRouter()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()
  const menuRef = useRef<HTMLDivElement>(null)
  useDismissOnOutside(menuRef, menuOpen, () => setMenuOpen(false))
  const approvalsHref = resolveDestination('approvals')?.href ?? '/approvals'

  // The same sign-out the legacy sidebar's operator card performs.
  async function handleSignOut() {
    setMenuOpen(false)
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }
  const initial = OPERATOR_DISPLAY_NAME.slice(0, 1).toLocaleUpperCase('sv-SE')

  return (
    <header className={styles.topBar}>
      <div className={styles.osSegment}>
        <span className={styles.osName}>Omnira OS</span>
      </div>

      <div className={styles.mainSegment}>
        <button type="button" className={styles.topSearch} onClick={openCommandPalette}>
          <Search size={17} aria-hidden="true" />
          <span>Sök i Omnira, projekt, filer eller agenter…</span>
          <kbd>⌘K</kbd>
        </button>

        <div className={styles.topActions}>
          <Link href="/atlas?ui=vnext" className={styles.topAtlasPill} data-state={state} aria-label={`Atlas · ${ATLAS_ORB_STATE_CHIP_LABELS[state]}`}>
            <span className={styles.topAtlasOrb} aria-hidden="true">
              <Image src="/atlas/atlas-orb.png" alt="" width={40} height={40} />
            </span>
            <span aria-hidden="true">Atlas</span>
            <span aria-hidden="true">·</span>
            <span aria-hidden="true">{ATLAS_ORB_STATE_CHIP_LABELS[state]}</span>
          </Link>
          <Link
            href={approvalsHref}
            className={styles.topIconButton}
            aria-label={pendingApprovals ? `Granskningar, ${pendingApprovals} väntar` : 'Granskningar'}
          >
            <Bell size={19} aria-hidden="true" />
            {pendingApprovals ? <span className={styles.topNoticeDot} aria-hidden="true" /> : null}
          </Link>
          <div ref={menuRef} className={styles.avatarMenuRoot}>
            <button
              type="button"
              className={styles.topAvatar}
              aria-label={`${OPERATOR_DISPLAY_NAME} · konto`}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-controls={menuId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {initial}
            </button>
            {menuOpen ? (
              <div id={menuId} role="menu" className={styles.avatarMenu}>
                <div className={styles.avatarMenuHeader}>
                  <span className={styles.avatarMenuName}>{OPERATOR_DISPLAY_NAME}</span>
                  <span className={styles.avatarMenuRole}>Operatör</span>
                </div>
                <Link href="/settings" role="menuitem" className={styles.avatarMenuItem} onClick={() => setMenuOpen(false)}>
                  <Settings size={15} aria-hidden="true" /> Inställningar
                </Link>
                <button type="button" role="menuitem" className={styles.avatarMenuItem} onClick={handleSignOut}>
                  <LogOut size={15} aria-hidden="true" /> Logga ut
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  )
}
