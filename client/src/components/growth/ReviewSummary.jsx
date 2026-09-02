import { normalizeReviewSummary } from './growthDisplayUtils.js'

export default function ReviewSummary({ summary, compact = false }) {
  const { averageRating, reviewCount } = normalizeReviewSummary(summary)

  if (reviewCount <= 0) {
    if (compact) return null
    return (
      <div className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-400">
        <span>★ ยังไม่มีรีวิว</span>
      </div>
    )
  }

  if (compact) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-black text-amber-700">
        <span className="text-amber-500">★</span>
        <span>{averageRating.toFixed(1)}</span>
        <span className="text-amber-500/60 font-semibold">({reviewCount})</span>
      </span>
    )
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50 via-amber-50/50 to-orange-50/30 px-3.5 py-1.5 shadow-xs">
      <div className="flex items-center gap-1 text-amber-500 text-sm">
        {'★'.repeat(Math.round(averageRating))}
        <span className="text-slate-300">{'★'.repeat(Math.max(0, 5 - Math.round(averageRating)))}</span>
      </div>
      <span className="text-sm font-black text-amber-900">{averageRating.toFixed(1)}</span>
      <span className="text-xs font-bold text-amber-700/80">({reviewCount.toLocaleString('th-TH')} รีวิวจากผู้ซื้อ)</span>
    </div>
  )
}
