import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { slugify } from '@/lib/utils'

// GET /api/projects — list user's projects
export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .order('created_at')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
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
