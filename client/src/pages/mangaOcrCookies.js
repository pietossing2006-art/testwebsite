const PREFS_COOKIE = 'MangaOcrPrefs'
const HISTORY_COOKIE = 'MangaOcrHistory'
const COOKIE_MAX_AGE = 60 * 60 * 24 * 180
const HISTORY_LIMIT = 16

const DEFAULT_PREFS = {
  sourceLanguage: 'auto',
  targetLanguage: 'th',
  fontStyle: 'default',
  translationProvider: 'gemini',
}

function readCookie(name) {
  if (typeof document === 'undefined') return ''
  const prefix = `${name}=`
  for (const chunk of String(document.cookie || '').split(';')) {
    const item = chunk.trim()
    if (item.startsWith(prefix)) return decodeURIComponent(item.slice(prefix.length))
  }
  return ''
}

function writeCookie(name, value, maxAgeSeconds = COOKIE_MAX_AGE) {
  if (typeof document === 'undefined') return
  const encoded = encodeURIComponent(String(value || ''))
  document.cookie = `${name}=${encoded}; Max-Age=${Math.max(0, Number(maxAgeSeconds) || 0)}; Path=/; SameSite=Lax`
}

function parseJson(raw, fallback) {
  if (!raw) return fallback
  try {
    return JSON.parse(raw)
  } catch {
    return fallback
  }
}

export function loadMangaOcrPrefs() {
  const saved = parseJson(readCookie(PREFS_COOKIE), {})
  return {
    sourceLanguage: saved.sourceLanguage || DEFAULT_PREFS.sourceLanguage,
    targetLanguage: saved.targetLanguage || DEFAULT_PREFS.targetLanguage,
    fontStyle: saved.fontStyle || DEFAULT_PREFS.fontStyle,
    translationProvider: saved.translationProvider || DEFAULT_PREFS.translationProvider,
  }
}

export function saveMangaOcrPrefs(prefs) {
  writeCookie(PREFS_COOKIE, JSON.stringify({
    sourceLanguage: prefs.sourceLanguage || DEFAULT_PREFS.sourceLanguage,
    targetLanguage: prefs.targetLanguage || DEFAULT_PREFS.targetLanguage,
    fontStyle: prefs.fontStyle || DEFAULT_PREFS.fontStyle,
    translationProvider: prefs.translationProvider || DEFAULT_PREFS.translationProvider,
  }))
}

export function loadMangaOcrHistory() {
  const items = parseJson(readCookie(HISTORY_COOKIE), [])
  return Array.isArray(items) ? items.slice(0, HISTORY_LIMIT) : []
}

export function saveMangaOcrHistory(items) {
  writeCookie(HISTORY_COOKIE, JSON.stringify((items || []).slice(0, HISTORY_LIMIT)))
}

export function upsertMangaOcrHistory(entry) {
  const current = loadMangaOcrHistory().filter((item) => item.jobId !== entry.jobId)
  const next = [{
    jobId: entry.jobId,
    fileName: entry.fileName || 'manga-page.png',
    sourceLanguage: entry.sourceLanguage || 'auto',
    targetLanguage: entry.targetLanguage || 'th',
    status: entry.status || 'UPLOADED',
    detectedLanguage: entry.detectedLanguage || '',
    detectedLabel: entry.detectedLabel || '',
    hasFinal: Boolean(entry.hasFinal),
    createdAt: entry.createdAt || Date.now(),
    updatedAt: entry.updatedAt || Date.now(),
  }, ...current].slice(0, HISTORY_LIMIT)
  saveMangaOcrHistory(next)
  return next
}

export function updateMangaOcrHistory(jobId, patch) {
  const current = loadMangaOcrHistory()
  const next = current.map((item) => (
    item.jobId === jobId ? { ...item, ...patch, updatedAt: Date.now() } : item
  ))
  saveMangaOcrHistory(next)
  return next
}

export function clearMangaOcrHistory() {
  saveMangaOcrHistory([])
}

export function sourceLanguageLabel(code, detectedLabel = '') {
  const detectedMap = { Japanese: 'ญี่ปุ่น', Korean: 'เกาหลี', Chinese: 'จีน', English: 'อังกฤษ' }
  if (code === 'auto') {
    return detectedLabel
      ? `อัตโนมัติ (${detectedMap[detectedLabel] || detectedLabel})`
      : 'อัตโนมัติ'
  }
  const labels = { jp: 'ญี่ปุ่น', kr: 'เกาหลี', cn: 'จีน', en: 'อังกฤษ', ja: 'ญี่ปุ่น', ko: 'เกาหลี', zh: 'จีน' }
  return labels[code] || code
}
