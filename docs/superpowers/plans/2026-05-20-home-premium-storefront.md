# HOME Premium Storefront Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the HOME page into the approved Balanced Premium storefront while keeping existing data flow and routes unchanged.

**Architecture:** Keep the work inside `client/src/pages/Home.jsx` with a small supporting CSS layer in `client/src/index.css`. Preserve existing fetch logic and core components, then improve presentation through focused helper components and HOME-specific class names.

**Tech Stack:** React 19, React Router, Vite, Tailwind CSS utilities, existing app CSS.

---

## File Structure

- Modify `client/src/pages/Home.jsx`: add small presentational helpers, polish `ProductCard`, improve hero, featured, showcase, bundle, category, trust, FAQ, loading, and empty states.
- Modify `client/src/index.css`: add HOME-specific premium utility classes for background glow, section headers, cards, and mobile spacing.
- Keep `docs/superpowers/specs/2026-05-20-home-premium-storefront-design.md` unchanged as the source spec.

## Task 1: HOME Helper Components And Product Cards

**Files:**
- Modify: `client/src/pages/Home.jsx`

- [ ] **Step 1: Add helper components above `ProductCard`**

Add `SectionHeader`, `EmptyState`, `MetricTile`, and `IconPlaceholder` near the existing small components. These helpers must be purely presentational and accept only props.

Expected code shape:

```jsx
function SectionHeader({ eyebrow, title, description, actionTo, actionLabel }) {
  return (
    <div className="home-section-header">
      <div className="min-w-0">
        {eyebrow ? <div className="home-eyebrow">{eyebrow}</div> : null}
        <h2 className="font-display text-2xl font-black text-white">{title}</h2>
        {description ? <div className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-white/45">{description}</div> : null}
      </div>
      {actionTo && actionLabel ? (
        <Link to={actionTo} className="home-section-link">
          {actionLabel}
        </Link>
      ) : null}
    </div>
  )
}

function EmptyState({ title, description }) {
  return (
    <div className="home-empty-state">
      <div className="mx-auto grid h-11 w-11 place-items-center rounded-2xl border border-cyan-300/15 bg-cyan-500/10">
        <IconPlaceholder className="h-5 w-5 text-cyan-200/70" />
      </div>
      <div className="mt-3 text-sm font-black text-white/85">{title}</div>
      {description ? <div className="mt-1 text-xs leading-5 text-white/45">{description}</div> : null}
    </div>
  )
}
```

- [ ] **Step 2: Update `ProductCard` styling only**

Keep all stock, price, promo, image, countdown, and link behavior unchanged. Change class names to make cards cleaner:

- Replace the outer card classes with `home-product-card group motion-card motion-hover motion-soft-glow block overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] transition duration-200 hover:border-cyan-300/25 hover:bg-white/[0.055]`.
- Keep `compact ? '' : 'p-3'`.
- Make image frame use `home-product-image`.
- Keep promo, stock, and countdown labels unchanged.

- [ ] **Step 3: Run a syntax check through build**

Run:

```powershell
Set-Location client
npm run build
```

Expected: build succeeds. If it fails on JSX syntax, fix only the introduced syntax issue.

## Task 2: Premium Hero And Featured Shelf

**Files:**
- Modify: `client/src/pages/Home.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Replace the hero section markup**

In `Home.jsx`, replace the top `<section>` with a premium structure that keeps the same data variables:

- `heroTitle`
- `heroSubtitle`
- `heroDesc`
- `heroBtnText`
- `heroBtnLink`
- `hasToken`
- `categories.length`
- `featuredProducts.length + showcaseProducts.length`

The hero must render:

- status pill
- title
- subtitle
- description
- primary and secondary CTA
- three metric tiles
- featured shelf on desktop/right and below text on mobile

- [ ] **Step 2: Improve featured shelf states**

Keep the current loading and featured-products branches, but wrap them in a shelf with:

- heading "Featured"
- short supporting label
- four-card grid when products exist
- `EmptyState` when no featured products exist

- [ ] **Step 3: Add CSS for hero**

In `client/src/index.css`, add these classes near existing HOME/motion styles:

```css
.home-hero {
  background:
    radial-gradient(80% 90% at 14% 0%, rgba(34, 211, 238, 0.16), transparent 58%),
    radial-gradient(72% 80% at 100% 0%, rgba(255, 255, 255, 0.08), transparent 62%),
    linear-gradient(135deg, rgba(255,255,255,0.075), rgba(255,255,255,0.032));
}

.home-premium-panel {
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.06), 0 26px 80px rgba(0,0,0,0.32);
}

.home-metric-tile {
  background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0.028));
}
```

- [ ] **Step 4: Build**

Run:

```powershell
Set-Location client
npm run build
```

Expected: build succeeds.

## Task 3: Storefront Sections

**Files:**
- Modify: `client/src/pages/Home.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Replace section headers with `SectionHeader`**

Use `SectionHeader` for showcase, bundles, categories, and FAQ. Preserve existing links and visibility logic.

- [ ] **Step 2: Polish category empty/loading state**

Keep `HomeSkeleton` for loading. When not loading and `categories.length === 0`, render:

```jsx
<EmptyState title="No categories yet" description="Categories configured in admin will appear here." />
```

When categories exist, keep the same first eight category cards and links.

- [ ] **Step 3: Polish bundle cards**

Keep existing fields and routes. Update card classes to use `home-offer-card` and make image frame, badge row, title, price, and countdown spacing cleaner. Do not change bundle filtering.

- [ ] **Step 4: Polish trust and FAQ**

Keep trust data and FAQ accordion. Reduce decorative grid opacity and use tighter card spacing so these support sections do not overpower products.

- [ ] **Step 5: Add CSS for sections**

Add:

```css
.home-section-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.home-eyebrow {
  margin-bottom: 0.35rem;
  font-size: 0.66rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(103, 232, 249, 0.62);
}

.home-section-link {
  flex: 0 0 auto;
  font-size: 0.75rem;
  font-weight: 850;
  color: rgba(165, 243, 252, 0.82);
}

.home-empty-state {
  min-height: 14rem;
  display: grid;
  place-items: center;
  border: 1px dashed rgba(255,255,255,0.1);
  border-radius: 1.25rem;
  background: rgba(255,255,255,0.026);
  padding: 2rem;
  text-align: center;
}
```

- [ ] **Step 6: Build**

Run:

```powershell
Set-Location client
npm run build
```

Expected: build succeeds.

## Task 4: Verification And Cleanup

**Files:**
- Verify: `client/src/pages/Home.jsx`
- Verify: `client/src/index.css`

- [ ] **Step 1: Run final build**

Run:

```powershell
Set-Location client
npm run build
```

Expected: build succeeds.

- [ ] **Step 2: Start or reuse local dev servers**

If server is already listening on `http://localhost:3001`, leave it running. Start the client if needed:

```powershell
Set-Location client
npm run dev -- --host 127.0.0.1
```

Expected: Vite serves the app, usually at `http://127.0.0.1:5173`.

- [ ] **Step 3: Browser verify desktop and mobile**

Open HOME in the browser at desktop and mobile widths. Verify:

- hero has no overlapping text
- CTAs are tappable
- featured shelf renders loading, product, or empty state cleanly
- showcase, bundles, categories, trust, and FAQ keep existing routes and data behavior
- no horizontal overflow on mobile

- [ ] **Step 4: Review git diff**

Run:

```powershell
git diff -- client/src/pages/Home.jsx client/src/index.css
git status --short client/src/pages/Home.jsx client/src/index.css docs/superpowers/plans/2026-05-20-home-premium-storefront.md
```

Expected: only HOME implementation files and this plan are changed for this task.
