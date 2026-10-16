import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import {
  OMNIRA_UI_COOKIE,
  OMNIRA_UI_COOKIE_MAX_AGE,
  parseUiGenerationParam,
  type OmniraUiGeneration,
} from '@/lib/ui/generation'

/**
 * Persist an explicit `?ui=` choice so later navigation keeps the generation.
 *
 * Selection only — this cookie never grants authorization, never bypasses
 * authentication and is never treated as a security boundary. It is applied to
 * whichever response we were already returning, so no auth redirect semantics
 * change and no extra round-trip is introduced.
 */
function withUiGenerationCookie(
  response: NextResponse,
  generation: OmniraUiGeneration | null,
  request: NextRequest,
): NextResponse {
  if (!generation) return response
  response.cookies.set(OMNIRA_UI_COOKIE, generation, {
    path: '/',
    sameSite: 'lax',
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    maxAge: OMNIRA_UI_COOKIE_MAX_AGE,
  })
  return response
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname
  // Public, credential-free executable asset: microphone startup must not wait
  // for session refresh or membership reads.
  if ((path === '/atlas-voice-recorder.js' || /^\/atlas-vad\/(?:silero_vad_v5\.onnx|ort\.wasm\.min\.mjs|ort-wasm-simd-threaded\.(?:wasm|mjs))$/.test(path)) && (request.method === 'GET' || request.method === 'HEAD')) {
    return NextResponse.next({ request })
  }
  // This exact route performs fresh identity + operator + legacy containment
  // itself, before body parsing or any provider call. Avoid verifying twice.
  if (path === '/api/atlas/voice-pilot/speech' && (request.method === 'GET' || request.method === 'POST')) {
    return NextResponse.next({ request })
  }
  // UI generation is resolved before anything else so the *current* render
  // already sees the choice. Writing it onto the request (not just the
  // response) is what lets /atlas?ui=vnext render vNext immediately without a
  // redirect purely to make the cookie visible.
  const requestedGeneration = parseUiGenerationParam(request.nextUrl.searchParams.get('ui'))
  if (requestedGeneration) {
    request.cookies.set(OMNIRA_UI_COOKIE, requestedGeneration)
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  // Collaborator containment: protect every legacy Atlas page/API until audited.
  // Role is read from the authenticated Supabase session, never from a cookie claim.
  if (user) {
    const { data: membership, error: membershipError } = await (supabase as any)
      .from('omnira_organization_memberships')
      .select('role, revoked_at')
      .eq('user_id', user.id)
      .maybeSingle()
    // Old owner sessions remain compatible while the new table is rolled out.
    // Unknown new users must NEVER fall through into existing Atlas routes,
    // including when the membership table is missing or temporarily unavailable.
    if (membershipError || !membership || membership.revoked_at !== null && membership.role !== 'collaborator') {
      const { data: owned, error: ownershipError } = await supabase.from('projects')
        .select('id').eq('owner_id', user.id).limit(1)
      if (ownershipError || !owned?.length) {
        if (pathname.startsWith('/api'))
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
        if (!pathname.startsWith('/auth/') && pathname !== '/login' &&
            pathname !== '/update-password' && pathname !== '/forgot-password' &&
            pathname !== '/organization' && pathname !== '/privacy' && pathname !== '/terms') {
          const url = request.nextUrl.clone()
          url.pathname = '/organization'
          url.search = ''
          return NextResponse.redirect(url)
        }
      }
    }
    if (!membershipError && membership?.role === 'collaborator') {
      const denied = !!membership.revoked_at
      const collaboratorAtlasRead = pathname === '/api/organization/atlas' && request.method === 'POST'
      const collaboratorProposals = pathname === '/api/organization/proposals' && (request.method === 'GET' || request.method === 'POST')
      const collaboratorDirectoryRead =
        request.method === 'GET' && pathname === '/api/organization/projects'
      const collaboratorWorkflowRead =
        request.method === 'GET' &&
        /^\/api\/organization\/projects\/[a-z0-9][a-z0-9-]{0,79}\/workflows$/.test(pathname)
      const handlWorkflowCreate =
        request.method === 'POST' &&
        pathname === '/api/organization/projects/handlarborsen/workflows'
      const handlWorkflowEdit =
        request.method === 'PATCH' &&
        /^\/api\/organization\/projects\/handlarborsen\/workflows\/[0-9a-f-]{36}$/i.test(pathname)
      // The Owner's old API remains blocked for every collaborator.
      if (pathname.startsWith('/api') &&
          (denied || !(collaboratorDirectoryRead || collaboratorAtlasRead || collaboratorProposals || collaboratorWorkflowRead || handlWorkflowCreate || handlWorkflowEdit))) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      }
      const allowedPage = !denied && (
        (pathname === '/organization' || pathname === '/organization/atlas' || pathname === '/organization/reviews' || pathname.startsWith('/organization/projects/')) || pathname.startsWith('/auth/') ||
        pathname === '/update-password' || pathname === '/forgot-password' ||
        pathname === '/privacy' || pathname === '/terms'
      )
      if (!allowedPage && !pathname.startsWith('/api')) {
        const url = request.nextUrl.clone()
        if (denied) return new NextResponse('Access revoked', { status: 403 })
        const projectMatch = /^\/projects\/([a-z0-9][a-z0-9-]{0,79})$/.exec(pathname)
        url.pathname = pathname === '/atlas' || pathname.startsWith('/chat')
          ? '/organization/atlas'
          : projectMatch ? '/organization/projects/' + projectMatch[1] : '/organization'
        url.search = ''
        return withUiGenerationCookie(NextResponse.redirect(url), requestedGeneration, request)
      }
    }
  }

  const isAuthRoute    = pathname.startsWith('/login')
  const isApiRoute     = pathname.startsWith('/api')
  const isAuthRoute2   = pathname.startsWith('/auth/')
  const isPublicPage   = ['/privacy', '/terms'].includes(pathname)
  // Allow unauthenticated access to forgot/update-password pages.
  // /update-password handles its own code exchange — the catch-all below must
  // NOT intercept ?code= on this path, or it will send recovery codes to /auth/confirm.
  const isPasswordPage = pathname.startsWith('/forgot-password') || pathname.startsWith('/update-password')

  // Allow API routes, /auth/* routes, password pages, and public legal pages through
  if (isApiRoute || isAuthRoute2 || isPasswordPage || isPublicPage) {
    return withUiGenerationCookie(supabaseResponse, requestedGeneration, request)
  }

  // If Supabase redirected to an unexpected page with a ?code= param, forward to /auth/confirm.
  // (Does not apply to /update-password — handled above.)
  const code = request.nextUrl.searchParams.get('code')
  if (!user && code) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/confirm'
    url.search = `?code=${code}`
    return withUiGenerationCookie(NextResponse.redirect(url), requestedGeneration, request)
  }

  // Redirect unauthenticated users to login
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return withUiGenerationCookie(NextResponse.redirect(url), requestedGeneration, request)
  }

  // Redirect authenticated users away from login page
  if (user && isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return withUiGenerationCookie(NextResponse.redirect(url), requestedGeneration, request)
  }

  return withUiGenerationCookie(supabaseResponse, requestedGeneration, request)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|atlas-voice-recorder\\.js$|atlas-vad/(?:silero_vad_v5\\.onnx|ort\\.wasm\\.min\\.mjs|ort-wasm-simd-threaded\\.(?:wasm|mjs))$|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|ico)$).*)',
  ],
}
