'use client'

/**
 * AtlasActionChips — the deep-link chips rendered beneath an Atlas answer (and
 * reusable on the briefing / Activity Rail). Every href is produced by the
 * navigation registry; this component never builds a URL itself.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { ResolvedLink } from '@/lib/nav/registry'

export function AtlasActionChips({ links, className }: { links?: ResolvedLink[]; className?: string }) {
  if (!links || links.length === 0) return null
  return (
    <div className={`flex flex-wrap gap-1.5 ${className ?? ''}`}>
      {links.map(link => (
        <Link
          key={`${link.id}-${link.href}`}
          href={link.href}
          className="group inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/25 bg-indigo-500/[0.06] px-2.5 py-1.5 text-[11.5px] font-medium text-indigo-200 transition-colors hover:bg-indigo-500/15 hover:text-white"
        >
          <span className="truncate max-w-[18rem]">{link.label}</span>
          <ArrowRight className="w-3 h-3 shrink-0 opacity-60 transition-transform group-hover:translate-x-0.5" />
        </Link>
      ))}
    </div>
  )
}
