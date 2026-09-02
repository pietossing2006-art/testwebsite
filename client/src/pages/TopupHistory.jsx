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
      className={`inline-flex h-11 items-center justify-center rounded-2xl border px-4 text-sm font-black transition ${
        active
          ? 'border-sky-500 bg-sky-500 text-white shadow-sm'
          : 'border-sky-200 bg-white text-slate-700 hover:border-sky-300 hover:bg-sky-50'
      }`}
    >
      {children}
    </Link>
  )
}

function statusMeta(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'paid' || value === 'approved' || value === 'success') return { text: 'สำเร็จ', cls: 'border border-emerald-200 bg-emerald-50 text-emerald-700' }
  if (value === 'cancelled' || value === 'canceled' || value === 'failed') return { text: 'ยกเลิก', cls: 'border border-rose-200 bg-rose-50 text-rose-700' }
  return { text: 'กำลังตรวจสอบ', cls: 'border border-amber-200 bg-amber-50 text-amber-700' }
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
      <section className="relative overflow-hidden rounded-3xl border border-sky-200 bg-white p-6 shadow-sm sm:p-7">
        <div className="relative grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-end">
          <div>
            <div className="text-xs font-black uppercase tracking-wider text-sky-600">บัญชีผู้ใช้</div>
            <h1 className="mt-1.5 text-3xl font-black text-slate-900 sm:text-4xl">ประวัติเติมเงิน</h1>
            <p className="mt-2.5 max-w-2xl text-xs leading-relaxed text-slate-600">
              ตรวจสอบรายการเติมเงินของ {displayName} พร้อมสถานะ ยอดพ้อยท์ และเลขอ้างอิงแต่ละรายการ
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 sm:p-4 text-center">
              <div className="text-2xl font-black text-slate-900">{rows.length}</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-500">รายการ</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 sm:p-4 text-center">
              <div className="text-2xl font-black text-amber-600">{pendingRows.length}</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-500">รอตรวจ</div>
            </div>
            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-3 sm:p-4 text-center">
              <div className="text-2xl font-black text-emerald-600">{fmt(totalApproved)}</div>
              <div className="mt-0.5 text-[11px] font-bold text-slate-500">พ้อยท์</div>
            </div>
          </div>
        </div>
      </section>

      <nav className="grid gap-3 md:grid-cols-3">
        <PageTab to="/inbox">กล่องรับของ</PageTab>
        <PageTab to="/history/purchases">ประวัติการซื้อ</PageTab>
        <PageTab to="/history/topups" active>ประวัติเติมเงิน</PageTab>
      </nav>

      <section className="rounded-3xl border border-sky-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <label className="relative block">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z" />
              </svg>
            </span>
            <input value={query} onChange={(event) => setQuery(event.target.value)} className="ui-field h-12 pl-11" placeholder="ค้นหาเลขอ้างอิง ช่องทาง หรือสถานะ" />
          </label>
          <Link to="/topup/angpao" className="ui-btn-primary h-12 px-5 text-xs font-black">เติมเงิน</Link>
        </div>

        {loading ? <div className="grid min-h-[260px] place-items-center text-sm font-bold text-slate-500">กำลังโหลดประวัติ...</div> : null}
        {error ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold text-red-700">โหลดไม่สำเร็จ: {error}</div> : null}
        {!loading && !error && visibleRows.length === 0 ? (
          <div className="grid min-h-[280px] place-items-center rounded-3xl border border-dashed border-sky-200 bg-sky-50/30 p-8 text-center">
            <div>
              <div className="text-lg font-black text-slate-900">ยังไม่มีรายการเติมเงิน</div>
              <p className="mt-1 text-xs text-slate-500">เมื่อเติมเงินแล้ว รายการจะมาแสดงที่นี่</p>
              <Link to="/topup/angpao" className="ui-btn-primary mt-5 inline-flex h-11 items-center px-5 text-xs font-black">เติมเงินตอนนี้</Link>
            </div>
          </div>
        ) : null}

        {!loading && !error && visibleRows.length > 0 ? (
          <div className="space-y-3">
            {visibleRows.map((row) => {
              const meta = statusMeta(row.status)
              return (
                <div key={row.id} className="rounded-2xl border border-sky-100 bg-sky-50/40 p-4 transition hover:border-sky-300 hover:bg-white hover:shadow-md">
                  <div className="flex flex-col gap-4 md:flex-row md:items-center">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-black text-slate-900">{row.method}</div>
                        <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-black ${meta.cls}`}>{meta.text}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="font-mono">#{row.id}</span>
                        <span>{formatDate(row.createdAt)}</span>
                        {row.updatedAt ? <span>อัปเดต {formatDate(row.updatedAt)}</span> : null}
                      </div>
                      {row.providerRef ? (
                        <button type="button" onClick={() => copyReference(row.providerRef)} className="mt-2 rounded-xl border border-sky-200 bg-white px-3 py-1 font-mono text-xs font-bold text-sky-700 shadow-sm transition hover:bg-sky-50">
                          {row.providerRef} (คลิกเพื่อคัดลอก)
                        </button>
                      ) : null}
                    </div>
                    <div className="text-base font-black text-emerald-600">+{fmt(row.amount)} <span className="text-xs font-bold text-slate-500">พ้อยท์</span></div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : null}
      </section>

      {typeof document !== 'undefined'
        ? createPortal(
            <div className={`pointer-events-none fixed bottom-16 left-1/2 z-[90] -translate-x-1/2 rounded-full border border-emerald-300 bg-emerald-600 px-5 py-2 text-xs font-black text-white shadow-xl transition-all duration-200 ${copyToast ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'}`}>
              คัดลอกเลขอ้างอิงแล้ว
            </div>,
            document.body,
          )
        : null}
    </div>
  )
}
