export const DEFAULT_UI_BRANDING_SETTINGS = {
  site_name: 'VxperS Store',
  navbar_title: 'VxperS Store',
  navbar_tagline: 'Digital & Gaming Store',
  tab_title: 'VxperS Store',
  favicon_url: '/favicon.ico',
  navbar_links: [],
}

function normalizeText(value, fallback, maxLen) {
  const txt = String(value ?? '').trim()
  if (!txt) return fallback
  return txt.slice(0, maxLen)
}

function normalizeFavicon(value) {
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

export function normalizeUiBrandingSettings(input) {
  const source = input && typeof input === 'object' ? input : {}
  return {
    site_name: normalizeText(source.site_name, DEFAULT_UI_BRANDING_SETTINGS.site_name, 60),
    navbar_title: normalizeText(source.navbar_title, DEFAULT_UI_BRANDING_SETTINGS.navbar_title, 60),
    navbar_tagline: normalizeText(source.navbar_tagline, DEFAULT_UI_BRANDING_SETTINGS.navbar_tagline, 80),
    tab_title: normalizeText(source.tab_title, DEFAULT_UI_BRANDING_SETTINGS.tab_title, 80),
    favicon_url: normalizeFavicon(source.favicon_url),
    navbar_links: normalizeNavbarLinks(source.navbar_links),
  }
}

export function applyUiBrandingToDocument(input) {
  if (typeof document === 'undefined') return
  const branding = normalizeUiBrandingSettings(input)
  document.title = branding.tab_title || branding.site_name

  let icon = document.querySelector("link[rel='icon']")
  if (!icon) {
    icon = document.createElement('link')
    icon.setAttribute('rel', 'icon')
    document.head.appendChild(icon)
  }
  icon.setAttribute('href', branding.favicon_url)
}
