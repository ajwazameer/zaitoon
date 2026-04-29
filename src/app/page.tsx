'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { motion, useScroll, useTransform, AnimatePresence, type Variants } from 'framer-motion'
import { Clock, ChevronRight, Star, Rocket, MapPin, ShoppingBag, Truck, Phone, MessageCircle } from 'lucide-react'
import Navbar from '@/components/layout/Navbar'
import Footer from '@/components/layout/Footer'
import MobileCartBar from '@/components/layout/MobileCartBar'
import MenuItemCard from '@/components/menu/MenuItemCard'
import LocationModal from '@/components/LocationModal'
import { getBranches } from '@/lib/api/branches'
import { getMenuItems, getSiteContent } from '@/lib/api/menu'
import { getFAQs, type FAQ } from '@/lib/api/faqs'
import { createClient } from '@/lib/supabase/client'
import { useLanguageStore } from '@/store/useLanguageStore'
import { useLocationStore } from '@/store/useLocationStore'
import { translations } from '@/lib/translations'

const supabase = createClient()

export default function HomePage() {
  const [loaded, setLoaded] = useState(false)
  const [branches, setBranches] = useState<any[]>([])
  const [menuItems, setMenuItems] = useState<any[]>([])
  const [branchCount, setBranchCount] = useState<number>(0)
  const [faqs, setFaqs] = useState<FAQ[]>([])
  const [openFaq, setOpenFaq] = useState<string | null>(null)
  const { language, isRTL } = useLanguageStore()
  const { locationSet } = useLocationStore()
  const [showLocationModal, setShowLocationModal] = useState(false)
  const [storeHydrated, setStoreHydrated] = useState(false)
  const heroRef = useRef<HTMLDivElement>(null)

  const { scrollYProgress } = useScroll({ target: heroRef, offset: ['start start', 'end start'] })
  const heroY = useTransform(scrollYProgress, [0, 1], [0, 80])
  const heroOpacity = useTransform(scrollYProgress, [0, 0.6], [1, 0])

  const t = translations[language]
  const [heroIntro, setHeroIntro] = useState(
    language === 'ur'
      ? 'اصلی لبنانی ذائقہ، فلیم گرل چکن کے ساتھ'
      : 'Fresh Lebanese Taste with Flame-Grilled Chicken'
  )

  useEffect(() => { setStoreHydrated(true) }, [])
  useEffect(() => {
    if (!storeHydrated) return
    if (locationSet) { setShowLocationModal(false); return }
    const timer = setTimeout(() => setShowLocationModal(true), 1200)
    return () => clearTimeout(timer)
  }, [storeHydrated, locationSet])

  useEffect(() => {
    Promise.all([getBranches(), getMenuItems(), getSiteContent()])
      .then(([b, m, content]) => {
        setBranches(b)
        setMenuItems(m)
        const key = language === 'ur' ? 'hero_tagline_ur' : 'hero_tagline_en'
        if (content[key]) setHeroIntro(content[key])
      })
      .finally(() => setLoaded(true))
    supabase.from('branches').select('id', { count: 'exact', head: true }).eq('is_active', true).then(({ count }) => setBranchCount(count ?? 2))
    getFAQs(true).then(setFaqs).catch(() => {})
  }, [])

  const featuredItems = menuItems.filter(i => (i.tags ?? []).includes('bestseller')).slice(0, 8)

  const gridVariants: Variants = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } }
  }
  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] } }
  }

  const steps = [
    { num: '01', icon: MapPin, title: t.step1Title, desc: t.step1Desc },
    { num: '02', icon: ShoppingBag, title: t.step2Title, desc: t.step2Desc },
    { num: '03', icon: Truck, title: t.step3Title, desc: t.step3Desc },
  ]

  return (
    <>
      {showLocationModal && (
        <LocationModal onClose={() => setShowLocationModal(false)} allowBackdropClose={locationSet} />
      )}
      <Navbar />

      <motion.main
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        role="main"
        dir={isRTL ? 'rtl' : 'ltr'}
      >
        {/* ══════════════════════════════════════════════
            HERO SECTION — Fresh green + orange gradient
        ══════════════════════════════════════════════ */}
        <section
          ref={heroRef}
          aria-label="Welcome to Zaitoon"
          className="relative w-full overflow-hidden min-h-[100dvh]"
          style={{
            backgroundImage: `
              linear-gradient(140deg, rgba(31,34,27,0.86) 0%, rgba(52,57,43,0.83) 45%, rgba(38,42,33,0.88) 100%),
              url("/hero-grilled-chicken.png")
            `,
            backgroundSize: 'cover',
            backgroundPosition: 'center 42%',
          }}
        >
          {/* Animated ambient orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <motion.div
              animate={{ scale: [1, 1.15, 1], opacity: [0.20, 0.30, 0.20] }}
              transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }}
              className="absolute top-[-15%] left-[-8%] w-[600px] h-[600px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(156,175,136,0.38) 0%, transparent 70%)' }}
            />
            <motion.div
              animate={{ scale: [1, 1.2, 1], opacity: [0.18, 0.28, 0.18] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut', delay: 2 }}
              className="absolute bottom-[-10%] right-[-5%] w-[520px] h-[520px] rounded-full"
              style={{ background: 'radial-gradient(circle, rgba(204,132,95,0.28) 0%, transparent 70%)' }}
            />
          </div>

          {/* Decorative diagonal right panel */}
          <div
            className="hidden lg:block absolute top-0 right-0 bottom-0"
            style={{
              width: '42%',
              background: 'linear-gradient(180deg, rgba(26,58,40,0.9) 0%, rgba(15,42,28,1) 100%)',
              clipPath: 'polygon(8% 0, 100% 0, 100% 100%, 0% 100%)'
            }}
          />

          {/* Dot grid */}
          <div className="absolute inset-0 pointer-events-none"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(156,175,136,0.08) 1px, transparent 0)`,
              backgroundSize: '40px 40px'
            }}
          />

          <motion.div
            style={{ y: heroY, opacity: heroOpacity }}
            className="relative z-10 max-w-7xl mx-auto px-6 lg:px-8 w-full flex flex-col lg:flex-row items-center lg:items-center min-h-[100dvh] pt-[120px] pb-[80px] gap-8"
          >
            {/* HERO LEFT CONTENT */}
            <div className="w-full lg:w-[68%] flex flex-col items-start pt-8 lg:pt-0">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <p className={`section-label mb-6 text-[var(--orange-warm)] ${isRTL ? 'text-right' : ''}`}>
                  {heroIntro}
                </p>
              </motion.div>

              <h1 className={`text-white ${isRTL ? 'text-right' : ''}`}>
                <motion.span
                  className="block"
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                >
                  {t.lahores}
                </motion.span>
                <motion.span
                  className="block italic"
                  style={{ color: 'var(--orange-pale)', textShadow: '0 0 60px rgba(204,132,95,0.35)' }}
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
                >
                  {t.finest}
                </motion.span>
                <motion.span
                  className="block"
                  initial={{ y: 50, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ duration: 0.7, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                >
                  {t.bbqGrill}
                </motion.span>
              </h1>

              <motion.div
                initial={{ scaleX: 0 }}
                animate={{ scaleX: 1 }}
                transition={{ duration: 0.7, delay: 0.55, ease: [0.16, 1, 0.3, 1] }}
                className={`h-[3px] w-[72px] mt-7 mb-7 rounded-full ${isRTL ? 'origin-right float-right' : 'origin-left'}`}
                style={{ background: 'linear-gradient(90deg, var(--orange-warm), var(--green-base))' }}
              />

              <motion.div
                initial={{ y: 28, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.6, delay: 0.65 }}
                className={isRTL ? 'text-right' : ''}
              >
                <p className="text-[17px] font-[300] leading-[1.7] max-w-md" style={{ color: 'rgba(250,243,224,0.65)' }}>
                  {t.heroDesc}
                </p>

                <div className={`mt-4 flex flex-wrap items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  {['Avg delivery 28 min', '4.9 customer rating', 'Live order tracking'].map((line) => (
                    <span
                      key={line}
                      className="text-[11px] font-[700] tracking-[0.06em] uppercase px-3 py-1.5 rounded-full"
                      style={{
                        background: 'rgba(188,217,162,0.20)',
                        border: '1px solid rgba(188,217,162,0.38)',
                        color: 'rgba(250,243,224,0.86)',
                      }}
                    >
                      {line}
                    </span>
                  ))}
                </div>

                <div className={`flex flex-col sm:flex-row gap-3 mt-8 ${isRTL ? 'sm:flex-row-reverse' : ''}`}>
                  <Link href="/menu" className="btn-primary w-full sm:w-auto">
                    {t.orderNow} <ChevronRight className="w-4 h-4" />
                  </Link>
                  <Link href="/menu" className="btn-secondary w-full sm:w-auto">
                    {t.viewMenu}
                  </Link>
                </div>

                {/* Stats row */}
                <div className={`flex flex-wrap items-center gap-6 mt-10 ${isRTL ? 'flex-row-reverse' : ''}`}>
                  {[
                    { icon: Star, label: t.rating },
                    { icon: Rocket, label: t.heroDelivery },
                    { icon: MapPin, label: branchCount > 0 ? `${branchCount} ${t.branchCount}` : '…' },
                  ].map((badge, i) => (
                    <div key={i} className={`flex items-center gap-6 ${isRTL ? 'flex-row-reverse' : ''}`}>
                      <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.75 + i * 0.1, duration: 0.4 }}
                        className={`flex items-center gap-2 ${isRTL ? 'flex-row-reverse' : ''}`}
                      >
                        <badge.icon className="w-[19px] h-[19px] text-[var(--green-light)]" />
                        <span className="font-[400] text-[13px]" style={{ color: 'rgba(250,243,224,0.82)' }}>
                          {badge.label}
                        </span>
                      </motion.div>
                      {i < 2 && <div className="h-[20px] w-[1px] hidden sm:block" style={{ background: 'rgba(156,175,136,0.30)' }} />}
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>

            {/* HERO RIGHT — Logo image */}
            <motion.div
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="hidden lg:flex flex-col items-center justify-center flex-1 shrink-0"
            >
              <motion.div
                animate={{ y: [0, -14, 0] }}
                transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
                className="relative flex items-center justify-center w-full"
              >
                {/* Outer ambient glow — scales with image */}
                <div
                  className="absolute rounded-full pointer-events-none"
                  style={{
                    inset: '-18%',
                    background: 'radial-gradient(circle, rgba(156,175,136,0.42) 0%, transparent 68%)',
                    filter: 'blur(36px)',
                  }}
                />
                {/* Inner highlight border */}
                <div
                  className="absolute pointer-events-none z-20"
                  style={{
                    inset: '-3px',
                    borderRadius: '34px',
                    border: '1.5px solid rgba(156,175,136,0.20)',
                  }}
                />
                <img
                  src="/photo.PNG"
                  alt="Zaitoon – House of Shawarma & BBQ"
                  className="relative z-10 rounded-[32px] object-contain w-full h-auto"
                  style={{
                    filter: 'drop-shadow(0 28px 60px rgba(0,0,0,0.55)) drop-shadow(0 6px 18px rgba(0,0,0,0.28))',
                  }}
                />
              </motion.div>
            </motion.div>

          </motion.div>

          {/* Scroll indicator */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.4, duration: 0.6 }}
            className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-10"
          >
            <span className="text-[10px] font-[600] tracking-[0.2em] uppercase" style={{ color: 'rgba(250,243,224,0.74)' }}>
              Scroll
            </span>
            <motion.div
              animate={{ y: [0, 6, 0] }}
              transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
              className="w-[1px] h-[32px] rounded-full"
              style={{ background: 'linear-gradient(180deg, rgba(156,175,136,0.72), transparent)' }}
            />
          </motion.div>
        </section>

        {/* ══════════════════════════════════════════════
            FAN FAVOURITES — Enhanced cards
        ══════════════════════════════════════════════ */}
        <section aria-label="Fan Favourite dishes" className="py-[88px] px-6" style={{ background: 'linear-gradient(180deg, var(--cream) 0%, var(--parchment) 100%)' }}>
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-col sm:flex-row items-baseline justify-between mb-10"
            >
              <div className={isRTL ? 'text-right' : ''}>
                <span className="section-label">{t.ourSignatures}</span>
                <h2 className="text-[var(--charcoal)]">{t.fanFavourites}</h2>
                <motion.div
                  initial={{ scaleX: 0 }}
                  whileInView={{ scaleX: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  style={{
                    transformOrigin: isRTL ? 'right' : 'left',
                    height: 3,
                    background: 'linear-gradient(90deg, var(--orange-warm), var(--green-base))',
                    width: 64, marginTop: '20px', borderRadius: 99,
                    marginLeft: isRTL ? 'auto' : 0
                  }}
                />
              </div>
              <Link
                href="/menu"
                className="text-[13px] font-[700] mt-5 sm:mt-0 flex items-center gap-1 group transition-colors"
                style={{ color: 'var(--green-dark)' }}
              >
                {t.viewAll}
                <ChevronRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </motion.div>

            <div className="relative">
              {/* Fade edges on mobile scroll */}
              <div className="absolute left-0 top-0 bottom-0 w-6 z-10 pointer-events-none"
                style={{ background: 'linear-gradient(90deg, var(--parchment), transparent)' }} />
              <div className="absolute right-0 top-0 bottom-0 w-6 z-10 pointer-events-none"
                style={{ background: 'linear-gradient(-90deg, var(--parchment), transparent)' }} />

              <motion.ul
                role="list"
                variants={gridVariants}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true }}
                className="flex gap-5 overflow-x-auto scrollbar-hide pb-6 pt-4 px-2 -mx-2 snap-x"
              >
                {featuredItems.map((item) => (
                  <motion.li key={item.id} variants={cardVariants} className="snap-start shrink-0 w-[264px]">
                    <MenuItemCard item={item} />
                  </motion.li>
                ))}
              </motion.ul>
            </div>
          </div>
        </section>


        {/* ══════════════════════════════════════════════
            HOW IT WORKS — Glassmorphism cards
        ══════════════════════════════════════════════ */}
        <section
          aria-label="How to order from Zaitoon"
          className="relative py-[100px] px-6 overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #1F221B 0%, #34392B 60%, #262A21 100%)' }}
        >
          {/* Background orbs */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-100px] left-1/2 -translate-x-1/2 w-[800px] h-[800px] rounded-full opacity-12"
              style={{ background: 'radial-gradient(circle, rgba(156,175,136,0.22) 0%, transparent 70%)' }} />
          </div>

          {/* Dot grid */}
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{
              backgroundImage: `radial-gradient(circle at 1px 1px, rgba(250,243,224,0.6) 1px, transparent 0)`,
              backgroundSize: '32px 32px'
            }}
          />

          <div className="relative z-10 max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className="mb-[56px] text-center flex flex-col items-center"
            >
              <span className="section-label" style={{ justifyContent: 'center' }}>{t.simpleProcess}</span>
              <h2 className="text-white">{t.howItWorks}</h2>
              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  transformOrigin: 'center', height: 3,
                  background: 'linear-gradient(90deg, var(--orange-warm), var(--green-base))',
                  width: 64, marginTop: '20px', borderRadius: 99
                }}
              />
            </motion.div>

            <ol role="list" className="grid grid-cols-1 md:grid-cols-3 gap-6 relative">
              {/* Connecting line */}
              <div className="hidden md:block absolute top-[52px] left-[calc(16.66%+26px)] right-[calc(16.66%+26px)] h-[1px] z-0"
                style={{ background: 'linear-gradient(90deg, transparent, rgba(156,175,136,0.35), transparent)' }} />

              {steps.map((step, i) => (
                <motion.li
                  key={step.num}
                  initial={{ opacity: 0, y: 40 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.6, delay: i * 0.15, ease: [0.16, 1, 0.3, 1] }}
                  className={`relative p-8 pt-12 z-10 text-center flex flex-col items-center rounded-[18px] ${isRTL ? 'text-right' : ''}`}
                  style={{
                    background: 'rgba(156,175,136,0.10)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(156,175,136,0.25)',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.15), inset 0 1px 0 rgba(156,175,136,0.14)'
                  }}
                  whileHover={{ y: -4, boxShadow: '0 16px 48px rgba(0,0,0,0.25), 0 0 0 1px rgba(156,175,136,0.30)' }}
                >
                  {/* Watermark number */}
                  <span className={`absolute top-4 ${isRTL ? 'left-4' : 'right-4'} font-display text-[72px] font-[800] leading-none pointer-events-none select-none`}
                    style={{ color: 'rgba(156,175,136,0.10)' }}>
                    {step.num}
                  </span>

                  {/* Icon */}
                  <div className="w-[56px] h-[56px] rounded-[14px] flex items-center justify-center text-[26px] mb-6"
                    style={{
                      background: 'rgba(156,175,136,0.22)',
                      border: '1.5px solid rgba(204,132,95,0.52)',
                      boxShadow: '0 4px 16px rgba(204,132,95,0.16)'
                    }}>
                    <step.icon className="w-6 h-6 text-[var(--orange-pale)]" />
                  </div>

                  <div className="label mb-3" style={{ color: 'var(--orange-warm)' }}>{step.num}</div>
                  <h3 className="text-white mb-4 text-[22px]">{step.title}</h3>
                  <p className="text-[14px] font-[300] leading-[1.75] max-w-[240px]" style={{ color: 'rgba(250,243,224,0.82)' }}>
                    {step.desc}
                  </p>
                </motion.li>
              ))}
            </ol>
          </div>
        </section>

        {/* ══════════════════════════════════════════════
            BRANCHES — Clean cards with glow hover
        ══════════════════════════════════════════════ */}
        <section id="branches" aria-label="Our branches" className="py-[88px] px-6 bg-[var(--cream)]">
          <div className="max-w-7xl mx-auto">
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              className={`mb-12 ${isRTL ? 'text-right' : ''}`}
            >
              <span className="section-label">{t.branchCount}</span>
              <h2 className="text-[var(--charcoal)]">Find Us Near You</h2>
              <motion.div
                initial={{ scaleX: 0 }}
                whileInView={{ scaleX: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{
                  transformOrigin: isRTL ? 'right' : 'left',
                  height: 3,
                  background: 'linear-gradient(90deg, var(--orange-warm), var(--green-base))',
                  width: 64, marginTop: '20px', borderRadius: 99,
                  marginLeft: isRTL ? 'auto' : 0
                }}
              />
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {branches.map((branch: any, i: number) => (
                <motion.div
                  key={branch.id}
                  initial={{ opacity: 0, y: 36 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: '-40px' }}
                  transition={{ duration: 0.6, delay: i * 0.12, ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -4 }}
                  className="group bg-white rounded-[18px] p-7 transition-all duration-300 cursor-default"
                  style={{
                    border: '1.5px solid var(--linen)',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                  }}
                  onMouseEnter={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--green-base)'
                    el.style.boxShadow = '0 12px 40px rgba(156,175,136,0.24), 0 4px 12px rgba(0,0,0,0.06)'
                  }}
                  onMouseLeave={e => {
                    const el = e.currentTarget as HTMLElement
                    el.style.borderColor = 'var(--linen)'
                    el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
                  }}
                >
                  <div className="flex items-start justify-between gap-4 mb-5">
                    <div>
                      <h3 className="font-display text-[21px] font-[700] text-[var(--charcoal)] mb-1">{branch.name}</h3>
                      <p className="text-[13px] leading-relaxed text-[var(--stone)]">{branch.address}</p>
                    </div>
                    <div className="w-12 h-12 rounded-[12px] flex items-center justify-center shrink-0 transition-transform group-hover:scale-110"
                      style={{
                        background: 'linear-gradient(135deg, var(--green-dark), var(--green-base))',
                        boxShadow: '0 4px 12px rgba(156,175,136,0.40)'
                      }}>
                      <MapPin className="w-5 h-5 text-white" />
                    </div>
                  </div>

                  <div className="space-y-2.5 mb-6">
                    {branch.hours && (
                      <div className="flex items-center gap-2.5 text-[13px] text-[var(--stone)]">
                        <Clock className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--green-dark)' }} />
                        <span>{branch.hours}</span>
                      </div>
                    )}
                    {branch.phone && (
                      <div className="flex items-center gap-2.5 text-[13px] text-[var(--stone)]">
                        <Phone className="w-3.5 h-3.5" style={{ color: 'var(--green-dark)' }} />
                        <a href={`tel:${branch.phone}`} className="hover:text-[var(--green-dark)] transition-colors font-[500]">
                          {branch.phone}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-3 pt-5 border-t border-[var(--linen)]">
                    {branch.whatsapp && (
                      <a
                        href={`https://wa.me/${branch.whatsapp.replace(/\D/g, '')}`}
                        target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 px-4 py-2.5 rounded-[10px] text-[13px] font-[700] text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
                        style={{ background: 'linear-gradient(135deg, var(--green-dark), var(--green-base))', boxShadow: '0 3px 10px rgba(156,175,136,0.35)' }}
                      >
                        <MessageCircle className="w-4 h-4" /> WhatsApp
                      </a>
                    )}
                    {branch.phone && (
                      <a
                        href={`tel:${branch.phone}`}
                        className="flex items-center gap-2 border-[1.5px] border-[var(--linen)] text-[var(--charcoal)] px-4 py-2.5 rounded-[10px] text-[13px] font-[700] hover:border-[var(--green-base)] hover:text-[var(--green-dark)] transition-all hover:-translate-y-0.5"
                      >
                        <Phone className="w-4 h-4" /> Call
                      </a>
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* ── FAQ SECTION ── */}
        {faqs.length > 0 && (
          <section className="w-full max-w-3xl mx-auto px-4 lg:px-8 py-16">
            <p className="section-label mb-3 text-center">Got Questions?</p>
            <h2 className="text-center text-[var(--charcoal)] mb-10" style={{ fontFamily: 'var(--font-display)', fontWeight: 700 }}>
              Frequently Asked Questions
            </h2>
            <div className="space-y-3">
              {faqs.map((faq, i) => {
                const isOpen = openFaq === faq.id
                const question = (language === 'ur' && faq.question_ur) ? faq.question_ur : faq.question
                const answer   = (language === 'ur' && faq.answer_ur)   ? faq.answer_ur   : faq.answer
                return (
                  <motion.div
                    key={faq.id}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.35, delay: i * 0.05 }}
                    className="rounded-[16px] overflow-hidden"
                    style={{
                      background: isOpen ? 'white' : 'rgba(255,255,255,0.75)',
                      border: isOpen ? '1.5px solid rgba(184,98,94,0.30)' : '1px solid var(--linen)',
                      boxShadow: isOpen ? '0 8px 24px rgba(76,92,45,0.10)' : 'none',
                      transition: 'all 0.25s ease',
                    }}
                  >
                    <button
                      onClick={() => setOpenFaq(isOpen ? null : faq.id)}
                      className={`w-full flex items-center justify-between px-5 py-4 text-left gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}
                      aria-expanded={isOpen}
                    >
                      <span className="text-[15px] font-[700] text-[var(--charcoal)] leading-snug flex-1">
                        {question}
                      </span>
                      <span
                        className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition-transform duration-300"
                        style={{
                          background: isOpen ? 'linear-gradient(135deg, #B8625E, #A6524F)' : 'rgba(184,98,94,0.12)',
                          color: isOpen ? 'white' : 'var(--charcoal)',
                          transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                        }}
                      >
                        <ChevronRight className="w-4 h-4 rotate-90" />
                      </span>
                    </button>
                    <AnimatePresence initial={false}>
                      {isOpen && (
                        <motion.div
                          key="answer"
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                          className="overflow-hidden"
                        >
                          <p className="px-5 pb-5 text-[14px] leading-relaxed text-[var(--stone)]"
                            style={isRTL ? { textAlign: 'right' } : {}}>
                            {answer}
                          </p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                )
              })}
            </div>
          </section>
        )}

      </motion.main>

      <Footer />
      <MobileCartBar />
    </>
  )
}
