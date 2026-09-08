import Link from 'next/link'
import type { AtlasRailCard } from '@/lib/atlas/first-party-workspaces'
import { OSPage, OSLayer, Panel } from '@/components/platform/os'

/**
 * `/projects` for the legacy generation.
 *
 * The spiral is a vNext surface. Legacy is the proven rollback path, so it gets
 * the same scoped cards rendered as an ordinary list in legacy's own chrome —
 * not the spatial composition. The route exists in both generations because a
 * 404 on rollback would be worse than a plain page.
 *
 * Same cards, same hrefs, same authorization. Only the presentation differs.
 */
export function ProjectsIndexLegacy({
  cards,
  projectsAvailable,
}: {
  cards: readonly AtlasRailCard[]
  projectsAvailable: boolean
}) {
  return (
    <OSPage className="animate-fade-in">
      <OSLayer layer="hero">
        <p className="eyebrow os-eyebrow-accent mb-3">Portfölj</p>
        <h1 className="text-2xl font-bold tracking-tight">Projekt</h1>
        {!projectsAvailable ? (
          <p className="text-sm text-amber-400 mt-1">
            Projektlistan kunde inte läsas — visar systemarbetsytor.
          </p>
        ) : null}
      </OSLayer>

      <OSLayer layer="operational" className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.length === 0 ? (
          <Panel className="p-5">
            <p className="text-sm text-muted-foreground">
              Inga projekt är kopplade till ditt konto ännu.
            </p>
          </Panel>
        ) : (
          cards.map((card) => (
            <Link key={card.id} href={card.href} className="block">
              <Panel className="p-5 h-full transition-colors hover:border-white/20">
                <div className="flex items-center gap-3">
                  <span
                    className="w-9 h-9 rounded-lg border flex items-center justify-center text-xs font-bold"
                    style={{
                      borderColor: `${card.color}55`,
                      background: `${card.color}14`,
                      color: card.color,
                    }}
                  >
                    {card.label.slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold truncate">{card.label}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {card.kind === 'SYSTEM_WORKSPACE'
                        ? card.workspace.summary
                        : card.project.latestActivityTitle ?? 'Inga registrerade händelser'}
                    </div>
                  </div>
                </div>
              </Panel>
            </Link>
          ))
        )}
      </OSLayer>
    </OSPage>
  )
}
