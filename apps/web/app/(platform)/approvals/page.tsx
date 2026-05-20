import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'
import { CheckCircle2, XCircle, Clock, RefreshCw, ShieldCheck } from 'lucide-react'
import { ApprovalCard } from './ApprovalCard'

export const dynamic = 'force-dynamic'

interface ApprovalRow {
  id: string
  output_key: string
  content: string
  status: 'pending' | 'approved' | 'rejected' | 'revised'
  reviewer_notes: string | null
  created_at: string
  reviewed_at: string | null
  runs: {
    id: string
    status: string
    created_at: string
    workflows: { name: string } | null
    agents: { name: string } | null
  } | null
}

const STATUS_CONFIG = {
  pending:  { label: 'Väntar',     color: 'text-amber-400',  bg: 'bg-amber-400/10 border-amber-400/20',  icon: Clock },
  approved: { label: 'Godkänd',    color: 'text-green-400',  bg: 'bg-green-400/10 border-green-400/20',  icon: CheckCircle2 },
  rejected: { label: 'Avslagen',   color: 'text-red-400',    bg: 'bg-red-400/10 border-red-400/20',      icon: XCircle },
  revised:  { label: 'Reviderad',  color: 'text-blue-400',   bg: 'bg-blue-400/10 border-blue-400/20',    icon: RefreshCw },
}

export default async function ApprovalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const db = createAdminClient()

  const { data: approvals } = await db
    .from('approvals')
    .select(`
      id, output_key, content, status, reviewer_notes, created_at, reviewed_at,
      runs (
        id, status, created_at,
        workflows ( name ),
        agents ( name )
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50) as { data: ApprovalRow[] | null }

  const all = approvals ?? []
  const counts = {
    pending:  all.filter(a => a.status === 'pending').length,
    approved: all.filter(a => a.status === 'approved').length,
    rejected: all.filter(a => a.status === 'rejected').length,
    revised:  all.filter(a => a.status === 'revised').length,
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0 mt-0.5">
          <ShieldCheck className="w-5 h-5 text-indigo-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Godkännanden</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Manager-agentens granskningskö — godkänn, avslå eller begär revision
          </p>
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-4 gap-3">
        {(Object.entries(STATUS_CONFIG) as [keyof typeof STATUS_CONFIG, typeof STATUS_CONFIG[keyof typeof STATUS_CONFIG]][]).map(([key, cfg]) => {
          const Icon = cfg.icon
          return (
            <div key={key} className={`rounded-xl border p-4 ${cfg.bg}`}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className={`w-4 h-4 ${cfg.color}`} />
                <span className={`text-xs font-medium ${cfg.color}`}>{cfg.label}</span>
              </div>
              <div className="text-2xl font-bold tabular-nums">{counts[key]}</div>
            </div>
          )
        })}
      </div>

      {/* Pending first, then rest */}
      {all.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <ShieldCheck className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Inga godkännanden ännu</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Kör ett workflow — resultatet hamnar här för granskning
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Pending */}
          {counts.pending > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-amber-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                Väntar på granskning ({counts.pending})
              </h2>
              <div className="space-y-3">
                {all.filter(a => a.status === 'pending').map(a => (
                  <ApprovalCard key={a.id} approval={a} />
                ))}
              </div>
            </section>
          )}

          {/* Reviewed */}
          {all.some(a => a.status !== 'pending') && (
            <section>
              <h2 className="text-xs font-semibold text-muted-foreground/60 uppercase tracking-wider mb-2">
                Granskade
              </h2>
              <div className="space-y-3">
                {all.filter(a => a.status !== 'pending').map(a => (
                  <ApprovalCard key={a.id} approval={a} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  )
}
