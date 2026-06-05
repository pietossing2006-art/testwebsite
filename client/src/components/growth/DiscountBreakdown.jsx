import { formatThaiPoints, normalizeDiscountBreakdown } from './growthDisplayUtils.js'

export default function DiscountBreakdown({ quote }) {
  const { applied, rejected } = normalizeDiscountBreakdown(quote)
  if (applied.length === 0 && rejected.length === 0) return null

  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/[0.035] p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black text-white/70">ส่วนลด</div>
        {applied.length > 0 ? (
          <div className="text-[11px] font-bold text-emerald-200">{applied.length} รายการถูกใช้</div>
        ) : null}
      </div>

      {applied.length > 0 ? (
        <div className="mt-3 space-y-1.5 text-xs">
          {applied.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-3 text-white/65">
              <span className="min-w-0">{item.label}</span>
              <span className="shrink-0 font-black text-cyan-200">-{formatThaiPoints(item.amountPoints)} พ้อยท์</span>
            </div>
          ))}
        </div>
      ) : null}

      {rejected.length > 0 ? (
        <div className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-[11px]">
          {rejected.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-3 text-white/45">
              <span className="min-w-0">{item.label}</span>
              <span className="shrink-0 text-amber-100/80">{item.reason}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
