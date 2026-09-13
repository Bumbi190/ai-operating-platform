import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadChatHome } from '@/lib/os/chat'
import { AtlasChatHome, AtlasChatHomeLoading } from '@/components/platform/vnext/AtlasChatHome'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { ChatLegacy } from './ChatLegacy'

/**
 * `/chat` — Atlas Chat.
 *
 * vNext puts the question first — a composer and the executive starters, which
 * open a new conversation exactly as before — and lists the operator's own
 * conversations beneath it. `?ui=legacy` renders the previous body, moved
 * verbatim into `ChatLegacy`.
 *
 * Ownership is the one this route always had: a conversation is USER-owned and
 * read by `user_id` from the session. The vNext home reads no project list —
 * the replaced page read one for a picker that never reached a conversation —
 * so there is no project scope to apply and none to widen.
 *
 * The legacy branch returns before the vNext loader is reached, so a rollback
 * costs nothing and cannot fail on a read it does not use.
 */
export const dynamic = 'force-dynamic'

export default async function ChatIndexPage() {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <ChatLegacy />

  return (
    <Suspense fallback={<AtlasChatHomeLoading />}>
      <LoadedChatHome />
    </Suspense>
  )
}

async function LoadedChatHome() {
  const model = await loadChatHome()
  if (!model) redirect('/login')
  return <AtlasChatHome model={model} />
}
