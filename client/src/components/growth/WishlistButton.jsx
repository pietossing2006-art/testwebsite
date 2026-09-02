import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchJson } from '../../api.js'

export default function WishlistButton({ productId, initialFollowed = false, isAuthed, onChange, className = '' }) {
  const nav = useNavigate()
  const [followed, setFollowed] = useState(Boolean(initialFollowed))
  const [status, setStatus] = useState('')
  const [working, setWorking] = useState(false)

  useEffect(() => {
    setFollowed(Boolean(initialFollowed))
  }, [initialFollowed])

  async function toggleWishlist() {
    if (isAuthed === false) {
      nav('/login')
      return
    }
    if (!productId || working) return

    const nextFollowed = !followed
    setWorking(true)
    setStatus('')

    try {
      if (nextFollowed) {
        await fetchJson('/api/me/wishlist', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product_id: Number(productId) }),
        })
      } else {
        await fetchJson(`/api/me/wishlist/${encodeURIComponent(productId)}`, { method: 'DELETE' })
      }
      setFollowed(nextFollowed)
      onChange?.(nextFollowed)
    } catch (error) {
      if (error?.status === 401) {
        nav('/login')
        return
      }
      setStatus('ทำรายการไม่สำเร็จ')
    } finally {
      setWorking(false)
    }
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggleWishlist}
        disabled={working}
        aria-pressed={followed}
        className={`rounded-full border px-3 py-1 text-[11px] font-black transition disabled:cursor-wait disabled:opacity-60 ${followed ? 'border-sky-300 bg-sky-50 text-sky-700' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'} ${className}`}
      >
        {working ? 'กำลังบันทึก...' : followed ? '♥ ติดตามแล้ว' : '♡ ติดตาม'}
      </button>
      {status ? <span className="text-[11px] font-bold text-rose-600">{status}</span> : null}
    </div>
  )
}
