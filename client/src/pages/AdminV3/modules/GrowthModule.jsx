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

const EVENT_OPTIONS = [
  'campaign_started',
  'campaign_ending',
  'wishlist_stock_back',
  'wishlist_promo_started',
  'vip_tier_changed',
  'review_moderated',
]

function rowsOf(value) {
  return Array.isArray(value) ? value : []
}

function statusAlertClass(type) {
  if (type === 'success') return 'alert-success'
  if (type === 'error') return 'alert-danger'
  return 'alert-info'
}

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
  const discountValue = campaign?.discount_value == null || campaign?.discount_value === ''
    ? null
    : Number(campaign.discount_value)
  const quantityLimit = campaign?.quantity_limit == null || campaign?.quantity_limit === ''
    ? null
    : Number(campaign.quantity_limit)

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

function DiscountLines({ quote }) {
  const applied = rowsOf(quote?.discounts_applied)
  const rejected = rowsOf(quote?.discounts_rejected)
  return (
    <div className="mt-3">
      <div className="row g-3">
        <div className="col-md-4">
          <div className="small text-muted">Original unit</div>
          <div className="h5 mb-0">{formatNumber(quote?.original_unit_price_points)} pts</div>
        </div>
        <div className="col-md-4">
          <div className="small text-muted">Final unit</div>
          <div className="h5 mb-0 text-success">{formatNumber(quote?.final_unit_price_points)} pts</div>
        </div>
        <div className="col-md-4">
          <div className="small text-muted">Final total</div>
          <div className="h5 mb-0 text-primary">{formatNumber(quote?.final_total_points)} pts</div>
        </div>
      </div>
      <div className="row g-3 mt-1">
        <div className="col-lg-6">
          <div className="fw-bold small mb-2">Applied</div>
          {applied.length === 0 ? <div className="text-muted small">No applied discounts</div> : null}
          {applied.map((item, index) => (
            <div className="d-flex justify-content-between border rounded px-2 py-1 mb-1 small" key={`${item.source_type}-${item.source_id}-${index}`}>
              <span>{item.label || item.source_type}</span>
              <strong>{formatNumber(item.amount_points)} pts</strong>
            </div>
          ))}
        </div>
        <div className="col-lg-6">
          <div className="fw-bold small mb-2">Rejected</div>
          {rejected.length === 0 ? <div className="text-muted small">No rejected discounts</div> : null}
          {rejected.map((item, index) => (
            <div className="border rounded px-2 py-1 mb-1 small text-muted" key={`${item.source_type}-${item.source_id}-${index}`}>
              {item.label || item.source_type}: {item.reason || '-'}
            </div>
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
    campaigns: campaigns.length,
    reviews: reviews.length,
    vip: tiers.length,
    signals: signals.length,
    notifications: notifications.length,
  }), [campaigns.length, reviews.length, tiers.length, signals.length, notifications.length])

  async function refreshGrowth() {
    await loadModuleData('growth')
  }

  async function sendTestNotification() {
    if (!canManage) return
    setStatus({ type: 'working', message: 'Sending test notification...' })
    try {
      await fetchJson('/api/admin/growth-notifications/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: testEventType }),
      })
      setStatus({ type: 'success', message: 'Test notification sent to your inbox.' })
      await refreshGrowth()
    } catch {
      setStatus({ type: 'error', message: 'Test notification failed.' })
    }
  }

  async function setReviewStatus(reviewId, nextStatus) {
    if (!canManage) return
    setStatus({ type: 'working', message: 'Updating review...' })
    try {
      await fetchJson(`/api/admin/reviews/${reviewId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: nextStatus }),
      })
      setStatus({ type: 'success', message: 'Review updated.' })
      await refreshGrowth()
    } catch {
      setStatus({ type: 'error', message: 'Review update failed.' })
    }
  }

  async function toggleCampaign(campaign) {
    if (!canManage) return
    const body = buildCampaignToggleBody(campaign)
    if (body.targets.length === 0) {
      setStatus({ type: 'error', message: 'Campaign needs at least one target before it can be toggled.' })
      return
    }
    setStatus({ type: 'working', message: 'Updating campaign...' })
    try {
      await fetchJson(`/api/admin/growth-campaigns/${campaign.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      setStatus({ type: 'success', message: 'Campaign updated.' })
      await refreshGrowth()
    } catch {
      setStatus({ type: 'error', message: 'Campaign update failed.' })
    }
  }

  async function createStarterVipTier() {
    if (!canManage) return
    setStatus({ type: 'working', message: 'Creating VIP tier...' })
    try {
      await fetchJson('/api/admin/vip-tiers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: `tier-${Date.now()}`,
          name: 'New VIP Tier',
          threshold_points_spent: 0,
          discount_percent: 0,
          priority_support: false,
          early_access_minutes: 0,
          badge_label: 'VIP',
          is_active: true,
        }),
      })
      setStatus({ type: 'success', message: 'VIP tier created.' })
      await refreshGrowth()
    } catch {
      setStatus({ type: 'error', message: 'VIP tier create failed.' })
    }
  }

  return (
    <div className="admin-module admin-growth-module">
      <div className="content-header">
        <div className="container-fluid">
          <div className="d-flex flex-wrap align-items-center justify-content-between gap-2">
            <div>
              <h1 className="m-0 fw-bold">Growth</h1>
              <div className="text-muted small">Wishlist, reviews, campaigns, VIP, discounts, and notifications</div>
            </div>
            <div className="d-flex flex-wrap gap-2">
              <select
                className="form-select form-select-sm"
                style={{ width: 220 }}
                value={testEventType}
                disabled={!canManage}
                onChange={(event) => setTestEventType(event.target.value)}
              >
                {EVENT_OPTIONS.map((eventType) => <option value={eventType} key={eventType}>{eventType}</option>)}
              </select>
              <button className="btn btn-outline-primary btn-sm" type="button" disabled={!canManage} onClick={sendTestNotification}>
                <i className="bi bi-send me-1" /> Send test notification
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="content px-3 pb-4">
        {status.type !== 'idle' ? <div className={`alert ${statusAlertClass(status.type)}`}>{status.message}</div> : null}

        <div className="row g-3 mb-3">
          {Object.entries(counts).map(([key, value]) => (
            <div className="col-6 col-lg" key={key}>
              <div className="card h-100">
                <div className="card-body py-3">
                  <div className="small text-muted text-uppercase">{key}</div>
                  <div className="h4 mb-0 fw-bold">{formatNumber(value)}</div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="card mb-3">
          <div className="card-body py-2">
            <div className="d-flex flex-wrap gap-2">
              {TABS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`btn btn-sm ${tab === item.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                  onClick={() => setTab(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {tab === 'campaigns' ? <CampaignsTable campaigns={campaigns} canManage={canManage} onToggle={toggleCampaign} /> : null}
        {tab === 'reviews' ? <ReviewsTable reviews={reviews} canManage={canManage} onSetStatus={setReviewStatus} /> : null}
        {tab === 'vip' ? <VipTable tiers={tiers} canManage={canManage} onCreate={createStarterVipTier} /> : null}
        {tab === 'signals' ? <SignalsTable signals={signals} /> : null}
        {tab === 'discounts' ? <DiscountPreview fetchJson={fetchJson} canManage={canManage} /> : null}
        {tab === 'notifications' ? <NotificationsTable notifications={notifications} /> : null}
      </div>
    </div>
  )
}

function CampaignsTable({ campaigns, canManage, onToggle }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Campaigns</h3></div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>Kind</th>
              <th>Title</th>
              <th>Discount</th>
              <th>Targets</th>
              <th>Status</th>
              <th className="text-end">Action</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.length === 0 ? <tr><td colSpan="6" className="text-muted text-center py-4">No campaigns</td></tr> : null}
            {campaigns.map((campaign) => (
              <tr key={campaign.id}>
                <td>{campaign.kind}</td>
                <td>
                  <div className="fw-bold">{campaign.title}</div>
                  <div className="text-muted small">{campaign.badge_text || campaign.description || '-'}</div>
                </td>
                <td>{formatCampaignDiscount(campaign)}</td>
                <td>{formatNumber(normalizeCampaignTargets(campaign).length)}</td>
                <td><span className={`badge ${campaign.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>{campaign.is_active ? 'active' : 'off'}</span></td>
                <td className="text-end">
                  <button className="btn btn-outline-primary btn-sm" disabled={!canManage} onClick={() => onToggle(campaign)}>
                    {campaign.is_active ? 'Disable' : 'Enable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ReviewsTable({ reviews, canManage, onSetStatus }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Reviews</h3></div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle">
          <thead>
            <tr>
              <th>Product</th>
              <th>Reviewer</th>
              <th>Rating</th>
              <th>Status</th>
              <th>Comment</th>
              <th className="text-end">Moderation</th>
            </tr>
          </thead>
          <tbody>
            {reviews.length === 0 ? <tr><td colSpan="6" className="text-muted text-center py-4">No reviews</td></tr> : null}
            {reviews.map((review) => (
              <tr key={review.id}>
                <td>{review.product_name || review.product_id || '-'}</td>
                <td>{review.reviewer_name || review.user_email || review.user_id || '-'}</td>
                <td>{formatNumber(review.rating)} / 5</td>
                <td><span className="badge text-bg-light">{review.status || '-'}</span></td>
                <td className="text-truncate" style={{ maxWidth: 260 }}>{review.comment || '-'}</td>
                <td className="text-end">
                  <button className="btn btn-success btn-sm me-1" disabled={!canManage} onClick={() => onSetStatus(review.id, 'approved')}>Approve</button>
                  <button className="btn btn-outline-secondary btn-sm me-1" disabled={!canManage} onClick={() => onSetStatus(review.id, 'hidden')}>Hide</button>
                  <button className="btn btn-outline-danger btn-sm" disabled={!canManage} onClick={() => onSetStatus(review.id, 'rejected')}>Reject</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function VipTable({ tiers, canManage, onCreate }) {
  return (
    <div className="card">
      <div className="card-header d-flex align-items-center justify-content-between">
        <h3 className="card-title mb-0">VIP Tiers</h3>
        <button className="btn btn-primary btn-sm ms-auto" type="button" disabled={!canManage} onClick={onCreate}>Create starter tier</button>
      </div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle">
          <thead><tr><th>Code</th><th>Name</th><th>Threshold</th><th>Discount</th><th>Early access</th><th>Status</th></tr></thead>
          <tbody>
            {tiers.length === 0 ? <tr><td colSpan="6" className="text-muted text-center py-4">No VIP tiers</td></tr> : null}
            {tiers.map((tier) => (
              <tr key={tier.id}>
                <td>{tier.code}</td>
                <td>{tier.name}</td>
                <td>{formatNumber(tier.threshold_points_spent)} pts</td>
                <td>{formatNumber(tier.discount_percent)}%</td>
                <td>{formatNumber(tier.early_access_minutes)} min</td>
                <td><span className={`badge ${tier.is_active ? 'text-bg-success' : 'text-bg-secondary'}`}>{tier.is_active ? 'active' : 'off'}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SignalsTable({ signals }) {
  return (
    <SimpleTable
      title="Wishlist Signals"
      rows={signals}
      columns={['product_id', 'product_name', 'followers', 'stock_followers', 'promo_followers', 'campaign_followers', 'available_stock']}
    />
  )
}

function NotificationsTable({ notifications }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Growth Notifications</h3></div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0 align-middle">
          <thead><tr><th>ID</th><th>Event</th><th>Target</th><th>Status</th><th>Delivered</th><th>Failed</th><th>Created</th></tr></thead>
          <tbody>
            {notifications.length === 0 ? <tr><td colSpan="7" className="text-muted text-center py-4">No notification events</td></tr> : null}
            {notifications.map((event) => (
              <tr key={event.id}>
                <td>{event.id}</td>
                <td>{event.event_type}</td>
                <td>{event.target_type || '-'} {event.target_id || ''}</td>
                <td><span className="badge text-bg-light">{event.status || '-'}</span></td>
                <td>{formatNumber(event.delivered_count)}</td>
                <td>{formatNumber(event.failed_count)}</td>
                <td>{formatDateTime(event.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function SimpleTable({ title, rows = [], columns = [] }) {
  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">{title}</h3></div>
      <div className="table-responsive">
        <table className="table table-sm table-hover mb-0">
          <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={columns.length} className="text-muted text-center py-4">No data</td></tr> : null}
            {rows.map((row, index) => (
              <tr key={row.id || row.product_id || index}>{columns.map((column) => <td key={column}>{formatCell(row?.[column])}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function DiscountPreview({ fetchJson, canManage }) {
  const [form, setForm] = useState({ target_type: 'product', target_id: '', qty: 1, coupon_code: '', user_id: '' })
  const [quote, setQuote] = useState(null)
  const [error, setError] = useState('')

  function setField(field, value) {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  async function preview() {
    const targetId = Number(form.target_id)
    const qty = Number(form.qty)
    const userId = Number(form.user_id)
    if (!Number.isFinite(targetId) || targetId <= 0) {
      setError('Enter a valid target ID.')
      return
    }
    setError('')
    const body = {
      target_type: form.target_type,
      target_id: targetId,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      coupon_code: form.coupon_code,
    }
    if (Number.isFinite(userId) && userId > 0) body.user_id = userId
    const res = await fetchJson('/api/admin/discount-preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setQuote(res.quote)
  }

  return (
    <div className="card">
      <div className="card-header"><h3 className="card-title">Discount Preview</h3></div>
      <div className="card-body">
        <div className="row g-2">
          <div className="col-md-2">
            <label className="form-label small text-muted">Target</label>
            <select className="form-select" value={form.target_type} onChange={(event) => setField('target_type', event.target.value)}>
              <option value="product">Product</option>
              <option value="bundle">Bundle</option>
            </select>
          </div>
          <div className="col-md-2">
            <label className="form-label small text-muted">Target ID</label>
            <input className="form-control" inputMode="numeric" value={form.target_id} onChange={(event) => setField('target_id', event.target.value)} />
          </div>
          <div className="col-md-2">
            <label className="form-label small text-muted">Qty</label>
            <input className="form-control" type="number" min="1" value={form.qty} onChange={(event) => setField('qty', event.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label small text-muted">Coupon</label>
            <input className="form-control" value={form.coupon_code} onChange={(event) => setField('coupon_code', event.target.value)} />
          </div>
          <div className="col-md-2">
            <label className="form-label small text-muted">User ID</label>
            <input className="form-control" inputMode="numeric" value={form.user_id} onChange={(event) => setField('user_id', event.target.value)} />
          </div>
          <div className="col-md-1 d-flex align-items-end">
            <button className="btn btn-primary w-100" type="button" disabled={!canManage} onClick={preview}>Run</button>
          </div>
        </div>
        {error ? <div className="alert alert-danger py-2 mt-3 mb-0">{error}</div> : null}
        {quote ? <DiscountLines quote={quote} /> : null}
        {quote ? <pre className="mt-3 rounded bg-dark p-3 text-light small">{JSON.stringify(quote, null, 2)}</pre> : null}
      </div>
    </div>
  )
}

function formatCampaignDiscount(campaign) {
  if (campaign?.discount_type === 'percent') return `${formatNumber(campaign.discount_value)}%`
  if (campaign?.discount_type === 'amount_points') return `${formatNumber(campaign.discount_value)} pts`
  return '-'
}
