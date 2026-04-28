import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export async function getOrCreateCustomer(phone: string, name: string) {
    // Try to find existing customer
    const { data: existing, error: existingError } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle()

    if (existingError) throw existingError

    if (existing) {
        // Update name if provided
        if (name && existing.name !== name) {
            await supabase.from('customers').update({ name }).eq('id', existing.id)
        }
        return existing
    }

    // Create new customer
    const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase()
    const { data: newCustomer, error } = await supabase
        .from('customers')
        .insert({ phone, name, referral_code: referralCode } as any)
        .select()
        .maybeSingle()

    if (error) throw error
    return newCustomer
}

export async function getCustomerByPhone(phone: string) {
    const { data, error } = await supabase
        .from('customers')
        .select('*')
        .eq('phone', phone)
        .limit(1)
        .maybeSingle()

    if (error) throw error
    return data
}

export async function getLoyaltyHistory(customerId: string) {
    const { data, error } = await supabase
        .from('loyalty_transactions')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(20)

    if (error) throw error
    return data
}

/**
 * @deprecated — Loyalty points are now awarded by the PostgreSQL trigger
 * `trg_loyalty_on_order_status` when an order status changes to 'confirmed'.
 * Cancellations also auto-deduct via the same trigger.
 * This function is kept as a no-op to avoid import errors during migration.
 */
export async function addLoyaltyPoints(
    _customerId: string,
    _orderId: string,
    _points: number,
    _total: number
): Promise<void> {
    // No-op: handled by DB trigger fn_loyalty_on_order_status_change()
    return
}

export async function redeemLoyaltyPoints(customerId: string, orderId: string | null, points: number) {
    await supabase.from('loyalty_transactions').insert({
        customer_id: customerId,
        order_id: orderId,
        type: 'redeemed',
        points: -points,
        description: 'Redeemed for discount',
    })

    const { data: customer } = await supabase
        .from('customers')
        .select('loyalty_points')
        .eq('id', customerId)
        .single()

    if (customer) {
        await supabase.from('customers').update({
            loyalty_points: Math.max(0, customer.loyalty_points - points),
        }).eq('id', customerId)
    }
}


function calculateTier(points: number): string {
    if (points >= 5000) return 'platinum'
    if (points >= 1500) return 'gold'
    if (points >= 500) return 'silver'
    return 'bronze'
}

// ── Referral processing ────────────────────────────────────────
export async function processReferral(
    newCustomerId: string,
    referralCode: string
) {
    try {
        // Find referrer by code
        const { data: referrer } = await supabase
            .from('customers')
            .select('id, loyalty_points, total_orders')
            .eq('referral_code', referralCode.toUpperCase())
            .single()

        if (!referrer) return          // invalid code, silently bail

        // Prevent self-referral
        if (referrer.id === newCustomerId) return

        const BONUS = 50

        // ── Award points to referrer ─────────────────────────
        await supabase.from('loyalty_transactions').insert({
            customer_id: referrer.id,
            type: 'bonus',
            points: BONUS,
            description: 'Referral bonus — friend placed first order',
        })
        await supabase
            .from('customers')
            .update({ loyalty_points: referrer.loyalty_points + BONUS })
            .eq('id', referrer.id)

        // ── Award points to new customer ─────────────────────
        const { data: newCust } = await supabase
            .from('customers')
            .select('loyalty_points')
            .eq('id', newCustomerId)
            .single()

        await supabase.from('loyalty_transactions').insert({
            customer_id: newCustomerId,
            type: 'bonus',
            points: BONUS,
            description: 'Welcome bonus — referred by friend',
        })
        await supabase
            .from('customers')
            .update({
                loyalty_points: (newCust?.loyalty_points ?? 0) + BONUS,
                referred_by: referrer.id,
            })
            .eq('id', newCustomerId)

    } catch (err) {
        console.error('Referral processing failed (non-blocking):', err)
        // Intentionally swallowed — referral failure must never break an order
    }
}

