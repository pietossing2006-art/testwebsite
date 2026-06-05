# 2026-06-06 Host Storage Gallery Studio Design

## Goal
Rebuild the Owner Host Storage page from the UI up as a light, gallery-first media browsing workspace while preserving the existing route, access model, media preview behavior, and folder-based storage workflow. The new page should feel like a clean media library rather than a dark admin file explorer.

## Approved Direction
- Product feel: Gallery Studio.
- Gallery layout: immersive, uniform thumbnail grid.
- Visual theme: Light Museum with restrained neutral surfaces and media-first contrast.
- Cards: cover plus caption, with metadata kept secondary.
- Controls: slim sticky bar.
- Folder workflow: full folder tree sidebar for frequent folder switching.
- Fullscreen: clean dark lightbox.
- Backend scope: changing the storage backend is allowed when it directly supports the new UX.

## Current System
The current page is served at `/admin/storage` by `client/src/pages/AdminStorage.jsx`. It lists one folder at a time through `/api/admin/storage/list?path=...`, then renders folders and supported image/video files. Media previews use `/api/admin/storage/thumb/raw/...`, `/api/admin/storage/video-thumb/raw/...`, and `/api/admin/storage/file/raw/...`.

Owner-only access is enforced on the storage list route. Media file routes either accept an owner session or a short-lived signed storage media token.

## New UX
### Desktop Layout
Desktop uses a two-column app workspace:
- Left: sticky full tree sidebar with root, nested folder nodes, active folder highlight, folder search, and tree refresh.
- Right: main gallery workspace with a sticky toolbar, current path context, and a uniform thumbnail grid.

The gallery grid is the primary surface. It should be visible immediately after the toolbar, with no large hero block or explanatory panel. Folder switching updates the URL query path and reloads the folder media list.

### Mobile Layout
Mobile keeps the same behavior in a simpler shape:
- Folder tree collapses into a drawer-like panel above the gallery.
- Toolbar remains compact and touch-friendly.
- Gallery uses a two-column grid with stable card dimensions.
- Fullscreen lightbox keeps swipe navigation and video double-tap seek behavior.

### Toolbar
The toolbar stays slim and sticky. It contains:
- Search input for media name/path within the current folder.
- Media filter: all, image, video.
- Sort selector and ascending/descending toggle.
- Refresh gallery button.
- Refresh tree button.
- Compact counts for media, images, videos, and folders.

The toolbar must not feel like a marketing header. It is an operational control strip.

### Folder Tree Sidebar
The sidebar is a real full tree, not a simulated lazy tree. It uses a new owner-only endpoint:

`GET /api/admin/storage/tree`

The endpoint returns folders only. It does not return media files. It includes enough metadata for UI safety and transparency:
- `root`
- `tree`
- `folder_count`
- `max_depth`
- `max_folders`
- `truncated`

The backend must protect the server from very large storage roots:
- Limit depth.
- Limit folder count.
- Skip hidden folders.
- Reject invalid paths through the existing storage path resolver.
- Return `truncated: true` when limits stop traversal.

The UI must still work if the tree is truncated. The active folder remains navigable through URL/path state and the gallery list endpoint.

### Gallery Grid
The gallery is a uniform grid of media cards. Each card has:
- Fixed aspect preview.
- Video indicator when relevant.
- File name caption always visible.
- Small secondary metadata for size/date/type.
- Selected state if it matches the current lightbox media.

Progressive rendering remains in scope so large folders do not render every thumbnail at once. The first render count should stay conservative and the load-more behavior should remain explicit.

### Fullscreen Lightbox
The fullscreen viewer remains dark because media inspection benefits from contrast. It keeps:
- Image preview.
- Video preview with native controls.
- Previous/next navigation.
- Escape to close.
- Touch swipe previous/next.
- Video double-tap/double-click seek.
- Copy exact media link.

It should not add a heavy detail panel. Details stay in a thin top or bottom strip.

## Data Flow
On page load:
1. Fetch `/api/me` and `/api/admin/storage/list?path=...` for the current folder.
2. Fetch `/api/admin/storage/tree` for the sidebar.
3. If owner access fails, show the existing forbidden state.

On folder selection:
1. Update the `path` search parameter.
2. Reload the current folder list.
3. Keep the tree open around the selected folder.
4. Clear lightbox selection if selected media is no longer in the folder result.

On gallery refresh:
1. Reload only the current folder list.

On tree refresh:
1. Reload only the folder tree.

## Error Handling
- Storage list 401 redirects to login as before.
- Storage list 403 shows owner-only forbidden state.
- Storage list 404 shows a missing folder state and keeps the tree available if loaded.
- Storage tree failures show a compact sidebar error with retry. They do not block the gallery.
- Truncated tree shows a small sidebar note so the owner knows the tree is partial.

## Testing
Backend:
- Add focused tests for storage tree helper behavior: hidden folder skipping, depth limit, folder count limit, and path safety.
- Keep existing storage media tests passing.

Frontend:
- Add helper tests for tree flattening/open-state behavior if helper extraction is needed.
- Build the client to catch JSX/import regressions.

Manual/browser:
- Verify `/admin/storage` visually on desktop and mobile.
- Verify folder selection updates URL and gallery.
- Verify search/filter/sort still work.
- Verify image and video fullscreen preview still work.

## Risks
- A full tree scan can be expensive on very large roots, so backend limits and partial results are required.
- A light theme can reduce media contrast, so cards need clean borders and the lightbox remains dark.
- Rebuilding the UI from zero can accidentally drop existing behaviors; implementation must preserve the current media URL and preview contracts.

## Success Criteria
- The page feels like a new Light Museum gallery UI, not the previous dark admin storage page.
- Owners can switch folders quickly from a real tree sidebar.
- Existing media browsing, filtering, sorting, preview, and fullscreen behaviors continue working.
- The backend tree endpoint is owner-only and guarded against oversized traversal.
- Client build and relevant server tests pass.
