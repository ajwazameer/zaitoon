'use client'
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Plus, Minus, ShoppingBag, Printer, CheckCircle } from 'lucide-react'
import { formatPrice } from '@/lib/payment'
import { getMenuItems, getCategories } from '@/lib/api/menu'
import { createOrder } from '@/lib/api/orders'
import { getBranches } from '@/lib/api/branches'
import type { MenuItem, CartItem, OrderType, Branch, Category } from '@/types'


interface Props {
    isOpen: boolean
    onClose: () => void
}

export default function CreateOrderModal({ isOpen, onClose }: Props) {
    const [menuItems, setMenuItems] = useState<MenuItem[]>([])
    const [branches, setBranches] = useState<Branch[]>([])
    const [selectedBranchId, setSelectedBranchId] = useState('')
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')
    
    const [cart, setCart] = useState<CartItem[]>([])
    const [customerName, setCustomerName] = useState('')
    const [customerPhone, setCustomerPhone] = useState('')
    const [orderType, setOrderType] = useState<OrderType>('dine-in')
    const [notes, setNotes] = useState('')
    
    const [submitting, setSubmitting] = useState(false)
    const [placedOrder, setPlacedOrder] = useState<any>(null)

    const [categories, setCategories] = useState<Category[]>([])
    const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all')
    const [searchQuery, setSearchQuery] = useState('')

    useEffect(() => {
        if (isOpen) {
            setLoading(true)
            setError('')
            Promise.all([
                getMenuItems(),
                getBranches(),
                getCategories()
            ])
            .then(([items, branchList, categoryList]) => {
                setMenuItems(items)
                setBranches(branchList)
                setCategories(categoryList)
                if (branchList && branchList.length > 0) {
                    setSelectedBranchId(branchList[0].id)
                }
            })
            .catch(() => setError('Failed to load menu, branches, or categories.'))
            .finally(() => setLoading(false))
        } else {
            // reset state on close
            setCart([])
            setCustomerName('')
            setCustomerPhone('')
            setNotes('')
            setOrderType('dine-in')
            setPlacedOrder(null)
            setSelectedCategoryId('all')
            setSearchQuery('')
        }
    }, [isOpen])

    if (!isOpen) return null

    const addToCart = (item: MenuItem) => {
        setCart(prev => {
            const existing = prev.find(i => i.menuItemId === item.id)
            if (existing) {
                return prev.map(i => i.menuItemId === item.id 
                    ? { ...i, quantity: i.quantity + 1, subtotal: (i.quantity + 1) * i.unitPrice } 
                    : i)
            }
            return [...prev, {
                id: crypto.randomUUID(),
                menuItemId: item.id,
                name: item.name,
                size: null,
                unitPrice: item.price ?? 0,
                quantity: 1,
                subtotal: item.price ?? 0,
                imageUrl: item.image_url ?? null,
            }]
        })
    }

    const removeFromCart = (id: string) => {
        setCart(prev => prev.filter(i => i.id !== id))
    }

    const updateQty = (id: string, delta: number) => {
        setCart(prev => prev.map(i => {
            if (i.id === id) {
                const q = Math.max(1, i.quantity + delta)
                return { ...i, quantity: q, subtotal: q * i.unitPrice }
            }
            return i
        }))
    }

    const subtotal = cart.reduce((s, i) => s + i.subtotal, 0)
    // No delivery fee for dine-in/takeaway created by admin usually, or just 0
    const total = subtotal

    const handlePlaceOrder = async () => {
        if (cart.length === 0) return
        if (orderType === 'takeaway' && !customerName) {
            setError('Name is required for Takeaway.')
            return
        }
        if (!selectedBranchId) {
            setError('A valid branch selection is required.')
            return
        }

        setSubmitting(true)
        setError('')
        try {
            const created = await createOrder({
                customerName: customerName || 'Dine-in Guest',
                customerPhone: customerPhone || 'N/A',
                branchId: selectedBranchId,
                orderType,
                items: cart,
                subtotal,
                deliveryFee: 0,
                loyaltyDiscount: 0,
                total,
                paymentMethod: 'cod', // usually POS cash
                notes
            })
            setPlacedOrder(created)
        } catch (err: any) {
            setError(err.message || 'Failed to place order')
        } finally {
            setSubmitting(false)
        }
    }

    const handlePrint = () => {
        if (!placedOrder) return
        const printWindow = window.open('', '_blank', 'width=400,height=600')
        if (!printWindow) {
            alert('Popup blocker prevented receipt printing. Please allow popups for this site.')
            return
        }

        const selectedBranch = branches.find(b => b.id === placedOrder.branch_id)
        const branchName = selectedBranch ? selectedBranch.name : 'Zaitoon'
        const branchAddress = selectedBranch ? selectedBranch.address : 'Lahore, Pakistan'
        const branchPhone = selectedBranch ? selectedBranch.phone : ''

        const itemsHtml = cart.map(item => `
            <div class="flex-row">
                <span>${item.quantity}x ${item.name}</span>
                <span class="text-right">Rs. ${item.subtotal}</span>
            </div>
        `).join('')

        printWindow.document.write(`
            <html>
                <head>
                    <title>Zaitoon Receipt #${placedOrder.order_number || placedOrder.id.slice(0, 8)}</title>
                    <style>
                        body {
                            font-family: 'Courier New', Courier, monospace;
                            padding: 10px;
                            color: #000;
                            background: #fff;
                            font-size: 13px;
                            line-height: 1.4;
                            max-width: 300px;
                            margin: 0 auto;
                        }
                        .text-center { text-align: center; }
                        .text-right { text-align: right; }
                        .bold { font-weight: bold; }
                        .divider { border-top: 1px dashed #000; margin: 10px 0; }
                        .flex-row { display: flex; justify-content: space-between; }
                        h2 { margin: 5px 0; font-size: 16px; text-transform: uppercase; }
                        p { margin: 3px 0; }
                    </style>
                </head>
                <body onload="window.print(); setTimeout(() => window.close(), 500);">
                    <div class="text-center">
                        <h2>${branchName}</h2>
                        <p>${branchAddress}</p>
                        ${branchPhone ? `<p>Phone: ${branchPhone}</p>` : ''}
                        <p>EST. 2018 · LAHORE</p>
                    </div>
                    <div class="divider"></div>
                    <div>
                        <p><span class="bold">Order No:</span> #${placedOrder.order_number || placedOrder.id.slice(0, 8)}</p>
                        <p><span class="bold">Date:</span> ${new Date().toLocaleString()}</p>
                        <p><span class="bold">Type:</span> ${placedOrder.order_type.toUpperCase()}</p>
                        <p><span class="bold">Customer/Table:</span> ${placedOrder.customer_name}</p>
                    </div>
                    <div class="divider"></div>
                    <div>
                        ${itemsHtml}
                    </div>
                    <div class="divider"></div>
                    <div class="flex-row bold">
                        <span>Subtotal</span>
                        <span>Rs. ${placedOrder.subtotal}</span>
                    </div>
                    <div class="flex-row bold" style="font-size: 15px; margin-top: 5px;">
                        <span>TOTAL</span>
                        <span>Rs. ${placedOrder.total}</span>
                    </div>
                    ${placedOrder.notes ? `
                        <div class="divider"></div>
                        <p><span class="bold">Notes:</span> ${placedOrder.notes}</p>
                    ` : ''}
                    <div class="divider"></div>
                    <div class="text-center" style="margin-top: 15px; font-style: italic;">
                        Thank you for dining with us!
                    </div>
                </body>
            </html>
        `)
        printWindow.document.close()
    }

    const filteredMenuItems = menuItems.filter(item => {
        const matchesCategory = selectedCategoryId === 'all' || item.category_id === selectedCategoryId
        const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                             (item.description && item.description.toLowerCase().includes(searchQuery.toLowerCase()))
        return matchesCategory && matchesSearch
    })

    return (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
            
            <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="relative bg-[#FAFAFA] rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col md:flex-row overflow-hidden border border-[#E7E0D8]"
            >
                {placedOrder ? (
                    <div className="w-full h-full flex flex-col items-center justify-center bg-white p-6 md:p-12 overflow-y-auto">
                        <div className="flex flex-col items-center max-w-md w-full text-center">
                            <CheckCircle className="w-16 h-16 text-[var(--green-base)] mb-4 animate-bounce" />
                            <h2 className="text-2xl font-black text-[#18181B] mb-1">Order Successful!</h2>
                            <p className="text-sm text-gray-500 mb-6">Order #{placedOrder.order_number || placedOrder.id.slice(0, 8)} has been placed successfully.</p>

                            {/* POS Receipt Preview */}
                            <div className="w-full bg-[#FAFAFA] border-2 border-dashed border-[#E7E0D8] rounded-xl p-6 text-left font-mono text-sm text-gray-800 shadow-inner mb-6 max-h-[40vh] overflow-y-auto">
                                <div className="text-center font-bold text-[#18181B] text-base mb-2">
                                    {branches.find(b => b.id === placedOrder.branch_id)?.name || 'ZAITOON'}
                                </div>
                                <div className="text-center text-xs text-gray-500 mb-4">
                                    {branches.find(b => b.id === placedOrder.branch_id)?.address || 'Lahore, Pakistan'}
                                </div>
                                <div className="border-t border-dashed border-[#E7E0D8] my-3" />
                                <div className="space-y-1 text-xs">
                                    <p><span className="font-bold text-[#18181B]">Type:</span> {placedOrder.order_type.toUpperCase()}</p>
                                    <p><span className="font-bold text-[#18181B]">Customer/Table:</span> {placedOrder.customer_name}</p>
                                    <p><span className="font-bold text-[#18181B]">Phone:</span> {placedOrder.customer_phone}</p>
                                </div>
                                <div className="border-t border-dashed border-[#E7E0D8] my-3" />
                                <div className="space-y-2">
                                    {cart.map(item => (
                                        <div key={item.id} className="flex justify-between text-xs">
                                            <span>{item.quantity}x {item.name}</span>
                                            <span>Rs. {item.subtotal}</span>
                                        </div>
                                    ))}
                                </div>
                                <div className="border-t border-dashed border-[#E7E0D8] my-3" />
                                <div className="flex justify-between font-bold text-[#18181B] text-base">
                                    <span>TOTAL</span>
                                    <span>Rs. {placedOrder.total}</span>
                                </div>
                            </div>

                            <div className="flex gap-4 w-full">
                                <button
                                    onClick={handlePrint}
                                    className="flex-1 py-3 rounded-xl bg-white border border-[#E7E0D8] text-gray-800 hover:bg-gray-50 font-bold transition-all shadow-sm flex items-center justify-center gap-2"
                                >
                                    <Printer className="w-4 h-4 text-gray-600" />
                                    Print Receipt
                                </button>
                                <button
                                    onClick={onClose}
                                    className="flex-1 py-3 rounded-xl bg-[var(--green-base)] hover:bg-[var(--green-dark)] text-white font-bold transition-all shadow-md"
                                >
                                    Done
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <>
                        {/* Left Side: Menu Items */}
                        <div className="flex-1 flex flex-col h-full border-r border-[#E7E0D8] bg-white">
                            <div className="p-4 border-b border-[#E7E0D8] bg-[#FEF9EE] space-y-3">
                                <div className="flex items-center justify-between">
                                    <h2 className="text-xl font-bold text-[#18181B]">Menu</h2>
                                    {(searchQuery || selectedCategoryId !== 'all') && (
                                        <button 
                                            onClick={() => {
                                                setSearchQuery('')
                                                setSelectedCategoryId('all')
                                            }}
                                            className="text-xs text-red-600 hover:text-red-700 font-bold transition-colors"
                                        >
                                            Reset Filters
                                        </button>
                                    )}
                                </div>

                                {/* Search Input */}
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search menu items..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="w-full pl-9 pr-8 py-2 text-sm rounded-xl border border-[#E7E0D8] focus:outline-none focus:border-[var(--green-base)] bg-white text-[#18181B] transition-all"
                                    />
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-4 h-4">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.602 10.602Z" />
                                        </svg>
                                    </span>
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 hover:bg-gray-100 rounded-full text-gray-400 transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    )}
                                </div>

                                {/* Category Dropdown menu */}
                                <div className="relative">
                                    <select
                                        value={selectedCategoryId}
                                        onChange={e => setSelectedCategoryId(e.target.value)}
                                        className="w-full px-3.5 py-2 text-xs font-bold rounded-xl border border-[#E7E0D8] focus:outline-none focus:border-[var(--green-base)] bg-white text-gray-700 appearance-none transition-all cursor-pointer shadow-sm hover:border-gray-300 pr-10"
                                    >
                                        <option value="all">All Categories</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>
                                                {cat.label}
                                            </option>
                                        ))}
                                    </select>
                                    <span className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-3.5 h-3.5">
                                            <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                                        </svg>
                                    </span>
                                </div>
                            </div>
                            <div className="flex-1 overflow-y-auto p-4 space-y-2">
                                {loading ? (
                                    <p className="text-sm text-gray-500 text-center py-8">Loading...</p>
                                ) : filteredMenuItems.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                                        <p className="text-sm text-gray-400 font-bold">No menu items found</p>
                                        <p className="text-xs text-gray-400 mt-1">Try resetting or using different search terms.</p>
                                    </div>
                                ) : (
                                    filteredMenuItems.map(item => (
                                        <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border border-[#E7E0D8] hover:border-[var(--green-base)] transition-colors">
                                            <div>
                                                <p className="font-bold text-sm text-[#18181B]">{item.name}</p>
                                                <p className="text-xs font-semibold text-[var(--green-dark)]">{formatPrice(item.price ?? 0)}</p>
                                            </div>
                                            <button
                                                onClick={() => addToCart(item)}
                                                className="w-8 h-8 rounded-full bg-[var(--green-base)] text-white flex items-center justify-center hover:bg-[var(--green-dark)] transition-colors"
                                            >
                                                <Plus className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>

                        {/* Right Side: Cart & Checkout */}
                        <div className="w-full md:w-[400px] flex flex-col h-full bg-[#FAFAFA]">
                            <div className="p-4 border-b border-[#E7E0D8] flex justify-between items-center bg-white">
                                <h2 className="text-xl font-bold text-[#18181B]">Current Order</h2>
                                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full transition-colors text-gray-500">
                                    <X className="w-5 h-5" />
                                </button>
                            </div>

                            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
                                {/* Order Type */}
                                <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
                                    {(['dine-in', 'takeaway'] as const).map(t => (
                                        <button
                                            key={t}
                                            onClick={() => setOrderType(t)}
                                            className={`flex-1 py-1.5 rounded-md text-xs font-bold capitalize transition-all ${orderType === t ? 'bg-white shadow text-[#18181B]' : 'text-gray-500 hover:text-gray-900'}`}
                                        >
                                            {t.replace('-', ' ')}
                                        </button>
                                    ))}
                                </div>

                                {/* Branch Selection */}
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Branch context</label>
                                    {branches.length > 1 ? (
                                        <select
                                            value={selectedBranchId}
                                            onChange={e => setSelectedBranchId(e.target.value)}
                                            className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7E0D8] focus:outline-none focus:border-[var(--green-base)] bg-white font-medium text-gray-800"
                                        >
                                            {branches.map(b => (
                                                <option key={b.id} value={b.id}>{b.name}</option>
                                            ))}
                                        </select>
                                    ) : (
                                        <div className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7E0D8] bg-gray-50 font-medium text-gray-700">
                                            {branches[0]?.name || 'Loading branch...'}
                                        </div>
                                    )}
                                </div>

                                {/* Customer Info */}
                                <div className="space-y-3">
                                    <input 
                                        type="text"
                                        placeholder={orderType === 'dine-in' ? "Table / Name (Optional)" : "Customer Name *"}
                                        value={customerName}
                                        onChange={e => setCustomerName(e.target.value)}
                                        className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7E0D8] focus:outline-none focus:border-[var(--green-base)] bg-white text-[#18181B]"
                                    />
                                    {orderType === 'takeaway' && (
                                        <input 
                                            type="text"
                                            placeholder="Phone Number (Optional)"
                                            value={customerPhone}
                                            onChange={e => setCustomerPhone(e.target.value)}
                                            className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7E0D8] focus:outline-none focus:border-[var(--green-base)] bg-white text-[#18181B]"
                                        />
                                    )}
                                     <input 
                                        type="text"
                                        placeholder="Order Notes (Optional)"
                                        value={notes}
                                        onChange={e => setNotes(e.target.value)}
                                        className="w-full px-3 py-2 text-sm rounded-xl border border-[#E7E0D8] focus:outline-none focus:border-[var(--green-base)] bg-white text-[#18181B]"
                                    />
                                </div>

                                <hr className="border-[#E7E0D8]" />

                                {/* Cart Items */}
                                <div className="flex-1 space-y-3 font-medium">
                                    {cart.length === 0 ? (
                                        <p className="text-sm text-gray-400 text-center py-8">Cart is empty</p>
                                    ) : (
                                        cart.map(item => (
                                            <div key={item.id} className="flex gap-3 text-sm">
                                                <div className="flex-1">
                                                    <p className="font-bold text-[#18181B]">{item.name}</p>
                                                    <p className="text-xs font-medium text-gray-500">{formatPrice(item.unitPrice)}</p>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className="flex items-center gap-1 bg-white border border-[#E7E0D8] rounded-lg p-0.5">
                                                        <button onClick={() => updateQty(item.id, -1)} className="p-1 hover:bg-gray-100 rounded-md text-gray-500"><Minus className="w-3 h-3" /></button>
                                                        <span className="w-4 text-center font-bold text-xs text-gray-700">{item.quantity}</span>
                                                        <button onClick={() => updateQty(item.id, 1)} className="p-1 hover:bg-gray-100 rounded-md text-gray-500"><Plus className="w-3 h-3" /></button>
                                                    </div>
                                                    <button onClick={() => removeFromCart(item.id)} className="p-1 text-red-500 hover:bg-red-50 rounded-md"><X className="w-3 h-3" /></button>
                                                </div>
                                            </div>
                                        ))
                                    )}
                                </div>
                            </div>

                            <div className="p-4 bg-white border-t border-[#E7E0D8] space-y-4">
                                {error && <p className="text-xs text-red-600 font-bold bg-red-50 p-2 rounded-lg">{error}</p>}
                                
                                <div className="flex justify-between items-center text-lg font-bold text-[#18181B]">
                                    <span>Total</span>
                                    <span>{formatPrice(total)}</span>
                                </div>

                                <button
                                    onClick={handlePlaceOrder}
                                    disabled={submitting || cart.length === 0}
                                    className="w-full py-3 rounded-xl bg-[var(--green-base)] hover:bg-[var(--green-dark)] text-white font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                                >
                                    {submitting ? 'Placing Order...' : (
                                        <>
                                            <ShoppingBag className="w-4 h-4" />
                                            Place Order
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </motion.div>
        </div>
    )
}
