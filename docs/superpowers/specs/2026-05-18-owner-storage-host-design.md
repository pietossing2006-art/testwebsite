# 2026-05-18 Owner Storage Host Performance-First Media Workspace Design

## Goal
Refactor the Owner Storage Host page from a file-manager-style screen into a performance-first media browser and player. The page should feel optimized for browsing thumbnails quickly and viewing images or videos continuously, while reducing unnecessary UI and render work.

## Current Problems
- The page behaves like a file manager even though the primary use case is only viewing images and videos.
- The main page owns data loading, filtering, sorting, list rendering, grid rendering, and fullscreen viewer logic in one large component.
- Filtering, sorting, and rendering happen across a broad set of state changes, which makes the page heavier than needed when there are many media items.
- Folder and path UI take visual priority away from the actual media experience.
- The main viewing flow depends too much on the modal viewer instead of treating media playback and preview as the core experience.

## Product Direction
Treat the page as a media workspace, not a storage management screen.

Primary usage mode:
- Users browse thumbnails quickly.
- Users open media and continue viewing adjacent items.
- Both gallery browsing and focused viewing matter equally.

Secondary usage mode:
- Minimal awareness of current path or folder context when needed.

Not in scope:
- File management actions such as rename, delete, move, or bulk operations.
- Backend pagination redesign.
- Full virtualization rewrite.
- Large visual theme overhaul.

## UX Structure
### 1. Hero Control Bar
Keep only controls that support media browsing:
- Search
- Media type filter: all, image, video
- Sort
- Refresh
- Media counts or compact summary

Reduce or demote:
- Large breadcrumb emphasis
- Copy path prominence
- File-management-style labels and explanatory text

### 2. Main Workspace Layout
Desktop:
- One persistent focus viewer section
- One media browsing section beside or below it, depending on available width
- Viewer must feel like the main stage

Mobile:
- Viewer first
- Media strip or compact grid below
- Navigation actions stay thumb-friendly

### 3. Folder Context
Folder navigation may remain available, but visually compressed.
It should not appear as a primary content section.
Possible presentation:
- Compact breadcrumb chip row
- Small current-path indicator
- No large folder management block

### 4. Core Interaction Model
- Selecting a media thumbnail updates the focus viewer immediately.
- Next and previous navigation remain first-class interactions.
- Fullscreen remains available as an extension of the main viewer, not the only serious viewing mode.
- Keyboard navigation and touch swipe navigation remain supported.

## Performance Strategy
### 1. Component Decomposition
Split the current page into smaller focused units so unrelated state changes do not rerender the whole page.
Likely units:
- Control bar
- Compact path context
- Focus viewer
- Media list or grid
- Media card
- Optional fullscreen layer

### 2. Selected Media as Primary State
Promote selected media to the core interaction state.
The page should render around the selected item rather than treating the viewer as a secondary overlay-only feature.

### 3. Search and Filtering Optimization
- Use debounced or deferred search input.
- Memoize derived media collections.
- Reduce repeated sort and filter work.
- Ensure individual cards do not rerender on unrelated viewer state changes.

### 4. Progressive Rendering
- Lower initial thumbnail render count if needed.
- Keep lazy image loading.
- Preserve or improve incremental reveal for additional items.
- Favor faster first paint over showing a large number of cards immediately.

### 5. Visual Simplification for Speed
- Reduce decorative layers that add little value.
- Keep cards lighter and more compact.
- Keep metadata concise: title, type, and minimal secondary details.
- Make the viewer more dominant while reducing surrounding UI noise.

## Visual Direction
This round should be a light facelift, not a full redesign.

Desired feel:
- Cleaner
- More focused
- More obviously built for media consumption
- Less like an admin file explorer

Visual priorities:
- Strong viewer hierarchy
- Easy-to-scan media rail or grid
- Sticky or easy-to-reach controls
- Reduced chrome around nonessential information

## Implementation Plan for This Round
1. Refactor the page into smaller presentational and stateful pieces.
2. Rework page state around selected media plus an optional fullscreen state.
3. Simplify the top section into compact media-oriented controls.
4. Reduce folder UI prominence.
5. Optimize filtering, sorting, and rendering behavior.
6. Tune initial item rendering and load-more behavior.
7. Preserve image and video preview support, including Plyr-based video playback where applicable.

## Testing and Verification
### Manual checks
- Initial page load feels faster.
- Scrolling through media feels smoother.
- Searching does not noticeably stutter.
- Selecting thumbnails updates the focus viewer quickly.
- Next and previous navigation remains smooth.
- Fullscreen still works for both image and video.
- Mobile layout keeps viewing and browsing practical.

### Build verification
- Run the client build to catch import or syntax regressions.

### Browser verification
- If the local dev server is available, open the page and verify the real layout and interaction flow.

## Risks and Tradeoffs
- Moving from modal-first viewing to inline focus viewing changes the interaction model, so care is needed to preserve the ability to browse rapidly.
- Smaller components improve maintainability, but the data flow must stay simple enough to avoid replacing one complexity with another.
- Without backend pagination or virtualization, very large libraries may still have limits, but this round should noticeably improve typical usage.

## Success Criteria
- The page clearly feels like a media browser and player instead of a storage management page.
- The viewer becomes the primary experience.
- Browsing thumbnails and switching media is smoother than before.
- The code is easier to maintain because the page is broken into smaller responsibilities.
- The facelift supports speed and clarity without becoming a large redesign project.
