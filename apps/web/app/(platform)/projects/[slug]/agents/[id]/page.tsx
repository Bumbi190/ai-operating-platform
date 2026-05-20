import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import EditAgentClient from './EditAgentClient'

export default async function EditAgentPage({
  params,
}: {
  params: { slug: string; id: string }
}) {
  const supabase = await createClient()

  const { data: agent } = await supabase
    .from('agents')
    .select('*')
    .eq('id', params.id)
    .single()

  if (!agent) notFound()

  return <EditAgentClient agent={agent} slug={params.slug} />
}
