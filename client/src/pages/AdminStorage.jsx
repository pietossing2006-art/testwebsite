import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { copyToClipboard, fetchJson, setAuthToken } from '../api.js'
import StorageFolderTree from './admin-storage/StorageFolderTree.jsx'
import StorageFullscreenViewer from './admin-storage/StorageFullscreenViewer.jsx'
import StorageMediaGrid from './admin-storage/StorageMediaGrid.jsx'
import StoragePathBar from './admin-storage/StoragePathBar.jsx'
import { EmptyState, LoadingGrid } from './admin-storage/StoragePrimitives.jsx'
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
import { createExpandedPathSet, togglePathInSet } from './admin-storage/storageTreeUtils.js'

export default function AdminStorage() {
  const nav = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const treeLoadedRef = useRef(false)
  const [status, setStatus] = useState('loading')
  const [errorText, setErrorText] = useState('')
  const [role, setRole] = useState('user')
  const [rootPath, setRootPath] = useState('')
  const [currentPath, setCurrentPath] = useState('')
  const [entries, setEntries] = useState([])
  const [truncated, setTruncated] = useState(false)
  const [mediaRenderLimit, setMediaRenderLimit] = useState(INITIAL_MEDIA_RENDER_LIMIT)
  const [viewMode, setViewMode] = useState(() => {
    const savedMode = decodeViewMode(getCookieValue(VIEW_MODE_COOKIE))
    return savedMode === 'grid' || savedMode === 'column' ? savedMode : 'grid'
  })
  const [sortBy, setSortBy] = useState('date')
  const [sortOrder, setSortOrder] = useState('desc')
  const [mediaFilter, setMediaFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [selectedMediaPath, setSelectedMediaPath] = useState('')
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [isCompactDevice, setIsCompactDevice] = useState(false)
  const [treeStatus, setTreeStatus] = useState('loading')
  const [treeErrorText, setTreeErrorText] = useState('')
  const [folderTree, setFolderTree] = useState(null)
  const [treeTruncated, setTreeTruncated] = useState(false)
  const [expandedTreePaths, setExpandedTreePaths] = useState(() => new Set(['']))
  const [treeQuery, setTreeQuery] = useState('')

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

  const expandTreeToPath = useCallback((pathValue) => {
    setExpandedTreePaths((prev) => {
      const next = new Set(prev)
      for (const item of createExpandedPathSet(pathValue)) next.add(item)
      return next
    })
  }, [])

  const handleSelectPath = useCallback(
    (nextPath) => {
      expandTreeToPath(nextPath)
      setPathInUrl(nextPath)
    },
    [expandTreeToPath, setPathInUrl],
  )

  const handleToggleTreePath = useCallback((pathValue) => {
    setExpandedTreePaths((prev) => togglePathInSet(prev, pathValue))
  }, [])

  useEffect(() => {
    setCookieValue(VIEW_MODE_COOKIE, encodeViewMode(viewMode))
  }, [viewMode])

  const loadFolderTree = useCallback(async (pathForExpansion = '') => {
    setTreeStatus('loading')
    setTreeErrorText('')
    try {
      const data = await fetchJson('/api/admin/storage/tree')
      setFolderTree(data?.tree && typeof data.tree === 'object' ? data.tree : null)
      setTreeTruncated(Boolean(data?.truncated))
      expandTreeToPath(pathForExpansion)
      setTreeStatus('idle')
    } catch (e) {
      if (e?.status === 401) {
        setAuthToken(null)
        nav('/login', { replace: true })
        return
      }
      setTreeStatus('error')
      setTreeErrorText(e?.status === 403 ? 'Owner access required.' : 'Folder tree could not be loaded.')
    }
  }, [expandTreeToPath, nav])

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
        setErrorText('Owner access required.')
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
        setErrorText('Owner access required.')
        return
      }
      if (e?.status === 404) {
        setStatus('error')
        setErrorText('Folder not found.')
        return
      }
      setStatus('error')
      setErrorText('Storage Host could not be loaded.')
    }
  }, [initialRenderLimit, nav])

  useEffect(() => {
    const id = setTimeout(() => {
      loadFolder(urlPath)
    }, 0)
    return () => clearTimeout(id)
  }, [loadFolder, urlPath])

  useEffect(() => {
    if (treeLoadedRef.current) return
    const id = setTimeout(() => {
      treeLoadedRef.current = true
      loadFolderTree(urlPath)
    }, 0)
    return () => clearTimeout(id)
  }, [loadFolderTree, urlPath])

  useEffect(() => {
    const id = setTimeout(() => {
      expandTreeToPath(currentPath)
    }, 0)
    return () => clearTimeout(id)
  }, [currentPath, expandTreeToPath])

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

  const mediaEntries = useMemo(() => {
    return entries
      .filter((x) => x?.type === 'file' && (x?.media_kind === 'image' || x?.media_kind === 'video'))
      .filter((x) => mediaFilter === 'all' || x?.media_kind === mediaFilter)
      .filter(visibleEntryMatcher)
      .sort((a, b) => compareEntries(a, b, sortBy, sortOrder))
  }, [entries, mediaFilter, sortBy, sortOrder, visibleEntryMatcher])

  useEffect(() => {
    const id = setTimeout(() => {
      setMediaRenderLimit(initialRenderLimit)
    }, 0)
    return () => clearTimeout(id)
  }, [initialRenderLimit, queryText, mediaFilter, sortBy, sortOrder, currentPath])

  useEffect(() => {
    if (!selectedMediaPath) return
    const id = setTimeout(() => {
      if (!mediaEntries.length) {
        setSelectedMediaPath('')
        setIsFullscreenOpen(false)
        return
      }
      if (!mediaEntries.some((item) => item.path === selectedMediaPath)) {
        setSelectedMediaPath('')
        setIsFullscreenOpen(false)
      }
    }, 0)
    return () => clearTimeout(id)
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

  const handleRefreshTree = useCallback(() => {
    loadFolderTree(currentPath)
  }, [currentPath, loadFolderTree])

  const handleCopy = useCallback(async (key, value) => {
    const ok = await copyToClipboard(value)
    if (!ok) return
    setCopiedKey(key)
    window.setTimeout(() => setCopiedKey((current) => (current === key ? '' : current)), 1400)
  }, [])

  return (
    <div className="min-h-screen bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto w-full max-w-[1800px] px-3 pb-8 pt-3 sm:px-4 lg:px-5">
        <div className="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="min-h-[280px] max-h-[52vh] lg:sticky lg:top-3 lg:h-[calc(100vh-1.5rem)] lg:max-h-none">
            <StorageFolderTree
              tree={folderTree}
              currentPath={currentPath}
              expandedPaths={expandedTreePaths}
              treeQuery={treeQuery}
              status={treeStatus}
              errorText={treeErrorText}
              truncated={treeTruncated}
              onTreeQueryChange={setTreeQuery}
              onTogglePath={handleToggleTreePath}
              onSelectPath={handleSelectPath}
              onRefreshTree={handleRefreshTree}
            />
          </aside>

          <main className="min-w-0">
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
              onRefreshTree={handleRefreshTree}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
            />

            <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0 flex-1">
                <StoragePathBar
                  currentPath={currentPath}
                  rootPath={rootPath}
                  breadcrumbItems={breadcrumbItems}
                  onSelectPath={handleSelectPath}
                  copiedKey={copiedKey}
                  onCopy={handleCopy}
                />
              </div>

              <Link
                to="/admin-v3"
                className="inline-flex h-10 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              >
                Back to admin
              </Link>
            </div>

            {status === 'forbidden' ? (
              <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">{errorText || 'Forbidden'}</div>
            ) : null}

            {status !== 'forbidden' ? (
              <div className="mt-4">
                {status === 'loading' ? <LoadingGrid /> : null}
                {status === 'error' ? <EmptyState title={errorText} detail="Refresh media or choose another folder from the tree." /> : null}

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
                    emptyTitle={queryText ? 'No media matches this search' : 'This folder has no images or videos'}
                    emptyDetail={queryText ? 'Try a shorter query or switch media filters.' : 'Supported images and videos will appear as thumbnails here.'}
                  />
                ) : null}

                {truncated ? (
                  <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                    This folder result is partial because it contains many entries.
                  </div>
                ) : null}
              </div>
            ) : null}

            {role && role !== 'owner' && status !== 'forbidden' ? (
              <div className={joinClasses('mt-4 text-xs font-semibold text-slate-500', role === 'owner' ? 'hidden' : '')}>Role: {role}</div>
            ) : null}
          </main>
        </div>
      </div>

      <StorageFullscreenViewer
        media={isFullscreenOpen ? selectedMedia : null}
        mediaUrl={selectedMediaUrl}
        previewUrl={selectedMediaPreviewUrl}
        onClose={() => setIsFullscreenOpen(false)}
        onPrev={goPrevMedia}
        onNext={goNextMedia}
      />
    </div>
  )
}
