'use client'
import { useRef } from 'react'
import { usePathname } from 'next/navigation'
import { isVNextProjectPath } from '@/lib/nav/activity-peek-visibility'
import type { OmniraUiGeneration } from '@/lib/ui/generation'
import { useAtlas } from '@/lib/atlas/runtime'
import { useMiniChatState } from '@/lib/atlas/mini-chat/use-mini-chat-state'
import { AtlasLauncherOrb } from './AtlasLauncherOrb'
import { AtlasMiniChatPanel } from './AtlasMiniChatPanel'
import styles from './AtlasMiniChatPanel.module.css'
export function AtlasMiniOrb({
  uiGeneration
}: {
  uiGeneration: OmniraUiGeneration
}) {
  const pathname = usePathname(),
    atlas = useAtlas(),
    state = useMiniChatState(atlas.deactivate),
    launcher = useRef<HTMLDivElement>(null)
  // Keep this shell component mounted while a full Atlas surface hides it.
  const hidden =
    pathname === '/atlas' ||
    pathname === '/atlas/rost' ||
    pathname === '/chat' ||
    pathname.startsWith('/chat/')
  function minimize() {
    state.minimize()
    requestAnimationFrame(() =>
      launcher.current?.querySelector('button')?.focus()
    )
  }
  return (
    <div hidden={hidden}>
      {state.isOpen && !hidden && (
        <AtlasMiniChatPanel
          onMinimize={minimize}
          draft={state.draft}
          onDraftChange={state.setDraft}
          position={state.position}
          onPositionChange={state.setPosition}
          initialProjectId={atlas.activeProject?.id ?? null}
        />
      )}
      <div
        ref={launcher}
        hidden={state.isOpen}
        className={
          styles.launcherDock +
          ' ' +
          (isVNextProjectPath(pathname, uiGeneration) ? styles.projectDock : '')
        }
      >
        <AtlasLauncherOrb
          phase={atlas.voicePhase}
          onClick={state.openPanel}
          size={40}
          label="Öppna Atlas"
          stateDescription={
            atlas.isSessionActive ? 'Samtal pågår' : 'Öppna textchatt'
          }
        />
      </div>
    </div>
  )
}
