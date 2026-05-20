# HOME Premium Storefront Design

## Context

The current HOME page is a React/Vite page at `client/src/pages/Home.jsx`. It already loads categories, UI settings, featured products, showcase products, bundles, option stock, trust items, and FAQ items through existing public APIs. The page has a dark cyber/cyan visual identity with glass panels, animated cards, product cards, and configurable homepage content.

The repo currently has many unrelated local changes. This work must stay scoped to HOME-related UI files and avoid reverting or touching unrelated files.

## Goal

Improve the HOME page into a premium storefront that feels more polished, trustworthy, and purchase-focused while preserving the VxperS dark/cyan brand identity. The preferred direction is "Balanced Premium": visible improvement with low behavioral risk and no new API requirements.

## Non-Goals

- Do not add or change backend APIs.
- Do not change product, bundle, category, topup, auth, or admin data models.
- Do not redesign the whole app shell or navbar unless a tiny HOME-specific layout adjustment requires it.
- Do not introduce a new design library.
- Do not touch unrelated dirty worktree changes.

## Proposed UX

### Hero

The hero should become the strongest first-viewport signal. It should communicate that this is VxperS Store, show the main value proposition, and give clear next actions.

Changes:

- Keep the configurable title, subtitle, description, button text, and button link.
- Rework hero layout into a cleaner premium storefront composition with stronger text hierarchy and less decorative noise.
- Keep primary CTA to the configured hero link.
- Keep secondary CTA based on auth state: register for guests, topup for signed-in users.
- Keep the live/store-ready status pill, but make it visually calmer and aligned with the premium style.
- Keep small stats, but make them more useful and less visually heavy.

### Featured Products

The featured product panel should feel like a curated shelf, not just a dense mini-grid.

Changes:

- Keep using `featured_product_ids` and current stock/price/promo logic.
- Preserve `ProductCard` navigation to product detail pages.
- Improve the featured panel heading and frame.
- Make empty featured state clearer for admins without making customers feel the page is broken.
- Keep lazy image behavior.

### Showcase

The showcase scroller should remain optional and configurable.

Changes:

- Keep `showcase_enabled`, `showcase_title`, `showcase_scroll_interval`, and `showcase_product_ids`.
- Improve section header hierarchy and "view all" link treatment.
- Keep auto-scroll with pause on hover/touch.
- Ensure horizontal product cards feel deliberate on desktop and usable on mobile.

### Bundles

Bundles should read as special offers without overwhelming the product flow.

Changes:

- Keep existing visible bundle filtering based on active state and dates.
- Keep bundle links, image support, item count, price, and countdown.
- Polish bundle cards so they feel premium and promotional but not noisy.

### Categories

Categories should become an easy browsing entry point.

Changes:

- Keep existing category data and links.
- Improve category cards with cleaner image framing, stronger labels, and stable dimensions.
- Keep the first eight categories on HOME and the "view all" link.
- Improve empty/loading appearance if no categories are available.

### Trust And FAQ

Trust and FAQ should support purchase confidence without competing with products.

Changes:

- Keep configurable trust and FAQ data with current defaults as fallback.
- Make trust cards tighter and more scannable.
- Keep FAQ accordion behavior.
- Improve section spacing so the bottom of HOME feels intentional.

## Responsive Behavior

Mobile must prioritize buying flow:

- Hero text and CTAs appear before the featured product panel.
- CTA buttons remain full-width or comfortably tappable.
- Hero should avoid oversized typography that pushes products too far down.
- Product/category cards must keep stable dimensions and avoid text overflow.
- Decorative effects should be reduced where they hurt readability or performance.

Desktop should feel like a premium storefront:

- Hero and featured products sit side-by-side.
- Product and category sections use clean grids and horizontal scrolling only where useful.
- Section spacing should create a clear rhythm from hero to products to categories to support content.

## Technical Design

Primary implementation target:

- `client/src/pages/Home.jsx`

Possible supporting target:

- `client/src/index.css` for small reusable HOME polish classes or motion/accessibility adjustments.

Keep existing component boundaries where practical:

- `ProductCard`
- `ShowcaseScroller`
- `HomeSkeleton`
- `CountdownPill`

Refactor only if it directly improves readability in `Home.jsx`, for example extracting small presentational helpers for section headers, stats, or empty states.

Data flow remains unchanged:

1. Load categories, UI settings, and bundles.
2. Resolve configured featured/showcase product IDs through `/api/products/by-ids`.
3. Load option stock for products that have options.
4. Render visible bundles based on date and active state.
5. Render configured or fallback trust/FAQ content.

## Error And Empty States

The current data loading flow catches several optional API failures and falls back to empty arrays. The redesign should preserve that resilience.

Expected states:

- Loading: show premium skeletons that match final card dimensions.
- No featured products: show a calm message that the featured shelf has not been configured.
- No showcase products: hide showcase section.
- No bundles: hide bundle section.
- No categories: show an empty category message instead of an empty grid.
- Missing images: preserve icon placeholder behavior.

## Testing And Verification

Verification should include:

- `npm run build` in `client`.
- Browser verification of HOME at desktop and mobile widths.
- Check signed-out hero CTA state.
- If easy to test locally, check signed-in/topup CTA state by using existing auth behavior.
- Confirm product/category/bundle links still point to the same routes.
- Confirm no text overflow or incoherent overlap on mobile.

## Risks

- Thai fallback strings in `Home.jsx` appear mojibake in the current file view. Avoid broad text rewrites unless the source encoding is understood.
- The page already has many motion/glass utilities. Adding more effects can make the design noisy, so the premium direction should simplify as much as it adds.
- The worktree is dirty with unrelated changes, so implementation must avoid broad formatting or cleanup.
