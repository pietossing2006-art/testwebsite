import { all, get, getAppSettingJson, query, upsertAppSettingJson } from './pool.js'
import { normalizeAnnouncements } from './messages.js'
import { normalizeTopupSettings } from '../lib/topupSettings.js'

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
  privacy_content: '',
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
    privacy_content: txt(s.privacy_content, DEFAULT_SITE_SETTINGS.privacy_content, 50000),
  }
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
  const topupStored = await getAppSettingJson('topup_settings')
  const topupNormalized = normalizeTopupSettings(topupStored)
  return {
    image_settings: normalizeUiImageSettings(imageStored),
    branding_settings: normalizeUiBrandingSettings(brandingStored),
    homepage_settings: normalizeHomepageSettings(homepageStored),
    site_settings: normalizeSiteSettings(siteStored),
    topup_settings: {
      ...topupNormalized,
      truemoney_phone: topupNormalized.truemoney_phone || (typeof process.env.TW_VOUCHER_PHONE === 'string' ? process.env.TW_VOUCHER_PHONE.trim() : ''),
      promptpay_target: topupNormalized.promptpay_target || String(process.env.PROMPTPAY_ID || process.env.PROMPTPAY_PHONE || process.env.PROMPTPAY_TARGET || process.env.TW_VOUCHER_PHONE || '').replace(/[\s-]/g, '').trim(),
      promptpay_name: topupNormalized.promptpay_name || process.env.PROMPTPAY_NAME || process.env.PROMPTPAY_ACCOUNT_NAME || 'พร้อมเพย์ (PromptPay)',
    },
  }
}


export async function updateUiSettings({ imageSettings, brandingSettings, homepageSettings, siteSettings, topupSettings } = {}) {
  const current = await getUiSettings()
  const imageSource = imageSettings && typeof imageSettings === 'object' ? imageSettings : {}
  const brandingSource = brandingSettings && typeof brandingSettings === 'object' ? brandingSettings : {}
  const homepageSource = homepageSettings && typeof homepageSettings === 'object' ? homepageSettings : {}
  const siteSource = siteSettings && typeof siteSettings === 'object' ? siteSettings : {}
  const topupSource = topupSettings && typeof topupSettings === 'object' ? topupSettings : {}
  const nextImage = normalizeUiImageSettings({ ...(current?.image_settings ?? {}), ...imageSource })
  const nextBranding = normalizeUiBrandingSettings({ ...(current?.branding_settings ?? {}), ...brandingSource })
  const nextHomepage = normalizeHomepageSettings({ ...(current?.homepage_settings ?? {}), ...homepageSource })
  const nextSite = normalizeSiteSettings({ ...(current?.site_settings ?? {}), ...siteSource })
  const nextTopup = normalizeTopupSettings({ ...(current?.topup_settings ?? {}), ...topupSource })

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
  await upsertAppSettingJson('topup_settings', nextTopup)
  return {
    image_settings: nextImage,
    branding_settings: nextBranding,
    homepage_settings: nextHomepage,
    site_settings: nextSite,
    topup_settings: nextTopup,
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

