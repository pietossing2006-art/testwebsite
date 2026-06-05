# Host Storage Gallery Studio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/admin/storage` as a light gallery-first media workspace with a real full folder tree sidebar.

**Architecture:** Add guarded folder-tree traversal helpers in `server/lib/storage.js` and expose them through a new owner-only `/api/admin/storage/tree` route. Rebuild the React storage page around a light layout, a dedicated folder tree sidebar, a slim toolbar, a uniform gallery grid, and the existing fullscreen media viewer contract.

**Tech Stack:** Express, Node `fs.promises`, React 19, React Router, Vite, Tailwind utilities, Node test runner.

---

## File Structure

- Modify: `server/lib/storage.js`
  - Add folder tree constants and helper functions.
  - Keep path normalization and media token helpers unchanged.
- Modify: `server/routes/admin-core.js`
  - Import the new tree helper.
  - Add `GET /api/admin/storage/tree` behind `requireAuth` and `requireOwner`.
- Modify: `server/tests/security/storage-media.test.js`
  - Add tree traversal tests using temporary directories.
- Modify: `client/src/pages/AdminStorage.jsx`
  - Orchestrate folder list loading, tree loading, selected media, filters, URL path, and layout.
- Modify: `client/src/pages/admin-storage/StorageToolbar.jsx`
  - Replace dark hero toolbar with slim light sticky controls.
- Modify: `client/src/pages/admin-storage/StorageMediaGrid.jsx`
  - Replace dark cards with light uniform gallery cards.
- Modify: `client/src/pages/admin-storage/StoragePathBar.jsx`
  - Convert into a compact light path strip if still needed.
- Modify: `client/src/pages/admin-storage/StoragePrimitives.jsx`
  - Update primitives for light gallery styling and add any missing icons.
- Create: `client/src/pages/admin-storage/StorageFolderTree.jsx`
  - Render the full tree sidebar and mobile tree panel.
- Create: `client/src/pages/admin-storage/storageTreeUtils.js`
  - Normalize tree state, ancestor expansion, search filtering, and selected path helpers.
- Create: `client/src/pages/admin-storage/storageTreeUtils.test.mjs`
  - Test helper behavior without React.

---

### Task 1: Backend Storage Tree

**Files:**
- Modify: `server/lib/storage.js`
- Modify: `server/tests/security/storage-media.test.js`
- Modify: `server/routes/admin-core.js`

- [ ] **Step 1: Write failing storage tree helper tests**

Add tests in `server/tests/security/storage-media.test.js` using `fs.mkdtemp`, `fs.mkdir`, and `os.tmpdir`. Cover:
- hidden folders are skipped
- folders deeper than `maxDepth` set `truncated: true`
- folder counts stop at `maxFolders`
- invalid relative paths still throw through `resolveStoragePath`

Run:
`cd server && npm test -- tests/security/storage-media.test.js`

Expected before implementation: tests fail because `buildStorageFolderTree` is not exported.

- [ ] **Step 2: Implement the storage tree helper**

In `server/lib/storage.js`, add:
- `STORAGE_TREE_DEFAULT_MAX_DEPTH`
- `STORAGE_TREE_DEFAULT_MAX_FOLDERS`
- `STORAGE_TREE_HARD_MAX_DEPTH`
- `STORAGE_TREE_HARD_MAX_FOLDERS`
- `buildStorageFolderTree(rawPath, options)`

The helper resolves the starting path with `resolveStoragePath`, recursively reads directories with `withFileTypes: true`, skips hidden folder names, sorts folders naturally, counts folders, stops when limits are reached, and returns:

```js
{
  root,
  path,
  tree: {
    name,
    path,
    children,
    truncated,
  },
  folder_count,
  max_depth,
  max_folders,
  truncated,
}
```

- [ ] **Step 3: Verify backend helper tests pass**

Run:
`cd server && npm test -- tests/security/storage-media.test.js`

Expected after implementation: storage media tests pass.

- [ ] **Step 4: Add the owner-only tree route**

In `server/routes/admin-core.js`, import `buildStorageFolderTree` and add:

`GET /api/admin/storage/tree`

The route reads optional `path`, `max_depth`, and `max_folders` query values, calls the helper, and returns `{ ok: true, ...treeResult }`. It maps invalid paths to `400`, missing folders to `404`, non-directory roots to `400`, and unexpected traversal failures to `500`.

---

### Task 2: Frontend Tree State Helpers

**Files:**
- Create: `client/src/pages/admin-storage/storageTreeUtils.js`
- Create: `client/src/pages/admin-storage/storageTreeUtils.test.mjs`

- [ ] **Step 1: Write failing helper tests**

Test:
- `collectAncestorPaths('a/b/c')` returns `['', 'a', 'a/b']`
- `createExpandedPathSet('a/b')` includes root and ancestors
- `filterTreeByQuery(tree, 'raid')` keeps matching descendants and their parents
- `countTreeFolders(tree)` counts folder nodes

Run:
`cd client && node --test src/pages/admin-storage/storageTreeUtils.test.mjs`

Expected before implementation: module import fails.

- [ ] **Step 2: Implement helper module**

Create pure functions:
- `normalizeStoragePath(value)`
- `collectAncestorPaths(pathValue)`
- `createExpandedPathSet(pathValue)`
- `togglePathInSet(set, pathValue)`
- `filterTreeByQuery(node, query)`
- `countTreeFolders(node)`

Keep the helpers framework-free so they can be tested with Node.

- [ ] **Step 3: Verify helper tests pass**

Run:
`cd client && node --test src/pages/admin-storage/storageTreeUtils.test.mjs`

Expected after implementation: all helper tests pass.

---

### Task 3: Light Gallery UI Components

**Files:**
- Create: `client/src/pages/admin-storage/StorageFolderTree.jsx`
- Modify: `client/src/pages/admin-storage/StorageToolbar.jsx`
- Modify: `client/src/pages/admin-storage/StorageMediaGrid.jsx`
- Modify: `client/src/pages/admin-storage/StoragePathBar.jsx`
- Modify: `client/src/pages/admin-storage/StoragePrimitives.jsx`

- [ ] **Step 1: Build `StorageFolderTree.jsx`**

Implement a light sidebar component with props:
- `tree`
- `currentPath`
- `expandedPaths`
- `treeQuery`
- `status`
- `errorText`
- `truncated`
- `onTreeQueryChange`
- `onTogglePath`
- `onSelectPath`
- `onRefreshTree`

Render root and children recursively. Use buttons, indentation, active path highlight, a search input, refresh button, and a truncated note.

- [ ] **Step 2: Restyle toolbar**

Convert `StorageToolbar.jsx` into a slim light sticky bar. Keep the same control props plus `onRefreshTree` if needed from the parent. Use stable control heights and compact labels.

- [ ] **Step 3: Restyle gallery grid**

Convert `StorageMediaGrid.jsx` into a light uniform grid with cover plus caption cards. Keep progressive rendering, selected state, grid/list support if already passed, load more, and empty states.

- [ ] **Step 4: Restyle primitives/path bar**

Update primitive classes to work on light surfaces. Keep media preview logic, `Icon`, `ToolbarButton`, `EmptyState`, `LoadingGrid`, `FolderChip`, and `MediaMeta` exports compatible with existing imports.

---

### Task 4: Page Orchestration

**Files:**
- Modify: `client/src/pages/AdminStorage.jsx`

- [ ] **Step 1: Add tree loading state**

Add:
- `treeStatus`
- `treeErrorText`
- `folderTree`
- `treeTruncated`
- `expandedTreePaths`
- `treeQuery`

Create `loadFolderTree` using `fetchJson('/api/admin/storage/tree')`.

- [ ] **Step 2: Wire folder selection**

When selecting a folder from the tree, update the URL path through the existing `setPathInUrl`. Expand ancestors for the active path. Keep `loadFolder(urlPath)` as the media list source.

- [ ] **Step 3: Replace layout**

Use a two-column desktop shell:
- sidebar: `StorageFolderTree`
- main: `StorageToolbar`, compact path context, gallery grid, status banners, lightbox

Keep role, auth, forbidden, loading, error, truncated media, search/filter/sort, view mode cookie, selected media, keyboard fullscreen navigation, body scroll lock, copy path, and media navigation behavior.

---

### Task 5: Verification

**Files:**
- Test: `server/package.json`
- Test: `client/package.json`

- [ ] **Step 1: Run focused server tests**

Run:
`cd server && npm test -- tests/security/storage-media.test.js`

Expected: exit 0.

- [ ] **Step 2: Run focused client helper tests**

Run:
`cd client && node --test src/pages/admin-storage/storageTreeUtils.test.mjs src/pages/admin-storage/storageInteractionUtils.test.mjs src/pages/admin-storage/storageMediaUtils.test.mjs`

Expected: exit 0.

- [ ] **Step 3: Build the client**

Run:
`cd client && npm run build`

Expected: Vite build exits 0.

- [ ] **Step 4: Review diff**

Run:
`git diff --stat`

Expected: changes are limited to storage backend helpers/routes/tests, storage UI components/helpers/tests, and Superpowers docs for this feature.

## Self-Review
- Spec coverage: backend full tree, Light Museum UI, sticky controls, folder switching, gallery grid, clean lightbox, and verification are covered.
- Completeness scan: no deferred or ambiguous plan items remain.
- Type consistency: route and helper names use `buildStorageFolderTree`, frontend tree helpers use path strings, and UI props match the page orchestration task.
