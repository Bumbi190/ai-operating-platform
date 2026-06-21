import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
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

  // /login is the primary auth page; authenticated users are bounced away from it.
  const isLoginPage    = pathname.startsWith('/login')
  // Pages that unauthenticated users must be able to reach (password reset flow).
  // /update-password is also included: the page itself guards with getSession() and
  // self-redirects to /login if no session — middleware should not intercept first.
  const isPasswordPage = pathname.startsWith('/forgot-password') || pathname.startsWith('/update-password')
  const isApiRoute     = pathname.startsWith('/api')
  const isAuthRoute2   = pathname.startsWith('/auth/')
  const isPublicPage   = ['/privacy', '/terms'].includes(pathname)

  // Allow API routes, /auth/* routes, password-flow pages, and public legal pages through
  if (isApiRoute || isAuthRoute2 || isPasswordPage || isPublicPage) return supabaseResponse

  // If Supabase redirected to root/any page with a ?code= param, forward to /auth/confirm
  const code = request.nextUrl.searchParams.get('code')
  if (!user && code) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/confirm'
    url.search = `?code=${code}`
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated users to login
  if (!user && !isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login page
  if (user && isLoginPage) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|txt|ico)$).*)',
  ],
}
