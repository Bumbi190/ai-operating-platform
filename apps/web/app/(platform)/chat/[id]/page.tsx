import {Suspense} from 'react'
import {redirect} from 'next/navigation'
import {loadChatConversation} from '@/lib/os/chat'
import {AtlasChatConversationLoading} from '@/components/platform/vnext/AtlasChatConversation'
import {AtlasBuildSurface} from '@/components/platform/vnext/AtlasBuildSurface'
export const dynamic='force-dynamic'
interface Props{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|string[]|undefined>>}
export default async function ConversationPage({params,searchParams}:Props){
 const {id}=await params,{send}=await searchParams
 const asking=typeof send==='string'&&send.trim().length>0
 return <Suspense key={id} fallback={<AtlasChatConversationLoading/>}><LoadedConversation id={id} asking={asking}/></Suspense>
}
async function LoadedConversation({id,asking}:{id:string;asking:boolean}){
 const model=await loadChatConversation(id)
 if(!model)redirect('/login')
 if(model==='not_found')redirect('/chat')
 return <AtlasBuildSurface conversationModel={model} asking={asking} plan={model.website?.plan} initialSession={model.website?.session} brief={model.website?.brief??undefined} workspaceReadable={model.website?.state!=='error'}/>
}
