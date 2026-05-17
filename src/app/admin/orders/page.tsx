'use client'
import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Printer } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import CreateOrderModal from '@/components/admin/CreateOrderModal'
import { getAllOrders, updateOrderStatus, subscribeToAllOrders } from '@/lib/api/orders'
import { formatPrice } from '@/lib/payment'
import type { OrderStatus, Order } from '@/types'

const PAGE_SIZE = 30

const STATUS_FLOW: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']

const COLUMN_CONFIG: { status: OrderStatus; label: string; color: string; bg: string }[] = [
    { status: 'pending', label: 'Pending', color: '#B45309', bg: '#FEF9EE' },
    { status: 'confirmed', label: 'Confirmed', color: '#1B4332', bg: '#ECFDF5' },
    { status: 'preparing', label: 'Preparing', color: '#9333EA', bg: '#FAF5FF' },
    { status: 'out_for_delivery', label: 'Out for Delivery', color: '#2563EB', bg: '#EFF6FF' },
    { status: 'delivered', label: 'Delivered', color: '#15803D', bg: '#F0FDF4' },
]

// ── Window size hook ──────────────────────────────────────────
function useIsMobile() {
    const [mobile, setMobile] = useState(false)
    useEffect(() => {
        const check = () => setMobile(window.innerWidth < 768)
        check()
        window.addEventListener('resize', check)
        return () => window.removeEventListener('resize', check)
    }, [])
    return mobile
}

// ── Toast type ────────────────────────────────────────────────
interface ToastMsg { message: string; orderId: string }

export default function AdminOrdersPage() {
    const [orders, setOrders] = useState<Order[]>([])
    const [totalOrders, setTotalOrders] = useState(0)
    const [page, setPage] = useState(1)
    const [loadingMore, setLoadingMore] = useState(false)
    const [loading, setLoading] = useState(true)
    const [advancing, setAdvancing] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [toast, setToast] = useState<ToastMsg | null>(null)
    const [activeTab, setActiveTab] = useState<string>('pending')
    const [showCreateModal, setShowCreateModal] = useState(false)
    const [selectedPrintOrder, setSelectedPrintOrder] = useState<Order | null>(null)
    const isMobile = useIsMobile()

    // Keep a ref to latest orders so the realtime callback can merge correctly
    const ordersRef = useRef<Order[]>([])
    ordersRef.current = orders

    // Refs for scrolling to order cards
    const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map())

    // ── Initial load ─────────────────────────────────────────
    useEffect(() => {
        getAllOrders(1, PAGE_SIZE)
            .then(({ orders: data, total }) => {
                setOrders(data)
                setTotalOrders(total)
            })
            .catch(err => {
                console.error('Failed to load orders:', err)
                setError('Failed to load orders. Check your connection.')
            })
            .finally(() => setLoading(false))

        // ── Realtime subscription ─────────────────────────────
        const channel = subscribeToAllOrders((changed) => {
            setOrders(prev => {
                const idx = prev.findIndex(o => o.id === changed.id)
                if (idx >= 0) {
                    const next = [...prev]
                    next[idx] = { ...prev[idx], ...changed }
                    return next
                }
                // New order — play sound + flash + toast
                playNotification()
                flashTitle()
                setToast({
                    message: `New order from ${changed.customer_name} — Rs. ${changed.total?.toLocaleString()}`,
                    orderId: changed.id,
                })
                setTimeout(() => setToast(null), 6000)

                return [changed, ...prev]
            })
            setTotalOrders(t => t + 1)
        })

        return () => { channel.unsubscribe() }
    }, [])

    // ── Load more ────────────────────────────────────────────
    const loadMore = async () => {
        setLoadingMore(true)
        try {
            const nextPage = page + 1
            const { orders: more } = await getAllOrders(nextPage, PAGE_SIZE)
            setOrders(prev => [...prev, ...more])
            setPage(nextPage)
        } catch { /* silently fail */ }
        finally { setLoadingMore(false) }
    }

    // ── Notification helpers ──────────────────────────────────
    function playNotification() {
        try {
            const audio = new Audio('/sounds/notify.mp3')
            audio.volume = 0.6
            audio.play().catch(() => { })
        } catch { }
    }

    function flashTitle() {
        const original = document.title
        let i = 0
        const flash = setInterval(() => {
            document.title = i++ % 2 === 0 ? '🔔 NEW ORDER!' : original
            if (i > 8) { clearInterval(flash); document.title = original }
        }, 500)
    }

    function scrollToOrder(orderId: string) {
        const el = cardRefs.current.get(orderId)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }

    // ── Status helpers ────────────────────────────────────────
    const byStatus = (s: string) => orders.filter(o => o.status === s)

    const nextStatus = (current: string): OrderStatus | null => {
        const idx = STATUS_FLOW.indexOf(current as OrderStatus)
        if (idx >= 0 && idx < STATUS_FLOW.length - 1) return STATUS_FLOW[idx + 1]
        return null
    }

    const advance = async (orderId: string, currentStatus: string) => {
        const next = nextStatus(currentStatus)
        if (!next || advancing) return
        setAdvancing(orderId)
        setError(null)
        try {
            await updateOrderStatus(orderId, next)
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: next } : o))
        } catch (err) {
            const error = err as Error
            setError(`Failed to update order: ${error.message}`)
        } finally {
            setAdvancing(null)
        }
    }

    const cancel = async (orderId: string) => {
        if (advancing) return
        setAdvancing(orderId)
        setError(null)
        try {
            await updateOrderStatus(orderId, 'cancelled')
            setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o))
        } catch (err) {
            const error = err as Error
            setError(`Failed to cancel order: ${error.message}`)
        } finally {
            setAdvancing(null)
        }
    }

    // ── Stats ─────────────────────────────────────────────────
    const delivered = orders.filter(o => o.status === 'delivered')
    const revenue = delivered.reduce((s, o) => s + (o.total ?? 0), 0)
    const activeCount = orders.filter(o =>
        ['confirmed', 'preparing', 'out_for_delivery'].includes(o.status)
    ).length

    // ── Order card renderer ───────────────────────────────────
    const renderCard = (order: Order, colColor: string, colStatus: string) => {
        const isBeingAdvanced = advancing === order.id
        const next = nextStatus(order.status)
        return (
            <motion.div
                key={order.id}
                ref={el => { if (el) cardRefs.current.set(order.id, el) }}
                layout
                initial={{ opacity: 0, y: -16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                className="bg-white rounded-2xl p-4 text-xs space-y-2 shadow-sm border border-[#E7E0D8]"
            >
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm" style={{ color: colColor }}>
                            #{order.order_number}
                        </span>
                        <button
                            onClick={() => setSelectedPrintOrder(order)}
                            className="p-1 rounded-lg text-[#47423D] hover:bg-[#E7E0D8]/50 hover:text-[#1B4332] transition-colors flex items-center justify-center"
                            title="Print Receipt"
                            aria-label="Print receipt"
                        >
                            <Printer className="w-3.5 h-3.5" />
                        </button>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEF9EE] text-[#B45309] uppercase tracking-wider">
                        {order.order_type}
                    </span>
                </div>
                <p className="font-bold text-[#18181B] text-sm">{order.customer_name}</p>
                <p className="text-[#47423D] font-medium">{order.customer_phone}</p>
                {(order.order_items?.length ?? 0) > 0 && (
                    <p className="text-[#47423D] truncate">
                        {order.order_items?.map((i) => `${i.name}×${i.quantity}`).join(', ')}
                    </p>
                )}
                {order.delivery_address && (
                    <p className="text-[#47423D]/70 text-[11px] truncate">
                        📍 {order.delivery_address}
                    </p>
                )}
                <div className="font-bold text-sm pt-1 text-[#18181B]">
                    {formatPrice(order.total ?? 0)}
                    {order.payment_method === 'jazzcash' && (
                        <span className="ml-2 text-[10px] font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">JazzCash</span>
                    )}
                </div>
                <div className="border-t border-[#E7E0D8] pt-3 flex gap-2">
                    {next && (
                        <button
                            onClick={() => advance(order.id, order.status)}
                            disabled={!!advancing}
                            className="flex-1 py-2 rounded-xl text-[#0A1F13] text-xs font-bold transition-all gold-shimmer hover:scale-[1.02] disabled:opacity-50 disabled:cursor-not-allowed disabled:scale-100 flex items-center justify-center gap-1"
                        >
                            {isBeingAdvanced ? (
                                <span className="flex items-center gap-1">
                                    <span className="w-3 h-3 border-2 border-[#0A1F13]/30 border-t-[#0A1F13] rounded-full animate-spin" />
                                    Moving…
                                </span>
                            ) : (
                                `→ ${next.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}`
                            )}
                        </button>
                    )}
                    {colStatus !== 'delivered' && colStatus !== 'cancelled' && (
                        <button
                            onClick={() => cancel(order.id)}
                            disabled={!!advancing}
                            className="px-3 py-2 rounded-xl text-red-600 bg-red-50 hover:bg-red-100 text-[11px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            aria-label="Cancel order"
                        >
                            ✕
                        </button>
                    )}
                </div>
            </motion.div>
        )
    }

    const allTabsWithCancelled = [
        ...COLUMN_CONFIG,
        { status: 'cancelled' as OrderStatus, label: 'Cancelled', color: '#DC2626', bg: '#FEF2F2' },
    ]

    return (
        <AdminLayout>
            <div className="p-4 md:p-6 space-y-6 min-h-full">

                {/* ── Toast notification ──────────────────────────────── */}
                <AnimatePresence>
                    {toast && (
                        <motion.div
                            initial={{ x: 120, opacity: 0 }}
                            animate={{ x: 0, opacity: 1 }}
                            exit={{ x: 120, opacity: 0 }}
                            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
                            style={{
                                position: 'fixed', top: 80, right: 24, zIndex: 9999,
                                backgroundColor: '#D97706', color: '#1C2416',
                                borderRadius: 8, padding: '14px 20px',
                                boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
                                maxWidth: 340, minWidth: 260,
                            }}
                        >
                            <p className="font-bold text-sm mb-2">🔔 {toast.message}</p>
                            <button
                                onClick={() => {
                                    if (isMobile) {
                                        const order = orders.find(o => o.id === toast.orderId)
                                        if (order) setActiveTab(order.status)
                                    }
                                    scrollToOrder(toast.orderId)
                                    setToast(null)
                                }}
                                style={{
                                    background: '#1C2416', color: '#F59E0B',
                                    borderRadius: 6, padding: '4px 12px',
                                    fontWeight: 700, fontSize: 12,
                                }}
                            >
                                View →
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>

                {/* ── Header & Stats bar ────────────────────────────────────────── */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-4 p-5 rounded-3xl text-sm bg-gradient-to-br from-[#1B4332] to-[#0A1F13] text-white shadow-lg border border-[#E7E0D8]/10 flex-1">
                        <span className="font-medium text-white/90">📦 Total: <span className="text-white font-bold">{orders.length}</span></span>
                        <span className="font-medium text-[#F0B429]">💰 Revenue: <span className="font-bold">{formatPrice(revenue)}</span></span>
                        <span className="font-medium text-white/90">🔄 Active: <span className="text-white font-bold">{activeCount}</span></span>
                        <span className="font-medium text-white/90">✅ Delivered: <span className="text-white font-bold">{delivered.length}</span></span>
                        <span className="md:ml-auto flex items-center gap-1.5 text-white/75 text-xs font-semibold">
                            <span className="relative flex h-2 w-2">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                            </span>
                            Live updates
                        </span>
                    </div>

                    <button
                        onClick={() => setShowCreateModal(true)}
                        className="bg-[var(--green-base)] text-[var(--cream)] px-6 py-4 rounded-3xl font-[700] text-sm flex items-center justify-center gap-2 shadow-sm hover:bg-[var(--green-dark)] transition-colors whitespace-nowrap"
                    >
                        <span className="text-lg leading-none">+</span> New Order
                    </button>
                </div>

                {/* ── Error banner ─────────────────────────────────────── */}
                {error && (
                    <div className="bg-red-50 border border-red-300 text-red-700 rounded-xl px-4 py-3 text-sm font-medium flex items-center justify-between">
                        <span>⚠ {error}</span>
                        <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600 font-bold ml-4">✕</button>
                    </div>
                )}

                {/* ── Loading ──────────────────────────────────────────── */}
                {loading && (
                    <div className="flex justify-center py-16">
                        <div className="w-8 h-8 border-3 border-[#1B4332] border-t-transparent rounded-full animate-spin" />
                    </div>
                )}

                {!loading && (
                    <>
                        {/* ══════════════════════════════════════════════════════
                             MOBILE — tabbed layout
                        ══════════════════════════════════════════════════════ */}
                        {isMobile && (
                            <div>
                                {/* Tab row */}
                                <div style={{ overflowX: 'auto', borderBottom: '2px solid #E7E0D8', display: 'flex' }}>
                                    {allTabsWithCancelled.map(col => {
                                        const count = byStatus(col.status).length
                                        const active = activeTab === col.status
                                        return (
                                            <button
                                                key={col.status}
                                                onClick={() => setActiveTab(col.status)}
                                                style={{
                                                    flexShrink: 0,
                                                    padding: '12px 16px',
                                                    fontSize: 13,
                                                    fontWeight: 600,
                                                    color: active ? '#18181B' : '#47423D',
                                                    borderBottom: active ? `2px solid #D97706` : '2px solid transparent',
                                                    marginBottom: -2,
                                                    background: 'none',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    gap: 6,
                                                    whiteSpace: 'nowrap',
                                                }}
                                            >
                                                {col.label}
                                                {count > 0 && (
                                                    <span style={{
                                                        background: '#D97706', color: '#fff',
                                                        borderRadius: 20, padding: '1px 7px',
                                                        fontSize: 11, fontWeight: 700,
                                                    }}>
                                                        {count}
                                                    </span>
                                                )}
                                            </button>
                                        )
                                    })}
                                </div>

                                {/* Active tab content */}
                                {allTabsWithCancelled.map(col => (
                                    activeTab === col.status && (
                                        <div key={col.status} className="mt-4 space-y-3">
                                            <AnimatePresence>
                                                {byStatus(col.status).length === 0 ? (
                                                    <p className="text-[#47423D]/80 text-sm text-center py-12">No {col.label.toLowerCase()} orders</p>
                                                ) : (
                                                    byStatus(col.status).map(order =>
                                                        renderCard(order, col.color, col.status)
                                                    )
                                                )}
                                            </AnimatePresence>
                                        </div>
                                    )
                                ))}
                            </div>
                        )}

                        {/* ══════════════════════════════════════════════════════
                             DESKTOP — 5-column kanban
                        ══════════════════════════════════════════════════════ */}
                        {!isMobile && (
                            <div className="overflow-x-auto pb-4">
                                <div className="flex gap-4 min-w-max">
                                    {COLUMN_CONFIG.map(col => {
                                        const colOrders = byStatus(col.status)
                                        return (
                                            <div
                                                key={col.status}
                                                className="w-[260px] rounded-3xl p-4 border border-[#E7E0D8] flex-shrink-0"
                                                style={{ backgroundColor: col.bg }}
                                            >
                                                <div className="flex items-center gap-2 mb-4">
                                                    <h3 className="text-sm font-bold text-[#18181B] flex-1">{col.label}</h3>
                                                    <span
                                                        className="text-xs px-2.5 py-1 rounded-full text-white font-bold"
                                                        style={{ backgroundColor: col.color }}
                                                    >
                                                        {colOrders.length}
                                                    </span>
                                                </div>
                                                <div className="space-y-3 min-h-[200px]">
                                                    <AnimatePresence>
                                                        {colOrders.length === 0 && (
                                                            <p className="text-[#47423D]/80 text-xs text-center pt-8">No orders here</p>
                                                        )}
                                                        {colOrders.map(order =>
                                                            renderCard(order, col.color, col.status)
                                                        )}
                                                    </AnimatePresence>
                                                </div>
                                            </div>
                                        )
                                    })}

                                    {/* Cancelled column — shown only if there are any */}
                                    {orders.some(o => o.status === 'cancelled') && (
                                        <div className="w-[260px] rounded-3xl p-4 border border-red-200 flex-shrink-0 bg-red-50">
                                            <div className="flex items-center gap-2 mb-4">
                                                <h3 className="text-sm font-bold text-[#18181B] flex-1">Cancelled</h3>
                                                <span className="text-xs px-2.5 py-1 rounded-full text-white font-bold bg-red-500">
                                                    {byStatus('cancelled').length}
                                                </span>
                                            </div>
                                            <div className="space-y-3 min-h-[80px]">
                                                {byStatus('cancelled').map(order => (
                                                    <div key={order.id} className="bg-white rounded-2xl p-4 text-xs space-y-1 shadow-sm border border-red-100 opacity-60 relative group">
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-bold text-sm text-red-600">#{order.order_number}</span>
                                                            <button
                                                                onClick={() => setSelectedPrintOrder(order)}
                                                                className="p-1 rounded-lg text-red-600 hover:bg-red-50 transition-colors flex items-center justify-center"
                                                                title="Print Receipt"
                                                                aria-label="Print receipt"
                                                            >
                                                                <Printer className="w-3.5 h-3.5" />
                                                            </button>
                                                        </div>
                                                        <p className="font-bold text-[#18181B]">{order.customer_name}</p>
                                                        <p className="text-[#47423D]">{formatPrice(order.total ?? 0)}</p>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* ── Load more ────────────────────────────────────── */}
                        {orders.length < totalOrders && (
                            <div className="flex flex-col items-center gap-2 pt-2">
                                <p className="text-sm text-[#47423D]">
                                    Showing <strong>{orders.length}</strong> of <strong>{totalOrders}</strong> orders
                                </p>
                                <button
                                    onClick={loadMore}
                                    disabled={loadingMore}
                                    className="px-6 py-2.5 rounded-xl bg-[#1B4332] text-white font-bold text-sm hover:bg-[#133024] transition-colors disabled:opacity-60 flex items-center gap-2"
                                >
                                    {loadingMore ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                                            Loading…
                                        </>
                                    ) : 'Load more orders'}
                                </button>
                            </div>
                        )}
                    </>
                )}

                <CreateOrderModal 
                    isOpen={showCreateModal} 
                    onClose={() => setShowCreateModal(false)} 
                />

                {/* ── Printable receipt modal ──────────────────────────── */}
                <AnimatePresence>
                    {selectedPrintOrder && (
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:static"
                        >
                            {/* Inject print-specific styles dynamically */}
                            <style dangerouslySetInnerHTML={{ __html: `
                                @media print {
                                    body * {
                                        visibility: hidden !important;
                                    }
                                    #print-receipt-portal, #print-receipt-portal * {
                                        visibility: visible !important;
                                    }
                                    #print-receipt-portal {
                                        position: absolute !important;
                                        left: 0 !important;
                                        top: 0 !important;
                                        width: 100% !important;
                                        max-width: 100% !important;
                                        padding: 0 !important;
                                        margin: 0 !important;
                                        background: white !important;
                                        color: black !important;
                                        box-shadow: none !important;
                                        border: none !important;
                                    }
                                }
                            `}} />

                            <motion.div
                                initial={{ opacity: 0, scale: 0.95, y: 10 }}
                                animate={{ opacity: 1, scale: 1, y: 0 }}
                                exit={{ opacity: 0, scale: 0.95, y: 10 }}
                                transition={{ type: 'spring', damping: 25, stiffness: 350 }}
                                className="bg-white rounded-3xl shadow-xl max-w-md w-full overflow-hidden border border-[#E7E0D8] flex flex-col max-h-[85vh] my-4 print:hidden"
                            >
                                {/* Modal Header */}
                                <div className="p-4 border-b border-[#E7E0D8] flex items-center justify-between bg-gradient-to-r from-[#1B4332] to-[#0A1F13] text-white shrink-0">
                                    <div className="flex items-center gap-2">
                                        <Printer size={18} className="text-[#F0B429]" />
                                        <span className="font-bold text-sm">Print Receipt</span>
                                    </div>
                                    <button
                                        onClick={() => setSelectedPrintOrder(null)}
                                        className="text-white/80 hover:text-white font-bold font-mono text-base"
                                    >
                                        ✕
                                    </button>
                                </div>

                                {/* Print Preview Container */}
                                <div className="p-4 sm:p-5 bg-[#F9F6F0] flex-1 overflow-y-auto min-h-0 flex flex-col items-center">
                                    <div
                                        id="print-receipt-portal"
                                        className="bg-white p-4 sm:p-5 shadow-sm border border-[#E7E0D8] rounded-xl text-black font-mono text-[11px] space-y-3 max-w-[320px] w-full"
                                    >
                                        {/* Receipt details */}
                                        <div className="text-center space-y-1">
                                            <h2 className="text-base font-black tracking-wider text-[#1B4332] uppercase">ZAITOON</h2>
                                            <p className="text-[9px] text-gray-500 font-bold uppercase tracking-widest">Deliciously Yours</p>
                                            <div className="border-b border-dashed border-gray-400 my-2" />
                                        </div>

                                        <div className="space-y-1">
                                            <p><strong>Order No:</strong> #{selectedPrintOrder.order_number}</p>
                                            <p><strong>Date:</strong> {new Date(selectedPrintOrder.created_at).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' })}</p>
                                            <p><strong>Type:</strong> {selectedPrintOrder.order_type.toUpperCase()}</p>
                                            <p><strong>Customer:</strong> {selectedPrintOrder.customer_name}</p>
                                            <p><strong>Phone:</strong> {selectedPrintOrder.customer_phone}</p>
                                            {selectedPrintOrder.delivery_address && (
                                                <p className="leading-tight"><strong>Address:</strong> {selectedPrintOrder.delivery_address}</p>
                                            )}
                                        </div>

                                        <div className="border-b border-dashed border-gray-400 my-2" />

                                        {/* Items Table */}
                                        <div className="space-y-2">
                                            <div className="flex justify-between font-bold text-[9px] text-gray-500 uppercase">
                                                <span>Item</span>
                                                <span className="text-right">Qty × Price</span>
                                            </div>
                                            <div className="border-b border-dashed border-gray-300 my-1" />
                                            {selectedPrintOrder.order_items?.map((item, idx) => (
                                                <div key={idx} className="flex justify-between items-start gap-2">
                                                    <div className="flex-1">
                                                        <span className="font-bold">{item.name}</span>
                                                        {item.size && <span className="text-[9px] text-gray-500 block">({item.size})</span>}
                                                    </div>
                                                    <div className="text-right whitespace-nowrap">
                                                        {item.quantity} × {formatPrice(item.unit_price)}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="border-b border-dashed border-gray-400 my-2" />

                                        {/* Financial summary */}
                                        <div className="space-y-1">
                                            <div className="flex justify-between">
                                                <span>Subtotal</span>
                                                <span>{formatPrice(selectedPrintOrder.subtotal ?? 0)}</span>
                                            </div>
                                            {selectedPrintOrder.delivery_fee > 0 && (
                                                <div className="flex justify-between">
                                                    <span>Delivery Fee</span>
                                                    <span>{formatPrice(selectedPrintOrder.delivery_fee)}</span>
                                                </div>
                                            )}
                                            {(selectedPrintOrder.loyalty_discount > 0 || selectedPrintOrder.tier_discount > 0) && (
                                                <div className="flex justify-between text-red-600">
                                                    <span>Discount</span>
                                                    <span>-{formatPrice(selectedPrintOrder.loyalty_discount + selectedPrintOrder.tier_discount)}</span>
                                                </div>
                                            )}
                                            <div className="border-b border-dashed border-gray-300 my-1" />
                                            <div className="flex justify-between font-black text-xs pt-1">
                                                <span>GRAND TOTAL</span>
                                                <span>{formatPrice(selectedPrintOrder.total ?? 0)}</span>
                                            </div>
                                        </div>

                                        <div className="border-b border-dashed border-gray-400 my-2" />

                                        <div className="text-center space-y-1 text-[9px] text-gray-600">
                                            <p className="font-bold uppercase tracking-wider">Payment: {selectedPrintOrder.payment_method.toUpperCase()}</p>
                                            <div className="border-b border-dashed border-gray-300 my-1" />
                                            <p className="italic">Thank you for ordering from Zaitoon!</p>
                                            <p className="text-[8px] text-gray-400">Live Updates Enabled</p>
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Actions */}
                                <div className="p-4 border-t border-[#E7E0D8] flex gap-3 bg-white shrink-0">
                                    <button
                                        onClick={() => setSelectedPrintOrder(null)}
                                        className="flex-1 py-3 rounded-xl border border-[#E7E0D8] font-bold text-xs hover:bg-[#F9F6F0] transition-colors"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        onClick={() => window.print()}
                                        className="flex-1 py-3 rounded-xl text-[#0A1F13] font-bold text-xs flex items-center justify-center gap-1.5 transition-all gold-shimmer hover:scale-[1.02]"
                                    >
                                        <Printer size={14} /> Print Now
                                    </button>
                                </div>
                            </motion.div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </AdminLayout>
    )
}

