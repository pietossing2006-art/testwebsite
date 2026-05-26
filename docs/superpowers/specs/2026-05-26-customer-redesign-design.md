# Customer Redesign From Zero Design

## Context

The project is a React/Vite storefront with an Express-backed API. Customer-facing routes live under `client/src/pages`, with the shared shell in `client/src/components/Layout.jsx`, `client/src/components/Navbar.jsx`, and global styling in `client/src/index.css`.

The user wants a major UX/UI reset across the customer project. The desired direction is inspired by `https://getkeys.gg/`: dark launch-commerce energy, clear product focus, strong first viewport, and a more modern game-store feel. The redesign must not copy that site's brand, copy, assets, or exact layout. The local color preference is a deep navy around `rgb(9, 22, 55)` / `#091637`, with a plain black background and solid surfaces instead of transparent glass components.

The approved approach is **Design System First, Then Rebuild Pages**. The visual mood should be **balanced**: new and noticeably more premium, but not overly aggressive, noisy, or hard to use.

There are existing local modifications in the working tree. Implementation must avoid reverting unrelated changes and must stay aware of the existing modified `start-vxpers.exe`.

## Goals

- Redesign the customer-facing experience from the product/UX level, not as a small skin over the old layout.
- Build a reusable storefront design system first, then migrate pages onto it.
- Keep the dark black/navy brand direction with solid panels, restrained cyan highlights, and clear purchase actions.
- Improve the buying path from home to category to product/bundle detail to topup/order history.
- Make announcements feel integrated with the shell rather than floating glass overlays.
- Preserve existing public API contracts, auth behavior, route URLs, and purchase/topup logic.
- Keep the design responsive, readable, and comfortable on mobile.

## Non-Goals

- Do not redesign the admin experience in this project pass.
- Do not change backend database schemas, payment rules, fulfillment rules, inventory logic, or auth semantics.
- Do not introduce a large new UI framework.
- Do not copy getkeys.gg assets, text, brand marks, or exact component structure.
- Do not perform broad cleanup or formatting outside the customer redesign scope.

## Scope

Included customer routes:

- `/`
- `/categories`
- `/category/:slug`
- `/product/:id`
- `/bundle/:id`
- `/topup/:method`
- `/profile`
- `/history/topups`
- `/history/purchases`
- `/history/orders/:id`
- `/inbox`
- `/support`
- `/discord`
- `/tos`
- `/login`
- `/register`

Shared customer shell included:

- `Layout`
- `Navbar`
- Announcement tray/cards
- Footer or bottom support/navigation areas if present in the shell
- Global design tokens and shared customer UI classes/components

Excluded:

- `/admin-v3`
- `/admin/storage`
- Admin modules under `client/src/pages/AdminV3`
- Storage manager UI under `client/src/pages/admin-storage`

## Visual Direction

The new customer UI should feel like a premium game-key and digital-service storefront. It should be darker, cleaner, and more direct than the current glass-heavy style.

Core visual decisions:

- App background: plain near-black, approximately `#02040a` to `#030713`.
- Primary surface: `#091637`.
- Raised surface: slightly brighter navy such as `#0d1c45` or `#10245a`.
- Borders: solid blue-navy lines, not translucent glass outlines.
- Accent: cyan/blue for primary actions and interactive focus states.
- Success/warning/error: restrained operational colors with enough contrast against dark surfaces.
- Typography: compact, confident hierarchy. Hero text can be large, but inner panels must use practical dashboard/storefront scale.
- Component shape: mostly 8px radius or less unless existing app conventions strongly require otherwise.
- Motion: limited to meaningful hover, loading, and promotional emphasis. Avoid background particles, heavy glow fields, and decorative noise.

The design can borrow the launch-store composition idea from getkeys.gg: bold hero, product/status emphasis, clear CTA, strong nav. It should adapt that idea into this project's store/catalog/account flows rather than recreating the reference site.

## Information Architecture

The customer experience should be organized around four jobs:

1. Discover products and bundles.
2. Understand item availability, price, and purchase requirements.
3. Top up or complete the buying flow.
4. Track orders, messages, and support.

The primary navigation should reflect those jobs:

- Store or Home
- Categories
- Topup
- Orders or History
- Support
- Account/Profile

Admin links should remain available only where the current auth/role behavior already exposes them, but admin UI itself is not redesigned.

## Shared Design System

Create or consolidate customer-facing primitives so pages do not each invent their own panel/card/button language.

Recommended primitives:

- `StoreShell`: customer shell layout for page gutters, max widths, background, and announcement placement.
- `StoreHeader` or updated `Navbar`: solid black/navy sticky nav with clear active routes, account actions, balance, and compact mobile behavior.
- `AnnouncementRail`: a solid navy announcement area that supports current rich text/icon/CTA behavior without floating glass treatment.
- `PageHero`: reusable page intro for catalog, category, product, account, support, and legal pages.
- `SectionHeader`: small consistent title/subtitle/action row.
- `Surface`: base panel component or class for solid navy containers.
- `ProductCard`: product listing card with image, category/status, price, stock state, and CTA.
- `BundleCard`: promotional bundle card with countdown/price/item count.
- `StatusBadge`: consistent badge for available, low stock, sold out, pending, completed, canceled, unread, and support states.
- `ActionButton`: primary, secondary, subtle, danger, and icon variants.
- `FormSurface`: consistent form panels, input rows, help/error text, and submit actions.
- `EmptyState`: icon/title/body/action layout for missing data.
- `LoadingSkeleton`: page and card skeletons with stable dimensions.

These can be implemented as React components if the existing code benefits from extraction, or as well-scoped CSS classes where component extraction would add churn. The implementation plan should choose the smallest reusable boundary that keeps the page files readable.

## Shell And Announcement

The shell should become the anchor of the new design.

Navbar requirements:

- Solid black/navy background.
- No glass blur dependency.
- Clear logo/brand area.
- Primary navigation is obvious on desktop.
- Mobile navigation is compact and easy to tap.
- Account/balance/topup actions remain visible without crowding the nav.
- Active route styling uses accent line, filled pill, or text state consistently.

Announcement requirements:

- Use solid `#091637`-based cards by default.
- Keep existing announcement data, icon, rich text, CTA, dismiss behavior, and priority ordering.
- Place announcements in normal page flow near the top of the shell on mobile to avoid covering content.
- Desktop can use a compact rail/tray near the top, but it must feel integrated into the layout.
- Avoid transparent glass and heavy glow.
- Long announcement text must wrap cleanly.

## Home Page

The home page should become the launch storefront.

Hero:

- Strong first viewport with brand/store signal, short value proposition, and primary CTA.
- Product or offer preview area on the right for desktop.
- Mobile should show headline, CTA, and first product path quickly without excessive vertical decoration.
- Use existing configurable home settings where available.

Product discovery:

- Feature a curated shelf using existing featured product configuration.
- Show categories as browsing entry points.
- Show bundles as special offers when active.
- Keep showcase products optional and data-driven.

Trust/support:

- Keep trust items and FAQ data if already configured.
- Present them as compact confidence signals, not large marketing blocks.

## Categories And Category Detail

`/categories` should become a catalog hub:

- Search/filter affordance if existing data makes it straightforward.
- Category cards with stable image framing, product counts if available, and clear route targets.
- Empty/loading states that match the new design system.

`/category/:slug` should become a focused product shelf:

- Hero identifies the category.
- Grid/list of products uses the shared `ProductCard`.
- Sorting/filtering should only be added if current data already supports it without backend changes.
- No products state should provide a route back to all categories or support.

## Product Detail

`/product/:id` should be purchase-focused.

Required layout:

- Product media/gallery or image area with stable dimensions.
- Title, category, stock state, price, and promotions in a clear buy panel.
- Option selection if the product has options.
- Quantity or purchase controls if currently supported.
- Purchase CTA state remains aligned with current auth, stock, and balance rules.
- Details, instructions, and support notes appear below the main purchase area.

Error/loading states:

- Missing product: show a proper not-found surface with a path back to categories.
- Sold out or unavailable: keep CTA disabled and explain why.
- API failures: show retry/support-oriented messaging without breaking the shell.

## Bundle Detail

`/bundle/:id` should feel like a special offer detail page, separate from standard product detail but using the same system.

Required layout:

- Bundle hero with image, price, discount/value framing, countdown if active, and purchase CTA.
- Included items section using compact rows/cards.
- Availability and active-date state must remain accurate.
- Expired/inactive bundles must be visually clear and prevent invalid purchase actions.

## Topup Flow

`/topup/:method` should become a calm payment workspace.

Requirements:

- Clear method switcher for supported methods.
- Balance and payment instructions are easy to scan.
- Form inputs use `FormSurface` styling.
- Submission/loading/success/error states are explicit.
- Mobile layout must keep the form and instructions readable without side-by-side compression.
- Do not alter the current payment rules or endpoints.

## Account, History, Inbox, And Support

Account pages should feel like a compact customer dashboard, not separate one-off pages.

`/profile`:

- Account summary, balance, key actions, and recent activity if current data supports it.
- Clear links to topup, purchase history, topup history, inbox, and support.

`/history/topups` and `/history/purchases`:

- Use shared table/list styles.
- Desktop can use table-like rows.
- Mobile should use stacked transaction cards.
- Status badges must be consistent.
- Empty states include a useful next action.

`/history/orders/:id`:

- Order timeline/status panel.
- Purchased items and fulfillment details remain readable.
- Support/contact action is visible for problematic orders.

`/inbox`:

- Message list and message details use solid panels.
- Unread/read states are clear.
- Empty inbox should feel intentional.

`/support`:

- Support entry points, ticket/contact form if currently present, and guidance should use the new form/panel system.
- Avoid long marketing text. Keep actions clear.

## Auth, Discord, And Terms

`/login` and `/register`:

- Use a centered but not oversized auth layout.
- Solid form surface with clear input/error states.
- Clear switch links between login/register.
- Preserve current auth endpoints and redirects.

`/discord`:

- Treat as a community/action page with one clear primary CTA.
- Keep content compact and aligned with the storefront style.

`/tos`:

- Legal content should prioritize readability.
- Use a narrow text column, solid section surfaces where needed, and sticky/quick navigation only if simple.

## Data And Behavior Preservation

The redesign must preserve:

- Existing route paths.
- Existing public API calls.
- Existing auth/session handling.
- Existing product, bundle, category, announcement, topup, history, inbox, and support behavior.
- Current fallback behavior for optional content.
- Current lazy-loaded route architecture unless an implementation task identifies a clear reason to change it.

Any data transformation introduced for UI should live close to the page/component that needs it, or in a small helper when shared by multiple pages.

## Error, Empty, And Loading States

Every redesigned page should have matching states:

- Loading skeletons with stable dimensions.
- Empty state with a short explanation and one useful action.
- Error state with retry or navigation path.
- Disabled action state with visible reason when applicable.

Do not leave pages blank during lazy loading or data loading when a shell-level skeleton can be shown.

## Responsive Requirements

Mobile:

- No text overlap.
- No fixed announcement overlay covering content.
- Tap targets remain comfortable.
- Product cards keep stable dimensions.
- Primary CTA appears before secondary content.
- Tables collapse into readable cards.

Desktop:

- Use wider launch-style layouts on home/product/bundle pages.
- Keep dense account/history pages scannable.
- Avoid decorative cards inside decorative cards.
- Keep maximum content width intentional, with full-width shell bands only where they help hierarchy.

## Accessibility And Usability

- Maintain visible focus states for links, buttons, and form controls.
- Preserve semantic buttons/links for navigation and actions.
- Use sufficient color contrast against black and `#091637`.
- Avoid relying on color alone for status.
- Keep animation respectful of `prefers-reduced-motion` if global motion is added or retained.

## Implementation Strategy

The implementation plan should be phased so the project remains buildable after each phase:

1. Establish customer design tokens and shared primitives.
2. Rebuild shell, navbar, announcement, and global page scaffolding.
3. Rebuild home and catalog routes.
4. Rebuild product and bundle detail routes.
5. Rebuild topup flow.
6. Rebuild account, history, order, inbox, and support routes.
7. Rebuild auth, Discord, and terms routes.
8. Run full build and browser verification across key routes and mobile/desktop sizes.

The plan should prefer smaller, focused commits and avoid mixing admin work into customer page commits.

## Testing And Verification

Required verification:

- `npm run build` in the frontend project context used by this repo.
- Browser verification of at least:
  - `/`
  - `/categories`
  - one category page if data exists locally
  - one product detail page if data exists locally
  - one bundle detail page if data exists locally
  - `/topup/angpao`
  - `/profile` or signed-out redirect behavior
  - `/login`
  - `/register`
- Desktop viewport around 1440px wide.
- Mobile viewport around 390px wide.
- Check announcement behavior on desktop and mobile.
- Check no incoherent text overlap, clipped buttons, or blank route content.

If local data is missing for a dynamic route, verification should use the nearest available fixture/route returned by the app's local API or document the limitation.

## Risks

- A full customer redesign touches many pages, so a design-system-first pass is necessary to avoid inconsistent one-off styling.
- Some existing pages may contain encoded Thai fallback strings. Implementation should avoid broad text rewrites unless encoding is verified.
- Existing local changes must not be reverted.
- Large visual rewrites can hide behavior regressions, so route-by-route verification matters.
- The reference site is useful for direction, but copying it too closely would make the project less distinctive.
