import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { hashPassword, verifyPassword, isPlainText } from '@/lib/utils/password'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json()

    if (!username?.trim() || !password?.trim()) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      )
    }

    // Constant-time artificial delay — brute force / timing attack protection
    await new Promise(r => setTimeout(r, 400))

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Fetch user by username only (no password in query — prevents timing leak)
    const { data: adminUser, error } = await adminSupabase
      .from('admin_users')
      .select('id, username, password, role, name, is_active')
      .eq('username', username.toLowerCase().trim())
      .eq('is_active', true)
      .single()

    if (error || !adminUser) {
      // Constant-time: still run a dummy hash to prevent timing-based user enumeration
      await hashPassword('dummy-timing-guard')
      console.log('Login failed for:', username)
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // ── Password verification ──────────────────────────────────────────────────
    let passwordValid = false

    if (isPlainText(adminUser.password)) {
      // Legacy plain-text password — compare directly
      passwordValid = adminUser.password === password.trim()

      if (passwordValid) {
        // ── Lazy upgrade: hash and save immediately ────────────────────────────
        try {
          const hashed = await hashPassword(password.trim())
          await adminSupabase
            .from('admin_users')
            .update({ password: hashed })
            .eq('id', adminUser.id)
          console.log(`Password upgraded to scrypt hash for user: ${adminUser.username}`)
        } catch (upgradeErr) {
          // Non-blocking — login still succeeds even if upgrade fails
          console.error('Password upgrade failed (non-critical):', upgradeErr)
        }
      }
    } else {
      // Modern scrypt hash — use timing-safe comparison
      passwordValid = await verifyPassword(password.trim(), adminUser.password)
    }

    if (!passwordValid) {
      console.log('Login failed (wrong password) for:', username)
      return NextResponse.json(
        { error: 'Invalid username or password' },
        { status: 401 }
      )
    }

    // ── Create session ─────────────────────────────────────────────────────────
    const sessionToken = crypto.randomUUID()
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()

    const { error: sessionError } = await adminSupabase
      .from('admin_sessions')
      .insert({
        token:      sessionToken,
        admin_id:   adminUser.id,
        role:       adminUser.role,
        name:       adminUser.name,
        expires_at: expiresAt,
      })

    if (sessionError) {
      console.error('Session creation failed:', sessionError)
      return NextResponse.json(
        { error: 'Login failed. Please try again.' },
        { status: 500 }
      )
    }

    // ── Set HTTP-only secure cookie ────────────────────────────────────────────
    const cookieStore = await cookies()
    cookieStore.set('admin_session', sessionToken, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   60 * 60 * 8,
      path:     '/',
    })

    console.log('Login success:', adminUser.username, adminUser.role)

    return NextResponse.json({
      success: true,
      role:    adminUser.role,
      name:    adminUser.name,
    })

  } catch (err) {
    console.error('Login error:', err)
    return NextResponse.json(
      { error: 'Something went wrong' },
      { status: 500 }
    )
  }
}
