import {notFound} from 'next/navigation'
import {resolvePlatformOperator} from '@/lib/auth/platform-operator'
import {createAdminClient} from '@/lib/supabase/admin'
import {isUuid} from '@omnira/local-text-contract'
import {LocalTextPilotPanel} from '@/components/platform/vnext/LocalTextPilotPanel'
export const dynamic='force-dynamic'
export default async function LocalModelsPage(){
 const id=process.env.ATLAS_LOCAL_TEXT_PILOT_PROJECT_ID
 if(process.env.ATLAS_LOCAL_TEXT_ENABLED!=='true'||!isUuid(id))notFound()
 const operator=await resolvePlatformOperator();if(!operator.ok)notFound()
 const {data,error}=await createAdminClient().from('projects').select('id,name').eq('id',id).eq('owner_id',operator.userId).maybeSingle()
 if(error||!data)notFound()
 return <main className="mx-auto max-w-3xl space-y-6 p-6"><h1 className="text-2xl font-semibold">Lokal AI-server</h1><p>Begränsad anslutningspilot i {data.name}. Qwen3.5 9B klassificerar en syntetisk supportfråga. Du granskar resultatet innan det visas. Inga betalda modellanrop.</p><LocalTextPilotPanel projectId={data.id}/></main>
}
