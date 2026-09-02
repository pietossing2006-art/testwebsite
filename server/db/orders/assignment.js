import { get, getAppSettingJson, upsertAppSettingJson } from '../pool.js'
import { createStaffNotification } from '../support.js'


const ASSIGNABLE_ROLES = new Set(['booster', 'support', 'admin', 'owner'])

const FARM_ASSIGNABLE_ROLES = new Set(['booster', 'admin', 'owner'])


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
