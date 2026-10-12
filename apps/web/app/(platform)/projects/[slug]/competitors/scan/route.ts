import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { saveManualCompetitorScan } from '@/lib/atlas/project-analytics/handlarborsen-competitor-store'

/** Native form POST only. Missing/foreign Origin and unauthenticated sessions fail closed. */
export async function POST(request: NextRequest, { params }: { params: { slug: string } }) {
  if (params.slug !== 'handlarborsen') return new NextResponse(null, { status: 404 })
  if (request.headers.get('origin') !== request.nextUrl.origin) return new NextResponse(null, { status: 403 })
  try {
    const db = await createClient()
    const { data, error } = await db.auth.getUser()
    if (error || !data.user) return new NextResponse(null, { status: 401 })
  } catch { return new NextResponse(null, { status: 401 }) }
  const result = await saveManualCompetitorScan()
  if (result === 'not_permitted') return new NextResponse(null, { status: 403 })
  const destination = new URL('/projects/handlarborsen/competitors', request.nextUrl.origin)
  destination.searchParams.set('result', result)
  return NextResponse.redirect(destination, 303)
}
