import crypto from 'node:crypto'
import pg from 'pg'
import argon2 from 'argon2'
import { resolveDiscountQuote } from './lib/growthDiscounts.js'
import { buildGrowthEventKey, normalizeNotificationPreferences, renderGrowthNotification } from './lib/growthNotifications.js'

const { Pool } = pg

function generateOrderRef() {
  const ts = Date.now().toString(36)
  const rand = crypto.randomBytes(10).toString('base64url').toLowerCase().slice(0, 12)
  return `c${ts}${rand}`
}

let _pool = null

function ensurePool() {
  if (_pool) return _pool
  _pool = new Pool({
    host: process.env.PGHOST || 'localhost',
    port: process.env.PGPORT ? Number(process.env.PGPORT) : 5432,
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD == null ? undefined : String(process.env.PGPASSWORD),
    database: process.env.PGDATABASE || 'neonshop',
  })
  return _pool
}

export async function adminListSupportAgents({ limit = 200 } = {}) {
  const lim = Number(limit)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  return all(
    `SELECT id, email, display_name, role
     FROM users
     WHERE is_banned = false
       AND role IN ('support', 'admin', 'owner')
     ORDER BY
       CASE role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'support' THEN 3 ELSE 99 END,
       email ASC,
       id ASC
     LIMIT $1`,
    [lim],
  )
}

export const pool = {
  query: (...args) => ensurePool().query(...args),
  connect: (...args) => ensurePool().connect(...args),
  end: (...args) => ensurePool().end(...args),
}

function normalizeStockPoolKind(kind) {
  const k = String(kind ?? '').trim().toLowerCase()
  if (k === 'quantity') return 'quantity'
  return 'digital_code'
}

export async function adminCreateStockPool({ name, kind, quantityRemaining, isActive }) {
  const n = String(name ?? '').trim()
  if (!n) throw new Error('invalid_name')
  const k = normalizeStockPoolKind(kind)
  const qty = quantityRemaining == null || quantityRemaining === '' ? null : Number(quantityRemaining)
  if (k === 'quantity' && (!Number.isFinite(qty) || qty < 0)) throw new Error('invalid_quantity')
  const res = await query(
    `INSERT INTO stock_pools (name, kind, quantity_remaining, is_active)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [n, k, k === 'quantity' ? qty : null, isActive === undefined ? true : Boolean(isActive)],
  )
  return res.rows[0].id
}

export async function adminListStockPools({ limit = 200, offset = 0, isActive } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const active = isActive === undefined ? null : Boolean(isActive)
  const where = active == null ? '' : 'WHERE is_active = $3'
  const params = active == null ? [lim, off] : [lim, off, active]
  return all(
    `SELECT id, name, kind, quantity_remaining, is_active, created_at, updated_at
     FROM stock_pools
     ${where}
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    params,
  )
}

export async function adminUpdateStockPool({ id, name, kind, quantityRemaining, isActive }) {
  const pid = Number(id)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const existing = await get('SELECT id, kind FROM stock_pools WHERE id = $1', [pid])
  if (!existing) throw new Error('not_found')
  const nextName = name == null ? null : String(name).trim()
  const nextKind = kind == null ? null : normalizeStockPoolKind(kind)
  const effectiveKind = nextKind ?? String(existing.kind)
  const qty = quantityRemaining == null || quantityRemaining === '' ? null : Number(quantityRemaining)
  if (quantityRemaining != null && effectiveKind === 'quantity' && (!Number.isFinite(qty) || qty < 0)) throw new Error('invalid_quantity')

  await query(
    `UPDATE stock_pools
     SET name = COALESCE($2, name),
         kind = COALESCE($3, kind),
         quantity_remaining = CASE
            WHEN COALESCE($3, kind) = 'quantity' THEN COALESCE($4, quantity_remaining)
            ELSE NULL
         END,
         is_active = COALESCE($5, is_active),
         updated_at = now()
     WHERE id = $1`,
    [pid, nextName && nextName.length ? nextName : null, nextKind, qty, isActive == null ? null : Boolean(isActive)],
  )
  return get('SELECT id, name, kind, quantity_remaining, is_active, created_at, updated_at FROM stock_pools WHERE id = $1', [pid])
}

export async function adminDeleteStockPool({ id }) {
  const pid = Number(id)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const res = await query('DELETE FROM stock_pools WHERE id = $1', [pid])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}

export async function adminAddStockPoolItems({ poolId, items }) {
  const pid = Number(poolId)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const poolRow = await get('SELECT id, kind FROM stock_pools WHERE id = $1', [pid])
  if (!poolRow) throw new Error('not_found')
  if (String(poolRow.kind) !== 'digital_code') throw new Error('invalid_kind')

  const lines = (items || [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 0)
  if (lines.length === 0) return { inserted: 0 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const payload of lines) {
      await client.query('INSERT INTO stock_pool_items (pool_id, payload, status) VALUES ($1, $2, $3)', [pid, payload, 'available'])
    }
    await client.query('COMMIT')
    return { inserted: lines.length }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

const SUPPORT_SUBJECT_MAX_LENGTH = 120
const SUPPORT_MESSAGE_MAX_LENGTH = 4000
const SUPPORT_ATTACHMENT_MAX_COUNT = 3
const SUPPORT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024
const SUPPORT_TICKET_STATUSES = new Set(['open', 'pending', 'closed'])

function normalizeSupportSearch(raw) {
  const s = typeof raw === 'string' ? raw.trim() : ''
  return s || null
}

function normalizeSupportStatus(raw) {
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  if (!value) return null
  return SUPPORT_TICKET_STATUSES.has(value) ? value : null
}

export async function adminGetStockPoolSummary(poolId) {
  const pid = Number(poolId)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  const poolRow = await get('SELECT id, kind, quantity_remaining FROM stock_pools WHERE id = $1', [pid])
  if (!poolRow) throw new Error('not_found')
  const kind = String(poolRow.kind)
  if (kind === 'quantity') {
    return { kind, quantity_remaining: Number(poolRow.quantity_remaining ?? 0) }
  }
  const rows = await all(
    `SELECT status, COUNT(*)::int AS c
     FROM stock_pool_items
     WHERE pool_id = $1
     GROUP BY status
     ORDER BY status ASC`,
    [pid],
  )
  const summary = { kind, available: 0, reserved: 0, delivered: 0, disabled: 0 }
  for (const r of rows) summary[String(r.status)] = Number(r.c) || 0
  return summary
}

export async function adminListStockPoolItems(poolId, { limit = 200, offset = 0, status } = {}) {
  const pid = Number(poolId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(pid)) throw new Error('invalid_pool_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  if (st) {
    return all(
      `SELECT id, pool_id, payload, status, created_at, reserved_at, delivered_at
       FROM stock_pool_items
       WHERE pool_id = $1 AND status = $2
       ORDER BY id DESC
       LIMIT $3 OFFSET $4`,
      [pid, st, lim, off],
    )
  }
  return all(
    `SELECT id, pool_id, payload, status, created_at, reserved_at, delivered_at
     FROM stock_pool_items
     WHERE pool_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [pid, lim, off],
  )
}

export async function adminUpdateStockPoolItem({ id, payload, status }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')
  const nextPayload = payload == null ? null : String(payload)
  const nextStatus = status == null ? null : String(status)
  if (nextStatus != null && !['available', 'disabled'].includes(nextStatus)) throw new Error('invalid_status')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    if (nextPayload != null) {
      await client.query('UPDATE stock_pool_items SET payload = $2 WHERE id = $1', [sid, nextPayload])
    }
    if (nextStatus != null) {
      await client.query('UPDATE stock_pool_items SET status = $2 WHERE id = $1', [sid, nextStatus])
    }

    await client.query('COMMIT')
    return get('SELECT id, pool_id, payload, status, created_at, reserved_at, delivered_at FROM stock_pool_items WHERE id = $1', [sid])
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminDeleteStockPoolItem({ id }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }
    await client.query('DELETE FROM stock_pool_items WHERE id = $1', [sid])
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminSetProductOptionStockBinding({ productId, productOptionId, poolId }) {
  const pid = Number(productId)
  const pool = Number(poolId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(pool)) throw new Error('invalid_pool_id')

  const optionId = productOptionId == null || productOptionId === '' ? null : String(productOptionId)
  const p = await get('SELECT id FROM products WHERE id = $1', [pid])
  if (!p) throw new Error('product_not_found')
  const poolRow = await get('SELECT id FROM stock_pools WHERE id = $1', [pool])
  if (!poolRow) throw new Error('pool_not_found')

  if (optionId != null) {
    const found = await get(
      `SELECT option_id
       FROM product_option_items
       WHERE product_id = $1
         AND option_id = $2
         AND is_active = true
       LIMIT 1`,
      [pid, optionId],
    )
    if (!found) throw new Error('invalid_product_option')
  }

  await query(
    `INSERT INTO product_option_stock_bindings (product_id, product_option_id, pool_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (product_id, COALESCE(product_option_id, ''))
     DO UPDATE SET product_option_id = EXCLUDED.product_option_id, pool_id = EXCLUDED.pool_id`,
    [pid, optionId, pool],
  )
  return { ok: true }
}

export async function adminUnsetProductOptionStockBinding({ productId, productOptionId }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  const optionId = productOptionId == null || productOptionId === '' ? null : String(productOptionId)
  const res = await query(
    `DELETE FROM product_option_stock_bindings
     WHERE product_id = $1 AND COALESCE(product_option_id, '') = COALESCE($2, '')`,
    [pid, optionId],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}

export async function adminListProductOptionStockBindings({ productId }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  return all(
    `SELECT b.id, b.product_id, b.product_option_id, b.pool_id, b.created_at,
            p.name AS pool_name, p.kind AS pool_kind, p.quantity_remaining, p.is_active
     FROM product_option_stock_bindings b
     JOIN stock_pools p ON p.id = b.pool_id
     WHERE b.product_id = $1
     ORDER BY COALESCE(b.product_option_id, '') ASC`,
    [pid],
  )
}

async function query(sql, params = []) {
  const res = await ensurePool().query(sql, params)
  return res
}

function normalizeProductOptionId(raw) {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Number.isFinite(Number(raw))) return String(Number(raw))
  return ''
}

function normalizeProductOptionsInput(productOptions) {
  if (!Array.isArray(productOptions)) return []
  const seen = new Set()
  const rows = []
  for (let i = 0; i < productOptions.length; i += 1) {
    const opt = productOptions[i] ?? {}
    const optionId = normalizeProductOptionId(opt?.id)
    const label = typeof opt?.label === 'string' ? opt.label.trim() : ''
    const valueText = opt?.value == null ? null : String(opt.value)
    const priceRaw = opt?.price_points == null || opt?.price_points === '' ? null : Number(opt.price_points)

    if (!optionId && !label && priceRaw == null && (valueText == null || valueText === '')) continue
    if (!optionId || !label) throw new Error('invalid_product_option')
    if (!Number.isFinite(priceRaw) || priceRaw < 0) throw new Error('invalid_product_option')
    if (seen.has(optionId)) throw new Error('invalid_product_option')
    seen.add(optionId)

    rows.push({
      option_id: optionId,
      label,
      value_text: valueText,
      price_points: Math.round(priceRaw),
      sort_order: i,
      is_active: true,
    })
  }
  return rows
}

async function replaceProductOptionItems({ productId, productOptions = [] }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  await query('DELETE FROM product_option_items WHERE product_id = $1', [pid])
  for (const opt of productOptions) {
    await query(
      `INSERT INTO product_option_items (product_id, option_id, label, value_text, price_points, sort_order, is_active)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [pid, opt.option_id, opt.label, opt.value_text, opt.price_points, Number(opt.sort_order ?? 0), opt.is_active !== false],
    )
  }
}

async function listActiveProductOptionItemsByProductIds(productIds = []) {
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : [])
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v) && v > 0)))
  if (ids.length < 1) return {}

  const rows = await all(
    `SELECT product_id, option_id, label, value_text, price_points, sort_order
     FROM product_option_items
     WHERE product_id = ANY($1::bigint[])
       AND is_active = true
     ORDER BY product_id ASC, sort_order ASC, id ASC`,
    [ids],
  )

  const byProduct = {}
  for (const row of rows) {
    const key = String(row.product_id)
    if (!Array.isArray(byProduct[key])) byProduct[key] = []
    byProduct[key].push({
      id: String(row.option_id),
      label: String(row.label ?? row.option_id ?? '').trim(),
      value: row.value_text,
      price_points: Number(row.price_points ?? 0),
    })
  }
  return byProduct
}

async function attachProductOptionsToRows(rows) {
  if (Array.isArray(rows)) {
    const ids = rows.map((row) => Number(row?.id)).filter((v) => Number.isFinite(v) && v > 0)
    const byProduct = await listActiveProductOptionItemsByProductIds(ids)
    return rows.map((row) => ({ ...row, product_options: byProduct[String(row?.id)] ?? [] }))
  }
  if (rows && typeof rows === 'object') {
    const byProduct = await listActiveProductOptionItemsByProductIds([rows.id])
    return { ...rows, product_options: byProduct[String(rows.id)] ?? [] }
  }
  return rows
}

function resolveProductOption({ product, productOptionId }) {
  const opts = Array.isArray(product?.product_options) ? product.product_options : []
  if (opts.length < 1) return null

  const raw = productOptionId
  const id = typeof raw === 'string' && raw.trim() ? raw.trim() : Number.isFinite(Number(raw)) ? String(Number(raw)) : ''
  if (!id) return null

  const found = opts.find((o) => String(o?.id ?? '').trim() === id)
  if (!found) throw new Error('invalid_product_option')

  const label = typeof found?.label === 'string' && found.label.trim() ? found.label.trim() : id
  const value = found?.value == null ? null : found.value
  const pricePointsRaw = found?.price_points
  const pricePoints = pricePointsRaw == null || pricePointsRaw === '' ? null : Number(pricePointsRaw)
  if (pricePoints != null && (!Number.isFinite(pricePoints) || pricePoints < 0)) throw new Error('invalid_product_option')
  return { id, label, value, price_points: pricePoints }
}

function requireProductOption({ product, productOptionId }) {
  const opts = Array.isArray(product?.product_options) ? product.product_options : []
  if (opts.length < 1) return null
  const selected = resolveProductOption({ product, productOptionId })
  if (!selected) throw new Error('invalid_product_option')
  return selected
}

const ASSIGNABLE_ROLES = new Set(['booster', 'support', 'admin', 'owner'])
const FARM_ASSIGNABLE_ROLES = new Set(['booster', 'admin', 'owner'])

export async function assignFarmRequestToBooster({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const booster = await get('SELECT id, role FROM users WHERE id = $1', [bid])
  if (!booster) throw new Error('booster_not_found')
  const r = String(booster.role || 'user').trim().toLowerCase()
  if (!ASSIGNABLE_ROLES.has(r)) throw new Error('not_booster')

  const row = await get(
    `UPDATE farm_requests
     SET assigned_booster_id = $2,
         assigned_at = now()
     WHERE id = $1
       AND status = 'pending'
     RETURNING id, assigned_booster_id, assigned_at`,
    [rid, bid],
  )
  if (!row) throw new Error('not_found_or_locked')
  return row
}

// ── Auto-assign config ──

function normalizeAutoAssignConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const enabled = Boolean(o.enabled)
  const rawRoles = Array.isArray(o.roles) ? o.roles : ['booster']
  const roles = rawRoles
    .map((r) => (typeof r === 'string' ? r.trim().toLowerCase() : ''))
    .filter((r) => ASSIGNABLE_ROLES.has(r))
  if (roles.length === 0) roles.push('booster')
  return { enabled, roles }
}

export async function getAutoAssignConfig() {
  const raw = await getAppSettingJson('auto_assign_config')
  return normalizeAutoAssignConfig(raw)
}

export async function updateAutoAssignConfig(config) {
  const next = normalizeAutoAssignConfig(config)
  await upsertAppSettingJson('auto_assign_config', next)
  return next
}

export async function autoAssignFarmRequest(farmRequestId) {
  const config = await getAutoAssignConfig()
  if (!config.enabled || config.roles.length === 0) return null

  const rid = Number(farmRequestId)
  if (!Number.isFinite(rid)) return null

  const fr = await get('SELECT id, status, assigned_booster_id FROM farm_requests WHERE id = $1', [rid])
  if (!fr || fr.status !== 'pending' || fr.assigned_booster_id != null) return null

  // Only assign farm work to farm-capable roles (booster, admin, owner) — exclude support
  const farmRoles = config.roles.filter((r) => FARM_ASSIGNABLE_ROLES.has(r))
  if (farmRoles.length === 0) return null

  const placeholders = farmRoles.map((_, i) => `$${i + 1}`).join(', ')
  const candidate = await get(
    `SELECT u.id
     FROM users u
     INNER JOIN staff_clock_sessions sc ON sc.user_id = u.id AND sc.clock_out IS NULL
     LEFT JOIN (
       SELECT assigned_booster_id, COUNT(*)::int AS active_count
       FROM farm_requests
       WHERE status IN ('pending', 'in_progress')
         AND assigned_booster_id IS NOT NULL
       GROUP BY assigned_booster_id
     ) ac ON ac.assigned_booster_id = u.id
     WHERE LOWER(COALESCE(u.role, 'user')) IN (${placeholders})
       AND u.is_banned = false
     ORDER BY COALESCE(ac.active_count, 0) ASC, u.id ASC
     LIMIT 1`,
    farmRoles,
  )
  if (!candidate) return null

  try {
    const row = await get(
      `UPDATE farm_requests
       SET assigned_booster_id = $2,
           assigned_at = now()
       WHERE id = $1
         AND status = 'pending'
         AND assigned_booster_id IS NULL
       RETURNING id, assigned_booster_id, assigned_at`,
      [rid, candidate.id],
    )
    if (row) {
      createStaffNotification({
        userId: row.assigned_booster_id,
        type: 'assign',
        title: 'คุณได้รับมอบหมายงานใหม่',
        body: `งานจ้าง #${row.id} ได้ถูกมอบหมายให้คุณโดยอัตโนมัติ`,
        link: `/admin?module=fulfillment&id=${row.id}`,
      }).catch(() => {})
    }
    return row || null
  } catch {
    return null
  }
}

// ── Staff clock-in / clock-out ──

export async function staffClockIn(userId, { durationMinutes } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const existing = await get(
    'SELECT id FROM staff_clock_sessions WHERE user_id = $1 AND clock_out IS NULL LIMIT 1',
    [uid],
  )
  if (existing) return { already_clocked_in: true, session_id: existing.id }
  const dur = Number(durationMinutes)
  const hasAuto = Number.isFinite(dur) && dur > 0
  const row = await get(
    `INSERT INTO staff_clock_sessions (user_id)
     VALUES ($1)
     RETURNING id, clock_in`,
    [uid],
  )
  if (hasAuto) {
    const updated = await get(
      `UPDATE staff_clock_sessions SET auto_clock_out_at = clock_in + interval '1 minute' * $2
       WHERE id = $1 RETURNING id, clock_in, auto_clock_out_at`,
      [row.id, Math.min(dur, 1440)],
    )
    return { session_id: updated.id, clock_in: updated.clock_in, auto_clock_out_at: updated.auto_clock_out_at }
  }
  return { session_id: row.id, clock_in: row.clock_in, auto_clock_out_at: null }
}

export async function staffClockOut(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const row = await get(
    `UPDATE staff_clock_sessions SET clock_out = now()
     WHERE user_id = $1 AND clock_out IS NULL
     RETURNING id, clock_in, clock_out`,
    [uid],
  )
  if (!row) throw new Error('not_clocked_in')
  return row
}

export async function getStaffClockStatus(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { clocked_in: false }
  const row = await get(
    'SELECT id, clock_in, auto_clock_out_at FROM staff_clock_sessions WHERE user_id = $1 AND clock_out IS NULL LIMIT 1',
    [uid],
  )
  return row ? { clocked_in: true, session_id: row.id, clock_in: row.clock_in, auto_clock_out_at: row.auto_clock_out_at } : { clocked_in: false }
}

export async function listStaffClockSessions(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return { items: [], total: 0 }
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200)
  const off = Math.max(0, Number(offset) || 0)
  const items = await all(
    `SELECT id, clock_in, clock_out, auto_clock_out_at, note,
            EXTRACT(EPOCH FROM (COALESCE(clock_out, now()) - clock_in))::int AS duration_seconds
     FROM staff_clock_sessions
     WHERE user_id = $1
     ORDER BY clock_in DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
  const totalRow = await get('SELECT COUNT(*)::int AS c FROM staff_clock_sessions WHERE user_id = $1', [uid])
  return { items, total: totalRow?.c || 0 }
}

export async function adminListAllClockSessions({ limit = 100, offset = 0 } = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 100), 500)
  const off = Math.max(0, Number(offset) || 0)
  const items = await all(
    `SELECT sc.id, sc.user_id, sc.clock_in, sc.clock_out, sc.auto_clock_out_at, sc.note,
            EXTRACT(EPOCH FROM (COALESCE(sc.clock_out, now()) - sc.clock_in))::int AS duration_seconds,
            u.email, COALESCE(u.display_name, u.username) AS display_name, u.role
     FROM staff_clock_sessions sc
     JOIN users u ON u.id = sc.user_id
     ORDER BY sc.clock_in DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
  return { items }
}

export async function processAutoClockOuts() {
  const expired = await all(
    `SELECT id, user_id FROM staff_clock_sessions
     WHERE clock_out IS NULL AND auto_clock_out_at IS NOT NULL AND auto_clock_out_at <= now()`,
  )
  let count = 0
  for (const s of expired) {
    await get(
      `UPDATE staff_clock_sessions SET clock_out = auto_clock_out_at
       WHERE id = $1 AND clock_out IS NULL RETURNING id`,
      [s.id],
    )
    count++
  }
  return count
}

// ── Staff notifications ──

export async function createStaffNotification({ userId, type, title, body, link }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) return null
  const row = await get(
    `INSERT INTO staff_notifications (user_id, type, title, body, link)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [uid, String(type || 'info'), String(title || ''), String(body || ''), link || null],
  )
  sendPushToUser(uid, { title: String(title || ''), body: String(body || ''), link: link || null }).catch(() => {})
  // Real-time socket push
  try {
    const { emitNotificationEvent } = await import('./lib/socket.js')
    emitNotificationEvent(uid, { id: row?.id, type, title, body, link })
  } catch {}
  return row
}

export async function listStaffNotifications(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  const lim = Math.min(Math.max(1, Number(limit) || 50), 200)
  const off = Math.max(0, Number(offset) || 0)
  const items = await all(
    `SELECT id, type, title, body, link, is_read, created_at
     FROM staff_notifications
     WHERE user_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
  const unreadRow = await get(
    'SELECT COUNT(*)::int AS c FROM staff_notifications WHERE user_id = $1 AND is_read = false',
    [uid],
  )
  return { items, unread_count: unreadRow?.c || 0 }
}

export async function markNotificationRead(userId, notificationId) {
  const uid = Number(userId)
  const nid = Number(notificationId)
  await query('UPDATE staff_notifications SET is_read = true WHERE id = $1 AND user_id = $2', [nid, uid])
}

export async function markAllNotificationsRead(userId) {
  const uid = Number(userId)
  await query('UPDATE staff_notifications SET is_read = true WHERE user_id = $1 AND is_read = false', [uid])
}

export async function getUnreadNotificationCount(userId) {
  const uid = Number(userId)
  const row = await get('SELECT COUNT(*)::int AS c FROM staff_notifications WHERE user_id = $1 AND is_read = false', [uid])
  return row?.c || 0
}

// ── Push subscriptions ──

export async function savePushSubscription(userId, subscription) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  const ep = String(subscription?.endpoint || '').trim()
  if (!ep) throw new Error('invalid_subscription')
  const keys = subscription?.keys || {}
  await query(
    `INSERT INTO push_subscriptions (user_id, endpoint, keys_json)
     VALUES ($1, $2, $3::jsonb)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = $1, keys_json = $3::jsonb`,
    [uid, ep, JSON.stringify(keys)],
  )
}

export async function removePushSubscription(userId, endpoint) {
  const uid = Number(userId)
  await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [uid, String(endpoint || '')])
}

export async function sendPushToUser(userId, payload) {
  let webpush
  try { webpush = await import('web-push') } catch { return }
  const vapidPublic = process.env.VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidMail = process.env.VAPID_MAILTO || 'mailto:admin@example.com'
  if (!vapidPublic || !vapidPrivate) return

  webpush.setVapidDetails(vapidMail, vapidPublic, vapidPrivate)

  const subs = await all('SELECT id, endpoint, keys_json FROM push_subscriptions WHERE user_id = $1', [userId])
  const body = JSON.stringify(payload)
  for (const sub of subs) {
    const pushSub = { endpoint: sub.endpoint, keys: sub.keys_json }
    try {
      await webpush.sendNotification(pushSub, body)
    } catch (err) {
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]).catch(() => {})
      }
    }
  }
}

export async function boosterListMyFarmRequests({ boosterId, limit = 200, offset = 0, status } = {}) {
  const bid = Number(boosterId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null

  if (st) {
    return all(
      `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
              fr.cancel_note, fr.cancelled_at,
              fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
              fr.delivery_id, fr.order_id, fr.order_item_id,
              COALESCE(oi.qty, 1) AS order_qty,
              u.email,
              p.name AS product_name,
              p.fulfillment_type, p.farm_form_fields,
              p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
       FROM farm_requests fr
       LEFT JOIN order_items oi ON oi.id = fr.order_item_id
       JOIN users u ON u.id = fr.user_id
       JOIN products p ON p.id = fr.product_id
       WHERE fr.assigned_booster_id = $1
         AND fr.status = $2
       ORDER BY fr.id DESC
       LIMIT $3 OFFSET $4`,
      [bid, st, lim, off],
    )
  }

  return all(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     WHERE fr.assigned_booster_id = $1
     ORDER BY fr.id DESC
     LIMIT $2 OFFSET $3`,
    [bid, lim, off],
  )
}

export async function adminListBoosterFarmRequests({ limit = 200, offset = 0, status, assignedTo } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const a = assignedTo == null || assignedTo === '' ? null : Number(assignedTo)
  if (a != null && !Number.isFinite(a)) throw new Error('invalid_assigned_to')

  const where = [`fr.assigned_booster_id IS NOT NULL`]
  const params = []
  if (st) {
    params.push(st)
    where.push(`fr.status = $${params.length}`)
  }
  if (a != null) {
    params.push(a)
    where.push(`fr.assigned_booster_id = $${params.length}`)
  }
  params.push(lim)
  params.push(off)
  const w = `WHERE ${where.join(' AND ')}`

  return all(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled,
            fr.assigned_booster_id,
            ab.email AS assigned_booster_email
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     ${w}
     ORDER BY fr.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
}

export async function adminListAvailableBoosterFarmRequests({ limit = 200, offset = 0 } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  return all(
    `SELECT fr.id, fr.status, fr.created_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     WHERE fr.status = 'pending'
       AND fr.assigned_booster_id IS NULL
     ORDER BY fr.id ASC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}

export async function boosterListAvailableFarmRequests({ limit = 200, offset = 0 } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  return all(
    `SELECT fr.id, fr.status, fr.created_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     WHERE fr.status = 'pending'
       AND fr.assigned_booster_id IS NULL
     ORDER BY fr.id ASC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}

async function logBoosterAction(client, { boosterId, requestId, action, meta }) {
  await client.query(
    `INSERT INTO booster_action_logs (booster_id, farm_request_id, action, meta)
     VALUES ($1, $2, $3, $4)`,
    [boosterId, requestId, String(action || ''), meta == null ? null : JSON.stringify(meta)],
  )
}

export async function boosterClaimFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const up = await client.query(
      `UPDATE farm_requests
       SET assigned_booster_id = $2,
           assigned_at = now()
       WHERE id = $1
         AND status = 'pending'
         AND assigned_booster_id IS NULL
       RETURNING id`,
      [rid, bid],
    )

    if (up.rowCount < 1) {
      const rRes = await client.query('SELECT id, status, assigned_booster_id FROM farm_requests WHERE id = $1', [rid])
      const r = rRes.rows?.[0]
      await client.query('ROLLBACK')
      if (!r) throw new Error('not_found')
      if (r.assigned_booster_id != null) throw new Error('already_claimed')
      throw new Error('locked')
    }

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'claim', meta: null })
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

function validateAttachments(attachments) {
  if (attachments == null) return null
  if (!Array.isArray(attachments)) throw new Error('invalid_attachments')
  if (attachments.length > SUPPORT_ATTACHMENT_MAX_COUNT) throw new Error('too_many_attachments')
  for (const a of attachments) {
    if (!a || typeof a !== 'object') throw new Error('invalid_attachment')
    const data = String(a.data ?? '')
    const mime = String(a.mime ?? '').toLowerCase()
    if (!data.startsWith('data:')) throw new Error('invalid_attachment_data')
    if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(mime)) throw new Error('invalid_attachment_type')
    const base64Part = data.split(',')[1] ?? ''
    const bytes = Math.ceil((base64Part.length * 3) / 4)
    if (bytes > SUPPORT_ATTACHMENT_MAX_BYTES) throw new Error('attachment_too_large')
  }
  return attachments.length > 0 ? attachments : null
}

export async function createSupportTicket({ userId, subject, message, attachments }) {
  const uid = Number(userId)
  const s = String(subject ?? '').trim()
  const m = String(message ?? '').trim()
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!s) throw new Error('invalid_subject')
  if (s.length > SUPPORT_SUBJECT_MAX_LENGTH) throw new Error('invalid_subject_too_long')
  if (!m) throw new Error('invalid_message')
  if (m.length > SUPPORT_MESSAGE_MAX_LENGTH) throw new Error('invalid_message_too_long')
  const att = validateAttachments(attachments)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tRes = await client.query(
      `INSERT INTO support_tickets (user_id, subject, status, last_message_at, updated_at)
       VALUES ($1, $2, 'open', now(), now())
       RETURNING id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at`,
      [uid, s],
    )
    const ticket = tRes.rows[0]
    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, message, attachments)
       VALUES ($1, $2, 'user', $3, $4)`,
      [ticket.id, uid, m, att ? JSON.stringify(att) : null],
    )
    await client.query('COMMIT')
    return ticket
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function listMySupportTickets(userId, { limit = 50, offset = 0, status } = {}) {
  const uid = Number(userId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 200) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null

  if (st) {
    return all(
      `SELECT id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at
       FROM support_tickets
       WHERE user_id = $1 AND status = $2
       ORDER BY COALESCE(last_message_at, created_at) DESC
       LIMIT $3 OFFSET $4`,
      [uid, st, lim, off],
    )
  }

  return all(
    `SELECT id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at
     FROM support_tickets
     WHERE user_id = $1
     ORDER BY COALESCE(last_message_at, created_at) DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
}

export async function getMySupportTicket({ userId, ticketId }) {
  const uid = Number(userId)
  const tid = Number(ticketId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')

  const ticket = await get(
    `SELECT id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at
     FROM support_tickets
     WHERE id = $1 AND user_id = $2`,
    [tid, uid],
  )
  if (!ticket) throw new Error('not_found')
  const messages = await all(
    `SELECT m.id, m.ticket_id, m.sender_user_id, m.sender_role,
            su.display_name AS sender_display_name,
            su.email AS sender_email,
            su.avatar_url AS sender_avatar_url,
            m.message, m.attachments, m.created_at
     FROM support_ticket_messages m
     LEFT JOIN users su ON su.id = m.sender_user_id
     WHERE m.ticket_id = $1
     ORDER BY m.id ASC`,
    [tid],
  )
  return { ticket, messages }
}

export async function addMySupportTicketMessage({ userId, ticketId, message, attachments }) {
  const uid = Number(userId)
  const tid = Number(ticketId)
  const m = String(message ?? '').trim()
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (!m && (!attachments || !Array.isArray(attachments) || attachments.length === 0)) throw new Error('invalid_message')
  if (m.length > SUPPORT_MESSAGE_MAX_LENGTH) throw new Error('invalid_message_too_long')
  const att = validateAttachments(attachments)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tRes = await client.query(
      `SELECT id, user_id, status
       FROM support_tickets
       WHERE id = $1
       FOR UPDATE`,
      [tid],
    )
    const t = tRes.rows?.[0]
    if (!t) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(t.user_id) !== uid) {
      await client.query('ROLLBACK')
      throw new Error('forbidden')
    }
    if (String(t.status) === 'closed') {
      await client.query('ROLLBACK')
      throw new Error('closed')
    }

    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, message, attachments)
       VALUES ($1, $2, 'user', $3, $4)`,
      [tid, uid, m, att ? JSON.stringify(att) : null],
    )
    await client.query(
      `UPDATE support_tickets
       SET last_message_at = now(), updated_at = now()
       WHERE id = $1`,
      [tid],
    )
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminListSupportTickets({ limit = 100, offset = 0, status, assignedTo, search, scope, staffUserId } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  const stRaw = typeof status === 'string' && status.trim() ? status.trim() : null
  const st = stRaw == null ? null : normalizeSupportStatus(stRaw)
  if (stRaw != null && !st) throw new Error('invalid_status')

  const scopeRaw = typeof scope === 'string' ? scope.trim().toLowerCase() : ''
  const queueScope = scopeRaw || 'all'
  if (!['all', 'mine', 'unassigned', 'needs_reply', 'closed'].includes(queueScope)) throw new Error('invalid_scope')

  const staffId = staffUserId == null || staffUserId === '' ? null : Number(staffUserId)
  if (staffId != null && !Number.isFinite(staffId)) throw new Error('invalid_staff_id')

  const assignedRaw = typeof assignedTo === 'string' ? assignedTo.trim().toLowerCase() : assignedTo
  const mineOnlyByFilter = assignedRaw === 'me'
  const unassignedOnly = assignedRaw === 'unassigned'
  const a = unassignedOnly || mineOnlyByFilter || assignedTo == null || assignedTo === '' ? null : Number(assignedTo)
  const q = normalizeSupportSearch(search)
  if (!unassignedOnly && !mineOnlyByFilter && a != null && !Number.isFinite(a)) throw new Error('invalid_assigned_to')

  const where = []
  const params = []

  if (st) {
    params.push(st)
    where.push(`t.status = $${params.length}`)
  }

  if (queueScope === 'mine') {
    if (!Number.isFinite(staffId) || staffId <= 0) throw new Error('invalid_staff_id')
    params.push(staffId)
    where.push(`t.assigned_to = $${params.length}`)
    where.push(`t.status IN ('open', 'pending')`)
  } else if (queueScope === 'unassigned') {
    where.push(`t.assigned_to IS NULL`)
    where.push(`t.status IN ('open', 'pending')`)
  } else if (queueScope === 'needs_reply') {
    where.push(`t.status IN ('open', 'pending')`)
    where.push(`t.assigned_to IS NOT NULL`)
    where.push(`COALESCE(lm.sender_role, 'user') = 'user'`)
  } else if (queueScope === 'closed') {
    where.push(`t.status = 'closed'`)
  }

  if (unassignedOnly) {
    where.push('t.assigned_to IS NULL')
  } else if (mineOnlyByFilter) {
    if (!Number.isFinite(staffId) || staffId <= 0) throw new Error('invalid_staff_id')
    params.push(staffId)
    where.push(`t.assigned_to = $${params.length}`)
  } else if (a != null) {
    params.push(a)
    where.push(`t.assigned_to = $${params.length}`)
  }
  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR t.subject ILIKE $${params.length} OR CAST(t.id AS TEXT) ILIKE $${params.length})`)
  }

  const fromSql = `
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN users ass ON ass.id = t.assigned_to
    LEFT JOIN LATERAL (
      SELECT m.id, m.sender_role, m.sender_user_id, m.message, m.created_at
      FROM support_ticket_messages m
      WHERE m.ticket_id = t.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS message_count
      FROM support_ticket_messages sm
      WHERE sm.ticket_id = t.id
    ) msg ON TRUE
  `

  const countFromSql = `
    FROM support_tickets t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN LATERAL (
      SELECT m.sender_role
      FROM support_ticket_messages m
      WHERE m.ticket_id = t.id
      ORDER BY m.id DESC
      LIMIT 1
    ) lm ON TRUE
  `

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const baseParams = [...params]
  const listParams = [...baseParams, lim, off]

  const [items, totalRow, summaryRow, waitingStaffRow, overSlaRow] = await Promise.all([
    all(
      `SELECT t.id, t.user_id, u.email AS user_email, t.subject, t.status, t.assigned_to,
              ass.email AS assigned_email,
              t.first_response_at, t.resolved_at,
              t.created_at, t.updated_at, t.last_message_at,
              COALESCE(msg.message_count, 0) AS message_count,
              lm.sender_role AS last_sender_role,
              lm.sender_user_id AS last_sender_user_id,
              lm.created_at AS last_sender_at,
              LEFT(COALESCE(lm.message, ''), 160) AS last_message_preview
       ${fromSql}
       ${whereSql}
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    ),
    get(
      `SELECT COUNT(*)::int AS c
       ${countFromSql}
       ${whereSql}`,
      baseParams,
    ),
    get(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'open')::int AS open_count,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'closed')::int AS closed_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'pending') AND assigned_to IS NULL)::int AS unassigned_count,
         COUNT(*) FILTER (WHERE status IN ('open', 'pending') AND assigned_to = $1)::int AS mine_count
       FROM support_tickets`,
      [Number.isFinite(staffId) && staffId > 0 ? Math.trunc(staffId) : -1],
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets t
       LEFT JOIN LATERAL (
         SELECT m.sender_role
         FROM support_ticket_messages m
         WHERE m.ticket_id = t.id
         ORDER BY m.id DESC
         LIMIT 1
       ) lm ON TRUE
       WHERE t.status IN ('open', 'pending')
         AND t.assigned_to IS NOT NULL
         AND COALESCE(lm.sender_role, 'user') = 'user'`,
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE status IN ('open', 'pending')
         AND first_response_at IS NULL
         AND created_at <= now() - interval '30 minutes'`,
    ),
  ])

  return {
    items,
    total: Number(totalRow?.c || 0),
    summary: {
      open: Number(summaryRow?.open_count || 0),
      pending: Number(summaryRow?.pending_count || 0),
      closed: Number(summaryRow?.closed_count || 0),
      unassigned: Number(summaryRow?.unassigned_count || 0),
      mine: Number(summaryRow?.mine_count || 0),
      needs_reply: Number(waitingStaffRow?.c || 0),
      over_sla: Number(overSlaRow?.c || 0),
    },
  }
}

export async function adminGetSupportTicket({ ticketId }) {
  const tid = Number(ticketId)
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  const ticket = await get(
    `SELECT t.id, t.user_id, u.email AS user_email, t.subject, t.status, t.assigned_to,
            ass.email AS assigned_email,
            t.first_response_at, t.resolved_at,
            t.created_at, t.updated_at, t.last_message_at
     FROM support_tickets t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN users ass ON ass.id = t.assigned_to
     WHERE t.id = $1`,
    [tid],
  )
  if (!ticket) throw new Error('not_found')
  const messages = await all(
    `SELECT m.id, m.ticket_id, m.sender_user_id, m.sender_role,
            su.display_name AS sender_display_name,
            su.email AS sender_email,
            su.avatar_url AS sender_avatar_url,
            m.message, m.attachments, m.created_at
     FROM support_ticket_messages m
     LEFT JOIN users su ON su.id = m.sender_user_id
     WHERE m.ticket_id = $1
     ORDER BY m.id ASC`,
    [tid],
  )
  return { ticket, messages }
}

export async function adminReplySupportTicket({ ticketId, staffUserId, staffRole, message, attachments }) {
  const tid = Number(ticketId)
  const sid = Number(staffUserId)
  const role = String(staffRole ?? '').trim().toLowerCase()
  const m = String(message ?? '').trim()
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (!Number.isFinite(sid)) throw new Error('invalid_staff_id')
  if (!m && (!attachments || !Array.isArray(attachments) || attachments.length === 0)) throw new Error('invalid_message')
  if (m.length > SUPPORT_MESSAGE_MAX_LENGTH) throw new Error('invalid_message_too_long')
  if (!role) throw new Error('invalid_role')
  const att = validateAttachments(attachments)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const tRes = await client.query('SELECT id, status FROM support_tickets WHERE id = $1 FOR UPDATE', [tid])
    const t = tRes.rows?.[0]
    if (!t) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (String(t.status) === 'closed') {
      await client.query('ROLLBACK')
      throw new Error('closed')
    }
    await client.query(
      `INSERT INTO support_ticket_messages (ticket_id, sender_user_id, sender_role, message, attachments)
       VALUES ($1, $2, $3, $4, $5)`,
      [tid, sid, role, m, att ? JSON.stringify(att) : null],
    )
    await client.query(
      `UPDATE support_tickets
       SET last_message_at = now(),
           updated_at = now(),
           status = 'open',
           first_response_at = COALESCE(first_response_at, now()),
           resolved_at = NULL
       WHERE id = $1`,
      [tid],
    )
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminAssignSupportTicket({ ticketId, assignedTo }) {
  const tid = Number(ticketId)
  const aid = assignedTo == null || assignedTo === '' ? null : Number(assignedTo)
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (aid != null && !Number.isFinite(aid)) throw new Error('invalid_assigned_to')

  if (aid != null) {
    const assignee = await get('SELECT id, role, is_banned FROM users WHERE id = $1', [aid])
    if (!assignee) throw new Error('invalid_assigned_to_user')
    if (Boolean(assignee?.is_banned)) throw new Error('invalid_assigned_to_user')
    const role = String(assignee?.role || '').trim().toLowerCase()
    if (!['support', 'admin', 'owner'].includes(role)) throw new Error('invalid_assigned_to_role')
  }

  const ticket = await get(
    `UPDATE support_tickets
     SET assigned_to = $2, updated_at = now()
     WHERE id = $1
     RETURNING id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at`,
    [tid, aid],
  )
  if (!ticket) throw new Error('not_found')
  return ticket
}

export async function adminSetSupportTicketStatus({ ticketId, status }) {
  const tid = Number(ticketId)
  const st = String(status ?? '').trim().toLowerCase()
  if (!Number.isFinite(tid)) throw new Error('invalid_ticket_id')
  if (!['open', 'pending', 'closed'].includes(st)) throw new Error('invalid_status')
  const ticket = await get(
    `UPDATE support_tickets
     SET status = $2,
         resolved_at = CASE WHEN $2 = 'closed' THEN COALESCE(resolved_at, now()) ELSE NULL END,
         updated_at = now()
     WHERE id = $1
     RETURNING id, user_id, subject, status, assigned_to, first_response_at, resolved_at, created_at, updated_at, last_message_at`,
    [tid, st],
  )
  if (!ticket) throw new Error('not_found')
  return ticket
}

export async function boosterCancelFarmRequest({ id, boosterId, note }) {
  const rid = Number(id)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')
  const cancelNote = String(note ?? '').trim()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT fr.id, fr.delivery_id, fr.user_id, fr.order_id, fr.order_item_id, fr.status, fr.assigned_booster_id
       FROM farm_requests fr
       WHERE fr.id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled') {
      await client.query('ROLLBACK')
      throw new Error('already_fulfilled')
    }

    if (currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query(
        `UPDATE farm_requests
         SET cancel_note = COALESCE(NULLIF($2, ''), cancel_note), cancelled_at = COALESCE(cancelled_at, now())
         WHERE id = $1`,
        [rid, cancelNote],
      )
      await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'cancel', meta: { refunded: false } })
      await client.query('COMMIT')
      return { ok: true, refunded: false }
    }

    if (!['pending', 'in_progress'].includes(currentStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const oiRes = await client.query(
      `SELECT qty, unit_price_points
       FROM order_items
       WHERE id = $1`,
      [r.order_item_id],
    )
    const oi = oiRes.rows?.[0]
    const qty = Number(oi?.qty ?? 0)
    const unit = Number(oi?.unit_price_points ?? 0)
    const refund = qty * unit
    if (!Number.isFinite(refund) || refund <= 0) {
      await client.query('ROLLBACK')
      throw new Error('invalid_refund')
    }

    const refType = 'farm_cancel'
    const refId = `farm:${rid}`
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, $3, $4)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [r.user_id, refund, refType, refId],
    )
    const applied = txRes.rowCount > 0
    if (applied) {
      await client.query(
        `UPDATE wallets
         SET balance = balance + $1, updated_at = now()
         WHERE user_id = $2`,
        [refund, r.user_id],
      )
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'cancelled', payload_masked = $2, payload = NULL
       WHERE id = $1`,
      [r.delivery_id, cancelNote || 'ยกเลิก'],
    )

    await client.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE id = $1`,
      [r.order_id],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'cancelled', cancel_note = $2, cancelled_at = now()
       WHERE id = $1`,
      [rid, cancelNote || null],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'cancel', meta: { refunded: applied, points: refund, reason: cancelNote || null } })
    await client.query('COMMIT')
    return { ok: true, refunded: applied, points: refund }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function boosterReleaseFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id, started_at
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }
    const st = String(r.status)
    if (st === 'fulfilled' || st === 'cancelled' || st === 'canceled') {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }
    if (r.started_at) {
      await client.query('ROLLBACK')
      throw new Error('already_started')
    }

    await client.query(
      `UPDATE farm_requests
       SET assigned_booster_id = NULL,
           assigned_at = NULL
       WHERE id = $1`,
      [rid],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'release', meta: null })
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function queueReleaseExpiredBoosterClaims({ slaSeconds = 300, limit = 50 } = {}) {
  const sla = Number(slaSeconds)
  const lim = Number(limit)
  if (!Number.isFinite(sla) || sla <= 0) throw new Error('invalid_sla_seconds')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const cutoffRes = await client.query(`SELECT now() - ($1::text || ' seconds')::interval AS cutoff`, [sla])
    const cutoff = cutoffRes.rows?.[0]?.cutoff

    const candRes = await client.query(
      `SELECT id, assigned_booster_id
       FROM farm_requests
       WHERE status = 'pending'
         AND assigned_booster_id IS NOT NULL
         AND started_at IS NULL
         AND assigned_at IS NOT NULL
         AND assigned_at < $1
       ORDER BY assigned_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [cutoff, lim],
    )

    const rows = Array.isArray(candRes.rows) ? candRes.rows : []
    if (rows.length < 1) {
      await client.query('COMMIT')
      return { ok: true, released: 0 }
    }

    for (const r of rows) {
      const rid = Number(r.id)
      const prevBoosterId = Number(r.assigned_booster_id)
      if (!Number.isFinite(rid) || !Number.isFinite(prevBoosterId)) continue

      await client.query(
        `UPDATE farm_requests
         SET assigned_booster_id = NULL,
             assigned_at = NULL
         WHERE id = $1`,
        [rid],
      )

      await logBoosterAction(client, {
        boosterId: prevBoosterId,
        requestId: rid,
        action: 'sla_release',
        meta: { sla_seconds: sla },
      })
    }

    await client.query('COMMIT')
    return { ok: true, released: rows.length }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function boosterStartFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id, started_at
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (r.assigned_booster_id == null) {
      // auto-assign to this booster
      await client.query(
        `UPDATE farm_requests SET assigned_booster_id = $2, assigned_at = now() WHERE id = $1`,
        [rid, bid],
      )
    } else if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled' || currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    await client.query(
      `UPDATE farm_requests
       SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
           started_at = COALESCE(started_at, now())
       WHERE id = $1`,
      [rid],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'start', meta: null })
    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function boosterFulfillFarmRequest({ requestId, boosterId, payload }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    if (String(r.status) === 'pending') {
      await client.query(
        `UPDATE farm_requests
         SET status = 'in_progress', started_at = COALESCE(started_at, now())
         WHERE id = $1`,
        [rid],
      )
      await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'start', meta: { implicit: true } })
    }

    await client.query('COMMIT')
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }

  await adminFulfillFarmRequest({ id: rid, payload })

  const client2 = await pool.connect()
  try {
    await client2.query('BEGIN')
    await logBoosterAction(client2, { boosterId: bid, requestId: rid, action: 'fulfill', meta: null })
    await client2.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client2.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client2.release()
  }
}

const DEFAULT_UI_IMAGE_SETTINGS = {
  home_featured_ratio: '4/3',
  home_categories_ratio: '16/10',
  category_products_ratio: '16/10',
  product_detail_ratio: '16/10',
  home_featured_force_fit: true,
  home_categories_force_fit: true,
  category_products_force_fit: true,
  product_detail_force_fit: true,
}

const DEFAULT_UI_BRANDING_SETTINGS = {
  site_name: 'VxperS Store',
  navbar_title: 'VxperS Store',
  navbar_tagline: 'Digital & Gaming Store',
  tab_title: 'VxperS Store',
  favicon_url: '/favicon.ico',
  navbar_links: [],
}

function normalizeImageRatioValue(value, fallback) {
  const raw = String(value ?? '').trim()
  if (!raw) return fallback

  const ratioMatch = raw.match(/^([0-9]+(?:\.[0-9]+)?)\s*\/\s*([0-9]+(?:\.[0-9]+)?)$/)
  if (ratioMatch) {
    const width = Number(ratioMatch[1])
    const height = Number(ratioMatch[2])
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      return `${width}/${height}`
    }
    return fallback
  }

  const numericRatio = Number(raw)
  if (Number.isFinite(numericRatio) && numericRatio > 0) return String(numericRatio)
  return fallback
}

function normalizeBoolValue(value, fallback) {
  if (value === true || value === false) return value
  if (value === 'true' || value === 1) return true
  if (value === 'false' || value === 0) return false
  return fallback
}

function normalizeUiImageSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    home_featured_ratio: normalizeImageRatioValue(source.home_featured_ratio, DEFAULT_UI_IMAGE_SETTINGS.home_featured_ratio),
    home_categories_ratio: normalizeImageRatioValue(source.home_categories_ratio, DEFAULT_UI_IMAGE_SETTINGS.home_categories_ratio),
    category_products_ratio: normalizeImageRatioValue(source.category_products_ratio, DEFAULT_UI_IMAGE_SETTINGS.category_products_ratio),
    product_detail_ratio: normalizeImageRatioValue(source.product_detail_ratio, DEFAULT_UI_IMAGE_SETTINGS.product_detail_ratio),
    home_featured_force_fit: normalizeBoolValue(source.home_featured_force_fit, DEFAULT_UI_IMAGE_SETTINGS.home_featured_force_fit),
    home_categories_force_fit: normalizeBoolValue(source.home_categories_force_fit, DEFAULT_UI_IMAGE_SETTINGS.home_categories_force_fit),
    category_products_force_fit: normalizeBoolValue(source.category_products_force_fit, DEFAULT_UI_IMAGE_SETTINGS.category_products_force_fit),
    product_detail_force_fit: normalizeBoolValue(source.product_detail_force_fit, DEFAULT_UI_IMAGE_SETTINGS.product_detail_force_fit),
  }
}

function normalizeBrandingText(value, fallback, maxLen) {
  const txt = String(value ?? '').trim()
  if (!txt) return fallback
  return txt.slice(0, maxLen)
}

function normalizeFaviconUrl(value) {
  const txt = String(value ?? '').trim()
  if (!txt) return DEFAULT_UI_BRANDING_SETTINGS.favicon_url
  if (txt.startsWith('/')) return txt
  if (txt.startsWith('http://') || txt.startsWith('https://')) return txt
  if (txt.startsWith('data:image/')) return txt
  return DEFAULT_UI_BRANDING_SETTINGS.favicon_url
}

function normalizeNavbarLinkTo(value) {
  const txt = String(value ?? '').trim()
  if (!txt) return '/'
  if (txt.startsWith('/')) return txt
  if (txt.startsWith('http://') || txt.startsWith('https://')) return txt
  return '/'
}

function normalizeNavbarLinks(value) {
  const rows = Array.isArray(value) ? value : []
  const out = rows
    .map((row) => {
      const r = row && typeof row === 'object' ? row : {}
      const label = String(r.label ?? '').trim().slice(0, 30)
      const to = normalizeNavbarLinkTo(r.to)
      if (!label) return null
      return {
        label,
        to,
        auth_required: Boolean(r.auth_required),
      }
    })
    .filter(Boolean)
    .slice(0, 12)
  return out
}

function normalizeUiBrandingSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    site_name: normalizeBrandingText(source.site_name, DEFAULT_UI_BRANDING_SETTINGS.site_name, 60),
    navbar_title: normalizeBrandingText(source.navbar_title, DEFAULT_UI_BRANDING_SETTINGS.navbar_title, 60),
    navbar_tagline: normalizeBrandingText(source.navbar_tagline, DEFAULT_UI_BRANDING_SETTINGS.navbar_tagline, 80),
    tab_title: normalizeBrandingText(source.tab_title, DEFAULT_UI_BRANDING_SETTINGS.tab_title, 80),
    favicon_url: normalizeFaviconUrl(source.favicon_url),
    navbar_links: normalizeNavbarLinks(source.navbar_links),
  }
}

export async function purchaseUidProduct({ userId, productId, qty, uid, uidConfirmed, couponCode }) {
  const userIdNum = Number(userId)
  const productIdNum = Number(productId)
  const qtyNum = Number(qty)
  const uidText = String(uid ?? '').trim()
  if (!Number.isFinite(userIdNum)) throw new Error('invalid_user_id')
  if (!Number.isFinite(productIdNum)) throw new Error('invalid_product_id')
  if (!Number.isFinite(qtyNum) || qtyNum <= 0 || qtyNum > 10) throw new Error('invalid_qty')
  if (!uidText) throw new Error('invalid_uid')
  if (!Boolean(uidConfirmed)) throw new Error('uid_not_confirmed')

  const { productOptionId } = arguments?.[0] ?? {}
  const product = await getProductById(productIdNum)
  if (!product) throw new Error('product_not_found')

  const selectedOption = requireProductOption({ product, productOptionId })

  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice <= 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const promo = await getActivePromotionForProduct(client, productIdNum)
    const promoPrice = computeDiscountedUnitPrice({
      unitPrice: originalUnitPrice,
      percent: promo?.discount_percent,
      amount: promo?.discount_amount_points,
    })
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const couponPrice = computeDiscountedUnitPrice({
      unitPrice: promoPrice.finalUnitPrice,
      percent: coupon?.discount_percent,
      amount: coupon?.discount_amount_points,
    })

    const unitPrice = couponPrice.finalUnitPrice
    const subtotal = originalUnitPrice * qtyNum
    const promoDiscountTotal = promoPrice.discountPoints * qtyNum
    const couponDiscountTotal = couponPrice.discountPoints * qtyNum
    const total = unitPrice * qtyNum

    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userIdNum])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userIdNum],
    )

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [userIdNum, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (
         order_id, product_id, qty,
         unit_price_points, unit_price_original_points,
         promo_discount_points, coupon_discount_points,
         product_option
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        orderId,
        productIdNum,
        qtyNum,
        unitPrice,
        originalUnitPrice,
        promoPrice.discountPoints,
        couponPrice.discountPoints,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const orderItemId = orderItemRes.rows[0].id

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [userIdNum, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, userIdNum],
    )

    if (coupon?.id) {
      await client.query('UPDATE discount_coupons SET used_count = COALESCE(used_count, 0) + 1, updated_at = now() WHERE id = $1', [coupon.id])
    }

    const deliveryRes = await client.query(
      `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_item_id, status, payload_masked, payload)
       VALUES ($1, $2, $3, $4, NULL, 'pending_fulfillment', $5, NULL)
       RETURNING id`,
      [userIdNum, orderId, orderItemId, productIdNum, 'รอดำเนินการ'],
    )
    const deliveryId = deliveryRes.rows[0].id

    const farmRes = await client.query(
      `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, uid, uid_confirmed, status, product_option)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8::jsonb)
       RETURNING id`,
      [deliveryId, userIdNum, productIdNum, orderId, orderItemId, uidText, true, selectedOption ? JSON.stringify(selectedOption) : null],
    )
    const farmRequestId = farmRes.rows[0]?.id

    await client.query('COMMIT')

    if (farmRequestId) autoAssignFarmRequest(farmRequestId).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries: [{ id: deliveryId, masked: 'รอดำเนินการ' }],
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

async function cleanupExpiredAdminEntries() {
  await Promise.all([
    query('DELETE FROM coupons WHERE expires_at IS NOT NULL AND expires_at < now()'),
    query('DELETE FROM discount_coupons WHERE expires_at IS NOT NULL AND expires_at < now()'),
    query('DELETE FROM product_promotions WHERE ends_at IS NOT NULL AND ends_at < now()'),
  ])
}

export async function adminListProductPromotions({ productId, limit = 50, offset = 0 } = {}) {
  await cleanupExpiredAdminEntries()
  const pid = productId == null || productId === '' ? null : Number(productId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 200) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  if (pid != null) {
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
    return all(
      `SELECT id, product_id, title, discount_percent, discount_amount_points, starts_at, ends_at, is_active, created_at, updated_at
       FROM product_promotions
       WHERE product_id = $1
       ORDER BY id DESC
       LIMIT $2 OFFSET $3`,
      [pid, lim, off],
    )
  }

  return all(
    `SELECT id, product_id, title, discount_percent, discount_amount_points, starts_at, ends_at, is_active, created_at, updated_at
     FROM product_promotions
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}

export async function adminCreateProductPromotion({ productId, title, discountPercent, discountAmountPoints, startsAt, endsAt, isActive }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')

  const t = typeof title === 'string' && title.trim() ? title.trim() : null
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp == null && da == null) throw new Error('invalid_discount')
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')

  const res = await query(
    `INSERT INTO product_promotions (
       product_id, title, discount_percent, discount_amount_points,
       starts_at, ends_at, is_active, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     RETURNING id`,
    [pid, t, dp == null ? null : Math.trunc(dp), da == null ? null : Math.trunc(da), startsAt ?? null, endsAt ?? null, isActive == null ? true : Boolean(isActive)],
  )
  return res.rows[0].id
}

export async function adminUpdateProductPromotion({ id, title, discountPercent, discountAmountPoints, startsAt, endsAt, isActive }) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  const t = title == null ? null : String(title).trim()
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')

  const res = await query(
    `UPDATE product_promotions
     SET title = COALESCE($2, title),
         discount_percent = COALESCE($3, discount_percent),
         discount_amount_points = COALESCE($4, discount_amount_points),
         starts_at = COALESCE($5, starts_at),
         ends_at = COALESCE($6, ends_at),
         is_active = COALESCE($7, is_active),
         updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [
      mid,
      t === '' ? null : t,
      dp == null ? null : Math.trunc(dp),
      da == null ? null : Math.trunc(da),
      startsAt ?? null,
      endsAt ?? null,
      isActive == null ? null : Boolean(isActive),
    ],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return res.rows[0].id
}

export async function adminDeleteProductPromotion(id) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  const res = await query('DELETE FROM product_promotions WHERE id=$1', [mid])
  return { ok: true, deleted: res.rowCount ?? 0 }
}

export async function adminListDiscountCoupons({ limit = 200, offset = 0 } = {}) {
  await cleanupExpiredAdminEntries()
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  return all(
    `SELECT id, code, title, discount_percent, discount_amount_points, max_uses, used_count, expires_at, is_active, created_at, updated_at
     FROM discount_coupons
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}

export async function adminCreateDiscountCoupon({ code, title, discountPercent, discountAmountPoints, maxUses, expiresAt, isActive }) {
  const c = String(code ?? '').trim().toUpperCase()
  if (!c) throw new Error('invalid_code')
  const t = typeof title === 'string' && title.trim() ? title.trim() : null
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp == null && da == null) throw new Error('invalid_discount')
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')

  const res = await query(
    `INSERT INTO discount_coupons (code, title, discount_percent, discount_amount_points, max_uses, expires_at, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     RETURNING id`,
    [
      c,
      t,
      dp == null ? null : Math.trunc(dp),
      da == null ? null : Math.trunc(da),
      m,
      expiresAt ?? null,
      isActive == null ? true : Boolean(isActive),
    ],
  )
  return res.rows[0].id
}

export async function adminUpdateDiscountCoupon({ id, title, discountPercent, discountAmountPoints, maxUses, usedCount, expiresAt, isActive }) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_id')
  const t = title == null ? null : String(title).trim()
  const dp = discountPercent == null || discountPercent === '' ? null : Number(discountPercent)
  const da = discountAmountPoints == null || discountAmountPoints === '' ? null : Number(discountAmountPoints)
  if (dp != null && (!Number.isFinite(dp) || dp <= 0 || dp > 95)) throw new Error('invalid_discount_percent')
  if (da != null && (!Number.isFinite(da) || da <= 0)) throw new Error('invalid_discount_amount')
  if (dp == null && da == null) throw new Error('invalid_discount')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')
  const u = usedCount == null || usedCount === '' ? null : Number(usedCount)
  if (u != null && (!Number.isFinite(u) || u < 0)) throw new Error('invalid_used_count')

  const res = await query(
    `UPDATE discount_coupons
     SET title = $2,
         discount_percent = $3,
         discount_amount_points = $4,
         max_uses = $5,
         used_count = COALESCE($6, used_count),
         expires_at = $7,
         is_active = COALESCE($8, is_active),
         updated_at = now()
     WHERE id = $1`,
    [
      cid,
      t === '' ? null : t,
      dp == null ? null : Math.trunc(dp),
      da == null ? null : Math.trunc(da),
      m,
      u,
      expiresAt ?? null,
      isActive == null ? null : Boolean(isActive),
    ],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}

export async function adminDeleteDiscountCoupon(id) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_id')
  const res = await query('DELETE FROM discount_coupons WHERE id=$1', [cid])
  return { ok: true, deleted: res.rowCount ?? 0 }
}

function growthPositiveInt(value, errorCode = 'invalid_id') {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) throw new Error(errorCode)
  return Math.trunc(n)
}

function growthLimit(value, fallback = 50, max = 200) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return fallback
  return Math.min(max, Math.trunc(n))
}

function growthOffset(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.trunc(n)
}

function campaignPrimaryLink(targets = []) {
  const first = Array.isArray(targets) ? targets[0] : null
  if (first?.target_type === 'product') return `/product/${first.target_id}`
  if (first?.target_type === 'bundle') return `/bundle/${first.target_id}`
  return '/categories'
}

async function loadCampaignTargets(campaignIds, client = null) {
  const ids = [...new Set((campaignIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))]
  if (ids.length === 0) return new Map()
  const runner = client ? (sql, params) => client.query(sql, params).then((res) => res.rows) : all
  const targets = await runner(
    `SELECT campaign_id, target_type, target_id, sort_order
     FROM growth_campaign_targets
     WHERE campaign_id = ANY($1::bigint[])
     ORDER BY campaign_id ASC, sort_order ASC, id ASC`,
    [ids],
  )
  const byCampaign = new Map(ids.map((id) => [Number(id), []]))
  for (const target of targets) {
    const campaignId = Number(target.campaign_id)
    if (!byCampaign.has(campaignId)) byCampaign.set(campaignId, [])
    byCampaign.get(campaignId).push(target)
  }
  return byCampaign
}

async function attachCampaignTargets(campaigns, client = null) {
  const rows = Array.isArray(campaigns) ? campaigns : []
  const targetsByCampaign = await loadCampaignTargets(rows.map((campaign) => campaign.id), client)
  return rows.map((campaign) => {
    const targets = targetsByCampaign.get(Number(campaign.id)) || []
    return { ...campaign, targets, primary_link: campaignPrimaryLink(targets) }
  })
}

async function replaceCampaignTargetsTx(client, campaignId, targets = []) {
  await client.query('DELETE FROM growth_campaign_targets WHERE campaign_id = $1', [campaignId])
  for (const target of Array.isArray(targets) ? targets : []) {
    await client.query(
      `INSERT INTO growth_campaign_targets (campaign_id, target_type, target_id, sort_order)
       VALUES ($1,$2,$3,$4)`,
      [campaignId, target.target_type, target.target_id, target.sort_order ?? 0],
    )
  }
}

function normalizeCampaignInput(input = {}) {
  return {
    kind: String(input.kind || 'flash_deal').trim(),
    title: String(input.title || '').trim(),
    description: String(input.description || '').trim(),
    badge_text: String(input.badge_text || '').trim(),
    is_active: input.is_active == null ? true : Boolean(input.is_active),
    starts_at: input.starts_at || null,
    ends_at: input.ends_at || null,
    discount_type: String(input.discount_type || 'none').trim(),
    discount_value: input.discount_value == null || input.discount_value === '' ? null : Math.trunc(Number(input.discount_value)),
    quantity_limit: input.quantity_limit == null || input.quantity_limit === '' ? null : Math.trunc(Number(input.quantity_limit)),
    vip_early_access_tier: input.vip_early_access_tier || null,
    targets: Array.isArray(input.targets) ? input.targets : [],
  }
}

function normalizeTierInput(input = {}) {
  return {
    code: String(input.code || '').trim().toLowerCase(),
    name: String(input.name || '').trim(),
    sort_order: Math.trunc(Number(input.sort_order) || 0),
    threshold_points_spent: Math.max(0, Math.trunc(Number(input.threshold_points_spent) || 0)),
    discount_percent: Math.max(0, Math.min(95, Math.trunc(Number(input.discount_percent) || 0))),
    priority_support: Boolean(input.priority_support),
    early_access_minutes: Math.max(0, Math.trunc(Number(input.early_access_minutes) || 0)),
    badge_label: String(input.badge_label || '').trim(),
    is_active: input.is_active == null ? true : Boolean(input.is_active),
  }
}

export async function listMyWishlist(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const items = await all(
    `SELECT wi.product_id, wi.notify_stock, wi.notify_promo, wi.notify_campaign, wi.created_at,
            p.name, p.slug, p.image_url, p.stock, p.is_unlimited_stock, p.is_hidden,
            CASE
              WHEN p.is_hidden THEN 'hidden'
              WHEN p.is_unlimited_stock THEN 'available'
              WHEN COALESCE(p.stock, 0) > 0 THEN 'available'
              ELSE 'out_of_stock'
            END AS stock_status
     FROM wishlist_items wi
     JOIN products p ON p.id = wi.product_id
     WHERE wi.user_id = $1
       AND p.is_hidden = false
     ORDER BY wi.created_at DESC`,
    [uid],
  )
  return { items }
}

export async function upsertWishlistItem({ userId, product_id, productId, notify_stock = true, notify_promo = true, notify_campaign = true }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const pid = growthPositiveInt(product_id ?? productId, 'invalid_product_id')
  const product = await get('SELECT id FROM products WHERE id = $1 AND is_hidden = false', [pid])
  if (!product) throw new Error('not_found')
  return get(
    `INSERT INTO wishlist_items (user_id, product_id, notify_stock, notify_promo, notify_campaign, updated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id, product_id)
     DO UPDATE SET notify_stock = EXCLUDED.notify_stock,
                   notify_promo = EXCLUDED.notify_promo,
                   notify_campaign = EXCLUDED.notify_campaign,
                   updated_at = now()
     RETURNING user_id, product_id, notify_stock, notify_promo, notify_campaign, created_at, updated_at`,
    [uid, pid, Boolean(notify_stock), Boolean(notify_promo), Boolean(notify_campaign)],
  )
}

export async function deleteWishlistItem({ userId, productId }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const pid = growthPositiveInt(productId, 'invalid_product_id')
  await query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [uid, pid])
  return { ok: true }
}

export async function getNotificationPreferences(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const row = await get('SELECT wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled FROM user_notification_preferences WHERE user_id = $1', [uid])
  return normalizeNotificationPreferences(row)
}

export async function updateNotificationPreferences({ userId, preferences }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const next = normalizeNotificationPreferences(preferences)
  return get(
    `INSERT INTO user_notification_preferences (user_id, wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,now())
     ON CONFLICT (user_id)
     DO UPDATE SET wishlist_stock = EXCLUDED.wishlist_stock,
                   wishlist_promo = EXCLUDED.wishlist_promo,
                   campaigns = EXCLUDED.campaigns,
                   vip = EXCLUDED.vip,
                   reviews = EXCLUDED.reviews,
                   push_enabled = EXCLUDED.push_enabled,
                   updated_at = now()
     RETURNING wishlist_stock, wishlist_promo, campaigns, vip, reviews, push_enabled`,
    [uid, next.wishlist_stock, next.wishlist_promo, next.campaigns, next.vip, next.reviews, next.push_enabled],
  )
}

export async function listProductReviewsPublic({ productId, limit = 20, offset = 0 }) {
  const pid = growthPositiveInt(productId, 'invalid_product_id')
  const lim = growthLimit(limit, 20, 100)
  const off = growthOffset(offset)
  const reviews = await all(
    `SELECT pr.id, pr.rating, pr.comment, pr.created_at,
            COALESCE(u.display_name, u.username, 'user') AS reviewer_name
     FROM product_reviews pr
     JOIN users u ON u.id = pr.user_id
     WHERE pr.product_id = $1 AND pr.status = 'approved'
     ORDER BY pr.created_at DESC
     LIMIT $2 OFFSET $3`,
    [pid, lim, off],
  )
  const summary = await get(
    `SELECT COALESCE(ROUND(AVG(rating)::numeric, 2), 0)::float AS average_rating,
            COUNT(*)::int AS review_count
     FROM product_reviews
     WHERE product_id = $1 AND status = 'approved'`,
    [pid],
  )
  return { summary, reviews }
}

export async function createProductReview({ userId, productId, order_item_id, rating, comment }) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const pid = growthPositiveInt(productId, 'invalid_product_id')
  const orderItemId = growthPositiveInt(order_item_id, 'invalid_order_item_id')
  const rate = Number(rating)
  const text = String(comment || '').trim()
  if (!Number.isFinite(rate) || rate < 1 || rate > 5) throw new Error('invalid_rating')
  const eligible = await get(
    `SELECT oi.id, oi.order_id
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     WHERE oi.id = $1
       AND oi.product_id = $2
       AND o.user_id = $3
       AND o.status IN ('paid', 'completed')`,
    [orderItemId, pid, uid],
  )
  if (!eligible) throw new Error('review_not_allowed')
  try {
    return await get(
      `INSERT INTO product_reviews (user_id, product_id, order_id, order_item_id, rating, comment)
       VALUES ($1,$2,$3,$4,$5,$6)
       RETURNING id, status, created_at`,
      [uid, pid, eligible.order_id, orderItemId, Math.trunc(rate), text],
    )
  } catch (error) {
    if (error?.code === '23505') throw new Error('review_exists')
    throw error
  }
}

export async function listActiveGrowthCampaigns({ targetType, targetId } = {}) {
  const type = String(targetType || '').trim()
  const tid = targetId == null || targetId === '' ? null : Number(targetId)
  const params = []
  let targetClause = ''
  if (type && Number.isFinite(tid) && tid > 0) {
    params.push(type, Math.trunc(tid))
    targetClause = `AND EXISTS (
      SELECT 1 FROM growth_campaign_targets t
      WHERE t.campaign_id = gc.id AND t.target_type = $1 AND t.target_id = $2
    )`
  }
  const campaigns = await all(
    `SELECT gc.*
     FROM growth_campaigns gc
     WHERE gc.is_active = true
       AND (gc.starts_at IS NULL OR gc.starts_at <= now())
       AND (gc.ends_at IS NULL OR gc.ends_at >= now())
       AND (gc.quantity_limit IS NULL OR gc.quantity_used < gc.quantity_limit)
       ${targetClause}
     ORDER BY gc.created_at DESC
     LIMIT 50`,
    params,
  )
  return { campaigns: await attachCampaignTargets(campaigns) }
}

export async function recalculateVipForUser(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const spending = await get(
    `SELECT COALESCE(SUM(total_points), 0)::int AS points_spent
     FROM orders
     WHERE user_id = $1 AND status IN ('paid', 'completed')`,
    [uid],
  )
  const pointsSpent = Number(spending?.points_spent || 0)
  const tier = await get(
    `SELECT *
     FROM vip_tiers
     WHERE is_active = true AND threshold_points_spent <= $1
     ORDER BY threshold_points_spent DESC, sort_order DESC, id DESC
     LIMIT 1`,
    [pointsSpent],
  )
  const nextTier = await get(
    `SELECT *
     FROM vip_tiers
     WHERE is_active = true AND threshold_points_spent > $1
     ORDER BY threshold_points_spent ASC, sort_order ASC, id ASC
     LIMIT 1`,
    [pointsSpent],
  )
  await query(
    `INSERT INTO vip_user_snapshots (user_id, tier_id, points_spent, next_tier_id, next_threshold_points, calculated_at)
     VALUES ($1,$2,$3,$4,$5,now())
     ON CONFLICT (user_id)
     DO UPDATE SET tier_id = EXCLUDED.tier_id,
                   points_spent = EXCLUDED.points_spent,
                   next_tier_id = EXCLUDED.next_tier_id,
                   next_threshold_points = EXCLUDED.next_threshold_points,
                   calculated_at = now()`,
    [uid, tier?.id ?? null, pointsSpent, nextTier?.id ?? null, nextTier?.threshold_points_spent ?? null],
  )
  return { tier, points_spent: pointsSpent, next_tier: nextTier, next_threshold_points: nextTier?.threshold_points_spent ?? null }
}

export async function getMyVip(userId) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const snapshot = await get('SELECT user_id, tier_id, points_spent, next_tier_id, next_threshold_points FROM vip_user_snapshots WHERE user_id = $1', [uid])
  if (!snapshot) return recalculateVipForUser(uid)
  const [tier, nextTier] = await Promise.all([
    snapshot.tier_id ? get('SELECT * FROM vip_tiers WHERE id = $1', [snapshot.tier_id]) : null,
    snapshot.next_tier_id ? get('SELECT * FROM vip_tiers WHERE id = $1', [snapshot.next_tier_id]) : null,
  ])
  return { tier, points_spent: Number(snapshot.points_spent || 0), next_tier: nextTier, next_threshold_points: snapshot.next_threshold_points ?? null }
}

export async function adminListGrowthCampaigns({ limit = 100, offset = 0 } = {}) {
  const campaigns = await all(
    `SELECT *
     FROM growth_campaigns
     ORDER BY created_at DESC, id DESC
     LIMIT $1 OFFSET $2`,
    [growthLimit(limit, 100, 500), growthOffset(offset)],
  )
  return { campaigns: await attachCampaignTargets(campaigns) }
}

export async function adminCreateGrowthCampaign(input = {}) {
  const data = normalizeCampaignInput(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const inserted = await client.query(
      `INSERT INTO growth_campaigns (
         kind, title, description, badge_text, is_active, starts_at, ends_at,
         discount_type, discount_value, quantity_limit, vip_early_access_tier, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,now())
       RETURNING *`,
      [
        data.kind,
        data.title,
        data.description,
        data.badge_text,
        data.is_active,
        data.starts_at,
        data.ends_at,
        data.discount_type,
        data.discount_value,
        data.quantity_limit,
        data.vip_early_access_tier,
      ],
    )
    const campaign = inserted.rows[0]
    await replaceCampaignTargetsTx(client, campaign.id, data.targets)
    await client.query('COMMIT')
    const [withTargets] = await attachCampaignTargets([campaign])
    return withTargets
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  } finally {
    client.release()
  }
}

export async function adminUpdateGrowthCampaign(input = {}) {
  const id = growthPositiveInt(input.id, 'invalid_id')
  const data = normalizeCampaignInput(input)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const updated = await client.query(
      `UPDATE growth_campaigns
       SET kind = $2,
           title = $3,
           description = $4,
           badge_text = $5,
           is_active = $6,
           starts_at = $7,
           ends_at = $8,
           discount_type = $9,
           discount_value = $10,
           quantity_limit = $11,
           vip_early_access_tier = $12,
           updated_at = now()
       WHERE id = $1
       RETURNING *`,
      [
        id,
        data.kind,
        data.title,
        data.description,
        data.badge_text,
        data.is_active,
        data.starts_at,
        data.ends_at,
        data.discount_type,
        data.discount_value,
        data.quantity_limit,
        data.vip_early_access_tier,
      ],
    )
    if ((updated.rowCount ?? 0) < 1) throw new Error('not_found')
    await replaceCampaignTargetsTx(client, id, data.targets)
    await client.query('COMMIT')
    const [withTargets] = await attachCampaignTargets([updated.rows[0]])
    return withTargets
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  } finally {
    client.release()
  }
}

export async function adminDeleteGrowthCampaign(id) {
  const cid = growthPositiveInt(id, 'invalid_id')
  const res = await query('DELETE FROM growth_campaigns WHERE id = $1', [cid])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}

export async function adminListReviews({ status, limit = 100, offset = 0 } = {}) {
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const params = st ? [st, growthLimit(limit, 100, 500), growthOffset(offset)] : [growthLimit(limit, 100, 500), growthOffset(offset)]
  const where = st ? 'WHERE pr.status = $1' : ''
  const limitParam = st ? '$2' : '$1'
  const offsetParam = st ? '$3' : '$2'
  const reviews = await all(
    `SELECT pr.id, pr.user_id, pr.product_id, pr.order_id, pr.order_item_id, pr.rating,
            pr.comment, pr.status, pr.admin_note, pr.created_at, pr.updated_at,
            u.email AS user_email, COALESCE(u.display_name, u.username, u.email) AS reviewer_name,
            p.name AS product_name, o.ref AS order_ref
     FROM product_reviews pr
     JOIN users u ON u.id = pr.user_id
     JOIN products p ON p.id = pr.product_id
     JOIN orders o ON o.id = pr.order_id
     ${where}
     ORDER BY pr.created_at DESC, pr.id DESC
     LIMIT ${limitParam} OFFSET ${offsetParam}`,
    params,
  )
  return { reviews }
}

export async function adminModerateReview({ id, status, adminNote, moderatorId }) {
  const reviewId = growthPositiveInt(id, 'invalid_id')
  const nextStatus = String(status || '').trim()
  if (!['pending', 'approved', 'hidden', 'rejected'].includes(nextStatus)) throw new Error('invalid_status')
  const res = await query(
    `UPDATE product_reviews
     SET status = $2,
         admin_note = $3,
         moderated_by = $4,
         moderated_at = now(),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [reviewId, nextStatus, adminNote == null ? null : String(adminNote), moderatorId ? Number(moderatorId) : null],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return res.rows[0]
}

export async function adminListVipTiers() {
  const tiers = await all(
    `SELECT *
     FROM vip_tiers
     ORDER BY threshold_points_spent ASC, sort_order ASC, id ASC`,
  )
  return { tiers }
}

export async function adminCreateVipTier(input = {}) {
  const tier = normalizeTierInput(input)
  return get(
    `INSERT INTO vip_tiers (
       code, name, sort_order, threshold_points_spent, discount_percent,
       priority_support, early_access_minutes, badge_label, is_active, updated_at
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
     RETURNING *`,
    [
      tier.code,
      tier.name,
      tier.sort_order,
      tier.threshold_points_spent,
      tier.discount_percent,
      tier.priority_support,
      tier.early_access_minutes,
      tier.badge_label,
      tier.is_active,
    ],
  )
}

export async function adminUpdateVipTier(input = {}) {
  const id = growthPositiveInt(input.id, 'invalid_id')
  const tier = normalizeTierInput(input)
  const row = await get(
    `UPDATE vip_tiers
     SET code = $2,
         name = $3,
         sort_order = $4,
         threshold_points_spent = $5,
         discount_percent = $6,
         priority_support = $7,
         early_access_minutes = $8,
         badge_label = $9,
         is_active = $10,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      id,
      tier.code,
      tier.name,
      tier.sort_order,
      tier.threshold_points_spent,
      tier.discount_percent,
      tier.priority_support,
      tier.early_access_minutes,
      tier.badge_label,
      tier.is_active,
    ],
  )
  if (!row) throw new Error('not_found')
  return row
}

export async function adminDeleteVipTier(id) {
  const tierId = growthPositiveInt(id, 'invalid_id')
  const res = await query('DELETE FROM vip_tiers WHERE id = $1', [tierId])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}

export async function adminListWishlistSignals({ limit = 50 } = {}) {
  const signals = await all(
    `SELECT wi.product_id,
            p.name AS product_name,
            p.slug,
            p.stock AS available_stock,
            p.is_unlimited_stock,
            COUNT(*)::int AS followers,
            COUNT(*) FILTER (WHERE wi.notify_stock)::int AS stock_followers,
            COUNT(*) FILTER (WHERE wi.notify_promo)::int AS promo_followers,
            COUNT(*) FILTER (WHERE wi.notify_campaign)::int AS campaign_followers
     FROM wishlist_items wi
     JOIN products p ON p.id = wi.product_id
     WHERE p.is_hidden = false
     GROUP BY wi.product_id, p.name, p.slug, p.stock, p.is_unlimited_stock
     ORDER BY followers DESC, wi.product_id ASC
     LIMIT $1`,
    [growthLimit(limit, 50, 500)],
  )
  return { signals }
}

export async function adminListGrowthNotifications({ limit = 100, offset = 0 } = {}) {
  const events = await all(
    `SELECT e.*,
            COALESCE(d.delivery_count, 0)::int AS delivery_count,
            COALESCE(d.delivered_count, 0)::int AS delivered_count,
            COALESCE(d.failed_count, 0)::int AS failed_count
     FROM growth_notification_events e
     LEFT JOIN (
       SELECT event_id,
              COUNT(*)::int AS delivery_count,
              COUNT(*) FILTER (WHERE status = 'delivered')::int AS delivered_count,
              COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_count
       FROM growth_notification_deliveries
       GROUP BY event_id
     ) d ON d.event_id = e.id
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT $1 OFFSET $2`,
    [growthLimit(limit, 100, 500), growthOffset(offset)],
  )
  return { events }
}

export async function adminPreviewDiscounts({ target_type, target_id, targetType, targetId, qty = 1, product_option_id, productOptionId, coupon_code, couponCode, user_id, userId } = {}) {
  const type = String(target_type ?? targetType ?? '').trim()
  if (!['product', 'bundle'].includes(type)) throw new Error('invalid_target_type')
  const id = growthPositiveInt(target_id ?? targetId, 'invalid_target_id')
  const quantity = Math.max(1, Math.min(999, Math.trunc(Number(qty) || 1)))
  const uid = user_id ?? userId
  const candidates = []

  let originalUnitPrice = 0
  if (type === 'product') {
    const product = await getProductById(id)
    if (!product) throw new Error('not_found')
    const selectedOption = resolveProductOption({ product, productOptionId: product_option_id ?? productOptionId })
    originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
    const client = await pool.connect()
    try {
      const promo = await getActivePromotionForProduct(client, id)
      if (promo) {
        candidates.push({
          source_type: 'product_promotion',
          source_id: promo.id,
          label: promo.title || 'Product promotion',
          discount_percent: promo.discount_percent,
          discount_amount_points: promo.discount_amount_points,
        })
      }
    } finally {
      client.release()
    }
  } else {
    const bundle = await getBundleById(id)
    if (!bundle) throw new Error('not_found')
    originalUnitPrice = Number(bundle.bundle_price)
  }

  const activeCampaigns = await listActiveGrowthCampaigns({ targetType: type, targetId: id })
  for (const campaign of activeCampaigns.campaigns) {
    if (campaign.discount_type === 'percent') {
      candidates.push({ source_type: 'growth_campaign', source_id: campaign.id, source_code: campaign.kind, label: campaign.title, discount_percent: campaign.discount_value })
    } else if (campaign.discount_type === 'amount_points') {
      candidates.push({ source_type: 'growth_campaign', source_id: campaign.id, source_code: campaign.kind, label: campaign.title, discount_amount_points: campaign.discount_value })
    }
  }

  if (uid != null && uid !== '') {
    const vip = await getMyVip(uid).catch(() => null)
    if (vip?.tier?.discount_percent) {
      candidates.push({
        source_type: 'vip',
        source_id: vip.tier.id,
        source_code: vip.tier.code,
        label: vip.tier.name || vip.tier.code,
        discount_percent: vip.tier.discount_percent,
      })
    }
  }

  const code = String(coupon_code ?? couponCode ?? '').trim().toUpperCase()
  if (code) {
    const client = await pool.connect()
    try {
      const coupon = await readAndValidateDiscountCoupon(client, code)
      if (coupon) {
        candidates.push({
          source_type: 'coupon',
          source_id: coupon.id,
          source_code: coupon.code,
          label: coupon.title || `Coupon ${coupon.code}`,
          discount_percent: coupon.discount_percent,
          discount_amount_points: coupon.discount_amount_points,
        })
      }
    } catch (error) {
      candidates.push({ source_type: 'coupon', source_code: code, label: `Coupon ${code}`, rejected_reason: String(error?.message || 'invalid_coupon') })
    } finally {
      client.release()
    }
  }

  return resolveDiscountQuote({
    targetType: type,
    targetId: id,
    originalUnitPricePoints: originalUnitPrice,
    quantity,
    candidates,
  })
}

export async function enqueueGrowthNotification({ eventKey, eventType, targetType, targetId, audienceType = 'direct', payload }) {
  return get(
    `INSERT INTO growth_notification_events (event_key, event_type, target_type, target_id, audience_type, payload_json)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb)
     ON CONFLICT (event_key) DO UPDATE SET event_key = EXCLUDED.event_key
     RETURNING id, event_key, event_type, payload_json`,
    [eventKey, eventType, targetType || null, targetId || null, audienceType, JSON.stringify(payload || {})],
  )
}

export async function createGrowthNotificationDelivery({ eventId, userId, channel, siteMessageId = null, status = 'pending', errorText = null }) {
  return get(
    `INSERT INTO growth_notification_deliveries (event_id, user_id, channel, site_message_id, status, error_text, delivered_at)
     VALUES ($1,$2,$3,$4,$5,$6,CASE WHEN $5 = 'delivered' THEN now() ELSE NULL END)
     ON CONFLICT (event_id, user_id, channel) DO UPDATE SET status = growth_notification_deliveries.status
     RETURNING id, status`,
    [eventId, userId, channel, siteMessageId, status, errorText],
  )
}

export async function adminSendGrowthNotificationTest({ userId, event_type, eventType, product_id, campaign_id } = {}) {
  const uid = growthPositiveInt(userId, 'invalid_user_id')
  const type = String(event_type ?? eventType ?? 'campaign_started').trim()
  const payload = {
    product_id: product_id ?? null,
    campaign_id: campaign_id ?? null,
    product_name: 'Test product',
    campaign_title: 'Test campaign',
    tier_name: 'VIP',
  }
  const rendered = renderGrowthNotification({ eventType: type, payload })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const eventKey = buildGrowthEventKey({ eventType: type, targetType: 'user', targetId: uid, version: `test:${Date.now()}` })
    const eventRes = await client.query(
      `INSERT INTO growth_notification_events (event_key, event_type, target_type, target_id, audience_type, payload_json, status, processed_at)
       VALUES ($1,$2,'user',$3,'direct',$4,'processed',now())
       ON CONFLICT (event_key) DO UPDATE SET processed_at = now()
       RETURNING id`,
      [eventKey, type, uid, payload],
    )
    const eventId = eventRes.rows[0].id
    const siteMessageRes = await client.query(
      `INSERT INTO site_messages (sender_id, target_type, target_user_id, title, body)
       VALUES ($1,'individual',$2,$3,$4)
       RETURNING id`,
      [uid, uid, rendered.title, rendered.body],
    )
    await client.query(
      `INSERT INTO growth_notification_deliveries (event_id, user_id, channel, status, site_message_id, delivered_at)
       VALUES ($1,$2,'inbox','delivered',$3,now())
       ON CONFLICT (event_id, user_id, channel)
       DO UPDATE SET status = 'delivered',
                     site_message_id = EXCLUDED.site_message_id,
                     delivered_at = now()`,
      [eventId, uid, siteMessageRes.rows[0].id],
    )
    await client.query('COMMIT')
    return { ok: true, event_id: eventId, site_message_id: siteMessageRes.rows[0].id }
  } catch (error) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw error
  } finally {
    client.release()
  }
}

export async function quoteProductPurchase({ productId, qty = 1, couponCode } = {}) {
  const pid = Number(productId)
  const q = qty == null ? 1 : Number(qty)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 999) throw new Error('invalid_qty')

  const { productOptionId, userId } = arguments?.[0] ?? {}
  const product = await getProductById(pid)
  if (!product) throw new Error('product_not_found')

  const selectedOption = resolveProductOption({ product, productOptionId })
  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice < 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const promo = await getActivePromotionForProduct(client, pid)
    const coupon = await readAndValidateDiscountCoupon(client, couponCode)
    const campaigns = await listActiveGrowthCampaigns({ targetType: 'product', targetId: pid })
    const vip = userId ? await getMyVip(userId).catch(() => null) : null
    const candidates = [
      promotionToDiscountCandidate(promo),
      ...(campaigns.campaigns || []).map(campaignToDiscountCandidate),
      vipToDiscountCandidate(vip),
      couponToDiscountCandidate(coupon),
    ].filter(Boolean)
    const resolved = resolveDiscountQuote({
      targetType: 'product',
      targetId: pid,
      originalUnitPricePoints: originalUnitPrice,
      quantity: q,
      candidates,
    })
    await client.query('COMMIT')

    const promoDiscount = resolved.discounts_applied.find((d) => d.source_type === 'product_promotion')?.amount_points || 0
    const couponDiscount = resolved.discounts_applied.find((d) => d.source_type === 'coupon')?.amount_points || 0
    const subtotal = originalUnitPrice * q

    return {
      product_id: pid,
      qty: q,
      unit_price_original_points: originalUnitPrice,
      unit_price_points: resolved.final_unit_price_points,
      promo_discount_points: promoDiscount,
      coupon_discount_points: couponDiscount,
      subtotal_points: subtotal,
      promo_discount_total_points: promoDiscount * q,
      coupon_discount_total_points: couponDiscount * q,
      total_points: resolved.final_total_points,
      coupon_code: coupon?.code ?? null,
      coupon_valid: coupon != null,
      discounts_considered: resolved.discounts_considered,
      discounts_applied: resolved.discounts_applied,
      discounts_rejected: resolved.discounts_rejected,
      final_unit_price_points: resolved.final_unit_price_points,
      promotion: promo
        ? {
            id: promo.id,
            title: promo.title ?? null,
            discount_percent: promo.discount_percent ?? null,
            discount_amount_points: promo.discount_amount_points ?? null,
            starts_at: promo.starts_at ?? null,
            ends_at: promo.ends_at ?? null,
          }
        : null,
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

function computeDiscountedUnitPrice({ unitPrice, percent, amount }) {
  const up = Number(unitPrice)
  if (!Number.isFinite(up) || up < 0) return { finalUnitPrice: 0, discountPoints: 0 }

  const pct = Number(percent)
  const amt = Number(amount)
  let discount = 0
  if (Number.isFinite(pct) && pct > 0) discount = Math.floor((up * pct) / 100)
  else if (Number.isFinite(amt) && amt > 0) discount = Math.floor(amt)

  discount = Math.max(0, Math.min(up, discount))
  return { finalUnitPrice: up - discount, discountPoints: discount }
}

async function getActivePromotionForProduct(client, productId) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) return null
  const res = await client.query(
    `SELECT id, title, discount_percent, discount_amount_points, starts_at, ends_at
     FROM product_promotions
     WHERE product_id = $1
       AND is_active = true
       AND (starts_at IS NULL OR starts_at <= now())
       AND (ends_at IS NULL OR ends_at >= now())
     ORDER BY id DESC
     LIMIT 1`,
    [pid],
  )
  return res.rows?.[0] ?? null
}

function promotionToDiscountCandidate(promo) {
  if (!promo) return null
  return {
    source_type: 'product_promotion',
    source_id: promo.id,
    source_code: 'product_promotion',
    label: promo.title || 'Product promotion',
    discount_percent: promo.discount_percent,
    discount_amount_points: promo.discount_amount_points,
  }
}

function couponToDiscountCandidate(coupon) {
  if (!coupon) return null
  return {
    source_type: 'coupon',
    source_id: coupon.id,
    source_code: coupon.code,
    label: coupon.title || coupon.code || 'Coupon',
    discount_percent: coupon.discount_percent,
    discount_amount_points: coupon.discount_amount_points,
  }
}

function vipToDiscountCandidate(vip) {
  if (!vip?.tier || Number(vip.tier.discount_percent || 0) <= 0) return null
  return {
    source_type: 'vip',
    source_id: vip.tier.id,
    source_code: vip.tier.code,
    label: vip.tier.name || vip.tier.code || 'VIP',
    discount_percent: vip.tier.discount_percent,
  }
}

function campaignToDiscountCandidate(campaign) {
  if (!campaign || campaign.discount_type === 'none') return null
  return {
    source_type: 'growth_campaign',
    source_id: campaign.id,
    source_code: campaign.kind,
    label: campaign.title || 'Growth campaign',
    discount_percent: campaign.discount_type === 'percent' ? campaign.discount_value : null,
    discount_amount_points: campaign.discount_type === 'amount_points' ? campaign.discount_value : null,
  }
}

async function insertOrderDiscountApplications(client, { orderId, orderItemId = null, quote }) {
  const applied = Array.isArray(quote?.discounts_applied) ? quote.discounts_applied : []
  for (let index = 0; index < applied.length; index += 1) {
    const item = applied[index]
    await client.query(
      `INSERT INTO order_discount_applications (
         order_id, order_item_id, source_type, source_id, source_code, label,
         amount_points, sort_order, metadata_json
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        orderId,
        orderItemId,
        item.source_type,
        item.source_id,
        item.source_code,
        item.label,
        item.amount_points,
        index,
        JSON.stringify(item.metadata || {}),
      ],
    )
  }
}

function _validateCouponRow(c) {
  if (!c) throw new Error('invalid_coupon')
  if (!c.is_active) throw new Error('invalid_coupon')
  if (c.expires_at && new Date(c.expires_at).getTime() < Date.now()) throw new Error('coupon_expired')
  if (c.max_uses != null && Number.isFinite(Number(c.max_uses)) && Number(c.max_uses) > 0 && Number(c.used_count ?? 0) >= Number(c.max_uses)) {
    throw new Error('coupon_exhausted')
  }
  return c
}

async function readAndValidateDiscountCoupon(client, codeRaw) {
  const code = typeof codeRaw === 'string' ? codeRaw.trim().toUpperCase() : ''
  if (!code) return null
  const res = await client.query(
    `SELECT id, code, title, discount_percent, discount_amount_points, max_uses, used_count, expires_at, is_active
     FROM discount_coupons
     WHERE code = $1`,
    [code],
  )
  return _validateCouponRow(res.rows?.[0])
}

async function lockAndValidateDiscountCoupon(client, codeRaw) {
  const code = typeof codeRaw === 'string' ? codeRaw.trim().toUpperCase() : ''
  if (!code) return null
  const res = await client.query(
    `SELECT id, code, title, discount_percent, discount_amount_points, max_uses, used_count, expires_at, is_active
     FROM discount_coupons
     WHERE code = $1
     FOR UPDATE`,
    [code],
  )
  return _validateCouponRow(res.rows?.[0])
}

export async function adminStartFarmRequest({ id, staffId }) {
  const rid = Number(id)
  const sid = Number(staffId) || null
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const row = await get(
    `UPDATE farm_requests
     SET status = 'in_progress',
         started_at = COALESCE(started_at, now()),
         assigned_booster_id = CASE WHEN assigned_booster_id IS NULL AND $2::bigint IS NOT NULL THEN $2::bigint ELSE assigned_booster_id END,
         assigned_at = CASE WHEN assigned_booster_id IS NULL AND $2::bigint IS NOT NULL THEN now() ELSE assigned_at END
     WHERE id = $1
       AND status = 'pending'
     RETURNING id, status, started_at, assigned_booster_id`,
    [rid, sid],
  )
  if (!row) throw new Error('not_pending')
  return row
}

export async function adminCancelFarmRequest({ id, note }) {
  const rid = Number(id)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const cancelNote = String(note ?? '').trim()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT fr.id, fr.delivery_id, fr.user_id, fr.order_id, fr.order_item_id, fr.status
       FROM farm_requests fr
       WHERE fr.id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled') {
      await client.query('ROLLBACK')
      throw new Error('already_fulfilled')
    }

    if (currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query(
        `UPDATE farm_requests
         SET cancel_note = COALESCE(NULLIF($2, ''), cancel_note), cancelled_at = COALESCE(cancelled_at, now())
         WHERE id = $1`,
        [rid, cancelNote],
      )
      await client.query('COMMIT')
      return { ok: true, refunded: false }
    }

    if (!['pending', 'in_progress'].includes(currentStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const oiRes = await client.query(
      `SELECT qty, unit_price_points
       FROM order_items
       WHERE id = $1`,
      [r.order_item_id],
    )
    const oi = oiRes.rows?.[0]
    const qty = Number(oi?.qty ?? 0)
    const unit = Number(oi?.unit_price_points ?? 0)
    const refund = qty * unit
    if (!Number.isFinite(refund) || refund <= 0) {
      await client.query('ROLLBACK')
      throw new Error('invalid_refund')
    }

    const refType = 'farm_cancel'
    const refId = `farm:${rid}`
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, $3, $4)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [r.user_id, refund, refType, refId],
    )
    const applied = txRes.rowCount > 0
    if (applied) {
      await client.query(
        `UPDATE wallets
         SET balance = balance + $1, updated_at = now()
         WHERE user_id = $2`,
        [refund, r.user_id],
      )
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'cancelled', payload_masked = $2, payload = NULL
       WHERE id = $1`,
      [r.delivery_id, cancelNote || 'ยกเลิก'],
    )

    await client.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE id = $1`,
      [r.order_id],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'cancelled', cancel_note = $2, cancelled_at = now()
       WHERE id = $1`,
      [rid, cancelNote || null],
    )

    await client.query('COMMIT')
    return { ok: true, refunded: applied, points: refund }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function listCoupons({ limit = 200, offset = 0 } = {}) {
  await cleanupExpiredAdminEntries()
  return all(
    `SELECT id, code, points, max_uses, used_count, expires_at, is_active, created_at, updated_at
     FROM coupons
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}

export async function adminCancelTopup({ topupId }) {
  const tid = Number(topupId)
  if (!Number.isFinite(tid)) throw new Error('invalid_id')

  const topup = await get('SELECT * FROM topups WHERE id = $1', [tid])
  if (!topup) throw new Error('topup_not_found')
  if (topup.status === 'paid') throw new Error('already_paid')
  if (topup.status === 'cancelled' || topup.status === 'canceled') return { ok: true, status: 'cancelled' }

  await query(
    `UPDATE topups
     SET status = 'cancelled', updated_at = now()
     WHERE id = $1`,
    [tid],
  )
  return { ok: true, status: 'cancelled' }
}

export async function createCoupon({ code, points, maxUses, expiresAt, isActive }) {
  const c = String(code ?? '').trim()
  if (!c) throw new Error('invalid_code')
  const p = Number(points)
  if (!Number.isFinite(p) || p <= 0) throw new Error('invalid_points')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')

  const res = await query(
    `INSERT INTO coupons (code, points, max_uses, expires_at, is_active, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     RETURNING id`,
    [c, p, m, expiresAt ?? null, isActive == null ? true : Boolean(isActive)],
  )
  return res.rows[0].id
}

export async function updateCoupon({ id, points, maxUses, usedCount, expiresAt, isActive }) {
  const cid = Number(id)
  if (!Number.isFinite(cid)) throw new Error('invalid_id')
  const p = points == null || points === '' ? null : Number(points)
  if (p != null && (!Number.isFinite(p) || p <= 0)) throw new Error('invalid_points')
  const m = maxUses == null || maxUses === '' ? null : Number(maxUses)
  if (m != null && (!Number.isFinite(m) || m <= 0)) throw new Error('invalid_max_uses')
  const u = usedCount == null || usedCount === '' ? null : Number(usedCount)
  if (u != null && (!Number.isFinite(u) || u < 0)) throw new Error('invalid_used_count')

  await query(
    `UPDATE coupons
     SET points = COALESCE($2, points),
         max_uses = $3,
         used_count = COALESCE($4, used_count),
         expires_at = $5,
         is_active = COALESCE($6, is_active),
         updated_at = now()
     WHERE id = $1`,
    [cid, p, m, u, expiresAt ?? null, isActive == null ? null : Boolean(isActive)],
  )
}

export async function deleteCoupon(id) {
  const cid = Number(id)
  if (!Number.isFinite(cid)) throw new Error('invalid_id')
  await query('DELETE FROM coupons WHERE id = $1', [cid])
}

export async function redeemCoupon({ userId, code }) {
  const uid = Number(userId)
  const c = String(code ?? '').trim()
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!c) throw new Error('invalid_code')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const couponRes = await client.query(
      `SELECT id, code, points, max_uses, used_count, expires_at, is_active
       FROM coupons
       WHERE lower(code) = lower($1)
       FOR UPDATE`,
      [c],
    )
    const coupon = couponRes.rows?.[0]
    if (!coupon) {
      await client.query('ROLLBACK')
      throw new Error('coupon_not_found')
    }
    if (!coupon.is_active) {
      await client.query('ROLLBACK')
      throw new Error('coupon_inactive')
    }
    if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) {
      await client.query('ROLLBACK')
      throw new Error('coupon_expired')
    }
    if (coupon.max_uses != null && Number(coupon.used_count) >= Number(coupon.max_uses)) {
      await client.query('ROLLBACK')
      throw new Error('coupon_exhausted')
    }

    const points = Number(coupon.points)
    if (!Number.isFinite(points) || points <= 0) {
      await client.query('ROLLBACK')
      throw new Error('invalid_points')
    }

    const redemptionRes = await client.query(
      `INSERT INTO coupon_redemptions (coupon_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (coupon_id, user_id) DO NOTHING
       RETURNING id`,
      [coupon.id, uid],
    )
    if (redemptionRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('coupon_already_used')
    }

    const refId = `coupon:${coupon.id}:user:${uid}`
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, 'coupon', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, points, refId],
    )

    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate')
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [uid],
    )
    await client.query(
      `UPDATE wallets
       SET balance = balance + $1, updated_at = now()
       WHERE user_id = $2`,
      [points, uid],
    )

    await client.query(
      `UPDATE coupons
       SET used_count = used_count + 1, updated_at = now()
       WHERE id = $1`,
      [coupon.id],
    )

    await client.query('COMMIT')
    return { ok: true, points, code: coupon.code }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function setTopupPointsForApproval({ topupId, points }) {
  const tid = Number(topupId)
  const p = Number(points)
  if (!Number.isFinite(tid)) throw new Error('invalid_id')
  if (!Number.isFinite(p) || p <= 0) throw new Error('invalid_points')

  await query(
    `UPDATE topups
     SET amount = $2,
         amount_points = $2,
         updated_at = now()
     WHERE id = $1`,
    [tid, p],
  )
}

async function get(sql, params = []) {
  const res = await query(sql, params)
  return res.rows[0] ?? null
}

async function all(sql, params = []) {
  const res = await query(sql, params)
  return res.rows
}

async function getAppSettingJson(key) {
  const row = await get('SELECT value_json FROM app_settings WHERE key = $1', [String(key)])
  if (!row) return null
  if (row.value_json && typeof row.value_json === 'object') return row.value_json
  return null
}

async function upsertAppSettingJson(key, value) {
  await query(
    `INSERT INTO app_settings (key, value_json, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key)
     DO UPDATE SET value_json = EXCLUDED.value_json, updated_at = now()`,
    [String(key), JSON.stringify(value ?? {})],
  )
}

function normalizeDiscordLinkCode(raw) {
  return String(raw ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeDiscordUserId(raw) {
  const id = String(raw ?? '').trim()
  if (!/^\d{5,32}$/.test(id)) throw new Error('invalid_discord_user')
  return id
}

function getDiscordLinkCodeTtlMinutes() {
  const value = Number(process.env.DISCORD_LINK_CODE_TTL_MINUTES)
  if (!Number.isFinite(value) || value < 1 || value > 1440) return 10
  return Math.trunc(value)
}

function hashDiscordLinkCode(code) {
  const normalized = normalizeDiscordLinkCode(code)
  const pepper = String(process.env.DISCORD_LINK_CODE_PEPPER || '')
  return crypto.createHash('sha256').update(`${pepper}:${normalized}`).digest('hex')
}

function generateDiscordLinkCode() {
  return crypto
    .randomBytes(8)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .toUpperCase()
    .slice(0, 10)
}

function normalizeDiscordUsername(raw) {
  const base = String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
  return base || 'discord-user'
}

async function buildUniqueDiscordUsername({ discordUserId, username, displayName }) {
  const baseRaw = normalizeDiscordUsername(username || displayName || `discord-${discordUserId}`)
  const suffix = String(discordUserId || '').slice(-6) || crypto.randomBytes(3).toString('hex')
  const candidates = [
    baseRaw.length >= 6 ? baseRaw : `${baseRaw}-${suffix}`,
    `${baseRaw}-${suffix}`,
    `discord-${suffix}`,
    `discord-${crypto.randomBytes(5).toString('hex')}`,
  ].map((x) => x.slice(0, 40))

  for (const candidate of candidates) {
    if (candidate.length < 6) continue
    const existing = await get('SELECT id FROM users WHERE username = $1', [candidate])
    if (!existing) return candidate
  }

  return `discord-${crypto.randomBytes(8).toString('hex')}`.slice(0, 40)
}

const DEFAULT_HOMEPAGE_SETTINGS = {
  hero_title: '',
  hero_subtitle: '',
  hero_description: '',
  hero_button_text: '',
  hero_button_link: '',
  showcase_enabled: true,
  showcase_title: 'สินค้าแนะนำ',
  showcase_scroll_interval: 2000,
  showcase_max_items: 12,
  featured_category_id: null,
  featured_product_ids: [],
  showcase_product_ids: [],
  faq_items: [],
  trust_items: [],
}

function normalizeIdArray(raw, max) {
  const arr = Array.isArray(raw) ? raw : []
  return arr
    .map((v) => Number(v))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(0, max || 50)
}

function normalizeHomepageSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  const txt = (v, fb, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : fb }
  const num = (v, fb, min, max) => { const n = Number(v); return Number.isFinite(n) && n >= min && n <= max ? n : fb }
  return {
    hero_title: txt(source.hero_title, DEFAULT_HOMEPAGE_SETTINGS.hero_title, 100),
    hero_subtitle: txt(source.hero_subtitle, DEFAULT_HOMEPAGE_SETTINGS.hero_subtitle, 100),
    hero_description: txt(source.hero_description, DEFAULT_HOMEPAGE_SETTINGS.hero_description, 500),
    hero_button_text: txt(source.hero_button_text, DEFAULT_HOMEPAGE_SETTINGS.hero_button_text, 40),
    hero_button_link: txt(source.hero_button_link, DEFAULT_HOMEPAGE_SETTINGS.hero_button_link, 200),
    showcase_enabled: source.showcase_enabled === false ? false : true,
    showcase_title: txt(source.showcase_title, DEFAULT_HOMEPAGE_SETTINGS.showcase_title, 80),
    showcase_scroll_interval: num(source.showcase_scroll_interval, DEFAULT_HOMEPAGE_SETTINGS.showcase_scroll_interval, 500, 30000),
    showcase_max_items: num(source.showcase_max_items, DEFAULT_HOMEPAGE_SETTINGS.showcase_max_items, 1, 50),
    featured_category_id: (() => {
      const n = Number(source.featured_category_id)
      return Number.isFinite(n) && n > 0 ? n : null
    })(),
    featured_product_ids: normalizeIdArray(source.featured_product_ids, 20),
    showcase_product_ids: normalizeIdArray(source.showcase_product_ids, 50),
    faq_items: normalizeFaqItems(source.faq_items),
    trust_items: normalizeTrustItems(source.trust_items),
  }
}

function normalizeFaqItems(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, 20).map((item) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      question: String(o.question ?? '').trim().slice(0, 200),
      answer: String(o.answer ?? '').trim().slice(0, 1000),
    }
  }).filter((i) => i.question && i.answer)
}

function normalizeTrustItems(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, 10).map((item) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      icon: String(o.icon ?? '').trim().slice(0, 2000),
      title: String(o.title ?? '').trim().slice(0, 60),
      desc: String(o.desc ?? '').trim().slice(0, 200),
    }
  }).filter((i) => i.title)
}

const DEFAULT_SITE_SETTINGS = {
  site_url: '',
  site_description: '',
  og_image_url: '',
  footer_tagline: '',
  footer_links: [],
  social_links: [],
  announcements: [],
  tos_content: '',
}

function normalizeSiteSettings(input) {
  const s = input && typeof input === 'object' ? input : {}
  const txt = (v, fb, max) => { const t = String(v ?? '').trim(); return t ? t.slice(0, max) : fb }
  return {
    site_url: txt(s.site_url, DEFAULT_SITE_SETTINGS.site_url, 200),
    site_description: txt(s.site_description, DEFAULT_SITE_SETTINGS.site_description, 500),
    og_image_url: txt(s.og_image_url, DEFAULT_SITE_SETTINGS.og_image_url, 500),
    footer_tagline: txt(s.footer_tagline, DEFAULT_SITE_SETTINGS.footer_tagline, 100),
    footer_links: normalizeFooterLinks(s.footer_links),
    social_links: normalizeSocialLinks(s.social_links),
    announcements: normalizeAnnouncements(s.announcements),
    tos_content: txt(s.tos_content, DEFAULT_SITE_SETTINGS.tos_content, 50000),
  }
}

function normalizeAnnouncements(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, 10).map((item) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      enabled: o.enabled === true,
      text: String(o.text ?? '').trim().slice(0, 300),
      link: String(o.link ?? '').trim().slice(0, 300),
      bg: String(o.bg ?? '').trim().slice(0, 200),
      push_to_inbox: o.push_to_inbox === true,
    }
  }).filter((i) => i.text)
}

function normalizeFooterLinks(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, 12).map((item) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      label: String(o.label ?? '').trim().slice(0, 40),
      url: String(o.url ?? '').trim().slice(0, 300),
    }
  }).filter((i) => i.label && i.url)
}

function normalizeSocialLinks(raw) {
  const arr = Array.isArray(raw) ? raw : []
  return arr.slice(0, 10).map((item) => {
    const o = item && typeof item === 'object' ? item : {}
    return {
      platform: String(o.platform ?? '').trim().slice(0, 30),
      url: String(o.url ?? '').trim().slice(0, 300),
    }
  }).filter((i) => i.platform && i.url)
}

export async function getUiSettings() {
  const imageStored = await getAppSettingJson('ui_image_settings')
  const brandingStored = await getAppSettingJson('ui_branding_settings')
  const homepageStored = await getAppSettingJson('homepage_settings')
  const siteStored = await getAppSettingJson('site_settings')
  return {
    image_settings: normalizeUiImageSettings(imageStored),
    branding_settings: normalizeUiBrandingSettings(brandingStored),
    homepage_settings: normalizeHomepageSettings(homepageStored),
    site_settings: normalizeSiteSettings(siteStored),
  }
}

export async function updateUiSettings({ imageSettings, brandingSettings, homepageSettings, siteSettings } = {}) {
  const current = await getUiSettings()
  const imageSource = imageSettings && typeof imageSettings === 'object' ? imageSettings : {}
  const brandingSource = brandingSettings && typeof brandingSettings === 'object' ? brandingSettings : {}
  const homepageSource = homepageSettings && typeof homepageSettings === 'object' ? homepageSettings : {}
  const siteSource = siteSettings && typeof siteSettings === 'object' ? siteSettings : {}
  const nextImage = normalizeUiImageSettings({ ...(current?.image_settings ?? {}), ...imageSource })
  const nextBranding = normalizeUiBrandingSettings({ ...(current?.branding_settings ?? {}), ...brandingSource })
  const nextHomepage = normalizeHomepageSettings({ ...(current?.homepage_settings ?? {}), ...homepageSource })
  const nextSite = normalizeSiteSettings({ ...(current?.site_settings ?? {}), ...siteSource })

  // push announcements to inbox if flagged
  const prevAnns = Array.isArray(current?.site_settings?.announcements) ? current.site_settings.announcements : []
  const prevTexts = new Set(prevAnns.map((a) => a.text))
  for (const ann of nextSite.announcements) {
    if (ann.push_to_inbox && ann.enabled && ann.text && !prevTexts.has(ann.text)) {
      try {
        await query(
          `INSERT INTO site_messages (sender_id, target_type, target_user_id, title, body)
           VALUES (NULL, 'global', NULL, $1, $2)`,
          [ann.text.slice(0, 200), ann.link ? `ลิงก์: ${ann.link}` : ''],
        )
      } catch { /* ignore duplicate or error */ }
    }
  }

  await upsertAppSettingJson('ui_image_settings', nextImage)
  await upsertAppSettingJson('ui_branding_settings', nextBranding)
  await upsertAppSettingJson('homepage_settings', nextHomepage)
  await upsertAppSettingJson('site_settings', nextSite)
  return {
    image_settings: nextImage,
    branding_settings: nextBranding,
    homepage_settings: nextHomepage,
    site_settings: nextSite,
  }
}

const PBKDF2_ITERATIONS = 120_000

export async function hashPassword(password) {
  return argon2.hash(String(password), {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  })
}

function verifyLegacyPbkdf2Password(password, stored) {
  const [salt, expected] = String(stored).split(':')
  if (!salt || !expected) return false
  const derived = crypto.pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, 32, 'sha256')
  const expectedBuffer = Buffer.from(expected, 'hex')
  if (expectedBuffer.length !== derived.length) return false
  return crypto.timingSafeEqual(derived, expectedBuffer)
}

export async function verifyPassword(password, stored) {
  const hash = String(stored || '')
  if (!hash) return false
  if (hash.startsWith('$argon2')) {
    try {
      return await argon2.verify(hash, String(password))
    } catch {
      return false
    }
  }
  return verifyLegacyPbkdf2Password(password, hash)
}

export function initDb() {
  // no-op: init is async in Postgres version
}

export async function initDbPg() {
  await query(
    `CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_head_admin BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (username) WHERE username IS NOT NULL`)

  await query(
    `UPDATE users
     SET role = CASE
                 WHEN is_head_admin THEN 'owner'
                 WHEN is_admin THEN 'admin'
                 ELSE role
               END
     WHERE (role IS NULL OR role = '' OR role = 'user')
       AND (is_admin = true OR is_head_admin = true)`,
  )

  const owner = await get(`SELECT id FROM users WHERE role = 'owner' LIMIT 1`)
  if (!owner) {
    const firstAdmin = await get(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`)
    if (firstAdmin?.id != null) {
      await query(`UPDATE users SET role = 'owner' WHERE id = $1`, [firstAdmin.id])
    }
  }

  await query(
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action)`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS discord_account_links (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL UNIQUE,
      discord_username TEXT,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS discord_account_links_user_id_idx ON discord_account_links (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS discord_account_links_discord_user_id_idx ON discord_account_links (discord_user_id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS discord_link_codes (
      code_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      claimed_at TIMESTAMPTZ,
      claimed_discord_user_id TEXT
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS discord_link_codes_user_id_idx ON discord_link_codes (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS discord_link_codes_expires_at_idx ON discord_link_codes (expires_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      image_url TEXT,
      description TEXT
    )`,
  )

  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT`)

  await query(
    `CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      category_id BIGINT NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL,
      description TEXT,
      image_url TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS highlights TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_url TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_text TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_video_url TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'digital_stock'`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_username_enabled BOOLEAN NOT NULL DEFAULT true`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_password_enabled BOOLEAN NOT NULL DEFAULT true`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_auth_key_enabled BOOLEAN NOT NULL DEFAULT true`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_fields JSONB`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_options JSONB`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_unlimited_stock BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false`)

  await query(
    `CREATE TABLE IF NOT EXISTS product_promotions (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      title TEXT,
      discount_percent INTEGER,
      discount_amount_points INTEGER,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_promotions_product_idx ON product_promotions (product_id)`)
  await query(`CREATE INDEX IF NOT EXISTS product_promotions_active_idx ON product_promotions (is_active, starts_at, ends_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS discount_coupons (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT,
      discount_percent INTEGER,
      discount_amount_points INTEGER,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS discount_coupons_active_idx ON discount_coupons (is_active, expires_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS wallets (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS topups (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      amount_points INTEGER,
      method TEXT,
      provider TEXT,
      provider_ref TEXT,
      reference TEXT,
      approved_by BIGINT REFERENCES users(id),
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )

  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS topups_method_reference_uq
     ON topups (method, reference)
     WHERE reference IS NOT NULL`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      points INTEGER NOT NULL,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ref_type, ref_id)
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS webhook_logs (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ,
      payload TEXT NOT NULL,
      UNIQUE (provider, event_id)
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS coupons (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      points INTEGER NOT NULL,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id BIGSERIAL PRIMARY KEY,
      coupon_id BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (coupon_id, user_id)
    )`,
  )

  await query('CREATE INDEX IF NOT EXISTS coupon_redemptions_user_idx ON coupon_redemptions (user_id)')
  await query('CREATE INDEX IF NOT EXISTS coupons_active_idx ON coupons (is_active, expires_at)')

  await query(
    `CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_points INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_points INTEGER`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount_points INTEGER`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount_points INTEGER`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ref TEXT`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_ref_unique_idx ON orders (ref) WHERE ref IS NOT NULL`)
  // Backfill refs for existing orders
  const nullRefOrders = await all(`SELECT id FROM orders WHERE ref IS NULL LIMIT 5000`)
  for (const o of nullRefOrders) {
    await query(`UPDATE orders SET ref = $2 WHERE id = $1 AND ref IS NULL`, [o.id, generateOrderRef()])
  }

  await query(
    `CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL,
      unit_price_points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_original_points INTEGER`)
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS promo_discount_points INTEGER`)
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS coupon_discount_points INTEGER`)
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_option JSONB`)

  await query(
    `CREATE TABLE IF NOT EXISTS digital_stock_items (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      reserved_order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reserved_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    )`,
  )

  await query(`CREATE INDEX IF NOT EXISTS digital_stock_items_product_status_idx ON digital_stock_items (product_id, status)`)

  await query(
    `CREATE TABLE IF NOT EXISTS stock_pools (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'digital_code',
      quantity_remaining INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS stock_pools_active_idx ON stock_pools (is_active, id)`)
  await query(`CREATE INDEX IF NOT EXISTS stock_pools_kind_idx ON stock_pools (kind, id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS stock_pool_items (
      id BIGSERIAL PRIMARY KEY,
      pool_id BIGINT NOT NULL REFERENCES stock_pools(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      reserved_order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reserved_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS stock_pool_items_pool_status_idx ON stock_pool_items (pool_id, status, id)`)
  await query(`CREATE INDEX IF NOT EXISTS stock_pool_items_reserved_order_item_idx ON stock_pool_items (reserved_order_item_id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS product_option_items (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      option_id TEXT NOT NULL,
      label TEXT NOT NULL,
      value_text TEXT,
      price_points INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS product_option_items_product_option_id_uq
     ON product_option_items (product_id, option_id)`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_option_items_product_sort_idx ON product_option_items (product_id, sort_order, id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS product_option_stock_bindings (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_option_id TEXT,
      pool_id BIGINT NOT NULL REFERENCES stock_pools(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS product_option_stock_bindings_uq
     ON product_option_stock_bindings (product_id, COALESCE(product_option_id, ''))`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_option_stock_bindings_pool_idx ON product_option_stock_bindings (pool_id)`)
  await query(`CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id)`)
  await query(`CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS deliveries (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      stock_item_id BIGINT REFERENCES digital_stock_items(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending_claim',
      payload_masked TEXT,
      payload TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_at TIMESTAMPTZ
    )`,
  )

  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS mystery_stock_item_id BIGINT`)
  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS stock_pool_item_id BIGINT`)
  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_name TEXT`)

  await query(
    `CREATE TABLE IF NOT EXISTS farm_requests (
      id BIGSERIAL PRIMARY KEY,
      delivery_id BIGINT NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      username TEXT,
      password TEXT,
      auth_key TEXT,
      form_data JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      cancel_note TEXT,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      fulfilled_at TIMESTAMPTZ
    )`,
  )

  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS cancel_note TEXT`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS uid TEXT`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS uid_confirmed BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS form_data JSONB`)

  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS assigned_booster_id BIGINT REFERENCES users(id)`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS product_option JSONB`)

  await query(`CREATE INDEX IF NOT EXISTS farm_requests_status_idx ON farm_requests (status, created_at)`)
  await query(`CREATE INDEX IF NOT EXISTS farm_requests_assignee_idx ON farm_requests (assigned_booster_id, status, created_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS booster_action_logs (
      id BIGSERIAL PRIMARY KEY,
      booster_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      farm_request_id BIGINT NOT NULL REFERENCES farm_requests(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS booster_action_logs_booster_idx ON booster_action_logs (booster_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS booster_action_logs_request_idx ON booster_action_logs (farm_request_id, created_at DESC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
      first_response_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ
    )`,
  )
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ`)
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`)
  await query(`CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id, status, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON support_tickets (assigned_to, status, created_at DESC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id BIGSERIAL PRIMARY KEY,
      ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB`)
  await query(`CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id, created_at ASC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS mystery_box_prizes (
      id BIGSERIAL PRIMARY KEY,
      box_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      prize_kind TEXT NOT NULL DEFAULT 'product',
      prize_product_id BIGINT REFERENCES products(id),
      weight INTEGER NOT NULL DEFAULT 1,
      remaining INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )

  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_kind TEXT NOT NULL DEFAULT 'product'`)
  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_product_id BIGINT`)
  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_name TEXT`)
  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_image_url TEXT`)
  await query(`ALTER TABLE mystery_box_prizes ALTER COLUMN prize_product_id DROP NOT NULL`)
  await query(`ALTER TABLE mystery_box_prizes ALTER COLUMN weight TYPE NUMERIC(12,4) USING weight::NUMERIC`)
  await query(`ALTER TABLE mystery_box_prizes ALTER COLUMN weight SET DEFAULT 1`)

  await query(`DROP INDEX IF EXISTS mystery_box_prizes_box_prize_uq`)
  await query(`DROP INDEX IF EXISTS mystery_box_prizes_box_kind_product_uq`)
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS mystery_box_prizes_box_kind_product_uq
     ON mystery_box_prizes (box_product_id, prize_kind, COALESCE(prize_product_id, -1), COALESCE(prize_name, ''))`,
  )
  await query(`CREATE INDEX IF NOT EXISTS mystery_box_prizes_box_active_idx ON mystery_box_prizes (box_product_id, is_active, remaining)`)

  await query(
    `CREATE TABLE IF NOT EXISTS mystery_box_stock_items (
      id BIGSERIAL PRIMARY KEY,
      box_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      prize_id BIGINT NOT NULL REFERENCES mystery_box_prizes(id) ON DELETE CASCADE,
      prize_product_id BIGINT REFERENCES products(id),
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      reserved_order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reserved_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    )`,
  )
  await query(`ALTER TABLE mystery_box_stock_items ADD COLUMN IF NOT EXISTS image_url TEXT`)

  await query(
    `CREATE INDEX IF NOT EXISTS mystery_box_stock_items_prize_status_idx
     ON mystery_box_stock_items (prize_id, status, id)`,
  )
  await query(
    `CREATE INDEX IF NOT EXISTS mystery_box_stock_items_box_status_idx
     ON mystery_box_stock_items (box_product_id, status, id)`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS workflow_automation_rules (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      action_type TEXT NOT NULL,
      action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS workflow_automation_rules_active_idx ON workflow_automation_rules (is_active, id)`) 

  await query(
    `CREATE TABLE IF NOT EXISTS workflow_automation_events (
      id BIGSERIAL PRIMARY KEY,
      rule_id BIGINT REFERENCES workflow_automation_rules(id) ON DELETE SET NULL,
      dedupe_key TEXT NOT NULL,
      ref_module TEXT NOT NULL,
      ref_id BIGINT,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS workflow_automation_events_dedupe_uq ON workflow_automation_events (dedupe_key)`)
  await query(`CREATE INDEX IF NOT EXISTS workflow_automation_events_created_idx ON workflow_automation_events (created_at DESC, id DESC)`)

  await query(`CREATE INDEX IF NOT EXISTS deliveries_user_status_idx ON deliveries (user_id, status)`)
  await query(`CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries (status)`)

  await query(
    `CREATE TABLE IF NOT EXISTS announcements (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      bg TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT true,
      push_to_inbox BOOLEAN NOT NULL DEFAULT false,
      sort_order INT NOT NULL DEFAULT 0,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS announcements_sort_idx ON announcements (sort_order ASC, id ASC)`)
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT ''`).catch(() => {})
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ`).catch(() => {})
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ`).catch(() => {})

  await query(
    `CREATE TABLE IF NOT EXISTS site_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      target_type TEXT NOT NULL DEFAULT 'global',
      target_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS site_messages_target_type_idx ON site_messages (target_type, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS site_messages_target_user_idx ON site_messages (target_user_id, created_at DESC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS site_message_reads (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id BIGINT NOT NULL REFERENCES site_messages(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, message_id)
    )`,
  )

  // ── Staff clock-in/out ──
  await query(
    `CREATE TABLE IF NOT EXISTS staff_clock_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
      clock_out TIMESTAMPTZ,
      auto_clock_out_at TIMESTAMPTZ,
      note TEXT
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS staff_clock_sessions_user_active_idx ON staff_clock_sessions (user_id, clock_out NULLS FIRST, clock_in DESC)`)
  await query(`ALTER TABLE staff_clock_sessions ADD COLUMN IF NOT EXISTS auto_clock_out_at TIMESTAMPTZ`)

  // ── Staff notifications ──
  await query(
    `CREATE TABLE IF NOT EXISTS staff_notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS staff_notifications_user_read_idx ON staff_notifications (user_id, is_read, created_at DESC)`)

  // ── Web Push subscriptions ──
  await query(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      keys_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)`)

  // ── Product Bundles ──
  await query(
    `CREATE TABLE IF NOT EXISTS product_bundles (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      bundle_price INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_hidden BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_bundles_active_idx ON product_bundles (is_active, is_hidden, sort_order)`)

  await query(
    `CREATE TABLE IF NOT EXISTS bundle_items (
      id BIGSERIAL PRIMARY KEY,
      bundle_id BIGINT NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      qty INTEGER NOT NULL DEFAULT 1,
      product_option_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS bundle_items_bundle_idx ON bundle_items (bundle_id, sort_order)`)

  await query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      notify_stock BOOLEAN NOT NULL DEFAULT true,
      notify_promo BOOLEAN NOT NULL DEFAULT true,
      notify_campaign BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, product_id)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS wishlist_items_product_idx ON wishlist_items (product_id, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      moderated_by BIGINT REFERENCES users(id),
      moderated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (order_item_id)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS product_reviews_product_status_idx ON product_reviews (product_id, status, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_campaigns (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      badge_text TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value INTEGER,
      quantity_limit INTEGER,
      quantity_used INTEGER NOT NULL DEFAULT 0,
      vip_early_access_tier TEXT,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_campaigns_active_idx ON growth_campaigns (is_active, starts_at, ends_at)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_campaign_targets (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES growth_campaigns(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id BIGINT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_campaign_targets_lookup_idx ON growth_campaign_targets (target_type, target_id, campaign_id)`)

  await query(`
    CREATE TABLE IF NOT EXISTS vip_tiers (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      threshold_points_spent INTEGER NOT NULL DEFAULT 0,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      priority_support BOOLEAN NOT NULL DEFAULT false,
      early_access_minutes INTEGER NOT NULL DEFAULT 0,
      badge_label TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      benefits_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS vip_user_snapshots (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tier_id BIGINT REFERENCES vip_tiers(id),
      points_spent INTEGER NOT NULL DEFAULT 0,
      next_tier_id BIGINT REFERENCES vip_tiers(id),
      next_threshold_points INTEGER,
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS order_discount_applications (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id BIGINT,
      source_code TEXT,
      label TEXT NOT NULL,
      amount_points INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS order_discount_applications_order_idx ON order_discount_applications (order_id, sort_order, id)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_notification_events (
      id BIGSERIAL PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      target_type TEXT,
      target_id BIGINT,
      audience_type TEXT NOT NULL DEFAULT 'direct',
      payload_json JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_notification_events_created_idx ON growth_notification_events (created_at DESC, id DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES growth_notification_events(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      site_message_id BIGINT REFERENCES site_messages(id) ON DELETE SET NULL,
      error_text TEXT,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, user_id, channel)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_notification_deliveries_user_idx ON growth_notification_deliveries (user_id, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wishlist_stock BOOLEAN NOT NULL DEFAULT true,
      wishlist_promo BOOLEAN NOT NULL DEFAULT true,
      campaigns BOOLEAN NOT NULL DEFAULT true,
      vip BOOLEAN NOT NULL DEFAULT true,
      reviews BOOLEAN NOT NULL DEFAULT true,
      push_enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  try {
    await migrateDigitalStockToPools()
  } catch (e) {
    console.error('[stock-migration] Failed (non-fatal):', e?.message ?? e)
  }
}

// ── Stock Unification: helpers ──

async function getOrCreateDefaultPoolTx(client, productId) {
  const pid = Number(productId)
  const existing = await client.query(
    `SELECT b.pool_id
     FROM product_option_stock_bindings b
     WHERE b.product_id = $1 AND b.product_option_id IS NULL
     LIMIT 1`,
    [pid],
  )
  if (existing.rows.length > 0) return Number(existing.rows[0].pool_id)

  const poolRes = await client.query(
    `INSERT INTO stock_pools (name, kind, is_active)
     VALUES ($1, 'digital_code', true)
     RETURNING id`,
    [`auto:product:${pid}`],
  )
  const poolId = poolRes.rows[0].id

  await client.query(
    `INSERT INTO product_option_stock_bindings (product_id, product_option_id, pool_id)
     VALUES ($1, NULL, $2)
     ON CONFLICT (product_id, COALESCE(product_option_id, ''))
     DO UPDATE SET pool_id = EXCLUDED.pool_id`,
    [pid, poolId],
  )
  return Number(poolId)
}

async function getDefaultPoolId(productId) {
  const pid = Number(productId)
  const row = await get(
    `SELECT b.pool_id
     FROM product_option_stock_bindings b
     WHERE b.product_id = $1 AND b.product_option_id IS NULL
     LIMIT 1`,
    [pid],
  )
  return row ? Number(row.pool_id) : null
}

async function findProductIdByPoolItemId(client, itemId) {
  const row = await client.query(
    `SELECT b.product_id
     FROM stock_pool_items spi
     JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
     WHERE spi.id = $1
     LIMIT 1`,
    [itemId],
  )
  return row.rows?.[0]?.product_id != null ? Number(row.rows[0].product_id) : null
}

async function recountProductStockFromPools(client, productId) {
  const pid = Number(productId)
  await client.query(
    `UPDATE products SET stock = COALESCE((
       SELECT COUNT(*)::int
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE b.product_id = $1 AND spi.status = 'available'
     ), 0)
     WHERE id = $1`,
    [pid],
  )
}

export async function migrateDigitalStockToPools() {
  const productsToMigrate = await all(
    `SELECT DISTINCT dsi.product_id
     FROM digital_stock_items dsi
     WHERE NOT EXISTS (
       SELECT 1 FROM product_option_stock_bindings b
       WHERE b.product_id = dsi.product_id AND b.product_option_id IS NULL
     )`,
  )
  if (productsToMigrate.length === 0) return { migrated: 0, products: 0 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let totalMigrated = 0
    for (const row of productsToMigrate) {
      const pid = row.product_id

      const poolRes = await client.query(
        `INSERT INTO stock_pools (name, kind, is_active)
         VALUES ($1, 'digital_code', true)
         RETURNING id`,
        [`auto:product:${pid}`],
      )
      const poolId = poolRes.rows[0].id

      await client.query(
        `INSERT INTO product_option_stock_bindings (product_id, product_option_id, pool_id)
         VALUES ($1, NULL, $2)
         ON CONFLICT (product_id, COALESCE(product_option_id, ''))
         DO NOTHING`,
        [pid, poolId],
      )

      const copyRes = await client.query(
        `INSERT INTO stock_pool_items (pool_id, payload, status, reserved_order_item_id, created_at, reserved_at, delivered_at)
         SELECT $1, payload, status, reserved_order_item_id, created_at, reserved_at, delivered_at
         FROM digital_stock_items
         WHERE product_id = $2`,
        [poolId, pid],
      )
      totalMigrated += copyRes.rowCount || 0
    }

    await client.query('COMMIT')
    console.log(`[stock-migration] Migrated ${totalMigrated} items across ${productsToMigrate.length} products`)
    return { migrated: totalMigrated, products: productsToMigrate.length }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

function pickWeightedIndex(rows, rand01) {
  const weights = rows.map((r) => {
    const effective = Number(r?.effective_weight)
    if (Number.isFinite(effective)) return Math.max(0, effective)
    return Math.max(0, Number(r?.weight ?? 0))
  })
  const total = weights.reduce((a, b) => a + b, 0)
  if (!Number.isFinite(total) || total <= 0) return -1
  let r = rand01 * total
  for (let i = 0; i < rows.length; i++) {
    r -= weights[i]
    if (r < 0) return i
  }
  return rows.length - 1
}

const MYSTERY_STOCK_FACTOR_FLOOR = 0.05
const MYSTERY_DEPTH_FACTOR_FLOOR = 0.02

// ── Reusable SQL fragment: mystery box available stock (excludes salt) ──
const MYSTERY_AVAILABLE_STOCK_JOIN = `
  LEFT JOIN (
    SELECT mbp.box_product_id AS product_id,
           SUM(
             CASE
               WHEN mbp.is_active = true AND mbp.weight > 0 AND mbp.remaining > 0 AND mbp.prize_kind = 'product'
                 THEN LEAST(mbp.remaining,
                           COALESCE((SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available'), 0)
                 )
               WHEN mbp.is_active = true AND mbp.weight > 0 AND mbp.remaining > 0 AND mbp.prize_kind = 'linked_product'
                 THEN LEAST(mbp.remaining,
                           COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
                 )
               ELSE 0
             END
           )::int AS available_stock
    FROM mystery_box_prizes mbp
    GROUP BY mbp.box_product_id
  ) m ON m.product_id = p.id`

// ── Mystery box effective weight calculation (shared between purchase + simulate) ──
function computeMysteryEffectiveWeights(prizes) {
  return prizes.map((row) => {
    const kind = String(row?.prize_kind || 'product')
    const weight = Math.max(0, Number(row?.weight || 0))
    const remaining = Math.max(0, Number(row?.remaining || 0))
    const available = Math.max(0, Number(row?.prize_available_stock || 0))
    const drawable = kind === 'salt' ? remaining : Math.min(remaining, available)
    const stockFactor = kind === 'salt' ? 1 : Math.min(1, available / Math.max(1, remaining))
    const depthFactor = Math.log2(drawable + 1)
    const effectiveWeight = drawable > 0
      ? weight * Math.max(MYSTERY_STOCK_FACTOR_FLOOR, stockFactor) * Math.max(MYSTERY_DEPTH_FACTOR_FLOOR, depthFactor)
      : 0
    return {
      ...row,
      effective_weight: Number(effectiveWeight.toFixed(6)),
      drawable_count: drawable,
    }
  })
}

// ── Draw helpers for each prize kind ──
async function drawSaltPrize(client, chosen) {
  await client.query(
    `UPDATE mystery_box_prizes SET remaining = remaining - 1, updated_at = now() WHERE id = $1`,
    [Number(chosen.id)],
  )
  chosen.remaining = Number(chosen.remaining) - 1
  return { kind: 'salt', prize_name: chosen.prize_name || null }
}

async function drawLinkedProductPrize(client, chosen, { uid, orderId, orderItemId, boxId }) {
  const prizeProductId = Number(chosen.prize_product_id)
  if (!Number.isFinite(prizeProductId) || prizeProductId <= 0) {
    return null // caller should skip
  }

  const linkedPoolBinding = await client.query(
    `SELECT pool_id FROM product_option_stock_bindings
     WHERE product_id = $1 AND product_option_id IS NULL LIMIT 1`,
    [prizeProductId],
  )
  const linkedPoolId = linkedPoolBinding.rows?.[0]?.pool_id != null ? Number(linkedPoolBinding.rows[0].pool_id) : null

  let stockRes = { rows: [], rowCount: 0 }
  if (Number.isFinite(linkedPoolId)) {
    stockRes = await client.query(
      `SELECT id, payload
       FROM stock_pool_items
       WHERE pool_id = $1 AND status = 'available'
       ORDER BY id ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [linkedPoolId],
    )
  }

  if ((stockRes.rowCount ?? 0) < 1) {
    // stock exhausted — set remaining=0 but keep is_active for admin to refill
    await client.query(
      `UPDATE mystery_box_prizes SET remaining = 0, updated_at = now() WHERE id = $1`,
      [Number(chosen.id)],
    )
    chosen.remaining = 0
    return null // caller should retry
  }

  const stockId = stockRes.rows[0].id
  const payload = String(stockRes.rows[0].payload ?? '')
  const masked = maskPayload(payload)

  const dRes = await client.query(
    `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_pool_item_id, status, payload_masked, payload, delivery_name)
     VALUES ($1, $2, $3, $4, $5, 'pending_claim', $6, $7, $8)
     RETURNING id`,
    [uid, orderId, orderItemId, prizeProductId, stockId, masked, payload, chosen.prize_name || chosen.prize_product_name || null],
  )

  await client.query(
    `UPDATE stock_pool_items SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now() WHERE id = $1`,
    [stockId, orderItemId],
  )
  await recountProductAvailableStock(client, prizeProductId)

  await client.query(
    `UPDATE mystery_box_prizes SET remaining = remaining - 1, updated_at = now() WHERE id = $1`,
    [Number(chosen.id)],
  )
  chosen.remaining = Number(chosen.remaining) - 1

  return {
    kind: 'linked_product',
    prize_name: chosen.prize_name || null,
    prize_product_id: prizeProductId,
    prize_product_name: chosen.prize_product_name || null,
    prize_image_url: chosen.prize_image_url || chosen.prize_product_image_url || null,
    delivery: { id: dRes.rows[0].id, masked },
  }
}

async function drawProductPrize(client, chosen, { uid, orderId, orderItemId, boxId }) {
  const prizeProductId = Number(chosen.prize_product_id)

  const stockRes = await client.query(
    `SELECT id, payload, image_url
     FROM mystery_box_stock_items
     WHERE prize_id = $1 AND box_product_id = $2 AND status = 'available'
     ORDER BY id ASC
     FOR UPDATE SKIP LOCKED
     LIMIT 1`,
    [Number(chosen.id), boxId],
  )

  if ((stockRes.rowCount ?? 0) < 1) {
    // stock exhausted — set remaining=0 but keep is_active for admin to refill
    await client.query(
      `UPDATE mystery_box_prizes SET remaining = 0, updated_at = now() WHERE id = $1`,
      [Number(chosen.id)],
    )
    chosen.remaining = 0
    return null // caller should retry
  }

  const stockId = stockRes.rows[0].id
  const payload = String(stockRes.rows[0].payload ?? '')
  const masked = maskPayload(payload)

  const dRes = await client.query(
    `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, mystery_stock_item_id, status, payload_masked, payload, delivery_name)
     VALUES ($1, $2, $3, $4, $5, 'pending_claim', $6, $7, $8)
     RETURNING id`,
    [
      uid,
      orderId,
      orderItemId,
      prizeProductId > 0 ? prizeProductId : boxId,
      stockId,
      masked,
      payload,
      chosen.prize_name || chosen.prize_product_name || null,
    ],
  )

  await client.query(
    `UPDATE mystery_box_stock_items SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now() WHERE id = $1`,
    [stockId, orderItemId],
  )

  await client.query(
    `UPDATE mystery_box_prizes SET remaining = remaining - 1, updated_at = now() WHERE id = $1`,
    [Number(chosen.id)],
  )
  chosen.remaining = Number(chosen.remaining) - 1

  const stockImageUrl = stockRes.rows[0]?.image_url || null
  return {
    kind: 'product',
    prize_name: chosen.prize_name || null,
    prize_product_id: prizeProductId,
    prize_product_name: chosen.prize_product_name || null,
    prize_image_url: stockImageUrl || chosen.prize_image_url || chosen.prize_product_image_url || null,
    delivery: { id: dRes.rows[0].id, masked },
  }
}

function normalizeWorkflowTriggerType(value) {
  const v = String(value || '').trim().toLowerCase()
  if (!['support_unassigned_overdue', 'farm_unassigned_overdue'].includes(v)) throw new Error('invalid_trigger_type')
  return v
}

function normalizeWorkflowActionType(value) {
  const v = String(value || '').trim().toLowerCase()
  if (v !== 'create_notification') throw new Error('invalid_action_type')
  return v
}

function normalizeWorkflowConfig(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  return raw
}

export async function listMysteryBoxPrizesPublic(boxProductId) {
  const bid = Number(boxProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  const rows = await all(
    `SELECT mbp.id, mbp.prize_kind, mbp.prize_name, mbp.prize_image_url, mbp.weight, mbp.remaining, mbp.is_active,
            p.name AS prize_product_name, p.image_url AS prize_product_image_url
     FROM mystery_box_prizes mbp
     LEFT JOIN products p ON p.id = mbp.prize_product_id
     WHERE mbp.box_product_id = $1 AND mbp.is_active = true AND mbp.weight > 0
     ORDER BY mbp.weight DESC`,
    [bid],
  )
  const totalWeight = rows.reduce((s, r) => s + Number(r.weight || 0), 0)
  return rows.map((r) => ({
    id: r.id,
    prize_kind: r.prize_kind,
    prize_name: r.prize_name || r.prize_product_name || (r.prize_kind === 'salt' ? 'เกลือ' : 'ของรางวัล'),
    prize_image_url: r.prize_image_url || r.prize_product_image_url || null,
    weight: Number(r.weight),
    remaining: r.prize_kind === 'salt' ? null : Number(r.remaining),
    chance_percent: totalWeight > 0 ? (Number(r.weight) / totalWeight) * 100 : 0,
  }))
}

export async function listMysteryBoxRecentWins(boxProductId, { limit = 20 } = {}) {
  const bid = Number(boxProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  return all(
    `SELECT d.delivery_name, d.created_at,
            u.username,
            p.image_url AS prize_image_url
     FROM deliveries d
     JOIN orders o ON o.id = d.order_id
     JOIN users u ON u.id = d.user_id
     LEFT JOIN products p ON p.id = d.product_id
     WHERE o.id IN (
       SELECT DISTINCT oi.order_id FROM order_items oi WHERE oi.product_id = $1
     )
     ORDER BY d.created_at DESC
     LIMIT $2`,
    [bid, limit],
  )
}

export async function adminListMysteryBoxPrizes({ boxProductId, limit = 200, offset = 0 } = {}) {
  const bid = Number(boxProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  return all(
    `SELECT mbp.id, mbp.box_product_id, mbp.prize_kind, mbp.prize_product_id, mbp.prize_name, mbp.prize_image_url,
            mbp.weight, mbp.remaining, mbp.is_active, mbp.created_at, mbp.updated_at,
            p.name AS prize_product_name, p.image_url AS prize_product_image_url,
            CASE
              WHEN mbp.prize_kind = 'linked_product'
                THEN COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
              ELSE (SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available')
            END AS prize_available_stock
     FROM mystery_box_prizes mbp
     LEFT JOIN products p ON p.id = mbp.prize_product_id
     WHERE mbp.box_product_id = $1
     ORDER BY mbp.id DESC
     LIMIT $2 OFFSET $3`,
    [bid, limit, offset],
  )
}

async function recountMysteryPrizeRemainingFromStock(client, prizeId) {
  const pid = Number(prizeId)
  if (!Number.isFinite(pid) || pid <= 0) return
  await client.query(
    `UPDATE mystery_box_prizes
     SET remaining = COALESCE((
       SELECT COUNT(*)::int
       FROM mystery_box_stock_items msi
       WHERE msi.prize_id = $1
         AND msi.status = 'available'
     ), 0),
         updated_at = now()
     WHERE id = $1
       AND prize_kind = 'product'`,
    [pid],
  )
}

export async function adminAddMysteryBoxPrizeStock({ boxProductId, prizeId, prizeProductId, items }) {
  const bid = Number(boxProductId)
  const pid = Number(prizeId)
  const pp = prizeProductId == null || prizeProductId === '' ? null : Number(prizeProductId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_prize_id')
  if (pp != null && (!Number.isFinite(pp) || pp <= 0)) throw new Error('invalid_prize_product_id')

  const lines = (items || [])
    .map((x) => {
      if (x && typeof x === 'object' && !Array.isArray(x)) {
        const payload = String(x.payload ?? '').trim()
        return payload.length > 0 ? { payload, image_url: x.image_url || null } : null
      }
      const s = String(x ?? '').trim()
      return s.length > 0 ? s : null
    })
    .filter(Boolean)
  if (lines.length === 0) return { inserted: 0 }

  const prize = await get('SELECT id, box_product_id, prize_product_id, prize_kind FROM mystery_box_prizes WHERE id=$1', [pid])
  if (!prize) throw new Error('prize_not_found')
  if (Number(prize.box_product_id) !== bid) throw new Error('prize_box_mismatch')
  const kind = String(prize.prize_kind || 'product')
  if (kind !== 'product') throw new Error('invalid_prize_kind')
  const effectivePrizeProductId = prize.prize_product_id == null ? null : Number(prize.prize_product_id)
  if (effectivePrizeProductId != null && (!Number.isFinite(effectivePrizeProductId) || effectivePrizeProductId <= 0)) throw new Error('invalid_prize_product_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    for (const item of lines) {
      const payload = typeof item === 'string' ? item : String(item?.payload ?? '').trim()
      const imageUrl = typeof item === 'object' && item?.image_url ? String(item.image_url).trim() : null
      await client.query(
        `INSERT INTO mystery_box_stock_items (box_product_id, prize_id, prize_product_id, payload, image_url, status)
         VALUES ($1, $2, $3, $4, $5, 'available')`,
        [bid, pid, effectivePrizeProductId, payload, imageUrl || null],
      )
    }
    await recountMysteryPrizeRemainingFromStock(client, pid)
    await client.query('COMMIT')
    return { inserted: lines.length }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminListMysteryBoxPrizeStockItems({ prizeId, limit = 200, offset = 0 } = {}) {
  const pid = Number(prizeId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_prize_id')
  return all(
    `SELECT id, box_product_id, prize_id, prize_product_id, status, payload, image_url,
            created_at, reserved_at, delivered_at, reserved_order_item_id
     FROM mystery_box_stock_items
     WHERE prize_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [pid, limit, offset],
  )
}

export async function adminUpdateMysteryBoxPrizeStockItem({ id, status, image_url }) {
  const sid = Number(id)
  if (!Number.isFinite(sid) || sid <= 0) throw new Error('invalid_id')
  const st = String(status || '')
  if (!['available', 'disabled'].includes(st)) throw new Error('invalid_status')
  const imgUrl = image_url === undefined ? undefined : (image_url ? String(image_url).trim() : null)
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const setClauses = ['status = $2']
    const params = [sid, st]
    if (imgUrl !== undefined) {
      params.push(imgUrl || null)
      setClauses.push(`image_url = $${params.length}`)
    }
    const res = await client.query(
      `UPDATE mystery_box_stock_items
       SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING id, box_product_id, prize_id, prize_product_id, status, payload, image_url, created_at, reserved_at, delivered_at, reserved_order_item_id`,
      params,
    )
    if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
    await recountMysteryPrizeRemainingFromStock(client, Number(res.rows[0]?.prize_id))
    await client.query('COMMIT')
    return res.rows[0]
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminDeleteMysteryBoxPrizeStockItem(id) {
  const sid = Number(id)
  if (!Number.isFinite(sid) || sid <= 0) throw new Error('invalid_id')
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const res = await client.query('DELETE FROM mystery_box_stock_items WHERE id=$1 RETURNING prize_id', [sid])
    if ((res.rowCount ?? 0) > 0) {
      await recountMysteryPrizeRemainingFromStock(client, Number(res.rows[0]?.prize_id))
    }
    await client.query('COMMIT')
    return { ok: true, deleted: res.rowCount ?? 0 }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminCreateMysteryBoxPrize({ boxProductId, prizeKind, prizeProductId, prizeName, prizeImageUrl, weight, remaining, isActive }) {
  const bid = Number(boxProductId)
  const kind = typeof prizeKind === 'string' && prizeKind.trim() ? prizeKind.trim() : 'product'
  const pid = prizeProductId == null || prizeProductId === '' ? null : Number(prizeProductId)
  const rawPrizeName = String(prizeName || '').trim()
  const name = rawPrizeName.slice(0, 120)
  const w = Number(weight)
  const rem = Number(remaining)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  if (!['product', 'salt', 'linked_product'].includes(kind)) throw new Error('invalid_prize_kind')
  if (kind === 'salt' && !name) throw new Error('invalid_prize_name')
  if (kind === 'linked_product') {
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_prize_product_id')
  }
  if (!Number.isFinite(w) || w <= 0) throw new Error('invalid_weight')
  if (kind !== 'product' && (!Number.isFinite(rem) || rem < 0)) throw new Error('invalid_remaining')
  const normalizedWeight = Number(w.toFixed(4))
  const normalizedRemaining = kind === 'product' ? 0 : Math.trunc(rem)

  const imgUrl = typeof prizeImageUrl === 'string' && prizeImageUrl.trim() ? prizeImageUrl.trim() : null
  const res = await query(
    `INSERT INTO mystery_box_prizes (box_product_id, prize_kind, prize_product_id, prize_name, prize_image_url, weight, remaining, is_active, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
     RETURNING id`,
    [bid, kind, kind === 'salt' ? null : pid, name || null, imgUrl, normalizedWeight, normalizedRemaining, Boolean(isActive)],
  )
  return res.rows[0].id
}

export async function adminUpdateMysteryBoxPrize({ id, prizeName, prizeImageUrl, weight, remaining, isActive }) {
  const mid = Number(id)
  const name = String(prizeName || '').trim().slice(0, 120)
  const w = Number(weight)
  const rem = Number(remaining)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  if (!Number.isFinite(w) || w <= 0) throw new Error('invalid_weight')
  const normalizedWeight = Number(w.toFixed(4))

  const existing = await get('SELECT id, prize_kind, remaining FROM mystery_box_prizes WHERE id=$1', [mid])
  if (!existing) throw new Error('not_found')
  const kind = String(existing.prize_kind || '')
  if (kind === 'salt' && !name) throw new Error('invalid_prize_name')
  if (kind !== 'product' && (!Number.isFinite(rem) || rem < 0)) throw new Error('invalid_remaining')
  const normalizedRemaining = kind === 'product' ? Math.max(0, Number(existing.remaining || 0)) : Math.trunc(rem)

  const imgUrl = prizeImageUrl === undefined ? undefined : (typeof prizeImageUrl === 'string' && prizeImageUrl.trim() ? prizeImageUrl.trim() : null)
  const imgClause = imgUrl !== undefined ? ', prize_image_url=$6' : ''
  const imgParams = imgUrl !== undefined ? [imgUrl] : []
  await query(
    `UPDATE mystery_box_prizes
     SET prize_name=$2, weight=$3, remaining=$4, is_active=$5${imgClause}, updated_at=now()
     WHERE id=$1`,
    [mid, name || null, normalizedWeight, normalizedRemaining, Boolean(isActive), ...imgParams],
  )
  return get(
    `SELECT id, box_product_id, prize_kind, prize_product_id, prize_name, prize_image_url, weight, remaining, is_active, created_at, updated_at
     FROM mystery_box_prizes
     WHERE id=$1`,
    [mid],
  )
}

export async function adminDeleteMysteryBoxPrize(id) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  await query('DELETE FROM mystery_box_prizes WHERE id=$1', [mid])
  return { ok: true }
}

export async function adminSimulateMysteryBox({ boxProductId, qty = 1, trials = 1000 } = {}) {
  const bid = Number(boxProductId)
  const q = Number(qty)
  const t = Number(trials)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_box_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 20) throw new Error('invalid_qty')
  if (!Number.isFinite(t) || t <= 0 || t > 20000) throw new Error('invalid_trials')

  const prizes = await all(
    `SELECT mbp.id, mbp.prize_kind, mbp.prize_product_id, mbp.prize_name, mbp.weight, mbp.remaining, mbp.is_active,
            p.name AS prize_product_name,
            CASE
              WHEN mbp.prize_kind = 'linked_product'
                THEN COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
              ELSE (SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available')
            END AS prize_available_stock
     FROM mystery_box_prizes mbp
     LEFT JOIN products p ON p.id = mbp.prize_product_id
     WHERE mbp.box_product_id = $1
       AND mbp.is_active = true
       AND mbp.remaining > 0
       AND mbp.weight > 0
     ORDER BY mbp.id ASC`,
    [bid],
  )
  if (!Array.isArray(prizes) || prizes.length < 1) throw new Error('out_of_stock')

  const weightedRows = computeMysteryEffectiveWeights(prizes)
  const totalEffectiveWeight = weightedRows.reduce((sum, row) => sum + Math.max(0, Number(row?.effective_weight || 0)), 0)
  if (!Number.isFinite(totalEffectiveWeight) || totalEffectiveWeight <= 0) throw new Error('out_of_stock')

  const tally = new Map()
  for (const row of weightedRows) tally.set(Number(row.id), 0)

  for (let i = 0; i < t; i += 1) {
    for (let draw = 0; draw < q; draw += 1) {
      const idx = pickWeightedIndex(weightedRows, Math.random())
      if (idx < 0) continue
      const chosen = weightedRows[idx]
      const key = Number(chosen.id)
      tally.set(key, Number(tally.get(key) || 0) + 1)
    }
  }

  const totalDraws = Math.max(1, t * q)
  const results = weightedRows.map((row) => {
    const hits = Number(tally.get(Number(row.id)) || 0)
    const probability = (hits / totalDraws) * 100
    return {
      prize_id: Number(row.id),
      prize_kind: String(row.prize_kind || 'product'),
      prize_product_id: row.prize_product_id == null ? null : Number(row.prize_product_id),
      prize_name: row.prize_name || null,
      prize_product_name: row.prize_product_name || null,
      weight: Number(row.weight || 0),
      remaining: Number(row.remaining || 0),
      available_stock: Number(row.prize_available_stock || 0),
      effective_weight: Number(row.effective_weight || 0),
      drawable_count: Number(row.drawable_count || 0),
      hits,
      probability_percent: Number(probability.toFixed(4)),
      expected_hits: Number(((totalDraws * Number(row.effective_weight || 0)) / Math.max(1, totalEffectiveWeight)).toFixed(2)),
    }
  })

  return {
    box_product_id: bid,
    qty_per_trial: Math.trunc(q),
    trials: Math.trunc(t),
    total_draws: totalDraws,
    results,
  }
}

export async function adminListWorkflowAutomationRules({ limit = 100, offset = 0 } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  return all(
    `SELECT id, name, trigger_type, trigger_config, action_type, action_config,
            is_active, last_run_at, created_at, updated_at
     FROM workflow_automation_rules
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}

export async function adminCreateWorkflowAutomationRule({ name, triggerType, triggerConfig, actionType, actionConfig, isActive } = {}) {
  const n = String(name || '').trim()
  if (!n) throw new Error('invalid_name')
  const trigger = normalizeWorkflowTriggerType(triggerType)
  const action = normalizeWorkflowActionType(actionType)
  const tConfig = normalizeWorkflowConfig(triggerConfig)
  const aConfig = normalizeWorkflowConfig(actionConfig)

  const res = await query(
    `INSERT INTO workflow_automation_rules (name, trigger_type, trigger_config, action_type, action_config, is_active, updated_at)
     VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, now())
     RETURNING id`,
    [n, trigger, JSON.stringify(tConfig), action, JSON.stringify(aConfig), isActive == null ? true : Boolean(isActive)],
  )
  return Number(res.rows?.[0]?.id || 0)
}

export async function adminUpdateWorkflowAutomationRule({ id, name, triggerType, triggerConfig, actionType, actionConfig, isActive } = {}) {
  const rid = Number(id)
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('invalid_id')
  const existing = await get('SELECT id, trigger_type, action_type FROM workflow_automation_rules WHERE id = $1', [rid])
  if (!existing) throw new Error('not_found')

  const nextName = name == null ? null : String(name).trim()
  if (nextName != null && !nextName) throw new Error('invalid_name')
  const trigger = triggerType == null ? String(existing.trigger_type || '') : normalizeWorkflowTriggerType(triggerType)
  const action = actionType == null ? String(existing.action_type || '') : normalizeWorkflowActionType(actionType)
  const tConfig = triggerConfig == null ? null : normalizeWorkflowConfig(triggerConfig)
  const aConfig = actionConfig == null ? null : normalizeWorkflowConfig(actionConfig)

  await query(
    `UPDATE workflow_automation_rules
     SET name = COALESCE($2, name),
         trigger_type = $3,
         trigger_config = COALESCE($4::jsonb, trigger_config),
         action_type = $5,
         action_config = COALESCE($6::jsonb, action_config),
         is_active = COALESCE($7, is_active),
         updated_at = now()
     WHERE id = $1`,
    [rid, nextName, trigger, tConfig == null ? null : JSON.stringify(tConfig), action, aConfig == null ? null : JSON.stringify(aConfig), isActive == null ? null : Boolean(isActive)],
  )

  return get(
    `SELECT id, name, trigger_type, trigger_config, action_type, action_config,
            is_active, last_run_at, created_at, updated_at
     FROM workflow_automation_rules
     WHERE id = $1`,
    [rid],
  )
}

export async function adminDeleteWorkflowAutomationRule(id) {
  const rid = Number(id)
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('invalid_id')
  const res = await query('DELETE FROM workflow_automation_rules WHERE id = $1', [rid])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}

export async function adminListWorkflowAutomationEvents({ limit = 100 } = {}) {
  const lim = Number(limit)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  return all(
    `SELECT id, rule_id, dedupe_key, ref_module, ref_id, severity, title, message, created_at
     FROM workflow_automation_events
     ORDER BY id DESC
     LIMIT $1`,
    [lim],
  )
}

export async function adminRunWorkflowAutomationRules({ limitPerRule = 20 } = {}) {
  const lim = Number(limitPerRule)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 200) throw new Error('invalid_limit')
  const rules = await all(
    `SELECT id, name, trigger_type, trigger_config, action_type, action_config
     FROM workflow_automation_rules
     WHERE is_active = true
     ORDER BY id ASC`,
  )

  let createdEvents = 0
  let matched = 0
  for (const rule of rules) {
    const triggerType = String(rule?.trigger_type || '')
    const triggerConfig = rule?.trigger_config && typeof rule.trigger_config === 'object' ? rule.trigger_config : {}
    const actionConfig = rule?.action_config && typeof rule.action_config === 'object' ? rule.action_config : {}
    const thresholdMinutes = Math.max(1, Number(triggerConfig?.minutes || 30))
    const severity = ['low', 'medium', 'high'].includes(String(actionConfig?.severity || '').toLowerCase())
      ? String(actionConfig.severity).toLowerCase()
      : 'medium'

    if (triggerType === 'support_unassigned_overdue') {
      const rows = await all(
        `SELECT id, subject, status, created_at
         FROM support_tickets
         WHERE status IN ('open', 'pending')
           AND assigned_to IS NULL
           AND created_at <= now() - ($1::int * interval '1 minute')
         ORDER BY created_at ASC
         LIMIT $2`,
        [Math.trunc(thresholdMinutes), Math.trunc(lim)],
      )
      matched += rows.length
      for (const row of rows) {
        const dedupeKey = `rule:${rule.id}:support:${row.id}:${String(row.status || 'open')}`
        const ins = await query(
          `INSERT INTO workflow_automation_events (rule_id, dedupe_key, ref_module, ref_id, severity, title, message)
           VALUES ($1, $2, 'support', $3, $4, $5, $6)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            Number(rule.id),
            dedupeKey,
            Number(row.id),
            severity,
            `Support #${row.id} unassigned over ${Math.trunc(thresholdMinutes)}m`,
            row.subject ? String(row.subject) : null,
          ],
        )
        if ((ins.rowCount ?? 0) > 0) createdEvents += 1
      }
    }

    if (triggerType === 'farm_unassigned_overdue') {
      const rows = await all(
        `SELECT id, status, created_at
         FROM farm_requests
         WHERE status = 'pending'
           AND assigned_booster_id IS NULL
           AND created_at <= now() - ($1::int * interval '1 minute')
         ORDER BY created_at ASC
         LIMIT $2`,
        [Math.trunc(thresholdMinutes), Math.trunc(lim)],
      )
      matched += rows.length
      for (const row of rows) {
        const dedupeKey = `rule:${rule.id}:farm:${row.id}:${String(row.status || 'pending')}`
        const ins = await query(
          `INSERT INTO workflow_automation_events (rule_id, dedupe_key, ref_module, ref_id, severity, title, message)
           VALUES ($1, $2, 'fulfillment', $3, $4, $5, $6)
           ON CONFLICT (dedupe_key) DO NOTHING`,
          [
            Number(rule.id),
            dedupeKey,
            Number(row.id),
            severity,
            `Farm request #${row.id} unassigned over ${Math.trunc(thresholdMinutes)}m`,
            null,
          ],
        )
        if ((ins.rowCount ?? 0) > 0) createdEvents += 1
      }
    }

    await query('UPDATE workflow_automation_rules SET last_run_at = now(), updated_at = now() WHERE id = $1', [Number(rule.id)])
  }

  return {
    active_rules: rules.length,
    matched,
    created_events: createdEvents,
  }
}

export async function purchaseMysteryBox({ userId, productId, qty, couponCode }) {
  const uid = Number(userId)
  const boxId = Number(productId)
  const q = Number(qty)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(boxId)) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 999) throw new Error('invalid_qty')

  const box = await getProductById(boxId)
  if (!box) throw new Error('product_not_found')
  const originalUnitPrice = Number(box.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice < 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Coupon & promo discount ──
    const promo = await getActivePromotionForProduct(client, boxId)
    const promoPrice = computeDiscountedUnitPrice({
      unitPrice: originalUnitPrice,
      percent: promo?.discount_percent,
      amount: promo?.discount_amount_points,
    })
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const couponPrice = computeDiscountedUnitPrice({
      unitPrice: promoPrice.finalUnitPrice,
      percent: coupon?.discount_percent,
      amount: coupon?.discount_amount_points,
    })

    const unitPrice = couponPrice.finalUnitPrice
    const subtotal = originalUnitPrice * q
    const promoDiscountTotal = promoPrice.discountPoints * q
    const couponDiscountTotal = couponPrice.discountPoints * q
    const total = unitPrice * q

    // ── Wallet check ──
    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [uid])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    // ── Load prizes with stock info + compute effective weights ──
    const prizeRes = await client.query(
      `SELECT mbp.id, mbp.prize_kind, mbp.prize_product_id, mbp.prize_name, mbp.prize_image_url, mbp.weight, mbp.remaining,
              p.name AS prize_product_name, p.image_url AS prize_product_image_url,
              CASE
                WHEN mbp.prize_kind = 'linked_product'
                  THEN COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
                WHEN mbp.prize_kind = 'product'
                  THEN (SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available')
                ELSE 0
              END AS prize_available_stock
       FROM mystery_box_prizes mbp
       LEFT JOIN products p ON p.id = mbp.prize_product_id
       WHERE box_product_id = $1 AND is_active = true AND remaining > 0 AND weight > 0
       ORDER BY mbp.id ASC
       FOR UPDATE OF mbp`,
      [boxId],
    )
    const rawPrizes = prizeRes.rows || []
    if (rawPrizes.length === 0) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }
    const prizes = computeMysteryEffectiveWeights(rawPrizes)
    const totalEffective = prizes.reduce((s, r) => s + Math.max(0, Number(r.effective_weight || 0)), 0)
    if (!Number.isFinite(totalEffective) || totalEffective <= 0) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }

    // ── Create order + debit wallet ──
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (order_id, product_id, qty, unit_price_points)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orderId, boxId, q, unitPrice],
    )
    const orderItemId = orderItemRes.rows[0].id

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets SET balance = balance - $1, updated_at = now() WHERE user_id = $2`,
      [total, uid],
    )

    // ── Increment coupon used_count if applicable ──
    if (coupon) {
      await client.query(
        `UPDATE discount_coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE id = $1`,
        [coupon.id],
      )
    }

    // ── Draw prizes ──
    const deliveries = []
    const picks = []
    const drawCtx = { uid, orderId, orderItemId, boxId }

    for (let i = 0; i < q; i++) {
      let picked = false
      let attempts = 0
      const maxAttempts = Math.max(10, prizes.length * 3)

      while (!picked && attempts < maxAttempts) {
        attempts++
        const idx = pickWeightedIndex(prizes, Math.random())
        if (idx < 0) break
        const chosen = prizes[idx]
        if (Number(chosen.remaining) <= 0) continue

        const kind = typeof chosen.prize_kind === 'string' ? chosen.prize_kind : 'product'
        let result = null
        if (kind === 'salt') result = await drawSaltPrize(client, chosen)
        else if (kind === 'linked_product') result = await drawLinkedProductPrize(client, chosen, drawCtx)
        else result = await drawProductPrize(client, chosen, drawCtx)

        if (result === null) continue // stock exhausted for this prize, retry
        if (result.delivery) deliveries.push(result.delivery)
        picks.push(result)
        picked = true
      }

      if (!picked) {
        await client.query('ROLLBACK')
        throw new Error('out_of_stock')
      }
    }

    await client.query('COMMIT')

    sendPushToUser(uid, {
      title: '🎁 เปิดกล่องลุ้นรางวัลสำเร็จ!',
      body: 'เข้าไปที่กล่องรับของเพื่อดูรางวัลของคุณ',
      link: '/inbox',
      tag: `mystery-delivered-${orderId}`,
      require_interaction: true,
    }).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        subtotal_points: subtotal,
        promo_discount_points: promoDiscountTotal,
        coupon_discount_points: couponDiscountTotal,
        coupon_code: coupon?.code ?? null,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries,
      picks,
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

function maskPayload(payload) {
  const s = String(payload ?? '').trim()
  if (!s) return '••••'
  const head = s.slice(0, Math.min(4, s.length))
  return `${head}••••••••`
}

export async function adminAddDigitalStock({ productId, items }) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  const lines = (items || [])
    .map((x) => String(x ?? '').trim())
    .filter((x) => x.length > 0)

  if (lines.length === 0) return { inserted: 0 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const poolId = await getOrCreateDefaultPoolTx(client, pid)

    for (const payload of lines) {
      await client.query(
        'INSERT INTO stock_pool_items (pool_id, payload, status) VALUES ($1, $2, $3)',
        [poolId, payload, 'available'],
      )
    }

    await recountProductStockFromPools(client, pid)
    await client.query('COMMIT')
    return { inserted: lines.length }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminGetDigitalStockSummary(productId) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')

  const poolId = await getDefaultPoolId(pid)
  if (!poolId) {
    return { available: 0, reserved: 0, delivered: 0 }
  }

  const rows = await all(
    `SELECT status, COUNT(*)::int AS c
     FROM stock_pool_items
     WHERE pool_id = $1
     GROUP BY status
     ORDER BY status ASC`,
    [poolId],
  )
  const summary = { available: 0, reserved: 0, delivered: 0, disabled: 0 }
  for (const r of rows) summary[String(r.status)] = Number(r.c) || 0
  return summary
}

async function recountProductAvailableStock(client, productId) {
  await recountProductStockFromPools(client, productId)
}

export async function adminListDigitalStockItems(productId, { limit = 200, offset = 0, status } = {}) {
  const pid = Number(productId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  const poolId = await getDefaultPoolId(pid)
  if (!poolId) return []

  const st = typeof status === 'string' && status.trim() ? status.trim() : null

  let rows
  if (st) {
    rows = await all(
      `SELECT spi.id, $1::bigint AS product_id, spi.payload, spi.status, spi.created_at, spi.reserved_at, spi.delivered_at
       FROM stock_pool_items spi
       WHERE spi.pool_id = $2 AND spi.status = $3
       ORDER BY spi.id DESC
       LIMIT $4 OFFSET $5`,
      [pid, poolId, st, lim, off],
    )
  } else {
    rows = await all(
      `SELECT spi.id, $1::bigint AS product_id, spi.payload, spi.status, spi.created_at, spi.reserved_at, spi.delivered_at
       FROM stock_pool_items spi
       WHERE spi.pool_id = $2
       ORDER BY spi.id DESC
       LIMIT $3 OFFSET $4`,
      [pid, poolId, lim, off],
    )
  }
  return rows
}

export async function adminUpdateDigitalStockItem({ id, payload, status }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')

  const nextPayload = payload == null ? null : String(payload)
  const nextStatus = status == null ? null : String(status)
  if (nextStatus != null && !['available', 'disabled'].includes(nextStatus)) throw new Error('invalid_status')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    if (nextPayload != null) {
      await client.query('UPDATE stock_pool_items SET payload = $2 WHERE id = $1', [sid, nextPayload])
    }
    if (nextStatus != null) {
      await client.query('UPDATE stock_pool_items SET status = $2 WHERE id = $1', [sid, nextStatus])
    }

    const productId = await findProductIdByPoolItemId(client, sid)
    if (productId) await recountProductStockFromPools(client, productId)
    await client.query('COMMIT')

    const updated = await get(
      `SELECT spi.id, b.product_id, spi.payload, spi.status, spi.created_at, spi.reserved_at, spi.delivered_at
       FROM stock_pool_items spi
       LEFT JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id AND b.product_option_id IS NULL
       WHERE spi.id = $1`,
      [sid],
    )
    return updated
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminDeleteDigitalStockItem({ id }) {
  const sid = Number(id)
  if (!Number.isFinite(sid)) throw new Error('invalid_stock_item_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const curRes = await client.query('SELECT id, pool_id, status FROM stock_pool_items WHERE id = $1 FOR UPDATE', [sid])
    const cur = curRes.rows?.[0]
    if (!cur) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    const curStatus = String(cur.status)
    if (!['available', 'disabled'].includes(curStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const productId = await findProductIdByPoolItemId(client, sid)
    await client.query('DELETE FROM stock_pool_items WHERE id = $1', [sid])
    if (productId) await recountProductStockFromPools(client, productId)

    await client.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function purchaseDigitalProduct({ userId, productId, qty, couponCode }) {
  const uid = Number(userId)
  const pid = Number(productId)
  const q = Number(qty)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 999) throw new Error('invalid_qty')

  const { productOptionId } = arguments?.[0] ?? {}

  const product = await getProductById(pid)
  if (!product) throw new Error('product_not_found')
  const selectedOption = requireProductOption({ product, productOptionId })

  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice < 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const promo = await getActivePromotionForProduct(client, pid)
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const campaigns = await listActiveGrowthCampaigns({ targetType: 'product', targetId: pid })
    const vip = await getMyVip(uid).catch(() => null)
    const candidates = [
      promotionToDiscountCandidate(promo),
      ...(campaigns.campaigns || []).map(campaignToDiscountCandidate),
      vipToDiscountCandidate(vip),
      couponToDiscountCandidate(coupon),
    ].filter(Boolean)
    const resolved = resolveDiscountQuote({
      targetType: 'product',
      targetId: pid,
      originalUnitPricePoints: originalUnitPrice,
      quantity: q,
      candidates,
    })

    const unitPrice = resolved.final_unit_price_points
    const total = resolved.final_total_points
    const subtotal = originalUnitPrice * q
    const promoDiscount = resolved.discounts_applied.find((d) => d.source_type === 'product_promotion')?.amount_points || 0
    const couponDiscount = resolved.discounts_applied.find((d) => d.source_type === 'coupon')?.amount_points || 0
    const promoDiscountTotal = promoDiscount * q
    const couponDiscountTotal = couponDiscount * q

    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [uid])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    const optId = selectedOption?.id == null ? null : String(selectedOption.id)
    let poolId = null
    if (optId != null) {
      const binding = await client.query(
        `SELECT pool_id FROM product_option_stock_bindings
         WHERE product_id = $1 AND product_option_id = $2 LIMIT 1`,
        [pid, optId],
      )
      poolId = binding.rows?.[0]?.pool_id != null ? Number(binding.rows[0].pool_id) : null
    }
    if (!Number.isFinite(poolId)) {
      const binding = await client.query(
        `SELECT pool_id FROM product_option_stock_bindings
         WHERE product_id = $1 AND product_option_id IS NULL LIMIT 1`,
        [pid],
      )
      poolId = binding.rows?.[0]?.pool_id != null ? Number(binding.rows[0].pool_id) : null
    }
    if (!Number.isFinite(poolId)) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }

    const poolRes = await client.query(
      'SELECT id, kind, quantity_remaining, is_active FROM stock_pools WHERE id = $1 FOR UPDATE',
      [poolId],
    )
    const pr = poolRes.rows?.[0]
    if (!pr || pr.is_active === false) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }

    const poolKind = String(pr.kind)
    let poolItemsRes = null

    if (poolKind === 'quantity') {
      const poolQuantityRemaining = Number(pr.quantity_remaining ?? 0)
      if (!Number.isFinite(poolQuantityRemaining) || poolQuantityRemaining < q) {
        await client.query('ROLLBACK')
        throw new Error('out_of_stock')
      }
    } else {
      poolItemsRes = await client.query(
        `SELECT id, payload
         FROM stock_pool_items
         WHERE pool_id = $1 AND status = 'available'
         ORDER BY id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [poolId, q],
      )
      if ((poolItemsRes.rowCount ?? 0) < q) {
        await client.query('ROLLBACK')
        throw new Error('out_of_stock')
      }
    }

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (
         order_id, product_id, qty,
         unit_price_points, unit_price_original_points,
         promo_discount_points, coupon_discount_points,
         product_option
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        orderId,
        pid,
        q,
        unitPrice,
        originalUnitPrice,
        promoDiscount,
        couponDiscount,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const orderItemId = orderItemRes.rows[0].id
    await insertOrderDiscountApplications(client, { orderId, orderItemId, quote: resolved })

    if (coupon?.id) {
      await client.query('UPDATE discount_coupons SET used_count = COALESCE(used_count, 0) + 1, updated_at = now() WHERE id = $1', [coupon.id])
    }

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, uid],
    )

    const deliveries = []
    if (poolKind === 'quantity') {
      await client.query('UPDATE stock_pools SET quantity_remaining = quantity_remaining - $2, updated_at = now() WHERE id = $1', [poolId, q])
    } else {
      const rows = poolItemsRes?.rows ?? []
      for (const r of rows) {
        const stockId = r.id
        const payload = String(r.payload ?? '')
        const masked = maskPayload(payload)

        const dRes = await client.query(
          `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_pool_item_id, status, payload_masked, payload)
           VALUES ($1, $2, $3, $4, $5, 'pending_claim', $6, $7)
           RETURNING id`,
          [uid, orderId, orderItemId, pid, stockId, masked, payload],
        )
        deliveries.push({ id: dRes.rows[0].id, masked })

        await client.query(
          `UPDATE stock_pool_items
           SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now()
           WHERE id = $1`,
          [stockId, orderItemId],
        )
      }

      await recountProductStockFromPools(client, pid)
    }

    await client.query('COMMIT')

    sendPushToUser(uid, {
      title: '✅ สินค้าของคุณพร้อมแล้ว!',
      body: 'เข้าไปที่กล่องรับของเพื่อรับสินค้าของคุณ',
      link: '/inbox',
      tag: `order-delivered-${orderId}`,
      require_interaction: true,
    }).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries,
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function listMyOrders(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  return all(
    `SELECT o.id, o.ref, o.total_points, o.status, o.created_at,
            oi.product_id, p.name AS product_name, p.image_url AS product_image_url,
            c.name AS category_name,
            oi.qty, oi.unit_price_points, oi.product_option
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.user_id = $1
     ORDER BY o.id DESC
     LIMIT $2 OFFSET $3`,
    [uid, limit, offset],
  )
}

export async function getDiscordLinkForUser(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  return get(
    `SELECT user_id, discord_user_id, discord_username, linked_at, updated_at
     FROM discord_account_links
     WHERE user_id = $1`,
    [uid],
  )
}

export async function createDiscordLinkCode(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')

  const code = generateDiscordLinkCode()
  const codeHash = hashDiscordLinkCode(code)
  const ttlMinutes = getDiscordLinkCodeTtlMinutes()
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query(
      `DELETE FROM discord_link_codes
       WHERE user_id = $1
         AND (claimed_at IS NOT NULL OR expires_at < now())`,
      [uid],
    )
    await client.query(
      `DELETE FROM discord_link_codes
       WHERE user_id = $1
         AND claimed_at IS NULL`,
      [uid],
    )
    await client.query(
      `INSERT INTO discord_link_codes (code_hash, user_id, expires_at)
       VALUES ($1, $2, $3)`,
      [codeHash, uid, expiresAt],
    )
    await client.query('COMMIT')
    return { code, expires_at: expiresAt.toISOString(), ttl_minutes: ttlMinutes }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function unlinkDiscordForUser(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  await query('DELETE FROM discord_link_codes WHERE user_id = $1', [uid])
  const res = await query('DELETE FROM discord_account_links WHERE user_id = $1', [uid])
  return { deleted: Number(res.rowCount ?? 0) }
}

export async function unlinkDiscordByDiscordUserId(discordUserId) {
  const did = normalizeDiscordUserId(discordUserId)
  const res = await query('DELETE FROM discord_account_links WHERE discord_user_id = $1', [did])
  return { deleted: Number(res.rowCount ?? 0) }
}

export async function getDiscordLinkedUserByDiscordId(discordUserId) {
  const did = normalizeDiscordUserId(discordUserId)
  return get(
    `SELECT
       l.user_id,
       l.discord_user_id,
       l.discord_username,
       l.linked_at,
       l.updated_at,
       u.email,
       u.username,
       u.display_name,
       u.role,
       u.avatar_url,
       u.is_banned,
       COALESCE(w.balance, 0) AS balance
     FROM discord_account_links l
     JOIN users u ON u.id = l.user_id
     LEFT JOIN wallets w ON w.user_id = u.id
     WHERE l.discord_user_id = $1`,
    [did],
  )
}

export async function claimDiscordLinkCode({ code, discordUserId, discordUsername }) {
  const normalizedCode = normalizeDiscordLinkCode(code)
  if (normalizedCode.length < 6 || normalizedCode.length > 24) throw new Error('invalid_code')
  const did = normalizeDiscordUserId(discordUserId)
  const name = String(discordUsername ?? '').trim().slice(0, 120) || null
  const codeHash = hashDiscordLinkCode(normalizedCode)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const codeRes = await client.query(
      `SELECT code_hash, user_id, expires_at, claimed_at
       FROM discord_link_codes
       WHERE code_hash = $1
       FOR UPDATE`,
      [codeHash],
    )
    const row = codeRes.rows?.[0]
    if (!row || row.claimed_at || new Date(row.expires_at).getTime() <= Date.now()) {
      await client.query('ROLLBACK')
      throw new Error('invalid_or_expired_code')
    }

    const userRes = await client.query('SELECT id, is_banned FROM users WHERE id = $1 FOR UPDATE', [row.user_id])
    const user = userRes.rows?.[0]
    if (!user || Boolean(user.is_banned)) {
      await client.query('ROLLBACK')
      throw new Error('user_not_available')
    }

    const existingDiscord = await client.query(
      `SELECT user_id
       FROM discord_account_links
       WHERE discord_user_id = $1
       FOR UPDATE`,
      [did],
    )
    const existingUserId = existingDiscord.rows?.[0]?.user_id
    if (existingUserId != null && Number(existingUserId) !== Number(row.user_id)) {
      await client.query('ROLLBACK')
      throw new Error('discord_already_linked')
    }

    await client.query(
      `INSERT INTO discord_account_links (user_id, discord_user_id, discord_username, linked_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         discord_user_id = EXCLUDED.discord_user_id,
         discord_username = EXCLUDED.discord_username,
         updated_at = now()`,
      [row.user_id, did, name],
    )
    await client.query(
      `UPDATE discord_link_codes
       SET claimed_at = now(), claimed_discord_user_id = $2
       WHERE code_hash = $1`,
      [codeHash, did],
    )

    await client.query('COMMIT')
    return getDiscordLinkedUserByDiscordId(did)
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function findOrCreateUserFromDiscord({
  discordUserId,
  discordUsername,
  discordGlobalName,
  email,
  emailVerified,
  avatarUrl,
} = {}) {
  const did = normalizeDiscordUserId(discordUserId)
  const username = String(discordUsername ?? '').trim().slice(0, 120) || null
  const globalName = String(discordGlobalName ?? '').trim().slice(0, 120) || null
  const displayName = globalName || username || `Discord ${did.slice(-6)}`
  const verifiedEmail = emailVerified && typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
    ? email.trim().toLowerCase()
    : null
  const safeAvatarUrl = typeof avatarUrl === 'string' && (/^https:\/\/cdn\.discordapp\.com\//.test(avatarUrl) || /^https:\/\/cdn\.discordapp\.net\//.test(avatarUrl))
    ? avatarUrl
    : null

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const existingLink = await client.query(
      `SELECT
         u.id AS id,
         l.user_id,
         u.email,
         u.username,
         u.role,
         u.is_banned,
         u.display_name,
         u.avatar_url
       FROM discord_account_links l
       JOIN users u ON u.id = l.user_id
       WHERE l.discord_user_id = $1
       FOR UPDATE`,
      [did],
    )
    if (existingLink.rows?.[0]) {
      const linked = existingLink.rows[0]
      if (Boolean(linked.is_banned)) throw new Error('banned')
      await client.query(
        `UPDATE discord_account_links
         SET discord_username = $2, updated_at = now()
         WHERE discord_user_id = $1`,
        [did, username || globalName],
      )
      await client.query('COMMIT')
      return linked
    }

    let user = null
    if (verifiedEmail) {
      const userByEmail = await client.query(
        `SELECT id, email, username, role, is_banned, display_name, avatar_url
         FROM users
         WHERE email = $1
         FOR UPDATE`,
        [verifiedEmail],
      )
      user = userByEmail.rows?.[0] ?? null
      if (user && Boolean(user.is_banned)) throw new Error('banned')
    }

    if (!user) {
      const countRes = await client.query('SELECT COUNT(*)::int AS c FROM users')
      const isFirst = Number(countRes.rows?.[0]?.c ?? 0) === 0
      const role = isFirst ? 'owner' : 'user'
      const userEmail = verifiedEmail || `discord-${did}@discord.local`
      const userName = await buildUniqueDiscordUsername({ discordUserId: did, username, displayName })
      const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'))

      const created = await client.query(
        `INSERT INTO users (email, password_hash, role, username, display_name, avatar_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, email, username, role, is_banned, display_name, avatar_url`,
        [userEmail, passwordHash, role, userName, displayName, safeAvatarUrl],
      )
      user = created.rows[0]
      await client.query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING', [user.id])
    }

    const existingUserLink = await client.query(
      `SELECT discord_user_id
       FROM discord_account_links
       WHERE user_id = $1
       FOR UPDATE`,
      [user.id],
    )
    const linkedDiscordId = existingUserLink.rows?.[0]?.discord_user_id
    if (linkedDiscordId != null && String(linkedDiscordId) !== did) {
      throw new Error('user_already_linked')
    }

    await client.query(
      `INSERT INTO discord_account_links (user_id, discord_user_id, discord_username, linked_at, updated_at)
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (user_id)
       DO UPDATE SET
         discord_user_id = EXCLUDED.discord_user_id,
         discord_username = EXCLUDED.discord_username,
         updated_at = now()`,
      [user.id, did, username || globalName],
    )

    await client.query('COMMIT')
    return user
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function getMyOrderDetail(userId, orderId) {
  const uid = Number(userId)
  const oid = Number(orderId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('invalid_order_id')

  const order = await get(
    `SELECT o.id, o.ref, o.total_points, o.status, o.created_at,
            oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
            p.id AS product_id, p.name AS product_name, p.image_url AS product_image_url,
            p.fulfillment_type,
            c.name AS category_name
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.id = $1 AND o.user_id = $2
     LIMIT 1`,
    [oid, uid],
  )
  if (!order) throw new Error('not_found')

  const deliveries = await all(
    `SELECT d.id, d.status, d.payload_masked,
            CASE WHEN d.status = 'claimed' THEN d.payload ELSE NULL END AS payload,
            d.created_at, d.claimed_at,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), p.name) AS delivery_name,
            fr.id AS farm_request_id,
            fr.status AS farm_status,
            fr.created_at AS farm_created_at,
            fr.assigned_at AS farm_assigned_at,
            fr.started_at AS farm_started_at,
            fr.fulfilled_at AS farm_fulfilled_at,
            fr.cancelled_at AS farm_cancelled_at,
            fr.cancel_note AS farm_cancel_note,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     WHERE d.order_id = $1 AND d.user_id = $2
     ORDER BY d.id ASC`,
    [oid, uid],
  )

  return { order, deliveries }
}

export async function logAuditEvent({ actorUserId, actorEmail, action, entityType, entityId, detail }) {
  const actorId = actorUserId == null ? null : Number(actorUserId)
  const ae = typeof actorEmail === 'string' ? actorEmail.trim() : null
  const act = typeof action === 'string' ? action.trim() : ''
  const et = typeof entityType === 'string' ? entityType.trim() : ''
  const eid = entityId == null || entityId === '' ? null : String(entityId)
  if (!act) throw new Error('invalid_action')
  if (!et) throw new Error('invalid_entity_type')
  const payload = detail == null ? {} : detail
  await query(
    `INSERT INTO audit_logs (actor_user_id, actor_email, action, entity_type, entity_id, detail_json)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
    [Number.isFinite(actorId) ? actorId : null, ae, act, et, eid, JSON.stringify(payload)],
  )
  return { ok: true }
}

export async function adminListAuditLogs({ limit = 50, offset = 0, action, entityType } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const act = typeof action === 'string' && action.trim() ? action.trim() : null
  const et = typeof entityType === 'string' && entityType.trim() ? entityType.trim() : null

  const where = []
  const params = []
  if (act) {
    params.push(act)
    where.push(`al.action = $${params.length}`)
  }
  if (et) {
    params.push(et)
    where.push(`al.entity_type = $${params.length}`)
  }

  params.push(lim)
  params.push(off)
  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  return all(
    `SELECT al.id,
            al.actor_user_id,
            COALESCE(u.username, '') AS actor_username,
            al.actor_email,
            al.action,
            al.entity_type,
            al.entity_id,
            al.detail_json,
            al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     ${whereSql}
     ORDER BY al.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
}

export async function adminGetAuditLogById(logId) {
  const id = Number(logId)
  if (!Number.isFinite(id) || id <= 0) throw new Error('invalid_id')

  const row = await get(
    `SELECT al.id,
            al.actor_user_id,
            COALESCE(u.username, '') AS actor_username,
            al.actor_email,
            al.action,
            al.entity_type,
            al.entity_id,
            al.detail_json,
            al.created_at
     FROM audit_logs al
     LEFT JOIN users u ON u.id = al.actor_user_id
     WHERE al.id = $1
     LIMIT 1`,
    [id],
  )

  if (!row) throw new Error('not_found')
  return row
}

export async function listMyInbox(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  return all(
    `SELECT d.id, d.order_id, d.product_id,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), NULLIF(TRIM(mbp.prize_name), ''), p.name) AS product_name,
            p.fulfillment_type,
            fr.status AS farm_status,
            fr.cancel_note AS farm_cancel_note,
            d.status,
            d.payload_masked,
            CASE WHEN d.status = 'claimed' THEN d.payload ELSE NULL END AS payload,
            d.created_at, d.claimed_at,
            oi.product_option
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN order_items oi ON oi.id = d.order_item_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN mystery_box_stock_items msi ON msi.id = d.mystery_stock_item_id
     LEFT JOIN mystery_box_prizes mbp ON mbp.id = msi.prize_id
     WHERE d.user_id = $1
     ORDER BY d.id DESC
     LIMIT $2 OFFSET $3`,
    [uid, limit, offset],
  )
}

export async function claimInboxItem({ userId, deliveryId }) {
  const uid = Number(userId)
  const did = Number(deliveryId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(did)) throw new Error('invalid_delivery_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dRes = await client.query(
      `SELECT id, user_id, stock_item_id, stock_pool_item_id, mystery_stock_item_id, status, payload
       FROM deliveries
       WHERE id = $1
       FOR UPDATE`,
      [did],
    )
    const d = dRes.rows?.[0]
    if (!d) {
      await client.query('ROLLBACK')
      throw new Error('delivery_not_found')
    }
    if (Number(d.user_id) !== uid) {
      await client.query('ROLLBACK')
      throw new Error('forbidden')
    }
    if (String(d.status) !== 'pending_claim') {
      await client.query('ROLLBACK')
      throw new Error('already_claimed')
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'claimed', claimed_at = now()
       WHERE id = $1`,
      [did],
    )

    if (d.stock_pool_item_id) {
      await client.query(
        `UPDATE stock_pool_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.stock_pool_item_id],
      )
    } else if (d.stock_item_id) {
      await client.query(
        `UPDATE digital_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.stock_item_id],
      )
    }

    if (d.mystery_stock_item_id) {
      await client.query(
        `UPDATE mystery_box_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.mystery_stock_item_id],
      )
    }

    await client.query('COMMIT')
    return { ok: true, payload: String(d.payload ?? '') }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function seedDb() {
  const row = await get('SELECT COUNT(*)::int AS c FROM categories')
  if ((row?.c ?? 0) > 0) return

  await query(
    `INSERT INTO categories (name, slug, image_url)
     VALUES
       ($1, $2, $3),
       ($4, $5, $6),
       ($7, $8, $9),
       ($10, $11, $12)
     ON CONFLICT (slug) DO NOTHING`,
    [
      'สินค้าแนะนำ',
      'featured',
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=60',
      'อุปกรณ์เกมมิ่ง',
      'gaming',
      'https://images.unsplash.com/photo-1603481546579-65d935ba9cdd?auto=format&fit=crop&w=1200&q=60',
      'ไอเท็มดิจิทัล',
      'digital',
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=60',
      'สินค้าลิมิเต็ด',
      'limited',
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=60',
    ],
  )

  const categories = await all('SELECT id, slug FROM categories')
  const catId = Object.fromEntries(categories.map((c) => [c.slug, c.id]))

  await query(
    `INSERT INTO products (category_id, name, slug, price, description, image_url, stock)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7),
       ($8, $9, $10, $11, $12, $13, $14),
       ($15, $16, $17, $18, $19, $20, $21),
       ($22, $23, $24, $25, $26, $27, $28),
       ($29, $30, $31, $32, $33, $34, $35),
       ($36, $37, $38, $39, $40, $41, $42)
     ON CONFLICT (slug) DO NOTHING`,
    [
      catId.featured,
      'Neon Mouse Pro',
      'neon-mouse-pro',
      799,
      'เมาส์เกมมิ่งไฟ RGB ตอบสนองไว ดีไซน์นีออน',
      'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=1400&q=60',
      75,
      catId.gaming,
      'Keyboard Vortex',
      'keyboard-vortex',
      1290,
      'คีย์บอร์ดแมคคานิคอล สวิตช์นุ่ม เสียงแน่น',
      'https://images.unsplash.com/photo-1541140134513-85a161dc4a00?auto=format&fit=crop&w=1400&q=60',
      18,
      catId.digital,
      'Premium Theme Pack',
      'premium-theme-pack',
      199,
      'ธีม UI โทนดำ-นีออน (ดาวน์โหลดทันที)',
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1400&q=60',
      999,
      catId.limited,
      'Limited Hoodie Black',
      'limited-hoodie-black',
      1490,
      'ฮู้ดดี้ลิมิเต็ด โทนดำลายเรืองแสง',
      'https://images.unsplash.com/photo-1520975661595-6453be3f7070?auto=format&fit=crop&w=1400&q=60',
      5,
      catId.featured,
      'Mystery Box',
      'mystery-box',
      399,
      'กล่องสุ่มสินค้า มูลค่าเกินราคา',
      'https://images.unsplash.com/photo-1512511708753-3150cd5a66aa?auto=format&fit=crop&w=1400&q=60',
      33,
      catId.gaming,
      'Headset Pulse',
      'headset-pulse',
      990,
      'หูฟังเกมมิ่งเสียงคมชัด ไมค์ตัดเสียงรบกวน',
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1400&q=60',
      12,
    ],
  )
}

export async function registerUser(email, password, username = null) {
  const passwordHash = await hashPassword(password)
  const row = await get('SELECT COUNT(*)::int AS c FROM users')
  const isFirst = (row?.c ?? 0) === 0
  const role = isFirst ? 'owner' : 'user'

  const un = typeof username === 'string' && username.trim().length > 0 ? username.trim() : null
  const dn = un

  const res = await query(
    'INSERT INTO users (email, password_hash, role, username, display_name) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [email, passwordHash, role, un, dn],
  )
  const id = res.rows[0].id
  await query('INSERT INTO wallets (user_id, balance) VALUES ($1, 0) ON CONFLICT (user_id) DO NOTHING', [id])
  return { id, email, username: un }
}

export async function getUserByEmail(email) {
  return get('SELECT id, email, username, password_hash, role, is_banned, display_name, avatar_url FROM users WHERE email = $1', [email])
}

export async function getUserByUsername(username) {
  return get('SELECT id, email, username, password_hash, role, is_banned, display_name, avatar_url FROM users WHERE username = $1', [
    username,
  ])
}

export async function getUserByLogin(login) {
  const v = typeof login === 'string' ? login.trim() : ''
  if (!v) return null
  if (v.includes('@')) return getUserByEmail(v.toLowerCase())
  return getUserByUsername(v)
}

export async function getUserById(id) {
  return get(
    'SELECT id, email, username, role, is_banned, display_name, avatar_url, created_at FROM users WHERE id = $1',
    [id],
  )
}

export async function listUsers({ limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT u.id,
            u.email,
            u.username,
            u.role,
            u.is_banned,
            u.display_name,
            u.avatar_url,
            u.created_at,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(COUNT(DISTINCT o.id), 0) AS orders_count,
            COALESCE(SUM(o.total_points), 0) AS total_spend_points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN orders o ON o.user_id = u.id
     GROUP BY u.id, w.balance
     ORDER BY u.id ASC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}

export async function adminListUsersAdvanced({
  limit = 50,
  offset = 0,
  search,
  role,
  status,
  sort = 'created_desc',
} = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 200) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  const q = typeof search === 'string' ? search.trim() : ''
  const roleFilter = typeof role === 'string' ? role.trim().toLowerCase() : ''
  const statusFilter = typeof status === 'string' ? status.trim().toLowerCase() : ''

  const where = []
  const params = []

  if (q) {
    params.push(`%${q}%`)
    const idx = params.length
    where.push(`(
      u.email ILIKE $${idx}
      OR COALESCE(u.username, '') ILIKE $${idx}
      OR COALESCE(u.display_name, '') ILIKE $${idx}
      OR CAST(u.id AS TEXT) ILIKE $${idx}
    )`)
  }

  if (roleFilter && roleFilter !== 'all') {
    const allowedRoles = new Set(['owner', 'admin', 'finance', 'booster', 'support', 'user'])
    if (!allowedRoles.has(roleFilter)) throw new Error('invalid_role_filter')
    params.push(roleFilter)
    where.push(`LOWER(COALESCE(u.role, 'user')) = $${params.length}`)
  }

  if (statusFilter && statusFilter !== 'all') {
    if (statusFilter === 'active') where.push(`u.is_banned = false`)
    else if (statusFilter === 'banned') where.push(`u.is_banned = true`)
    else throw new Error('invalid_status_filter')
  }

  const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

  const sortKey = String(sort || '').trim().toLowerCase()
  const orderBy =
    sortKey === 'created_asc'
      ? 'u.created_at ASC, u.id ASC'
      : sortKey === 'spend_desc'
        ? 'total_spend_points DESC, u.id DESC'
        : sortKey === 'orders_desc'
          ? 'orders_count DESC, u.id DESC'
          : sortKey === 'points_desc'
            ? 'balance DESC, u.id DESC'
            : 'u.created_at DESC, u.id DESC'

  const totalRow = await get(
    `SELECT COUNT(*)::int AS c
     FROM users u
     ${whereSql}`,
    params,
  )

  const summaryRow = await get(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE u.is_banned = false)::int AS active,
            COUNT(*) FILTER (WHERE u.is_banned = true)::int AS banned,
            COUNT(*) FILTER (WHERE LOWER(COALESCE(u.role, 'user')) IN ('admin','owner'))::int AS admins,
            COALESCE(SUM(COALESCE(w.balance, 0)), 0)::bigint AS total_balance
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id`,
  )

  const listParams = [...params, lim, off]
  const rows = await all(
    `SELECT u.id,
            u.email,
            u.username,
            u.role,
            u.is_banned,
            u.display_name,
            u.avatar_url,
            u.created_at,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(os.orders_count, 0) AS orders_count,
            COALESCE(os.total_spend_points, 0) AS total_spend_points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS orders_count,
              COALESCE(SUM(o.total_points), 0)::bigint AS total_spend_points
       FROM orders o
       WHERE o.user_id = u.id
     ) os ON true
     ${whereSql}
     ORDER BY ${orderBy}
     LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
    listParams,
  )

  return {
    items: rows,
    total: Number(totalRow?.c ?? 0) || 0,
    summary: {
      total: Number(summaryRow?.total ?? 0) || 0,
      active: Number(summaryRow?.active ?? 0) || 0,
      banned: Number(summaryRow?.banned ?? 0) || 0,
      admins: Number(summaryRow?.admins ?? 0) || 0,
      total_balance: Number(summaryRow?.total_balance ?? 0) || 0,
    },
  }
}

export async function adminGetUserManagementDetail(
  userId,
  { topupsLimit = 20, transactionsLimit = 20, sessionsLimit = 20, auditLimit = 40 } = {},
) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')

  const user = await get(
    `SELECT u.id,
            u.email,
            u.username,
            u.role,
            u.is_banned,
            u.display_name,
            u.avatar_url,
            u.created_at,
            COALESCE(w.balance, 0) AS balance,
            COALESCE(os.orders_count, 0) AS orders_count,
            COALESCE(os.total_spend_points, 0) AS total_spend_points
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS orders_count,
              COALESCE(SUM(o.total_points), 0)::bigint AS total_spend_points
       FROM orders o
       WHERE o.user_id = u.id
     ) os ON true
     WHERE u.id = $1`,
    [uid],
  )
  if (!user) throw new Error('not_found')

  const topupsLim = Math.min(100, Math.max(1, Number(topupsLimit) || 20))
  const txLim = Math.min(100, Math.max(1, Number(transactionsLimit) || 20))
  const sessLim = Math.min(100, Math.max(1, Number(sessionsLimit) || 20))
  const auditLim = Math.min(200, Math.max(1, Number(auditLimit) || 40))

  const [topups, transactions, sessions, audits, topupStats, txStats] = await Promise.all([
    all(
      `SELECT id, amount, amount_points, method, provider, provider_ref, reference, status, created_at, updated_at
       FROM topups
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [uid, topupsLim],
    ),
    all(
      `SELECT id, type, points, ref_type, ref_id, created_at
       FROM transactions
       WHERE user_id = $1
       ORDER BY id DESC
       LIMIT $2`,
      [uid, txLim],
    ),
    all(
      `SELECT token, created_at, expires_at
       FROM sessions
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [uid, sessLim],
    ),
    all(
      `SELECT al.id,
              al.actor_user_id,
              COALESCE(au.username, '') AS actor_username,
              al.actor_email,
              al.action,
              al.entity_type,
              al.entity_id,
              al.detail_json,
              al.created_at
       FROM audit_logs al
       LEFT JOIN users au ON au.id = al.actor_user_id
       WHERE (al.entity_type = 'user' AND al.entity_id = $1)
          OR al.actor_user_id = $2
       ORDER BY al.id DESC
       LIMIT $3`,
      [String(uid), uid, auditLim],
    ),
    get(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'pending')::int AS pending,
              COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
              COUNT(*) FILTER (WHERE status = 'rejected')::int AS rejected
       FROM topups
       WHERE user_id = $1`,
      [uid],
    ),
    get(
      `SELECT COUNT(*)::int AS total,
              COALESCE(SUM(CASE WHEN type = 'credit' THEN points ELSE 0 END), 0)::bigint AS total_credit,
              COALESCE(SUM(CASE WHEN type = 'debit' THEN points ELSE 0 END), 0)::bigint AS total_debit
       FROM transactions
       WHERE user_id = $1`,
      [uid],
    ),
  ])

  const activeSessions = (sessions || []).filter((s) => {
    if (!s?.expires_at) return true
    return new Date(s.expires_at).getTime() > Date.now()
  })

  return {
    user,
    topups,
    transactions,
    sessions,
    audits,
    security: {
      is_banned: Boolean(user?.is_banned),
      role: String(user?.role || 'user').toLowerCase(),
      active_sessions: activeSessions.length,
      total_sessions: Array.isArray(sessions) ? sessions.length : 0,
      has_avatar: Boolean(String(user?.avatar_url || '').trim()),
      has_display_name: Boolean(String(user?.display_name || '').trim()),
      last_session_at: sessions?.[0]?.created_at ?? null,
    },
    snapshot: {
      topups_total: Number(topupStats?.total ?? 0) || 0,
      topups_pending: Number(topupStats?.pending ?? 0) || 0,
      topups_approved: Number(topupStats?.approved ?? 0) || 0,
      topups_rejected: Number(topupStats?.rejected ?? 0) || 0,
      transactions_total: Number(txStats?.total ?? 0) || 0,
      transactions_credit_points: Number(txStats?.total_credit ?? 0) || 0,
      transactions_debit_points: Number(txStats?.total_debit ?? 0) || 0,
    },
  }
}

export async function setUserBanned({ userId, isBanned }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_id')
  const banned = Boolean(isBanned)
  await query('UPDATE users SET is_banned = $2 WHERE id = $1', [uid, banned])
  if (banned) {
    await query('DELETE FROM sessions WHERE user_id = $1', [uid])
  }
  return getUserById(uid)
}

export async function adminListUserOrders(userId, { limit = 50, offset = 0, search } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_id')
  const params = [uid, limit, offset]
  let searchClause = ''
  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`)
    searchClause = ` AND (LOWER(COALESCE(o.ref,'')) LIKE $4 OR LOWER(p.name) LIKE $4)`
  }
  return all(
    `SELECT o.id AS order_id,
            o.ref,
            o.total_points,
            o.status,
            o.created_at,
            oi.id AS order_item_id,
            oi.product_id,
            p.name AS product_name,
            p.image_url AS product_image_url,
            p.fulfillment_type,
            oi.qty,
            oi.unit_price_points,
            oi.product_option
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = $1${searchClause}
     ORDER BY o.id DESC, oi.id ASC
     LIMIT $2 OFFSET $3`,
    params,
  )
}

export async function adminSearchOrderByRef(ref) {
  const r = String(ref ?? '').trim().toLowerCase()
  if (!r) return null
  return get(
    `SELECT o.id AS order_id,
            o.ref,
            o.user_id,
            o.total_points,
            o.status,
            o.created_at,
            u.username,
            u.email,
            u.display_name,
            u.avatar_url
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE LOWER(o.ref) = $1`,
    [r],
  )
}

export async function updateUserProfile({ userId, displayName, avatarUrl }) {
  const dn = typeof displayName === 'string' ? displayName.trim() : null
  const au = typeof avatarUrl === 'string' ? avatarUrl.trim() : null
  await query('UPDATE users SET display_name = $2, avatar_url = $3 WHERE id = $1', [userId, dn, au])
  return getUserById(userId)
}

export async function adminUpdateUserAccount({ userId, email, username, displayName, avatarUrl }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')

  const target = await get('SELECT id FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('not_found')

  const em = typeof email === 'string' ? email.trim().toLowerCase() : ''
  const un = typeof username === 'string' ? username.trim() : ''
  const dn = typeof displayName === 'string' ? displayName.trim() : ''
  const au = typeof avatarUrl === 'string' ? avatarUrl.trim() : ''

  if (!em || !em.includes('@')) throw new Error('invalid_email')
  if (!un || un.length < 6) throw new Error('invalid_username')
  if (!/^[a-zA-Z0-9._-]+$/.test(un)) throw new Error('invalid_username_charset')
  if (dn.length > 80) throw new Error('invalid_display_name')

  await query(
    'UPDATE users SET email = $2, username = $3, display_name = $4, avatar_url = $5 WHERE id = $1',
    [uid, em, un, dn || null, au || null],
  )

  return getUserById(uid)
}

export async function adminRevokeUserSessions(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')
  const target = await get('SELECT id FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('not_found')
  const res = await query('DELETE FROM sessions WHERE user_id = $1', [uid])
  return { deleted: Number(res?.rowCount ?? 0) || 0 }
}

export async function adminRemoveUserAccount({ userId, actorUserId, performedByOwner }) {
  const uid = Number(userId)
  const aid = Number(actorUserId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_id')
  if (!Number.isFinite(aid) || aid <= 0) throw new Error('invalid_actor')
  if (uid === aid) throw new Error('cannot_remove_self')

  const target = await get('SELECT id, role FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('not_found')

  const targetRole = String(target.role || 'user').trim().toLowerCase()
  const byOwner = Boolean(performedByOwner)
  if (targetRole === 'owner' && !byOwner) throw new Error('forbidden_owner')
  if (targetRole === 'owner') {
    const row = await get(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'owner'`)
    if ((row?.c ?? 0) <= 1) throw new Error('cannot_remove_last_owner')
  }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('UPDATE topups SET approved_by = NULL WHERE approved_by = $1', [uid])
    await client.query('UPDATE farm_requests SET assigned_booster_id = NULL, assigned_at = NULL WHERE assigned_booster_id = $1', [uid])
    const deleted = await client.query('DELETE FROM users WHERE id = $1', [uid])
    if ((deleted?.rowCount ?? 0) < 1) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    await client.query('COMMIT')
    return { ok: true, deleted: 1 }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function setUserPassword({ userId, password }) {
  const passwordHash = await hashPassword(password)
  await query('UPDATE users SET password_hash = $2 WHERE id = $1', [userId, passwordHash])
  return { ok: true }
}

export async function changeUserPassword({ userId, oldPassword, newPassword }) {
  const user = await get('SELECT password_hash FROM users WHERE id = $1', [userId])
  if (!user) throw new Error('user_not_found')
  if (!(await verifyPassword(oldPassword, user.password_hash))) throw new Error('invalid_old_password')
  await setUserPassword({ userId, password: newPassword })
  return { ok: true }
}

export async function createCategory({ name, slug, imageUrl, description }) {
  const res = await query(
    `INSERT INTO categories (name, slug, image_url, description)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [name, slug, imageUrl ?? null, description ?? null],
  )
  return res.rows[0].id
}

export async function updateCategory({ id, name, slug, imageUrl, description }) {
  await query('UPDATE categories SET name=$2, slug=$3, image_url=$4, description=$5 WHERE id=$1', [id, name, slug, imageUrl ?? null, description ?? null])
  return get('SELECT id, name, slug, image_url, description, is_hidden FROM categories WHERE id=$1', [id])
}

export async function deleteCategory(id) {
  const cid = Number(id)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_id')

  const existing = await get('SELECT id FROM categories WHERE id = $1', [cid])
  if (!existing) throw new Error('not_found')

  const prod = await get('SELECT COUNT(*)::int AS c FROM products WHERE category_id = $1', [cid])
  const productCount = Number(prod?.c ?? 0) || 0
  if (productCount > 0) {
    const err = new Error('category_in_use')
    err.detail = { products: productCount }
    throw err
  }

  await query('DELETE FROM categories WHERE id=$1', [cid])
  return { ok: true }
}

export async function createProduct({
  categoryId,
  name,
  slug,
  price,
  description,
  imageUrl,
  stock,
  highlights,
  manualUrl,
  manualText,
  manualVideoUrl,
  fulfillmentType,
  farmFormUsernameEnabled,
  farmFormPasswordEnabled,
  farmFormAuthKeyEnabled,
  farmFormFields,
  productOptions,
  sortOrder,
  isFeatured,
  isUnlimitedStock,
}) {
  const farmFormFieldsValue = Array.isArray(farmFormFields) ? JSON.stringify(farmFormFields) : null
  const normalizedProductOptions = normalizeProductOptionsInput(productOptions)
  const res = await query(
    `INSERT INTO products (
       category_id, name, slug, price, description, image_url, stock, highlights,
       manual_url, manual_text, manual_video_url, fulfillment_type,
       farm_form_username_enabled, farm_form_password_enabled, farm_form_auth_key_enabled,
       farm_form_fields, product_options, sort_order, is_featured, is_unlimited_stock
     )
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,NULL,$17,$18,$19)
     RETURNING id`,
    [
      categoryId,
      name,
      slug,
      price,
      description ?? null,
      imageUrl ?? null,
      stock ?? 0,
      highlights ?? null,
      manualUrl ?? null,
      manualText ?? null,
      manualVideoUrl ?? null,
      fulfillmentType ?? 'digital_stock',
      farmFormUsernameEnabled === undefined ? true : Boolean(farmFormUsernameEnabled),
      farmFormPasswordEnabled === undefined ? true : Boolean(farmFormPasswordEnabled),
      farmFormAuthKeyEnabled === undefined ? true : Boolean(farmFormAuthKeyEnabled),
      farmFormFieldsValue,
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      Boolean(isFeatured),
      Boolean(isUnlimitedStock),
    ],
  )
  return res.rows[0].id
}

export async function updateProduct({
  id,
  categoryId,
  name,
  slug,
  price,
  description,
  imageUrl,
  stock,
  highlights,
  manualUrl,
  manualText,
  manualVideoUrl,
  fulfillmentType,
  farmFormUsernameEnabled,
  farmFormPasswordEnabled,
  farmFormAuthKeyEnabled,
  farmFormFields,
  productOptions,
  sortOrder,
  isFeatured,
  isUnlimitedStock,
}) {
  const farmFormFieldsValue = Array.isArray(farmFormFields) ? JSON.stringify(farmFormFields) : null
  const normalizedProductOptions = normalizeProductOptionsInput(productOptions)
  await query(
    `UPDATE products
     SET category_id=$2, name=$3, slug=$4, price=$5, description=$6, image_url=$7, stock=$8,
         highlights=$9, manual_url=$10, manual_text=$11, manual_video_url=$12, fulfillment_type=$13,
         farm_form_username_enabled=$14, farm_form_password_enabled=$15, farm_form_auth_key_enabled=$16,
         farm_form_fields=COALESCE($17::jsonb, farm_form_fields),
         product_options=NULL,
         sort_order=$18, is_featured=$19, is_unlimited_stock=$20
     WHERE id=$1`,
    [
      id,
      categoryId,
      name,
      slug,
      price,
      description ?? null,
      imageUrl ?? null,
      stock ?? 0,
      highlights ?? null,
      manualUrl ?? null,
      manualText ?? null,
      manualVideoUrl ?? null,
      fulfillmentType ?? 'digital_stock',
      farmFormUsernameEnabled === undefined ? true : Boolean(farmFormUsernameEnabled),
      farmFormPasswordEnabled === undefined ? true : Boolean(farmFormPasswordEnabled),
      farmFormAuthKeyEnabled === undefined ? true : Boolean(farmFormAuthKeyEnabled),
      farmFormFieldsValue,
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      Boolean(isFeatured),
      Boolean(isUnlimitedStock),
    ],
  )
  await replaceProductOptionItems({ productId: id, productOptions: normalizedProductOptions })
  return getProductById(id)
}

function normalizeFarmFormFields(product) {
  if (Array.isArray(product?.farm_form_fields)) {
    return product.farm_form_fields.map((field, index) => {
      const id = typeof field?.id === 'string' && field.id.trim() ? field.id.trim() : `field_${index + 1}`
      const label = typeof field?.label === 'string' && field.label.trim() ? field.label.trim() : `Field ${index + 1}`
      const type = field?.type === 'checkbox' ? 'checkbox' : 'text'
      const required = Boolean(field?.required)
      return { id, label, type, required }
    })
  }

  const fields = []
  if (product?.farm_form_username_enabled !== false) {
    fields.push({ id: 'username', label: 'Username', type: 'text', required: true })
  }
  if (product?.farm_form_password_enabled !== false) {
    fields.push({ id: 'password', label: 'Password', type: 'text', required: true })
  }
  if (product?.farm_form_auth_key_enabled !== false) {
    fields.push({ id: 'auth_key', label: 'Auth Key', type: 'text', required: false })
  }
  return fields
}

export async function purchaseFarmProduct({ userId, productId, qty, username, password, authKey, couponCode, formData }) {
  const uid = Number(userId)
  const pid = Number(productId)
  const q = Number(qty)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 10) throw new Error('invalid_qty')

  const { productOptionId } = arguments?.[0] ?? {}
  const product = await getProductById(pid)
  if (!product) throw new Error('product_not_found')

  const selectedOption = resolveProductOption({ product, productOptionId })

  const fields = normalizeFarmFormFields(product)
  const inputData = formData && typeof formData === 'object' ? formData : {}
  const fieldValues = {}
  for (const field of fields) {
    let value = inputData?.[field.id]
    if (value == null) {
      if (field.id === 'username') value = username
      if (field.id === 'password') value = password
      if (field.id === 'auth_key') value = authKey
    }
    if (field.type === 'checkbox') {
      const boolVal = value === true || value === 'true' || value === 1 || value === '1'
      if (field.required && !boolVal) throw new Error('invalid_farm_form')
      fieldValues[field.id] = boolVal
    } else {
      const textVal = String(value ?? '').trim()
      if (field.required && !textVal) throw new Error('invalid_farm_form')
      fieldValues[field.id] = textVal ? textVal : null
    }
  }

  const usernameValue = typeof fieldValues.username === 'string' ? fieldValues.username : ''
  const passwordValue = typeof fieldValues.password === 'string' ? fieldValues.password : ''
  const authKeyValue = typeof fieldValues.auth_key === 'string' ? fieldValues.auth_key : ''
  const formDataValue = JSON.stringify(fieldValues)

  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice <= 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const promo = await getActivePromotionForProduct(client, pid)
    const promoPrice = computeDiscountedUnitPrice({
      unitPrice: originalUnitPrice,
      percent: promo?.discount_percent,
      amount: promo?.discount_amount_points,
    })
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const couponPrice = computeDiscountedUnitPrice({
      unitPrice: promoPrice.finalUnitPrice,
      percent: coupon?.discount_percent,
      amount: coupon?.discount_amount_points,
    })

    const unitPrice = couponPrice.finalUnitPrice
    const subtotal = originalUnitPrice * q
    const promoDiscountTotal = promoPrice.discountPoints * q
    const couponDiscountTotal = couponPrice.discountPoints * q
    const total = unitPrice * q

    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [uid])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [uid],
    )

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (
         order_id, product_id, qty,
         unit_price_points, unit_price_original_points,
         promo_discount_points, coupon_discount_points,
         product_option
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        orderId,
        pid,
        q,
        unitPrice,
        originalUnitPrice,
        promoPrice.discountPoints,
        couponPrice.discountPoints,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const orderItemId = orderItemRes.rows[0].id

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, uid],
    )

    if (coupon?.id) {
      await client.query('UPDATE discount_coupons SET used_count = used_count + 1, updated_at = now() WHERE id = $1', [coupon.id])
    }

    const dRes = await client.query(
      `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_item_id, status, payload_masked, payload)
       VALUES ($1, $2, $3, $4, NULL, 'pending_fulfillment', $5, NULL)
       RETURNING id`,
      [uid, orderId, orderItemId, pid, 'รอดำเนินการ'],
    )
    const deliveryId = dRes.rows[0].id

    const farmRes2 = await client.query(
      `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, username, password, auth_key, form_data, status, product_option)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10::jsonb)
       RETURNING id`,
      [
        deliveryId,
        uid,
        pid,
        orderId,
        orderItemId,
        usernameValue || null,
        passwordValue || null,
        authKeyValue || null,
        formDataValue,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const farmRequestId2 = farmRes2.rows[0]?.id

    await client.query('COMMIT')

    if (farmRequestId2) autoAssignFarmRequest(farmRequestId2).catch(() => {})
    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries: [{ id: deliveryId, masked: 'รอดำเนินการ' }],
    }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function adminListOrders({ limit = 100, offset = 0, status, search, fulfillmentType } = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 100), 500)
  const off = Math.max(0, Number(offset) || 0)
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const ft = typeof fulfillmentType === 'string' && fulfillmentType.trim() ? fulfillmentType.trim() : null
  const q = typeof search === 'string' ? search.trim() : ''

  const where = []
  const params = []

  if (st) { params.push(st); where.push(`o.status = $${params.length}`) }
  if (ft) { params.push(ft); where.push(`p.fulfillment_type = $${params.length}`) }
  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR p.name ILIKE $${params.length} OR o.ref ILIKE $${params.length} OR CAST(o.id AS TEXT) ILIKE $${params.length})`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countParams = [...params]
  params.push(lim); params.push(off)

  const [items, countRow] = await Promise.all([
    all(
      `SELECT o.id, o.ref, o.status, o.total_points, o.created_at,
              u.id AS user_id, u.email AS user_email,
              COALESCE(u.display_name, u.username) AS user_display_name,
              oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
              p.id AS product_id, p.name AS product_name, p.fulfillment_type,
              c.name AS category_name,
              d.id AS delivery_id, d.status AS delivery_status, d.claimed_at,
              fr.id AS farm_request_id, fr.status AS farm_status,
              fr.assigned_at, fr.started_at, fr.fulfilled_at,
              COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
       LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
       ${whereSql}
       ORDER BY o.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    get(
      `SELECT COUNT(DISTINCT o.id)::int AS total,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending')::int AS pending_count,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed')::int AS completed_count,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'pending_claim')::int AS pending_claim_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'claimed')::int AS claimed_count,
              COUNT(DISTINCT fr.id) FILTER (WHERE fr.status = 'pending')::int AS fr_pending_count,
              COUNT(DISTINCT fr.id) FILTER (WHERE fr.status = 'in_progress')::int AS fr_in_progress_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
       ${whereSql}`,
      countParams,
    ),
  ])

  return {
    items,
    total: Number(countRow?.total || 0),
    summary: {
      pending: Number(countRow?.pending_count || 0),
      completed: Number(countRow?.completed_count || 0),
      cancelled: Number(countRow?.cancelled_count || 0),
      pending_claim: Number(countRow?.pending_claim_count || 0),
      claimed: Number(countRow?.claimed_count || 0),
      fr_pending: Number(countRow?.fr_pending_count || 0),
      fr_in_progress: Number(countRow?.fr_in_progress_count || 0),
    },
  }
}

export async function adminGetOrderDetail(orderId) {
  const oid = Number(orderId)
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('invalid_order_id')

  const order = await get(
    `SELECT o.id, o.ref, o.status, o.total_points, o.created_at,
            u.id AS user_id, u.email AS user_email,
            COALESCE(u.display_name, u.username) AS user_display_name,
            oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
            p.id AS product_id, p.name AS product_name, p.fulfillment_type, p.image_url AS product_image_url,
            c.name AS category_name
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 LIMIT 1`,
    [oid],
  )
  if (!order) throw new Error('not_found')

  const deliveries = await all(
    `SELECT d.id, d.status, d.payload_masked, d.created_at, d.claimed_at,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), p.name) AS delivery_name,
            fr.id AS farm_request_id, fr.status AS farm_status,
            fr.created_at AS farm_created_at, fr.assigned_at, fr.started_at,
            fr.fulfilled_at, fr.cancelled_at, fr.cancel_note,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name,
            ab.id AS assigned_staff_id
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     WHERE d.order_id = $1
     ORDER BY d.id ASC`,
    [oid],
  )

  return { order, deliveries }
}

export async function adminListFarmRequests({ limit = 200, offset = 0, status, assignedTo, search, scope, staffUserId } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const staffId = staffUserId == null || staffUserId === '' ? null : Number(staffUserId)

  const scopeRaw = typeof scope === 'string' ? scope.trim().toLowerCase() : ''
  const queueScope = scopeRaw || 'all'

  const assignedRaw = typeof assignedTo === 'string' ? assignedTo.trim().toLowerCase() : assignedTo
  const unassignedOnly = assignedRaw === 'unassigned'
  const mineOnly = assignedRaw === 'me'
  const a = unassignedOnly || mineOnly || assignedTo == null || assignedTo === '' ? null : Number(assignedTo)

  const q = typeof search === 'string' ? search.trim() : ''

  const where = []
  const params = []

  if (st) {
    params.push(st)
    where.push(`fr.status = $${params.length}`)
  }

  if (queueScope === 'mine') {
    if (Number.isFinite(staffId) && staffId > 0) {
      params.push(staffId)
      where.push(`fr.assigned_booster_id = $${params.length}`)
    }
    if (!st) where.push(`fr.status IN ('pending', 'in_progress')`)
  } else if (queueScope === 'unassigned') {
    where.push(`fr.assigned_booster_id IS NULL`)
    if (!st) where.push(`fr.status = 'pending'`)
  } else if (queueScope === 'in_progress') {
    where.push(`fr.status = 'in_progress'`)
  }

  if (unassignedOnly) {
    where.push('fr.assigned_booster_id IS NULL')
  } else if (mineOnly) {
    if (Number.isFinite(staffId) && staffId > 0) {
      params.push(staffId)
      where.push(`fr.assigned_booster_id = $${params.length}`)
    }
  } else if (a != null && Number.isFinite(a)) {
    params.push(a)
    where.push(`fr.assigned_booster_id = $${params.length}`)
  }

  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR p.name ILIKE $${params.length} OR CAST(fr.id AS TEXT) ILIKE $${params.length} OR CAST(fr.order_id AS TEXT) ILIKE $${params.length})`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const baseParams = [...params]
  const listParams = [...baseParams, lim, off]

  const [items, summaryRow] = await Promise.all([
    all(
      `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
              fr.cancel_note, fr.cancelled_at,
              fr.uid, fr.uid_confirmed,
              fr.delivery_id, fr.order_id, fr.order_item_id,
              COALESCE(oi.qty, 1) AS order_qty,
              u.email, u.email AS user_email,
              u.username AS user_username,
              COALESCE(u.display_name, u.username) AS user_display_name,
              p.name AS product_name,
              p.fulfillment_type,
              fr.assigned_booster_id,
              ab.email AS assigned_booster_email,
              ab.username AS assigned_username,
              COALESCE(ab.display_name, ab.username, ab.email) AS assigned_display_name
       FROM farm_requests fr
       LEFT JOIN order_items oi ON oi.id = fr.order_item_id
       JOIN users u ON u.id = fr.user_id
       JOIN products p ON p.id = fr.product_id
       LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
       ${whereSql}
       ORDER BY fr.id DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    ),
    get(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
         COUNT(*) FILTER (WHERE status = 'fulfilled')::int AS fulfilled_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
         COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND assigned_booster_id IS NULL)::int AS unassigned_count,
         COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND assigned_booster_id = $1)::int AS mine_count,
         COUNT(*) FILTER (WHERE status = 'pending' AND assigned_booster_id IS NULL AND created_at <= now() - interval '30 minutes')::int AS over_sla_count
       FROM farm_requests`,
      [Number.isFinite(staffId) && staffId > 0 ? Math.trunc(staffId) : -1],
    ),
  ])

  return {
    items,
    total: Number(summaryRow?.total || 0),
    summary: {
      pending: Number(summaryRow?.pending_count || 0),
      in_progress: Number(summaryRow?.in_progress_count || 0),
      fulfilled: Number(summaryRow?.fulfilled_count || 0),
      cancelled: Number(summaryRow?.cancelled_count || 0),
      unassigned: Number(summaryRow?.unassigned_count || 0),
      mine: Number(summaryRow?.mine_count || 0),
      over_sla: Number(summaryRow?.over_sla_count || 0),
    },
  }
}

export async function adminGetFarmRequestDetail(requestId) {
  const rid = Number(requestId)
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('invalid_request_id')

  const request = await get(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id, fr.product_option,
            COALESCE(oi.qty, 1) AS order_qty,
            oi.unit_price_points,
            u.id AS user_id, u.email, u.email AS user_email,
            u.username AS user_username,
            COALESCE(u.display_name, u.username) AS user_display_name,
            p.id AS product_id, p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled,
            fr.assigned_booster_id,
            ab.email AS assigned_booster_email,
            ab.username AS assigned_username,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_display_name,
            d.status AS delivery_status, d.payload_masked
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     LEFT JOIN deliveries d ON d.id = fr.delivery_id
     WHERE fr.id = $1`,
    [rid],
  )
  if (!request) throw new Error('not_found')

  const logs = await all(
    `SELECT bal.id, bal.booster_id, bal.action, bal.meta, bal.created_at,
            bu.email AS booster_email, bu.display_name AS booster_display_name
     FROM booster_action_logs bal
     LEFT JOIN users bu ON bu.id = bal.booster_id
     WHERE bal.farm_request_id = $1
     ORDER BY bal.id ASC`,
    [rid],
  )

  return { request, logs }
}

export async function adminGetDashboardOverview({ days = 14, urgentMinutes = 60, urgentLimit = 5 } = {}) {
  const d = Number(days)
  const um = Number(urgentMinutes)
  const ul = Number(urgentLimit)

  if (!Number.isFinite(d) || d <= 0 || d > 90) throw new Error('invalid_days')
  if (!Number.isFinite(um) || um <= 0 || um > 43200) throw new Error('invalid_urgent_minutes')
  if (!Number.isFinite(ul) || ul < 0 || ul > 50) throw new Error('invalid_urgent_limit')

  const [todayRow, monthRow, totalOrdersRow, pendingDeliveriesRow, farmPendingRow, urgentCountRow, urgentItems, series] = await Promise.all([
    get(
      `SELECT COALESCE(SUM(total_points), 0)::bigint AS revenue_points,
              COUNT(*)::int AS orders_count
       FROM orders
       WHERE status = 'paid'
         AND created_at >= date_trunc('day', now())`,
    ),
    get(
      `SELECT COALESCE(SUM(total_points), 0)::bigint AS revenue_points,
              COUNT(*)::int AS orders_count
       FROM orders
       WHERE status = 'paid'
         AND created_at >= date_trunc('month', now())`,
    ),
    get(`SELECT COUNT(*)::bigint AS c FROM orders`),
    get(
      `SELECT COUNT(*)::bigint AS c
       FROM deliveries
       WHERE status IN ('pending_claim', 'pending_fulfillment')`,
    ),
    get(`SELECT COUNT(*)::bigint AS c FROM farm_requests WHERE status = 'pending'`),
    get(
      `SELECT COUNT(*)::bigint AS c
       FROM farm_requests
       WHERE status = 'pending'
         AND created_at <= now() - ($1::int * interval '1 minute')`,
      [Math.trunc(um)],
    ),
    ul > 0
      ? all(
          `SELECT fr.id, fr.order_id, fr.delivery_id, fr.created_at,
                  u.email,
                  p.name AS product_name
           FROM farm_requests fr
           JOIN users u ON u.id = fr.user_id
           JOIN products p ON p.id = fr.product_id
           WHERE fr.status = 'pending'
             AND fr.created_at <= now() - ($1::int * interval '1 minute')
           ORDER BY fr.created_at ASC
           LIMIT $2`,
          [Math.trunc(um), Math.trunc(ul)],
        )
      : Promise.resolve([]),
    all(
      `WITH days AS (
         SELECT generate_series(
           date_trunc('day', now()) - (($1::int - 1) * interval '1 day'),
           date_trunc('day', now()),
           interval '1 day'
         ) AS day
       )
       SELECT to_char(d.day, 'YYYY-MM-DD') AS day,
              COALESCE(SUM(o.total_points), 0)::bigint AS revenue_points,
              COUNT(o.id)::int AS orders_count
       FROM days d
       LEFT JOIN orders o
         ON o.status = 'paid'
        AND o.created_at >= d.day
        AND o.created_at < d.day + interval '1 day'
       GROUP BY d.day
       ORDER BY d.day ASC`,
      [Math.trunc(d)],
    ),
  ])

  return {
    generated_at: new Date().toISOString(),
    revenue_today_points: Number(todayRow?.revenue_points ?? 0),
    orders_today_count: Number(todayRow?.orders_count ?? 0),
    revenue_month_points: Number(monthRow?.revenue_points ?? 0),
    orders_month_count: Number(monthRow?.orders_count ?? 0),
    orders_total_count: Number(totalOrdersRow?.c ?? 0),
    deliveries_pending_count: Number(pendingDeliveriesRow?.c ?? 0),
    farm_pending_count: Number(farmPendingRow?.c ?? 0),
    farm_urgent_count: Number(urgentCountRow?.c ?? 0),
    farm_urgent_items: Array.isArray(urgentItems) ? urgentItems : [],
    revenue_series: Array.isArray(series)
      ? series.map((r) => ({
          day: String(r.day ?? ''),
          revenue_points: Number(r.revenue_points ?? 0),
          orders_count: Number(r.orders_count ?? 0),
        }))
      : [],
    days: Math.trunc(d),
    urgent_minutes: Math.trunc(um),
  }
}

export async function adminGetOpsPulse({ days = 14, limit = 12, supportSlaMinutes = 30, farmSlaMinutes = 60 } = {}) {
  const d = Number(days)
  const lim = Number(limit)
  const supportSla = Number(supportSlaMinutes)
  const farmSla = Number(farmSlaMinutes)

  if (!Number.isFinite(d) || d <= 0 || d > 90) throw new Error('invalid_days')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 50) throw new Error('invalid_limit')
  if (!Number.isFinite(supportSla) || supportSla <= 0 || supportSla > 43200) throw new Error('invalid_support_sla_minutes')
  if (!Number.isFinite(farmSla) || farmSla <= 0 || farmSla > 43200) throw new Error('invalid_farm_sla_minutes')

  const [
    supportOpenCount,
    supportPendingCount,
    supportUnassignedCount,
    supportFirstResponseAvg,
    supportResolveAvg,
    supportOverSla,
    farmPendingCount,
    farmInProgressCount,
    farmUnassignedCount,
    farmAssignAvg,
    farmFulfillAvg,
    farmOverSla,
    supportNotifications,
    farmNotifications,
  ] = await Promise.all([
    get(`SELECT COUNT(*)::int AS c FROM support_tickets WHERE status = 'open'`),
    get(`SELECT COUNT(*)::int AS c FROM support_tickets WHERE status = 'pending'`),
    get(`SELECT COUNT(*)::int AS c FROM support_tickets WHERE status IN ('open', 'pending') AND assigned_to IS NULL`),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60.0) AS avg_minutes
       FROM support_tickets
       WHERE first_response_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 60.0) AS avg_minutes
       FROM support_tickets
       WHERE resolved_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM support_tickets
       WHERE status IN ('open', 'pending')
         AND first_response_at IS NULL
         AND created_at <= now() - ($1::int * interval '1 minute')`,
      [Math.trunc(supportSla)],
    ),
    get(`SELECT COUNT(*)::int AS c FROM farm_requests WHERE status = 'pending'`),
    get(`SELECT COUNT(*)::int AS c FROM farm_requests WHERE status = 'in_progress'`),
    get(`SELECT COUNT(*)::int AS c FROM farm_requests WHERE status = 'pending' AND assigned_booster_id IS NULL`),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (assigned_at - created_at)) / 60.0) AS avg_minutes
       FROM farm_requests
       WHERE assigned_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT AVG(EXTRACT(EPOCH FROM (fulfilled_at - created_at)) / 60.0) AS avg_minutes
       FROM farm_requests
       WHERE fulfilled_at IS NOT NULL
         AND created_at >= now() - ($1::int * interval '1 day')`,
      [Math.trunc(d)],
    ),
    get(
      `SELECT COUNT(*)::int AS c
       FROM farm_requests
       WHERE status = 'pending'
         AND created_at <= now() - ($1::int * interval '1 minute')`,
      [Math.trunc(farmSla)],
    ),
    all(
      `SELECT t.id,
              t.subject,
              t.status,
              t.created_at,
              t.last_message_at,
              t.assigned_to,
              u.email AS user_email
       FROM support_tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.status IN ('open', 'pending')
       ORDER BY COALESCE(t.last_message_at, t.created_at) DESC
       LIMIT $1`,
      [Math.max(1, Math.ceil(lim / 2))],
    ),
    all(
      `SELECT fr.id,
              fr.status,
              fr.created_at,
              fr.assigned_booster_id,
              u.email,
              p.name AS product_name
       FROM farm_requests fr
       JOIN users u ON u.id = fr.user_id
       JOIN products p ON p.id = fr.product_id
       WHERE fr.status = 'pending'
       ORDER BY fr.created_at ASC
       LIMIT $1`,
      [Math.max(1, lim)],
    ),
  ])

  const notifications = []

  for (const row of Array.isArray(supportNotifications) ? supportNotifications : []) {
    const unassigned = row?.assigned_to == null
    notifications.push({
      kind: 'support_ticket',
      severity: unassigned ? 'high' : 'medium',
      title: `Support #${row.id} ${row.subject || '-'}`,
      subtitle: `${row.user_email || '-'} • ${String(row.status || '').toLowerCase()}${unassigned ? ' • unassigned' : ''}`,
      created_at: row?.last_message_at || row?.created_at || null,
      ref: { module: 'support', id: Number(row?.id) || null },
    })
  }

  for (const row of Array.isArray(farmNotifications) ? farmNotifications : []) {
    const unassigned = row?.assigned_booster_id == null
    notifications.push({
      kind: 'farm_request',
      severity: unassigned ? 'high' : 'medium',
      title: `Farm #${row.id} ${row.product_name || '-'}`,
      subtitle: `${row.email || '-'} • pending${unassigned ? ' • unassigned' : ''}`,
      created_at: row?.created_at || null,
      ref: { module: 'fulfillment', id: Number(row?.id) || null },
    })
  }

  notifications.sort((a, b) => {
    const av = new Date(a?.created_at || 0).getTime()
    const bv = new Date(b?.created_at || 0).getTime()
    return bv - av
  })

  return {
    generated_at: new Date().toISOString(),
    days: Math.trunc(d),
    support_sla_minutes: Math.trunc(supportSla),
    farm_sla_minutes: Math.trunc(farmSla),
    summary: {
      support_open_count: Number(supportOpenCount?.c ?? 0),
      support_pending_count: Number(supportPendingCount?.c ?? 0),
      support_unassigned_count: Number(supportUnassignedCount?.c ?? 0),
      support_over_sla_count: Number(supportOverSla?.c ?? 0),
      farm_pending_count: Number(farmPendingCount?.c ?? 0),
      farm_in_progress_count: Number(farmInProgressCount?.c ?? 0),
      farm_unassigned_count: Number(farmUnassignedCount?.c ?? 0),
      farm_over_sla_count: Number(farmOverSla?.c ?? 0),
    },
    sla: {
      support_first_response_avg_minutes: Number(supportFirstResponseAvg?.avg_minutes ?? 0),
      support_resolution_avg_minutes: Number(supportResolveAvg?.avg_minutes ?? 0),
      farm_assign_avg_minutes: Number(farmAssignAvg?.avg_minutes ?? 0),
      farm_fulfill_avg_minutes: Number(farmFulfillAvg?.avg_minutes ?? 0),
    },
    notifications: notifications.slice(0, Math.trunc(lim)),
  }
}

export async function adminFulfillFarmRequest({ id, payload }) {
  const rid = Number(id)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const finalPayload = String(payload ?? '').trim()
  if (!finalPayload) throw new Error('invalid_payload')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rRes = await client.query(
      `SELECT id, delivery_id, status
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (!['pending', 'in_progress'].includes(String(r.status))) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const masked = maskPayload(finalPayload)
    await client.query(
      `UPDATE deliveries
       SET status = 'pending_claim', payload_masked = $2, payload = $3
       WHERE id = $1`,
      [r.delivery_id, masked, finalPayload],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'fulfilled', fulfilled_at = now()
       WHERE id = $1`,
      [rid],
    )

    const delivRow = await client.query(
      `SELECT user_id FROM deliveries WHERE id = $1 LIMIT 1`,
      [r.delivery_id],
    )
    const delivUserId = delivRow.rows?.[0]?.user_id || null

    await client.query('COMMIT')

    if (delivUserId) {
      sendPushToUser(delivUserId, {
        title: '✅ สินค้าของคุณพร้อมแล้ว!',
        body: 'เข้าไปที่กล่องรับของเพื่อรับสินค้าของคุณ',
        link: '/inbox',
        tag: `delivery-ready-${r.delivery_id}`,
        require_interaction: true,
      }).catch(() => {})
    }

    return { ok: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function deleteProduct(id) {
  const pid = Number(id)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_id')

  const existing = await get('SELECT id FROM products WHERE id = $1', [pid])
  if (!existing) throw new Error('not_found')

  const blockers = {
    order_items: 0,
    deliveries: 0,
    farm_requests: 0,
    mystery_prizes: 0,
    mystery_stock_items: 0,
  }

  const oi = await get('SELECT COUNT(*)::int AS c FROM order_items WHERE product_id = $1', [pid])
  blockers.order_items = Number(oi?.c ?? 0) || 0
  const del = await get('SELECT COUNT(*)::int AS c FROM deliveries WHERE product_id = $1', [pid])
  blockers.deliveries = Number(del?.c ?? 0) || 0
  const fr = await get('SELECT COUNT(*)::int AS c FROM farm_requests WHERE product_id = $1', [pid])
  blockers.farm_requests = Number(fr?.c ?? 0) || 0
  const mp = await get('SELECT COUNT(*)::int AS c FROM mystery_box_prizes WHERE prize_product_id = $1', [pid])
  blockers.mystery_prizes = Number(mp?.c ?? 0) || 0
  const ms = await get('SELECT COUNT(*)::int AS c FROM mystery_box_stock_items WHERE prize_product_id = $1', [pid])
  blockers.mystery_stock_items = Number(ms?.c ?? 0) || 0

  const total = Object.values(blockers).reduce((a, b) => a + (Number(b) || 0), 0)
  if (total > 0) {
    const err = new Error('product_in_use')
    err.detail = blockers
    throw err
  }

  await query('DELETE FROM products WHERE id = $1', [pid])
  return { ok: true }
}

export async function setUserRole({ userId, role, performedByOwner }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_id')

  const nextRole = typeof role === 'string' ? role.trim().toLowerCase() : ''
  const allowed = new Set(['user', 'admin', 'owner', 'finance', 'booster', 'support'])
  if (!allowed.has(nextRole)) throw new Error('invalid_role')

  const target = await get('SELECT id, role FROM users WHERE id = $1', [uid])
  if (!target) throw new Error('user_not_found')

  const targetRole = String(target.role || 'user')
  const byOwner = Boolean(performedByOwner)

  if (targetRole === 'owner' && !byOwner) throw new Error('forbidden_owner')
  if (nextRole === 'owner' && !byOwner) throw new Error('forbidden_owner')

  if (targetRole === 'owner' && nextRole !== 'owner') {
    const row = await get(`SELECT COUNT(*)::int AS c FROM users WHERE role = 'owner'`)
    if ((row?.c ?? 0) <= 1) throw new Error('cannot_remove_last_owner')
  }

  const isAdmin = nextRole === 'admin' || nextRole === 'owner'
  const isHead = nextRole === 'owner'
  await query('UPDATE users SET role = $2, is_admin = $3, is_head_admin = $4 WHERE id = $1', [uid, nextRole, isAdmin, isHead])
  return getUserById(uid)
}

export async function adjustUserPoints({ userId, points, refType, refId }) {
  const amount = Number(points)
  if (!Number.isFinite(amount) || amount === 0) throw new Error('invalid_points')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const txType = amount > 0 ? 'credit' : 'debit'
    const abs = Math.abs(amount)

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [userId, txType, abs, refType, refId],
    )

    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { applied: false, reason: 'duplicate' }
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId],
    )

    const delta = amount
    await client.query(
      `UPDATE wallets
       SET balance = balance + $1, updated_at = now()
       WHERE user_id = $2`,
      [delta, userId],
    )

    await client.query('COMMIT')
    return { applied: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function listWebhookLogs({ limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT id, provider, event_id, received_at, processed_at
     FROM webhook_logs
     ORDER BY id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}

export async function listAllTransactions({ limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT t.id, t.user_id, u.email, t.type, t.points, t.ref_type, t.ref_id, t.created_at
     FROM transactions t
     JOIN users u ON u.id = t.user_id
     ORDER BY t.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}

export async function checkPassword(password, passwordHash) {
  return verifyPassword(password, passwordHash)
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex')
  await query('INSERT INTO sessions (token, user_id) VALUES ($1, $2)', [token, userId])
  return token
}

export async function getSession(token) {
  return get(
    `SELECT s.token, s.user_id, u.email
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token = $1`,
    [token],
  )
}

export async function deleteSession(token) {
  const t = typeof token === 'string' ? token : ''
  if (!t) return { ok: false }
  await query('DELETE FROM sessions WHERE token = $1', [t])
  return { ok: true }
}

export async function getWallet(userId) {
  return get('SELECT user_id, balance, updated_at FROM wallets WHERE user_id = $1', [userId])
}

export async function createTopup({
  userId,
  amountPoints,
  method,
  provider,
  providerRef,
  reference,
  status,
}) {
  const result = await query(
    `INSERT INTO topups (user_id, amount, amount_points, method, provider, provider_ref, reference, status, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())
     RETURNING id`,
    [
      userId,
      amountPoints,
      amountPoints,
      method ?? null,
      provider ?? null,
      providerRef ?? null,
      reference ?? null,
      status,
    ],
  )
  return result.rows[0].id
}

export async function listTopups({ limit = 50, offset = 0, providerRef = '' } = {}) {
  const ref = String(providerRef ?? '').trim().slice(0, 120)
  if (ref) {
    return all(
      `SELECT t.*, u.email
       FROM topups t
       JOIN users u ON u.id = t.user_id
       WHERE t.provider_ref ILIKE $1
       ORDER BY t.id DESC
       LIMIT $2 OFFSET $3`,
      [`%${ref}%`, limit, offset],
    )
  }

  return all(
    `SELECT t.*, u.email
     FROM topups t
     JOIN users u ON u.id = t.user_id
     ORDER BY t.id DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset],
  )
}

export async function listTopupLogs({ limit = 200, offset = 0, search = '', providerRef = '' } = {}) {
  const userQuery = String(search ?? '').trim().slice(0, 120)
  const ref = String(providerRef ?? '').trim().slice(0, 120)
  const where = []
  const params = []

  if (userQuery) {
    params.push(`%${userQuery}%`)
    where.push(`(u.email ILIKE $${params.length} OR u.username ILIKE $${params.length})`)
  }
  if (ref) {
    params.push(`%${ref}%`)
    where.push(`t.provider_ref ILIKE $${params.length}`)
  }

  params.push(limit)
  const limitParam = params.length
  params.push(offset)
  const offsetParam = params.length

  return all(
    `SELECT t.*, u.email, u.username
     FROM topups t
     JOIN users u ON u.id = t.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY t.id DESC
     LIMIT $${limitParam} OFFSET $${offsetParam}`,
    params,
  )
}

export async function getTopupById(id) {
  return get('SELECT * FROM topups WHERE id = $1', [id])
}

export async function getTopupByProviderRef({ provider, providerRef }) {
  const p = String(provider ?? '').trim()
  const ref = String(providerRef ?? '').trim()
  if (!p || !ref) return null
  return get('SELECT * FROM topups WHERE provider = $1 AND provider_ref = $2', [p, ref])
}

export async function updateTopupProviderRef({ topupId, providerRef }) {
  const tid = Number(topupId)
  const ref = String(providerRef ?? '').trim()
  if (!Number.isFinite(tid)) throw new Error('invalid_id')
  if (!ref) throw new Error('invalid_provider_ref')
  await query(
    `UPDATE topups
     SET provider_ref = $2, updated_at = now()
     WHERE id = $1`,
    [tid, ref],
  )
}

export async function updateTopupStatus({ topupId, status, onlyFromStatus } = {}) {
  const tid = Number(topupId)
  const nextStatus = String(status ?? '').trim()
  const currentStatus = onlyFromStatus == null ? null : String(onlyFromStatus).trim()

  if (!Number.isFinite(tid) || tid <= 0) throw new Error('invalid_topup_id')
  if (!nextStatus) throw new Error('invalid_topup_status')

  if (currentStatus) {
    const result = await query(
      `UPDATE topups
       SET status = $2, updated_at = now()
       WHERE id = $1 AND status = $3`,
      [tid, nextStatus, currentStatus],
    )
    return { updated: Number(result?.rowCount ?? 0) }
  }

  const result = await query(
    `UPDATE topups
     SET status = $2, updated_at = now()
     WHERE id = $1`,
    [tid, nextStatus],
  )
  return { updated: Number(result?.rowCount ?? 0) }
}

export async function logWebhookEvent({ provider, eventId, payload }) {
  try {
    const res = await query(
      `INSERT INTO webhook_logs (provider, event_id, payload)
       VALUES ($1, $2, $3)
       ON CONFLICT (provider, event_id) DO NOTHING
       RETURNING id`,
      [provider, eventId, payload],
    )
    return { inserted: res.rowCount === 1 }
  } catch (e) {
    throw e
  }
}

export async function markWebhookProcessed({ provider, eventId }) {
  await query(
    `UPDATE webhook_logs
     SET processed_at = now()
     WHERE provider = $1 AND event_id = $2`,
    [provider, eventId],
  )
}

export async function creditPointsForTopup({ topupId, approvedBy, refType, refId }) {
  const tid = Number(topupId)
  if (!Number.isFinite(tid) || tid <= 0) throw new Error('invalid_topup_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const topupRes = await client.query('SELECT * FROM topups WHERE id = $1 FOR UPDATE', [tid])
    const topup = topupRes.rows?.[0]
    if (!topup) throw new Error('topup_not_found')

    if (String(topup.status || '') === 'paid') {
      await client.query('ROLLBACK')
      return { credited: false, reason: 'already_paid' }
    }

    const points = Number(topup.amount_points ?? topup.amount)
    if (!Number.isFinite(points) || points <= 0) throw new Error('invalid_points')

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, $3, $4)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [topup.user_id, points, refType, refId],
    )

    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      return { credited: false, reason: 'duplicate' }
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [topup.user_id],
    )

    await client.query(
      `UPDATE wallets
       SET balance = balance + $1, updated_at = now()
       WHERE user_id = $2`,
      [points, topup.user_id],
    )

    await client.query(
      `UPDATE topups
       SET status = 'paid', approved_by = COALESCE(approved_by, $1), updated_at = now()
       WHERE id = $2`,
      [approvedBy ?? null, tid],
    )

    await client.query('COMMIT')
    return { credited: true }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}

export async function listMyTransactions(userId, { limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT id, type, points, ref_type, ref_id, created_at
     FROM transactions
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
}

export async function listMyTopups(userId, { limit = 50, offset = 0 } = {}) {
  return all(
    `SELECT id, amount, amount_points, method, provider, provider_ref, reference, status, created_at, updated_at
     FROM topups
     WHERE user_id = $1
     ORDER BY id DESC
     LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  )
}

export async function cancelPendingTopupsByMethod({
  userId,
  method,
  provider,
  fromStatus = 'pending_slip',
  toStatus = 'replaced',
} = {}) {
  const uid = Number(userId)
  const m = String(method ?? '').trim()
  const p = String(provider ?? '').trim()
  const from = String(fromStatus ?? '').trim()
  const to = String(toStatus ?? '').trim()

  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!m || !p) throw new Error('invalid_topup_method')
  if (!from || !to) throw new Error('invalid_topup_status')

  const result = await query(
    `UPDATE topups
     SET status = $5, updated_at = now()
     WHERE user_id = $1
       AND method = $2
       AND provider = $3
       AND status = $4`,
    [uid, m, p, from, to],
  )

  return { updated: Number(result?.rowCount ?? 0) }
}

export async function listCategories() {
  return listCategoriesWithOptions()
}

async function listCategoriesWithOptions({ includeHidden = false } = {}) {
  if (includeHidden) {
    return all('SELECT id, name, slug, image_url, description, is_hidden FROM categories ORDER BY id ASC')
  }
  return all('SELECT id, name, slug, image_url, description, is_hidden FROM categories WHERE is_hidden = false ORDER BY id ASC')
}

export async function adminListCategories() {
  return listCategoriesWithOptions({ includeHidden: true })
}

export async function adminSetCategoryHidden({ categoryId, isHidden } = {}) {
  const cid = Number(categoryId)
  if (!Number.isFinite(cid) || cid <= 0) throw new Error('invalid_category_id')
  const hidden = Boolean(isHidden)
  const updated = await query('UPDATE categories SET is_hidden = $2 WHERE id = $1 RETURNING id', [cid, hidden])
  if (!updated?.rows?.length) throw new Error('not_found')
  return { ok: true }
}

export async function listProducts({ categorySlug, includeHidden } = {}) {
  const showHidden = Boolean(includeHidden)
  if (categorySlug) {
    if (String(categorySlug).trim() === 'featured') {
      const rows = await all(
        `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
                pr.id AS promo_id,
                pr.title AS promo_title,
                pr.discount_percent AS promo_discount_percent,
                pr.discount_amount_points AS promo_discount_amount_points,
                pr.starts_at AS promo_starts_at,
                pr.ends_at AS promo_ends_at,
                CASE
                  WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                    THEN ((p.price * pr.discount_percent) / 100.0)::int
                  WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                    THEN pr.discount_amount_points
                  ELSE 0
                END AS promo_discount_points,
                CASE
                  WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                    THEN (p.price - ((p.price * pr.discount_percent) / 100.0))
                  WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                    THEN (p.price - pr.discount_amount_points)
                  ELSE p.price
                END AS price_final_points,
                CASE
                  WHEN p.is_unlimited_stock THEN 999999
                  WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
                  WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
                  ELSE p.stock
                END AS stock,
                p.is_unlimited_stock
         FROM products p
         JOIN categories c ON c.id = p.category_id
         LEFT JOIN LATERAL (
           SELECT id, title, discount_percent, discount_amount_points, starts_at, ends_at
           FROM product_promotions
           WHERE product_id = p.id
             AND is_active = true
             AND (starts_at IS NULL OR starts_at <= now())
             AND (ends_at IS NULL OR ends_at >= now())
           ORDER BY id DESC
           LIMIT 1
         ) pr ON true
         LEFT JOIN (
           SELECT b.product_id, COUNT(*)::int AS available_stock
           FROM stock_pool_items spi
           JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
           WHERE spi.status = 'available'
           GROUP BY b.product_id
         ) s ON s.product_id = p.id
         ${MYSTERY_AVAILABLE_STOCK_JOIN}
         WHERE p.is_featured = true
           AND ($1::boolean = true OR p.is_hidden = false)
         ORDER BY p.sort_order ASC, p.id DESC`,
        [showHidden],
      )
      return attachProductOptionsToRows(rows)
    }
    const rows = await all(
      `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
              pr.id AS promo_id,
              pr.title AS promo_title,
              pr.discount_percent AS promo_discount_percent,
              pr.discount_amount_points AS promo_discount_amount_points,
              pr.starts_at AS promo_starts_at,
              pr.ends_at AS promo_ends_at,
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END AS promo_discount_points,
              (p.price - (
                CASE
                  WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                    THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                  WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                    THEN LEAST(p.price, pr.discount_amount_points)::int
                  ELSE 0
                END
              ))::int AS price_final_points,
              CASE
                WHEN p.is_unlimited_stock THEN 999999
                WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
                WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
                ELSE p.stock
              END AS stock,
              p.is_unlimited_stock
       FROM products p
       JOIN categories c ON c.id = p.category_id
       LEFT JOIN LATERAL (
         SELECT id, title, discount_percent, discount_amount_points, starts_at, ends_at
         FROM product_promotions
         WHERE product_id = p.id
           AND is_active = true
           AND (starts_at IS NULL OR starts_at <= now())
           AND (ends_at IS NULL OR ends_at >= now())
         ORDER BY id DESC
         LIMIT 1
       ) pr ON true
       LEFT JOIN (
         SELECT b.product_id, COUNT(*)::int AS available_stock
         FROM stock_pool_items spi
         JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
         WHERE spi.status = 'available'
         GROUP BY b.product_id
       ) s ON s.product_id = p.id
       ${MYSTERY_AVAILABLE_STOCK_JOIN}
       WHERE c.slug = $1
         AND ($2::boolean = true OR p.is_hidden = false)
       ORDER BY p.sort_order ASC, p.id DESC`,
      [categorySlug, showHidden],
    )
    return attachProductOptionsToRows(rows)
  }

  const rows = await all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            pr.id AS promo_id,
            pr.title AS promo_title,
            pr.discount_percent AS promo_discount_percent,
            pr.discount_amount_points AS promo_discount_amount_points,
            pr.starts_at AS promo_starts_at,
            pr.ends_at AS promo_ends_at,
            CASE
              WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
              WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                THEN LEAST(p.price, pr.discount_amount_points)::int
              ELSE 0
            END AS promo_discount_points,
            (p.price - (
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END
            ))::int AS price_final_points,
            CASE
              WHEN p.is_unlimited_stock THEN 999999
              WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
              WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
              ELSE p.stock
            END AS stock,
            p.is_unlimited_stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT id, title, discount_percent, discount_amount_points, starts_at, ends_at
       FROM product_promotions
       WHERE product_id = p.id
         AND is_active = true
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())
       ORDER BY id DESC
       LIMIT 1
     ) pr ON true
     LEFT JOIN (
       SELECT b.product_id, COUNT(*)::int AS available_stock
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE spi.status = 'available'
       GROUP BY b.product_id
     ) s ON s.product_id = p.id
     ${MYSTERY_AVAILABLE_STOCK_JOIN}
     WHERE ($1::boolean = true OR p.is_hidden = false)
     ORDER BY p.sort_order ASC, p.id DESC`,
    [showHidden],
  )
  return attachProductOptionsToRows(rows)
}

export async function getProductById(id, { includeHidden } = {}) {
  const showHidden = Boolean(includeHidden)
  const row = await get(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            pr.id AS promo_id,
            pr.title AS promo_title,
            pr.discount_percent AS promo_discount_percent,
            pr.discount_amount_points AS promo_discount_amount_points,
            pr.starts_at AS promo_starts_at,
            pr.ends_at AS promo_ends_at,
            CASE
              WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
              WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                THEN LEAST(p.price, pr.discount_amount_points)::int
              ELSE 0
            END AS promo_discount_points,
            (p.price - (
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END
            ))::int AS price_final_points,
            CASE
              WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
              WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
              ELSE p.stock
            END AS stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT id, title, discount_percent, discount_amount_points, starts_at, ends_at
       FROM product_promotions
       WHERE product_id = p.id
         AND is_active = true
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())
       ORDER BY id DESC
       LIMIT 1
     ) pr ON true
     LEFT JOIN (
       SELECT b.product_id, COUNT(*)::int AS available_stock
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE spi.status = 'available'
       GROUP BY b.product_id
     ) s ON s.product_id = p.id
     ${MYSTERY_AVAILABLE_STOCK_JOIN}
     WHERE p.id = $1
       AND ($2::boolean = true OR p.is_hidden = false)`,
    [id, showHidden],
  )
  return attachProductOptionsToRows(row)
}

export async function listProductsByIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return []
  const clean = ids.map((v) => Number(v)).filter((n) => Number.isFinite(n) && n > 0)
  if (clean.length === 0) return []
  if (clean.length > 100) throw new Error('too_many_ids')
  const placeholders = clean.map((_, i) => `$${i + 1}`).join(',')
  const rows = await all(
    `SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            pr.id AS promo_id,
            pr.title AS promo_title,
            pr.discount_percent AS promo_discount_percent,
            pr.discount_amount_points AS promo_discount_amount_points,
            pr.starts_at AS promo_starts_at,
            pr.ends_at AS promo_ends_at,
            CASE
              WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
              WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                THEN LEAST(p.price, pr.discount_amount_points)::int
              ELSE 0
            END AS promo_discount_points,
            (p.price - (
              CASE
                WHEN pr.discount_percent IS NOT NULL AND pr.discount_percent > 0
                  THEN LEAST(p.price, FLOOR((p.price * pr.discount_percent) / 100.0))::int
                WHEN pr.discount_amount_points IS NOT NULL AND pr.discount_amount_points > 0
                  THEN LEAST(p.price, pr.discount_amount_points)::int
                ELSE 0
              END
            ))::int AS price_final_points,
            CASE
              WHEN p.is_unlimited_stock THEN 999999
              WHEN p.fulfillment_type = 'digital_stock' THEN COALESCE(s.available_stock, p.stock)
              WHEN p.fulfillment_type = 'mystery_box' THEN COALESCE(m.available_stock, 0)
              ELSE p.stock
            END AS stock,
            p.is_unlimited_stock
     FROM products p
     JOIN categories c ON c.id = p.category_id
     LEFT JOIN LATERAL (
       SELECT id, title, discount_percent, discount_amount_points, starts_at, ends_at
       FROM product_promotions
       WHERE product_id = p.id
         AND is_active = true
         AND (starts_at IS NULL OR starts_at <= now())
         AND (ends_at IS NULL OR ends_at >= now())
       ORDER BY id DESC
       LIMIT 1
     ) pr ON true
     LEFT JOIN (
       SELECT b.product_id, COUNT(*)::int AS available_stock
       FROM stock_pool_items spi
       JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id
       WHERE spi.status = 'available'
       GROUP BY b.product_id
     ) s ON s.product_id = p.id
     ${MYSTERY_AVAILABLE_STOCK_JOIN}
     WHERE p.id IN (${placeholders})
       AND p.is_hidden = false`,
    clean,
  )
  const withOptions = await attachProductOptionsToRows(rows)
  const byId = new Map(withOptions.map((r) => [Number(r.id), r]))
  return clean.map((id) => byId.get(id)).filter(Boolean)
}

export async function adminSetProductHidden({ productId, isHidden } = {}) {
  const pid = Number(productId)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  const hidden = Boolean(isHidden)
  const res = await query('UPDATE products SET is_hidden = $2 WHERE id = $1 RETURNING id', [pid, hidden])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  return { ok: true }
}

export async function getBulkProductOptionStockAvailability(productIds) {
  const ids = Array.from(new Set((Array.isArray(productIds) ? productIds : []).map(Number).filter((n) => Number.isFinite(n) && n > 0)))
  if (ids.length === 0) return {}

  const products = await all(
    `SELECT id, fulfillment_type, stock, is_unlimited_stock FROM products WHERE id = ANY($1)`,
    [ids],
  )

  const byProduct = await listActiveProductOptionItemsByProductIds(ids)

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ')
  const bindings = await all(
    `SELECT b.product_id, b.product_option_id, b.pool_id,
            p.kind, p.quantity_remaining, p.is_active,
            COALESCE(s.available_count, 0)::int AS available_count
     FROM product_option_stock_bindings b
     JOIN stock_pools p ON p.id = b.pool_id
     LEFT JOIN (
       SELECT pool_id, COUNT(*)::int AS available_count
       FROM stock_pool_items
       WHERE status = 'available'
       GROUP BY pool_id
     ) s ON s.pool_id = b.pool_id
     WHERE b.product_id IN (${placeholders})`,
    ids,
  )

  const bindingsByProduct = {}
  for (const r of bindings) {
    const pid = String(r.product_id)
    if (!bindingsByProduct[pid]) bindingsByProduct[pid] = []
    bindingsByProduct[pid].push(r)
  }

  const result = {}
  for (const product of products) {
    const pid = String(product.id)
    const opts = byProduct[pid] ?? []
    const productBindings = bindingsByProduct[pid] ?? []

    const byOption = {}
    for (const r of productBindings) {
      const optionId = r.product_option_id == null ? '' : String(r.product_option_id)
      const poolKind = String(r.kind)
      const isActive = r.is_active !== false
      let remaining = 0
      if (!isActive) remaining = 0
      else if (poolKind === 'quantity') remaining = Number(r.quantity_remaining ?? 0) || 0
      else remaining = Number(r.available_count ?? 0) || 0
      byOption[optionId] = { pool_id: Number(r.pool_id), kind: poolKind, is_active: Boolean(isActive), remaining }
    }

    const legacyRemaining = Boolean(product?.is_unlimited_stock) ? null : Number(product?.stock ?? 0) || 0
    for (const o of opts) {
      const oid = String(o?.id ?? '')
      if (!oid) continue
      if (byOption[oid] == null) byOption[oid] = { pool_id: null, kind: null, is_active: null, remaining: legacyRemaining }
    }

    result[pid] = byOption
  }
  return result
}

export async function getProductOptionStockAvailability(productId) {
  const pid = Number(productId)
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')

  const product = await get(
    `SELECT id, fulfillment_type, stock, is_unlimited_stock
     FROM products
     WHERE id = $1`,
    [pid],
  )
  if (!product) throw new Error('not_found')

  const byProduct = await listActiveProductOptionItemsByProductIds([pid])
  const opts = byProduct[String(pid)] ?? []

  const bindings = await all(
    `SELECT b.product_option_id, b.pool_id,
            p.kind, p.quantity_remaining, p.is_active,
            COALESCE(s.available_count, 0)::int AS available_count
     FROM product_option_stock_bindings b
     JOIN stock_pools p ON p.id = b.pool_id
     LEFT JOIN (
       SELECT pool_id, COUNT(*)::int AS available_count
       FROM stock_pool_items
       WHERE status = 'available'
       GROUP BY pool_id
     ) s ON s.pool_id = b.pool_id
     WHERE b.product_id = $1`,
    [pid],
  )

  const byOption = {}
  for (const r of bindings) {
    const optionId = r.product_option_id == null ? '' : String(r.product_option_id)
    const poolKind = String(r.kind)
    const isActive = r.is_active !== false
    let remaining = 0
    if (!isActive) remaining = 0
    else if (poolKind === 'quantity') remaining = Number(r.quantity_remaining ?? 0) || 0
    else remaining = Number(r.available_count ?? 0) || 0
    byOption[optionId] = {
      pool_id: Number(r.pool_id),
      kind: poolKind,
      is_active: Boolean(isActive),
      remaining,
    }
  }

  const legacyRemaining = Boolean(product?.is_unlimited_stock)
    ? null
    : Number(product?.stock ?? 0) || 0

  for (const o of opts) {
    const oid = String(o?.id ?? '')
    if (!oid) continue
    if (byOption[oid] == null) {
      byOption[oid] = {
        pool_id: null,
        kind: null,
        is_active: null,
        remaining: legacyRemaining,
      }
    }
  }

  return { product_id: pid, option_stock: byOption }
}

// ── Announcements ──

export async function listAnnouncementsPublic() {
  return all(
    `SELECT id, title, text, link, bg, icon, enabled, sort_order, start_at, end_at, created_at
     FROM announcements
     WHERE enabled = true
       AND (start_at IS NULL OR start_at <= now())
       AND (end_at IS NULL OR end_at > now())
     ORDER BY sort_order ASC, id ASC`,
  )
}

export async function adminListAnnouncements() {
  return all(
    `SELECT id, title, text, link, bg, icon, enabled, push_to_inbox, sort_order, start_at, end_at, created_at, updated_at
     FROM announcements
     ORDER BY sort_order ASC, id ASC`,
  )
}

export async function adminCreateAnnouncement({ title, text, link, bg, icon, enabled, pushToInbox, sortOrder, startAt, endAt }) {
  const t = String(text ?? '').trim()
  if (!t) throw new Error('invalid_text')
  const res = await query(
    `INSERT INTO announcements (title, text, link, bg, icon, enabled, push_to_inbox, sort_order, start_at, end_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      String(title ?? '').trim().slice(0, 200),
      t.slice(0, 300),
      String(link ?? '').trim().slice(0, 300),
      String(bg ?? '').trim().slice(0, 200),
      String(icon ?? '').trim().slice(0, 2000),
      enabled !== false,
      pushToInbox === true,
      Number(sortOrder) || 0,
      startAt || null,
      endAt || null,
    ],
  )
  return res.rows[0]
}

export async function adminUpdateAnnouncement(id, { title, text, link, bg, icon, enabled, pushToInbox, sortOrder, startAt, endAt }) {
  const aid = Number(id)
  if (!Number.isFinite(aid) || aid <= 0) throw new Error('invalid_id')
  const t = String(text ?? '').trim()
  if (!t) throw new Error('invalid_text')
  const res = await query(
    `UPDATE announcements
     SET title = $2, text = $3, link = $4, bg = $5, icon = $6, enabled = $7, push_to_inbox = $8, sort_order = $9, start_at = $10, end_at = $11, updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      aid,
      String(title ?? '').trim().slice(0, 200),
      t.slice(0, 300),
      String(link ?? '').trim().slice(0, 300),
      String(bg ?? '').trim().slice(0, 200),
      String(icon ?? '').trim().slice(0, 2000),
      enabled !== false,
      pushToInbox === true,
      Number(sortOrder) || 0,
      startAt || null,
      endAt || null,
    ],
  )
  return res.rows[0] || null
}

export async function adminDeleteAnnouncement(id) {
  const aid = Number(id)
  if (!Number.isFinite(aid) || aid <= 0) throw new Error('invalid_id')
  await query(`DELETE FROM announcements WHERE id = $1`, [aid])
}

export async function adminReorderAnnouncements(orderedIds) {
  if (!Array.isArray(orderedIds) || !orderedIds.length) return
  for (let i = 0; i < orderedIds.length; i++) {
    const aid = Number(orderedIds[i])
    if (Number.isFinite(aid) && aid > 0) {
      await query(`UPDATE announcements SET sort_order = $1, updated_at = now() WHERE id = $2`, [i, aid])
    }
  }
}

// ── Site Messages ──

export async function adminCreateSiteMessage({ senderId, targetType, targetUserId, title, body }) {
  const tt = targetType === 'individual' ? 'individual' : 'global'
  const t = String(title ?? '').trim()
  if (!t) throw new Error('invalid_title')
  const b = String(body ?? '').trim()
  const sid = senderId ? Number(senderId) : null
  const tuid = tt === 'individual' ? Number(targetUserId) : null
  if (tt === 'individual' && (!Number.isFinite(tuid) || tuid <= 0)) throw new Error('invalid_target_user')
  const res = await query(
    `INSERT INTO site_messages (sender_id, target_type, target_user_id, title, body)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, created_at`,
    [sid, tt, tuid, t.slice(0, 200), b.slice(0, 5000)],
  )
  return res.rows[0]
}

export async function adminListSiteMessages({ limit = 50, offset = 0 } = {}) {
  const lim = Math.min(200, Math.max(1, Number(limit) || 50))
  const off = Math.max(0, Number(offset) || 0)
  const rows = await all(
    `SELECT m.id, m.sender_id, u.email AS sender_email, m.target_type, m.target_user_id,
            tu.email AS target_email, tu.display_name AS target_display_name,
            m.title, m.body, m.created_at
     FROM site_messages m
     LEFT JOIN users u ON u.id = m.sender_id
     LEFT JOIN users tu ON tu.id = m.target_user_id
     ORDER BY m.created_at DESC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
  const countRes = await get(`SELECT COUNT(*)::int AS total FROM site_messages`)
  return { messages: rows, total: countRes?.total || 0 }
}

export async function listMySiteMessages(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  const lim = Math.min(200, Math.max(1, Number(limit) || 50))
  const off = Math.max(0, Number(offset) || 0)
  return all(
    `SELECT m.id, m.title, m.body, m.target_type, m.created_at,
            CASE WHEN r.read_at IS NOT NULL THEN true ELSE false END AS is_read
     FROM site_messages m
     LEFT JOIN site_message_reads r ON r.message_id = m.id AND r.user_id = $1
     WHERE m.target_type = 'global' OR m.target_user_id = $1
     ORDER BY m.created_at DESC
     LIMIT $2 OFFSET $3`,
    [uid, lim, off],
  )
}

export async function countUnreadSiteMessages(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) return 0
  const row = await get(
    `SELECT COUNT(*)::int AS cnt
     FROM site_messages m
     WHERE (m.target_type = 'global' OR m.target_user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM site_message_reads r WHERE r.message_id = m.id AND r.user_id = $1)`,
    [uid],
  )
  return row?.cnt || 0
}

export async function markSiteMessageRead(userId, messageId) {
  const uid = Number(userId)
  const mid = Number(messageId)
  if (!Number.isFinite(uid) || !Number.isFinite(mid)) return
  await query(
    `INSERT INTO site_message_reads (user_id, message_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [uid, mid],
  )
}

export async function markAllSiteMessagesRead(userId) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) return
  await query(
    `INSERT INTO site_message_reads (user_id, message_id)
     SELECT $1, m.id FROM site_messages m
     WHERE (m.target_type = 'global' OR m.target_user_id = $1)
       AND NOT EXISTS (SELECT 1 FROM site_message_reads r WHERE r.message_id = m.id AND r.user_id = $1)`,
    [uid],
  )
}

export async function adminDeleteSiteMessage(id) {
  const mid = Number(id)
  if (!Number.isFinite(mid) || mid <= 0) throw new Error('invalid_id')
  await query(`DELETE FROM site_message_reads WHERE message_id = $1`, [mid])
  await query(`DELETE FROM site_messages WHERE id = $1`, [mid])
}

// ─────────────────────────────────────────────
// ── Product Bundles ──
// ─────────────────────────────────────────────

async function getBundleWithItems(bundleId) {
  const b = await get(`SELECT * FROM product_bundles WHERE id = $1`, [bundleId])
  if (!b) return null
  const rows = await all(
    `SELECT bi.id, bi.bundle_id, bi.product_id, bi.qty, bi.product_option_id, bi.sort_order,
            p.name AS product_name, p.image_url AS product_image_url, p.price AS product_base_price,
            p.fulfillment_type, p.is_unlimited_stock, p.stock,
            poi.label AS product_option_label, poi.value_text AS product_option_value,
            poi.price_points AS product_option_price_points
     FROM bundle_items bi
     JOIN products p ON p.id = bi.product_id
     LEFT JOIN product_option_items poi
       ON poi.product_id = bi.product_id
      AND poi.option_id = bi.product_option_id
      AND poi.is_active = true
     WHERE bi.bundle_id = $1
     ORDER BY bi.sort_order ASC, bi.id ASC`,
    [bundleId],
  )
  const items = rows.map((it) => {
    const optionId = it.product_option_id == null ? '' : String(it.product_option_id).trim()
    const optionPriceRaw = optionId ? it.product_option_price_points : null
    const optionPrice = optionPriceRaw == null || optionPriceRaw === '' ? null : Number(optionPriceRaw)
    const basePrice = Number(it.product_base_price ?? 0) || 0
    const productPrice = Number.isFinite(optionPrice) ? optionPrice : basePrice
    const productOption = optionId
      ? {
          id: optionId,
          label: String(it.product_option_label || optionId).trim(),
          value: it.product_option_value ?? null,
          price_points: productPrice,
        }
      : null
    return {
      ...it,
      qty: Math.max(1, Math.trunc(Number(it.qty) || 1)),
      product_price: productPrice,
      product_option: productOption,
      product_option_missing: Boolean(optionId && !it.product_option_label),
    }
  })
  const originalTotal = items.reduce((s, it) => s + Number(it.product_price ?? 0) * Number(it.qty ?? 1), 0)
  return { ...b, items, original_total: originalTotal }
}

function assertBundlePurchasable(bundle) {
  if (!bundle) throw new Error('bundle_not_found')
  if (!bundle.is_active || bundle.is_hidden) throw new Error('bundle_not_available')

  const now = Date.now()
  if (bundle.starts_at && new Date(bundle.starts_at).getTime() > now) throw new Error('bundle_not_started')
  if (bundle.ends_at && new Date(bundle.ends_at).getTime() < now) throw new Error('bundle_expired')
  if (!Array.isArray(bundle.items) || bundle.items.length === 0) throw new Error('bundle_empty')
  if (bundle.items.some((item) => item.product_option_missing)) throw new Error('invalid_product_option')
}

function getBundleItemQty(item) {
  return Math.max(1, Math.trunc(Number(item?.qty) || 1))
}

function getBundleItemOptionId(item) {
  const raw = item?.product_option_id
  const optionId = typeof raw === 'string' && raw.trim() ? raw.trim() : raw == null ? '' : String(raw).trim()
  return optionId || null
}

async function findBundleStockPool(client, item, { lock = false } = {}) {
  const pid = Number(item?.product_id)
  if (!Number.isFinite(pid) || pid <= 0) return null
  const optionId = getBundleItemOptionId(item)
  const lockClause = lock ? ' FOR UPDATE OF sp' : ''

  if (optionId) {
    const optionRes = await client.query(
      `SELECT b.pool_id, sp.kind, sp.quantity_remaining, sp.is_active
       FROM product_option_stock_bindings b
       JOIN stock_pools sp ON sp.id = b.pool_id
       WHERE b.product_id = $1 AND b.product_option_id = $2
       LIMIT 1${lockClause}`,
      [pid, optionId],
    )
    if (optionRes.rows?.[0]) return optionRes.rows[0]
  }

  const defaultRes = await client.query(
    `SELECT b.pool_id, sp.kind, sp.quantity_remaining, sp.is_active
     FROM product_option_stock_bindings b
     JOIN stock_pools sp ON sp.id = b.pool_id
     WHERE b.product_id = $1 AND b.product_option_id IS NULL
     LIMIT 1${lockClause}`,
    [pid],
  )
  return defaultRes.rows?.[0] ?? null
}

async function getBundleItemStockStatus(client, item) {
  const ft = String(item?.fulfillment_type || 'digital_stock')
  const qty = getBundleItemQty(item)
  if (ft !== 'digital_stock') {
    return { fulfillment_type: ft, pool_id: null, pool_kind: null, remaining: null, out_of_stock: false }
  }
  if (item?.is_unlimited_stock) {
    return { fulfillment_type: ft, pool_id: null, pool_kind: 'unlimited', remaining: null, out_of_stock: false }
  }

  const poolRow = await findBundleStockPool(client, item)
  if (!poolRow || poolRow.is_active === false) {
    return { fulfillment_type: ft, pool_id: null, pool_kind: null, remaining: 0, out_of_stock: true }
  }

  const poolKind = String(poolRow.kind || 'digital_code')
  let remaining = 0
  if (poolKind === 'quantity') {
    remaining = Number(poolRow.quantity_remaining ?? 0) || 0
  } else {
    const available = await client.query(
      `SELECT COUNT(*)::int AS cnt
       FROM stock_pool_items
       WHERE pool_id = $1 AND status = 'available'`,
      [poolRow.pool_id],
    )
    remaining = Number(available.rows?.[0]?.cnt ?? 0) || 0
  }

  return {
    fulfillment_type: ft,
    pool_id: Number(poolRow.pool_id),
    pool_kind: poolKind,
    remaining,
    out_of_stock: remaining < qty,
  }
}

async function buildBundleQuote(client, bundle, coupon, { userId } = {}) {
  const bundlePrice = Math.max(0, Math.trunc(Number(bundle.bundle_price) || 0))
  const originalTotal = Math.max(0, Math.trunc(Number(bundle.original_total) || 0))
  const campaigns = await listActiveGrowthCampaigns({ targetType: 'bundle', targetId: bundle.id })
  const vip = userId ? await getMyVip(userId).catch(() => null) : null
  const candidates = [
    ...(campaigns.campaigns || []).map(campaignToDiscountCandidate),
    vipToDiscountCandidate(vip),
    couponToDiscountCandidate(coupon),
  ].filter(Boolean)
  const resolved = resolveDiscountQuote({
    targetType: 'bundle',
    targetId: bundle.id,
    originalUnitPricePoints: bundlePrice,
    quantity: 1,
    candidates,
  })

  const items = []
  for (const item of bundle.items) {
    const stock = await getBundleItemStockStatus(client, item)
    items.push({
      bundle_item_id: item.id,
      product_id: item.product_id,
      product_name: item.product_name,
      product_image_url: item.product_image_url ?? null,
      product_option_id: item.product_option_id ?? null,
      product_option: item.product_option ?? null,
      qty: getBundleItemQty(item),
      unit_price_points: Number(item.product_price ?? 0) || 0,
      subtotal_points: (Number(item.product_price ?? 0) || 0) * getBundleItemQty(item),
      stock,
      available: !stock.out_of_stock,
    })
  }

  const unavailableItems = items.filter((item) => !item.available)
  return {
    bundle_id: bundle.id,
    bundle_price_points: bundlePrice,
    original_total_points: originalTotal,
    bundle_discount_points: Math.max(0, originalTotal - bundlePrice),
    coupon_discount_points: resolved.discounts_applied.find((d) => d.source_type === 'coupon')?.amount_points || 0,
    total_points: resolved.final_total_points,
    coupon_code: coupon?.code ?? null,
    coupon_valid: coupon != null,
    discounts_considered: resolved.discounts_considered,
    discounts_applied: resolved.discounts_applied,
    discounts_rejected: resolved.discounts_rejected,
    final_unit_price_points: resolved.final_unit_price_points,
    available: unavailableItems.length === 0,
    unavailable_items: unavailableItems,
    items,
  }
}

export async function quoteBundlePurchase({ bundleId, couponCode } = {}) {
  const bid = Number(bundleId)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_bundle_id')
  const { userId } = arguments?.[0] ?? {}

  const bundle = await getBundleWithItems(bid)
  assertBundlePurchasable(bundle)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const coupon = await readAndValidateDiscountCoupon(client, couponCode)
    const quote = await buildBundleQuote(client, bundle, coupon, { userId })
    await client.query('COMMIT')
    return quote
  } catch (e) {
    try { await client.query('ROLLBACK') } catch {}
    throw e
  } finally {
    client.release()
  }
}

export async function listBundles({ includeHidden = false, activeOnly = true } = {}) {
  const conds = []
  if (!includeHidden) conds.push(`b.is_hidden = false`)
  if (activeOnly) conds.push(`b.is_active = true`)
  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''
  const bundles = await all(
    `SELECT b.*,
            (SELECT COUNT(*)::int FROM bundle_items WHERE bundle_id = b.id) AS item_count
     FROM product_bundles b
     ${where}
     ORDER BY b.sort_order ASC, b.id ASC`,
  )
  return bundles
}

export async function getBundleById(id) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) return null
  return getBundleWithItems(bid)
}

export async function adminListBundles() {
  const bundles = await all(
    `SELECT b.*,
            (SELECT COUNT(*)::int FROM bundle_items WHERE bundle_id = b.id) AS item_count
     FROM product_bundles b
     ORDER BY b.sort_order ASC, b.id ASC`,
  )
  return bundles
}

export async function adminGetBundleDetail(id) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_id')
  const bundle = await getBundleWithItems(bid)
  if (!bundle) throw new Error('not_found')
  return bundle
}

export async function adminCreateBundle({ name, slug, description, imageUrl, bundlePrice, isActive, isHidden, sortOrder, startsAt, endsAt, items }) {
  if (!name || !slug) throw new Error('invalid_name_or_slug')
  const price = Number(bundlePrice)
  if (!Number.isFinite(price) || price < 0) throw new Error('invalid_price')
  if (!Array.isArray(items) || items.length < 1) throw new Error('invalid_bundle_items')

  const res = await query(
    `INSERT INTO product_bundles (name, slug, description, image_url, bundle_price, is_active, is_hidden, sort_order, starts_at, ends_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
     RETURNING id`,
    [
      String(name).trim(),
      String(slug).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
      description ? String(description).trim() : null,
      imageUrl ? String(imageUrl).trim() : null,
      Math.trunc(price),
      isActive !== false,
      Boolean(isHidden),
      Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : 0,
      startsAt || null,
      endsAt || null,
    ],
  )
  const bundleId = res.rows[0].id
  if (Array.isArray(items) && items.length > 0) {
    await _replaceBundleItems(bundleId, items)
  }
  return bundleId
}

export async function adminUpdateBundle({ id, name, slug, description, imageUrl, bundlePrice, isActive, isHidden, sortOrder, startsAt, endsAt, items }) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_id')
  const price = bundlePrice != null ? Number(bundlePrice) : null
  if (price != null && (!Number.isFinite(price) || price < 0)) throw new Error('invalid_price')
  if (Array.isArray(items) && items.length < 1) throw new Error('invalid_bundle_items')

  const res = await query(
    `UPDATE product_bundles
     SET name = COALESCE($2, name),
         slug = COALESCE($3, slug),
         description = COALESCE($4, description),
         image_url = COALESCE($5, image_url),
         bundle_price = COALESCE($6, bundle_price),
         is_active = COALESCE($7, is_active),
         is_hidden = COALESCE($8, is_hidden),
         sort_order = COALESCE($9, sort_order),
         starts_at = COALESCE($10, starts_at),
         ends_at = COALESCE($11, ends_at),
         updated_at = now()
     WHERE id = $1
     RETURNING id`,
    [
      bid,
      name ? String(name).trim() : null,
      slug ? String(slug).trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-') : null,
      description !== undefined ? (description ? String(description).trim() : null) : undefined,
      imageUrl !== undefined ? (imageUrl ? String(imageUrl).trim() : null) : undefined,
      price != null ? Math.trunc(price) : null,
      isActive != null ? Boolean(isActive) : null,
      isHidden != null ? Boolean(isHidden) : null,
      sortOrder != null && Number.isFinite(Number(sortOrder)) ? Number(sortOrder) : null,
      startsAt !== undefined ? (startsAt || null) : undefined,
      endsAt !== undefined ? (endsAt || null) : undefined,
    ],
  )
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
  if (Array.isArray(items)) {
    await _replaceBundleItems(bid, items)
  }
  return bid
}

async function _replaceBundleItems(bundleId, items) {
  const normalized = []
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const pid = Number(it.product_id)
    const qty = getBundleItemQty(it)
    if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_bundle_items')

    const product = await getProductById(pid)
    if (!product) throw new Error('product_not_found')

    const rawOptionId = it.product_option_id == null ? '' : String(it.product_option_id).trim()
    let selectedOption = null
    if (rawOptionId) {
      selectedOption = resolveProductOption({ product, productOptionId: rawOptionId })
      if (!selectedOption) throw new Error('invalid_product_option')
    } else {
      selectedOption = requireProductOption({ product, productOptionId: null })
    }

    normalized.push({
      product_id: pid,
      qty,
      product_option_id: selectedOption?.id ? String(selectedOption.id) : null,
      sort_order: i,
    })
  }

  if (normalized.length < 1) throw new Error('invalid_bundle_items')

  await query(`DELETE FROM bundle_items WHERE bundle_id = $1`, [bundleId])
  for (const it of normalized) {
    await query(
      `INSERT INTO bundle_items (bundle_id, product_id, qty, product_option_id, sort_order)
       VALUES ($1,$2,$3,$4,$5)`,
      [bundleId, it.product_id, it.qty, it.product_option_id, it.sort_order],
    )
  }
}

export async function adminDeleteBundle(id) {
  const bid = Number(id)
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_id')
  const res = await query(`DELETE FROM product_bundles WHERE id = $1`, [bid])
  if ((res.rowCount ?? 0) < 1) throw new Error('not_found')
}

// ── purchaseBundle ──
export async function purchaseBundle({ userId, bundleId, couponCode }) {
  const uid = Number(userId)
  const bid = Number(bundleId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_bundle_id')

  const bundle = await getBundleWithItems(bid)
  assertBundlePurchasable(bundle)

  const bundlePrice = Math.max(0, Math.trunc(Number(bundle.bundle_price) || 0))
  const originalTotal = Math.max(0, Math.trunc(Number(bundle.original_total) || 0))
  const subtotal = Math.max(originalTotal, bundlePrice)
  const bundleDiscountTotal = Math.max(0, subtotal - bundlePrice)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const quote = await buildBundleQuote(client, bundle, coupon, { userId: uid })
    const couponDiscountPoints = quote.coupon_discount_points
    const total = quote.total_points

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [uid],
    )

    const wallet = await client.query(`SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [uid])
    const balance = Number(wallet.rows[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) throw new Error('insufficient_points')

    const orderRef = generateOrderRef()
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1,$2,$3,$4,$5,$6,'paid',$7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, bundleDiscountTotal, couponDiscountPoints, coupon?.code ?? null, total, orderRef],
    )
    const orderId = orderRes.rows[0].id
    await insertOrderDiscountApplications(client, { orderId, quote })

    // create order_items + deliveries per bundle item
    const deliveries = []
    const farmRequestIds = []

    for (const item of bundle.items) {
      const itemQty = getBundleItemQty(item)
      const unitPrice = Math.max(0, Math.trunc(Number(item.product_price ?? 0) || 0))
      const itemOptionJson = item.product_option ? JSON.stringify(item.product_option) : null

      const oiRes = await client.query(
        `INSERT INTO order_items (
           order_id, product_id, qty,
           unit_price_points, unit_price_original_points,
           promo_discount_points, coupon_discount_points,
           product_option
         )
         VALUES ($1,$2,$3,$4,$4,0,0,$5::jsonb)
         RETURNING id`,
        [orderId, item.product_id, itemQty, unitPrice, itemOptionJson],
      )
      const orderItemId = oiRes.rows[0].id

      const ft = String(item.fulfillment_type || 'digital_stock')

      if (ft === 'digital_stock') {
        if (item.is_unlimited_stock) {
          const dvRes = await client.query(
            `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, status, payload_masked, payload, delivery_name)
             VALUES ($1,$2,$3,$4,'pending_claim',$5,NULL,$6) RETURNING id`,
            [uid, orderId, orderItemId, item.product_id, 'พร้อมรับสินค้า', item.product_name],
          )
          deliveries.push({ id: dvRes.rows[0].id, product_name: item.product_name })
          continue
        }

        const poolRow = await findBundleStockPool(client, item, { lock: true })
        if (!poolRow || poolRow.is_active === false) throw new Error(`product_out_of_stock:${item.product_id}`)

        const poolKind = String(poolRow.kind || 'digital_code')
        if (poolKind === 'quantity') {
          const remaining = Number(poolRow.quantity_remaining ?? 0) || 0
          if (remaining < itemQty) throw new Error(`product_out_of_stock:${item.product_id}`)
          await client.query(
            `UPDATE stock_pools
             SET quantity_remaining = quantity_remaining - $2, updated_at = now()
             WHERE id = $1`,
            [poolRow.pool_id, itemQty],
          )
        } else {
          const stockRows = await client.query(
            `SELECT id, payload
             FROM stock_pool_items
             WHERE pool_id = $1 AND status = 'available'
             ORDER BY id ASC
             FOR UPDATE SKIP LOCKED
             LIMIT $2`,
            [poolRow.pool_id, itemQty],
          )
          if ((stockRows.rowCount ?? 0) < itemQty) throw new Error(`product_out_of_stock:${item.product_id}`)

          for (const row of stockRows.rows) {
            const payload = String(row.payload ?? '')
            const dvRes = await client.query(
              `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_pool_item_id, status, payload_masked, payload, delivery_name)
               VALUES ($1,$2,$3,$4,$5,'pending_claim',$6,$7,$8) RETURNING id`,
              [uid, orderId, orderItemId, item.product_id, row.id, maskPayload(payload), payload, item.product_name],
            )
            deliveries.push({ id: dvRes.rows[0].id, product_name: item.product_name })

            await client.query(
              `UPDATE stock_pool_items
               SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now()
               WHERE id = $1`,
              [row.id, orderItemId],
            )
          }
        }

        await recountProductStockFromPools(client, item.product_id)
      } else if (ft === 'farm_form' || ft === 'uid_form') {
        const pendingDeliveryRes = await client.query(
          `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, status, payload_masked, payload, delivery_name)
           VALUES ($1,$2,$3,$4,'pending_fulfillment',$5,NULL,$6) RETURNING id`,
          [uid, orderId, orderItemId, item.product_id, 'รอดำเนินการ', item.product_name],
        )
        const pendingDeliveryId = pendingDeliveryRes.rows[0].id
        deliveries.push({ id: pendingDeliveryId, product_name: item.product_name })

        const pendingFarmRes = await client.query(
          ft === 'uid_form'
            ? `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, uid, uid_confirmed, status, product_option)
               VALUES ($1,$2,$3,$4,$5,NULL,false,'pending',$6::jsonb) RETURNING id`
            : `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, form_data, status, product_option)
               VALUES ($1,$2,$3,$4,$5,$6::jsonb,'pending',$7::jsonb) RETURNING id`,
          ft === 'uid_form'
            ? [pendingDeliveryId, uid, item.product_id, orderId, orderItemId, itemOptionJson]
            : [pendingDeliveryId, uid, item.product_id, orderId, orderItemId, JSON.stringify({}), itemOptionJson],
        )
        farmRequestIds.push(pendingFarmRes.rows[0].id)
      } else {
        const fallbackDeliveryRes = await client.query(
          `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, status, payload_masked, payload, delivery_name)
           VALUES ($1,$2,$3,$4,'pending_fulfillment',$5,NULL,$6) RETURNING id`,
          [uid, orderId, orderItemId, item.product_id, 'รอดำเนินการ', item.product_name],
        )
        deliveries.push({ id: fallbackDeliveryRes.rows[0].id, product_name: item.product_name })
      }
    }

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) throw new Error('duplicate_purchase')

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, uid],
    )

    if (coupon?.id) {
      await client.query(
        `UPDATE discount_coupons
         SET used_count = COALESCE(used_count, 0) + 1, updated_at = now()
         WHERE id = $1`,
        [coupon.id],
      )
    }

    await client.query('COMMIT')

    // fire-and-forget auto-assign farm requests
    for (const frid of farmRequestIds) {
      autoAssignFarmRequest(frid).catch(() => {})
    }

    sendPushToUser(uid, {
      title: 'สั่งซื้อ Bundle สำเร็จ',
      body: `${bundle.name} - ${total.toLocaleString('th-TH')} พ้อย`,
      url: '/inbox',
    }).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRef,
        total_points: total,
        subtotal_points: subtotal,
        promo_discount_points: bundleDiscountTotal,
        coupon_discount_points: couponDiscountPoints,
        coupon_code: coupon?.code ?? null,
        discounts_applied: quote.discounts_applied,
        discounts_rejected: quote.discounts_rejected,
        discounts_considered: quote.discounts_considered,
        created_at: orderRes.rows[0].created_at,
      },
      bundle_name: bundle.name,
      deliveries,
    }
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    throw e
  } finally {
    client.release()
  }
}
