import { formatThaiPoints, normalizeDiscountBreakdown } from './growthDisplayUtils.js'

export default function DiscountBreakdown({ quote }) {
  const { applied, rejected } = normalizeDiscountBreakdown(quote)
  if (applied.length === 0 && rejected.length === 0) return null

  return (
    <div className="mt-3 rounded-2xl border border-sky-100 bg-sky-50/70 p-3.5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-xs font-black text-slate-800">ส่วนลดโปรโมชัน & คูปอง</div>
        {applied.length > 0 ? (
          <div className="text-[11px] font-bold text-emerald-700 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">{applied.length} รายการถูกใช้</div>
        ) : null}
      </div>

      {applied.length > 0 ? (
        <div className="mt-2.5 space-y-1.5 text-xs">
          {applied.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-3 text-slate-700">
              <span className="min-w-0 font-medium">{item.label}</span>
              <span className="shrink-0 font-black text-sky-700">-{formatThaiPoints(item.amountPoints)} พ้อยท์</span>
            </div>
          ))}
        </div>
      ) : null}

      {rejected.length > 0 ? (
        <div className="mt-2.5 space-y-1.5 border-t border-sky-100 pt-2.5 text-[11px]">
          {rejected.map((item) => (
            <div key={item.key} className="flex items-start justify-between gap-3 text-slate-500">
              <span className="min-w-0">{item.label}</span>
              <span className="shrink-0 font-medium text-amber-700">{item.reason}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
