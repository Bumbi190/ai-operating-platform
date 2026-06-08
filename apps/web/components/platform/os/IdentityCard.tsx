import { OmniraMark } from '@/components/platform/OmniraLogo'
import { PulseDot } from './PulseDot'

interface IdentityCardProps {
  operator?: string
  clearance?: string  // e.g. "Operator I", "Owner"
  systemsAccess?: string  // e.g. "All projects · 3 systems"
}

/**
 * IdentityCard · operator credentials in OS-native form.
 *
 * Used for splash / boot moments. Renders the Omnira mark, the operator's
 * initials, their clearance tier, and a short systems-access summary.
 */
export function IdentityCard({
  operator = 'OPERATOR',
  clearance = 'Operator',
  systemsAccess = 'All systems',
}: IdentityCardProps) {
  const name = operator.split('@')[0]
  const initials = name.slice(0, 2).toUpperCase()

  return (
    <div
      className="relative overflow-hidden rounded-2xl px-6 py-5 flex items-center gap-5"
      style={{
        background:
          'linear-gradient(135deg, rgba(99,102,241,0.10) 0%, rgba(139,92,246,0.06) 50%, rgba(212,165,116,0.04) 100%)',
        border: '1px solid rgba(99,102,241,0.18)',
        boxShadow:
          '0 1px 0 rgba(255,255,255,0.05) inset, 0 20px 50px -16px rgba(99,102,241,0.30), 0 4px 14px -4px rgba(0,0,0,0.40)',
      }}
    >
      <div className="absolute -top-10 -right-10 w-44 h-44 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(99,102,241,0.22) 0%, transparent 70%)', filter: 'blur(22px)' }}
      />

      <div className="relative shrink-0">
        <OmniraMark size={44} variant="silver" />
      </div>

      <div className="relative h-12 w-px" style={{ background: 'rgba(255,255,255,0.08)' }} />

      <div className="relative shrink-0">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center chrome-edge"
          style={{
            background: 'linear-gradient(135deg, rgba(99,102,241,0.5), rgba(139,92,246,0.35))',
            border: '1px solid rgba(99,102,241,0.45)',
            boxShadow: '0 6px 16px -4px rgba(99,102,241,0.55)',
          }}
        >
          <span className="text-[12.5px] font-bold text-white">{initials}</span>
        </div>
      </div>

      <div className="relative min-w-0">
        <p className="eyebrow eyebrow-accent !text-[9px]">Authenticated</p>
        <p className="text-[15px] font-semibold text-white tracking-tight mt-1 truncate">{name}</p>
        <div className="flex items-center gap-2 mt-1.5">
          <span className="text-[10.5px] text-secondary caption-mono">{clearance}</span>
          <span className="text-faint text-[10px]">·</span>
          <span className="text-[10.5px] text-secondary">{systemsAccess}</span>
        </div>
      </div>

      <div className="relative ml-auto shrink-0 hidden sm:flex items-center gap-2">
        <PulseDot tone="emerald" size={5} />
        <span className="eyebrow !text-[9px] !text-emerald-300/85">Session live</span>
      </div>
    </div>
  )
}
