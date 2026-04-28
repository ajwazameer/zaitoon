import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { hashPassword } from '@/lib/utils/password'

/**
 * POST /api/admin/change-password
 * Body: { currentPassword: string, newPassword: string }
 * Requires: valid admin_session cookie
 */
export async function POST(req: NextRequest) {
  try {
    // ── Validate session ───────────────────────────────────────────
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get('admin_session')?.value

    if (!sessionToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const adminSupabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    const { data: session, error: sessionError } = await adminSupabase
      .from('admin_sessions')
      .select('admin_id, expires_at')
      .eq('token', sessionToken)
      .single()

    if (sessionError || !session || new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 })
    }

    // ── Validate input ─────────────────────────────────────────────
    const { newPassword } = await req.json()

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'New password must be at least 8 characters' },
        { status: 400 }
      )
    }

    // ── Hash and save new password ─────────────────────────────────
    const hashed = await hashPassword(newPassword)
    const { error: updateError } = await adminSupabase
      .from('admin_users')
      .update({ password: hashed })
      .eq('id', session.admin_id)

    if (updateError) {
      console.error('Password change failed:', updateError)
      return NextResponse.json({ error: 'Failed to update password' }, { status: 500 })
    }

    return NextResponse.json({ success: true, message: 'Password updated successfully' })

  } catch (err) {
    console.error('Change password error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
