import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { copyToClipboard, fetchJson, setAuthToken } from '../api.js'

function fmt(value) {
  return Math.round(Number(value) || 0).toLocaleString()
}

function formatDate(value) {
  if (!value) return '-'
  return new Date(value).toLocaleString('th-TH', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function PageTab({ active, to, children }) {
  return (
    <Link
      to={to}
      className={`motion-tab motion-hover inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-black transition ${
        active
          ? 'border-cyan-300/30 bg-cyan-500/15 text-cyan-100'
          : 'border-white/[0.08] bg-white/[0.035] text-white/58 hover:border-cyan-300/22 hover:text-white'
      }`}
    >
      {children}
    </Link>
  )
}

function statusMeta(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'paid' || value === 'approved' || value === 'success') return { text: 'สำเร็จ', cls: 'bg-emerald-500/10 text-emerald-200', tone: 'emerald' }
  if (value === 'cancelled' || value === 'canceled' || value === 'failed') return { text: 'ยกเลิก', cls: 'bg-red-500/10 text-red-200', tone: 'red' }
  return { text: 'กำลังตรวจสอบ', cls: 'bg-amber-500/10 text-amber-200', tone: 'amber' }
}

function methodLabel(item) {
  const method = String(item?.method || '').toLowerCase()
  const provider = String(item?.provider || '').toLowerCase()
  if (method === 'angpao' || provider === 'twvoucher') return 'อั่งเปา'
  if (method === 'coupon') return 'คูปองเติมเงิน'
  if (method === 'promptpay' || provider === 'promptpay_manual') return 'PromptPay'
  return 'ช่องทางอื่น'
}

export default function TopupHistory() {
  const nav = useNavigate()
  const [me, setMe] = useState(null)
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [copyToast, setCopyToast] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const [meRes, topupRes] = await Promise.all([fetchJson('/api/me'), fetchJson('/api/me/topups')])
        if (!cancelled) {
          setMe(meRes)
          const raw = Array.isArray(topupRes?.topups) ? topupRes.topups : []
          const filtered = raw.filter((topup) => {
            const method = String(topup?.method || '').toLowerCase()
            const provider = String(topup?.provider || '').toLowerCase()
            if (method === 'promptpay' && provider === 'promptpay_manual') return String(topup?.status || '').toLowerCase() === 'paid'
            return true
          })
          setItems(filtered)
        }
      } catch (err) {
        if (!cancelled && err?.status === 401) {
          setAuthToken(null)
          nav('/login', { replace: true })
          return
        }
        if (!cancelled) setError(String(err?.message ?? 'load_failed'))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [nav])

  const user = me?.user
  const displayName = user?.display_name || user?.email?.split('@')?.[0] || user?.username || 'user'
  const rows = useMemo(() => {
    return items.map((item) => ({
      id: item.id,
      method: methodLabel(item),
      providerRef: String(item.provider_ref || item.reference || '').trim(),
      amount: Number(item.amount_points ?? item.amount ?? 0),
      status: String(item.status || ''),
      createdAt: item.created_at,
      updatedAt: item.updated_at,
    }))
  }, [items])
  const approvedRows = rows.filter((row) => ['paid', 'approved', 'success'].includes(row.status.toLowerCase()))
  const pendingRows = rows.filter((row) => !['paid', 'approved', 'success', 'cancelled', 'canceled', 'failed'].includes(row.status.toLowerCase()))
  const totalApproved = approvedRows.reduce((sum, row) => sum + row.amount, 0)
  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((row) => `${row.id} ${row.method} ${row.providerRef} ${row.status}`.toLowerCase().includes(q))
  }, [query, rows])

  async function copyReference(value) {
    const text = String(value || '').trim()
    if (!text) return
    try {
      await copyToClipboard(text)
      setCopyToast(true)
      setTimeout(() => setCopyToast(false), 1200)
    } catch {
      // ignore copy errors
    }
  }

  return (
    <div className="space-y-7 fade-in-up">
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.08] glass-strong p-4 sm:p-7">
        <div className="absolute inset-0 scanline opacity-35" />
        <div className="absolute inset-0 grid-pattern opacity-35" />
        <div className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-cyan-500/[0.08] blur-[90px]" />
        <div className="motion-stagger relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-[0.18em] text-white/40">บัญชีผู้ใช้</div>
            <h1 className="mt-2 text-4xl font-black text-white">ประวัติเติมเงิน</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/55">
              ตรวจสอบรายการเติมเงินของ {displayName} พร้อมสถานะ ยอดพ้อยท์ และเลขอ้างอิงแต่ละรายการ
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-white">{rows.length}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">รายการ</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-amber-200">{pendingRows.length}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">รอตรวจ</div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.04] p-3 sm:p-4">
              <div className="text-2xl font-black text-emerald-300">{fmt(totalApproved)}</div>
              <div className="mt-1 text-[10px] font-bold text-white/45">พ้อยท์</div>
            </div>
          </div>
        </div>
      </section>

      <nav className="motion-stagger grid gap-3 md:grid-cols-3">
        <PageTab to="/inbox">กล่องรับของ</PageTab>
        <PageTab to="/history/purchases">ประวัติการซื้อ</PageTab>
        <PageTab to="/history/topups" active>ประวัติเติมเงิน</PageTab>
      </nav>

      <section className="motion-card rounded-3xl border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
        <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
            </span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="ui-field h-12 pl-11" placeholder="ค้นหาเลขอ้างอิง ช่องทาง หรือสถานะ" />
          </label>
          <Link to="/topup/angpao" className="ui-btn-primary h-12 px-5 text-sm font-black">เติมเงิน</Link>
        </div>

        {loading ? <div className="grid min-h-[260px] place-items-center text-sm font-bold text-white/55">กำลังโหลดประวัติ...</div> : null}
        {error ? <div className="rounded-2xl border border-cyan-300/15 bg-cyan-500/10 p-4 text-sm font-bold text-cyan-100">โหลดไม่สำเร็จ: {error}</div> : null}
        {!loading && !error && visibleRows.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-white/[0.08] bg-white/[0.02] p-8 text-center">
            <div>
              <div className="text-lg font-black text-white">ยังไม่มีรายการเติมเงิน</div>
              <p className="mt-2 text-sm text-white/45">เมื่อเติมเงินแล้ว รายการจะมาแสดงที่นี่</p>
              <Link to="/topup/angpao" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-sm font-black">เติมเงินตอนนี้</Link>
            </div>
          </div>
        ) : null}

        {!loading && !error && visibleRows.length > 0 ? (
          <div className="motion-stagger space-y-3">
            {visibleRows.map((row) => {
              const meta = statusMeta(row.status)
              return (
                <div key={row.id} className="motion-card motion-hover rounded-3xl border border-white/[0.07] bg-white/[0.035] p-4 transition hover:border-cyan-300/20 hover:bg-white/[0.055]">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-base font-black text-white">{row.method}</div>
                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${meta.cls}`}>{meta.text}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-white/42">
                        <span className="font-mono">#{row.id}</span>
                        <span>{formatDate(row.createdAt)}</span>
                        {row.updatedAt ? <span>อัปเดต {formatDate(row.updatedAt)}</span> : null}
                      </div>
                      {row.providerRef ? (
                        <button type="button" onClick={() => copyReference(row.providerRef)} className="mt-2 rounded-xl border border-white/[0.06] bg-black/20 px-3 py-1.5 font-mono text-[11px] text-cyan-100/80 transition hover:bg-black/35">
                          {row.providerRef}
                        </button>
                      ) : null}
                    </div>
                    <div className="text-lg font-black text-emerald-300">+{fmt(row.amount)} <span className="text-xs font-bold text-white/40">พ้อยท์</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      {typeof document !== 'undefined'
        ? createPortal(
            <div className={`pointer-events-none fixed bottom-16 left-1/2 z-[90] -translate-x-1/2 rounded-full border border-emerald-300/30 bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-100 shadow-lg transition-all duration-200 ${copyToast ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
              คัดลอกแล้ว
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
