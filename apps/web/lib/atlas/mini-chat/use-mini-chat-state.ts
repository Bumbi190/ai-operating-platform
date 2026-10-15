'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAtlasConversation } from '@/lib/atlas/conversation/provider'
import type { Point } from './geometry'
const POSITION_KEY = 'omnira:atlas:mini-position:v1'
export type MiniChatState = {
  isOpen: boolean
  draft: string
  position: Point | null
  openPanel: () => void
  minimize: () => void
  setDraft: (text: string) => void
  setPosition: (point: Point) => void
}
export function useMiniChatState(onSignout: () => void): MiniChatState {
  const { controller, snapshot } = useAtlasConversation()
  const [isOpen, setOpen] = useState(false),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [position, updatePosition] = useState<Point | null>(null)
  const signout = useRef(onSignout)
  signout.current = onSignout
  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(POSITION_KEY) ?? 'null')
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y))
        updatePosition({ x: p.x, y: p.y })
    } catch {}
    const { data } = createClient().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setOpen(false)
        setDrafts({})
        updatePosition(null)
        try {
          localStorage.removeItem(POSITION_KEY)
        } catch {}
        signout.current()
      }
    })
    return () => data.subscription.unsubscribe()
  }, [])
  useEffect(() => controller.subscribeCreated((id) => {
    setDrafts((old) => {
      if (!Object.prototype.hasOwnProperty.call(old, 'new')) return old
      const { new: draft, ...remaining } = old
      return { ...remaining, [id]: draft }
    })
  }), [controller])
  const setDraft = useCallback(
    (text: string) =>
      setDrafts((old) => ({
        ...old,
        [controller.snapshot().id ?? 'new']: text
      })),
    [controller]
  )
  const setPosition = useCallback((point: Point) => {
    updatePosition(point)
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(point))
    } catch {}
  }, [])
  return {
    isOpen,
    draft: drafts[snapshot.id ?? 'new'] ?? '',
    position,
    openPanel: useCallback(() => setOpen(true), []),
    minimize: useCallback(() => setOpen(false), []),
    setDraft,
    setPosition
  }
}
