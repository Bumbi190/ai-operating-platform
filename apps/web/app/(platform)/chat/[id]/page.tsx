import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { loadChatConversation } from '@/lib/os/chat'
import {
  AtlasChatConversation,
  AtlasChatConversationLoading,
} from '@/components/platform/vnext/AtlasChatConversation'
import { OMNIRA_UI_COOKIE, isVNext, resolveUiGeneration } from '@/lib/ui/generation'
import { ConversationLegacy } from './ConversationLegacy'

interface Props {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

/**
 * `/chat/[id]` — one Atlas conversation.
 *
 * vNext renders the conversation as the working surface; `?ui=legacy` renders
 * the previous body, moved verbatim into `ConversationLegacy`. Both speak the
 * same, unchanged `/api/chat`.
 *
 * The guard is the one this route always had: the conversation is read by id
 * AND `user_id` from the session before a single message is read, and a
 * conversation that is not the session's is the same neutral redirect to
 * `/chat` as one that does not exist.
 *
 * `?send=` is only looked at here to know whether a launcher's question is
 * about to be sent, so the empty state does not flash first. The question itself
 * is read and sent by the conversation, once, exactly as before.
 *
 * The legacy branch returns before the vNext loader is reached. The boundary is
 * keyed by conversation, so moving between conversations never carries one
 * conversation's state into another.
 */
export const dynamic = 'force-dynamic'

export default async function ConversationPage({ params, searchParams }: Props) {
  const cookieStore = await cookies()
  const generation = resolveUiGeneration({
    cookie: cookieStore.get(OMNIRA_UI_COOKIE)?.value ?? null,
  })

  if (!isVNext(generation)) return <ConversationLegacy params={params} />

  const { id } = await params
  const { send } = await searchParams
  const asking = typeof send === 'string' && send.trim().length > 0

  return (
    <Suspense key={id} fallback={<AtlasChatConversationLoading />}>
      <LoadedConversation id={id} asking={asking} />
    </Suspense>
  )
}

async function LoadedConversation({ id, asking }: { id: string; asking: boolean }) {
  const model = await loadChatConversation(id)
  if (!model) redirect('/login')
  if (model === 'not_found') redirect('/chat')
  return <AtlasChatConversation model={model} asking={asking} />
}
