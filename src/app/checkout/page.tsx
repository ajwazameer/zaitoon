'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { Truck, Store, Utensils, Check, MapPin } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import { useCartStore } from '@/store/useCartStore'
import { useLocationStore } from '@/store/useLocationStore'
import { getBranches } from '@/lib/api/branches'
import { createOrder } from '@/lib/api/orders'
import {
    getOrCreateCustomer,
    redeemLoyaltyPoints,
    getCustomerByPhone,
    processReferral,
} from '@/lib/api/customers'
import { formatPrice } from '@/lib/payment'
import { buildWhatsAppURL } from '@/lib/whatsapp'
import {
    haversineDistance,
    calculateDeliveryFee,
    MAX_DELIVERY_KM,
} from '@/lib/distance'
import {
    applyTierPerks,
    calculateEarnedPoints,
    maxRedeemablePoints,
    tierBadge,
} from '@/lib/utils/loyalty'
import { useAuthStore } from '@/store/useAuthStore'
import LocationModal from '@/components/LocationModal'
import { toast } from 'sonner'
import { useLanguageStore } from '@/store/useLanguageStore'
import { translations } from '@/lib/translations'

const LeafletCheckoutMap = dynamic(
    () => import('@/components/map/LeafletCheckoutMap'),
    { ssr: false }
)

// ── LOYALTY CONSTANTS ─────────────────────────────────────────
const POINT_VALUE_IN_RS = 1

// ── PHONE VALIDATION ─────────────────────────────────────────
function isValidPakistaniPhone(raw: string): boolean {
    const digits = raw.replace(/\D/g, '')
    // Must be 11 digits starting with 03, or 12 digits starting with 923
    if (digits.startsWith('0') && digits.length === 11 && digits.startsWith('03')) return true
    if (digits.startsWith('92') && digits.length === 12) return true
    return false
}

function phoneError(raw: string): string | null {
    if (!raw) return null
    const digits = raw.replace(/\D/g, '')
    if (digits.length < 4) return null // still typing, don't nag yet
    if (!isValidPakistaniPhone(raw)) return 'Enter a valid Pakistani mobile number (e.g. 0329-1330234)'
    return null
}

// ── PHONE NORMALISATION ───────────────────────────────────────
function normalisePhone(raw: string): string {
    const digits = raw.replace(/\D/g, '')
    if (digits.startsWith('92')) return `+${digits}`
    if (digits.startsWith('0')) return `+92${digits.slice(1)}`
    return `+92${digits}`
}

// ── WHATSAPP — open via anchor (never blocked by browsers) ───
function openWhatsApp(url: string) {
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
}

export default function CheckoutPage() {
    const { language, isRTL } = useLanguageStore()
    const t = translations[language]

    const STEPS = [t.contact, t.delivery, t.payment, t.reviewConfirm]

    const router = useRouter()
    const { items, subtotal, clearCart } = useCartStore()
    const cartItems = items
    const cartSubtotal = subtotal()

    const [step, setStep] = useState(0)
    const [mounted, setMounted] = useState(false)

    useEffect(() => { setMounted(true) }, [])

    // Redirect empty cart (not during success step)
    useEffect(() => {
        if (mounted && cartItems.length === 0 && step !== 4) {
            router.replace('/menu')
        }
    }, [mounted, cartItems.length, step, router])

    const { customer, isAuthenticated } = useAuthStore()
    const [authModalOpen, setAuthModalOpen] = useState(false)

    // ── Step 0 – Contact ──────────────────────────────────────
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [availablePoints, setAvailablePoints] = useState(0)
    const [customerTier, setCustomerTier] = useState('bronze')
    const [isReturning, setIsReturning] = useState(false)
    const [lookingUp, setLookingUp] = useState(false)
    const { lookupOrCreateCustomer, refreshCustomer } = useAuthStore()

    // Pre-fill from stored session
    useEffect(() => {
        if (customer) {
            setCustomerName(customer.name || '')
            setCustomerPhone(customer.phone ? customer.phone.replace('+92', '0') : '')
            setAvailablePoints(customer.loyaltyPoints || 0)
            setCustomerTier(customer.tier || 'bronze')
            if (customer.totalOrders > 0) setIsReturning(true)
        }
    }, [customer])

    // ── Step 1 – Delivery ─────────────────────────────────────
    const [branches, setBranches] = useState<any[]>([])
    const [selectedBranchId, setSelectedBranchId] = useState('')
    const [orderType, setOrderType] = useState<'delivery' | 'takeaway' | 'dine-in'>('delivery')
    const [deliveryAddress, setDeliveryAddress] = useState('')
    const [manualAddress, setManualAddress] = useState('')  // user-typed house/street detail
    const [mapCoords, setMapCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [distanceKm, setDistanceKm] = useState<number | null>(null)
    const [deliveryFee, setDeliveryFee] = useState<number | null>(null)
    const [outOfRange, setOutOfRange] = useState(false)
    const [locLoading, setLocLoading] = useState(false)

    // Read pre-detected location from store
    const {
        coords: storedCoords,
        nearestBranchId: storedBranchId,
        nearestBranchName: storedBranchName,
        deliveryAddress: storedDeliveryAddress,
        distanceKm: storedDistance,
        deliveryFee: storedFee,
        outOfRange: storedOutOfRange,
        locationSet,
    } = useLocationStore()

    // Location modal state
    const [locationModalOpen, setLocationModalOpen] = useState(false)

    // Load branches, then pre-populate from location store if available
    useEffect(() => {
        getBranches().then(data => {
            if (!data?.length) return
            setBranches(data)

            if (locationSet && storedBranchId && data.find((b: any) => b.id === storedBranchId)) {
                setSelectedBranchId(storedBranchId)
                if (storedCoords) {
                    setMapCoords(storedCoords)
                    setDistanceKm(storedDistance)
                    setDeliveryFee(storedFee)
                    setOutOfRange(storedOutOfRange)
                    // Pre-fill manual address with the detected address
                    if (storedDeliveryAddress) setManualAddress(storedDeliveryAddress)
                }
            } else {
                setSelectedBranchId(data[0].id)
            }
        }).catch(() => { })
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])  // intentionally run once on mount

    // Recalculate distance & fee whenever map pin or branch changes
    useEffect(() => {
        if (orderType !== 'delivery' || !mapCoords || !selectedBranchId || branches.length === 0) return
        const branch = branches.find((b: any) => b.id === selectedBranchId)
        if (!branch?.lat || !branch?.lng) return

        const km = haversineDistance(mapCoords.lat, mapCoords.lng, branch.lat, branch.lng)
        const rounded = Math.round(km * 10) / 10
        setDistanceKm(rounded)

        if (km > MAX_DELIVERY_KM) {
            setOutOfRange(true)
            setDeliveryFee(null)
        } else {
            setOutOfRange(false)
            setDeliveryFee(calculateDeliveryFee(km))
        }
    }, [mapCoords, selectedBranchId, branches, orderType])

    // Reset fee when switching away from delivery
    useEffect(() => {
        if (orderType !== 'delivery') {
            setDistanceKm(null)
            setDeliveryFee(null)
            setOutOfRange(false)
        }
    }, [orderType])

    const handleUseLocation = () => {
        if (!navigator.geolocation) {
            toast.error('Geolocation is not supported by your browser.')
            return
        }
        setLocLoading(true)
        navigator.geolocation.getCurrentPosition(
            pos => {
                setMapCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude })
                if (!deliveryAddress) setDeliveryAddress('Current location')
                setLocLoading(false)
            },
            () => {
                toast.error('Could not detect location. Please pin it on the map.')
                setLocLoading(false)
            },
            { timeout: 8000 }
        )
    }

    // Phone blur → look up returning customer
    const handlePhoneBlur = async () => {
        const digits = customerPhone.replace(/\D/g, '')
        if (digits.length < 10) return

        setLookingUp(true)
        try {
            // Note: pass customerName if it exists, otherwise it defaults to 'Customer' in API
            const found = await lookupOrCreateCustomer(customerPhone, customerName)

            if (found.totalOrders > 0) {
                // Returning customer
                setIsReturning(true)
                setCustomerName(found.name)  // auto-fill name
                setAvailablePoints(found.loyaltyPoints)
                setCustomerTier(found.tier)
            } else {
                setIsReturning(false)
            }
        } catch (err) {
            console.error('Lookup failed:', err)
        } finally {
            setLookingUp(false)
        }
    }

    // ── Step 2 – Payment ──────────────────────────────────────
    const [payMethod, setPayMethod] = useState<'jazzcash' | 'cod'>('cod')
    const [loyaltyRedeem, setLoyaltyRedeem] = useState(0)

    // ── Computed totals ───────────────────────────────────────
    const baseDeliveryFee = orderType === 'delivery' ? (deliveryFee ?? storedFee ?? 0) : 0
    const { tierDiscount, finalDeliveryFee } = applyTierPerks(customerTier, cartSubtotal, baseDeliveryFee)
    const loyaltyDiscount = loyaltyRedeem * POINT_VALUE_IN_RS
    const resolvedDeliveryFee = finalDeliveryFee
    const total = Math.max(0, cartSubtotal + resolvedDeliveryFee - loyaltyDiscount - tierDiscount)

    const [placing, setPlacing] = useState(false)

    // ── PLACE ORDER ───────────────────────────────────────────
    const placeOrder = async () => {
        if (placing) return
        setPlacing(true)

        try {
            const branch = branches.find((b: any) => b.id === selectedBranchId) ?? branches[0]
            if (!branch) throw new Error('No branch selected. Please go back and choose a branch.')

            // Minimum order check
            if (cartSubtotal < 800) {
                throw new Error('Minimum order amount is Rs. 800. Please add more items to continue.')
            }

            if (orderType === 'delivery') {
                if (!locationSet)
                    throw new Error('Please set your delivery location first.')
                if (storedOutOfRange)
                    throw new Error('Your address is outside delivery range. Please choose Takeaway or Dine-In.')
                if (storedFee === null || storedFee === undefined)
                    throw new Error('Delivery fee could not be calculated. Please reset your location.')
            }

            // 1. Ensure customer record exists
            const normedPhone = normalisePhone(customerPhone)
            const customerObj = await getOrCreateCustomer(normedPhone, customerName.trim())
            const customerId = customerObj?.id ?? undefined

            // 2. Redeem loyalty points before creating order
            if (loyaltyRedeem > 0 && customerId) {
                await redeemLoyaltyPoints(customerId, null, loyaltyRedeem)
            }

            // 3. Create order in DB
            const order = await createOrder({
                customerName: customerName.trim(),
                customerPhone: normedPhone,
                customerId,
                branchId: branch.id,
                orderType,
                deliveryAddress: orderType === 'delivery'
                    ? (manualAddress.trim() || storedDeliveryAddress)
                    : undefined,
                deliveryLat: storedCoords?.lat,
                deliveryLng: storedCoords?.lng,
                distanceKm: orderType === 'delivery' ? storedDistance : undefined,
                items: cartItems,
                subtotal: cartSubtotal,
                deliveryFee: resolvedDeliveryFee,
                loyaltyDiscount,
                tierDiscount,
                total,
                paymentMethod: payMethod,
            })

            // 4. Loyalty points are awarded automatically by the database trigger
            //    when admin changes the order status to 'confirmed'.
            //    No client-side point award here — prevents premature/duplicate awards.
            const earnedPoints = calculateEarnedPoints(total)

            // 4b. Process referral (first order only, fails silently)
            if (customerId) {
                const referralCode = localStorage.getItem('zaitoon-referral-code')
                const isFirstOrder = (customerObj?.total_orders ?? 0) === 0
                if (referralCode && isFirstOrder) {
                    await processReferral(customerId, referralCode)
                    localStorage.removeItem('zaitoon-referral-code')
                    localStorage.removeItem('zaitoon-referrer-name')
                }
            }

            // 5. Build WhatsApp URL
            const waURL = buildWhatsAppURL(branch.whatsapp, {
                orderNumber: order.order_number,
                customerName: customerName.trim(),
                customerPhone: normedPhone,
                orderType,
                deliveryAddress: orderType === 'delivery'
                    ? (manualAddress.trim() || storedDeliveryAddress)
                    : undefined,
                deliveryLat: orderType === 'delivery' ? storedCoords?.lat : undefined,
                deliveryLng: orderType === 'delivery' ? storedCoords?.lng : undefined,
                distanceKm: orderType === 'delivery' ? storedDistance : undefined,
                branchName: branch.name,
                items: cartItems.map(i => ({
                    name: i.name,
                    size: i.size,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    subtotal: i.subtotal,
                })),
                subtotal: cartSubtotal,
                deliveryFee: resolvedDeliveryFee,
                loyaltyDiscount,
                tierDiscount,
                customerTier,
                baseDeliveryFee,
                total,
                paymentMethod: payMethod,
                pointsEarned: earnedPoints,
            })

            // 6. Clear cart
            clearCart()

            // 7. Show success step
            setStep(4)

            // 7.5 Refresh customer data (points, orders)
            await refreshCustomer(customerPhone)

            // 8. Open WhatsApp via anchor element (works on all browsers/mobile)
            //    Slight delay so success screen renders first
            setTimeout(() => {
                openWhatsApp(waURL)
                // Navigate to order tracking after WhatsApp opens
                setTimeout(() => {
                    router.push(`/order/${order.order_number}`)
                }, 1800)
            }, 800)

        } catch (err: any) {
            console.error('Order failed:', err)
            toast.error(err?.message || 'Something went wrong. Please try again.')
            setPlacing(false)
        }
    }

    // ── Step navigation validation ────────────────────────────
    const canGoNext = (): boolean => {
        if (step === 0) {
            const nameOk = customerName.trim().length >= 2
            const phoneOk = isValidPakistaniPhone(customerPhone)
            return nameOk && phoneOk
        }
        if (step === 1) {
            if (orderType === 'delivery') {
                return locationSet && !storedOutOfRange && manualAddress.trim().length >= 5
            }
            return !!selectedBranchId
        }
        return true
    }

    // ── Delivery fee display helper ───────────────────────────
    const deliveryFeeDisplay = (): string => {
        if (orderType !== 'delivery') return 'N/A'
        if (!mapCoords) return 'Pin location to calculate'
        if (outOfRange) return `Out of range (>${MAX_DELIVERY_KM}km)`
        if (deliveryFee === null) return 'Calculating…'
        if (deliveryFee === 0) return 'Free'
        return formatPrice(deliveryFee)
    }

    // ── Slide animation ───────────────────────────────────────
    const slideVariants = {
        enter: { x: 40, opacity: 0 },
        center: { x: 0, opacity: 1 },
        exit: { x: -40, opacity: 0 },
    }

    // ── Render step content ───────────────────────────────────
    const renderStepContent = () => {
        switch (step) {

            // STEP 0 ─────────────────────────────────────────────
            case 0:
                return (
                    <motion.fieldset
                        key="step-0"
                        variants={slideVariants} initial="enter" animate="center" exit="exit"
                        transition={{ duration: 0.28 }}
                        className="space-y-5 border-none m-0 p-0"
                    >
                        <legend className={`text-[20px] font-display font-[700] text-[var(--charcoal)] mb-4 block w-full border-b border-[var(--linen)] pb-2 ${isRTL ? 'text-right' : ''}`}>
                            {t.contactDetails}
                        </legend>

                        <div>
                            <label htmlFor="chk-phone" className={`block text-[13px] font-[600] text-[var(--charcoal)] mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                                {t.phoneNumber} <span className="text-red-500">*</span>
                            </label>
                            <div className="relative">
                                <input
                                    id="chk-phone" type="tel" autoComplete="tel"
                                    value={customerPhone} onChange={e => setCustomerPhone(e.target.value)}
                                    onBlur={handlePhoneBlur}
                                    placeholder="03XX-XXXXXXX"
                                    className={`w-full bg-white border-[2px] rounded-[4px] px-4 py-3 text-[15px] text-[var(--charcoal)] focus:outline-none transition-all
                                        ${phoneError(customerPhone)
                                            ? 'border-red-400 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]'
                                            : isValidPakistaniPhone(customerPhone)
                                                ? 'border-green-500 focus:border-green-600'
                                                : 'border-[var(--linen)] focus:border-[var(--green-base)] focus:shadow-[0_0_0_3px_rgba(46,204,113,0.15)]'}`}
                                />
                                {lookingUp && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-2">
                                        <div className="w-4 h-4 border-2 border-[var(--green-base)] border-t-transparent rounded-full animate-spin" />
                                        <span className="text-[11px] text-[var(--stone)]">Looking up...</span>
                                    </div>
                                )}
                            </div>
                            {phoneError(customerPhone) && (
                                <p role="alert" className="text-[12px] text-red-600 mt-1 flex items-center gap-1">
                                    ⚠ {phoneError(customerPhone)}
                                </p>
                            )}
                            {isValidPakistaniPhone(customerPhone) && !lookingUp && (
                                <p className="text-[12px] text-green-600 mt-1">✓ Valid number</p>
                            )}
                        </div>

                        {/* Returning customer welcome message */}
                        <AnimatePresence>
                            {isReturning && customer && (
                                <motion.div
                                    initial={{ opacity: 0, y: -10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="bg-[#1C2416] border border-[#3D5226] rounded-xl p-4 flex items-center gap-4"
                                >
                                    <span className="text-2xl">👋</span>
                                    <div>
                                        <p style={{ color: '#FCD34D' }} className="font-display text-[16px] font-[600] m-0">
                                            Welcome back, {customer.name}!
                                        </p>
                                        <p className="text-white/80 text-[13px] m-0 mt-0.5">
                                            ⭐ {customer.loyaltyPoints} points · {customer.tier.charAt(0).toUpperCase() + customer.tier.slice(1)} member
                                        </p>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div>
                            <label htmlFor="chk-name" className={`block text-[13px] font-[600] text-[var(--charcoal)] mb-1.5 ${isRTL ? 'text-right' : ''}`}>
                                {t.fullName} <span className="text-red-500">*</span>
                            </label>
                            <input
                                id="chk-name" type="text" autoComplete="name"
                                value={customerName} onChange={e => setCustomerName(e.target.value)}
                                placeholder="e.g. Ahmed Ali"
                                style={{ backgroundColor: isReturning ? '#F5F5F5' : 'white' }}
                                className={`w-full bg-white border-[2px] border-[var(--linen)] rounded-[4px] px-4 py-3 text-[15px] text-[var(--charcoal)] focus:outline-none focus:border-[var(--green-base)] focus:shadow-[0_0_0_3px_rgba(46,204,113,0.15)] transition-all`}
                            />
                            {isReturning && (
                                <p className="text-[11px] text-[var(--stone)] mt-1">✓ Auto-filled from your last order</p>
                            )}
                        </div>

                        {isAuthenticated && availablePoints > 0 && (
                            <div className="rounded-xl px-4 py-3 flex items-center justify-between" style={{background:'linear-gradient(135deg,var(--green-dark),var(--green-darkest))',border:'1px solid rgba(46,204,113,0.25)'}}>
                                <span className="text-[var(--orange-pale)] text-[13px] font-semibold">
                                    🎁 Loyalty points available
                                </span>
                                <span className="text-white font-bold">{availablePoints} pts</span>
                            </div>
                        )}
                    </motion.fieldset>
                )

            // STEP 1 ─────────────────────────────────────────────
            case 1:
                return (
                    <motion.fieldset
                        key="step-1"
                        variants={slideVariants} initial="enter" animate="center" exit="exit"
                        transition={{ duration: 0.28 }}
                        className="space-y-6 border-none m-0 p-0"
                    >
                        <legend className={`text-[20px] font-display font-[700] text-[var(--charcoal)] mb-4 block w-full border-b border-[var(--linen)] pb-2 ${isRTL ? 'text-right' : ''}`}>
                            {t.orderType}
                        </legend>

                        {/* Order type selector */}
                        <div role="radiogroup" aria-label="Order type" className="grid grid-cols-3 gap-3">
                            {([
                                { id: 'delivery', icon: Truck, title: 'Delivery' },
                                { id: 'takeaway', icon: Store, title: 'Takeaway' },
                                { id: 'dine-in', icon: Utensils, title: 'Dine-In' },
                            ] as const).map(type => {
                                const sel = orderType === type.id
                                const Icon = type.icon
                                return (
                                    <button
                                        key={type.id} type="button" role="radio" aria-checked={sel}
                                        onClick={() => setOrderType(type.id)}
                                        className={`relative flex flex-col items-center text-center p-4 rounded-[8px] border-[2px] transition-all ${sel
                                            ? 'bg-[var(--parchment)] border-[var(--green-base)] shadow-md'
                                            : 'bg-white border-[var(--linen)] hover:border-[var(--green-pale)]'}`}
                                    >
                                        {sel && (
                                            <div className="absolute top-0 right-0 w-5 h-5 bg-[var(--green-base)] text-white flex items-center justify-center rounded-bl-[4px] rounded-tr-[6px]">
                                                <Check className="w-3 h-3" />
                                            </div>
                                        )}
                                        <div className={`w-10 h-10 mb-2 rounded-full flex items-center justify-center ${sel ? 'bg-[var(--green-base)] text-white' : 'bg-[var(--linen)] text-[var(--stone)]'}`}>
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <span className={`font-[600] text-[14px] ${sel ? 'text-[var(--charcoal)]' : 'text-[var(--stone)]'}`}>
                                            {type.title}
                                        </span>
                                    </button>
                                )
                            })}
                        </div>

                        {/* Delivery-specific fields */}
                        {orderType === 'delivery' && (
                            <div className="space-y-4">
                                {locationSet && !storedOutOfRange ? (
                                    /* ── CONFIRMED LOCATION CARD ── */
                                    <div className="bg-[#1C2416] rounded-[10px] p-4 space-y-2">
                                        <p className="text-[var(--orange-pale)] text-[13px] font-bold uppercase tracking-wide">📍 Delivery Location</p>
                                        <p className="text-white text-[14px] leading-snug">{storedDeliveryAddress}</p>
                                        <p className="text-white/80 text-[12px]">
                                            {storedDistance} km from {storedBranchName} · {storedFee === 0 ? 'Free delivery' : `Rs. ${storedFee} delivery fee`}
                                        </p>
                                        <button
                                            type="button"
                                            onClick={() => setLocationModalOpen(true)}
                                            className="mt-1 text-[12px] font-semibold text-[var(--orange-warm)] underline underline-offset-2 hover:text-[var(--orange-pale)] transition-colors"
                                        >
                                            Change Location
                                        </button>
                                    </div>
                                ) : storedOutOfRange ? (
                                    /* ── OUT OF RANGE ── */
                                    <div className="bg-red-50 border border-red-200 rounded-[10px] p-4 space-y-2">
                                        <p className="text-red-700 text-[13px] font-bold">⚠ Outside delivery range ({storedDistance} km)</p>
                                        <p className="text-red-600 text-[12px]">Your location is too far for delivery. Please select Takeaway or Dine-In, or change your location.</p>
                                        <button
                                            type="button"
                                            onClick={() => setLocationModalOpen(true)}
                                            className="text-[12px] font-semibold text-red-600 underline underline-offset-2"
                                        >
                                            Change Location
                                        </button>
                                    </div>
                                ) : (
                                    /* ── NOT SET YET ── */
                                    <div className="border-2 border-dashed border-[var(--linen)] rounded-[10px] p-6 text-center space-y-3">
                                        <p className="text-[14px] font-semibold text-[var(--charcoal)]">📍 Set your delivery location to continue</p>
                                        <p className="text-[12px] text-[var(--stone)]">We need your location to calculate the delivery fee.</p>
                                        <button
                                            type="button"
                                            onClick={() => setLocationModalOpen(true)}
                                            className="btn-primary !py-3 !text-[13px]"
                                        >
                                            Set Location
                                        </button>
                                    </div>
                                )}

                                {/* Manual street address — always shown when delivery is selected */}
                                {locationSet && !storedOutOfRange && (
                                    <div>
                                        <label htmlFor="chk-address" className="block text-[13px] font-[600] text-[var(--charcoal)] mb-1.5">
                                            House / Street Address <span className="text-red-500">*</span>
                                        </label>
                                        <textarea
                                            id="chk-address"
                                            rows={2}
                                            value={manualAddress}
                                            onChange={e => setManualAddress(e.target.value)}
                                            placeholder="e.g. House 12, Street 5, Block C, Wapda Town"
                                            className="w-full bg-white border-[2px] border-[var(--linen)] rounded-[4px] px-4 py-3 text-[15px] text-[var(--charcoal)] focus:outline-none focus:border-[var(--green-base)] focus:shadow-[0_0_0_3px_rgba(46,204,113,0.15)] transition-all resize-none"
                                        />
                                        {manualAddress.trim().length > 0 && manualAddress.trim().length < 5 && (
                                            <p role="alert" className="text-[12px] text-red-600 mt-1">⚠ Please enter your full house/street address.</p>
                                        )}
                                        <p className="text-[11px] text-[var(--stone)] mt-1">This will be sent to the restaurant with your order.</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Takeaway / Dine-in — branch picker */}
                        {orderType !== 'delivery' && (
                            <div className="space-y-3">
                                <p className="text-[13px] font-[600] text-[var(--charcoal)]">Select Branch</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {branches.map((b: any) => (
                                        <button
                                            key={b.id} type="button"
                                            onClick={() => setSelectedBranchId(b.id)}
                                            className={`p-4 text-left border-[2px] rounded-[8px] transition-all ${selectedBranchId === b.id
                                                ? 'border-[var(--green-base)] bg-[var(--cream)] shadow-sm'
                                                : 'border-[var(--linen)] bg-white hover:border-[var(--green-pale)]'}`}
                                        >
                                            <div className="font-[700] text-[15px] text-[var(--charcoal)]">{b.name}</div>
                                            <div className="text-[12px] text-[var(--stone)] mt-0.5">{b.address}</div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </motion.fieldset>
                )

            // STEP 2 ─────────────────────────────────────────────
            case 2:
                return (
                    <motion.fieldset
                        key="step-2"
                        variants={slideVariants} initial="enter" animate="center" exit="exit"
                        transition={{ duration: 0.28 }}
                        className="space-y-6 border-none m-0 p-0"
                    >
                        <legend className={`text-[20px] font-display font-[700] text-[var(--charcoal)] mb-4 block w-full border-b border-[var(--linen)] pb-2 ${isRTL ? 'text-right' : ''}`}>
                            {t.paymentDetails}
                        </legend>

                        <div role="radiogroup" aria-label="Payment method" className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {([
                                { id: 'cod', title: 'Cash on Delivery', icon: '💵', color: 'var(--green-base)' },
                                { id: 'jazzcash', title: 'JazzCash', icon: '📱', color: 'var(--orange-warm)' },
                            ] as const).map(method => {
                                const sel = payMethod === method.id
                                return (
                                    <button
                                        key={method.id} type="button" role="radio" aria-checked={sel}
                                        onClick={() => setPayMethod(method.id)}
                                        style={{ borderColor: sel ? method.color : undefined }}
                                        className={`relative p-4 rounded-[8px] border-[2px] flex items-center justify-between transition-all ${sel ? 'bg-[var(--parchment)] shadow-sm' : 'bg-white border-[var(--linen)]'}`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-[24px]">{method.icon}</span>
                                            <span className={`font-[600] text-[15px] ${sel ? 'text-[var(--charcoal)]' : 'text-[var(--stone)]'}`}>
                                                {method.title}
                                            </span>
                                        </div>
                                        {sel && (
                                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white" style={{ backgroundColor: method.color }}>
                                                <Check className="w-3 h-3" />
                                            </div>
                                        )}
                                    </button>
                                )
                            })}
                        </div>

                        {/* Loyalty points */}
                        <div className="border-t border-[var(--linen)] pt-5 space-y-4">
                            {/* Loyalty points */}
                            {isAuthenticated && availablePoints > 0 && (
                                <div className="rounded-xl p-4 space-y-2" style={{background:'linear-gradient(135deg,var(--green-dark),var(--green-darkest))',border:'1px solid rgba(46,204,113,0.25)'}}>
                                    <p className="text-[var(--orange-pale)] text-[13px] font-semibold">
                                        🎁 Redeem Loyalty Points ({availablePoints} available)
                                    </p>
                                    <p className="text-white/80 text-[12px]">
                                        Max redeemable: {maxRedeemablePoints(cartSubtotal, availablePoints)} pts
                                        = {formatPrice(maxRedeemablePoints(cartSubtotal, availablePoints))} off
                                    </p>
                                    <input
                                        type="range" min={0} max={maxRedeemablePoints(cartSubtotal, availablePoints)}
                                        step={1} value={loyaltyRedeem}
                                        onChange={e => setLoyaltyRedeem(Number(e.target.value))}
                                        className="w-full accent-[var(--orange-warm)]"
                                    />
                                    <div className="flex justify-between text-[12px]">
                                        <span className="text-white/80">0 pts</span>
                                        <span className="text-[var(--orange-pale)] font-bold">
                                            {loyaltyRedeem} pts = {formatPrice(loyaltyDiscount)} off
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.fieldset>
                )

            // STEP 3 ─────────────────────────────────────────────
            case 3:
                return (
                    <motion.div
                        key="step-3"
                        variants={slideVariants} initial="enter" animate="center" exit="exit"
                        transition={{ duration: 0.28 }}
                        className="space-y-6"
                    >
                        <div className={`text-[20px] font-display font-[700] text-[var(--charcoal)] border-b border-[var(--linen)] pb-2 mb-4 ${isRTL ? 'text-right' : ''}`}>
                            {t.reviewConfirm}
                        </div>

                        <div className="bg-[var(--parchment)] border border-[var(--linen)] rounded-[8px] p-4 text-[14px] space-y-2">
                            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 items-start">
                                <span className="text-[var(--stone)]">Name</span>
                                <span className="font-[600]">{customerName || '—'}</span>
                                <span className="text-[var(--stone)]">Phone</span>
                                <span className="font-[600]">{customerPhone || '—'}</span>
                                <span className="text-[var(--stone)]">Order type</span>
                                <span className="font-[600] capitalize">{orderType}</span>
                                {orderType === 'delivery' && (
                                    <>
                                        <span className="text-[var(--stone)]">Address</span>
                                        <span className="font-[600]">{manualAddress.trim() || storedDeliveryAddress || '—'}</span>
                                        <span className="text-[var(--stone)]">Distance</span>
                                        <span className="font-[600]">{storedDistance ? `${storedDistance} km` : distanceKm !== null ? `${distanceKm} km` : '—'}</span>
                                    </>
                                )}
                                <span className="text-[var(--stone)]">Payment</span>
                                <span className="font-[600]">{payMethod === 'cod' ? 'Cash on Delivery' : 'JazzCash'}</span>
                            </div>
                        </div>

                        {orderType === 'delivery' && deliveryFee === null && (
                            <div role="alert" className="p-3 bg-amber-50 border border-amber-400 rounded-[6px] text-[13px] text-amber-800">
                                ⚠ Delivery fee not calculated yet. Go back and pin your location on the map.
                            </div>
                        )}
                    </motion.div>
                )

            // STEP 4 ─────────────────────────────────────────────
            case 4:
                return (
                    <motion.div
                        key="step-4"
                        initial={{ opacity: 0, scale: 0.93 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="flex flex-col items-center justify-center text-center py-14 space-y-5"
                    >
                        <div className="w-20 h-20 text-white rounded-full flex items-center justify-center" style={{background:'linear-gradient(135deg,var(--green-dark),var(--green-base))',boxShadow:'0 4px 20px rgba(46,204,113,0.40)'}}>
                            <Check className="w-10 h-10" strokeWidth={3} />
                        </div>
                        <h2 className="text-[26px] font-display font-[700] text-[var(--charcoal)]">Order Placed!</h2>
                        <p className="text-[15px] text-[var(--stone)] max-w-sm leading-relaxed">
                            Your order has been saved. Opening WhatsApp to confirm with the branch…
                        </p>
                        <div className="pt-4">
                            <div className="w-6 h-6 border-[3px] border-[var(--linen)] border-t-[var(--green-base)] rounded-full animate-spin mx-auto" />
                        </div>
                    </motion.div>
                )

            default:
                return null
        }
    }

    // ── Empty cart guard ──────────────────────────────────────
    if (!mounted) return null

    if (cartItems.length === 0 && !placing && step !== 4) {
        return (
            <>
                <Navbar />
                <main className="min-h-screen bg-[var(--cream)] pt-[110px] flex flex-col items-center justify-center gap-4">
                    <p className="text-[18px] font-semibold text-[var(--charcoal)]">Your cart is empty</p>
                    <button className="btn-primary px-8" onClick={() => router.push('/menu')}>
                        Browse Menu
                    </button>
                </main>
            </>
        )
    }

    // ─────────────────────────────────────────────────────────
    return (
        <>
            <Navbar />
            <main role="main" className="min-h-screen bg-[var(--cream)] pt-[88px] pb-28">
                <form
                    aria-label="Place your order"
                    className="max-w-6xl mx-auto px-4 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start py-8"
                    onSubmit={e => e.preventDefault()}
                    noValidate
                >
                    {/* ── LEFT: Step forms ── */}
                    <section aria-label="Order details" className="lg:col-span-8 space-y-6">

                        {/* Step indicator */}
                        {step < 4 && (
                            <nav aria-label="Checkout steps" className="overflow-x-auto">
                                <ol className="flex items-center min-w-[440px]">
                                    {STEPS.map((label, i) => {
                                        const active = i === step
                                        const completed = i < step
                                        return (
                                            <li key={label} className="relative flex-1 flex flex-col items-center">
                                                {i > 0 && (
                                                    <div
                                                        className="absolute top-[15px] -left-1/2 w-full h-[2px] transition-colors duration-300"
                                                        style={{ backgroundColor: completed ? 'var(--green-base)' : 'var(--linen)' }}
                                                    />
                                                )}
                                                <div
                                                    className="relative z-10 w-[30px] h-[30px] rounded-full flex items-center justify-center font-[700] text-[13px] border-[2px] transition-all duration-300"
                                                    style={{
                                                        background: completed ? 'var(--green-base)' : active ? 'var(--orange-warm)' : 'var(--linen)',
                                                        borderColor: completed ? 'var(--green-base)' : active ? 'var(--orange-warm)' : 'var(--linen)',
                                                        color: completed ? '#fff' : active ? '#fff' : 'var(--stone)',
                                                    }}
                                                >
                                                    {completed ? <Check className="w-3.5 h-3.5" strokeWidth={3} /> : i + 1}
                                                </div>
                                                <span
                                                    className="mt-1.5 text-[10px] font-[700] uppercase tracking-[0.07em]"
                                                    style={{ color: active ? 'var(--orange-warm)' : 'var(--stone)' }}
                                                >
                                                    {label}
                                                </span>
                                            </li>
                                        )
                                    })}
                                </ol>
                            </nav>
                        )}

                        {/* Form card */}
                        <div className="bg-[var(--parchment)] border border-[var(--linen)] rounded-[10px] p-6 lg:p-8 min-h-[360px]">
                            <AnimatePresence mode="wait">
                                {renderStepContent()}
                            </AnimatePresence>

                            {/* Navigation buttons */}
                            {step < 4 && (
                                <div className="mt-8 pt-5 border-t border-[var(--linen)] flex items-center justify-between">
                                    {step > 0 ? (
                                        <button
                                            type="button"
                                            onClick={() => setStep(s => s - 1)}
                                            className="text-[13px] font-[600] text-[var(--stone)] hover:text-[var(--charcoal)] px-4 py-2 border border-[var(--linen)] rounded-[4px] transition-colors"
                                        >
                                            ← Back
                                        </button>
                                    ) : <div />}

                                    {step < 3 ? (
                                        <button
                                            type="button"
                                            onClick={() => setStep(s => s + 1)}
                                            disabled={!canGoNext()}
                                            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                                        >
                                            Next →
                                        </button>
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={placeOrder}
                                            disabled={placing || (orderType === 'delivery' && outOfRange)}
                                            className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            {placing
                                                ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Processing…</>
                                                : 'Place Order →'
                                            }
                                        </button>
                                    )}
                                </div>
                            )}
                        </div>
                    </section>

                    {/* ── RIGHT: Order summary ── */}
                    <aside aria-label="Order summary" className="lg:col-span-4 rounded-[14px] p-6 sticky top-[100px] shadow-2xl" style={{background:'linear-gradient(180deg,#0D2015 0%,#0F1E12 100%)',border:'1.5px solid rgba(46,204,113,0.20)'}}>
                        <h2 className="font-display text-[22px] mb-5" style={{color:'var(--orange-pale)'}}>Order Summary</h2>

                        <ul className="space-y-3 mb-5 max-h-[260px] overflow-y-auto pr-1">
                            {cartItems.map(item => (
                                <li key={item.id} className="flex justify-between items-start text-[13px] text-white/70 gap-2">
                                    <div className="flex gap-2 min-w-0">
                                        <span className="font-[700] text-white/70 shrink-0">{item.quantity}×</span>
                                        <div className="min-w-0">
                                            <div className="font-[600] text-white/90 truncate">{item.name}</div>
                                            {item.size && <div className="text-[11px] capitalize text-white/70">({item.size})</div>}
                                        </div>
                                    </div>
                                    <span className="font-display font-[700] text-white/90 shrink-0">
                                        {formatPrice(item.subtotal)}
                                    </span>
                                </li>
                            ))}
                        </ul>

                        <div className="border-t border-white/10 pt-4 space-y-2 text-[13px]">
                            <div className="flex justify-between text-white/80">
                                <span>Subtotal</span>
                                <span>{formatPrice(cartSubtotal)}</span>
                            </div>
                            <div className="flex justify-between text-white/80">
                                <span>Delivery Fee</span>
                                <span className={outOfRange ? 'text-red-400' : deliveryFee === null && orderType === 'delivery' ? 'text-white/70 italic' : ''}>
                                    {deliveryFeeDisplay()}
                                </span>
                            </div>

                            {/* Tier discount (Silver 2% / Gold 5% / Platinum 10%) */}
                            {tierDiscount > 0 && (
                                <div className="flex justify-between text-green-400 font-[600]">
                                    <span>
                                        {tierBadge(customerTier)}&nbsp;
                                        {customerTier.charAt(0).toUpperCase() + customerTier.slice(1)} perk
                                    </span>
                                    <span>−{formatPrice(tierDiscount)}</span>
                                </div>
                            )}

                            {/* Free delivery perk (Gold / Platinum) */}
                            {(customerTier === 'gold' || customerTier === 'platinum') && baseDeliveryFee > 0 && (
                                <div className="flex justify-between text-green-400 font-[600]">
                                    <span>🚀 Free delivery (perk)</span>
                                    <span>−{formatPrice(baseDeliveryFee)}</span>
                                </div>
                            )}

                            {loyaltyDiscount > 0 && (
                                <div className="flex justify-between text-[var(--orange-pale)] font-[600]">
                                    <span>Loyalty Discount</span>
                                    <span>−{formatPrice(loyaltyDiscount)}</span>
                                </div>
                            )}
                        </div>

                        <div className="border-t border-white/20 mt-4 pt-4 flex items-center justify-between mb-6">
                            <span className="text-[15px] font-[600] text-white">Total</span>
                            <span className="font-display text-[30px] font-[700] leading-none" style={{color:'var(--orange-pale)'}}>
                                {formatPrice(total)}
                            </span>
                        </div>

                        {step === 3 && (
                            <button
                                type="button"
                                onClick={placeOrder}
                                disabled={placing || (orderType === 'delivery' && outOfRange)}
                                className="w-full btn-primary !py-4 text-[14px] disabled:opacity-40 flex items-center justify-center gap-2"
                            >
                                {placing
                                    ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Placing…</>
                                    : 'Place Order →'
                                }
                            </button>
                        )}

                        <p className="text-[11px] text-white/70 text-center mt-4">
                            Confirmed via WhatsApp · {new Date().getFullYear()}
                        </p>
                    </aside>
                </form>
            </main>


            {/* Location modal — forceOpen makes it non-dismissible until location is set for delivery */}
            {locationModalOpen && (
                <LocationModal
                    forceOpen={orderType === 'delivery' && !locationSet}
                    onClose={() => setLocationModalOpen(false)}
                />
            )}
        </>
    )
}
