import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// GET /api/outputs/[id]/download — get signed download URL
export async function GET(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: output } = await supabase
    .from('outputs')
    .select('file_url, name')
    .eq('id', params.id)
    .single()

  if (!output?.file_url) {
    return NextResponse.json({ error: 'Fil saknas' }, { status: 404 })
  }

  // Extract storage path from URL and create signed URL (60 min)
  const path = output.file_url.split('/storage/v1/object/public/outputs/')[1]
  const { data: signed } = await supabase.storage
    .from('outputs')
    .createSignedUrl(path, 3600)

  if (!signed?.signedUrl) {
    return NextResponse.json({ error: 'Kunde inte skapa nedladdningslänk' }, { status: 500 })
  }

  return NextResponse.redirect(signed.signedUrl)
}

// DELETE /api/outputs/[id] — delete output + file
export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } },
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: output } = await supabase
    .from('outputs')
    .select('file_url')
    .eq('id', params.id)
    .single()

  if (output?.file_url) {
    const path = output.file_url.split('/storage/v1/object/public/outputs/')[1]
    await supabase.storage.from('outputs').remove([path])
  }

  await supabase.from('outputs').delete().eq('id', params.id)
  return new Response(null, { status: 204 })
}
