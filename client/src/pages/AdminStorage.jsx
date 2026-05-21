import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { copyToClipboard, fetchJson, setAuthToken } from '../api.js'
import StorageFullscreenViewer from './admin-storage/StorageFullscreenViewer.jsx'
import StorageMediaGrid from './admin-storage/StorageMediaGrid.jsx'
import StoragePathBar from './admin-storage/StoragePathBar.jsx'
import { EmptyState, FolderChip, LoadingGrid } from './admin-storage/StoragePrimitives.jsx'
import StorageToolbar from './admin-storage/StorageToolbar.jsx'
import {
  compareEntries,
  decodeViewMode,
  encodeViewMode,
  getCookieValue,
  getEntryThumbnailUrl,
  INITIAL_MEDIA_RENDER_LIMIT,
  joinClasses,
  MEDIA_RENDER_STEP,
  normalizeText,
  buildStorageMediaUrl,
  setCookieValue,
  VIEW_MODE_COOKIE,
} from './admin-storage/storageMediaUtils.js'

export default function AdminStorage() {
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [status, setStatus] = useState('loading')
  const [errorText, setErrorText] = useState('')
  const [role, setRole] = useState('user')
  const [rootPath, setRootPath] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [mediaRenderLimit, setMediaRenderLimit] = useState(INITIAL_MEDIA_RENDER_LIMIT)
  const [viewMode, setViewMode] = useState('grid')
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [mediaFilter, setMediaFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [selectedMediaPath, setSelectedMediaPath] = useState('')
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [isCompactDevice, setIsCompactDevice] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined
    const mediaQuery = window.matchMedia('(max-width: 767px), (pointer: coarse)')
    const updateCompactMode = () => setIsCompactDevice(Boolean(mediaQuery.matches))
    updateCompactMode()

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateCompactMode)
      return () => mediaQuery.removeEventListener('change', updateCompactMode)
    }

    mediaQuery.addListener(updateCompactMode)
    return () => mediaQuery.removeListener(updateCompactMode)
  }, [])

  const initialRenderLimit = isCompactDevice ? 48 : INITIAL_MEDIA_RENDER_LIMIT
  const mediaRenderStep = isCompactDevice ? 48 : MEDIA_RENDER_STEP

  const urlPath = useMemo(() => {
    const raw = String(searchParams.get('path') || '').trim()
    return raw.replace(/^\/+/, '')
  }, [searchParams])

  const setPathInUrl = useCallback(
    (nextPath) => {
      const normalized = String(nextPath || '').trim().replace(/^\/+/, '')
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (normalized) next.set('path', normalized)
        else next.delete('path')
        return next
      })
    },
    [setSearchParams],
  )

  useEffect(() => {
    const savedMode = decodeViewMode(getCookieValue(VIEW_MODE_COOKIE))
    if (savedMode === 'grid' || savedMode === 'column') setViewMode(savedMode)
  }, [])

  useEffect(() => {
    setCookieValue(VIEW_MODE_COOKIE, encodeViewMode(viewMode))
  }, [viewMode])

  const loadFolder = useCallback(async (pathValue = '') => {
    setStatus('loading')
    setErrorText('')
    try {
      const qs = new URLSearchParams()
      if (pathValue) qs.set('path', pathValue)
      const [meRes, data] = await Promise.all([
        fetchJson('/api/me'),
        fetchJson(`/api/admin/storage/list?${qs.toString()}`),
      ])
      const userRole = String(meRes?.user?.role || 'user').toLowerCase()
      setRole(userRole)
      if (userRole !== 'owner') {
        setStatus('forbidden')
        setErrorText('หน้านี้สำหรับ Owner เท่านั้น')
        return
      }
      setRootPath(String(data?.root || ''))
      setCurrentPath(String(data?.path || ''))
      setEntries(Array.isArray(data?.entries) ? data.entries : [])
      setTruncated(Boolean(data?.truncated))
      setMediaRenderLimit(initialRenderLimit)
      setStatus('idle')
    } catch (e) {
      if (e?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      if (e?.status === 403) {
        setStatus('forbidden')
        setErrorText('หน้านี้สำหรับ Owner เท่านั้น')
        return
      }
      if (e?.status === 404) {
        setStatus('error')
        setErrorText('ไม่พบโฟลเดอร์ที่เลือก')
        return
      }
      setStatus('error')
      setErrorText('โหลดไฟล์จาก Storage Host ไม่สำเร็จ')
    }
  }, [initialRenderLimit, nav])

  useEffect(() => {
    loadFolder(urlPath)
  }, [loadFolder, urlPath])

  const deferredQuery = useDeferredValue(query)
  const queryText = useMemo(() => normalizeText(deferredQuery), [deferredQuery])

  const visibleEntryMatcher = useCallback(
    (row) => {
      if (!queryText) return true
      const haystack = normalizeText(`${row?.name || ''} ${row?.path || ''}`)
      return haystack.includes(queryText)
    },
    [queryText],
  )

  const summary = useMemo(() => {
    const media = entries.filter((x) => x?.type === 'file' && (x?.media_kind === 'image' || x?.media_kind === 'video'))
    const images = media.filter((x) => x.media_kind === 'image')
    const videos = media.filter((x) => x.media_kind === 'video')
    return {
      folders: entries.filter((x) => x?.type === 'directory').length,
      media: media.length,
      images: images.length,
      videos: videos.length,
    }
  }, [entries])

  const folderEntries = useMemo(() => {
    return entries
      .filter((x) => x?.type === 'directory')
      .filter(visibleEntryMatcher)
      .sort((a, b) => compareEntries(a, b, 'name', 'asc'))
  }, [entries, visibleEntryMatcher])

  const mediaEntries = useMemo(() => {
    return entries
      .filter((x) => x?.type === 'file' && (x?.media_kind === 'image' || x?.media_kind === 'video'))
      .filter((x) => mediaFilter === 'all' || x?.media_kind === mediaFilter)
      .filter(visibleEntryMatcher)
      .sort((a, b) => compareEntries(a, b, sortBy, sortOrder))
  }, [entries, mediaFilter, sortBy, sortOrder, visibleEntryMatcher])

  useEffect(() => {
    setMediaRenderLimit(initialRenderLimit)
  }, [initialRenderLimit, queryText, mediaFilter, sortBy, sortOrder, currentPath])

  useEffect(() => {
    if (!selectedMediaPath) return
    if (!mediaEntries.length) {
      setSelectedMediaPath('')
      setIsFullscreenOpen(false)
      return
    }
    if (!mediaEntries.some((item) => item.path === selectedMediaPath)) {
      setSelectedMediaPath('')
      setIsFullscreenOpen(false)
    }
  }, [mediaEntries, selectedMediaPath])

  const selectedMedia = useMemo(
    () => mediaEntries.find((item) => item.path === selectedMediaPath) || null,
    [mediaEntries, selectedMediaPath],
  )

  const selectedMediaUrl = useMemo(
    () => (selectedMedia ? buildStorageMediaUrl('file', selectedMedia) : ''),
    [selectedMedia],
  )

  const selectedMediaPreviewUrl = useMemo(
    () => {
      if (!selectedMedia) return ''
      if (selectedMedia.media_kind === 'image') return buildStorageMediaUrl('thumb', selectedMedia, { w: 1280, q: 80 })
      return getEntryThumbnailUrl(selectedMedia)
    },
    [selectedMedia],
  )

  const visibleMediaEntries = useMemo(() => mediaEntries.slice(0, mediaRenderLimit), [mediaEntries, mediaRenderLimit])
  const hasMoreMedia = mediaEntries.length > visibleMediaEntries.length

  const breadcrumbItems = useMemo(() => {
    const parts = String(currentPath || '')
      .split('/')
      .map((x) => x.trim())
      .filter(Boolean)
    const rows = [{ label: 'All files', path: '' }]
    for (let i = 0; i < parts.length; i += 1) {
      rows.push({ label: parts[i], path: parts.slice(0, i + 1).join('/') })
    }
    return rows
  }, [currentPath])

  useEffect(() => {
    if (!isFullscreenOpen || !selectedMedia) return undefined
    function onKey(e) {
      if (e.key === 'Escape') {
        setIsFullscreenOpen(false)
        return
      }
      if (e.key === 'ArrowLeft') {
        setSelectedMediaPath((current) => {
          const index = mediaEntries.findIndex((item) => item.path === current)
          if (index <= 0) return mediaEntries[mediaEntries.length - 1]?.path || ''
          return mediaEntries[index - 1]?.path || current
        })
        return
      }
      if (e.key === 'ArrowRight') {
        setSelectedMediaPath((current) => {
          const index = mediaEntries.findIndex((item) => item.path === current)
          if (index < 0 || index >= mediaEntries.length - 1) return mediaEntries[0]?.path || ''
          return mediaEntries[index + 1]?.path || current
        })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isFullscreenOpen, mediaEntries, selectedMedia])

  useEffect(() => {
    if (!isFullscreenOpen || typeof document === 'undefined') return undefined
    const bodyStyle = document.body.style
    const prevOverflow = bodyStyle.overflow
    const prevOverscrollBehavior = bodyStyle.overscrollBehavior
    bodyStyle.overflow = 'hidden'
    bodyStyle.overscrollBehavior = 'none'
    return () => {
      bodyStyle.overflow = prevOverflow
      bodyStyle.overscrollBehavior = prevOverscrollBehavior
    }
  }, [isFullscreenOpen])

  const goPrevMedia = useCallback(() => {
    if (mediaEntries.length < 1) return
    setSelectedMediaPath((current) => {
      const index = mediaEntries.findIndex((item) => item.path === current)
      if (index <= 0) return mediaEntries[mediaEntries.length - 1]?.path || current
      return mediaEntries[index - 1]?.path || current
    })
  }, [mediaEntries])

  const goNextMedia = useCallback(() => {
    if (mediaEntries.length < 1) return
    setSelectedMediaPath((current) => {
      const index = mediaEntries.findIndex((item) => item.path === current)
      if (index < 0 || index >= mediaEntries.length - 1) return mediaEntries[0]?.path || current
      return mediaEntries[index + 1]?.path || current
    })
  }, [mediaEntries])

  const handleSelectMedia = useCallback((path) => {
    setSelectedMediaPath(path)
    setIsFullscreenOpen(true)
  }, [])

  const handleRefresh = useCallback(() => {
    loadFolder(currentPath)
  }, [currentPath, loadFolder])

  const handleCopy = useCallback(async (key, value) => {
    const ok = await copyToClipboard(value)
    if (!ok) return
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((current) => (current === key ? '' : current)), 1400)
  }, [])

  return (
    <div className="mx-auto w-full max-w-[min(1760px,96vw)] pb-10">
      <StorageToolbar
        query={query}
        onQueryChange={setQuery}
        mediaFilter={mediaFilter}
        onMediaFilterChange={setMediaFilter}
        sortBy={sortBy}
        onSortByChange={setSortBy}
        sortOrder={sortOrder}
        onToggleSortOrder={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
        summary={summary}
        status={status}
        onRefresh={handleRefresh}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <StoragePathBar
          currentPath={currentPath}
          rootPath={rootPath}
          breadcrumbItems={breadcrumbItems}
          onSelectPath={setPathInUrl}
          copiedKey={copiedKey}
          onCopy={handleCopy}
        />

        <Link
          to="/admin-v3"
          className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-xs font-bold text-white/70 transition hover:border-white/18 hover:bg-white/[0.08] hover:text-white sm:w-auto"
        >
          กลับแอดมิน
        </Link>
      </div>

      {status === 'forbidden' ? (
        <div className="mt-4 rounded-2xl border border-cyan-300/18 bg-cyan-300/8 p-5 text-sm font-semibold text-cyan-100">{errorText || 'Forbidden'}</div>
      ) : null}

      {status !== 'forbidden' ? (
        <div className="mt-4 space-y-4">
          {folderEntries.length ? (
            <section className="rounded-[24px] border border-white/10 bg-[#07101a]/70 p-4 shadow-[0_24px_80px_rgba(0,0,0,0.22)] backdrop-blur">
              <div className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-white/38">Folders</div>
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
                {folderEntries.map((row) => (
                  <FolderChip key={row.path} name={row.name} path={String(row.path || '')} onClick={setPathInUrl} />
                ))}
              </div>
            </section>
          ) : null}

          {status === 'loading' ? <LoadingGrid /> : null}
          {status === 'error' ? <EmptyState title={errorText} detail="ลองรีเฟรชหรือกลับไปที่โฟลเดอร์หลักอีกครั้ง" /> : null}

          {status === 'idle' ? (
            <StorageMediaGrid
              items={visibleMediaEntries}
              viewMode={viewMode}
              selectedPath={selectedMediaPath}
              onSelect={handleSelectMedia}
              renderLimit={mediaRenderLimit}
              onLoadMore={() => setMediaRenderLimit((n) => n + mediaRenderStep)}
              hasMore={hasMoreMedia}
              totalCount={mediaEntries.length}
              emptyTitle={queryText ? 'ไม่พบไฟล์ที่ตรงกับคำค้นหา' : 'โฟลเดอร์นี้ยังไม่มีรูปภาพหรือวิดีโอ'}
              emptyDetail={queryText ? 'ลองลดคำค้นหาหรือเปลี่ยนตัวกรอง media' : 'ไฟล์ที่รองรับจะแสดงเป็น thumbnail อัตโนมัติ'}
            />
          ) : null}

          {truncated ? (
            <div className="rounded-2xl border border-amber-300/20 bg-amber-400/8 px-3 py-2 text-[11px] font-semibold text-amber-100">
              แสดงเฉพาะบางส่วนของโฟลเดอร์นี้ เพราะรายการมีจำนวนมาก
            </div>
          ) : null}
        </div>
      ) : null}

      <StorageFullscreenViewer
        media={isFullscreenOpen ? selectedMedia : null}
        mediaUrl={selectedMediaUrl}
        previewUrl={selectedMediaPreviewUrl}
        onClose={() => setIsFullscreenOpen(false)}
        onPrev={goPrevMedia}
        onNext={goNextMedia}
      />

      {role && role !== 'owner' && status !== 'forbidden' ? (
        <div className={joinClasses('mt-4 text-xs font-semibold text-cyan-200', role === 'owner' ? 'hidden' : '')}>สิทธิ์ของคุณ: {role}</div>
      ) : null}
    </div>
  )
}
