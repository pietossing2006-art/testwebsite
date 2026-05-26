# Customer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the customer-facing storefront into a solid black/navy launch-commerce UI using shared customer design primitives while preserving all existing routes, API calls, auth behavior, and purchase/topup logic.

**Architecture:** Keep the current React/Vite route structure and lazy-loaded pages. Introduce a small storefront component layer under `client/src/components/storefront/`, move repeated display logic into pure helpers, then migrate the shell and customer pages onto those primitives in phased commits. Admin routes and backend code stay out of scope.

**Tech Stack:** React 19, React Router 7, Vite 7, Tailwind CSS 4 utility classes in JSX, global CSS in `client/src/index.css`, Node's built-in `node:test` for pure helper tests, Codex in-app Browser for visual verification.

---

## Reference Documents

- Design spec: `docs/superpowers/specs/2026-05-26-customer-redesign-design.md`
- Current app routes: `client/src/App.jsx`
- Current shared shell: `client/src/components/Layout.jsx`
- Current navigation: `client/src/components/Navbar.jsx`
- Current global styles: `client/src/index.css`

## Current Constraints

- The working tree already contains local UI changes in `client/src/components/Layout.jsx`, `client/src/components/Navbar.jsx`, `client/src/index.css`, and `client/src/pages/Home.jsx`.
- `start-vxpers.exe` is modified and must not be staged, committed, deleted, or reverted.
- Use `git status --short` before every commit and stage only the files named in that task.
- Do not rewrite Thai fallback strings unless the file already shows them correctly in the editor. Several existing strings appear mojibake in terminal output.
- Do not change `/admin-v3`, `/admin/storage`, `client/src/pages/AdminV3/**`, or `client/src/pages/admin-storage/**` except when running their existing tests.

## File Structure

Create:

- `client/src/components/storefront/storefrontUtils.js`  
  Pure helpers for class joining, point formatting, status tones, purchase-status labels, and stock-state labels.

- `client/src/components/storefront/storefrontUtils.test.mjs`  
  Node tests for helpers that page components depend on.

- `client/src/components/storefront/Storefront.jsx`  
  Shared customer UI primitives: `Surface`, `ActionButton`, `PageHero`, `SectionHeader`, `StatusBadge`, `EmptyState`, `LoadingSkeleton`, `FormSurface`, `MetricStrip`, `ProductTile`, and `BundleTile`.

Modify:

- `client/src/index.css`  
  Replace the customer-facing design tokens and shared class styles with solid black/navy surfaces, responsive page rhythm, announcement styles, form/table/list styles, and reduced-motion safeguards.

- `client/src/components/Layout.jsx`  
  Keep API/SEO/GSAP behavior, but rebuild customer shell, announcement tray, and footer around solid storefront layout classes.

- `client/src/components/Navbar.jsx`  
  Keep auth, unread-message polling, branding settings, mobile menu, and role-aware admin links. Rebuild visual hierarchy and route actions using the storefront primitives/classes.

- `client/src/pages/Home.jsx`  
  Keep data loading and product/bundle/showcase logic. Rebuild into launch storefront sections using shared components.

- `client/src/pages/Categories.jsx` and `client/src/pages/Category.jsx`  
  Keep current fetch/filter/sort behavior. Rebuild catalog hub and category shelf using shared cards and page scaffolding.

- `client/src/pages/ProductDetail.jsx` and `client/src/pages/BundleDetail.jsx`  
  Keep quote, option, coupon, auth, buy, and modal behavior. Rebuild detail pages into media + buy-panel layouts.

- `client/src/pages/Topup.jsx`  
  Keep angpao/coupon/promptpay behavior and slip verification. Rebuild as a payment workspace.

- `client/src/pages/Profile.jsx`, `client/src/pages/TopupHistory.jsx`, `client/src/pages/PurchaseHistory.jsx`, `client/src/pages/OrderTracking.jsx`, `client/src/pages/Inbox.jsx`, `client/src/pages/Support.jsx`  
  Keep API calls and auth redirects. Rebuild account dashboard, responsive history rows, inbox, order tracking, and support workspace.

- `client/src/pages/Login.jsx`, `client/src/pages/Register.jsx`, `client/src/pages/DiscordInvite.jsx`, `client/src/pages/Tos.jsx`  
  Keep endpoint behavior and redirects. Rebuild auth/community/legal layouts.

## Commit Strategy

Commit after each task that passes its listed verification. Use the exact stage list in each task and never stage `start-vxpers.exe`.

---

### Task 1: Storefront Helpers And Unit Tests

**Files:**
- Create: `client/src/components/storefront/storefrontUtils.js`
- Create: `client/src/components/storefront/storefrontUtils.test.mjs`

- [ ] **Step 1: Create helper tests first**

Create `client/src/components/storefront/storefrontUtils.test.mjs` with these tests:

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  cx,
  formatPoints,
  getPurchaseStatusMeta,
  getStockMeta,
  getToneClass,
} from './storefrontUtils.js'

test('cx joins strings and conditional class maps', () => {
  assert.equal(cx('a', null, false, 'b', { c: true, d: false }), 'a b c')
})

test('formatPoints formats numeric balances with Thai point suffix', () => {
  assert.equal(formatPoints(0), '0 พ้อย')
  assert.equal(formatPoints(1200), '1,200 พ้อย')
  assert.equal(formatPoints('199'), '199 พ้อย')
})

test('getToneClass returns known solid storefront tones', () => {
  assert.match(getToneClass('cyan'), /border-cyan/)
  assert.match(getToneClass('danger'), /rose/)
  assert.match(getToneClass('unknown'), /slate/)
})

test('getPurchaseStatusMeta normalizes common order states', () => {
  assert.deepEqual(getPurchaseStatusMeta('completed'), { label: 'สำเร็จ', tone: 'success' })
  assert.deepEqual(getPurchaseStatusMeta('pending'), { label: 'รอดำเนินการ', tone: 'warning' })
  assert.deepEqual(getPurchaseStatusMeta('cancelled'), { label: 'ยกเลิก', tone: 'danger' })
})

test('getStockMeta explains available and sold out states', () => {
  assert.deepEqual(getStockMeta({ out: true }), { label: 'หมดสต็อก', tone: 'danger' })
  assert.deepEqual(getStockMeta({ out: false, remaining: 4 }), { label: 'เหลือ 4', tone: 'warning' })
  assert.deepEqual(getStockMeta({ out: false, unlimited: true }), { label: 'พร้อมส่ง', tone: 'success' })
})
```

- [ ] **Step 2: Run tests and confirm they fail because the helper file does not exist**

Run:

```powershell
node --test client/src/components/storefront/storefrontUtils.test.mjs
```

Expected: FAIL with an import/module-not-found error for `storefrontUtils.js`.

- [ ] **Step 3: Implement helper functions**

Create `client/src/components/storefront/storefrontUtils.js`:

```js
export function cx(...parts) {
  const out = []
  for (const part of parts) {
    if (!part) continue
    if (typeof part === 'string') {
      out.push(part)
      continue
    }
    if (Array.isArray(part)) {
      const nested = cx(...part)
      if (nested) out.push(nested)
      continue
    }
    if (typeof part === 'object') {
      for (const [key, enabled] of Object.entries(part)) {
        if (enabled) out.push(key)
      }
    }
  }
  return out.join(' ')
}

export function formatPoints(value) {
  const num = Number(value ?? 0)
  const safe = Number.isFinite(num) ? Math.trunc(num) : 0
  return `${safe.toLocaleString('th-TH')} พ้อย`
}

const TONE_CLASS = {
  cyan: 'border-cyan-300/25 bg-cyan-500/12 text-cyan-100',
  blue: 'border-blue-300/25 bg-blue-500/12 text-blue-100',
  success: 'border-emerald-300/25 bg-emerald-500/12 text-emerald-100',
  warning: 'border-amber-300/25 bg-amber-500/12 text-amber-100',
  danger: 'border-rose-300/25 bg-rose-500/12 text-rose-100',
  violet: 'border-violet-300/25 bg-violet-500/12 text-violet-100',
  slate: 'border-slate-300/20 bg-slate-500/12 text-slate-100',
}

export function getToneClass(tone) {
  return TONE_CLASS[tone] || TONE_CLASS.slate
}

export function getPurchaseStatusMeta(status) {
  const key = String(status || '').trim().toLowerCase()
  if (['completed', 'success', 'fulfilled', 'paid'].includes(key)) return { label: 'สำเร็จ', tone: 'success' }
  if (['pending', 'processing', 'queued', 'in_progress'].includes(key)) return { label: 'รอดำเนินการ', tone: 'warning' }
  if (['cancelled', 'canceled', 'failed', 'rejected'].includes(key)) return { label: 'ยกเลิก', tone: 'danger' }
  return { label: key || 'ไม่ทราบสถานะ', tone: 'slate' }
}

export function getStockMeta(stock) {
  const data = stock && typeof stock === 'object' ? stock : {}
  if (data.out) return { label: 'หมดสต็อก', tone: 'danger' }
  if (data.unlimited) return { label: 'พร้อมส่ง', tone: 'success' }
  const remaining = Number(data.remaining)
  if (Number.isFinite(remaining) && remaining > 0 && remaining <= 5) return { label: `เหลือ ${remaining}`, tone: 'warning' }
  if (Number.isFinite(remaining) && remaining > 0) return { label: 'พร้อมส่ง', tone: 'success' }
  return { label: 'พร้อมส่ง', tone: 'success' }
}
```

- [ ] **Step 4: Run helper tests and verify they pass**

Run:

```powershell
node --test client/src/components/storefront/storefrontUtils.test.mjs
```

Expected: PASS with 5 passing tests.

- [ ] **Step 5: Commit helper utilities**

```powershell
git status --short
git add -- client/src/components/storefront/storefrontUtils.js client/src/components/storefront/storefrontUtils.test.mjs
git commit -m "feat: add storefront helper utilities"
```

---

### Task 2: Storefront React Primitives

**Files:**
- Create: `client/src/components/storefront/Storefront.jsx`
- Modify: `client/src/components/storefront/storefrontUtils.js`
- Test: `client/src/components/storefront/storefrontUtils.test.mjs`

- [ ] **Step 1: Extend helper tests for product price and media fallback behavior**

Append these tests to `client/src/components/storefront/storefrontUtils.test.mjs`:

```js
import {
  getDisplayImage,
  getProductPriceMeta,
} from './storefrontUtils.js'

test('getDisplayImage returns a usable image source or empty string', () => {
  assert.equal(getDisplayImage({ image_url: '/uploads/a.png' }), '/uploads/a.png')
  assert.equal(getDisplayImage({ image: 'https://example.com/a.png' }), 'https://example.com/a.png')
  assert.equal(getDisplayImage({}), '')
})

test('getProductPriceMeta supports regular and promo prices', () => {
  assert.deepEqual(getProductPriceMeta({ price: 100 }), {
    label: '100',
    discountedLabel: '100',
    hasPromo: false,
  })
  assert.deepEqual(getProductPriceMeta({ price: 100, promo_discount_percent: 10 }), {
    label: '100',
    discountedLabel: '90',
    hasPromo: true,
  })
})
```

- [ ] **Step 2: Run tests and confirm missing exports fail**

Run:

```powershell
node --test client/src/components/storefront/storefrontUtils.test.mjs
```

Expected: FAIL naming `getDisplayImage` or `getProductPriceMeta` as missing.

- [ ] **Step 3: Add product helper exports**

Append to `client/src/components/storefront/storefrontUtils.js`:

```js
function discountUnitPrice(unitPrice, promoPercent, promoAmount) {
  const price = Number(unitPrice)
  if (!Number.isFinite(price)) return 0
  const percent = Number(promoPercent) > 0 ? Number(promoPercent) : 0
  const amount = Number(promoAmount) > 0 ? Number(promoAmount) : 0
  return Math.max(0, Math.round(price * (1 - percent / 100) - amount))
}

export function getDisplayImage(item) {
  return String(item?.image_url || item?.image || item?.thumbnail_url || '').trim()
}

export function getProductPriceMeta(product) {
  const options = Array.isArray(product?.product_options) ? product.product_options : []
  const optionPrices = options
    .map((option) => Number(option?.price_points))
    .filter((value) => Number.isFinite(value) && value >= 0)
  const prices = optionPrices.length > 0 ? optionPrices : [Number(product?.price ?? 0)]
  const safePrices = prices.filter((value) => Number.isFinite(value) && value >= 0)
  const usable = safePrices.length > 0 ? safePrices : [0]
  const minPrice = Math.min(...usable)
  const maxPrice = Math.max(...usable)
  const label = minPrice === maxPrice ? String(minPrice) : `${minPrice} - ${maxPrice}`
  const promoPercent = Number(product?.promo_discount_percent ?? 0) > 0 ? Number(product.promo_discount_percent) : 0
  const promoAmount = Number(product?.promo_discount_amount_points ?? 0) > 0 ? Number(product.promo_discount_amount_points) : 0
  const hasPromo = Number(product?.promo_discount_points ?? 0) > 0 || promoPercent > 0 || promoAmount > 0
  const discounted = hasPromo ? usable.map((price) => discountUnitPrice(price, promoPercent, promoAmount)) : usable
  const minDiscounted = Math.min(...discounted)
  const maxDiscounted = Math.max(...discounted)
  const discountedLabel = minDiscounted === maxDiscounted ? String(minDiscounted) : `${minDiscounted} - ${maxDiscounted}`
  return { label, discountedLabel, hasPromo }
}
```

- [ ] **Step 4: Create shared React primitives**

Create `client/src/components/storefront/Storefront.jsx` with these component APIs and class names:

```jsx
import { Link } from 'react-router-dom'
import {
  cx,
  formatPoints,
  getDisplayImage,
  getProductPriceMeta,
  getStockMeta,
  getToneClass,
} from './storefrontUtils.js'

export function Surface({ as: Tag = 'section', className = '', children, ...props }) {
  return <Tag className={cx('store-surface', className)} {...props}>{children}</Tag>
}

export function ActionButton({ as: Tag = 'button', to, href, variant = 'primary', className = '', children, ...props }) {
  const cls = cx('store-action', `store-action--${variant}`, className)
  if (to) return <Link to={to} className={cls} {...props}>{children}</Link>
  if (href) return <a href={href} className={cls} target={props.target} rel={props.rel}>{children}</a>
  return <Tag className={cls} {...props}>{children}</Tag>
}

export function StatusBadge({ tone = 'slate', children, className = '' }) {
  return <span className={cx('store-badge', getToneClass(tone), className)}>{children}</span>
}

export function PageHero({ eyebrow, title, description, actions, meta, children, className = '' }) {
  return (
    <section className={cx('store-hero', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="store-eyebrow">{eyebrow}</div> : null}
        <h1 className="store-hero__title">{title}</h1>
        {description ? <p className="store-hero__description">{description}</p> : null}
        {actions ? <div className="store-hero__actions">{actions}</div> : null}
      </div>
      {meta || children ? <div className="store-hero__aside">{meta || children}</div> : null}
    </section>
  )
}

export function SectionHeader({ eyebrow, title, description, action, className = '' }) {
  return (
    <div className={cx('store-section-header', className)}>
      <div className="min-w-0">
        {eyebrow ? <div className="store-eyebrow">{eyebrow}</div> : null}
        <h2 className="store-section-header__title">{title}</h2>
        {description ? <p className="store-section-header__description">{description}</p> : null}
      </div>
      {action ? <div className="store-section-header__action">{action}</div> : null}
    </div>
  )
}

export function EmptyState({ title, description, action, className = '' }) {
  return (
    <Surface className={cx('store-empty', className)}>
      <div className="store-empty__mark">VX</div>
      <div>
        <div className="store-empty__title">{title}</div>
        {description ? <p className="store-empty__description">{description}</p> : null}
        {action ? <div className="mt-4">{action}</div> : null}
      </div>
    </Surface>
  )
}

export function LoadingSkeleton({ rows = 3, className = '' }) {
  return (
    <div className={cx('store-skeleton-list', className)}>
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="store-skeleton" />
      ))}
    </div>
  )
}

export function FormSurface({ title, description, children, footer, className = '' }) {
  return (
    <Surface className={cx('store-form', className)}>
      {title ? <h2 className="store-form__title">{title}</h2> : null}
      {description ? <p className="store-form__description">{description}</p> : null}
      <div className="store-form__body">{children}</div>
      {footer ? <div className="store-form__footer">{footer}</div> : null}
    </Surface>
  )
}

export function MetricStrip({ items = [], className = '' }) {
  return (
    <div className={cx('store-metric-strip', className)}>
      {items.filter(Boolean).map((item) => (
        <div key={item.label} className="store-metric">
          <div className="store-metric__value">{item.value}</div>
          <div className="store-metric__label">{item.label}</div>
        </div>
      ))}
    </div>
  )
}

export function ProductTile({ product, optionStock, compact = false, className = '', imageRatio, forceFit = true }) {
  const price = getProductPriceMeta(product)
  const stock = getStockMeta(optionStock || {
    out: !product?.is_unlimited_stock && Number(product?.stock ?? 0) <= 0,
    unlimited: Boolean(product?.is_unlimited_stock),
    remaining: Number(product?.stock ?? 0),
  })
  const image = getDisplayImage(product)
  return (
    <Link to={`/product/${product.id}`} className={cx('store-product-tile', compact && 'store-product-tile--compact', className)}>
      <div className="store-product-tile__media" style={imageRatio ? { aspectRatio: imageRatio } : undefined}>
        {image ? <img src={image} alt={product.name || 'Product'} className={forceFit ? 'object-contain' : 'object-cover'} loading="lazy" /> : <span>VX</span>}
      </div>
      <div className="store-product-tile__body">
        <div className="store-product-tile__topline">
          <StatusBadge tone={stock.tone}>{stock.label}</StatusBadge>
          {price.hasPromo ? <StatusBadge tone="cyan">โปรโมชัน</StatusBadge> : null}
        </div>
        <div className="store-product-tile__name">{product.name}</div>
        {product.description && !compact ? <p className="store-product-tile__description">{product.description}</p> : null}
        <div className="store-product-tile__price">
          {price.hasPromo ? <span className="store-product-tile__old-price">{price.label}</span> : null}
          <span>{formatPoints(price.discountedLabel)}</span>
        </div>
      </div>
    </Link>
  )
}

export function BundleTile({ bundle, className = '', children }) {
  const image = getDisplayImage(bundle)
  return (
    <Link to={`/bundle/${bundle.id}`} className={cx('store-bundle-tile', className)}>
      <div className="store-bundle-tile__media">
        {image ? <img src={image} alt={bundle.name || 'Bundle'} loading="lazy" /> : <span>Bundle</span>}
      </div>
      <div className="store-bundle-tile__body">
        <StatusBadge tone="violet">Bundle</StatusBadge>
        <div className="store-bundle-tile__name">{bundle.name}</div>
        {bundle.description ? <p className="store-bundle-tile__description">{bundle.description}</p> : null}
        <div className="store-bundle-tile__price">{formatPoints(bundle.bundle_price ?? bundle.bundle_price_points ?? 0)}</div>
        {children}
      </div>
    </Link>
  )
}
```

- [ ] **Step 5: Run helper tests and build**

Run:

```powershell
node --test client/src/components/storefront/storefrontUtils.test.mjs
cd client
npm run build
```

Expected: helper tests PASS and Vite build completes.

- [ ] **Step 6: Commit storefront primitives**

```powershell
git status --short
git add -- client/src/components/storefront/Storefront.jsx client/src/components/storefront/storefrontUtils.js client/src/components/storefront/storefrontUtils.test.mjs
git commit -m "feat: add storefront UI primitives"
```

---

### Task 3: Global Storefront CSS System

**Files:**
- Modify: `client/src/index.css`

- [ ] **Step 1: Replace customer tokens with the approved solid palette**

In `client/src/index.css`, ensure `:root` uses these customer tokens and keeps legacy aliases mapped to them:

```css
:root {
  --bg: #02040a;
  --surface: #091637;
  --surface-bright: #0d1c45;
  --surface-raised: #112455;
  --fg: #f2f7fb;
  --muted: #8294aa;
  --border: #1b3470;
  --accent: #22d3ee;
  --accent-alt: #38bdf8;
  --glow: rgba(34, 211, 238, 0.22);
  --bg-0: #02040a;
  --bg-1: #030713;
  --bg-2: #091637;
  --surface-0: #050d22;
  --surface-1: #091637;
  --surface-2: #0d1c45;
  --line-soft: #152b62;
  --line-hard: #284a92;
  --text-main: #f2f7fb;
  --text-dim: #b2c0cf;
  --text-faint: #7f90a3;
  --accent-strong: #22d3ee;
  --accent-soft: rgba(34, 211, 238, 0.16);
  --radius-sm: 8px;
  --radius-md: 8px;
  --radius-lg: 8px;
  --shadow-soft: 0 18px 52px rgba(0, 0, 0, 0.52);
  --shadow-hard: 0 24px 76px rgba(0, 0, 0, 0.72);
  font-family: 'Inter', 'Prompt', ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji';
}
```

- [ ] **Step 2: Add storefront component CSS**

Inside the existing `@layer components` block, add classes for the primitives:

```css
.store-surface {
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-lg);
  background: var(--surface);
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.035), var(--shadow-soft);
}

.store-action {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  border-radius: var(--radius-md);
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  font-weight: 800;
  line-height: 1;
  text-decoration: none;
}

.store-action--primary {
  background: linear-gradient(135deg, #0891b2 0%, #0e7490 48%, #155e75 100%);
  color: #fff;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.18), 0 14px 32px rgba(8,145,178,0.34);
}

.store-action--secondary,
.store-action--subtle {
  border: 1px solid var(--line-soft);
  background: var(--surface-bright);
  color: rgba(255,255,255,0.9);
}

.store-action--danger {
  border: 1px solid rgba(251,113,133,0.3);
  background: rgba(244,63,94,0.16);
  color: #ffe4e6;
}

.store-badge {
  display: inline-flex;
  min-height: 1.5rem;
  align-items: center;
  justify-content: center;
  border-width: 1px;
  border-style: solid;
  border-radius: 999px;
  padding: 0.25rem 0.55rem;
  font-size: 0.68rem;
  font-weight: 900;
  line-height: 1;
}

.store-eyebrow {
  color: var(--accent);
  font-size: 0.72rem;
  font-weight: 900;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

.store-hero {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(320px, 0.9fr);
  gap: clamp(1rem, 4vw, 3rem);
  align-items: stretch;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-lg);
  background: #050d22;
  padding: clamp(1.25rem, 4vw, 3rem);
}

.store-hero__title {
  margin-top: 0.75rem;
  max-width: 12ch;
  color: #fff;
  font-size: clamp(2.2rem, 7vw, 5.25rem);
  font-weight: 950;
  line-height: 0.9;
  letter-spacing: 0;
  text-transform: uppercase;
}

.store-hero__description {
  margin-top: 1rem;
  max-width: 42rem;
  color: var(--text-dim);
  font-size: 1rem;
  line-height: 1.7;
}

.store-hero__actions {
  margin-top: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.store-hero__aside {
  min-width: 0;
}

.store-section-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1rem;
}

.store-section-header__title {
  color: #fff;
  font-size: clamp(1.4rem, 2vw, 2rem);
  font-weight: 950;
  letter-spacing: 0;
}

.store-section-header__description,
.store-empty__description,
.store-form__description {
  color: var(--text-dim);
  line-height: 1.65;
}

.store-empty {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
}

.store-empty__mark {
  display: grid;
  height: 3rem;
  width: 3rem;
  flex: 0 0 auto;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: rgba(255,255,255,0.36);
  font-size: 0.75rem;
  font-weight: 950;
}

.store-empty__title,
.store-form__title {
  color: #fff;
  font-weight: 950;
}

.store-skeleton-list {
  display: grid;
  gap: 0.85rem;
}

.store-skeleton {
  min-height: 8rem;
  border-radius: var(--radius-lg);
  background: linear-gradient(90deg, #091637 0%, #112455 45%, #091637 100%);
  background-size: 220% 100%;
  animation: store-skeleton 1.4s ease-in-out infinite;
}

@keyframes store-skeleton {
  0% { background-position: 120% 0; }
  100% { background-position: -120% 0; }
}

.store-form {
  padding: 1.25rem;
}

.store-form__body {
  margin-top: 1rem;
  display: grid;
  gap: 0.85rem;
}

.store-form__footer {
  margin-top: 1rem;
}

.store-metric-strip {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.75rem;
}

.store-metric {
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: 0.9rem;
}

.store-metric__value {
  color: #fff;
  font-size: 1.15rem;
  font-weight: 950;
}

.store-metric__label {
  margin-top: 0.2rem;
  color: var(--text-faint);
  font-size: 0.76rem;
  font-weight: 700;
}

.store-product-tile,
.store-bundle-tile {
  display: grid;
  overflow: hidden;
  min-width: 0;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-lg);
  background: var(--surface);
  color: #fff;
  text-decoration: none;
  transition: transform 180ms ease, border-color 180ms ease, background-color 180ms ease;
}

.store-product-tile:hover,
.store-bundle-tile:hover {
  transform: translateY(-2px);
  border-color: var(--line-hard);
  background: var(--surface-bright);
}

.store-product-tile__media,
.store-bundle-tile__media {
  display: grid;
  aspect-ratio: 16 / 10;
  place-items: center;
  background: #050d22;
}

.store-product-tile__media img,
.store-bundle-tile__media img {
  height: 100%;
  width: 100%;
  padding: 0.75rem;
}

.store-bundle-tile__media img {
  object-fit: cover;
  padding: 0;
}

.store-product-tile__body,
.store-bundle-tile__body {
  display: grid;
  gap: 0.65rem;
  padding: 1rem;
}

.store-product-tile__topline {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.store-product-tile__name,
.store-bundle-tile__name {
  color: #fff;
  font-size: 1rem;
  font-weight: 950;
  line-height: 1.25;
}

.store-product-tile__description,
.store-bundle-tile__description {
  display: -webkit-box;
  min-height: 2.6em;
  overflow: hidden;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  color: var(--text-faint);
  font-size: 0.82rem;
  line-height: 1.3;
}

.store-product-tile__price,
.store-bundle-tile__price {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  color: #67e8f9;
  font-size: 1.05rem;
  font-weight: 950;
}

.store-product-tile__old-price {
  color: var(--text-faint);
  font-size: 0.78rem;
  text-decoration: line-through;
}
```

- [ ] **Step 3: Add responsive CSS**

Append these responsive rules after the component classes:

```css
@media (max-width: 900px) {
  .store-hero {
    grid-template-columns: 1fr;
    padding: 1.25rem;
  }

  .store-hero__title {
    max-width: 14ch;
    font-size: clamp(2.1rem, 12vw, 3.6rem);
  }

  .store-hero__actions,
  .store-section-header {
    align-items: stretch;
    flex-direction: column;
  }

  .store-action {
    width: 100%;
  }

  .store-metric-strip {
    grid-template-columns: 1fr;
  }
}

@media (prefers-reduced-motion: reduce) {
  .store-skeleton {
    animation: none;
  }

  .store-product-tile,
  .store-bundle-tile {
    transition: none;
  }

  .store-product-tile:hover,
  .store-bundle-tile:hover {
    transform: none;
  }
}
```

- [ ] **Step 4: Align legacy customer classes to solid surfaces**

In `client/src/index.css`, keep existing `.ui-panel`, `.ui-btn`, `.ui-btn-primary`, `.glass`, `.glass-strong`, and `.gaming-card` selectors, but make them use solid tokens:

```css
.glass,
.glass-strong,
.gaming-card {
  border: 1px solid var(--line-soft);
  background: var(--surface);
  box-shadow: var(--shadow-soft);
  backdrop-filter: none;
}
```

- [ ] **Step 5: Run CSS build verification**

Run:

```powershell
cd client
npm run build
```

Expected: Vite build completes without CSS syntax errors.

- [ ] **Step 6: Commit global storefront CSS**

```powershell
git status --short
git add -- client/src/index.css
git commit -m "style: establish solid storefront theme"
```

---

### Task 4: Customer Shell, Navbar, Announcement, And Footer

**Files:**
- Modify: `client/src/components/Layout.jsx`
- Modify: `client/src/components/Navbar.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Import storefront primitives in `Layout.jsx`**

Add this import near the other component imports:

```jsx
import { ActionButton, Surface } from './storefront/Storefront.jsx'
```

- [ ] **Step 2: Replace the customer background wrapper**

In the non-admin return of `Layout.jsx`, use a solid shell:

```jsx
return (
  <div ref={rootRef} className="store-app-shell relative min-h-screen flex flex-col bg-[var(--bg)] text-white">
    <Navbar />
    <main className="relative z-10 mx-auto w-full max-w-[min(1480px,94vw)] flex-1 px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-10">
      <div key={loc.pathname} className="page-fade">
        <Outlet />
      </div>
    </main>
    <CookieConsent />
  </div>
)
```

Keep the admin-route branch unchanged.

- [ ] **Step 3: Keep route progress and remove decorative overlays from customer shell**

In the non-admin branch, keep the route progress bar. Replace the fixed background, snow, and CRT overlay with this single background node:

```jsx
<div className="pointer-events-none fixed inset-0 z-0 bg-[var(--bg)]" aria-hidden />
```

- [ ] **Step 4: Rebuild announcement markup**

Keep the filtering logic. Replace each announcement card body with:

```jsx
<Surface as="article" className="ann-card ann-slide-in" style={{ animationDelay: `${idx * 90}ms` }}>
  <div className="ann-card__icon">
    <AnnIcon icon={ann.icon} className="h-4 w-4" />
  </div>
  <div className="ann-card__body">
    {ann.title ? <div className="ann-card__title">{ann.title}</div> : null}
    <AnnRichText text={ann.text} className="ann-card__text" />
  </div>
  {ann.link ? (
    (() => {
      const isExt = ann.link.startsWith('http://') || ann.link.startsWith('https://')
      return isExt
        ? <a href={ann.link} target="_blank" rel="noreferrer" className="ann-card__link">เปิดดู</a>
        : <Link to={ann.link} className="ann-card__link">เปิดดู</Link>
    })()
  ) : null}
  <button type="button" onClick={() => dismissAnn(ann)} className="ann-card__dismiss" aria-label="ไม่แสดงอีกวันนี้">
    ไม่แสดงอีก
  </button>
  <button type="button" onClick={() => closeAnn(ann)} className="ann-card__close" aria-label="ปิด">
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.5"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
  </button>
</Surface>
```

- [ ] **Step 5: Rebuild customer main sizing**

Change the customer `<main>` class to:

```jsx
<main className="relative z-10 mx-auto w-full max-w-[min(1480px,94vw)] flex-1 px-3 py-6 sm:px-4 sm:py-8 lg:px-6 lg:py-10">
```

- [ ] **Step 6: Simplify footer visual system without changing links**

Keep current `siteName`, `footerLinks`, and `socialLinks` logic. Replace inline footer root style with:

```jsx
<footer className="store-footer relative z-10 mt-16 border-t border-[var(--line-soft)] bg-[#050d22] px-4 py-12">
```

Use existing footer links and labels. Replace inline social circles with solid class names in CSS rather than per-element hover state where practical.

- [ ] **Step 7: Import storefront primitives in `Navbar.jsx`**

Add:

```jsx
import { ActionButton, StatusBadge, Surface } from './storefront/Storefront.jsx'
```

- [ ] **Step 8: Replace `NavItem` styling**

Update `NavItem` to use solid active states:

```jsx
function NavItem({ to, children }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `store-nav-link ${isActive ? 'store-nav-link--active' : ''}`
      }
    >
      {children}
    </NavLink>
  )
}
```

- [ ] **Step 9: Rebuild navbar root**

Change the header root to:

```jsx
<header className="store-navbar sticky top-0 z-50 border-b border-[var(--line-soft)] bg-[#02040a]/95 px-3 py-3 sm:px-4 lg:px-6">
```

Keep brand title, role logic, unread count, mobile menu, logout, and admin links. Replace guest buttons with:

```jsx
<ActionButton to="/login" variant="secondary">เข้าสู่ระบบ</ActionButton>
<ActionButton to="/register">สมัครสมาชิก</ActionButton>
```

- [ ] **Step 10: Add shell/nav CSS**

Add these classes in `client/src/index.css`:

```css
.store-app-shell {
  isolation: isolate;
}

.store-navbar {
  backdrop-filter: none;
}

.store-nav-link {
  display: inline-flex;
  min-height: 2.25rem;
  align-items: center;
  border-radius: var(--radius-md);
  padding: 0.45rem 0.7rem;
  color: rgba(255,255,255,0.62);
  font-size: 0.78rem;
  font-weight: 850;
  text-transform: uppercase;
}

.store-nav-link:hover,
.store-nav-link--active {
  background: var(--surface);
  color: #67e8f9;
}

.store-footer a {
  color: rgba(255,255,255,0.58);
}

.store-footer a:hover {
  color: #fff;
}

.ann-tray {
  position: relative;
  z-index: 30;
  margin: 0 auto;
  width: min(1480px, 94vw);
  padding: 0.75rem 0 0;
}

.ann-card {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto auto;
  gap: 0.75rem;
  align-items: center;
  padding: 0.8rem;
}

.ann-card__icon {
  display: grid;
  height: 2rem;
  width: 2rem;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--surface-raised);
  color: var(--accent);
}

.ann-card__title {
  color: #fff;
  font-size: 0.78rem;
  font-weight: 950;
}

.ann-card__text {
  color: var(--text-dim);
  font-size: 0.82rem;
  line-height: 1.45;
}

.ann-card__link,
.ann-card__dismiss,
.ann-card__close {
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  background: var(--surface-bright);
  color: rgba(255,255,255,0.86);
  padding: 0.5rem 0.65rem;
  font-size: 0.72rem;
  font-weight: 850;
}

@media (max-width: 760px) {
  .ann-card {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .ann-card__link,
  .ann-card__dismiss {
    grid-column: 1 / -1;
    width: 100%;
    justify-content: center;
    text-align: center;
  }
}
```

- [ ] **Step 11: Build and visually check shell routes**

Run:

```powershell
cd client
npm run build
```

Expected: build completes. Then start dev servers using the repo's usual process and verify in the browser:

- `/`
- `/categories`
- `/login`

Check desktop and mobile widths. The announcement must be in normal flow on mobile and must not cover page content.

- [ ] **Step 12: Commit shell and navigation**

```powershell
git status --short
git add -- client/src/components/Layout.jsx client/src/components/Navbar.jsx client/src/index.css
git commit -m "feat: rebuild customer shell and navigation"
```

---

### Task 5: Home And Catalog Routes

**Files:**
- Modify: `client/src/pages/Home.jsx`
- Modify: `client/src/pages/Categories.jsx`
- Modify: `client/src/pages/Category.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Import storefront primitives in Home**

Add to `client/src/pages/Home.jsx`:

```jsx
import {
  ActionButton,
  BundleTile,
  EmptyState,
  LoadingSkeleton,
  MetricStrip,
  PageHero,
  ProductTile,
  SectionHeader,
  Surface,
} from '../components/storefront/Storefront.jsx'
```

- [ ] **Step 2: Preserve Home data logic and replace only presentational helpers**

Keep these Home functions and hooks unless they become unused after importing shared helpers:

- `DEFAULT_HOMEPAGE_SETTINGS`
- `DEFAULT_FAQ_ITEMS`
- `DEFAULT_TRUST_ITEMS`
- `useCountdown`
- `CountdownPill`
- `ShowcaseScroller`
- `loadAll`
- option-stock loading
- visible-bundle filtering
- auth-token CTA logic

Remove local `EmptyState` and local `ProductCard` only after all JSX references use `EmptyState` and `ProductTile`.

- [ ] **Step 3: Rebuild Home loading state**

Replace `HomeSkeleton` return with:

```jsx
return (
  <div className="space-y-6">
    <LoadingSkeleton rows={1} className="store-home-skeleton-hero" />
    <LoadingSkeleton rows={3} />
  </div>
)
```

- [ ] **Step 4: Rebuild Home hero**

Use this structure in the main Home return:

```jsx
<div className="store-page store-home-page space-y-10">
  <PageHero
    eyebrow={heroSubtitle}
    title={heroTitle}
    description={heroDesc}
    actions={(
      <>
        <ActionButton to={heroBtnLink}>{heroBtnText}</ActionButton>
        <ActionButton to={hasToken ? '/topup/angpao' : '/register'} variant="secondary">
          {hasToken ? 'เติมพ้อยท์' : 'สมัครสมาชิก'}
        </ActionButton>
      </>
    )}
    meta={(
      <Surface className="store-home-spotlight">
        {heroSpotlightProduct ? (
          <ProductTile product={heroSpotlightProduct} optionStock={optionStockByProduct[String(heroSpotlightProduct.id)]} compact />
        ) : (
          <EmptyState title="พร้อมเปิดร้าน" description="เลือกหมวดหมู่เพื่อดูสินค้าทั้งหมด" action={<ActionButton to="/categories" variant="secondary">ดูหมวดหมู่</ActionButton>} />
        )}
      </Surface>
    )}
  />
</div>
```

After the `PageHero`, render the concrete section content described in Step 5 in this order: featured products, showcase products, active bundles, categories, trust items, FAQ items.

- [ ] **Step 5: Rebuild Home sections**

Use `SectionHeader` for featured products, showcase, bundles, categories, trust, and FAQ. Use:

- `ProductTile` for featured and showcase products.
- `BundleTile` for active bundles.
- `EmptyState` for configured-but-empty featured/category states.
- `MetricStrip` in the hero or trust section with values derived from current arrays: category count, featured count, active bundle count.

- [ ] **Step 6: Import storefront primitives in Categories and Category**

Add to both `client/src/pages/Categories.jsx` and `client/src/pages/Category.jsx`:

```jsx
import {
  ActionButton,
  EmptyState,
  LoadingSkeleton,
  PageHero,
  ProductTile,
  SectionHeader,
  StatusBadge,
  Surface,
} from '../components/storefront/Storefront.jsx'
```

- [ ] **Step 7: Rebuild `/categories` as catalog hub**

Keep existing category/product/settings fetches, query state, product-count map, and featured-category logic. Replace the page return with:

- `PageHero` title from existing page copy.
- Search input inside `Surface`.
- Category grid using existing category links.
- Product count displayed with `StatusBadge`.
- Empty state linking back to `/support` only if there are no categories after loading.

- [ ] **Step 8: Rebuild `/category/:slug` product shelf**

Keep existing product fetch, option-stock fetch, query, sort, stock filter, and current-category lookup. Replace product cards with `ProductTile`:

```jsx
<ProductTile
  key={product.id}
  product={product}
  optionStock={optionStockByProduct?.[String(product.id)]}
  imageRatio={uiImageSettings.product_card_ratio}
  forceFit={uiImageSettings.product_card_fit !== 'cover'}
/>
```

Keep the current filter controls, but restyle them as solid `Surface` controls.

- [ ] **Step 9: Add catalog CSS**

Add:

```css
.store-page {
  min-width: 0;
}

.store-home-spotlight {
  min-height: 100%;
  padding: 0.75rem;
}

.store-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1rem;
}

.store-category-card {
  display: grid;
  gap: 0.75rem;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-lg);
  background: var(--surface);
  padding: 1rem;
  text-decoration: none;
}

.store-category-card__image {
  display: grid;
  aspect-ratio: 16 / 9;
  place-items: center;
  overflow: hidden;
  border-radius: var(--radius-md);
  background: #050d22;
}

.store-category-card__image img {
  height: 100%;
  width: 100%;
  object-fit: cover;
}

.store-filter-bar {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  gap: 0.75rem;
  padding: 0.9rem;
}

@media (max-width: 760px) {
  .store-filter-bar {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 10: Build and visually check Home/Catalog**

Run:

```powershell
cd client
npm run build
```

Expected: build completes. Browser-check:

- `/`
- `/categories`
- a real `/category/:slug` from local category links

Check 1440px and 390px widths. Product cards must not resize unpredictably when stock/promo badges appear.

- [ ] **Step 11: Commit Home and catalog routes**

```powershell
git status --short
git add -- client/src/pages/Home.jsx client/src/pages/Categories.jsx client/src/pages/Category.jsx client/src/index.css
git commit -m "feat: rebuild home and catalog storefront"
```

---

### Task 6: Product And Bundle Detail Routes

**Files:**
- Modify: `client/src/pages/ProductDetail.jsx`
- Modify: `client/src/pages/BundleDetail.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Import storefront primitives**

Add to both detail pages:

```jsx
import {
  ActionButton,
  EmptyState,
  FormSurface,
  LoadingSkeleton,
  MetricStrip,
  PageHero,
  SectionHeader,
  StatusBadge,
  Surface,
} from '../components/storefront/Storefront.jsx'
import { formatPoints } from '../components/storefront/storefrontUtils.js'
```

- [ ] **Step 2: Rebuild ProductDetail loading and not-found states**

Replace text-only loading with:

```jsx
if (loading) {
  return <LoadingSkeleton rows={3} className="store-detail-loading" />
}
```

Replace not-found with:

```jsx
if (!product) {
  return (
    <EmptyState
      title="ไม่พบสินค้า"
      description="สินค้านี้อาจถูกปิดหรือย้ายหมวดหมู่แล้ว"
      action={<ActionButton to="/categories">กลับไปเลือกสินค้า</ActionButton>}
    />
  )
}
```

- [ ] **Step 3: Rebuild ProductDetail main layout**

Preserve all existing computed values and handlers for options, quantity, farm form, UID form, mystery box, quote, coupon, confirm modal, and success modal. Change the visible layout into:

```jsx
<div className="store-page store-detail-page space-y-8">
  <PageHero
    eyebrow={product.category_name || 'Product'}
    title={product.name}
    description={product.description}
    meta={<MetricStrip items={[
      { label: 'ราคาเริ่มต้น', value: formatPoints(displayPriceValue) },
      { label: 'สต็อก', value: stockLabel },
      { label: 'สถานะ', value: isUnavailable ? 'ไม่พร้อมขาย' : 'พร้อมซื้อ' },
    ]} />}
  />
  <div className="store-detail-layout">
    <Surface className="store-detail-media">
      <img src={product.image_url || product.image || ''} alt={product.name || 'Product'} loading="lazy" />
    </Surface>
    <FormSurface title="สั่งซื้อสินค้า" description="ตรวจสอบตัวเลือกและยอดรวมก่อนยืนยัน">
      <div className="store-buy-panel" />
    </FormSurface>
  </div>
  <Surface className="store-detail-info">
    <SectionHeader title="รายละเอียดสินค้า" description={product.description || 'ตรวจสอบรายละเอียดและเงื่อนไขก่อนสั่งซื้อ'} />
  </Surface>
</div>
```

The `store-buy-panel` container receives the existing option selector, quantity controls, farm/UID/mystery form fields, coupon field, quote summary, and purchase button. Move those existing controls into this container without changing their state names, event handlers, endpoint URLs, or validation conditions. If `displayPriceValue` or `stockLabel` do not exist, create them as derived constants immediately before return using existing price/stock data.

- [ ] **Step 4: Keep purchase CTA behavior exactly equivalent**

The primary purchase button must still:

- Navigate guests to `/login` or show the existing auth-required flow.
- Respect sold-out/unavailable states.
- Respect option selection requirement.
- Respect quantity requirement.
- Preserve current coupon quote and buy endpoint behavior.
- Preserve success modal data display.

Use `ActionButton` only when it does not break button `disabled`, `type`, or `onClick` semantics. For disabled submit buttons, render native `<button className="store-action store-action--primary">`.

- [ ] **Step 5: Rebuild BundleDetail loading and not-found states**

Use the same `LoadingSkeleton` and `EmptyState` pattern, with copy:

```jsx
title="ไม่พบ Bundle"
description="Bundle นี้อาจหมดเวลา ปิดการขาย หรือถูกย้ายแล้ว"
```

- [ ] **Step 6: Rebuild BundleDetail main layout**

Preserve bundle load, auth check, quote load, coupon, purchase handler, countdown, availability, and success behavior. Rebuild layout into:

```jsx
<div className="store-page store-detail-page space-y-8">
  <PageHero
    eyebrow="Bundle"
    title={bundle.name}
    description={bundle.description}
    meta={<MetricStrip items={[
      { label: 'ราคา Bundle', value: formatPoints(total) },
      { label: 'ประหยัด', value: formatPoints(bundleDiscount + couponDiscount) },
      { label: 'จำนวนสินค้า', value: `${items.length} รายการ` },
    ]} />}
  />
  <div className="store-detail-layout">
    <Surface className="store-detail-media">
      <img src={bundle.image_url || bundle.image || ''} alt={bundle.name || 'Bundle'} loading="lazy" />
    </Surface>
    <FormSurface title="ซื้อ Bundle" description="ตรวจสอบรายการในชุดและช่วงเวลาขายก่อนยืนยัน">
      <div className="store-buy-panel" />
    </FormSurface>
  </div>
  <Surface className="store-detail-info">
    <SectionHeader title="สินค้าใน Bundle" description={`${items.length} รายการในชุดนี้`} />
  </Surface>
</div>
```

The `store-buy-panel` container in the Bundle snippet receives the current coupon input, quote summary, availability warning, countdown, and purchase button. The `store-detail-info` section receives the existing included-item list.

- [ ] **Step 7: Add detail CSS**

Add:

```css
.store-detail-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(320px, 420px);
  gap: 1rem;
  align-items: start;
}

.store-detail-media {
  display: grid;
  min-height: 360px;
  place-items: center;
  overflow: hidden;
}

.store-detail-media img {
  max-height: 520px;
  width: 100%;
  object-fit: contain;
}

.store-detail-info {
  padding: 1.25rem;
}

.store-buy-panel {
  display: grid;
  gap: 1rem;
}

.store-option-grid {
  display: grid;
  gap: 0.6rem;
}

.store-option-button {
  min-height: 3rem;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  background: var(--surface-bright);
  padding: 0.75rem;
  text-align: left;
}

.store-option-button[aria-pressed='true'] {
  border-color: rgba(34,211,238,0.55);
  background: #10245a;
}

@media (max-width: 980px) {
  .store-detail-layout {
    grid-template-columns: 1fr;
  }

  .store-detail-media {
    min-height: 240px;
  }
}
```

- [ ] **Step 8: Build and visually check detail routes**

Run:

```powershell
cd client
npm run build
```

Expected: build completes. Browser-check one product and one bundle route from local links. If local data has no bundles, check the not-found state at `/bundle/0` and document that no live bundle was available.

- [ ] **Step 9: Commit detail routes**

```powershell
git status --short
git add -- client/src/pages/ProductDetail.jsx client/src/pages/BundleDetail.jsx client/src/index.css
git commit -m "feat: rebuild product and bundle detail pages"
```

---

### Task 7: Topup Flow

**Files:**
- Modify: `client/src/pages/Topup.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Import storefront primitives**

Add:

```jsx
import {
  ActionButton,
  FormSurface,
  MetricStrip,
  PageHero,
  SectionHeader,
  StatusBadge,
  Surface,
} from '../components/storefront/Storefront.jsx'
import { formatPoints } from '../components/storefront/storefrontUtils.js'
```

- [ ] **Step 2: Preserve all Topup behavior**

Keep these existing pieces intact:

- `QUICK_AMOUNTS`
- `METHOD_META`
- `MethodIcon`
- `Popup`
- `friendlyError`
- `readFileAsDataUrl`
- `formatPromptpayExpiry`
- `topupFriendlyError`
- auth verification
- pending PromptPay loading
- `canSubmit`
- `onSubmit`
- `onSlipChange`
- `verifySlip`

- [ ] **Step 3: Rebuild method selector**

Use the current `MethodOption` behavior, but style each method as:

```jsx
<button
  type="button"
  disabled={disabled}
  onClick={onClick}
  aria-pressed={active}
  className="store-method-option"
>
  <MethodIcon type={id} />
  <span>{meta.label}</span>
  {active ? <StatusBadge tone="cyan">เลือกอยู่</StatusBadge> : null}
</button>
```

- [ ] **Step 4: Rebuild page layout**

Wrap the page in:

```jsx
<div className="store-page store-topup-page space-y-8">
  <PageHero
    eyebrow="Topup"
    title="เติมพ้อยท์"
    description="เลือกวิธีเติมเงิน ตรวจสอบยอด และส่งหลักฐานในหน้าเดียว"
    meta={<MetricStrip items={[
      { label: 'ยอดคงเหลือ', value: formatPoints(balance) },
      { label: 'วิธีที่เลือก', value: selectedMethod.label },
      { label: 'สถานะ', value: status === 'loading' ? 'กำลังส่ง' : 'พร้อมทำรายการ' },
    ]} />}
  />
  <div className="store-topup-layout">
    <Surface className="store-method-list">
      {Object.keys(METHOD_META).map((id) => (
        <MethodOption key={id} id={id} active={method === id} onClick={() => nav(`/topup/${id}`)} />
      ))}
    </Surface>
    <FormSurface title={selectedMethod.label} description={selectedMethod.description}>
      <div className="store-topup-form" />
    </FormSurface>
  </div>
</div>
```

- [ ] **Step 5: Keep method-specific forms equivalent**

Render the existing fields inside the `store-topup-form` container:

- Angpao reference input and quick amount area.
- Coupon code input.
- PromptPay amount input, QR/pending order block, slip upload, preview, verify button, expiry text.

Do not change endpoint URLs, payload keys, validation conditions, or success refresh behavior.

- [ ] **Step 6: Add topup CSS**

Add:

```css
.store-topup-layout {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.store-method-list {
  display: grid;
  gap: 0.75rem;
  padding: 0.9rem;
}

.store-method-option {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  background: var(--surface-bright);
  padding: 0.85rem;
  color: #fff;
  text-align: left;
}

.store-method-option[aria-pressed='true'] {
  border-color: rgba(34,211,238,0.55);
  background: #10245a;
}

@media (max-width: 860px) {
  .store-topup-layout {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Build and visually check topup**

Run:

```powershell
cd client
npm run build
```

Expected: build completes. Browser-check:

- `/topup/angpao`
- `/topup/coupon`
- `/topup/promptpay`

If unauthenticated redirects to login, verify the redirect and then check the visible signed-out behavior. Do not bypass auth in code.

- [ ] **Step 8: Commit topup flow**

```powershell
git status --short
git add -- client/src/pages/Topup.jsx client/src/index.css
git commit -m "feat: rebuild topup workspace"
```

---

### Task 8: Account, History, Order, Inbox, And Support Workspace

**Files:**
- Modify: `client/src/pages/Profile.jsx`
- Modify: `client/src/pages/TopupHistory.jsx`
- Modify: `client/src/pages/PurchaseHistory.jsx`
- Modify: `client/src/pages/OrderTracking.jsx`
- Modify: `client/src/pages/Inbox.jsx`
- Modify: `client/src/pages/Support.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Import primitives in account pages**

Add to each file in this task:

```jsx
import {
  ActionButton,
  EmptyState,
  FormSurface,
  LoadingSkeleton,
  MetricStrip,
  PageHero,
  SectionHeader,
  StatusBadge,
  Surface,
} from '../components/storefront/Storefront.jsx'
```

Only import the components actually used in that file before committing.

- [ ] **Step 2: Rebuild Profile as customer dashboard**

Preserve all existing profile, avatar, password, Discord link, transaction, order, and logout behavior. Rebuild visual sections:

- `PageHero` with display name/email and balance metric.
- Quick action tiles for `/topup/angpao`, `/history/purchases`, `/history/topups`, `/inbox`, `/support`.
- `FormSurface` for profile edit.
- `FormSurface` for password change.
- `Surface` for Discord linking.
- `Surface` lists for recent topups and purchases.

- [ ] **Step 3: Rebuild TopupHistory and PurchaseHistory**

Keep fetches and login redirect behavior. Use:

- Shared tab row with solid buttons.
- Desktop table-like rows using `store-data-list`.
- Mobile stacked cards using the same markup and CSS media query.
- `StatusBadge` from current status meta.
- `EmptyState` with action to `/topup/angpao` for topup history and `/categories` for purchase history.

- [ ] **Step 4: Rebuild OrderTracking**

Preserve `buildTimeline`, `activeIndex`, status labels, and fetch behavior. Use:

- `PageHero` with order id/status.
- `Surface` for timeline.
- `Surface` for purchased item and delivery payload.
- `ActionButton` to `/support`.
- `ActionButton` variant secondary to `/history/purchases`.

- [ ] **Step 5: Rebuild Inbox**

Preserve inbox/messages tabs, unread polling, mark-read, mark-all-read, claim, and copy behavior. Use:

- `PageHero` with unread count metric.
- Solid tab buttons.
- `store-data-list` for messages.
- `store-data-list` for claimable inbox items.
- `EmptyState` for no messages and no items.

- [ ] **Step 6: Rebuild Support**

Preserve ticket loading, selected ticket, polling, attachment limits, attachment preview, create-ticket, reply, quick topics, and login redirect. Rebuild into:

```jsx
<div className="store-page store-support-page space-y-8">
  <PageHero eyebrow="Support" title="ซัพพอร์ต" description="เปิดเคสและติดตามคำตอบจากทีมงาน" />
  <div className="store-support-layout">
    <Surface className="store-ticket-list">
      <SectionHeader title="เคสของคุณ" description={`${tickets.length} รายการ`} />
    </Surface>
    <FormSurface className="store-ticket-thread" title="รายละเอียดเคส" description="เลือกเคสหรือสร้างเคสใหม่เพื่อส่งข้อความ">
      <div className="store-ticket-thread__body" />
    </FormSurface>
  </div>
</div>
```

The `store-ticket-list` section receives the current ticket list, quick-topic actions, and create-ticket entry point. The `store-ticket-thread__body` container receives the current selected-ticket messages, attachment strip, reply field, and send button. Ticket list must remain usable on mobile by stacking above the thread.

- [ ] **Step 7: Add account/data CSS**

Add:

```css
.store-dashboard-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
}

.store-data-list {
  display: grid;
  gap: 0.65rem;
}

.store-data-row {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(120px, 0.6fr) minmax(120px, 0.6fr) auto;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid var(--line-soft);
  border-radius: var(--radius-md);
  background: var(--surface);
  padding: 0.85rem;
}

.store-support-layout {
  display: grid;
  grid-template-columns: minmax(260px, 360px) minmax(0, 1fr);
  gap: 1rem;
  align-items: start;
}

.store-ticket-list,
.store-ticket-thread {
  min-height: 420px;
}

@media (max-width: 900px) {
  .store-data-row,
  .store-support-layout {
    grid-template-columns: 1fr;
  }

  .store-data-row {
    align-items: stretch;
  }
}
```

- [ ] **Step 8: Build and visually check account workspace**

Run:

```powershell
cd client
npm run build
```

Expected: build completes. Browser-check signed-out redirect or signed-in page behavior for:

- `/profile`
- `/history/topups`
- `/history/purchases`
- `/history/orders/:id` when a local order exists
- `/inbox`
- `/support`

Check mobile width for row/card collapse.

- [ ] **Step 9: Commit account/support routes**

```powershell
git status --short
git add -- client/src/pages/Profile.jsx client/src/pages/TopupHistory.jsx client/src/pages/PurchaseHistory.jsx client/src/pages/OrderTracking.jsx client/src/pages/Inbox.jsx client/src/pages/Support.jsx client/src/index.css
git commit -m "feat: rebuild account and support workspace"
```

---

### Task 9: Auth, Discord, And Terms Routes

**Files:**
- Modify: `client/src/pages/Login.jsx`
- Modify: `client/src/pages/Register.jsx`
- Modify: `client/src/pages/DiscordInvite.jsx`
- Modify: `client/src/pages/Tos.jsx`
- Modify: `client/src/index.css`

- [ ] **Step 1: Import storefront primitives**

Add to the four files:

```jsx
import {
  ActionButton,
  FormSurface,
  PageHero,
  SectionHeader,
  StatusBadge,
  Surface,
} from '../components/storefront/Storefront.jsx'
```

Only keep imports used by each file.

- [ ] **Step 2: Rebuild Login layout**

Preserve:

- Discord config fetch.
- Query-string Discord error handling.
- Email/username login submit.
- Remember checkbox.
- Auth token persistence behavior.
- Redirect after login.

Use:

```jsx
<div className="store-auth-page">
  <FormSurface title="เข้าสู่ระบบ" description="เข้าสู่ระบบเพื่อเติมพ้อยท์และติดตามคำสั่งซื้อ">
    <form className="store-form__body" onSubmit={onSubmit}>
      <input className="ui-field" value={login} onChange={(event) => setLogin(event.target.value)} />
      <input className="ui-field" type="password" value={password} onChange={(event) => setPassword(event.target.value)} />
      <button type="submit" className="store-action store-action--primary">เข้าสู่ระบบ</button>
    </form>
  </FormSurface>
</div>
```

Keep Discord login button disabled state and error text.

- [ ] **Step 3: Rebuild Register layout**

Preserve:

- Username availability check.
- Password rules and strength meter.
- Submit endpoint.
- Auto-login token behavior.
- Redirect after register.

Use the same `store-auth-page` layout with `FormSurface`.

- [ ] **Step 4: Rebuild DiscordInvite layout**

Preserve the `/api/discord/bot` fetch and invite URL behavior. Use `PageHero`, `Surface`, and one primary `ActionButton` to the invite URL when available. Use a secondary login/register action when not authenticated if the current page already shows that path.

- [ ] **Step 5: Rebuild Tos layout**

Preserve `/api/ui-settings` fetch and current text content. Use:

```jsx
<div className="store-page store-legal-page">
  <PageHero eyebrow="Terms" title="ข้อกำหนดการใช้งาน" description="อ่านเงื่อนไขก่อนใช้งานร้านค้าและบริการ" />
  <Surface className="store-legal-content">
    <div dangerouslySetInnerHTML={{ __html: html }} />
  </Surface>
</div>
```

- [ ] **Step 6: Add auth/legal CSS**

Add:

```css
.store-auth-page {
  display: grid;
  min-height: min(720px, calc(100dvh - 12rem));
  place-items: center;
  padding: 1rem 0;
}

.store-auth-page .store-form {
  width: min(100%, 440px);
}

.store-legal-page {
  display: grid;
  gap: 1.25rem;
}

.store-legal-content {
  margin: 0 auto;
  width: min(100%, 860px);
  padding: clamp(1rem, 3vw, 2rem);
  color: var(--text-dim);
  line-height: 1.8;
}

.store-legal-content h2,
.store-legal-content h3 {
  color: #fff;
}
```

- [ ] **Step 7: Build and visually check auth/legal routes**

Run:

```powershell
cd client
npm run build
```

Expected: build completes. Browser-check:

- `/login`
- `/register`
- `/discord`
- `/tos`

Check form inputs, errors, button text, and mobile width.

- [ ] **Step 8: Commit auth/community/legal routes**

```powershell
git status --short
git add -- client/src/pages/Login.jsx client/src/pages/Register.jsx client/src/pages/DiscordInvite.jsx client/src/pages/Tos.jsx client/src/index.css
git commit -m "feat: rebuild auth and legal storefront pages"
```

---

### Task 10: Full Verification And Polish

**Files:**
- Modify only files already touched by Tasks 1-9 if verification finds a concrete issue.

- [ ] **Step 1: Run helper tests**

```powershell
node --test client/src/components/storefront/storefrontUtils.test.mjs
```

Expected: PASS.

- [ ] **Step 2: Run frontend build**

```powershell
cd client
npm run build
```

Expected: Vite build completes.

- [ ] **Step 3: Run existing client utility tests**

```powershell
node --test client/src/pages/admin-storage/storageInteractionUtils.test.mjs client/src/pages/admin-storage/storageMediaUtils.test.mjs
```

Expected: PASS. These tests cover existing admin-storage utilities and should remain unaffected.

- [ ] **Step 4: Start local app for browser verification**

Use the repo's normal dev flow. If no server is already running:

```powershell
.\start-dev.ps1
```

If using hidden/background processes, run server from `server` on port `3001` and client from `client` on port `5173`.

- [ ] **Step 5: Browser-check core customer routes at desktop width**

Open `http://localhost:5173` and verify at around 1440px wide:

- `/`
- `/categories`
- one real `/category/:slug`
- one real `/product/:id`
- one real `/bundle/:id` when available
- `/topup/angpao`
- `/login`
- `/register`
- `/discord`
- `/tos`

Expected: no blank content, no obvious text overlap, no announcement covering content, primary CTAs visible.

- [ ] **Step 6: Browser-check core customer routes at mobile width**

Set viewport around 390px wide and verify:

- `/`
- `/categories`
- one real `/category/:slug`
- one real `/product/:id`
- `/topup/angpao`
- `/login`
- `/support` redirect or signed-in view

Expected: nav menu works, announcement is in flow, buttons do not clip text, cards do not overflow horizontally, data rows stack.

- [ ] **Step 7: Check for forbidden broad changes**

Run:

```powershell
git diff --stat
git diff -- client/src/pages/AdminV3 client/src/pages/admin-storage server
git status --short
```

Expected: no admin/server diffs from this redesign work. `start-vxpers.exe` may still appear modified from pre-existing work and must remain unstaged.

- [ ] **Step 8: Fix concrete verification issues**

For each issue found, make the smallest targeted edit in the relevant customer file, then rerun the exact failing check. Examples:

- CSS overflow issue: adjust `client/src/index.css` responsive rule and rerun `npm run build`.
- Missing import: update the page import and rerun `npm run build`.
- Broken route link: correct only that link and verify the route in browser.
- Announcement overlap: adjust `.ann-tray` or `.ann-card` CSS and recheck desktop/mobile.

- [ ] **Step 9: Commit final polish**

If Step 8 changed files:

```powershell
git status --short
git add -- client/src
git reset -- start-vxpers.exe
git commit -m "fix: polish customer redesign responsiveness"
```

If Step 8 did not change files, skip this commit.

---

## Self-Review Checklist

- Spec coverage: Tasks 1-4 cover design system, shell, navbar, announcement, global styling; Task 5 covers home/categories/category; Task 6 covers product/bundle; Task 7 covers topup; Task 8 covers account/history/order/inbox/support; Task 9 covers auth/discord/tos; Task 10 covers full verification.
- Admin exclusion: all implementation tasks avoid admin routes and backend code.
- Behavior preservation: each route task explicitly keeps existing fetches, endpoint URLs, auth redirects, and purchase/topup/support handlers.
- Solid black/navy direction: CSS tasks set black app background, `#091637` surfaces, solid borders, and reduced glass usage.
- Responsive coverage: Tasks 3-10 include mobile-specific CSS and browser checks.
- Test coverage: pure helper tests, frontend build, existing client utility tests, and browser route checks are included.
