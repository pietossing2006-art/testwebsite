# Owner Storage Host Media Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Owner Storage Host page into a faster media browser/player with an inline focus viewer and lighter browsing UI.

**Architecture:** Keep the existing route and API contract, but split the monolithic page into media-specific UI components and a smaller set of focused helpers. Make selected media the core page state, reduce file-manager UI, and limit unnecessary rerenders through memoized derived data and lighter initial rendering.

**Tech Stack:** React 19, React Router, Vite, Tailwind utility classes, Plyr

---

## File Structure

- Modify: `client/src/pages/AdminStorage.jsx`
  - Replace the monolithic page with a media-workspace layout.
  - Keep data fetching and page state orchestration here.
- Create: `client/src/pages/admin-storage/storageMediaUtils.js`
  - Shared formatting, sorting, URL builders, and text helpers.
- Create: `client/src/pages/admin-storage/StorageToolbar.jsx`
  - Search, filter, sort, refresh, summary controls.
- Create: `client/src/pages/admin-storage/StoragePathBar.jsx`
  - Compact path context and light breadcrumb row.
- Create: `client/src/pages/admin-storage/StorageFocusViewer.jsx`
  - Inline image/video viewer, next/prev controls, fullscreen trigger, touch navigation.
- Create: `client/src/pages/admin-storage/StorageMediaGrid.jsx`
  - Media browsing surface with progressive rendering.
- Create: `client/src/pages/admin-storage/StorageFullscreenViewer.jsx`
  - Optional fullscreen overlay built around selected media.
- Create: `client/src/pages/admin-storage/StoragePrimitives.jsx`
  - Reusable icon, button, empty state, loading, and media preview primitives.
- Test: `client` build via `npm run build`

### Task 1: Extract shared helpers and UI primitives

**Files:**
- Create: `client/src/pages/admin-storage/storageMediaUtils.js`
- Create: `client/src/pages/admin-storage/StoragePrimitives.jsx`
- Modify: `client/src/pages/AdminStorage.jsx`

- [ ] **Step 1: Create helper module for formatting and media URL logic**
- [ ] **Step 2: Move reusable UI bits into a primitives file**
- [ ] **Step 3: Update AdminStorage imports to use the extracted helpers**

### Task 2: Split the page into media-focused sections

**Files:**
- Create: `client/src/pages/admin-storage/StorageToolbar.jsx`
- Create: `client/src/pages/admin-storage/StoragePathBar.jsx`
- Create: `client/src/pages/admin-storage/StorageMediaGrid.jsx`
- Modify: `client/src/pages/AdminStorage.jsx`

- [ ] **Step 1: Create a compact toolbar component**
- [ ] **Step 2: Create a compact path bar component**
- [ ] **Step 3: Create a dedicated media grid/list component**
- [ ] **Step 4: Simplify AdminStorage layout around toolbar plus viewer plus browser area**

### Task 3: Make selected media the primary interaction state

**Files:**
- Create: `client/src/pages/admin-storage/StorageFocusViewer.jsx`
- Create: `client/src/pages/admin-storage/StorageFullscreenViewer.jsx`
- Modify: `client/src/pages/AdminStorage.jsx`

- [ ] **Step 1: Replace modal-first state with selected media state**
- [ ] **Step 2: Keep selection stable when filters change**
- [ ] **Step 3: Create the inline focus viewer**
- [ ] **Step 4: Keep fullscreen as an extension, not the default viewer**

### Task 4: Reduce rerender pressure and tune progressive loading

**Files:**
- Modify: `client/src/pages/AdminStorage.jsx`
- Modify: `client/src/pages/admin-storage/StorageMediaGrid.jsx`

- [ ] **Step 1: Use a deferred search value before filtering**
- [ ] **Step 2: Lower the first render count to prioritize first paint**
- [ ] **Step 3: Memoize media handlers passed into child components**
- [ ] **Step 4: Reset render count only when browsing inputs really change**

### Task 5: Verify the refactor and prepare GitHub handoff

**Files:**
- Modify: `docs/superpowers/plans/2026-05-18-owner-storage-host-media-workspace.md`
- Test: `client/package.json`

- [ ] **Step 1: Run the production build**
- [ ] **Step 2: Review resulting changed files for accidental scope creep**
- [ ] **Step 3: Prepare GitHub handoff notes**

## Self-Review
- Spec coverage: the plan covers media-first UX, inline viewer, reduced folder emphasis, progressive loading, and lighter rendering.
- Placeholder scan: no TODO/TBD placeholders remain.
- Type consistency: state uses selected media path consistently across viewer, grid, and fullscreen layers.
