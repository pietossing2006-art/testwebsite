import { useEffect, useRef, useState } from 'react'
import { fetchJson, resolveApiUrl } from '../api.js'
import {
  clearMangaOcrHistory,
  loadMangaOcrHistory,
  loadMangaOcrPrefs,
  saveMangaOcrPrefs,
  sourceLanguageLabel,
  updateMangaOcrHistory,
  upsertMangaOcrHistory,
} from './mangaOcrCookies.js'

const SOURCE_LANGUAGES = [
  ['auto', 'อัตโนมัติ'], ['jp', 'ญี่ปุ่น'], ['kr', 'เกาหลี'], ['cn', 'จีน'], ['en', 'อังกฤษ'],
]
const TARGET_LANGUAGES = [
  ['th', 'ไทย'], ['en', 'อังกฤษ'], ['ja', 'ญี่ปุ่น'], ['ko', 'เกาหลี'], ['zh', 'จีน'],
]
const FONT_OPTIONS = [
  ['default', 'ฟอนต์ระบบ'], ['kanit', 'Kanit'], ['sarabun', 'Sarabun'], ['prompt', 'Prompt'],
]
const FALLBACK_PROVIDERS = [
  { id: 'gemini', label: 'Google Gemini', default_model: 'gemini-2.0-flash' },
  { id: 'openrouter', label: 'OpenRouter', default_model: 'google/gemini-2.0-flash-001' },
  { id: 'openai_compatible', label: 'OpenAI-compatible', default_model: 'gpt-4o-mini' },
]
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const MAX_FILE_SIZE = 25 * 1024 * 1024

function errorMessage(error) {
  return error?.data?.error || error?.data?.detail || error?.message || 'เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง'
}

function imageUrl(jobId, type, revision = '') {
  if (!jobId) return ''
  const suffix = revision ? `?v=${revision}` : ''
  return resolveApiUrl(`/api/mangaocr/image/${jobId}/${type}${suffix}`)
}

function Progress({ status }) {
  if (!status) return null
  const failed = status.status === 'FAILED'
  return (
    <section className={`rounded-2xl border p-4 ${failed ? 'border-rose-500/40 bg-rose-950/30' : 'border-slate-700 bg-slate-900/70'}`}>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-semibold text-slate-100">{failed ? 'ไม่สามารถประมวลผลได้' : status.step_description}</span>
        <span className="font-mono text-cyan-300">{failed ? 'ERROR' : `${status.progress || 0}%`}</span>
      </div>
      {!failed && <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-violet-500 transition-all duration-500" style={{ width: `${status.progress || 0}%` }} /></div>}
      {failed && <p className="mt-2 text-sm text-rose-200">{status.error || status.step_description}</p>}
    </section>
  )
}

function BubbleEditor({ bubble, onChange, onApply, saving }) {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <div className="mb-2 flex items-center justify-between text-xs"><span className="font-semibold text-cyan-300">พื้นที่ข้อความ #{bubble.id}</span><span className="text-slate-500">OCR {Math.round((bubble.ocr_confidence || 0) * 100)}%</span></div>
      <p className="mb-2 rounded bg-slate-950 p-2 text-xs leading-relaxed text-slate-400">{bubble.clean_ocr || 'ไม่พบข้อความ'}</p>
      <textarea value={bubble.translated_text || ''} onChange={(event) => onChange('translated_text', event.target.value)} rows={3} className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400" aria-label={`คำแปลพื้นที่ ${bubble.id}`} />
      <div className="mt-2 grid grid-cols-3 gap-2">
        <label className="text-xs text-slate-400">ขนาด
          <input type="number" min="0" max="160" value={bubble.font_size || 0} onChange={(event) => onChange('font_size', Number(event.target.value))} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white" />
        </label>
        <label className="text-xs text-slate-400">สีตัวอักษร
          <input type="color" value={bubble.text_color || '#111111'} onChange={(event) => onChange('text_color', event.target.value)} className="mt-1 h-8 w-full rounded border border-slate-700 bg-slate-950" />
        </label>
        <label className="text-xs text-slate-400">จัดวาง
          <select value={bubble.align || 'center'} onChange={(event) => onChange('align', event.target.value)} className="mt-1 w-full rounded border border-slate-700 bg-slate-950 px-2 py-1 text-white"><option value="left">ซ้าย</option><option value="center">กลาง</option><option value="right">ขวา</option></select>
        </label>
      </div>
      <button type="button" disabled={saving} onClick={onApply} className="mt-3 rounded-lg bg-cyan-600 px-3 py-2 text-xs font-semibold text-white enabled:hover:bg-cyan-500 disabled:opacity-50">{saving ? 'กำลังจัดวาง…' : 'ใช้การแก้ไขนี้'}</button>
    </article>
  )
}

function HistoryPanel({ items, activeJobId, onOpen, onClear }) {
  if (!items.length) {
    return (
      <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
        <h2 className="font-semibold">ประวัติการแปล</h2>
        <p className="mt-2 text-xs text-slate-500">ยังไม่มีประวัติ — งานที่แปลแล้วจะถูกจำไว้ใน cookies ของเบราว์เซอร์</p>
      </section>
    )
  }
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold">ประวัติการแปล</h2>
        <button type="button" onClick={onClear} className="text-xs text-slate-500 hover:text-rose-300">ล้างประวัติ</button>
      </div>
      <div className="max-h-[360px] space-y-2 overflow-auto pr-1">
        {items.map((item) => (
          <button
            key={item.jobId}
            type="button"
            onClick={() => onOpen(item)}
            className={`flex w-full gap-3 rounded-xl border p-2 text-left transition ${item.jobId === activeJobId ? 'border-cyan-400 bg-cyan-950/30' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}
          >
            <div className="h-16 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-800">
              <img
                src={imageUrl(item.jobId, item.hasFinal ? 'final' : 'original', item.updatedAt || item.createdAt)}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-semibold text-slate-200">{item.fileName}</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {sourceLanguageLabel(item.sourceLanguage, item.detectedLabel)} → {SOURCE_LANGUAGES.find(([code]) => code === item.targetLanguage)?.[1] || item.targetLanguage}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {item.status === 'COMPLETED' ? 'แปลแล้ว' : item.status === 'FAILED' ? 'ล้มเหลว' : 'อัปโหลดแล้ว'}
                {' · '}
                {new Date(item.updatedAt || item.createdAt).toLocaleString('th-TH')}
              </p>
            </div>
          </button>
        ))}
      </div>
    </section>
  )
}

export default function MangaOcr() {
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState('')
  const [jobId, setJobId] = useState('')
  const [status, setStatus] = useState(null)
  const [sourceLanguage, setSourceLanguage] = useState('auto')
  const [targetLanguage, setTargetLanguage] = useState('th')
  const [fontStyle, setFontStyle] = useState('default')
  const [translationProvider, setTranslationProvider] = useState('gemini')
  const [providers, setProviders] = useState(FALLBACK_PROVIDERS)
  const [busy, setBusy] = useState(false)
  const [saving, setSaving] = useState(false)
  const [bubbles, setBubbles] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState('final')
  const [revision, setRevision] = useState(Date.now())
  const [notice, setNotice] = useState('')
  const [detectedLanguage, setDetectedLanguage] = useState('')
  const [detectedLabel, setDetectedLabel] = useState('')
  const [history, setHistory] = useState([])
  const timer = useRef(null)
  const fileInput = useRef(null)
  const prefsReady = useRef(false)

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview)
    if (timer.current) window.clearTimeout(timer.current)
  }, [preview])

  useEffect(() => {
    const prefs = loadMangaOcrPrefs()
    setSourceLanguage(prefs.sourceLanguage)
    setTargetLanguage(prefs.targetLanguage)
    setFontStyle(prefs.fontStyle)
    setTranslationProvider(prefs.translationProvider)
    setHistory(loadMangaOcrHistory())
    prefsReady.current = true
  }, [])

  useEffect(() => {
    if (!prefsReady.current) return
    saveMangaOcrPrefs({
      sourceLanguage,
      targetLanguage,
      fontStyle,
      translationProvider,
    })
  }, [sourceLanguage, targetLanguage, fontStyle, translationProvider])

  useEffect(() => {
    fetchJson('/api/mangaocr/capabilities')
      .then((data) => {
        if (!Array.isArray(data?.translation_providers) || !data.translation_providers.length) return
        setProviders(data.translation_providers)
        const saved = loadMangaOcrPrefs().translationProvider
        const preferred = data.translation_providers.find((item) => item.id === saved)
          || data.translation_providers.find((item) => item.id === data.translation_provider)
          || data.translation_providers.find((item) => item.available)
          || data.translation_providers[0]
        if (preferred?.id) setTranslationProvider(String(preferred.id))
      })
      .catch(() => { })
  }, [])

  const activeProvider = providers.find((item) => item.id === translationProvider) || providers[0]
  const providerReady = Boolean(activeProvider?.available)

  const resetForFile = (nextFile) => {
    if (!nextFile) return
    if (!ALLOWED_TYPES.has(nextFile.type) || nextFile.size > MAX_FILE_SIZE) {
      setNotice('รองรับเฉพาะ PNG, JPG หรือ WEBP ขนาดไม่เกิน 25 MB')
      return
    }
    if (preview) URL.revokeObjectURL(preview)
    setFile(nextFile)
    setPreview(URL.createObjectURL(nextFile))
    setJobId('')
    setStatus(null)
    setBubbles([])
    setSelectedId(null)
    setView('original')
    setDetectedLanguage('')
    setDetectedLabel('')
    setNotice('พร้อมประมวลผลแล้ว')
  }

  const rememberHistory = (entry) => {
    setHistory(upsertMangaOcrHistory(entry))
  }

  const patchHistory = (activeJobId, patch) => {
    setHistory(updateMangaOcrHistory(activeJobId, patch))
  }

  const openHistoryJob = async (item) => {
    if (busy) return
    setBusy(true)
    setNotice('')
    try {
      const nextStatus = await fetchJson(`/api/mangaocr/status/${item.jobId}`)
      setJobId(item.jobId)
      setFile(null)
      if (preview) URL.revokeObjectURL(preview)
      setPreview('')
      setStatus(nextStatus)
      setBubbles(Array.isArray(nextStatus.bubbles) ? nextStatus.bubbles : [])
      setSelectedId(null)
      setSourceLanguage(item.sourceLanguage || 'auto')
      setTargetLanguage(item.targetLanguage || 'th')
      setDetectedLanguage(item.detectedLanguage || '')
      setDetectedLabel(item.detectedLabel || '')
      setRevision(Date.now())
      if (nextStatus.status === 'COMPLETED') {
        setView('final')
        setNotice('โหลดงานจากประวัติแล้ว')
      } else if (nextStatus.status === 'FAILED') {
        setView('original')
        setNotice(nextStatus.error || 'งานนี้ประมวลผลไม่สำเร็จ')
      } else if (nextStatus.status === 'PROCESSING' || nextStatus.status === 'QUEUED') {
        setView('original')
        poll(item.jobId)
        return
      } else {
        setView('original')
        setNotice('โหลดภาพจากประวัติแล้ว — กดเริ่ม OCR ได้อีกครั้ง')
      }
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const poll = async (activeJobId) => {
    try {
      const nextStatus = await fetchJson(`/api/mangaocr/status/${activeJobId}`)
      setStatus(nextStatus)
      if (Array.isArray(nextStatus.bubbles) && nextStatus.bubbles.length) setBubbles(nextStatus.bubbles)
      if (nextStatus.status === 'COMPLETED') {
        setBusy(false)
        setView('final')
        setRevision(Date.now())
        patchHistory(activeJobId, { status: 'COMPLETED', hasFinal: true })
        setNotice('แปลเสร็จแล้ว ตรวจและแก้ไขข้อความได้ก่อนดาวน์โหลด')
        return
      }
      if (nextStatus.status === 'FAILED') {
        setBusy(false)
        patchHistory(activeJobId, { status: 'FAILED', hasFinal: false })
        return
      }
      timer.current = window.setTimeout(() => poll(activeJobId), 900)
    } catch (error) {
      setBusy(false)
      setStatus({ status: 'FAILED', error: errorMessage(error), step_description: 'ขาดการเชื่อมต่อกับบริการ OCR' })
    }
  }

  const start = async () => {
    if (!file || busy) return
    setBusy(true)
    setNotice('')
    setStatus({ status: 'UPLOADING', progress: 3, step_description: 'กำลังอัปโหลดภาพ…' })
    try {
      const data = new FormData()
      data.append('file', file)
      const uploaded = await fetchJson('/api/mangaocr/upload', { method: 'POST', body: data })
      setJobId(uploaded.job_id)

      let nextDetectedLanguage = detectedLanguage
      let nextDetectedLabel = detectedLabel
      if (sourceLanguage === 'auto') {
        setStatus({ status: 'DETECTING', progress: 8, step_description: 'กำลังตรวจจับภาษาต้นฉบับ…' })
        const detected = await fetchJson('/api/mangaocr/detect-language', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ job_id: uploaded.job_id }),
        })
        nextDetectedLanguage = detected.language || ''
        nextDetectedLabel = detected.label || ''
        setDetectedLanguage(nextDetectedLanguage)
        setDetectedLabel(nextDetectedLabel)
        setNotice(`ตรวจพบภาษา: ${sourceLanguageLabel('auto', nextDetectedLabel)}`)
      }

      rememberHistory({
        jobId: uploaded.job_id,
        fileName: uploaded.file_name || file.name,
        sourceLanguage,
        targetLanguage,
        status: 'PROCESSING',
        detectedLanguage: nextDetectedLanguage,
        detectedLabel: nextDetectedLabel,
        hasFinal: false,
        createdAt: Date.now(),
      })

      await fetchJson('/api/mangaocr/process', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: uploaded.job_id,
          source_lang: sourceLanguage,
          target_lang: targetLanguage,
          font_style: fontStyle,
          translation_provider: translationProvider,
        }),
      })
      poll(uploaded.job_id)
    } catch (error) {
      setBusy(false)
      setStatus({ status: 'FAILED', error: errorMessage(error), step_description: 'เริ่มการประมวลผลไม่สำเร็จ' })
    }
  }

  const updateBubble = (field, value) => setBubbles((items) => items.map((item) => item.id === selectedId ? { ...item, [field]: value } : item))
  const applyRetypeset = async () => {
    if (!jobId || !bubbles.length) return
    setSaving(true)
    setNotice('')
    try {
      await fetchJson('/api/mangaocr/retypeset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: jobId, bubbles, font_style: fontStyle, target_lang: targetLanguage }),
      })
      setRevision(Date.now())
      setView('final')
      setNotice('อัปเดตงานจัดวางแล้ว')
    } catch (error) {
      setNotice(errorMessage(error))
    } finally {
      setSaving(false)
    }
  }

  const selected = bubbles.find((bubble) => bubble.id === selectedId)
  const isDone = status?.status === 'COMPLETED'
  const displayed = view === 'original' ? (jobId ? imageUrl(jobId, 'original', revision) : preview) : imageUrl(jobId, view, revision)

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col justify-between gap-4 rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-900 to-slate-950 p-6 shadow-2xl shadow-cyan-950/20 sm:flex-row sm:items-center">
          <div><p className="mb-1 text-xs font-bold uppercase tracking-[0.2em] text-cyan-400">MangaOCR Studio</p><h1 className="text-2xl font-bold text-white">แปลมังงะ พร้อมลบและวางข้อความใหม่</h1><p className="mt-2 max-w-2xl text-sm text-slate-400">OCR จริงด้วย Manga OCR / EasyOCR และแปลตามบริบทของทั้งหน้าด้วย Gemini, OpenRouter หรือ API ที่รองรับ OpenAI</p></div>
          <button type="button" onClick={() => fileInput.current?.click()} className="rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20">เลือกภาพใหม่</button>
          <input ref={fileInput} onChange={(event) => resetForFile(event.target.files?.[0])} accept="image/png,image/jpeg,image/webp" className="hidden" type="file" />
        </header>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="space-y-4">
            <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <h2 className="font-semibold">ตั้งค่างาน</h2>
              <label className="mt-4 block text-xs font-medium text-slate-400">ภาษาต้นฉบับ<select value={sourceLanguage} disabled={busy} onChange={(event) => setSourceLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{SOURCE_LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{sourceLanguage === 'auto' && detectedLabel && <span className="mt-1 block text-[11px] text-cyan-300">ตรวจพบล่าสุด: {detectedLabel}</span>}</label>
              <label className="mt-3 block text-xs font-medium text-slate-400">ภาษาแปล<select value={targetLanguage} disabled={busy} onChange={(event) => setTargetLanguage(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{TARGET_LANGUAGES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="mt-3 block text-xs font-medium text-slate-400">ฟอนต์ผลลัพธ์<select value={fontStyle} disabled={busy} onChange={(event) => setFontStyle(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{FONT_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="mt-3 block text-xs font-medium text-slate-400">ผู้ให้บริการแปล<select value={translationProvider} disabled={busy} onChange={(event) => setTranslationProvider(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white">{providers.map((item) => <option key={item.id} value={item.id}>{item.label || item.id}</option>)}</select><span className="mt-1 block font-normal text-slate-500">Fixed APIKEY!</span>{activeProvider?.default_model && <span className="mt-1 block font-normal text-slate-600">Model: {activeProvider.default_model}</span>}</label>
              <ul className="mt-2 space-y-1 text-xs">{providers.map((item) => <li key={item.id} className={item.id === translationProvider ? 'text-cyan-300' : 'text-slate-500'}><span className={item.available ? 'text-emerald-400' : 'text-slate-600'}>{item.available ? '●' : '○'}</span> {item.label}{item.available ? ' · พร้อมใช้' : item.id === 'openai_compatible' ? ' · ต้องตั้ง OPENAI_COMPAT_BASE_URL + API key' : ' · ยังไม่มี API key ใน .env'}</li>)}</ul>
              {!providerReady && <p className="mt-3 rounded-lg border border-amber-500/30 bg-amber-950/30 p-3 text-xs text-amber-100">{activeProvider?.id === 'openrouter' ? 'ใส่ OPENROUTER_API_KEY ใน manga_ocr_server/.env แล้ว restart MangaOCR' : activeProvider?.id === 'openai_compatible' ? 'ใส่ OPENAI_COMPAT_BASE_URL และ OPENAI_COMPAT_API_KEY ใน .env แล้ว restart MangaOCR' : 'ใส่ GEMINI_API_KEY ใน manga_ocr_server/.env แล้ว restart MangaOCR'}</p>}
              <button type="button" onClick={start} disabled={!file || busy || !providerReady} className="mt-5 w-full rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-4 py-3 text-sm font-bold text-white shadow-lg shadow-cyan-900/30 enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40">{busy ? 'กำลังประมวลผล…' : 'เริ่ม OCR และแปล'}</button>
            </section>
            <Progress status={status} />
            {notice && <p className="rounded-xl border border-cyan-800/60 bg-cyan-950/30 p-3 text-sm text-cyan-100">{notice}</p>}
            <HistoryPanel
              items={history}
              activeJobId={jobId}
              onOpen={openHistoryJob}
              onClear={() => { clearMangaOcrHistory(); setHistory([]) }}
            />
            <p className="px-1 text-xs leading-relaxed text-slate-500">รองรับ PNG, JPG และ WEBP ไม่เกิน 25 MB · ประวัติและค่าตั้งค่าถูกเก็บใน cookies</p>
          </aside>

          <section className="min-w-0 space-y-4">
            <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 px-4 py-3">
                <div className="flex rounded-lg bg-slate-950 p-1">{[['original', 'ต้นฉบับ'], ['cleaned', 'ลบข้อความ'], ['final', 'ผลลัพธ์']].map(([value, label]) => <button key={value} type="button" disabled={value !== 'original' && !isDone} onClick={() => setView(value)} className={`rounded-md px-3 py-1.5 text-xs font-medium disabled:opacity-40 ${view === value ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>{label}</button>)}</div>
                {isDone && <a href={resolveApiUrl(`/api/mangaocr/download/${jobId}`)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-500">ดาวน์โหลด PNG</a>}
              </div>
              <div className="flex min-h-[450px] items-center justify-center bg-slate-950 p-4">{displayed ? <img src={displayed} alt="ตัวอย่างหน้ามังงะ" className="max-h-[75vh] max-w-full rounded object-contain" /> : <button type="button" onClick={() => fileInput.current?.click()} className="rounded-xl border border-dashed border-slate-700 px-8 py-12 text-center text-sm text-slate-500 hover:border-cyan-500 hover:text-cyan-300">เลือกภาพมังงะเพื่อเริ่มต้น</button>}</div>
            </div>
            {isDone && <div className="grid gap-4 xl:grid-cols-[240px_minmax(0,1fr)]"><div className="max-h-[520px] space-y-2 overflow-auto rounded-2xl border border-slate-800 bg-slate-900 p-3"><p className="px-1 text-xs font-bold uppercase tracking-wider text-slate-400">ข้อความที่ตรวจพบ</p>{bubbles.map((bubble) => <button key={bubble.id} type="button" onClick={() => setSelectedId(bubble.id)} className={`w-full rounded-lg border p-3 text-left text-xs ${bubble.id === selectedId ? 'border-cyan-400 bg-cyan-950/40' : 'border-slate-800 bg-slate-950 hover:border-slate-600'}`}><span className="font-semibold text-cyan-300">#{bubble.id}</span><span className="mt-1 block line-clamp-3 text-slate-300">{bubble.translated_text || '(ไม่มีคำแปล)'}</span></button>)}</div><div>{selected ? <BubbleEditor bubble={selected} onChange={updateBubble} onApply={applyRetypeset} saving={saving} /> : <div className="rounded-2xl border border-dashed border-slate-700 p-8 text-center text-sm text-slate-500">เลือกกล่องข้อความเพื่อแก้ไขคำแปลและรูปแบบ</div>}</div></div>}
          </section>
        </div>
      </div>
    </main>
  )
}
