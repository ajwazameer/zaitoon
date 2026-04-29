'use client'
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { Plus, Search, Pencil, Trash2, X, Tags, FolderPlus, MoreVertical } from 'lucide-react'
import AdminLayout from '@/components/admin/AdminLayout'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import {
    getMenuItems, updateMenuItemAvailability, updateMenuItem, createMenuItem,
    deleteMenuItem, getCategories, getAllMenuItemsAdmin,
    createCategory, updateCategory, deleteCategory,
    getItemVariants, upsertItemVariants,
} from '@/lib/api/menu'
import { formatPrice } from '@/lib/payment'
import MenuImageUpload from '@/components/admin/MenuImageUpload'
import Image from 'next/image'

// ── Schemas ──────────────────────────────────────────────────────────────────
const itemSchema = z.object({
    name: z.string().min(2, 'Name is required'),
    category: z.string().min(1, 'Category is required'),
    price: z.number().min(0),
    priceL: z.number().min(0).nullable().optional(),
    description: z.string().optional(),
    badge: z.string().optional(),
    accompaniments: z.string().optional(),
    priceOnRequest: z.boolean().optional(),
})
type ItemForm = z.infer<typeof itemSchema>

const catSchema = z.object({
    label: z.string().min(1, 'Category name is required'),
    icon: z.string().optional(),
})
type CatForm = z.infer<typeof catSchema>

interface Variant { label: string; price: number }

// ── Shared field styles ───────────────────────────────────────────────────────
const fieldCls = 'w-full px-4 py-3 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white outline-none focus:border-green-500 focus:ring-2 focus:ring-green-100 placeholder-gray-500 transition'
const labelCls = 'block text-sm font-semibold text-gray-700 mb-1.5'

export default function AdminMenuPage() {
    const [items, setItems] = useState<any[]>([])
    const [categories, setCategories] = useState<any[]>([])

    const reload = () =>
        Promise.all([getAllMenuItemsAdmin(), getCategories()]).then(([itm, cat]) => {
            setItems(itm); setCategories(cat)
        })

    useEffect(() => { reload() }, [])

    const [search, setSearch] = useState('')
    const [catFilter, setCatFilter] = useState('all')
    const [editing, setEditing] = useState<any>(null)
    const [isNew, setIsNew] = useState(false)
    const [delTarget, setDelTarget] = useState<any>(null)
    const [variants, setVariants] = useState<Variant[]>([])

    // Category management state
    const [showCatDialog, setShowCatDialog] = useState(false)
    const [editingCat, setEditingCat] = useState<any>(null)
    const [delCatTarget, setDelCatTarget] = useState<any>(null)
    const [catMenuId, setCatMenuId] = useState<string | null>(null)

    const visible = useMemo(() => {
        let list = items
        if (catFilter !== 'all') list = list.filter(i => i.category_id === catFilter)
        if (search) list = list.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
        return list
    }, [items, search, catFilter])

    // ── Item form ─────────────────────────────────────────────────────────────
    const { register, handleSubmit, reset, formState: { errors } } = useForm<ItemForm>({
        resolver: zodResolver(itemSchema),
        defaultValues: { name: '', category: '', price: 0, priceL: null, description: '', badge: '', accompaniments: '', priceOnRequest: false }
    })

    const openEdit = async (item: any) => {
        setEditing({ ...item }); setIsNew(false)
        reset({
            name: item.name,
            category: item.category_id,
            price: item.price,
            priceL: item.price_large,
            description: item.description ?? '',
            badge: item.badge ?? '',
            accompaniments: item.accompaniments ?? '',
            priceOnRequest: item.price_on_request ?? false,
        })
        const v = await getItemVariants(item.id).catch(() => [])
        setVariants(v.map((r: any) => ({ label: r.label, price: r.price })))
    }
    const openAdd = () => {
        setEditing({ id: `item_${Date.now()}`, name: '', category_id: categories[0]?.id || '', price: 0, rating: 4.5, is_available: true, image_url: null })
        setIsNew(true)
        reset({ name: '', category: categories[0]?.id || '', price: 0, description: '', badge: '', accompaniments: '', priceOnRequest: false })
        setVariants([])
    }

    const onSave = async (data: ItemForm) => {
        // Auto-derive has_sizes: true whenever a large price is set
        const hasSizes = !!(data.priceL && data.priceL > 0)
        const payload = {
            name: data.name,
            category_id: data.category,
            price: data.price,
            price_large: data.priceL ?? null,
            description: data.description ?? '',
            has_sizes: hasSizes,
            badge: data.badge?.trim() || null,
            accompaniments: data.accompaniments?.trim() || null,
            image_url: editing?.image_url || null,
            price_on_request: data.priceOnRequest ?? false,
        }
        try {
            if (isNew) {
                const created = await createMenuItem({ ...payload, is_available: true, rating: 4.5 })
                // Save variants — errors are surfaced, not swallowed
                await upsertItemVariants(created.id, variants)
                toast.success('Item added ✓')
            } else if (editing) {
                await updateMenuItem(editing.id, payload)
                await upsertItemVariants(editing.id, variants)
                toast.success('Item saved ✓')
            }
            setEditing(null)
            // Reload from DB so UI reflects latest saved data
            reload()
        } catch (err: any) {
            console.error('Save failed:', err)
            toast.error('Save failed: ' + (err?.message ?? 'Unknown error'))
        }
    }

    const confirmDelete = async () => {
        if (!delTarget) return
        setItems(prev => prev.filter(i => i.id !== delTarget.id))
        await deleteMenuItem(delTarget.id)
        toast.success(`Deleted "${delTarget.name}"`)
        setDelTarget(null)
    }

    const toggleAvailability = async (id: string, current: boolean) => {
        const next = !current
        setItems(prev => prev.map(i => i.id === id ? { ...i, is_available: next } : i))
        await updateMenuItemAvailability(id, next).catch(console.error)
    }

    // ── Variant helpers ───────────────────────────────────────────────────────
    const addVariant = () => setVariants(v => [...v, { label: '', price: 0 }])
    const removeVariant = (i: number) => setVariants(v => v.filter((_, idx) => idx !== i))
    const updateVariant = (i: number, field: keyof Variant, val: string | number) =>
        setVariants(v => v.map((item, idx) => idx === i ? { ...item, [field]: val } : item))

    // ── Category form ─────────────────────────────────────────────────────────
    const { register: regCat, handleSubmit: handleCatSubmit, reset: resetCat, formState: { errors: catErrors } } = useForm<CatForm>({
        resolver: zodResolver(catSchema),
        defaultValues: { label: '', icon: '' }
    })
    const openNewCat = () => { setEditingCat(null); resetCat({ label: '', icon: '' }); setShowCatDialog(true) }
    const openEditCat = (cat: any) => { setEditingCat(cat); resetCat({ label: cat.label, icon: cat.icon ?? '' }); setShowCatDialog(true) }
    const onSaveCat = async (data: CatForm) => {
        if (editingCat) {
            await updateCategory(editingCat.id, { label: data.label, icon: data.icon })
            toast.success('Category updated ✓')
        } else {
            await createCategory({ label: data.label, icon: data.icon, display_order: categories.length })
            toast.success('Category created ✓')
        }
        setShowCatDialog(false)
        reload()
    }
    const confirmDeleteCat = async () => {
        if (!delCatTarget) return
        await deleteCategory(delCatTarget.id)
        toast.success(`Category "${delCatTarget.label}" removed`)
        setDelCatTarget(null)
        reload()
    }

    return (
        <AdminLayout>
            <div className="p-6 max-w-6xl mx-auto space-y-8">

                {/* ── Category Management Section ─────────────────────────── */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6">
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Tags className="w-5 h-5 text-green-600" /> Menu Categories
                        </h2>
                        <button onClick={openNewCat}
                            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors">
                            <FolderPlus className="w-4 h-4" /> New Category
                        </button>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {categories.map(cat => (
                            <div key={cat.id} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-gray-200 bg-gray-50 group">
                                {cat.icon && <span className="text-lg">{cat.icon}</span>}
                                <span className="text-sm font-semibold text-gray-700">{cat.label}</span>
                                <div className="flex gap-1 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => openEditCat(cat)}
                                        className="p-1 rounded-lg hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors">
                                        <Pencil className="w-3 h-3" />
                                    </button>
                                    <button onClick={() => setDelCatTarget(cat)}
                                        className="p-1 rounded-lg hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors">
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            </div>
                        ))}
                        {categories.length === 0 && (
                            <p className="text-sm text-gray-600 italic">No categories yet. Create one above.</p>
                        )}
                    </div>
                </div>

                {/* ── Menu Items Header ───────────────────────────────────── */}
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="font-display text-2xl font-bold mr-auto text-gray-900">Menu Items</h1>
                    <div className="flex items-center gap-2 bg-white rounded-xl px-3 py-2 border border-gray-200">
                        <Search className="w-4 h-4 text-gray-500" />
                        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search items..."
                            className="outline-none text-sm w-40 text-gray-800 bg-transparent" />
                    </div>
                    <select value={catFilter} onChange={e => setCatFilter(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-gray-200 bg-white text-sm outline-none text-gray-800">
                        <option value="all">All Categories</option>
                        {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                    <button onClick={openAdd}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-green-600 hover:bg-green-700 text-white text-sm font-semibold transition-colors">
                        <Plus className="w-4 h-4" /> Add Item
                    </button>
                </div>

                {/* ── Items Table ─────────────────────────────────────────── */}
                <div className="bg-white rounded-3xl border border-gray-200 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-gray-50 border-b border-gray-200">
                            <tr>
                                {['Image', 'Name', 'Category', 'Price', 'Available', 'Actions'].map(h => (
                                    <th key={h} className="px-5 py-4 text-left text-xs font-bold text-gray-600 uppercase tracking-wider">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            <AnimatePresence>
                                {visible.map((item, i) => (
                                    <motion.tr key={item.id} layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                                        className="border-b last:border-0 border-gray-100 hover:bg-gray-50 transition-colors" transition={{ delay: i * 0.02 }}>
                                        <td className="px-5 py-4" style={{ width: 64 }}>
                                            {item.image_url ? (
                                                <Image src={item.image_url} alt={item.name} width={56} height={42}
                                                    style={{ borderRadius: 6, objectFit: 'cover', width: 56, height: 42 }} unoptimized />
                                            ) : (
                                                <div style={{ width: 56, height: 42, backgroundColor: '#F3F4F6', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18 }}>🖼️</div>
                                            )}
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="font-bold text-gray-900">{item.name}</span>
                                            {item.description && <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{item.description}</p>}
                                        </td>
                                        <td className="px-5 py-4 text-gray-700 capitalize">{categories.find(c => c.id === item.category_id)?.label}</td>
                                        <td className="px-5 py-4 font-medium text-gray-800">
                                            {item.price !== null ? formatPrice(item.price) : '—'}
                                        </td>
                                        <td className="px-5 py-4">
                                            <Switch className="data-[state=checked]:bg-green-600" checked={item.is_available}
                                                onCheckedChange={() => toggleAvailability(item.id, item.is_available)} />
                                        </td>
                                        <td className="px-5 py-4 flex gap-2">
                                            <button onClick={() => openEdit(item)}
                                                className="p-2 rounded-xl hover:bg-gray-100 text-gray-600 hover:text-green-700 transition-colors">
                                                <Pencil className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => setDelTarget(item)}
                                                className="p-2 rounded-xl hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </motion.tr>
                                ))}
                            </AnimatePresence>
                        </tbody>
                    </table>
                </div>

                {/* ── Add/Edit Item Dialog ────────────────────────────────── */}
                <Dialog open={!!editing} onOpenChange={open => !open && setEditing(null)}>
                    <DialogContent className="max-w-lg rounded-3xl border border-gray-200 bg-white p-0 overflow-hidden shadow-2xl" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
                        {/* Dialog Header */}
                        <div className="px-7 py-5 border-b border-gray-100 bg-gradient-to-r from-green-50 to-white">
                            <DialogTitle className="text-xl font-bold text-gray-900">{isNew ? '➕ Add New Item' : '✏️ Edit Item'}</DialogTitle>
                        </div>

                        <form onSubmit={handleSubmit(onSave)} className="px-7 py-6 space-y-5">
                            {/* Image */}
                            <div>
                                <label className={labelCls}>Item Image</label>
                                {editing && (
                                    <MenuImageUpload
                                        menuItemId={editing.id}
                                        currentImageUrl={editing.image_url || null}
                                        itemName={editing.name || 'New Item'}
                                        onImageUpdated={(newUrl) => {
                                            if (!isNew) setItems(prev => prev.map(item => item.id === editing.id ? { ...item, image_url: newUrl } : item))
                                            setEditing((prev: any) => prev ? { ...prev, image_url: newUrl } : null)
                                        }}
                                    />
                                )}
                            </div>

                            {/* Name */}
                            <div>
                                <label className={labelCls}>Item Name *</label>
                                <input {...register('name')} className={fieldCls} placeholder="e.g. Beef Shawarma" />
                                {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
                            </div>

                            {/* Category */}
                            <div>
                                <label className={labelCls}>Category *</label>
                                <select {...register('category')} className={fieldCls}>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                                </select>
                            </div>

                            {/* Prices */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelCls}>Price / Small (Rs.) *</label>
                                    <input {...register('price', { setValueAs: v => (v === '' || isNaN(Number(v))) ? 0 : Number(v) })}
                                        type="number" className={fieldCls} placeholder="850" />
                                    {errors.price && <p className="text-red-500 text-xs mt-1">{errors.price.message}</p>}
                                </div>
                                <div>
                                    <label className={labelCls}>Large Price (Rs.) <span className="font-normal text-gray-500 text-xs">— enables size toggle</span></label>
                                    <input {...register('priceL', { setValueAs: v => (v === '' || isNaN(Number(v))) ? null : Number(v) })}
                                        type="number" className={fieldCls} placeholder="Optional" />
                                </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                                <input type="checkbox" {...register('priceOnRequest')} id="priceOnRequest" className="w-4 h-4 text-green-600 rounded bg-white border-gray-300 focus:ring-green-500" />
                                <label htmlFor="priceOnRequest" className="text-sm font-semibold text-gray-700 cursor-pointer">Show "Ask for price" instead of amount</label>
                            </div>

                            {/* Description */}
                            <div>
                                <label className={labelCls}>Description</label>
                                <textarea {...register('description')} rows={3}
                                    className={fieldCls + ' resize-none'}
                                    placeholder="Short description shown on the menu card…" />
                            </div>

                            {/* Badge Label */}
                            <div>
                                <label className={labelCls}>Badge Label <span className="font-normal text-gray-500 text-xs">— e.g. Bestseller, New, Chef's Pick (leave blank for none)</span></label>
                                <input {...register('badge')} className={fieldCls} placeholder="e.g. Bestseller" />
                            </div>

                            {/* Accompaniments — shown in the BBQ section info box */}
                            <div>
                                <label className={labelCls}>Accompaniments / Included Items <span className="font-normal text-gray-500 text-xs">— shown below category heading</span></label>
                                <input {...register('accompaniments')} className={fieldCls}
                                    placeholder="e.g. 1 Puri | 2 Chapati | 1 Spicy Chutni | 2 Garlic Sauce" />
                            </div>

                            {/* Variants */}
                            <div className="bg-gray-50 rounded-2xl p-4 border border-gray-200">
                                <div className="flex items-center justify-between mb-3">
                                    <p className="text-sm font-bold text-gray-700">Variants / Options</p>
                                    <button type="button" onClick={addVariant}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold transition-colors">
                                        <Plus className="w-3.5 h-3.5" /> Add Variant
                                    </button>
                                </div>
                                <p className="text-xs text-gray-600 mb-3">e.g. Chicken (Rs. 850), Beef (Rs. 950). Leave empty to skip.</p>
                                {variants.length === 0 && (
                                    <p className="text-xs text-gray-600 italic text-center py-2">No variants added yet.</p>
                                )}
                                <div className="space-y-2">
                                    {variants.map((v, i) => (
                                        <div key={i} className="flex gap-2 items-center">
                                            <input
                                                value={v.label}
                                                onChange={e => updateVariant(i, 'label', e.target.value)}
                                                placeholder="e.g. Chicken"
                                                className="flex-1 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white outline-none focus:border-green-500 placeholder-gray-500"
                                            />
                                            <input
                                                type="number"
                                                value={v.price}
                                                onChange={e => updateVariant(i, 'price', Number(e.target.value))}
                                                placeholder="Price"
                                                className="w-28 px-3 py-2 rounded-xl border border-gray-200 text-sm text-gray-900 bg-white outline-none focus:border-green-500"
                                            />
                                            <button type="button" onClick={() => removeVariant(i)}
                                                className="p-2 rounded-xl hover:bg-red-50 text-gray-600 hover:text-red-600 transition-colors">
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setEditing(null)}
                                    className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit"
                                    className="flex-1 py-3 rounded-2xl bg-green-600 hover:bg-green-700 text-white text-sm font-bold transition-colors">
                                    Save Changes
                                </button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* ── Category Create/Edit Dialog ─────────────────────────── */}
                <Dialog open={showCatDialog} onOpenChange={open => !open && setShowCatDialog(false)}>
                    <DialogContent className="max-w-sm rounded-3xl border border-gray-200 bg-white p-0 overflow-hidden shadow-2xl">
                        <div className="px-7 py-5 border-b border-gray-100 bg-gradient-to-r from-blue-50 to-white">
                            <DialogTitle className="text-xl font-bold text-gray-900">
                                {editingCat ? '✏️ Rename Category' : '📁 New Category'}
                            </DialogTitle>
                        </div>
                        <form onSubmit={handleCatSubmit(onSaveCat)} className="px-7 py-6 space-y-4">
                            <div>
                                <label className={labelCls}>Category Name *</label>
                                <input {...regCat('label')} className={fieldCls} placeholder="e.g. Starters, BBQ, Desserts…" />
                                {catErrors.label && <p className="text-red-500 text-xs mt-1">{catErrors.label.message}</p>}
                            </div>
                            <div>
                                <label className={labelCls}>Icon / Emoji</label>
                                <input {...regCat('icon')} className={fieldCls} placeholder="e.g. 🥩 or leave blank" maxLength={4} />
                            </div>
                            <div className="flex gap-3 pt-1">
                                <button type="button" onClick={() => setShowCatDialog(false)}
                                    className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                                    Cancel
                                </button>
                                <button type="submit"
                                    className="flex-1 py-3 rounded-2xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold transition-colors">
                                    {editingCat ? 'Update' : 'Create'}
                                </button>
                            </div>
                        </form>
                    </DialogContent>
                </Dialog>

                {/* ── Delete Item Dialog ──────────────────────────────────── */}
                <Dialog open={!!delTarget} onOpenChange={open => !open && setDelTarget(null)}>
                    <DialogContent className="max-w-sm rounded-3xl border border-gray-200 bg-white p-0 overflow-hidden shadow-2xl">
                        <div className="px-7 py-5 border-b border-gray-100">
                            <DialogTitle className="text-xl font-bold text-gray-900">Delete Item?</DialogTitle>
                        </div>
                        <div className="px-7 py-6">
                            <p className="text-sm text-gray-600 mb-6">
                                Are you sure you want to delete <strong className="text-gray-900">"{delTarget?.name}"</strong>? This cannot be undone.
                            </p>
                            <div className="flex gap-3">
                                <button onClick={() => setDelTarget(null)}
                                    className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={confirmDelete}
                                    className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors">
                                    Delete
                                </button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

                {/* ── Delete Category Dialog ──────────────────────────────── */}
                <Dialog open={!!delCatTarget} onOpenChange={open => !open && setDelCatTarget(null)}>
                    <DialogContent className="max-w-sm rounded-3xl border border-gray-200 bg-white p-0 overflow-hidden shadow-2xl">
                        <div className="px-7 py-5 border-b border-gray-100">
                            <DialogTitle className="text-xl font-bold text-gray-900">Remove Category?</DialogTitle>
                        </div>
                        <div className="px-7 py-6">
                            <p className="text-sm text-gray-600 mb-6">
                                Remove <strong className="text-gray-900">"{delCatTarget?.label}"</strong>? Items in this category won't be deleted, but the category tab will be hidden from the menu.
                            </p>
                            <div className="flex gap-3">
                                <button onClick={() => setDelCatTarget(null)}
                                    className="flex-1 py-3 rounded-2xl border border-gray-200 text-sm font-bold text-gray-600 hover:bg-gray-50 transition-colors">
                                    Cancel
                                </button>
                                <button onClick={confirmDeleteCat}
                                    className="flex-1 py-3 rounded-2xl bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors">
                                    Remove
                                </button>
                            </div>
                        </div>
                    </DialogContent>
                </Dialog>

            </div>
        </AdminLayout>
    )
}
