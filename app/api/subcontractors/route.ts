import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(request: NextRequest) {
  try {
    // 1. Verify caller is authenticated admin
    const supabase = await createServerClient()
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError || !user) {
      return NextResponse.json(
        { error: 'Non authentifié' },
        { status: 401 }
      )
    }

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || profile?.role !== 'admin') {
      return NextResponse.json(
        { error: 'Accès interdit : réservé aux administrateurs' },
        { status: 403 }
      )
    }

    // 2. Validate input
    const body = await request.json()
    const { email, full_name, password } = body

    if (!email || !full_name) {
      return NextResponse.json(
        { error: 'Email et nom complet obligatoires' },
        { status: 400 }
      )
    }

    // 3. Initialize admin client with service role key
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

    if (!serviceRoleKey || !supabaseUrl) {
      return NextResponse.json(
        { error: 'Configuration serveur incomplète (SUPABASE_SERVICE_ROLE_KEY)' },
        { status: 500 }
      )
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })

    // Temporary password or provided password
    const userPassword = password || `ST-${Math.random().toString(36).slice(-8)}!A1`

    // Create user in auth.users
    const { data: newUserData, error: createError } = await adminClient.auth.admin.createUser({
      email,
      password: userPassword,
      email_confirm: true,
      user_metadata: {
        full_name,
      },
    })

    if (createError) {
      return NextResponse.json(
        { error: createError.message || 'Erreur lors de la création du compte' },
        { status: 400 }
      )
    }

    const newUserId = newUserData.user.id

    // Update or ensure profile has subcontractor role and full_name
    const { data: updatedProfile, error: updateProfileError } = await adminClient
      .from('profiles')
      .upsert({
        id: newUserId,
        email,
        full_name,
        role: 'subcontractor',
        active: true,
      })
      .select()
      .single()

    if (updateProfileError) {
      return NextResponse.json(
        {
          success: true,
          user: newUserData.user,
          tempPassword: userPassword,
          warning: 'Compte créé mais profil non mis à jour automatiquement',
        },
        { status: 201 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        user: newUserData.user,
        profile: updatedProfile,
        tempPassword: userPassword,
      },
      { status: 201 }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur interne du serveur'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
