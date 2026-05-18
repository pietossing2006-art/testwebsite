function withBase(url) {
  const base = import.meta.env.VITE_API_BASE
  const u = String(url)
  if (u.startsWith('http://') || u.startsWith('https://')) return u

  try {
    const { hostname, port, protocol } = window.location
    const isLocalFrontend = ['localhost', '127.0.0.1'].includes(hostname) && ['4173', '5173'].includes(port)
    if (isLocalFrontend && u.startsWith('/api')) return `${protocol}//localhost:3001${u}`
  } catch {
    // Fall through to the relative URL when window is unavailable.
  }

  if (!base) return url

  if (u.startsWith('/')) return `${base}${u}`
  return `${base}/${u}`
}

const AUTH_TOKEN_STORAGE_KEY = 'auth_token'
const COOKIE_CONSENT_STORAGE_KEY = 'cookie_consent'

function normalizeConsent(raw) {
  const data = raw && typeof raw === 'object' ? raw : {}
  return {
    essential: true,
    analytics: Boolean(data.analytics),
    marketing: Boolean(data.marketing),
    personalization: Boolean(data.personalization),
  }
}

export function resolveApiUrl(url) {
  return withBase(url)
}

export function getAuthToken() {
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY)
  } catch {
    return null
  }
}

export function setAuthToken(token) {
  const consent = getCookieConsent()
  const canPersistToken = Boolean(consent?.personalization)
  try {
    if (!token) {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    } else if (canPersistToken) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, String(token))
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
      window.dispatchEvent(new CustomEvent('auth_token_not_persisted', { detail: { reason: 'personalization_consent_required' } }))
    }
    window.dispatchEvent(new Event('auth_token_changed'))
  } catch {
    // ignore
  }
}

export function getCookieConsent() {
  try {
    const raw = localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY)
    if (!raw) return null
    return normalizeConsent(JSON.parse(raw))
  } catch {
    return null
  }
}

export function setCookieConsent(consent) {
  const normalized = normalizeConsent(consent)
  try {
    localStorage.setItem(COOKIE_CONSENT_STORAGE_KEY, JSON.stringify(normalized))
    if (!normalized.personalization) localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY)
    window.dispatchEvent(new CustomEvent('cookie_consent_changed', { detail: normalized }))
  } catch {
    // ignore
  }
  return normalized
}

export async function copyToClipboard(text) {
  const value = String(text ?? '')
  if (!value) return false
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.top = '-9999px'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    return true
  } catch {
    return false
  }
}

export function triggerAppRefresh() {
  try {
    window.dispatchEvent(new Event('app_refresh'))
  } catch {
    // ignore
  }
}

export function reloadPageSoon(delayMs = 900) {
  try {
    window.setTimeout(() => {
      window.location.reload()
    }, delayMs)
  } catch {
    // ignore
  }
}

export async function fetchJson(url, options) {
  const token = getAuthToken()
  const consent = getCookieConsent()
  const headers = {
    ...(options?.headers ?? {}),
  }
  if (token && !('Authorization' in headers) && !('authorization' in headers)) {
    headers.Authorization = `Bearer ${token}`
  }
  if (consent && !('X-Cookie-Consent' in headers) && !('x-cookie-consent' in headers)) {
    headers['X-Cookie-Consent'] = JSON.stringify(consent)
  }

  const res = await fetch(resolveApiUrl(url), {
    ...(options ?? {}),
    credentials: options?.credentials ?? 'include',
    headers,
  })
  const contentType = res.headers.get('content-type') || ''

  let data = null
  if (contentType.includes('application/json')) {
    data = await res.json()
  } else {
    data = await res.text()
  }

  if (!res.ok) {
    const err = new Error('request_failed')
    err.status = res.status
    err.data = data
    throw err
  }

  return data
}
