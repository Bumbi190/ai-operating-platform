'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronRight, Search, Bell, Plus } from 'lucide-react'
import { OperatorModeSwitcher } from './OperatorMode'

interface CommandBarProps {
  operator?: string
}

/**
 * The Mission Control top bar — breadcrumb · ⌘K · operator-mode switcher
 * · live clock · notifications · operator badge.
 *
 * Sticky above the page content. Acts as the OS title bar.
 */
export function CommandBar({ operator }: CommandBarProps) {
  const pathname = usePathname()
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const segments = pathname
    .split('/')
    .filter(Boolean)
    .map((s, i, all) => ({
      label: s.replace(/-/g, ' '),
      href: '/' + all.slice(0, i + 1).join('/'),
    }))

  const hh = now.getHours().toString().padStart(2, '0')
  const mm = now.getMinutes().toString().padStart(2, '0')
  const ss = now.getSeconds().toString().padStart(2, '0')
  const dateLabel = now.toLocaleDateString('en-US', {
    weekday: 'short', day: 'numeric', month: 'short',
  }).toUpperCase()
  const initials = operator?.split('@')[0].slice(0, 2).toUpperCase() ?? '••'

  return (
    <div
      className="sticky top-0 z-bar backdrop-blur-md"
      style={{
        background: 'linear-gradient(180deg, rgba(5,7,20,0.88) 0%, rgba(5,7,20,0.60) 100%)',
        borderBottom: '1px solid rgba(255,255,255,0.04)',
      }}
    >
      <div className="px-6 md:px-8 lg:px-10 2xl:px-12 3xl:px-16 h-12 flex items-center gap-3 lg:gap-4">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-1.5 min-w-0 max-w-[40%] lg:max-w-none">
          {segments.length === 0 ? (
            <span className="eyebrow">Omnira OS</span>
          ) : (
            <>
              <span className="eyebrow hidden md:inline">Omnira</span>
              {segments.map((seg, i) => (
                <span key={seg.href} className="flex items-center gap-1.5 min-w-0">
                  <ChevronRight className="w-3 h-3 text-zinc-700 shrink-0 hidden md:inline" />
                  <Link
                    href={seg.href}
                    className={
                      i === segments.length - 1
                        ? 'text-[12px] text-white/90 font-medium capitalize truncate tracking-tight'
                        : 'text-[12px] text-zinc-500 hover:text-zinc-300 transition-colors capitalize truncate tracking-tight hidden md:inline'
                    }
                  >
                    {seg.label}
                  </Link>
                </span>
              ))}
            </>
          )}
        </nav>

        {/* Center · command search */}
        <button
          className="hidden md:flex items-center gap-2 h-7 px-2.5 rounded-md text-[11px] text-zinc-500 transition-all ease-os hover:text-zinc-200 press"
          style={{
            background: 'rgba(255,255,255,0.025)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <Search className="w-3 h-3" />
          <span>Search · jump · command</span>
          <span className="flex items-center gap-0.5 ml-2">
            <span className="kbd">⌘</span>
            <span className="kbd">K</span>
          </span>
        </button>

        {/* Mode switcher · between center and right cluster */}
        <div className="hidden lg:flex shrink-0 ml-auto">
          <OperatorModeSwitcher />
        </div>

        {/* Right cluster */}
        <div className="flex items-center gap-2.5 lg:gap-3 shrink-0 ml-auto lg:ml-0">
          <div className="hidden sm:flex items-baseline gap-2 caption-mono">
            <span className="text-[10px] text-zinc-600">{dateLabel}</span>
            <span className="text-[12px] text-white/85 tabular-nums">
              {hh}:{mm}<span className="text-zinc-700">:{ss}</span>
            </span>
            <span className="text-[9.5px] text-zinc-600">CET</span>
          </div>

          <span className="hidden sm:block h-4 w-px" style={{ background: 'rgba(255,255,255,0.06)' }} />

          <button
            className="relative w-7 h-7 rounded-md flex items-center justify-center text-zinc-500 hover:text-white transition-colors ease-os press"
            style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
            aria-label="Notifications"
          >
            <Bell className="w-3 h-3" />
            <span
              className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-indigo-400"
              style={{ boxShadow: '0 0 6px #818cf8' }}
            />
          </button>

          <Link
            href="/projects/new"
            className="hidden md:inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] btn-ghost ease-os press"
          >
            <Plus className="w-3 h-3" />
            Deploy
          </Link>

          {operator && (
            <div
              className="flex items-center gap-2 h-7 pl-1 pr-2 rounded-md"
              style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.06)' }}
            >
              <div
                className="w-5 h-5 rounded flex items-center justify-center chrome-edge"
                style={{
                  background: 'linear-gradient(135deg, rgba(99,102,241,0.4), rgba(139,92,246,0.3))',
                  border: '1px solid rgba(99,102,241,0.45)',
                }}
              >
                <span className="text-[8.5px] font-bold text-white">{initials}</span>
              </div>
              <span className="eyebrow !text-[9px] !text-zinc-500 !tracking-[0.18em] hidden xl:inline">
                Operator
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
