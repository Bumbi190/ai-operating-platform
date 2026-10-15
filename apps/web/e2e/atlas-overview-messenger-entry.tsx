import React from 'react'
import { createRoot } from 'react-dom/client'
import {
  AtlasConversationProvider,
  useAtlasConversation
} from '../lib/atlas/conversation/provider'
import { AtlasRuntimeProvider } from '../lib/atlas/runtime'
import { AtlasMiniOrb } from '../components/platform/os/AtlasMiniOrb'
import { usePathname, useRouter } from './atlas-overview-messenger-navigation'
const C = '50000000-0000-4000-8000-000000000001',
  D = '50000000-0000-4000-8000-000000000002'
function Workspace() {
  const path = usePathname(),
    router = useRouter(),
    { controller, snapshot } = useAtlasConversation()
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
      <main>
        <h1>
          {path === '/atlas'
            ? 'Atlas'
            : path.startsWith('/chat')
              ? 'Full chatt'
              : 'Projektöversikt'}
        </h1>
        {path.startsWith('/chat') && (
          <p data-testid="full-history">
            {snapshot.history.map((m) => m.content).join(' | ')}
          </p>
        )}
        <p>Din arbetsyta finns kvar bakom chatten.</p>
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
