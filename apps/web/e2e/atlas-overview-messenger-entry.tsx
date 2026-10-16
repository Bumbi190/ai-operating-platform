import React, { useMemo } from 'react'
import { AtlasChatConversation } from '../components/platform/vnext/AtlasChatConversation'
import { AtlasHomeVNext } from '../components/platform/vnext/AtlasHomeVNext'
import type { AtlasHomeViewModel } from '../lib/atlas/home-view-model'
import { OverviewDashboard } from '../components/platform/overview/OverviewDashboard'
import { overviewFixture } from './atlas-overview-messenger-model'
import { createRoot } from 'react-dom/client'
import {
  AtlasConversationProvider,
  useAtlasConversation
} from '../lib/atlas/conversation/provider'
import { AtlasRuntimeProvider } from '../lib/atlas/runtime'
import { AtlasMiniOrb } from '../components/platform/os/AtlasMiniOrb'
import {
  usePathname,
  useRouter,
  useSearchParams
} from './atlas-overview-messenger-navigation'
const C = '50000000-0000-4000-8000-000000000001',
  D = '50000000-0000-4000-8000-000000000002'
const atlasModel: AtlasHomeViewModel = {
  generatedAt: '2026-10-15T12:00:00Z',
  projects: [],
  activity: [],
  totals: {
    projects: 0,
    runningRuns: 0,
    pendingApprovals: 0,
    failedRuns24h: 0
  },
  availability: { projects: true, runs: true, approvals: true }
}
;(window as any).fixtureToken = crypto.randomUUID()
function Workspace() {
  const path = usePathname(),
    router = useRouter(),
    { controller, snapshot } = useAtlasConversation()
  const params = useSearchParams()
  const chatModel = useMemo(
    () => ({
      id: path.split('/')[2] ?? C,
      title: 'Testkonversation',
      projectName: 'Testprojekt',
      projectId: '10000000-0000-4000-8000-000000000001',
      state: 'ok' as const,
      saved: [],
      chatBase: '/chat'
    }),
    [path]
  )
  return (
    <>
      <nav aria-label="Fixture navigation">
        {['/dashboard', '/projects/test-project', '/atlas', '/chat/' + C].map(
          (p) => (
            <button key={p} onClick={() => router.push(p)}>
              {p}
            </button>
          )
        )}
        <button
          onClick={() => window.dispatchEvent(new Event('fixture:signout'))}
        >
          Fixture signout
        </button>
        <button onClick={() => controller.ensureConversation({
          firstText: 'Talat meddelande', inputSource: 'voice', projectId: null
        })}>Fixture voice create</button>
        <button onClick={() => controller.deactivateConversation()}>
          Fixture new thread
        </button>
        <button
          onClick={() =>
            controller.activateConversation({
              id: snapshot.id === D ? C : D,
              saved: [],
              state: 'ok'
            })
          }
        >
          Fixture switch thread
        </button>
      </nav>
      <main style={{ padding: path === '/dashboard' ? 0 : 32 }}>
        {path === '/dashboard' ? (
          <OverviewDashboard
            model={overviewFixture(
              params.get('period') === '30' ? 30 : 7,
              params.get('fixture-state') === 'partial'
                ? 'partial'
                : params.get('fixture-state') === 'unavailable'
                  ? 'unavailable'
                  : 'complete',
              params.has('fixture-empty')
            )}
          />
        ) : path.startsWith('/chat/') ? (
          <AtlasChatConversation model={chatModel} />
        ) : path === '/atlas' ? (
          <AtlasHomeVNext model={atlasModel} />
        ) : (
          <>
            <h1>Projektöversikt</h1>
            <p>Din arbetsyta finns kvar bakom chatten.</p>
          </>
        )}
      </main>
      <AtlasMiniOrb uiGeneration="vnext" />
    </>
  )
}
createRoot(document.getElementById('root')!).render(
  <AtlasConversationProvider>
    <AtlasRuntimeProvider
      projects={[
        {
          id: '10000000-0000-4000-8000-000000000001',
          name: 'Testprojekt',
          slug: 'test-project',
          color: '#67e8f9'
        }
      ]}
    >
      <Workspace />
    </AtlasRuntimeProvider>
  </AtlasConversationProvider>
)
