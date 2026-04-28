import { createClient } from '@/lib/supabase/client'
import type { CartItem } from '@/types'

const supabase = createClient()

export interface CreateOrderPayload {
    customerName: string
    customerPhone: string
    customerId?: string
    branchId: string
    orderType: 'delivery' | 'takeaway' | 'dine-in'
    deliveryAddress?: string
    deliveryLat?: number
    deliveryLng?: number
    distanceKm?: number
    items: CartItem[]
    subtotal: number
    deliveryFee: number
    loyaltyDiscount: number
    tierDiscount?: number
    total: number
    paymentMethod: 'jazzcash' | 'cod'
    notes?: string
}

export async function createOrder(payload: CreateOrderPayload) {
    // 1. Create the order record
    const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
            customer_name: payload.customerName,
            customer_phone: payload.customerPhone,
            customer_id: payload.customerId ?? null,
            branch_id: payload.branchId,
            order_type: payload.orderType,
            delivery_address: payload.deliveryAddress ?? null,
            delivery_lat: payload.deliveryLat ?? null,
            delivery_lng: payload.deliveryLng ?? null,
            distance_km: payload.distanceKm ?? null,
            subtotal: payload.subtotal,
            delivery_fee: payload.deliveryFee,
            loyalty_discount: payload.loyaltyDiscount,
            tier_discount: payload.tierDiscount ?? 0,
            total: payload.total,
            payment_method: payload.paymentMethod,
            notes: payload.notes ?? null,
            status: 'pending',
            payment_status: 'pending',
        })
        .select()
        .single()

    if (orderError) throw orderError

    // 2. Insert order items
    const orderItems = payload.items.map(item => ({
        order_id: order.id,
        menu_item_id: item.menuItemId,
        name: item.name,
        size: item.size ?? null,
        quantity: item.quantity,
        unit_price: item.unitPrice,
        subtotal: item.subtotal,
    }))

    const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems)

    if (itemsError) throw itemsError

    return order
}

export async function getOrderById(orderId: string) {
    const { data, error } = await supabase
        .from('orders')
        .select(`
      *,
      branches (name, address, phone, whatsapp),
      order_items (*)
    `)
        .eq('id', orderId)
        .single()

    if (error) throw error
    return data
}

export async function getOrderByNumber(orderNumber: string) {
    const { data, error } = await supabase
        .from('orders')
        .select(`
      *,
      branches (name, address, phone, whatsapp),
      order_items (*)
    `)
        .eq('order_number', orderNumber)
        .single()

    if (error) throw error
    return data
}

export async function updateOrderStatus(orderId: string, status: string) {
    const res = await fetch(`/api/admin/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
        credentials: 'include', // sends admin_session cookie
    })

    if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Failed to update order status (${res.status})`)
    }
}

// Admin — get all orders with pagination
export async function getAllOrders(page = 1, limit = 30) {
    const from = (page - 1) * limit
    const { data, error, count } = await supabase
        .from('orders')
        .select(`
      *,
      branches (name),
      order_items (name, quantity, unit_price)
    `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, from + limit - 1)

    if (error) throw error
    return { orders: data ?? [], total: count ?? 0 }
}

// Realtime subscription for order status
export function subscribeToOrder(orderId: string, callback: (order: any) => void) {
    return supabase
        .channel(`order-${orderId}`)
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` },
            payload => callback(payload.new)
        )
        .subscribe()
}

// Realtime subscription for admin (new orders + status updates)
export function subscribeToAllOrders(callback: (order: any) => void) {
    return supabase
        .channel('all-orders')
        .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'orders' },
            payload => callback(payload.new)
        )
        .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'orders' },
            payload => callback(payload.new)
        )
        .subscribe()
}
