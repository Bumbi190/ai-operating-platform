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
  const isAuthRoute    = pathname.startsWith('/login')
  const isApiRoute     = pathname.startsWith('/api')
  const isAuthRoute2   = pathname.startsWith('/auth/')
  const isPublicPage   = ['/privacy', '/terms'].includes(pathname)
  // Allow unauthenticated access to forgot/update-password pages.
  // /update-password handles its own code exchange — the catch-all below must
  // NOT intercept ?code= on this path, or it will send recovery codes to /auth/confirm.
  const isPasswordPage = pathname.startsWith('/forgot-password') || pathname.startsWith('/update-password')

  // Allow API routes, /auth/* routes, password pages, and public legal pages through
  if (isApiRoute || isAuthRoute2 || isPasswordPage || isPublicPage) return supabaseResponse

  // If Supabase redirected to an unexpected page with a ?code= param, forward to /auth/confirm.
  // (Does not apply to /update-password — handled above.)
  const code = request.nextUrl.searchParams.get('code')
  if (!user && code) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/confirm'
    url.search = `?code=${code}`
    return NextResponse.redirect(url)
  }

  // Redirect unauthenticated users to login
  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Redirect authenticated users away from login page
  if (user && isAuthRoute) {
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
