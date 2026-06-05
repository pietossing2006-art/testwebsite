import { normalizeReviewSummary } from './growthDisplayUtils.js'

export default function ReviewSummary({ summary, compact = false }) {
  const { averageRating, reviewCount } = normalizeReviewSummary(summary)

  if (reviewCount <= 0) {
    if (compact) return null
    return <div className="text-sm font-bold text-white/45">ยังไม่มีรีวิว</div>
  }

  return (
    <div className={`inline-flex items-center gap-2 rounded-full border border-amber-300/20 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-100 ${compact ? '' : 'w-fit'}`}>
      <span>★ {averageRating.toFixed(1)}</span>
      <span className="h-1 w-1 rounded-full bg-amber-100/45" />
      <span>{reviewCount.toLocaleString('th-TH')} รีวิว</span>
    </div>
  )
}
