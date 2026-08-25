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
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|ico)$).*)',
  ],
}
