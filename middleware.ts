import { NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'
import { createServerClient } from '@supabase/ssr'

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Refresh session and get updated response with cookies
  const response = await updateSession(request)

  // Build a Supabase client scoped to this request to read the user
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Not authenticated → redirect to /login (except for /login itself)
  if (!user && pathname !== '/login') {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    return NextResponse.redirect(loginUrl)
  }

  if (user) {
    // Fetch the user profile to get the role
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    // If profile is not found or error, let the user stay on login or fall back to /login
    if (!profile) {
      if (pathname === '/login') {
        return response
      }
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      return NextResponse.redirect(loginUrl)
    }

    const role = profile.role as 'admin' | 'subcontractor'

    // Root path → redirect by role
    if (pathname === '/') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = role === 'admin' ? '/admin/batches' : '/subcontractor/batches'
      return NextResponse.redirect(redirectUrl)
    }

    // /admin/* → admin only
    if (pathname.startsWith('/admin') && role !== 'admin') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/subcontractor/batches'
      return NextResponse.redirect(redirectUrl)
    }

    // /subcontractor/* → subcontractor only
    if (pathname.startsWith('/subcontractor') && role !== 'subcontractor') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = '/admin/batches'
      return NextResponse.redirect(redirectUrl)
    }

    // /login while authenticated → redirect to role dashboard
    if (pathname === '/login') {
      const redirectUrl = request.nextUrl.clone()
      redirectUrl.pathname = role === 'admin' ? '/admin/batches' : '/subcontractor/batches'
      return NextResponse.redirect(redirectUrl)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets (svg, png, jpg, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
