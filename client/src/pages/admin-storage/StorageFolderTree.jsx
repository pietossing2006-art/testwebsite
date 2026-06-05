import { Icon, ToolbarButton } from './StoragePrimitives.jsx'
import { filterTreeByQuery, normalizeStoragePath } from './storageTreeUtils.js'
import { joinClasses } from './storageMediaUtils.js'

function TreeNode({
  node,
  level,
  currentPath,
  expandedPaths,
  treeQuery,
  onTogglePath,
  onSelectPath,
}) {
  const normalizedPath = normalizeStoragePath(node?.path)
  const children = Array.isArray(node?.children) ? node.children : []
  const hasChildren = children.length > 0
  const isExpanded = Boolean(treeQuery) || expandedPaths?.has(normalizedPath)
  const isActive = normalizeStoragePath(currentPath) === normalizedPath
  const label = normalizedPath ? node.name : 'All files'

  return (
    <div>
      <div
        className={joinClasses(
          'group grid min-h-9 grid-cols-[24px_minmax(0,1fr)] items-center gap-1 rounded-md pr-2 text-left',
          isActive ? 'bg-slate-950 text-white' : 'text-slate-700 hover:bg-slate-100 hover:text-slate-950',
        )}
        style={{ paddingLeft: `${Math.min(level, 8) * 12 + 4}px` }}
      >
        <button
          type="button"
          onClick={() => hasChildren && onTogglePath(normalizedPath)}
          className={joinClasses(
            'grid h-7 w-6 place-items-center rounded-md transition',
            hasChildren ? (isActive ? 'text-white/80 hover:bg-white/10' : 'text-slate-400 hover:bg-white hover:text-slate-700') : 'cursor-default text-transparent',
          )}
          aria-label={isExpanded ? 'Collapse folder' : 'Expand folder'}
          disabled={!hasChildren}
        >
          <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => onSelectPath(normalizedPath)}
          className="flex min-w-0 items-center gap-2 py-1.5 text-left"
          title={normalizedPath || 'All files'}
        >
          <Icon name={normalizedPath ? 'folder' : 'storage'} className={joinClasses('h-4 w-4 shrink-0', isActive ? 'text-white' : 'text-slate-400')} />
          <span className="truncate text-xs font-bold">{label}</span>
          {node?.truncated ? <span className={joinClasses('ml-auto text-[10px] font-black', isActive ? 'text-amber-200' : 'text-amber-600')}>partial</span> : null}
        </button>
      </div>

      {hasChildren && isExpanded ? (
        <div className="mt-0.5 space-y-0.5">
          {children.map((child) => (
            <TreeNode
              key={child.path || child.name}
              node={child}
              level={level + 1}
              currentPath={currentPath}
              expandedPaths={expandedPaths}
              treeQuery={treeQuery}
              onTogglePath={onTogglePath}
              onSelectPath={onSelectPath}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default function StorageFolderTree({
  tree,
  currentPath,
  expandedPaths,
  treeQuery,
  status,
  errorText,
  truncated,
  onTreeQueryChange,
  onTogglePath,
  onSelectPath,
  onRefreshTree,
}) {
  const visibleTree = filterTreeByQuery(tree, treeQuery)
  const hasTree = Boolean(visibleTree)

  return (
    <section className="flex h-full min-h-[280px] flex-col rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm">
      <div className="border-b border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase text-slate-400">Folders</div>
            <div className="truncate text-sm font-black text-slate-950">Storage Tree</div>
          </div>
          <ToolbarButton onClick={onRefreshTree} disabled={status === 'loading'} className="h-8 px-2" title="Refresh tree">
            <Icon name="refresh" className="h-3.5 w-3.5" />
          </ToolbarButton>
        </div>

        <label className="relative mt-3 block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            value={treeQuery}
            onChange={(e) => onTreeQueryChange(e.target.value)}
            placeholder="Search folders"
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-slate-400"
          />
        </label>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {status === 'loading' ? (
          <div className="space-y-2 p-2">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div key={idx} className="h-8 animate-pulse rounded-md bg-slate-100" />
            ))}
          </div>
        ) : null}

        {status === 'error' ? (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-700">
            {errorText || 'Folder tree could not be loaded.'}
          </div>
        ) : null}

        {status === 'idle' && hasTree ? (
          <TreeNode
            node={visibleTree}
            level={0}
            currentPath={currentPath}
            expandedPaths={expandedPaths}
            treeQuery={treeQuery}
            onTogglePath={onTogglePath}
            onSelectPath={onSelectPath}
          />
        ) : null}

        {status === 'idle' && !hasTree ? (
          <div className="rounded-md border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-500">
            No matching folders
          </div>
        ) : null}
      </div>

      {truncated ? (
        <div className="border-t border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-semibold text-amber-800">
          Tree is partial because the storage root is large.
        </div>
      ) : null}
    </section>
  )
}
