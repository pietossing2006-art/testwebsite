export function normalizeStoragePath(value) {
  const text = String(value || '').trim()
  if (!text || text === '.' || text === '/') return ''
  return text
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.')
    .join('/')
}

export function collectAncestorPaths(pathValue) {
  const normalized = normalizeStoragePath(pathValue)
  if (!normalized) return ['']

  const parts = normalized.split('/').filter(Boolean)
  const ancestors = ['']
  for (let i = 1; i < parts.length; i += 1) {
    ancestors.push(parts.slice(0, i).join('/'))
  }
  return ancestors
}

export function createExpandedPathSet(pathValue) {
  const normalized = normalizeStoragePath(pathValue)
  const next = new Set(collectAncestorPaths(normalized))
  if (normalized) next.add(normalized)
  return next
}

export function togglePathInSet(currentSet, pathValue) {
  const normalized = normalizeStoragePath(pathValue)
  const next = new Set(currentSet || [])
  if (next.has(normalized)) next.delete(normalized)
  else next.add(normalized)
  return next
}

function cloneTreeNode(node, children = []) {
  return {
    ...node,
    children,
  }
}

function treeNodeMatches(node, queryText) {
  if (!queryText) return true
  const haystack = `${node?.name || ''} ${node?.path || ''}`.toLowerCase()
  return haystack.includes(queryText)
}

export function filterTreeByQuery(node, query) {
  if (!node) return null
  const queryText = String(query || '').trim().toLowerCase()
  const children = Array.isArray(node.children) ? node.children : []
  if (!queryText) return cloneTreeNode(node, children)

  if (treeNodeMatches(node, queryText)) {
    return cloneTreeNode(node, children)
  }

  const filteredChildren = children
    .map((child) => filterTreeByQuery(child, queryText))
    .filter(Boolean)

  if (filteredChildren.length > 0 || normalizeStoragePath(node.path) === '') {
    return cloneTreeNode(node, filteredChildren)
  }

  return null
}

export function countTreeFolders(node) {
  if (!node) return 0
  const children = Array.isArray(node.children) ? node.children : []
  return 1 + children.reduce((total, child) => total + countTreeFolders(child), 0)
}
