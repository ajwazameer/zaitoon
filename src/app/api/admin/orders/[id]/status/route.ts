import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'

const VALID_STATUSES = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered', 'cancelled']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // ── 1. Auth: validate admin session ───────────────────────────
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
      .select('token, admin_id, role, expires_at')
      .eq('token', sessionToken)
      .single()

    if (sessionError || !session) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 })
    }

    if (new Date(session.expires_at) < new Date()) {
      return NextResponse.json({ error: 'Session expired' }, { status: 401 })
    }

    // ── 2. Validate input ─────────────────────────────────────────
    const { id: orderId } = await params
    if (!orderId || typeof orderId !== 'string') {
      return NextResponse.json({ error: 'Invalid order ID' }, { status: 400 })
    }

    const body = await req.json()
    const { status } = body

    if (!status || !VALID_STATUSES.includes(status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      )
    }

    // ── 3. Fetch current order to validate transition ─────────────
    const { data: order, error: fetchError } = await adminSupabase
      .from('orders')
      .select('id, status, customer_id, total, loyalty_points_awarded')
      .eq('id', orderId)
      .single()

    if (fetchError || !order) {
      return NextResponse.json({ error: 'Order not found' }, { status: 404 })
    }

    // Prevent updating already-delivered or already-cancelled orders
    if (order.status === 'delivered' || order.status === 'cancelled') {
      return NextResponse.json(
        { error: `Cannot update a ${order.status} order` },
        { status: 409 }
      )
    }

    // ── 4. Update order status (DB trigger handles loyalty points) ─
    const { data: updated, error: updateError } = await adminSupabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .select()
      .single()

    if (updateError) {
      console.error('Order status update failed:', updateError)
      return NextResponse.json({ error: 'Failed to update order status' }, { status: 500 })
    }

    return NextResponse.json({ success: true, order: updated })

  } catch (err) {
    console.error('Order status API error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
