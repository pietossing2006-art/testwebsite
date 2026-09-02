import { useMemo, useState } from 'react'
import { formatDateTime, formatNumber } from '../helpers.js'

const TABS = [
  { id: 'campaigns', label: 'Campaigns' },
  { id: 'reviews', label: 'Reviews' },
  { id: 'vip', label: 'VIP' },
  { id: 'signals', label: 'Wishlist Signals' },
  { id: 'discounts', label: 'Discount Preview' },
  { id: 'notifications', label: 'Notifications' },
]

const EVENT_OPTIONS = ['campaign_started', 'campaign_ending', 'wishlist_stock_back', 'wishlist_promo_started', 'vip_tier_changed', 'review_moderated']

function rowsOf(value) { return Array.isArray(value) ? value : [] }
function statusTone(type) { if (type === 'success') return 'ok'; if (type === 'error') return 'crit'; return 'info' }
function formatCell(value) {
  if (value == null || value === '') return '-'
  if (typeof value === 'boolean') return value ? 'yes' : 'no'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function normalizeCampaignTargets(campaign) {
  return rowsOf(campaign?.targets)
    .map((target, index) => ({
      target_type: target?.target_type === 'bundle' ? 'bundle' : 'product',
      target_id: Number(target?.target_id),
      sort_order: Number.isFinite(Number(target?.sort_order)) ? Number(target.sort_order) : index,
    }))
    .filter((target) => Number.isFinite(target.target_id) && target.target_id > 0)
}

function buildCampaignToggleBody(campaign) {
  const discountValue = campaign?.discount_value == null || campaign?.discount_value === '' ? null : Number(campaign.discount_value)
  const quantityLimit = campaign?.quantity_limit == null || campaign?.quantity_limit === '' ? null : Number(campaign.quantity_limit)
  return {
    kind: campaign?.kind === 'limited_drop' ? 'limited_drop' : 'flash_deal',
    title: String(campaign?.title || 'Campaign').trim(),
    description: String(campaign?.description || '').trim(),
    badge_text: String(campaign?.badge_text || '').trim(),
    is_active: !campaign?.is_active,
    starts_at: campaign?.starts_at || null,
    ends_at: campaign?.ends_at || null,
    discount_type: ['none', 'percent', 'amount_points'].includes(campaign?.discount_type) ? campaign.discount_type : 'none',
    discount_value: Number.isFinite(discountValue) ? discountValue : null,
    quantity_limit: Number.isFinite(quantityLimit) ? quantityLimit : null,
    vip_early_access_tier: campaign?.vip_early_access_tier || null,
    targets: normalizeCampaignTargets(campaign),
  }
}

function formatCampaignDiscount(campaign) {
  if (campaign?.discount_type === 'percent') return `${formatNumber(campaign.discount_value)}%`
  if (campaign?.discount_type === 'amount_points') return `${formatNumber(campaign.discount_value)} pts`
  return '-'
}

function DiscountLines({ quote }) {
  const applied = rowsOf(quote?.discounts_applied)
  const rejected = rowsOf(quote?.discounts_rejected)
  return (
    <div style={{ marginTop: 14 }}>
      <div className="lgx-mini-stats" style={{ gridTemplateColumns: '1fr 1fr 1fr', marginBottom: 12 }}>
        <div className="lgx-mini-stat"><div className="l">Original unit</div><div className="v">{formatNumber(quote?.original_unit_price_points)} pts</div></div>
        <div className="lgx-mini-stat"><div className="l">Final unit</div><div className="v" style={{ color: 'var(--lgx-ok)' }}>{formatNumber(quote?.final_unit_price_points)} pts</div></div>
        <div className="lgx-mini-stat"><div className="l">Final total</div><div className="v" style={{ color: 'var(--lgx-accent)' }}>{formatNumber(quote?.final_total_points)} pts</div></div>
      </div>
      <div className="lgx-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Applied</div>
          {applied.length === 0 ? <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>No applied discounts</div> : null}
          {applied.map((item, index) => (
            <div key={`${item.source_type}-${item.source_id}-${index}`} className="lgx-kv"><span className="k">{item.label || item.source_type}</span><span className="v" style={{ color: 'var(--lgx-ok)' }}>{formatNumber(item.amount_points)} pts</span></div>
          ))}
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 8 }}>Rejected</div>
          {rejected.length === 0 ? <div style={{ fontSize: 12, color: 'var(--lgx-text-muted)' }}>No rejected discounts</div> : null}
          {rejected.map((item, index) => (
            <div key={`${item.source_type}-${item.source_id}-${index}`} className="lgx-kv"><span className="k">{item.label || item.source_type}</span><span className="v" style={{ color: 'var(--lgx-text-muted)', fontWeight: 400 }}>{item.reason || '-'}</span></div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default function GrowthModule({ data = {}, ctx }) {
  const { canAction, fetchJson, loadModuleData } = ctx
  const [tab, setTab] = useState('campaigns')
  const [status, setStatus] = useState({ type: 'idle', message: '' })
  const [testEventType, setTestEventType] = useState('campaign_started')
  const canManage = canAction('growth.manage')

  const campaigns = rowsOf(data.campaigns)
  const reviews = rowsOf(data.reviews)
  const tiers = rowsOf(data.tiers)
  const signals = rowsOf(data.signals)
  const notifications = rowsOf(data.notifications)

  const counts = useMemo(() => ({
    campaigns: campaigns.length, reviews: reviews.length, vip: tiers.length, signals: signals.length, notifications: notifications.length,
  }), [campaigns.length, reviews.length, tiers.length, signals.length, notifications.length])

  async function refreshGrowth() { await loadModuleData('growth') }

  async function sendTestNotification() {
    if (!canManage) return
    setStatus({ type: 'working', message: 'Sending test notification...' })
    try {
      await fetchJson('/api/admin/growth-notifications/test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ event_type: testEventType }) })
      setStatus({ type: 'success', message: 'Test notification sent to your inbox.' })
      await refreshGrowth()
    } catch { setStatus({ type: 'error', message: 'Test notification failed.' }) }
  }

  async function setReviewStatus(reviewId, nextStatus) {
    if (!canManage) return
    setStatus({ type: 'working', message: 'Updating review...' })
    try {
      await fetchJson(`/api/admin/reviews/${reviewId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }) })
      setStatus({ type: 'success', message: 'Review updated.' })
      await refreshGrowth()
    } catch { setStatus({ type: 'error', message: 'Review update failed.' }) }
  }

  async function toggleCampaign(campaign) {
    if (!canManage) return
    const body = buildCampaignToggleBody(campaign)
    if (body.targets.length === 0) { setStatus({ type: 'error', message: 'Campaign needs at least one target before it can be toggled.' }); return }
    setStatus({ type: 'working', message: 'Updating campaign...' })
    try {
      await fetchJson(`/api/admin/growth-campaigns/${campaign.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      setStatus({ type: 'success', message: 'Campaign updated.' })
      await refreshGrowth()
    } catch { setStatus({ type: 'error', message: 'Campaign update failed.' }) }
  }

  async function createStarterVipTier() {
    if (!canManage) return
    setStatus({ type: 'working', message: 'Creating VIP tier...' })
    try {
      await fetchJson('/api/admin/vip-tiers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: `tier-${Date.now()}`, name: 'New VIP Tier', threshold_points_spent: 0, discount_percent: 0, priority_support: false, early_access_minutes: 0, badge_label: 'VIP', is_active: true }),
      })
      setStatus({ type: 'success', message: 'VIP tier created.' })
      await refreshGrowth()
    } catch { setStatus({ type: 'error', message: 'VIP tier create failed.' }) }
  }

  return (
    <>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 }}>
        <select className="lgx-select" style={{ width: 220 }} value={testEventType} disabled={!canManage} onChange={(event) => setTestEventType(event.target.value)}>
          {EVENT_OPTIONS.map((eventType) => <option value={eventType} key={eventType}>{eventType}</option>)}
        </select>
        <button type="button" className="lgx-btn" disabled={!canManage} onClick={sendTestNotification}><i className="bi bi-send" />ยิงทดสอบแจ้งเตือน</button>
      </div>

      {status.type !== 'idle' ? <div className={`lgx-banner ${statusTone(status.type)}`}>{status.message}</div> : null}

      <div className="lgx-strip">
        <div className="lgx-stat"><div className="l">แคมเปญ</div><div className="v">{formatNumber(counts.campaigns)}</div></div>
        <div className="lgx-stat"><div className="l">รีวิว</div><div className="v">{formatNumber(counts.reviews)}</div></div>
        <div className="lgx-stat"><div className="l">ระดับ VIP</div><div className="v">{formatNumber(counts.vip)}</div></div>
        <div className="lgx-stat"><div className="l">สิ่งที่อยากได้</div><div className="v">{formatNumber(counts.signals)}</div></div>
        <div className="lgx-stat"><div className="l">การแจ้งเตือน</div><div className="v">{formatNumber(counts.notifications)}</div></div>
      </div>

      <div className="lgx-inline-tabs">
        {TABS.map((item) => <button key={item.id} type="button" className={`lgx-inline-tab${tab === item.id ? ' is-active' : ''}`} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>

      {tab === 'campaigns' ? <CampaignsTable campaigns={campaigns} canManage={canManage} onToggle={toggleCampaign} /> : null}
      {tab === 'reviews' ? <ReviewsTable reviews={reviews} canManage={canManage} onSetStatus={setReviewStatus} /> : null}
      {tab === 'vip' ? <VipTable tiers={tiers} canManage={canManage} onCreate={createStarterVipTier} /> : null}
      {tab === 'signals' ? <SignalsTable signals={signals} /> : null}
      {tab === 'discounts' ? <DiscountPreview fetchJson={fetchJson} canManage={canManage} /> : null}
      {tab === 'notifications' ? <NotificationsTable notifications={notifications} /> : null}
    </>
  )
}

function CampaignsTable({ campaigns, canManage, onToggle }) {
  return (
    <div className="lgx-panel">
      <div className="lgx-panel-head"><h2>Campaigns</h2></div>
      <table className="lgx-table">
        <thead><tr><th>Kind</th><th>Title</th><th>Discount</th><th>Targets</th><th>Status</th><th /></tr></thead>
        <tbody>
          {campaigns.length === 0 ? <tr><td colSpan={6} className="lgx-empty">No campaigns</td></tr> : null}
          {campaigns.map((campaign) => (
            <tr key={campaign.id}>
              <td><span className="lgx-pill neutral">{campaign.kind}</span></td>
              <td><div style={{ fontWeight: 700 }}>{campaign.title}</div><div style={{ fontSize: 10.5, color: 'var(--lgx-text-muted)' }}>{campaign.badge_text || campaign.description || '-'}</div></td>
              <td>{formatCampaignDiscount(campaign)}</td>
              <td className="mono">{formatNumber(normalizeCampaignTargets(campaign).length)}</td>
              <td><span className={`lgx-pill ${campaign.is_active ? 'ok' : 'neutral'}`}>{campaign.is_active ? 'active' : 'off'}</span></td>
              <td><button type="button" className="lgx-btn" disabled={!canManage} onClick={() => onToggle(campaign)}>{campaign.is_active ? 'Disable' : 'Enable'}</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ReviewsTable({ reviews, canManage, onSetStatus }) {
  return (
    <div className="lgx-panel">
      <div className="lgx-panel-head"><h2>Reviews</h2></div>
      <table className="lgx-table">
        <thead><tr><th>Product</th><th>Reviewer</th><th>Rating</th><th>Status</th><th>Comment</th><th /></tr></thead>
        <tbody>
          {reviews.length === 0 ? <tr><td colSpan={6} className="lgx-empty">No reviews</td></tr> : null}
          {reviews.map((review) => (
            <tr key={review.id}>
              <td>{review.product_name || review.product_id || '-'}</td>
              <td>{review.reviewer_name || review.user_email || review.user_id || '-'}</td>
              <td>{formatNumber(review.rating)} / 5</td>
              <td><span className="lgx-pill neutral">{review.status || '-'}</span></td>
              <td style={{ maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{review.comment || '-'}</td>
              <td>
                <div className="lgx-btn-group">
                  <button type="button" className="lgx-btn lgx-btn-ok" disabled={!canManage} onClick={() => onSetStatus(review.id, 'approved')}>Approve</button>
                  <button type="button" className="lgx-btn" disabled={!canManage} onClick={() => onSetStatus(review.id, 'hidden')}>Hide</button>
                  <button type="button" className="lgx-btn" style={{ color: 'var(--lgx-crit)', borderColor: 'var(--lgx-crit)' }} disabled={!canManage} onClick={() => onSetStatus(review.id, 'rejected')}>Reject</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function VipTable({ tiers, canManage, onCreate }) {
  return (
    <div className="lgx-panel">
      <div className="lgx-panel-head"><h2>VIP Tiers</h2><button type="button" className="lgx-btn lgx-btn-accent" disabled={!canManage} onClick={onCreate}>Create starter tier</button></div>
      <table className="lgx-table">
        <thead><tr><th>Code</th><th>Name</th><th>Threshold</th><th>Discount</th><th>Early access</th><th>Status</th></tr></thead>
        <tbody>
          {tiers.length === 0 ? <tr><td colSpan={6} className="lgx-empty">No VIP tiers</td></tr> : null}
          {tiers.map((tier) => (
            <tr key={tier.id}>
              <td className="mono">{tier.code}</td>
              <td style={{ fontWeight: 700 }}>{tier.name}</td>
              <td>{formatNumber(tier.threshold_points_spent)} pts</td>
              <td>{formatNumber(tier.discount_percent)}%</td>
              <td>{formatNumber(tier.early_access_minutes)} min</td>
              <td><span className={`lgx-pill ${tier.is_active ? 'ok' : 'neutral'}`}>{tier.is_active ? 'active' : 'off'}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SignalsTable({ signals }) {
  return <SimpleTable title="Wishlist Signals" rows={signals} columns={['product_id', 'product_name', 'followers', 'stock_followers', 'promo_followers', 'campaign_followers', 'available_stock']} />
}

function NotificationsTable({ notifications }) {
  return (
    <div className="lgx-panel">
      <div className="lgx-panel-head"><h2>Growth Notifications</h2></div>
      <table className="lgx-table">
        <thead><tr><th>ID</th><th>Event</th><th>Target</th><th>Status</th><th>Delivered</th><th>Failed</th><th>Created</th></tr></thead>
        <tbody>
          {notifications.length === 0 ? <tr><td colSpan={7} className="lgx-empty">No notification events</td></tr> : null}
          {notifications.map((event) => (
            <tr key={event.id}>
              <td className="mono">{event.id}</td>
              <td>{event.event_type}</td>
              <td>{event.target_type || '-'} {event.target_id || ''}</td>
              <td><span className="lgx-pill neutral">{event.status || '-'}</span></td>
              <td>{formatNumber(event.delivered_count)}</td>
              <td>{formatNumber(event.failed_count)}</td>
              <td className="mono" style={{ fontSize: 11 }}>{formatDateTime(event.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function SimpleTable({ title, rows = [], columns = [] }) {
  return (
    <div className="lgx-panel">
      <div className="lgx-panel-head"><h2>{title}</h2></div>
      <table className="lgx-table">
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>
          {rows.length === 0 ? <tr><td colSpan={columns.length} className="lgx-empty">No data</td></tr> : null}
          {rows.map((row, index) => <tr key={row.id || row.product_id || index}>{columns.map((column) => <td key={column}>{formatCell(row?.[column])}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  )
}

function DiscountPreview({ fetchJson, canManage }) {
  const [form, setForm] = useState({ target_type: 'product', target_id: '', qty: 1, coupon_code: '', user_id: '' })
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')

  function setField(field, value) { setForm((prev) => ({ ...prev, [field]: value })) }

  async function preview() {
    const targetId = Number(form.target_id)
    const qty = Number(form.qty)
    const userId = Number(form.user_id)
    if (!Number.isFinite(targetId) || targetId <= 0) { setError('Enter a valid target ID.'); return }
    setError('')
    const body = { target_type: form.target_type, target_id: targetId, qty: Number.isFinite(qty) && qty > 0 ? qty : 1, coupon_code: form.coupon_code }
    if (Number.isFinite(userId) && userId > 0) body.user_id = userId
    const res = await fetchJson('/api/admin/discount-preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    setQuote(res.quote)
  }

  return (
    <div className="lgx-panel">
      <div className="lgx-panel-head"><h2>Discount Preview</h2></div>
      <div className="lgx-panel-body">
        <div className="lgx-form-grid" style={{ gridTemplateColumns: 'repeat(5, 1fr) auto', alignItems: 'flex-end' }}>
          <div className="lgx-field">
            <label>Target</label>
            <select className="lgx-select" value={form.target_type} onChange={(event) => setField('target_type', event.target.value)}>
              <option value="product">Product</option>
              <option value="bundle">Bundle</option>
            </select>
          </div>
          <div className="lgx-field"><label>Target ID</label><input className="lgx-input" inputMode="numeric" value={form.target_id} onChange={(event) => setField('target_id', event.target.value)} /></div>
          <div className="lgx-field"><label>Qty</label><input className="lgx-input" type="number" min="1" value={form.qty} onChange={(event) => setField('qty', event.target.value)} /></div>
          <div className="lgx-field"><label>Coupon</label><input className="lgx-input" value={form.coupon_code} onChange={(event) => setField('coupon_code', event.target.value)} /></div>
          <div className="lgx-field"><label>User ID</label><input className="lgx-input" inputMode="numeric" value={form.user_id} onChange={(event) => setField('user_id', event.target.value)} /></div>
          <button type="button" className="lgx-btn lgx-btn-accent" disabled={!canManage} onClick={preview}>Run</button>
        </div>
        {error ? <div className="lgx-banner crit" style={{ marginTop: 12 }}>{error}</div> : null}
        {quote ? <DiscountLines quote={quote} /> : null}
        {quote ? <pre className="lgx-code-block" style={{ marginTop: 14 }}>{JSON.stringify(quote, null, 2)}</pre> : null}
      </div>
    </div>
  )
}
