"use client";
import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, SlidersHorizontal, Info, SearchX, ShoppingCart, ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileCartBar from "@/components/layout/MobileCartBar";
import MenuItemCard from "@/components/menu/MenuItemCard";
import { MenuCardSkeleton } from "@/components/menu/LoadingSkeleton";
import { getMenuItems, getCategories } from "@/lib/api/menu";
import { BBQ_ACCOMPANIMENTS } from "@/lib/mock/data";
import { useLanguageStore } from "@/store/useLanguageStore";
import { translations } from "@/lib/translations";
import type { ItemTag, MenuItem } from "@/types";
import { useCartStore } from "@/store/useCartStore";
import { formatPrice } from "@/lib/payment";

type SortOption = "default" | "price-asc" | "price-desc" | "rating";
type FilterTag = "all" | ItemTag;
type MenuCategory = { id: string; label: string; icon?: string };

export default function MenuPage() {
  const router = useRouter();
  const { language, isRTL } = useLanguageStore();
  const t = translations[language];
  const cartCount = useCartStore((s) => s.itemCount());
  const cartTotal = useCartStore((s) => s.total());
  const cartSubtotal = useCartStore((s) => s.subtotal());

  const FILTER_CHIPS: { label: string; value: FilterTag }[] = [
    { label: t.allItems, value: "all" },
    { label: t.bestsellers, value: "bestseller" },
    { label: t.newTitle, value: "new" },
  ];

  const [activeCategory, setActiveCategory] = useState("");
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTag>("all");
  const [sort, setSort] = useState<SortOption>("default");
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [allItems, setAllItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);

  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    Promise.all([getCategories(), getMenuItems()])
      .then(([cats, items]) => {
        setCategories(cats);
        setAllItems(items);
        if (cats.length > 0) setActiveCategory(cats[0].id);
      })
      .finally(() => setLoading(false));
  }, []);

  const handleCategoryClick = (catId: string) => {
    setActiveCategory(catId);
    sectionRefs.current[catId]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const filteredItems = useMemo(() => {
    let items = [...allItems];
    if (search.trim()) {
      const q = search.toLowerCase();
      items = allItems.filter(
        (i) =>
          i.name.toLowerCase().includes(q) ||
          i.description?.toLowerCase().includes(q)
      );
    }
    if (activeFilter !== "all")
      items = items.filter((i) => (i.tags ?? []).includes(activeFilter as ItemTag));
    switch (sort) {
      case "price-asc":  return [...items].sort((a, b) => (a.price ?? 0) - (b.price ?? 0));
      case "price-desc": return [...items].sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
      case "rating":     return [...items].sort((a, b) => b.rating - a.rating);
      default:           return items;
    }
  }, [search, activeFilter, sort, allItems]);

  const groupedFilteredItems = useMemo(() => {
    const grouped: Record<string, MenuItem[]> = {};
    categories.forEach((cat) => { grouped[cat.id] = []; });
    filteredItems.forEach((item) => {
      if (!item.category_id) return;
      if (!grouped[item.category_id]) grouped[item.category_id] = [];
      grouped[item.category_id].push(item);
    });
    return grouped;
  }, [filteredItems, categories]);


  useEffect(() => {
    if (categories.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]?.target?.id) setActiveCategory(visible[0].target.id);
      },
      { rootMargin: "-140px 0px -55% 0px", threshold: [0.2, 0.4, 0.7] }
    );
    categories.forEach((cat) => {
      const el = sectionRefs.current[cat.id];
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, [categories, groupedFilteredItems]);

  return (
    <>
      <Navbar />

      <motion.main
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        role="main"
        className="pb-16 w-full pt-[60px] lg:pt-[68px]"
        style={{ background: "var(--cream)", fontFamily: "var(--font-body)" }}
      >
        <section className="w-full max-w-7xl mx-auto px-4 lg:px-8 pt-7 pb-4">
          <div
            className="relative overflow-hidden rounded-[20px] px-6 py-8 md:px-8 md:py-10"
            style={{
              backgroundImage: `
                linear-gradient(125deg, rgba(251,246,246,0.94) 0%, rgba(244,237,237,0.95) 45%, rgba(229,218,218,0.88) 100%),
                url("https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=1400&q=80")
              `,
              backgroundSize: "cover",
              backgroundPosition: "center",
              border: "1px solid rgba(184,98,94,0.30)",
              boxShadow: "0 18px 40px rgba(76,92,45,0.10)",
            }}
          >
            <p className="section-label mb-3">Explore Our Signature Menu</p>
            <h1 className="text-[var(--charcoal)]" style={{ fontFamily: "var(--font-body)", fontWeight: 700, letterSpacing: "-0.01em" }}>{t.menu}</h1>
            <p className="text-[14px] md:text-[15px] text-[var(--stone)] mt-3 max-w-2xl">
              Freshly prepared Lebanese-inspired favorites with clear categories, quick filters, and a smooth ordering flow.
            </p>
          </div>
        </section>

        {/* ── STICKY HEADER BAR ── */}
        <div
          className="sticky top-[60px] lg:top-[68px] z-40 w-full px-4 lg:px-8"
          style={{
            background: "transparent",
          }}
        >
          <div
            className="max-w-7xl mx-auto flex flex-col rounded-[16px] overflow-hidden"
            style={{
              background: "linear-gradient(180deg, rgba(251,246,246,0.98) 0%, rgba(244,237,237,0.98) 100%)",
              border: "1px solid rgba(229,218,218,0.95)",
              boxShadow: "0 10px 30px rgba(76,92,45,0.12)",
            }}
          >

            {/* Row 1: Search + Filters */}
            <div className="w-full flex flex-col md:flex-row items-center gap-3 px-4 lg:px-8 py-3"
              style={{ borderBottom: "1px solid rgba(229,218,218,0.95)" }}>

              {/* Search */}
              <div className="relative w-full md:max-w-[320px] shrink-0">
                <Search className={`absolute ${isRTL ? "right-3" : "left-3"} top-1/2 -translate-y-1/2 w-4 h-4`}
                  style={{ color: "rgba(111,106,98,0.65)" }} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.searchMenu}
                  aria-label={t.searchMenu}
                  className={`w-full rounded-[10px] text-[var(--charcoal)] text-[14px] transition-all ${isRTL ? "pr-9 pl-10" : "pl-9 pr-10"} py-2.5`}
                  style={{
                    background: "rgba(255,255,255,0.9)",
                    border: "1px solid rgba(184,98,94,0.30)",
                    outline: "none",
                  }}
                  onFocus={e => {
                    e.currentTarget.style.borderColor = "rgba(184,98,94,0.65)";
                    e.currentTarget.style.background = "#fff";
                  }}
                  onBlur={e => {
                    e.currentTarget.style.borderColor = "rgba(184,98,94,0.30)";
                    e.currentTarget.style.background = "rgba(255,255,255,0.9)";
                  }}
                />
                {search && (
                  <button
                    onClick={() => setSearch("")}
                    className={`absolute ${isRTL ? "left-3" : "right-3"} top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition-colors hover:bg-white/10`}
                    style={{ color: "rgba(111,106,98,0.65)" }}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Filter chips */}
              <div role="radiogroup" aria-label="Filter items"
                className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-0.5 w-full">
                {FILTER_CHIPS.map((chip) => {
                  const active = activeFilter === chip.value;
                  return (
                    <button
                      key={chip.value}
                      role="radio"
                      aria-checked={active}
                      onClick={() => setActiveFilter(chip.value)}
                      className="shrink-0 rounded-[20px] px-4 py-[6px] text-[12px] font-[700] tracking-wide transition-all duration-200"
                      style={{
                        background: active
                          ? "linear-gradient(135deg, #B8625E, #A6524F)"
                          : "rgba(184,98,94,0.14)",
                        color: active ? "#fff" : "var(--charcoal)",
                        border: active ? "none" : "1px solid rgba(184,98,94,0.24)",
                        boxShadow: active ? "0 6px 16px rgba(184,98,94,0.30)" : "none",
                        transform: active ? "scale(1.02)" : "scale(1)",
                      }}
                    >
                      {chip.label}
                    </button>
                  );
                })}

                {/* Sort */}
                <div className="flex items-center gap-1.5 ml-auto shrink-0">
                  <SlidersHorizontal className="w-3.5 h-3.5" style={{ color: "rgba(111,106,98,0.65)" }} />
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value as SortOption)}
                    aria-label="Sort items"
                    className="rounded-[8px] text-[12px] font-[600] px-2 py-1.5 transition-colors cursor-pointer"
                    style={{
                      background: "rgba(255,255,255,0.9)",
                      border: "1px solid rgba(184,98,94,0.28)",
                      color: "var(--charcoal)",
                      outline: "none",
                    }}
                  >
                    <option value="default">Default</option>
                    <option value="price-asc">Price ↑</option>
                    <option value="price-desc">Price ↓</option>
                    <option value="rating">Top Rated</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Row 2: Categories */}
            <div className="w-full overflow-x-auto scrollbar-hide px-4 lg:px-8 py-2.5">
              <ul role="tablist" aria-label="Menu categories" className="flex items-center gap-2">
                {categories.map((cat) => {
                  const active = activeCategory === cat.id;
                  const itemCount = allItems.filter((i) => i.category_id === cat.id).length;
                  return (
                    <li key={cat.id} className="shrink-0">
                      <button
                        role="tab"
                        onClick={() => handleCategoryClick(cat.id)}
                        aria-selected={active}
                        className="flex items-center gap-2 whitespace-nowrap transition-all duration-250 rounded-[10px] px-4 py-2"
                        style={{
                          background: active
                            ? "linear-gradient(135deg, #B8625E, #A6524F)"
                            : "rgba(184,98,94,0.14)",
                          color: active ? "#fff" : "var(--charcoal)",
                          fontWeight: active ? 700 : 600,
                          fontSize: 13,
                          boxShadow: active ? "0 6px 16px rgba(184,98,94,0.30)" : "none",
                          border: active ? "none" : "1px solid rgba(184,98,94,0.22)",
                          transform: active ? "scale(1.02)" : "scale(1)",
                        }}
                      >
                        {cat.label}
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded-full font-[700]"
                          style={{
                            background: active ? "rgba(255,255,255,0.20)" : "rgba(184,98,94,0.14)",
                            color: active ? "rgba(255,255,255,0.92)" : "rgba(36,33,28,0.70)",
                          }}
                        >
                          {itemCount}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </div>

        {/* ── MENU ITEMS ── */}
        <section aria-label="Menu items" className="w-full max-w-7xl mx-auto px-4 lg:px-8 py-8 min-h-screen">
          {/* Grid / Sections */}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.ul
                role="list"
                key="skeleton"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-5"
              >
                {[...Array(8)].map((_, i) => <MenuCardSkeleton key={i} />)}
              </motion.ul>
            ) : filteredItems.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                role="status"
                aria-live="polite"
                className="flex flex-col items-center justify-center py-28 text-center"
              >
                <SearchX className="w-14 h-14 mb-5 text-[var(--stone)] opacity-60" />
                <h3 className="text-[var(--charcoal)] mb-2">{t.noItemsFound}</h3>
                <p className="text-[var(--stone)] mb-8">{t.tryDifferent}</p>
                <button
                  onClick={() => { setSearch(""); setActiveFilter("all"); }}
                  aria-label={t.clearFilters}
                  className="btn-primary"
                >
                  {t.clearFilters}
                </button>
              </motion.div>
            ) : (
              <div className="space-y-12">
                {categories.map((cat) => {
                  const items = groupedFilteredItems[cat.id] ?? [];
                  if (items.length === 0) return null;
                  const isBBQSection = cat.label === "BBQ Rolls";
                  return (
                    <section
                      key={cat.id}
                      id={cat.id}
                      ref={(el) => { sectionRefs.current[cat.id] = el; }}
                      className="scroll-mt-[170px]"
                    >
                      <div className="mb-6">
                        <h2 className={`text-[var(--green-dark)] flex items-baseline gap-3 ${isRTL ? "flex-row-reverse" : ""}`} style={{ fontFamily: "var(--font-body)", fontWeight: 700 }}>
                          {cat.label}
                          <span className="text-[13px] text-[var(--stone)] font-[500]">
                            ({items.length} {t.itemsCount})
                          </span>
                        </h2>
                        <div
                          style={{
                            transformOrigin: isRTL ? "right" : "left",
                            height: 3,
                            background: "linear-gradient(90deg, var(--orange-warm), var(--green-base))",
                            width: 64,
                            marginTop: 10,
                            borderRadius: 99,
                            marginLeft: isRTL ? "auto" : 0,
                          }}
                        />
                      </div>

                      {/* Accompaniments — shown per-item from DB, fallback to global BBQ_ACCOMPANIMENTS */}
                      {isBBQSection && !search && (() => {
                        // Collect unique non-empty accompaniments from items in this section
                        const perItemAccompaniments = items
                          .filter(i => (i as any).accompaniments)
                          .map(i => (i as any).accompaniments as string)
                        // Show first non-empty accompaniments found, or the global fallback
                        const accompanimentText = perItemAccompaniments[0] ?? BBQ_ACCOMPANIMENTS
                        return (
                          <div
                            className="flex items-start gap-3 mb-5 p-4 rounded-[12px]"
                            style={{ background: "white", border: "1.5px solid var(--linen)" }}
                          >
                            <Info className="w-4 h-4 mt-0.5 text-[var(--orange-rich)]" />
                            <p className="text-[13px] text-[var(--stone)] leading-relaxed">
                              <strong className="text-[var(--charcoal)] font-[700] uppercase tracking-wider text-[11px] block mb-1">
                                {t.accompaniments}
                              </strong>
                              {accompanimentText}
                            </p>
                          </div>
                        )
                      })()}

                      <motion.ul
                        role="list"
                        variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
                        initial="hidden"
                        whileInView="show"
                        viewport={{ once: true, margin: "-40px" }}
                        className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-6"
                      >
                        {items.map((item) => (
                          <motion.li
                            key={item.id}
                            variants={{
                              hidden: { opacity: 0, y: 24 },
                              show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
                            }}
                          >
                            <MenuItemCard item={item} />
                          </motion.li>
                        ))}
                      </motion.ul>
                    </section>
                  );
                })}
              </div>
            )}
          </AnimatePresence>
        </section>

        <AnimatePresence>
          {cartCount > 0 && (
            <motion.aside
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className="hidden lg:block fixed right-6 bottom-6 z-40 w-[320px] rounded-[16px] p-4"
              style={{
                background: "rgba(251,246,246,0.97)",
                border: "1px solid rgba(184,98,94,0.22)",
                boxShadow: "0 14px 36px rgba(76,92,45,0.16)",
                backdropFilter: "blur(12px)",
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <p className="text-[13px] font-[700] text-[var(--charcoal)] inline-flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4" /> {cartCount} items in cart
                </p>
                <p className="text-[12px] font-[700]" style={{ color: "var(--green-dark)" }}>
                  {formatPrice(cartSubtotal)}
                </p>
              </div>
              <button
                onClick={() => router.push("/checkout")}
                className="w-full rounded-[12px] px-4 py-3 text-white text-[13px] font-[700] uppercase tracking-[0.08em] inline-flex items-center justify-between"
                style={{
                  background: "linear-gradient(135deg, #B8625E, #A6524F)",
                  boxShadow: "0 8px 20px rgba(184,98,94,0.34)",
                }}
              >
                <span>Proceed to Checkout</span>
                <span className="inline-flex items-center gap-1">
                  {formatPrice(cartTotal)} <ArrowRight className="w-4 h-4" />
                </span>
              </button>
            </motion.aside>
          )}
        </AnimatePresence>
      </motion.main>

      <Footer />
      <MobileCartBar />
    </>
  );
}
