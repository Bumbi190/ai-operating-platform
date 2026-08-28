'use client'

/**
 * CommandPaletteHost — ⌘K without the top bar.
 *
 * WHY THIS EXISTS. The command palette was not a feature of the top bar; it was
 * merely *mounted* by it. `CommandBar` owned the global ⌘K/Ctrl+K listener and
 * rendered `<CommandPalette>` as its own child, and nothing else in the platform
 * mounted either. So removing the bar from vNext would have silently deleted
 * jump-to-page, jump-to-project and "ask Atlas" — real navigation, not chrome.
 *
 * This component is that capability with the chrome removed: the same keyboard
 * shortcut and the same palette, rendering nothing until the operator opens it.
 * vNext mounts this in place of the bar; legacy keeps `CommandBar` untouched and
 * continues to own its own copy, so exactly one listener exists per generation.
 */

import { useEffect, useState } from 'react'
import { CommandPalette } from './CommandPalette'

interface CommandPaletteHostProps {
  projects?: { name: string; slug: string }[]
}

export function CommandPaletteHost({ projects = [] }: CommandPaletteHostProps) {
  const [open, setOpen] = useState(false)

  // Same binding CommandBar registers, unchanged: ⌘K / Ctrl+K toggles.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        setOpen(o => !o)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Renders no chrome and occupies no space — the palette portals its own
  // overlay when open, and Escape/close is handled inside CommandPalette.
  //
  // `variant` is the ONLY thing this host says about appearance. The palette is
  // the same component legacy mounts, with the same search, keyboard model and
  // navigation; vNext just wears the shell's own dark-glass cyan identity
  // instead of the legacy indigo.
  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      projects={projects}
      variant="vnext"
    />
  )
}
