import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * GET /auth/callback
 *
 * Handles both PKCE (code in query) and implicit (tokens in hash) magic link flows.
 * If code exchange fails we fall back to the client-side page to let the browser
 * client pick up the hash-fragment tokens.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  // Supabase sent back an error (expired OTP, already used, etc.)
  const supabaseError = searchParams.get('error')
  const supabaseErrorDescription = searchParams.get('error_description')
  if (supabaseError) {
    console.error('[auth/callback] Supabase error:', supabaseError, supabaseErrorDescription)
    const msg = supabaseErrorDescription ?? supabaseError
    return NextResponse.redirect(
      `${origin}/login?error=${encodeURIComponent(msg)}`,
    )
  }

  if (code) {
    const cookieStore = await cookies()

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              try {
                cookieStore.set(name, value, options)
              } catch {
                // Route handlers sometimes can't set cookies on certain Next.js versions
              }
            })
          },
        },
      },
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      return NextResponse.redirect(`${origin}${next}`)
    }

    console.error('[auth/callback] Code exchange failed:', error.message)
    // Fall through to client-side page with the code still in URL
    return NextResponse.redirect(
      `${origin}/auth/confirm?code=${code}&next=${encodeURIComponent(next)}`,
    )
  }

  // No code — might be implicit flow with hash fragment; send to client page
  return NextResponse.redirect(`${origin}/auth/confirm`)
}
