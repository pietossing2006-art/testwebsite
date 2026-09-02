import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { copyToClipboard, fetchJson, resolveApiUrl, setAuthToken } from '../api.js'
import StorageFullscreenViewer from './admin-storage/StorageFullscreenViewer.jsx'
import StorageMediaGrid from './admin-storage/StorageMediaGrid.jsx'
import StoragePathBar from './admin-storage/StoragePathBar.jsx'
import { EmptyState, Icon, LoadingGrid, ToolbarButton } from './admin-storage/StoragePrimitives.jsx'
import StorageToolbar from './admin-storage/StorageToolbar.jsx'
import {
  compareEntries,
  decodeViewMode,
  encodeViewMode,
  getCookieValue,
  getStorageFullscreenPreviewUrl,
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
  const [viewMode, setViewMode] = useState(() => {
    const savedMode = decodeViewMode(getCookieValue(VIEW_MODE_COOKIE))
    return savedMode === 'grid' || savedMode === 'column' ? savedMode : 'grid'
  })
  const [sortBy, setSortBy] = useState('name')
  const [sortOrder, setSortOrder] = useState('asc')
  const [mediaFilter, setMediaFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [copiedKey, setCopiedKey] = useState('')
  const [selectedMediaPath, setSelectedMediaPath] = useState('')
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)
  const [isCompactDevice, setIsCompactDevice] = useState(false)

  // Multi-selection state
  const [selectedPaths, setSelectedPaths] = useState(() => new Set())

  // Modal states
  const [isNewFolderOpen, setIsNewFolderOpen] = useState(false)
  const [newFolderName, setNewFolderName] = useState('')
  const [renamingItem, setRenamingItem] = useState(null)
  const [renameNewName, setRenameNewName] = useState('')
  const [deletingItems, setDeletingItems] = useState(null) // Array of items/paths to delete
  const [opLoading, setOpLoading] = useState(false)
  const [opError, setOpError] = useState('')

  // Upload & Drag-and-drop state
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadStatusText, setUploadStatusText] = useState('')

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
      setSelectedPaths(new Set())
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev)
        if (normalized) next.set('path', normalized)
        else next.delete('path')
        return next
      })
    },
    [setSearchParams],
  )

  const handleSelectPath = useCallback(
    (nextPath) => {
      setPathInUrl(nextPath)
    },
    [setPathInUrl],
  )

  useEffect(() => {
    setCookieValue(VIEW_MODE_COOKIE, encodeViewMode(viewMode))
  }, [viewMode])

  const loadFolder = useCallback(
    async (pathValue = '') => {
      setStatus('loading')
      setErrorText('')
      try {
        const qs = new URLSearchParams()
        if (pathValue) qs.set('path', pathValue)
        const data = await fetchJson(`/api/admin/storage/list?${qs.toString()}`)
        setRole('owner')
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
    },
    [initialRenderLimit, nav],
  )

  useEffect(() => {
    const id = setTimeout(() => {
      loadFolder(urlPath)
    }, 0)
    return () => clearTimeout(id)
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
    const media = entries.filter((x) => x?.type === 'file')
    const images = media.filter((x) => x.media_kind === 'image')
    const videos = media.filter((x) => x.media_kind === 'video')
    const audio = media.filter((x) => x.media_kind === 'audio')
    const docs = media.filter((x) => x.media_kind === 'document')
    return {
      folders: entries.filter((x) => x?.type === 'directory').length,
      media: media.length,
      images: images.length,
      videos: videos.length,
      audio: audio.length,
      documents: docs.length,
    }
  }, [entries])

  const gridEntries = useMemo(() => {
    const folders = entries.filter((x) => x?.type === 'directory')
    const media = entries
      .filter((x) => x?.type === 'file')
      .filter((x) => mediaFilter === 'all' || x?.media_kind === mediaFilter)

    const filteredFolders = folders.filter(visibleEntryMatcher)
    const filteredMedia = media.filter(visibleEntryMatcher)

    filteredFolders.sort((a, b) => compareEntries(a, b, sortBy, sortOrder))
    filteredMedia.sort((a, b) => compareEntries(a, b, sortBy, sortOrder))

    return [...filteredFolders, ...filteredMedia]
  }, [entries, mediaFilter, sortBy, sortOrder, visibleEntryMatcher])

  const mediaEntries = useMemo(() => {
    return gridEntries.filter((x) => x.type === 'file')
  }, [gridEntries])

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
    () => getStorageFullscreenPreviewUrl(selectedMedia),
    [selectedMedia],
  )

  const visibleGridEntries = useMemo(() => gridEntries.slice(0, mediaRenderLimit), [gridEntries, mediaRenderLimit])
  const hasMoreMedia = gridEntries.length > visibleGridEntries.length

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

  // Multi-selection handlers
  const handleToggleSelect = useCallback((itemPath) => {
    setSelectedPaths((prev) => {
      const next = new Set(prev)
      if (next.has(itemPath)) next.delete(itemPath)
      else next.add(itemPath)
      return next
    })
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelectedPaths(new Set())
  }, [])

  // File Upload Handler
  const handleUploadFiles = useCallback(
    async (files) => {
      if (!files || !files.length) return
      setIsUploading(true)
      setUploadStatusText(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`)

      try {
        const formData = new FormData()
        formData.append('path', currentPath)
        for (const file of files) {
          formData.append('files', file)
        }

        const res = await fetch(resolveApiUrl('/api/admin/storage/upload'), {
          method: 'POST',
          body: formData,
          credentials: 'include',
        })

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}))
          throw new Error(errData?.error || 'Upload failed')
        }

        setUploadStatusText('Upload complete!')
        window.setTimeout(() => setUploadStatusText(''), 2500)
        await loadFolder(currentPath)
      } catch (err) {
        setUploadStatusText(`Upload error: ${err.message}`)
        window.setTimeout(() => setUploadStatusText(''), 4000)
      } finally {
        setIsUploading(false)
      }
    },
    [currentPath, loadFolder],
  )

  // Drag-and-drop event handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.currentTarget.contains(e.relatedTarget)) return
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragging(false)
      const droppedFiles = Array.from(e.dataTransfer?.files || [])
      if (droppedFiles.length) {
        handleUploadFiles(droppedFiles)
      }
    },
    [handleUploadFiles],
  )

  // New Folder creation
  const handleCreateFolder = async (e) => {
    e.preventDefault()
    const name = newFolderName.trim()
    if (!name) return
    setOpLoading(true)
    setOpError('')
    try {
      await fetchJson('/api/admin/storage/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: currentPath, name }),
      })
      setIsNewFolderOpen(false)
      setNewFolderName('')
      await loadFolder(currentPath)
    } catch (err) {
      setOpError(err?.data?.error === 'already_exists' ? 'Folder already exists.' : 'Could not create folder.')
    } finally {
      setOpLoading(false)
    }
  }

  // Rename item
  const handleRenameSubmit = async (e) => {
    e.preventDefault()
    const newName = renameNewName.trim()
    if (!newName || !renamingItem) return
    setOpLoading(true)
    setOpError('')
    try {
      await fetchJson('/api/admin/storage/rename', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: renamingItem.path, new_name: newName }),
      })
      setRenamingItem(null)
      setRenameNewName('')
      await loadFolder(currentPath)
    } catch (err) {
      setOpError(err?.data?.error === 'already_exists' ? 'Name already exists.' : 'Could not rename item.')
    } finally {
      setOpLoading(false)
    }
  }

  // Delete items (Single or Batch)
  const handleDeleteConfirm = async () => {
    if (!deletingItems || !deletingItems.length) return
    setOpLoading(true)
    setOpError('')
    try {
      await fetchJson('/api/admin/storage/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: deletingItems }),
      })
      setDeletingItems(null)
      setSelectedPaths(new Set())
      await loadFolder(currentPath)
    } catch (err) {
      setOpError('Could not delete selected items.')
    } finally {
      setOpLoading(false)
    }
  }

  // Download ZIP (Selected or Single)
  const handleDownloadZip = useCallback(
    async (pathsToDownload = null) => {
      const targetPaths = pathsToDownload || Array.from(selectedPaths)
      if (!targetPaths.length) return

      try {
        const res = await fetch(resolveApiUrl('/api/admin/storage/download-zip'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: targetPaths }),
          credentials: 'include',
        })

        if (!res.ok) throw new Error('ZIP creation failed')
        const blob = await res.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `vxpers-storage-${Date.now().toString().slice(-6)}.zip`
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.URL.revokeObjectURL(url)
      } catch (err) {
        alert('Could not download ZIP archive.')
      }
    },
    [selectedPaths],
  )

  const handleSingleDownload = useCallback((item) => {
    if (!item) return
    const url = buildStorageMediaUrl('file', item)
    const a = document.createElement('a')
    a.href = url
    a.download = item.name
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, [])

  return (
    <div
      className="relative min-h-screen bg-[#f6f7f9] text-slate-950"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag & Drop Visual Overlay */}
      {isDragging ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-blue-600/85 p-6 backdrop-blur-sm">
          <div className="flex max-w-lg flex-col items-center justify-center rounded-3xl border-4 border-dashed border-white/60 p-10 text-center text-white">
            <div className="grid h-20 w-20 place-items-center rounded-full bg-white/20">
              <Icon name="upload" className="h-10 w-10 text-white" />
            </div>
            <div className="mt-4 text-2xl font-black">Drop files here to upload</div>
            <div className="mt-1 text-sm font-semibold text-white/80">
              Files will be saved into <span className="font-bold underline">{currentPath || 'Root folder'}</span>
            </div>
          </div>
        </div>
      ) : null}

      <div className="mx-auto w-full max-w-[1800px] px-3 pb-8 pt-3 sm:px-4 lg:px-5">
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
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onUploadFiles={handleUploadFiles}
            onNewFolder={() => {
              setNewFolderName('')
              setOpError('')
              setIsNewFolderOpen(true)
            }}
            selectedCount={selectedPaths.size}
            onDownloadZip={() => handleDownloadZip()}
            onDeleteSelected={() => {
              setOpError('')
              setDeletingItems(Array.from(selectedPaths))
            }}
            onClearSelection={handleClearSelection}
            isUploading={isUploading}
          />

          {uploadStatusText ? (
            <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-2.5 text-xs font-bold text-blue-900 shadow-sm animate-fade-in">
              <Icon name="storage" className="h-4 w-4 text-blue-600 animate-spin" />
              <span>{uploadStatusText}</span>
            </div>
          ) : null}

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
            <div className="mt-4 rounded-lg border border-rose-200 bg-rose-50 p-5 text-sm font-semibold text-rose-700">
              {errorText || 'Forbidden'}
            </div>
          ) : null}

          {status !== 'forbidden' ? (
            <div className="mt-4">
              {status === 'loading' ? <LoadingGrid /> : null}
              {status === 'error' ? (
                <EmptyState title={errorText} detail="Refresh media or check the path." />
              ) : null}

              {status === 'idle' ? (
                <StorageMediaGrid
                  items={visibleGridEntries}
                  viewMode={viewMode}
                  selectedPath={selectedMediaPath}
                  selectedPaths={selectedPaths}
                  onSelect={handleSelectMedia}
                  onSelectFolder={handleSelectPath}
                  onToggleSelect={handleToggleSelect}
                  onRename={(item) => {
                    setRenamingItem(item)
                    setRenameNewName(item.name)
                    setOpError('')
                  }}
                  onDelete={(item) => {
                    setDeletingItems([item.path])
                    setOpError('')
                  }}
                  onDownload={handleSingleDownload}
                  onCopyLink={(item) => {
                    const url = buildStorageMediaUrl('file', item)
                    handleCopy(`link-${item.path}`, url)
                  }}
                  renderLimit={mediaRenderLimit}
                  onLoadMore={() => setMediaRenderLimit((n) => n + mediaRenderStep)}
                  hasMore={hasMoreMedia}
                  totalCount={gridEntries.length}
                  emptyTitle={queryText ? 'No content matches this search' : 'This folder is empty'}
                  emptyDetail={
                    queryText
                      ? 'Try a shorter query or switch filters.'
                      : 'Upload files or create subfolders to get started.'
                  }
                />
              ) : null}

              {truncated ? (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
                  This folder result is partial because it contains many entries.
                </div>
              ) : null}
            </div>
          ) : null}
        </main>
      </div>

      {/* 📁 New Folder Modal */}
      {isNewFolderOpen ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-black text-slate-900">Create New Folder</h3>
              <button
                type="button"
                onClick={() => setIsNewFolderOpen(false)}
                className="text-slate-400 hover:text-slate-700"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateFolder} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700">Folder Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Assets, Photos, Archives"
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {opError ? <div className="text-xs font-bold text-rose-600">{opError}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsNewFolderOpen(false)}
                  className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={opLoading || !newFolderName.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Icon name="plus" className="h-4 w-4" />
                  {opLoading ? 'Creating...' : 'Create Folder'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ✏️ Rename Modal */}
      {renamingItem ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-base font-black text-slate-900">Rename Item</h3>
              <button
                type="button"
                onClick={() => setRenamingItem(null)}
                className="text-slate-400 hover:text-slate-700"
              >
                <Icon name="close" className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleRenameSubmit} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700">New Name</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={renameNewName}
                  onChange={(e) => setRenameNewName(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                />
              </div>

              {opError ? <div className="text-xs font-bold text-rose-600">{opError}</div> : null}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setRenamingItem(null)}
                  className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={opLoading || !renameNewName.trim()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-blue-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
                >
                  <Icon name="check" className="h-4 w-4" />
                  {opLoading ? 'Renaming...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* 🗑️ Delete Confirmation Modal */}
      {deletingItems && deletingItems.length ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-rose-50 border border-rose-200">
                <Icon name="trash" className="h-5 w-5" />
              </div>
              <h3 className="text-base font-black text-slate-900">Confirm Deletion</h3>
            </div>

            <p className="mt-3 text-xs font-semibold text-slate-600 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <span className="font-bold text-slate-900">
                {deletingItems.length === 1 ? deletingItems[0] : `${deletingItems.length} selected items`}
              </span>
              ? This action cannot be undone.
            </p>

            {opError ? <div className="mt-2 text-xs font-bold text-rose-600">{opError}</div> : null}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeletingItems(null)}
                className="h-9 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirm}
                disabled={opLoading}
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-rose-600 px-4 text-xs font-bold text-white shadow-sm hover:bg-rose-700 disabled:opacity-50"
              >
                <Icon name="trash" className="h-4 w-4" />
                {opLoading ? 'Deleting...' : 'Delete Permanently'}
              </button>
            </div>
          </div>
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
    </div>
  )
}
