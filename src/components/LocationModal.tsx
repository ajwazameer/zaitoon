'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import dynamic from 'next/dynamic'
import { motion, AnimatePresence } from 'framer-motion'
import { MapPin, Navigation, X, Pencil, CheckCircle2, AlertTriangle, Search, Loader2 } from 'lucide-react'
import { getBranches } from '@/lib/api/branches'
import { haversineDistance, calculateDeliveryFee, MAX_DELIVERY_KM } from '@/lib/distance'
import { useLocationStore } from '@/store/useLocationStore'

const LeafletCheckoutMap = dynamic(
    () => import('@/components/map/LeafletCheckoutMap'),
    { ssr: false }
)

// ── Reverse geocode with Nominatim (no API key) ────────────────
async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
        const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`,
            { headers: { 'Accept-Language': 'en' } }
        )
        const data = await res.json()
        return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    } catch {
        return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    }
}

// ── Forward geocode with Nominatim ─────────────────────────────────
interface GeoSuggestion { display_name: string; lat: string; lon: string }

async function forwardGeocode(query: string): Promise<GeoSuggestion[]> {
    try {
        const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&addressdetails=1&limit=5&countrycodes=pk`
        const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
        if (!res.ok) return []
        const data = await res.json()
        return Array.isArray(data) ? data : []
    } catch {
        return []
    }
}

interface Props {
    /** When true the modal cannot be dismissed until a location is set */
    forceOpen?: boolean
    /** Called when modal is dismissed / location confirmed */
    onClose?: () => void
    /** Whether to allow closing by clicking outside */
    allowBackdropClose?: boolean
}

export default function LocationModal({ forceOpen = false, onClose, allowBackdropClose = true }: Props) {
    const [show, setShow] = useState(true)
    const [mode, setMode] = useState<'pick' | 'gps' | 'manual'>('pick')
    const [detecting, setDetecting] = useState(false)
    const [confirmed, setConfirmed] = useState<{
        branchName: string
        distanceKm: number
        deliveryFee: number | null
        address: string
    } | null>(null)
    const [error, setError] = useState('')

    // Manual entry state
    const [manualAddress, setManualAddress] = useState('')
    const [manualCoords, setManualCoords] = useState<{ lat: number; lng: number } | null>(null)
    const [manualBranches, setManualBranches] = useState<any[]>([])
    const [manualFee, setManualFee] = useState<{ distanceKm: number; fee: number | null; outOfRange: boolean } | null>(null)
    const [confirming, setConfirming] = useState(false)

    // Geocoding state
    const [suggestions, setSuggestions] = useState<GeoSuggestion[]>([])
    const [geocoding, setGeocoding] = useState(false)
    const [showSuggestions, setShowSuggestions] = useState(false)
    const geoDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const { locationSet, setLocation } = useLocationStore()

    // No need for internal auto-show logic anymore, parent controls mount

    const dismiss = useCallback(() => {
        if (forceOpen && !locationSet) return   // can't dismiss without setting location
        setShow(false)
        setMode('pick')
        setConfirmed(null)
        setError('')
        onClose?.()
    }, [forceOpen, locationSet, onClose])

    // ── Shared: process a lat/lng and save to store ────────────
    const processCoords = useCallback(async (lat: number, lng: number) => {
        const branches = await getBranches()
        if (!branches?.length) throw new Error('No branches found')

        let nearest = branches[0]
        let minDist = haversineDistance(lat, lng, branches[0].lat, branches[0].lng)
        branches.forEach(b => {
            const d = haversineDistance(lat, lng, b.lat, b.lng)
            if (d < minDist) { minDist = d; nearest = b }
        })

        const distKm = Math.round(minDist * 10) / 10
        const feeResult = calculateDeliveryFee(minDist)
        const oor = feeResult === -1 || minDist > MAX_DELIVERY_KM

        const address = await reverseGeocode(lat, lng)

        setLocation({
            coords: { lat, lng },
            nearestBranchId: nearest.id,
            nearestBranchName: nearest.name,
            deliveryAddress: address,
            distanceKm: distKm,
            deliveryFee: oor ? 0 : feeResult,
            outOfRange: oor,
        })

        return { nearest, distKm, fee: oor ? null : feeResult, address, oor }
    }, [setLocation])

    // ── GPS flow ───────────────────────────────────────────────
    const handleGPS = useCallback(async () => {
        if (!navigator.geolocation) {
            setError('Geolocation is not supported by your browser.')
            return
        }
        setMode('gps')
        setDetecting(true)
        setError('')
        try {
            const position = await new Promise<GeolocationPosition>((res, rej) =>
                navigator.geolocation.getCurrentPosition(res, rej, {
                    enableHighAccuracy: true, timeout: 10000, maximumAge: 0,
                })
            )
            const { latitude: lat, longitude: lng } = position.coords
            const result = await processCoords(lat, lng)
            setConfirmed({
                branchName: result.nearest.name,
                distanceKm: result.distKm,
                deliveryFee: result.fee,
                address: result.address,
            })
            setTimeout(() => dismiss(), 2400)
        } catch (err: any) {
            if (err?.code === 1) setError('Location access denied. Use "Enter Address Manually" instead.')
            else if (err?.code === 3) setError('Location timed out. Try again or enter address manually.')
            else setError('Could not detect location. Please enter address manually.')
            setMode('pick')
        } finally {
            setDetecting(false)
        }
    }, [processCoords, dismiss])

    // ── Load branches for manual map ───────────────────────────
    const startManual = useCallback(async () => {
        setMode('manual')
        setError('')
        const branches = await getBranches()
        setManualBranches(branches ?? [])
    }, [])

    // ── Geocoding: debounced address search ────────────────────
    const handleAddressChange = useCallback((value: string) => {
        setManualAddress(value)
        setSuggestions([])
        if (geoDebounceRef.current) clearTimeout(geoDebounceRef.current)
        if (value.trim().length < 4) { setShowSuggestions(false); return }
        geoDebounceRef.current = setTimeout(async () => {
            setGeocoding(true)
            const results = await forwardGeocode(value)
            setSuggestions(results)
            setShowSuggestions(results.length > 0)
            setGeocoding(false)
        }, 600)
    }, [])

    const handleSelectSuggestion = useCallback((suggestion: GeoSuggestion) => {
        const lat = parseFloat(suggestion.lat)
        const lng = parseFloat(suggestion.lon)
        setManualAddress(suggestion.display_name)
        setManualCoords({ lat, lng })
        setSuggestions([])
        setShowSuggestions(false)
    }, [])

    // Recalc fee when pin moves in manual mode
    useEffect(() => {
        if (!manualCoords || manualBranches.length === 0) return
        let nearest = manualBranches[0]
        let minDist = haversineDistance(manualCoords.lat, manualCoords.lng, manualBranches[0].lat, manualBranches[0].lng)
        manualBranches.forEach(b => {
            const d = haversineDistance(manualCoords.lat, manualCoords.lng, b.lat, b.lng)
            if (d < minDist) { minDist = d; nearest = b }
        })
        const distKm = Math.round(minDist * 10) / 10
        const feeResult = calculateDeliveryFee(minDist)
        const oor = feeResult === -1 || minDist > MAX_DELIVERY_KM
        setManualFee({ distanceKm: distKm, fee: oor ? null : feeResult, outOfRange: oor })
    }, [manualCoords, manualBranches])

    const handleConfirmManual = useCallback(async () => {
        if (!manualAddress.trim()) { setError('Please enter your address.'); return }
        if (!manualCoords) { setError('Please pin your location on the map.'); return }
        setConfirming(true)
        setError('')
        try {
            // Use the typed address as the readable string, coords from map pin
            let nearest = manualBranches[0]
            let minDist = haversineDistance(manualCoords.lat, manualCoords.lng, manualBranches[0].lat, manualBranches[0].lng)
            manualBranches.forEach(b => {
                const d = haversineDistance(manualCoords.lat, manualCoords.lng, b.lat, b.lng)
                if (d < minDist) { minDist = d; nearest = b }
            })
            const distKm = Math.round(minDist * 10) / 10
            const feeResult = calculateDeliveryFee(minDist)
            const oor = feeResult === -1 || minDist > MAX_DELIVERY_KM

            setLocation({
                coords: manualCoords,
                nearestBranchId: nearest.id,
                nearestBranchName: nearest.name,
                deliveryAddress: manualAddress.trim(),
                distanceKm: distKm,
                deliveryFee: oor ? 0 : feeResult,
                outOfRange: oor,
            })

            setConfirmed({
                branchName: nearest.name,
                distanceKm: distKm,
                deliveryFee: oor ? null : feeResult,
                address: manualAddress.trim(),
            })
            setTimeout(() => dismiss(), 2400)
        } finally {
            setConfirming(false)
        }
    }, [manualAddress, manualCoords, manualBranches, setLocation, dismiss])

    const canDismiss = !forceOpen || locationSet

    return (
        <AnimatePresence>
            {show && (
                <>
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[100] backdrop-blur-sm"
                        style={{ background: 'rgba(10,15,8,0.65)' }}
                        onClick={allowBackdropClose ? dismiss : undefined}
                    />

                    {/* Modal */}
                    <motion.div
                        initial={{ opacity: 0, scale: 0.88, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.88, y: 24 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 320 }}
                        className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none"
                    >
                        <div className={`pointer-events-auto relative w-full ${mode === 'manual' ? 'max-w-lg' : 'max-w-sm'} max-h-[90vh] overflow-y-auto rounded-[20px]`}
                            style={{
                                background: 'var(--cream)',
                                border: '1.5px solid #6A7E3F',
                                boxShadow: '0 24px 80px rgba(76,92,45,0.25), 0 8px 24px rgba(76,92,45,0.16)'
                            }}
                        >

                            {/* Close button — only when dismissible */}
                            {canDismiss && (
                                <button
                                    onClick={dismiss}
                                    aria-label="Close location modal"
                                    className="absolute top-4 right-4 z-10 w-8 h-8 flex items-center justify-center rounded-full transition-all"
                                    style={{ background: 'var(--linen)', color: 'var(--stone)' }}
                                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--charcoal)'; el.style.color = 'white' }}
                                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--linen)'; el.style.color = 'var(--stone)' }}
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}

                            <div className="p-7">
                                {/* Icon */}
                                <div className="w-14 h-14 rounded-[14px] flex items-center justify-center mx-auto mb-5"
                                    style={{ background: 'rgba(106,126,63,0.12)', border: '1.5px solid rgba(106,126,63,0.26)' }}>
                                    <MapPin className="w-7 h-7" style={{ color: 'var(--green-dark)' }} />
                                </div>

                                {/* ── SUCCESS STATE ──────────────────────────────────── */}
                                {confirmed ? (
                                    <div className="text-center space-y-4">
                                        <motion.div
                                            initial={{ scale: 0.6, opacity: 0 }}
                                            animate={{ scale: 1, opacity: 1 }}
                                            transition={{ type: 'spring', damping: 14, stiffness: 260 }}
                                            className="w-14 h-14 rounded-full flex items-center justify-center mx-auto"
                                            style={{ background: 'rgba(22,163,74,0.1)', border: '2px solid rgba(22,163,74,0.25)' }}
                                        >
                                            <CheckCircle2 className="w-7 h-7" style={{ color: '#16A34A' }} />
                                        </motion.div>
                                        <h3 className="font-display text-[20px] font-[700]" style={{ color: 'var(--charcoal)' }}>Location Set</h3>
                                        <p className="text-[13px] leading-snug" style={{ color: 'var(--stone)' }}>
                                            {confirmed.address}
                                        </p>
                                        <p className="text-[13px] font-[600]" style={{ color: 'var(--green-dark)' }}>
                                            Nearest branch: <strong>{confirmed.branchName}</strong> ({confirmed.distanceKm} km)
                                        </p>
                                        {confirmed.deliveryFee !== null ? (
                                            confirmed.deliveryFee === 0
                                                ? <p className="text-[13px] font-[700]" style={{ color: '#16A34A' }}>Free delivery available</p>
                                                : <p className="text-[13px] font-[700]" style={{ color: 'var(--orange-warm)' }}>Delivery fee: Rs. {confirmed.deliveryFee}</p>
                                        ) : (
                                            <div className="flex items-center gap-2 justify-center text-[13px] font-[700]" style={{ color: '#DC2626' }}>
                                                <AlertTriangle className="w-4 h-4" />
                                                <span>Outside delivery range ({confirmed.distanceKm} km). Takeaway only.</span>
                                            </div>
                                        )}
                                        <p className="text-[11px] pt-1" style={{ color: 'var(--stone)', opacity: 0.5 }}>Closing automatically…</p>
                                    </div>

                                ) : mode === 'gps' ? (
                                    /* ── GPS DETECTING ── */
                                    <div className="text-center space-y-4">
                                        <h2 className="font-display text-[20px] font-[700]" style={{ color: 'var(--charcoal)' }}>Detecting Location…</h2>
                                        {detecting ? (
                                            <div className="flex flex-col items-center gap-4">
                                                <div className="w-12 h-12 rounded-full border-[3px] border-t-transparent animate-spin"
                                                    style={{ borderColor: 'var(--green-base)', borderTopColor: 'transparent' }} />
                                                <p className="text-[14px]" style={{ color: 'var(--stone)' }}>Waiting for GPS signal…</p>
                                            </div>
                                        ) : error ? (
                                            <div className="space-y-3">
                                                <p role="alert" className="text-[13px] rounded-[10px] p-3" style={{ color: '#DC2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}>{error}</p>
                                                <button onClick={() => { setMode('pick'); setError('') }}
                                                    className="text-[13px] font-[600] transition-colors"
                                                    style={{ color: 'var(--green-base)' }}>← Back</button>
                                            </div>
                                        ) : null}
                                    </div>

                                ) : mode === 'manual' ? (
                                    /* ── MANUAL ENTRY ── */
                                    <div className="space-y-4">
                                        <h2 className="font-display text-[20px] font-[700] text-center" style={{ color: 'var(--charcoal)' }}>Enter Your Address</h2>
                                        <p className="text-[13px] text-center" style={{ color: 'var(--stone)' }}>Type your address and pin your location on the map.</p>

                                        <div className="relative">
                                            <label htmlFor="loc-manual-addr" className="block text-[11px] font-[700] uppercase tracking-wider mb-1.5"
                                                style={{ color: 'var(--stone)' }}>
                                                Delivery Address <span style={{ color: '#DC2626' }}>*</span>
                                            </label>
                                            <div className="relative">
                                                <input
                                                    id="loc-manual-addr"
                                                    type="text"
                                                    value={manualAddress}
                                                    onChange={e => handleAddressChange(e.target.value)}
                                                    placeholder="e.g. E-88 Wapda Town, Lahore"
                                                    autoComplete="off"
                                                    className="w-full rounded-[10px] px-4 py-3 pr-10 text-[14px] transition-all"
                                                    style={{
                                                        background: 'var(--parchment)',
                                                        border: '2px solid var(--linen)',
                                                        color: 'var(--charcoal)',
                                                        outline: 'none'
                                                    }}
                                                    onFocus={e => { e.currentTarget.style.borderColor = 'var(--green-base)' }}
                                                    onBlur={e => {
                                                        e.currentTarget.style.borderColor = 'var(--linen)'
                                                        // Delay hiding so click on suggestion registers
                                                        setTimeout(() => setShowSuggestions(false), 200)
                                                    }}
                                                />
                                                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                                    {geocoding
                                                        ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: 'var(--green-base)' }} />
                                                        : <Search className="w-4 h-4" style={{ color: 'var(--stone)' }} />}
                                                </div>
                                            </div>

                                            {/* Suggestions dropdown */}
                                            {showSuggestions && suggestions.length > 0 && (
                                                <div className="absolute z-[300] w-full mt-1 rounded-[10px] overflow-hidden shadow-xl"
                                                    style={{ background: 'white', border: '1.5px solid var(--linen)' }}>
                                                    {suggestions.map((s, i) => (
                                                        <button
                                                            key={i}
                                                            type="button"
                                                            onMouseDown={() => handleSelectSuggestion(s)}
                                                            className="w-full text-left px-4 py-2.5 text-[13px] transition-colors flex items-start gap-2"
                                                            style={{ borderBottom: i < suggestions.length - 1 ? '1px solid var(--linen)' : 'none' }}
                                                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--cream)' }}
                                                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'white' }}
                                                        >
                                                            <MapPin className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: 'var(--green-dark)' }} />
                                                            <span className="line-clamp-2" style={{ color: 'var(--charcoal)' }}>{s.display_name}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            )}

                                            {manualCoords && (
                                                <p className="mt-1.5 text-[11px] font-[600]" style={{ color: 'var(--green-dark)' }}>
                                                    ✓ Location pinned on map
                                                </p>
                                            )}
                                        </div>

                                        <div>
                                            <p className="text-[11px] font-[700] uppercase tracking-wider mb-1.5" style={{ color: 'var(--stone)' }}>
                                                Pin Location on Map <span style={{ color: '#DC2626' }}>*</span>
                                            </p>
                                            <div className="h-[220px] rounded-[12px] overflow-hidden relative"
                                                style={{ border: '2px solid var(--linen)' }}>
                                                <LeafletCheckoutMap
                                                    customerCoords={manualCoords}
                                                    branches={manualBranches}
                                                    onCustomerMove={(lat, lng) => setManualCoords({ lat, lng })}
                                                />
                                                {!manualCoords && (
                                                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[200]">
                                                        <div className="px-3 py-2 text-[12px] font-[600] rounded-[8px] shadow-lg"
                                                            style={{ background: 'rgba(252,248,240,0.95)', color: 'var(--stone)', backdropFilter: 'blur(8px)' }}>
                                                            Click on the map to drop your pin
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                            {manualFee && (
                                                <p className="mt-2 text-[12px] font-[600]" style={{ color: manualFee.outOfRange ? '#DC2626' : 'var(--green-dark)' }}>
                                                    {manualFee.outOfRange
                                                        ? `Outside delivery range (${manualFee.distanceKm} km). Takeaway only.`
                                                        : `${manualFee.distanceKm} km · Fee: ${manualFee.fee === 0 ? 'Free' : `Rs. ${manualFee.fee}`}`}
                                                </p>
                                            )}
                                        </div>

                                        {error && (
                                            <p role="alert" className="text-[12px] rounded-[10px] p-3"
                                                style={{ color: '#DC2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}>
                                                {error}
                                            </p>
                                        )}

                                        <div className="flex gap-3 pt-1">
                                            <button
                                                onClick={() => { setMode('pick'); setError('') }}
                                                className="flex-1 py-3 rounded-[12px] text-[13px] font-[700] transition-all"
                                                style={{ background: 'transparent', border: '2px solid var(--linen)', color: 'var(--stone)' }}
                                                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--green-base)'; el.style.color = 'var(--green-base)' }}
                                                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'var(--linen)'; el.style.color = 'var(--stone)' }}
                                            >
                                                ← Back
                                            </button>
                                            <button
                                                onClick={handleConfirmManual}
                                                disabled={confirming || !manualAddress.trim() || !manualCoords}
                                                className="flex-1 py-3 rounded-[12px] text-[13px] font-[700] text-white transition-all disabled:opacity-40"
                                                style={{
                                                    background: 'linear-gradient(135deg, #6A7E3F, #4C5C2D)',
                                                    boxShadow: '0 4px 14px rgba(76,92,45,0.30)'
                                                }}
                                            >
                                                {confirming ? 'Saving…' : 'Confirm Location'}
                                            </button>
                                        </div>
                                    </div>

                                ) : (
                                    /* ── PICK MODE (initial) ── */
                                    <div className="space-y-4">
                                        <h2 className="font-display text-[24px] font-[700] text-center mb-1" style={{ color: 'var(--charcoal)' }}>
                                            Set Your Location
                                        </h2>
                                        <p className="text-[13px] text-center leading-relaxed" style={{ color: 'var(--stone)' }}>
                                            We need your location to find the nearest branch and calculate your delivery fee.
                                        </p>

                                        {!canDismiss && (
                                            <p className="text-[12px] text-center rounded-[10px] px-3 py-2.5 font-[600]"
                                                style={{ color: '#92400E', background: 'rgba(217,119,6,0.08)', border: '1px solid rgba(217,119,6,0.2)' }}>
                                                Location is required to proceed with delivery.
                                            </p>
                                        )}

                                        {error && (
                                            <p role="alert" className="text-[12px] text-center rounded-[10px] p-3"
                                                style={{ color: '#DC2626', background: 'rgba(220,38,38,0.06)', border: '1px solid rgba(220,38,38,0.15)' }}>
                                                {error}
                                            </p>
                                        )}

                                        <motion.button
                                            whileHover={{ y: -2 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={handleGPS}
                                            disabled={detecting}
                                            className="w-full text-white py-4 rounded-[14px] font-[700] text-[14px] flex items-center justify-center gap-2.5 disabled:opacity-60 transition-all"
                                            style={{
                                                background: 'linear-gradient(135deg, #6A7E3F, #4C5C2D)',
                                                boxShadow: '0 6px 20px rgba(76,92,45,0.30)'
                                            }}
                                        >
                                            <Navigation className="w-4 h-4" />
                                            Use My Location (GPS)
                                        </motion.button>

                                        <motion.button
                                            whileHover={{ y: -1 }}
                                            whileTap={{ scale: 0.98 }}
                                            onClick={startManual}
                                            className="w-full py-4 rounded-[14px] font-[700] text-[14px] flex items-center justify-center gap-2.5 transition-all"
                                            style={{
                                                background: 'transparent',
                                                border: '2px solid var(--green-base)',
                                                color: 'var(--green-base)'
                                            }}
                                        >
                                            <Pencil className="w-4 h-4" />
                                            Enter Address Manually
                                        </motion.button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    )
}
