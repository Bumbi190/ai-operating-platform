'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Uppdaterar serverdatan tyst var N:e sekund så Cost Center känns live. */
export function LiveRefresh({ seconds = 20 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
