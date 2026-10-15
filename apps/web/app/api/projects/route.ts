import {projectLifecycleState,type ProjectLifecycleRelation} from '@/lib/project/lifecycle/list'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { slugify } from '@/lib/utils'

// GET /api/projects — list user's projects
export async function GET(request:Request) {
  const headers={'cache-control':'private, no-store'}
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401,headers })

  const include=new URL(request.url).searchParams.get('include')??'active'
  if(!['active','archived','trashed'].includes(include))return NextResponse.json({error:'Ogiltig projektlista'},{status:400,headers})
  // Additive relationship is not in the generated database types yet.
  const inventory=supabase as unknown as {from:(table:'projects')=>{select:(fields:string)=>{order:(field:string)=>Promise<{data:unknown[]|null;error:unknown}>}}}
  const { data, error } = await inventory
    .from('projects')
    .select('*,project_lifecycle(state)')
    .order('created_at')

  if(error)return NextResponse.json({error:'Projektlistan kunde inte läsas.'},{status:503,headers})
  try{
    const rows=(data??[]) as unknown as Array<ProjectLifecycleRelation & Record<string,unknown>>
    return NextResponse.json(rows.filter(row=>projectLifecycleState(row)===include).map(({project_lifecycle,...row})=>row),{headers})
  }catch{return NextResponse.json({error:'Projektlistan kunde inte läsas.'},{status:503,headers})}
}

// POST /api/projects — create project
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { name, color = '#6366f1', settings = {} } = body

  if (!name?.trim()) {
    return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
  }

  const slug = slugify(name)

  // Check slug uniqueness
  const { data: existing } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .single()

  if (existing) {
    return NextResponse.json({ error: `Slug "${slug}" är redan tagen` }, { status: 409 })
  }

  const { data, error } = await supabase
    .from('projects')
    .insert({ name: name.trim(), slug, color, settings, owner_id: user.id })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data, { status: 201 })
}
