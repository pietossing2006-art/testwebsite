# Growth Foundation Design

## Context

The project is a React/Vite storefront with an Express API. Customer routes live under `client/src/pages`, shared customer shell and navigation live under `client/src/components`, and admin modules live under `client/src/pages/AdminV3/modules`.

The app already has product catalog, bundles, topups, discount coupons, purchase history, inbox/site messages, support tickets, push subscriptions, Discord account linking, admin RBAC, stock management, product promotions, mystery boxes, and workflow automation. The requested new systems are:

- Wishlist and product notifications.
- Verified product reviews.
- Flash deal and limited drop campaigns.
- Rank and VIP benefits.

The approved approach is **Growth Foundation**, implemented as a phased shared layer instead of four isolated feature implementations.

## Goals

- Add a reusable growth layer that increases purchase conversion, repeat usage, and storefront trust.
- Reuse existing site messages, inbox, push subscription, product, order, bundle, coupon, and admin RBAC patterns.
- Keep price-impacting logic server-side in quote and purchase flows.
- Make each feature usable independently while allowing later integration between wishlist, reviews, campaigns, and VIP.
- Keep the first implementation plan focused and buildable in phases.

## Non-Goals

- Do not replace the current product, order, topup, support, stock, or coupon systems.
- Do not create a separate notification platform when inbox/site messages and push subscription records already exist.
- Do not allow frontend-only discount calculation.
- Do not redesign the full customer or admin UI beyond the surfaces required for these growth features.
- Do not introduce a new external marketing, email, or CRM service in the foundation phase.

## Phased Architecture

### Phase 1: Wishlist And Notification Foundation

Customers can follow products. The system can use this demand signal to notify users when stock returns, promotions start, or related campaigns become active.

Core behavior:

- Login is required to add, remove, or view wishlist items.
- Product cards and product detail pages show follow state for signed-in users.
- Profile gets a Wishlist surface with followed products and availability status.
- Admin gets a Wishlist Signals view for products with high follower count, out-of-stock demand, and campaign opportunities.
- Notifications use existing inbox/site message and push subscription infrastructure.

### Phase 2: Verified Reviews

Customers can review products they actually purchased. Reviews increase trust on product cards and product detail pages.

Core behavior:

- Review eligibility is based on completed order items owned by the current user.
- One order item can produce at most one review.
- Public product surfaces show approved review summary and approved review list.
- Admin can approve, hide, or reject reviews and inspect the linked order reference.
- Hidden or rejected reviews are not public, but records remain available for audit.

### Phase 3: Flash Deal And Limited Drop Campaigns

Admin can create time-limited campaigns for products or bundles. Campaigns can apply discounts, limited campaign stock, or early access windows.

Core behavior:

- Campaigns have active windows, enabled state, target type, target IDs, optional discount, optional quantity limit, and display metadata.
- Home and category pages show a Flash Deal shelf when active campaigns exist.
- Product and bundle detail pages show active deal context when the current item is targeted.
- Quote and purchase flows validate campaign state server-side.
- If a campaign expires or limit is exhausted between quote and purchase, purchase is rejected with a clear error.

### Phase 4: Rank And VIP

The system calculates user VIP rank and benefits from successful purchase activity. VIP can later unlock discounts, priority support, early deal access, or storefront badges.

Core behavior:

- VIP rank is based on successful purchases only.
- Canceled or refunded orders do not contribute.
- Profile gets a VIP surface showing current tier, progress to next tier, benefits, and recent qualification context.
- Admin can manage tier thresholds and benefits.
- VIP benefits are represented in quote output and enforced during purchase.

## Data Model

### `wishlist_items`

Tracks product follow intent.

Important fields:

- `id`
- `user_id`
- `product_id`
- `notify_stock`
- `notify_promo`
- `notify_campaign`
- `created_at`
- `updated_at`

Constraints and indexes:

- Unique `(user_id, product_id)`.
- Index by `product_id` for admin demand counts.
- Keep records when products are hidden, but hide unavailable products from customer wishlist views.

### `product_reviews`

Stores verified reviews.

Important fields:

- `id`
- `user_id`
- `product_id`
- `order_id`
- `order_item_id`
- `rating`
- `comment`
- `status`
- `admin_note`
- `created_at`
- `updated_at`
- `moderated_by`
- `moderated_at`

Rules:

- `rating` is an integer from 1 to 5.
- `status` is `pending`, `approved`, `hidden`, or `rejected`.
- Unique `order_item_id` so one purchased item cannot create multiple reviews.
- Public APIs return approved reviews only.

### `growth_campaigns`

Stores flash deal and limited drop campaign metadata.

Important fields:

- `id`
- `kind`
- `title`
- `description`
- `badge_text`
- `is_active`
- `starts_at`
- `ends_at`
- `discount_type`
- `discount_value`
- `quantity_limit`
- `quantity_used`
- `vip_early_access_tier`
- `metadata_json`
- `created_at`
- `updated_at`

Rules:

- `kind` initially supports `flash_deal` and `limited_drop`.
- `discount_type` supports `percent`, `amount_points`, or `none`.
- `quantity_used` is updated transactionally during purchase if the campaign has a limit.

### `growth_campaign_targets`

Connects campaigns to products or bundles.

Important fields:

- `id`
- `campaign_id`
- `target_type`
- `target_id`
- `sort_order`

Rules:

- `target_type` is `product` or `bundle`.
- A campaign can target multiple products or bundles.

### `vip_tiers`

Defines rank thresholds and benefits.

Important fields:

- `id`
- `code`
- `name`
- `sort_order`
- `threshold_points_spent`
- `discount_percent`
- `priority_support`
- `early_access_minutes`
- `badge_label`
- `is_active`
- `benefits_json`
- `created_at`
- `updated_at`

Rules:

- Tier thresholds are based on successful purchase spend in points.
- Benefits must be bounded so final prices cannot become negative.

### `vip_user_snapshots`

Caches a user's current VIP state for fast customer and admin views.

Important fields:

- `user_id`
- `tier_id`
- `points_spent`
- `next_tier_id`
- `next_threshold_points`
- `calculated_at`

Rules:

- Recalculate after successful purchases.
- Allow scheduled or admin-triggered recalculation later if needed.

## Backend Design

New route areas should follow current Express route structure and validation patterns.

Customer APIs:

- `GET /api/me/wishlist`
- `POST /api/me/wishlist`
- `DELETE /api/me/wishlist/:productId`
- `GET /api/products/:id/reviews`
- `POST /api/products/:id/reviews`
- `GET /api/growth-campaigns/active`
- `GET /api/me/vip`

Admin APIs:

- `GET /api/admin/reviews`
- `PATCH /api/admin/reviews/:id`
- `GET /api/admin/growth-campaigns`
- `POST /api/admin/growth-campaigns`
- `PUT /api/admin/growth-campaigns/:id`
- `DELETE /api/admin/growth-campaigns/:id`
- `GET /api/admin/vip-tiers`
- `POST /api/admin/vip-tiers`
- `PUT /api/admin/vip-tiers/:id`
- `DELETE /api/admin/vip-tiers/:id`
- `GET /api/admin/wishlist-signals`

Access control:

- Customer endpoints require `requireAuth` when they mutate or expose user-specific data.
- Public review and campaign reads only expose approved or active public data.
- Admin review and campaign management require admin-level access.
- VIP tier management requires admin or owner-level access, matching existing admin action policy.

Notification integration:

- Use existing `site_messages` and inbox behavior for customer-visible messages.
- Use existing push subscription support where configured.
- Store or derive idempotency keys for notification events, such as `stock_back:product_id:user_id`, to prevent duplicate sends.
- Discord notifications can be added later behind the same event interface.

Quote and purchase integration:

- Flash deal, limited drop, and VIP discounts must be resolved server-side.
- Quote responses should expose line item pricing, applied campaign discount, applied VIP discount, and final total.
- Purchase must revalidate all applied campaign and VIP state inside the transaction.
- Discount priority must be deterministic:
  1. Product promotion.
  2. Campaign discount.
  3. VIP discount.
  4. Coupon discount.
- Each discount step clamps final unit price at zero.

## Customer UX

Product cards and product detail:

- Show a follow or wishlist control for signed-in users.
- Guests can see the control but are routed to login or prompted to login before following.
- Show approved review average and count when available.
- Product detail includes a verified reviews section with empty, loading, and error states.
- If the current user has eligible purchases, show review submission entry points.

Profile:

- Add Wishlist, Reviews, and VIP surfaces.
- Wishlist shows followed products, stock status, active deal status, and quick links back to product detail.
- Reviews shows submitted reviews and moderation state.
- VIP shows current rank, progress to next rank, benefits, and concise recent qualification context.

Home and category pages:

- Show a Flash Deal shelf when active campaigns exist.
- Campaign cards link to product or bundle detail pages.
- Deal cards show timer, discount, availability, and sold-out or expired state.

## Admin UX

Add a Growth module to AdminV3 with four tabs:

- `Campaigns`: create, edit, enable, disable, and inspect flash deal or limited drop campaigns.
- `Reviews`: approve, hide, or reject reviews and inspect the order reference.
- `VIP`: manage tiers, thresholds, benefit copy, discount, priority support, and early access settings.
- `Wishlist Signals`: view most-followed products, out-of-stock demand, and products worth restocking or campaigning.

Admin module requirements:

- Keep operational density consistent with the existing AdminV3 style.
- Show validation errors inline.
- Make destructive actions explicit.
- Avoid nested card layouts.
- Do not expose VIP or campaign controls to roles that lack access.

## Error And Edge Cases

- If a wishlisted product is hidden or deleted, customer wishlist views omit it while retaining the record for audit.
- Notification sends are idempotent per user, product, and event key.
- A user cannot review an order item that does not belong to them.
- A user cannot review an order item before the related order is completed.
- One order item can produce only one review.
- Admin can hide a review without deleting historical data.
- If a campaign expires between quote and purchase, purchase returns a campaign-expired error.
- If a limited drop limit is exhausted between quote and purchase, purchase returns a campaign-sold-out error.
- VIP calculation uses successful purchases only.
- VIP recalculation after purchase must not block order completion if only the cache update fails; a later recalculation can repair the snapshot.
- Price calculations must clamp at zero and return enough quote detail for the UI to explain applied discounts.

## Testing And Verification

Backend tests:

- Wishlist create, list, delete, duplicate follow handling, and hidden product handling.
- Review eligibility, one-review-per-order-item, public approved-only reads, and admin moderation.
- Campaign active window filtering, target selection, quantity limit handling, and expired purchase rejection.
- VIP tier calculation from successful orders only.
- Quote and purchase discount priority for product promotion, campaign, VIP, and coupon.
- Authorization checks for customer-owned resources and admin-only endpoints.

Frontend verification:

- `npm run build` in `client`.
- Product detail with wishlist state, review summary, review list, and eligible review submission.
- Profile Wishlist, Reviews, and VIP surfaces.
- Home or category Flash Deal shelf.
- AdminV3 Growth module tabs.
- Mobile and desktop layouts for product detail, profile, and admin growth views.

Security checks:

- Users cannot review another user's order.
- Users cannot mutate another user's wishlist.
- Public review APIs do not leak hidden, rejected, or pending reviews.
- Admin growth endpoints enforce the intended roles.

## Implementation Notes

- Keep database helper logic in `server/db.js` only if it remains consistent with existing patterns. If growth helpers become too large, split them into a focused server lib after confirming local conventions.
- Keep route handlers small and validate request bodies with the existing zod validation approach.
- Reuse existing product card, product detail, profile, support, admin module, and fetch helper patterns.
- Avoid broad customer redesign work during this feature pass.
- Avoid touching unrelated dirty worktree files.

## Risks

- Price discount stacking can create subtle regressions if not tested at quote and purchase levels.
- Admin campaign controls can become too broad if early access, discounting, stock limits, and targeting are all implemented at once.
- VIP cache updates need clear recovery behavior so rank displays remain correct after failed recalculation.
- Existing Thai text encoding varies in some server files, so implementation should avoid broad rewrites around legacy strings.
