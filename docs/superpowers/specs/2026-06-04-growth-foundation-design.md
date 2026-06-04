# Growth Foundation Design

## Context

The project is a React/Vite storefront with an Express API. Customer routes live under `client/src/pages`, shared customer shell and navigation live under `client/src/components`, and admin modules live under `client/src/pages/AdminV3/modules`.

The app already has product catalog, bundles, topups, discount coupons, purchase history, inbox/site messages, support tickets, push subscriptions, Discord account linking, admin RBAC, stock management, product promotions, mystery boxes, and workflow automation. The requested new systems are:

- Wishlist and product notifications.
- Verified product reviews.
- Flash deal and limited drop campaigns.
- Rank and VIP benefits.
- A more consistent discount resolution path for promotions, campaigns, VIP, and coupons.
- A more consistent notification delivery path for wishlist, campaign, VIP, and review events.

The approved approach is **Growth Foundation**, implemented as a phased shared layer instead of four isolated feature implementations.

## Goals

- Add a reusable growth layer that increases purchase conversion, repeat usage, and storefront trust.
- Reuse existing site messages, inbox, push subscription, product, order, bundle, coupon, and admin RBAC patterns.
- Keep price-impacting logic server-side in quote and purchase flows.
- Give discounts a single auditable resolver instead of scattered price logic.
- Give growth notifications a shared event and delivery model instead of one-off sends.
- Make each feature usable independently while allowing later integration between wishlist, reviews, campaigns, and VIP.
- Keep the first implementation plan focused and buildable in phases.

## Non-Goals

- Do not replace the current product, order, topup, support, stock, or coupon systems.
- Do not create a separate notification platform when inbox/site messages and push subscription records already exist.
- Do not allow frontend-only discount calculation.
- Do not remove existing product promotion, discount coupon, or topup coupon behavior.
- Do not require every notification channel to ship at once; inbox can be the baseline channel.
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
- Notification events are queued through a shared growth notification helper with event keys, delivery records, and user preferences.

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
- Campaign discounts use the shared discount resolver and are written to discount audit records on successful purchase.

### Phase 4: Rank And VIP

The system calculates user VIP rank and benefits from successful purchase activity. VIP can later unlock discounts, priority support, early deal access, or storefront badges.

Core behavior:

- VIP rank is based on successful purchases only.
- Canceled or refunded orders do not contribute.
- Profile gets a VIP surface showing current tier, progress to next tier, benefits, and recent qualification context.
- Admin can manage tier thresholds and benefits.
- VIP benefits are represented in quote output and enforced during purchase.
- VIP discounts use the same resolver as campaigns and coupons so customers see one consistent price explanation.

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

### `order_discount_applications`

Stores the discount audit trail for successful orders.

Important fields:

- `id`
- `order_id`
- `order_item_id`
- `source_type`
- `source_id`
- `source_code`
- `label`
- `amount_points`
- `sort_order`
- `metadata_json`
- `created_at`

Rules:

- `source_type` supports `product_promotion`, `growth_campaign`, `vip`, and `coupon`.
- `source_id` links to the relevant promotion, campaign, VIP tier, or coupon when available.
- `source_code` stores human-readable identifiers such as coupon codes or tier codes.
- `amount_points` is the actual discount applied after clamping.
- Existing order and order item discount columns can remain for compatibility, but this table becomes the canonical audit trail for new growth discounts.

### `growth_notification_events`

Stores growth notification events before delivery to user-facing channels.

Important fields:

- `id`
- `event_key`
- `event_type`
- `target_type`
- `target_id`
- `audience_type`
- `payload_json`
- `status`
- `created_at`
- `processed_at`

Rules:

- `event_key` is unique and prevents duplicate notification runs.
- `event_type` initially supports `wishlist_stock_back`, `wishlist_promo_started`, `campaign_started`, `campaign_ending`, `vip_tier_changed`, and `review_moderated`.
- `audience_type` supports direct user IDs, wishlist followers, VIP tier users, or all signed-in users if needed later.
- `payload_json` contains render data only, not sensitive order payloads.

### `growth_notification_deliveries`

Tracks delivery attempts per user and channel.

Important fields:

- `id`
- `event_id`
- `user_id`
- `channel`
- `status`
- `site_message_id`
- `error_text`
- `delivered_at`
- `read_at`
- `created_at`

Rules:

- `channel` initially supports `inbox` and `push`; `discord` can be added later.
- Unique `(event_id, user_id, channel)` prevents duplicate channel delivery.
- Failed push delivery does not block inbox delivery.
- Delivery records allow admin to inspect what was sent without duplicating the actual inbox message model.

### `user_notification_preferences`

Stores coarse user preferences for growth notifications.

Important fields:

- `user_id`
- `wishlist_stock`
- `wishlist_promo`
- `campaigns`
- `vip`
- `reviews`
- `push_enabled`
- `updated_at`

Rules:

- Inbox is the default baseline channel for account-related notifications.
- Push delivery requires both an active push subscription and `push_enabled`.
- Transactional order messages remain outside these opt-out preferences unless an implementation explicitly moves them into this model.

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
- `GET /api/me/notification-preferences`
- `PUT /api/me/notification-preferences`

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
- `GET /api/admin/growth-notifications`
- `POST /api/admin/growth-notifications/test`

Access control:

- Customer endpoints require `requireAuth` when they mutate or expose user-specific data.
- Public review and campaign reads only expose approved or active public data.
- Admin review and campaign management require admin-level access.
- VIP tier management requires admin or owner-level access, matching existing admin action policy.

Notification integration:

- Use existing `site_messages` and inbox behavior for customer-visible messages.
- Use existing push subscription support where configured.
- Route sends through `enqueueGrowthNotification` and `deliverGrowthNotification` helpers so wishlist, campaign, VIP, and review events share idempotency and channel behavior.
- Store idempotency keys for notification events, such as `wishlist_stock_back:product_id:stock_version`, to prevent duplicate event creation.
- Store delivery rows per event, user, and channel to prevent duplicate user sends.
- Respect user notification preferences before push or campaign-style inbox sends.
- Keep required account/order messages outside marketing opt-outs unless explicitly migrated later.
- Discord notifications can be added later behind the same event interface.

Quote and purchase integration:

- Flash deal, limited drop, VIP, product promotion, and coupon discounts must be resolved server-side.
- Use one discount resolver for product quotes, product purchases, bundle quotes, and bundle purchases.
- Resolver input includes user ID, target type, target ID, quantity, selected product option, coupon code, and current time.
- Resolver output includes original price, each candidate discount, each applied discount, each rejected discount reason, final unit price, final total, and campaign/VIP eligibility metadata.
- Quote responses should expose enough detail for the UI to show why a discount did or did not apply.
- Purchase must re-run the resolver inside the transaction and reject if the customer-submitted quote assumptions are no longer valid.
- Successful purchases write `order_discount_applications` rows for every applied discount.
- Discount priority must be deterministic:
  1. Product promotion.
  2. Campaign discount.
  3. VIP discount.
  4. Coupon discount.
- Each discount step clamps final unit price at zero.
- Coupon usage increments and campaign quantity usage happen only after the final transaction validation succeeds.

## Discount Resolution Foundation

The growth work should improve discount handling as a shared server capability. The resolver is not a new promotion type by itself; it coordinates existing and new discount sources.

Responsibilities:

- Normalize product promotions, growth campaigns, VIP benefits, and coupons into one ordered list of candidate discounts.
- Validate applicability for product targets, bundle targets, selected product options, user state, active windows, quantity limits, coupon validity, and VIP tier state.
- Return rejected candidate discounts with machine-readable reasons so the UI can explain conflicts without guessing.
- Re-run inside purchase transactions and never trust a previously returned quote as final authority.
- Persist applied discounts to `order_discount_applications` for successful orders.
- Keep existing order total fields populated for compatibility with current history and admin screens.

Price explanation model:

- `original_unit_price_points`
- `quantity`
- `discounts_considered`
- `discounts_applied`
- `discounts_rejected`
- `final_unit_price_points`
- `final_total_points`
- `quote_expires_at` if the implementation needs short-lived quote freshness.

Stacking rules:

- Product promotion runs first because it is product-owned baseline pricing.
- Growth campaign runs second because it represents storefront urgency.
- VIP runs third because it is user entitlement.
- Coupon runs last because it is an explicit user-entered code.
- If a future admin setting needs a non-stackable rule, the resolver should make that rule explicit and return the rejected discount reason.

## Notification Delivery Foundation

The growth work should improve notification handling as a shared event pipeline. The app already has inbox/site messages and push subscriptions, so the foundation should add orchestration and audit rather than a parallel messaging system.

Responsibilities:

- Create one growth event per meaningful business event using a deterministic `event_key`.
- Resolve the audience from wishlist followers, VIP tiers, specific users, or campaign targets.
- Filter each recipient by notification preferences and channel availability.
- Deliver inbox messages as the baseline channel.
- Deliver push notifications only when push is configured, the user is subscribed, and the preference allows it.
- Record delivery status per recipient and channel.
- Allow failed channels to be retried without recreating the original event.

Initial event types:

- `wishlist_stock_back`: a followed product becomes available.
- `wishlist_promo_started`: a followed product gets an active promotion.
- `campaign_started`: a followed or targeted product enters an active campaign.
- `campaign_ending`: an active campaign is near its end time.
- `vip_tier_changed`: a user moves to a new VIP tier after purchase recalculation.
- `review_moderated`: a user's review is approved, hidden, or rejected.

Message rendering:

- Event payloads should store product, campaign, review, or tier references plus short display labels.
- Rendering should happen through a small server helper so inbox and push copy stay consistent.
- Push content should be shorter than inbox content and should link back to the same route.
- No sensitive purchased stock payloads should be stored in notification event payloads.

## Customer UX

Product cards and product detail:

- Show a follow or wishlist control for signed-in users.
- Guests can see the control but are routed to login or prompted to login before following.
- Show approved review average and count when available.
- Product detail includes a verified reviews section with empty, loading, and error states.
- If the current user has eligible purchases, show review submission entry points.
- Purchase panels show a compact discount breakdown when promotions, campaigns, VIP, or coupons affect the quote.
- Discount copy uses the resolver output instead of recomputing labels from frontend-only assumptions.

Profile:

- Add Wishlist, Reviews, and VIP surfaces.
- Wishlist shows followed products, stock status, active deal status, and quick links back to product detail.
- Reviews shows submitted reviews and moderation state.
- VIP shows current rank, progress to next rank, benefits, and concise recent qualification context.
- Add notification preferences for wishlist stock alerts, promotion alerts, campaign alerts, VIP updates, review updates, and push delivery.

Home and category pages:

- Show a Flash Deal shelf when active campaigns exist.
- Campaign cards link to product or bundle detail pages.
- Deal cards show timer, discount, availability, and sold-out or expired state.

## Admin UX

Add a Growth module to AdminV3 with six tabs:

- `Campaigns`: create, edit, enable, disable, and inspect flash deal or limited drop campaigns.
- `Reviews`: approve, hide, or reject reviews and inspect the order reference.
- `VIP`: manage tiers, thresholds, benefit copy, discount, priority support, and early access settings.
- `Wishlist Signals`: view most-followed products, out-of-stock demand, and products worth restocking or campaigning.
- `Discounts`: preview the server-side discount resolver for a product or bundle, inspect order discount applications, and surface discount stacking conflicts.
- `Notifications`: inspect growth notification events, delivery status, failed sends, and send a test notification to the current admin.

Admin module requirements:

- Keep operational density consistent with the existing AdminV3 style.
- Show validation errors inline.
- Make destructive actions explicit.
- Avoid nested card layouts.
- Do not expose VIP or campaign controls to roles that lack access.
- Do not duplicate existing coupon CRUD unless implementation later consolidates it intentionally; the Growth Discounts tab is for resolver preview, audit, and conflict visibility.

## Error And Edge Cases

- If a wishlisted product is hidden or deleted, customer wishlist views omit it while retaining the record for audit.
- Notification sends are idempotent per user, product, and event key.
- Notification event creation and channel delivery are separate, so a failed push send does not create duplicate inbox messages.
- Users who opt out of campaign or wishlist notifications do not receive those growth messages, except required account/order messages that remain outside this preference model.
- A user cannot review an order item that does not belong to them.
- A user cannot review an order item before the related order is completed.
- One order item can produce only one review.
- Admin can hide a review without deleting historical data.
- If a campaign expires between quote and purchase, purchase returns a campaign-expired error.
- If a limited drop limit is exhausted between quote and purchase, purchase returns a campaign-sold-out error.
- VIP calculation uses successful purchases only.
- VIP recalculation after purchase must not block order completion if only the cache update fails; a later recalculation can repair the snapshot.
- Price calculations must clamp at zero and return enough quote detail for the UI to explain applied discounts.
- Purchase rejects if quote assumptions are stale and the resolver output changes in a way that increases the total or invalidates campaign availability.
- Applied discount audit rows must match the final order totals.

## Testing And Verification

Backend tests:

- Wishlist create, list, delete, duplicate follow handling, and hidden product handling.
- Review eligibility, one-review-per-order-item, public approved-only reads, and admin moderation.
- Campaign active window filtering, target selection, quantity limit handling, and expired purchase rejection.
- VIP tier calculation from successful orders only.
- Quote and purchase discount priority for product promotion, campaign, VIP, and coupon.
- Discount resolver rejected-reason output for expired campaigns, exhausted campaigns, invalid coupons, ineligible VIP, and non-stackable future rules.
- Order discount audit rows for product, campaign, VIP, and coupon combinations.
- Growth notification event idempotency, delivery uniqueness, preference filtering, failed push handling, and inbox baseline delivery.
- Authorization checks for customer-owned resources and admin-only endpoints.

Frontend verification:

- `npm run build` in `client`.
- Product detail with wishlist state, review summary, review list, and eligible review submission.
- Profile Wishlist, Reviews, and VIP surfaces.
- Profile notification preference controls.
- Home or category Flash Deal shelf.
- AdminV3 Growth module tabs, including Discounts and Notifications.
- Mobile and desktop layouts for product detail, profile, and admin growth views.

Security checks:

- Users cannot review another user's order.
- Users cannot mutate another user's wishlist.
- Public review APIs do not leak hidden, rejected, or pending reviews.
- Admin growth endpoints enforce the intended roles.
- Notification logs do not expose sensitive order payloads or delivered digital stock.
- Discount preview endpoints do not allow users to inspect admin-only product or hidden campaign data.

## Implementation Notes

- Keep database helper logic in `server/db.js` only if it remains consistent with existing patterns. If growth helpers become too large, split them into a focused server lib after confirming local conventions.
- Keep route handlers small and validate request bodies with the existing zod validation approach.
- Reuse existing product card, product detail, profile, support, admin module, and fetch helper patterns.
- Build the discount resolver behind current quote and purchase helpers before adding campaign and VIP discounts broadly.
- Preserve current discount coupon and topup coupon semantics while routing product and bundle purchase discounts through the resolver.
- Build notification events as an outbox-style helper that writes events and deliveries before calling inbox or push helpers.
- Use stable event keys and delivery uniqueness constraints rather than relying only on application-level duplicate checks.
- Avoid broad customer redesign work during this feature pass.
- Avoid touching unrelated dirty worktree files.

## Risks

- Price discount stacking can create subtle regressions if not tested at quote and purchase levels.
- Migrating quote and purchase flows to a shared resolver can expose existing inconsistencies between product and bundle pricing.
- Notification event logs can grow quickly, so implementation may need retention or pagination from the start.
- Admin campaign controls can become too broad if early access, discounting, stock limits, and targeting are all implemented at once.
- VIP cache updates need clear recovery behavior so rank displays remain correct after failed recalculation.
- Existing Thai text encoding varies in some server files, so implementation should avoid broad rewrites around legacy strings.
