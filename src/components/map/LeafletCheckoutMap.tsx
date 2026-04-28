/* eslint-disable @typescript-eslint/no-explicit-any */
'use client'
import { useEffect, useRef } from 'react'
import type { Branch } from '@/types'

interface Props {
    customerCoords: { lat: number; lng: number } | null
    branches: Branch[]
    onCustomerMove: (lat: number, lng: number) => void
    /** When true the map is read-only — no dragging or clicking */
    readOnly?: boolean
}

export default function LeafletCheckoutMap({ customerCoords, branches, onCustomerMove, readOnly = false }: Props) {
    const ref = useRef<HTMLDivElement>(null)
    const mapRef = useRef<any>(null)
    const markerRef = useRef<any>(null)
    const leafletRef = useRef<any>(null)

    // ── Initialize map once ────────────────────────────────────────
    useEffect(() => {
        if (!ref.current || mapRef.current) return
        import('leaflet').then(L => {
            leafletRef.current = L

            const center: [number, number] = customerCoords
                ? [customerCoords.lat, customerCoords.lng]
                : [31.5204, 74.3587]

            const map = L.map(ref.current!, { zoomControl: true, dragging: !readOnly })
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png').addTo(map)
            map.setView(center, 14)

            // Branch pins
            const branchIcon = L.divIcon({
                html: `<div style="width:20px;height:20px;background:#1B4332;border:2.5px solid #C9920A;border-radius:50%;"></div>`,
                iconSize: [20, 20], iconAnchor: [10, 10], className: '',
            })
            branches.forEach(b => L.marker([b.lat, b.lng], { icon: branchIcon }).bindPopup(b.name).addTo(map))

            const custIcon = L.divIcon({
                html: `<div style="width:22px;height:22px;background:#C9920A;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
                iconSize: [22, 22], iconAnchor: [11, 11], className: '',
            })

            // Customer pin (draggable unless readOnly)
            if (customerCoords) {
                const m = L.marker([customerCoords.lat, customerCoords.lng], { icon: custIcon, draggable: !readOnly })
                if (!readOnly) {
                    m.on('dragend', () => {
                        const p = m.getLatLng()
                        onCustomerMove(p.lat, p.lng)
                    })
                }
                m.addTo(map)
                markerRef.current = m
            }

            // Click to drop / move pin (not readOnly)
            if (!readOnly) {
                map.on('click', (e: any) => {
                    const { lat, lng } = e.latlng
                    if (markerRef.current) {
                        markerRef.current.setLatLng([lat, lng])
                    } else {
                        const custIconClick = L.divIcon({
                            html: `<div style="width:22px;height:22px;background:#C9920A;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
                            iconSize: [22, 22], iconAnchor: [11, 11], className: '',
                        })
                        const m = L.marker([lat, lng], { icon: custIconClick, draggable: true })
                        m.on('dragend', () => {
                            const p = m.getLatLng()
                            onCustomerMove(p.lat, p.lng)
                        })
                        m.addTo(map)
                        markerRef.current = m
                    }
                    onCustomerMove(lat, lng)
                })
            }

            mapRef.current = map
        })
        return () => { mapRef.current?.remove(); mapRef.current = null; markerRef.current = null }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [])

    // ── React to external coord changes (e.g. geocoding result) ───
    useEffect(() => {
        if (!mapRef.current || !customerCoords || !leafletRef.current) return
        const L = leafletRef.current
        const { lat, lng } = customerCoords

        if (markerRef.current) {
            // Move existing marker
            markerRef.current.setLatLng([lat, lng])
        } else {
            // Create new marker
            const custIcon = L.divIcon({
                html: `<div style="width:22px;height:22px;background:#C9920A;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.4)"></div>`,
                iconSize: [22, 22], iconAnchor: [11, 11], className: '',
            })
            const m = L.marker([lat, lng], { icon: custIcon, draggable: !readOnly })
            if (!readOnly) {
                m.on('dragend', () => {
                    const p = m.getLatLng()
                    onCustomerMove(p.lat, p.lng)
                })
            }
            m.addTo(mapRef.current)
            markerRef.current = m
        }

        // Smoothly pan map to new location
        mapRef.current.flyTo([lat, lng], 15, { duration: 1.0 })
    }, [customerCoords, readOnly, onCustomerMove])

    return <div ref={ref} className="w-full h-full" />
}
