'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/** Tyst serveruppdatering var N:e sekund så Activity Center känns live. */
export function LiveRefresh({ seconds = 12 }: { seconds?: number }) {
  const router = useRouter()
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000)
    return () => clearInterval(id)
  }, [router, seconds])
  return null
}
