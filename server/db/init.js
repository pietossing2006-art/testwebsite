import crypto from 'node:crypto'
import { all, generateOrderRef, get, pool, query } from './pool.js'

export function initDb() {
  // no-op: init is async in Postgres version
}


export async function initDbPg() {
  await query(
    `CREATE TABLE IF NOT EXISTS users (
      id BIGSERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_head_admin BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_email_verified BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_type TEXT NOT NULL DEFAULT 'none'`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_secret TEXT`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_backup_codes JSONB`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS two_factor_confirmed_at TIMESTAMPTZ`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS users_username_uq ON users (username) WHERE username IS NOT NULL`)

  await query(
    `UPDATE users
     SET role = CASE
                 WHEN is_head_admin THEN 'owner'
                 WHEN is_admin THEN 'admin'
                 ELSE role
               END
     WHERE (role IS NULL OR role = '' OR role = 'user')
       AND (is_admin = true OR is_head_admin = true)`,
  )

  const owner = await get(`SELECT id FROM users WHERE role = 'owner' LIMIT 1`)
  if (!owner) {
    const firstAdmin = await get(`SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1`)
    if (firstAdmin?.id != null) {
      await query(`UPDATE users SET role = 'owner' WHERE id = $1`, [firstAdmin.id])
    }
  }

  await query(
    `CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      ip_address TEXT,
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_active_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ
    )`,
  )
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS ip_address TEXT`)
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS user_agent TEXT`)
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ NOT NULL DEFAULT now()`)
  await query(`ALTER TABLE sessions ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`)
  await query(`CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id BIGSERIAL PRIMARY KEY,
      actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      detail_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      ip_address TEXT,
      user_agent TEXT,
      status TEXT NOT NULL DEFAULT 'success',
      severity TEXT NOT NULL DEFAULT 'info',
      request_method TEXT,
      request_path TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT`)
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS user_agent TEXT`)
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'success'`)
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info'`)
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_method TEXT`)
  await query(`ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS request_path TEXT`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_action_idx ON audit_logs (action)`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs (entity_type, entity_id)`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_actor_idx ON audit_logs (actor_user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_severity_idx ON audit_logs (severity)`)
  await query(`CREATE INDEX IF NOT EXISTS audit_logs_status_idx ON audit_logs (status)`)

  await query(
    `CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS discord_account_links (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      discord_user_id TEXT NOT NULL UNIQUE,
      discord_username TEXT,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS discord_account_links_user_id_idx ON discord_account_links (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS discord_account_links_discord_user_id_idx ON discord_account_links (discord_user_id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS discord_link_codes (
      code_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL,
      claimed_at TIMESTAMPTZ,
      claimed_discord_user_id TEXT
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS discord_link_codes_user_id_idx ON discord_link_codes (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS discord_link_codes_expires_at_idx ON discord_link_codes (expires_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS categories (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      image_url TEXT,
      description TEXT
    )`,
  )

  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS description TEXT`)
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS parent_id BIGINT REFERENCES categories(id) ON DELETE SET NULL`)
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`)
  await query(`ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon TEXT`)
  await query(`CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON categories (parent_id)`)
  await query(`CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON categories (sort_order ASC, id ASC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS products (
      id BIGSERIAL PRIMARY KEY,
      category_id BIGINT NOT NULL REFERENCES categories(id),
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      price INTEGER NOT NULL,
      description TEXT,
      image_url TEXT,
      stock INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS highlights TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_url TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_text TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS manual_video_url TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS fulfillment_type TEXT NOT NULL DEFAULT 'digital_stock'`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_username_enabled BOOLEAN NOT NULL DEFAULT true`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_password_enabled BOOLEAN NOT NULL DEFAULT true`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_auth_key_enabled BOOLEAN NOT NULL DEFAULT true`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS farm_form_fields JSONB`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS product_options JSONB`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_unlimited_stock BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS is_hidden BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS gallery_images JSONB DEFAULT '[]'::jsonb`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS badge TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS sku TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS admin_notes TEXT`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS volume_pricing JSONB DEFAULT '[]'::jsonb`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS min_order_qty INTEGER NOT NULL DEFAULT 1`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS max_order_qty INTEGER`)
  await query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER NOT NULL DEFAULT 3`)

  await query(
    `CREATE TABLE IF NOT EXISTS product_promotions (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      title TEXT,
      discount_percent INTEGER,
      discount_amount_points INTEGER,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_promotions_product_idx ON product_promotions (product_id)`)
  await query(`CREATE INDEX IF NOT EXISTS product_promotions_active_idx ON product_promotions (is_active, starts_at, ends_at)`)

  await query(`ALTER TABLE product_promotions ALTER COLUMN product_id DROP NOT NULL`)
  await query(`ALTER TABLE product_promotions ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'product'`)
  await query(`ALTER TABLE product_promotions ADD COLUMN IF NOT EXISTS category_id BIGINT REFERENCES categories(id) ON DELETE SET NULL`)
  await query(`ALTER TABLE product_promotions ADD COLUMN IF NOT EXISTS min_spend_points INTEGER DEFAULT 0`)
  await query(`ALTER TABLE product_promotions ADD COLUMN IF NOT EXISTS max_discount_points INTEGER`)
  await query(`ALTER TABLE product_promotions ADD COLUMN IF NOT EXISTS badge_text TEXT`)
  await query(`ALTER TABLE product_promotions ADD COLUMN IF NOT EXISTS is_flash_sale BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_vip_tier_id BIGINT REFERENCES vip_tiers(id) ON DELETE SET NULL`)
  await query(`CREATE INDEX IF NOT EXISTS product_promotions_scope_idx ON product_promotions (scope, category_id, is_active)`)

  // Migrate VIP tiers discounts to maximum 5%
  await query(`
    UPDATE vip_tiers SET discount_percent = 1, benefits_json = '["ส่วนลดสินค้า 1%", "ตราสัญลักษณ์ VIP Bronze"]'::jsonb WHERE code = 'bronze';
    UPDATE vip_tiers SET discount_percent = 2, benefits_json = '["ส่วนลดสินค้า 2%", "ช่องทางซัพพอร์ตพิเศษ", "ตราสัญลักษณ์ VIP Silver"]'::jsonb WHERE code = 'silver';
    UPDATE vip_tiers SET discount_percent = 3, benefits_json = '["ส่วนลดสินค้า 3%", "ซัพพอร์ตด่วนพิเศษ Priority", "สิทธิ์ Flash Sale ก่อน 15 นาที", "ตราสัญลักษณ์ VIP Gold"]'::jsonb WHERE code = 'gold';
    UPDATE vip_tiers SET discount_percent = 4, benefits_json = '["ส่วนลดสินค้า 4%", "ซัพพอร์ตระดับ Exclusive", "สิทธิ์ Flash Sale ก่อน 30 นาที", "ตราสัญลักษณ์ VIP Platinum"]'::jsonb WHERE code = 'platinum';
    UPDATE vip_tiers SET discount_percent = 5, benefits_json = '["ส่วนลดสินค้า 5% ทุกรายการ (สูงสุด)", "ซัพพอร์ตส่วนตัว 24 ชม.", "สิทธิ์สินค้าลิมิเต็ดก่อน 1 ชม.", "ตราสัญลักษณ์ VIP Diamond หรูหรา"]'::jsonb WHERE code = 'diamond';
    UPDATE vip_tiers SET discount_percent = LEAST(5, GREATEST(0, discount_percent)) WHERE discount_percent > 5;
  `)

  await query(
    `CREATE TABLE IF NOT EXISTS discount_coupons (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      title TEXT,
      discount_percent INTEGER,
      discount_amount_points INTEGER,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS discount_coupons_active_idx ON discount_coupons (is_active, expires_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS wallets (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      balance INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS topups (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      amount INTEGER NOT NULL,
      amount_points INTEGER,
      method TEXT,
      provider TEXT,
      provider_ref TEXT,
      reference TEXT,
      approved_by BIGINT REFERENCES users(id),
      status TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )

  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS topups_method_reference_uq
     ON topups (method, reference)
     WHERE reference IS NOT NULL`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS transactions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      points INTEGER NOT NULL,
      ref_type TEXT NOT NULL,
      ref_id TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (ref_type, ref_id)
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS webhook_logs (
      id BIGSERIAL PRIMARY KEY,
      provider TEXT NOT NULL,
      event_id TEXT NOT NULL,
      received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ,
      payload TEXT NOT NULL,
      UNIQUE (provider, event_id)
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS coupons (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      points INTEGER NOT NULL,
      max_uses INTEGER,
      used_count INTEGER NOT NULL DEFAULT 0,
      expires_at TIMESTAMPTZ,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS coupon_redemptions (
      id BIGSERIAL PRIMARY KEY,
      coupon_id BIGINT NOT NULL REFERENCES coupons(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      redeemed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (coupon_id, user_id)
    )`,
  )

  await query('CREATE INDEX IF NOT EXISTS coupon_redemptions_user_idx ON coupon_redemptions (user_id)')
  await query('CREATE INDEX IF NOT EXISTS coupons_active_idx ON coupons (is_active, expires_at)')

  await query(
    `CREATE TABLE IF NOT EXISTS orders (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      total_points INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'paid',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal_points INTEGER`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS promo_discount_points INTEGER`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount_points INTEGER`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT`)
  await query(`ALTER TABLE orders ADD COLUMN IF NOT EXISTS ref TEXT`)
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS orders_ref_unique_idx ON orders (ref) WHERE ref IS NOT NULL`)
  // Backfill refs for existing orders
  const nullRefOrders = await all(`SELECT id FROM orders WHERE ref IS NULL LIMIT 5000`)
  for (const o of nullRefOrders) {
    await query(`UPDATE orders SET ref = $2 WHERE id = $1 AND ref IS NULL`, [o.id, generateOrderRef()])
  }

  await query(
    `CREATE TABLE IF NOT EXISTS order_items (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      qty INTEGER NOT NULL,
      unit_price_points INTEGER NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )

  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS unit_price_original_points INTEGER`)
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS promo_discount_points INTEGER`)
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS coupon_discount_points INTEGER`)
  await query(`ALTER TABLE order_items ADD COLUMN IF NOT EXISTS product_option JSONB`)

  await query(
    `CREATE TABLE IF NOT EXISTS digital_stock_items (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      reserved_order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reserved_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    )`,
  )

  await query(`CREATE INDEX IF NOT EXISTS digital_stock_items_product_status_idx ON digital_stock_items (product_id, status)`)

  await query(
    `CREATE TABLE IF NOT EXISTS stock_pools (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'digital_code',
      quantity_remaining INTEGER,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS stock_pools_active_idx ON stock_pools (is_active, id)`)
  await query(`CREATE INDEX IF NOT EXISTS stock_pools_kind_idx ON stock_pools (kind, id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS stock_pool_items (
      id BIGSERIAL PRIMARY KEY,
      pool_id BIGINT NOT NULL REFERENCES stock_pools(id) ON DELETE CASCADE,
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      reserved_order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reserved_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS stock_pool_items_pool_status_idx ON stock_pool_items (pool_id, status, id)`)
  await query(`CREATE INDEX IF NOT EXISTS stock_pool_items_reserved_order_item_idx ON stock_pool_items (reserved_order_item_id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS product_option_items (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      option_id TEXT NOT NULL,
      label TEXT NOT NULL,
      value_text TEXT,
      price_points INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS product_option_items_product_option_id_uq
     ON product_option_items (product_id, option_id)`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_option_items_product_sort_idx ON product_option_items (product_id, sort_order, id)`)

  await query(
    `CREATE TABLE IF NOT EXISTS product_option_stock_bindings (
      id BIGSERIAL PRIMARY KEY,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      product_option_id TEXT,
      pool_id BIGINT NOT NULL REFERENCES stock_pools(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS product_option_stock_bindings_uq
     ON product_option_stock_bindings (product_id, COALESCE(product_option_id, ''))`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_option_stock_bindings_pool_idx ON product_option_stock_bindings (pool_id)`)
  await query(`CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id)`)
  await query(`CREATE INDEX IF NOT EXISTS orders_user_id_idx ON orders (user_id)`)
  await query(`CREATE INDEX IF NOT EXISTS orders_status_created_at_idx ON orders (status, created_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS deliveries (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      stock_item_id BIGINT REFERENCES digital_stock_items(id) ON DELETE SET NULL,
      status TEXT NOT NULL DEFAULT 'pending_claim',
      payload_masked TEXT,
      payload TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      claimed_at TIMESTAMPTZ
    )`,
  )

  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS mystery_stock_item_id BIGINT`)
  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS stock_pool_item_id BIGINT`)
  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_name TEXT`)
  // 'no_prize' marks a mystery-box "salt" draw — a real, terminal outcome (customer got nothing this
  // round), distinct from a delivery that simply hasn't been fulfilled/claimed yet.
  await query(`ALTER TABLE deliveries ADD COLUMN IF NOT EXISTS delivery_kind TEXT`)

  await query(
    `CREATE TABLE IF NOT EXISTS farm_requests (
      id BIGSERIAL PRIMARY KEY,
      delivery_id BIGINT NOT NULL UNIQUE REFERENCES deliveries(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id),
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      username TEXT,
      password TEXT,
      auth_key TEXT,
      form_data JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      cancel_note TEXT,
      cancelled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      fulfilled_at TIMESTAMPTZ
    )`,
  )

  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS cancel_note TEXT`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS uid TEXT`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS uid_confirmed BOOLEAN NOT NULL DEFAULT false`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS form_data JSONB`)

  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS assigned_booster_id BIGINT REFERENCES users(id)`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ`)
  await query(`ALTER TABLE farm_requests ADD COLUMN IF NOT EXISTS product_option JSONB`)

  await query(`CREATE INDEX IF NOT EXISTS farm_requests_status_idx ON farm_requests (status, created_at)`)
  await query(`CREATE INDEX IF NOT EXISTS farm_requests_assignee_idx ON farm_requests (assigned_booster_id, status, created_at)`)

  await query(
    `CREATE TABLE IF NOT EXISTS booster_action_logs (
      id BIGSERIAL PRIMARY KEY,
      booster_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      farm_request_id BIGINT NOT NULL REFERENCES farm_requests(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      meta JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS booster_action_logs_booster_idx ON booster_action_logs (booster_id, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS booster_action_logs_request_idx ON booster_action_logs (farm_request_id, created_at DESC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS support_tickets (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      subject TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      assigned_to BIGINT REFERENCES users(id) ON DELETE SET NULL,
      first_response_at TIMESTAMPTZ,
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ,
      last_message_at TIMESTAMPTZ
    )`,
  )
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS first_response_at TIMESTAMPTZ`)
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ`)
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS order_id BIGINT REFERENCES orders(id) ON DELETE SET NULL`)
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal'`)
  await query(`ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'general'`)
  await query(`CREATE INDEX IF NOT EXISTS support_tickets_user_idx ON support_tickets (user_id, status, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS support_tickets_status_idx ON support_tickets (status, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS support_tickets_assigned_idx ON support_tickets (assigned_to, status, created_at DESC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS support_ticket_messages (
      id BIGSERIAL PRIMARY KEY,
      ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
      sender_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      sender_role TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS attachments JSONB`)
  await query(`ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN NOT NULL DEFAULT false`)
  await query(`CREATE INDEX IF NOT EXISTS support_ticket_messages_ticket_idx ON support_ticket_messages (ticket_id, created_at ASC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS mystery_box_prizes (
      id BIGSERIAL PRIMARY KEY,
      box_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      prize_kind TEXT NOT NULL DEFAULT 'product',
      prize_product_id BIGINT REFERENCES products(id),
      weight INTEGER NOT NULL DEFAULT 1,
      remaining INTEGER NOT NULL DEFAULT 0,
      is_active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )

  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_kind TEXT NOT NULL DEFAULT 'product'`)
  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_product_id BIGINT`)
  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_name TEXT`)
  await query(`ALTER TABLE mystery_box_prizes ADD COLUMN IF NOT EXISTS prize_image_url TEXT`)
  await query(`ALTER TABLE mystery_box_prizes ALTER COLUMN prize_product_id DROP NOT NULL`)
  await query(`ALTER TABLE mystery_box_prizes ALTER COLUMN weight TYPE NUMERIC(12,4) USING weight::NUMERIC`)
  await query(`ALTER TABLE mystery_box_prizes ALTER COLUMN weight SET DEFAULT 1`)

  await query(`DROP INDEX IF EXISTS mystery_box_prizes_box_prize_uq`)
  await query(`DROP INDEX IF EXISTS mystery_box_prizes_box_kind_product_uq`)
  await query(
    `CREATE UNIQUE INDEX IF NOT EXISTS mystery_box_prizes_box_kind_product_uq
     ON mystery_box_prizes (box_product_id, prize_kind, COALESCE(prize_product_id, -1), COALESCE(prize_name, ''))`,
  )
  await query(`CREATE INDEX IF NOT EXISTS mystery_box_prizes_box_active_idx ON mystery_box_prizes (box_product_id, is_active, remaining)`)

  await query(
    `CREATE TABLE IF NOT EXISTS mystery_box_stock_items (
      id BIGSERIAL PRIMARY KEY,
      box_product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      prize_id BIGINT NOT NULL REFERENCES mystery_box_prizes(id) ON DELETE CASCADE,
      prize_product_id BIGINT REFERENCES products(id),
      payload TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'available',
      reserved_order_item_id BIGINT REFERENCES order_items(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      reserved_at TIMESTAMPTZ,
      delivered_at TIMESTAMPTZ
    )`,
  )
  await query(`ALTER TABLE mystery_box_stock_items ADD COLUMN IF NOT EXISTS image_url TEXT`)

  await query(
    `CREATE INDEX IF NOT EXISTS mystery_box_stock_items_prize_status_idx
     ON mystery_box_stock_items (prize_id, status, id)`,
  )
  await query(
    `CREATE INDEX IF NOT EXISTS mystery_box_stock_items_box_status_idx
     ON mystery_box_stock_items (box_product_id, status, id)`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS site_message_dismissals (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id BIGINT NOT NULL REFERENCES site_messages(id) ON DELETE CASCADE,
      dismissed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, message_id)
    )`,
  )

  await query(
    `CREATE TABLE IF NOT EXISTS workflow_automation_rules (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      trigger_type TEXT NOT NULL,
      trigger_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      action_type TEXT NOT NULL,
      action_config JSONB NOT NULL DEFAULT '{}'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT true,
      last_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS workflow_automation_rules_active_idx ON workflow_automation_rules (is_active, id)`) 

  await query(
    `CREATE TABLE IF NOT EXISTS workflow_automation_events (
      id BIGSERIAL PRIMARY KEY,
      rule_id BIGINT REFERENCES workflow_automation_rules(id) ON DELETE SET NULL,
      dedupe_key TEXT NOT NULL,
      ref_module TEXT NOT NULL,
      ref_id BIGINT,
      severity TEXT NOT NULL DEFAULT 'medium',
      title TEXT NOT NULL,
      message TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE UNIQUE INDEX IF NOT EXISTS workflow_automation_events_dedupe_uq ON workflow_automation_events (dedupe_key)`)
  await query(`CREATE INDEX IF NOT EXISTS workflow_automation_events_created_idx ON workflow_automation_events (created_at DESC, id DESC)`)

  await query(`CREATE INDEX IF NOT EXISTS deliveries_user_status_idx ON deliveries (user_id, status)`)
  await query(`CREATE INDEX IF NOT EXISTS deliveries_status_idx ON deliveries (status)`)

  await query(
    `CREATE TABLE IF NOT EXISTS announcements (
      id BIGSERIAL PRIMARY KEY,
      title TEXT NOT NULL DEFAULT '',
      text TEXT NOT NULL,
      link TEXT NOT NULL DEFAULT '',
      bg TEXT NOT NULL DEFAULT '',
      icon TEXT NOT NULL DEFAULT '',
      enabled BOOLEAN NOT NULL DEFAULT true,
      push_to_inbox BOOLEAN NOT NULL DEFAULT false,
      sort_order INT NOT NULL DEFAULT 0,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS announcements_sort_idx ON announcements (sort_order ASC, id ASC)`)
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT ''`).catch(() => {})
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS start_at TIMESTAMPTZ`).catch(() => {})
  await query(`ALTER TABLE announcements ADD COLUMN IF NOT EXISTS end_at TIMESTAMPTZ`).catch(() => {})

  await query(
    `CREATE TABLE IF NOT EXISTS site_messages (
      id BIGSERIAL PRIMARY KEY,
      sender_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      target_type TEXT NOT NULL DEFAULT 'global',
      target_user_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS site_messages_target_type_idx ON site_messages (target_type, created_at DESC)`)
  await query(`CREATE INDEX IF NOT EXISTS site_messages_target_user_idx ON site_messages (target_user_id, created_at DESC)`)

  await query(
    `CREATE TABLE IF NOT EXISTS site_message_reads (
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      message_id BIGINT NOT NULL REFERENCES site_messages(id) ON DELETE CASCADE,
      read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (user_id, message_id)
    )`,
  )

  // ── Staff clock-in/out ──
  await query(
    `CREATE TABLE IF NOT EXISTS staff_clock_sessions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      clock_in TIMESTAMPTZ NOT NULL DEFAULT now(),
      clock_out TIMESTAMPTZ,
      auto_clock_out_at TIMESTAMPTZ,
      note TEXT
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS staff_clock_sessions_user_active_idx ON staff_clock_sessions (user_id, clock_out NULLS FIRST, clock_in DESC)`)
  await query(`ALTER TABLE staff_clock_sessions ADD COLUMN IF NOT EXISTS auto_clock_out_at TIMESTAMPTZ`)

  // ── Staff notifications ──
  await query(
    `CREATE TABLE IF NOT EXISTS staff_notifications (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL DEFAULT 'info',
      title TEXT NOT NULL,
      body TEXT NOT NULL DEFAULT '',
      link TEXT,
      is_read BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS staff_notifications_user_read_idx ON staff_notifications (user_id, is_read, created_at DESC)`)

  // ── Web Push subscriptions ──
  await query(
    `CREATE TABLE IF NOT EXISTS push_subscriptions (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint TEXT NOT NULL UNIQUE,
      keys_json JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id)`)

  // ── Product Bundles ──
  await query(
    `CREATE TABLE IF NOT EXISTS product_bundles (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      description TEXT,
      image_url TEXT,
      bundle_price INTEGER NOT NULL,
      is_active BOOLEAN NOT NULL DEFAULT true,
      is_hidden BOOLEAN NOT NULL DEFAULT false,
      sort_order INTEGER NOT NULL DEFAULT 0,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS product_bundles_active_idx ON product_bundles (is_active, is_hidden, sort_order)`)

  await query(
    `CREATE TABLE IF NOT EXISTS bundle_items (
      id BIGSERIAL PRIMARY KEY,
      bundle_id BIGINT NOT NULL REFERENCES product_bundles(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      qty INTEGER NOT NULL DEFAULT 1,
      product_option_id TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
  )
  await query(`CREATE INDEX IF NOT EXISTS bundle_items_bundle_idx ON bundle_items (bundle_id, sort_order)`)

  await query(`
    CREATE TABLE IF NOT EXISTS wishlist_items (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      notify_stock BOOLEAN NOT NULL DEFAULT true,
      notify_promo BOOLEAN NOT NULL DEFAULT true,
      notify_campaign BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (user_id, product_id)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS wishlist_items_product_idx ON wishlist_items (product_id, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS product_reviews (
      id BIGSERIAL PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      product_id BIGINT NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
      reviewer_name TEXT,
      rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      admin_note TEXT,
      moderated_by BIGINT REFERENCES users(id),
      moderated_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (order_item_id)
    )
  `)
  await query(`ALTER TABLE product_reviews ADD COLUMN IF NOT EXISTS reviewer_name TEXT`)
  await query(`CREATE INDEX IF NOT EXISTS product_reviews_product_status_idx ON product_reviews (product_id, status, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_campaigns (
      id BIGSERIAL PRIMARY KEY,
      kind TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      badge_text TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      starts_at TIMESTAMPTZ,
      ends_at TIMESTAMPTZ,
      discount_type TEXT NOT NULL DEFAULT 'none',
      discount_value INTEGER,
      quantity_limit INTEGER,
      quantity_used INTEGER NOT NULL DEFAULT 0,
      vip_early_access_tier TEXT,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_campaigns_active_idx ON growth_campaigns (is_active, starts_at, ends_at)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_campaign_targets (
      id BIGSERIAL PRIMARY KEY,
      campaign_id BIGINT NOT NULL REFERENCES growth_campaigns(id) ON DELETE CASCADE,
      target_type TEXT NOT NULL,
      target_id BIGINT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_campaign_targets_lookup_idx ON growth_campaign_targets (target_type, target_id, campaign_id)`)

  await query(`
    CREATE TABLE IF NOT EXISTS vip_tiers (
      id BIGSERIAL PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      threshold_points_spent INTEGER NOT NULL DEFAULT 0,
      discount_percent INTEGER NOT NULL DEFAULT 0,
      priority_support BOOLEAN NOT NULL DEFAULT false,
      early_access_minutes INTEGER NOT NULL DEFAULT 0,
      badge_label TEXT NOT NULL DEFAULT '',
      is_active BOOLEAN NOT NULL DEFAULT true,
      benefits_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS vip_user_snapshots (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      tier_id BIGINT REFERENCES vip_tiers(id),
      points_spent INTEGER NOT NULL DEFAULT 0,
      next_tier_id BIGINT REFERENCES vip_tiers(id),
      next_threshold_points INTEGER,
      calculated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS order_discount_applications (
      id BIGSERIAL PRIMARY KEY,
      order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_item_id BIGINT REFERENCES order_items(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id BIGINT,
      source_code TEXT,
      label TEXT NOT NULL,
      amount_points INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      metadata_json JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS order_discount_applications_order_idx ON order_discount_applications (order_id, sort_order, id)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_notification_events (
      id BIGSERIAL PRIMARY KEY,
      event_key TEXT NOT NULL UNIQUE,
      event_type TEXT NOT NULL,
      target_type TEXT,
      target_id BIGINT,
      audience_type TEXT NOT NULL DEFAULT 'direct',
      payload_json JSONB,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_notification_events_created_idx ON growth_notification_events (created_at DESC, id DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS growth_notification_deliveries (
      id BIGSERIAL PRIMARY KEY,
      event_id BIGINT NOT NULL REFERENCES growth_notification_events(id) ON DELETE CASCADE,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      site_message_id BIGINT REFERENCES site_messages(id) ON DELETE SET NULL,
      error_text TEXT,
      delivered_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (event_id, user_id, channel)
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS growth_notification_deliveries_user_idx ON growth_notification_deliveries (user_id, created_at DESC)`)

  await query(`
    CREATE TABLE IF NOT EXISTS user_notification_preferences (
      user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      wishlist_stock BOOLEAN NOT NULL DEFAULT true,
      wishlist_promo BOOLEAN NOT NULL DEFAULT true,
      campaigns BOOLEAN NOT NULL DEFAULT true,
      vip BOOLEAN NOT NULL DEFAULT true,
      reviews BOOLEAN NOT NULL DEFAULT true,
      push_enabled BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  await query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      email TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      expires_at TIMESTAMPTZ NOT NULL
    )
  `)
  await query(`CREATE INDEX IF NOT EXISTS password_reset_tokens_expires_at_idx ON password_reset_tokens (expires_at)`)

  try {
    await migrateDigitalStockToPools()
  } catch (e) {
    console.error('[stock-migration] Failed (non-fatal):', e?.message ?? e)
  }
}

// ── Stock Unification: helpers ──


export async function migrateDigitalStockToPools() {
  const productsToMigrate = await all(
    `SELECT DISTINCT dsi.product_id
     FROM digital_stock_items dsi
     WHERE NOT EXISTS (
       SELECT 1 FROM product_option_stock_bindings b
       WHERE b.product_id = dsi.product_id AND b.product_option_id IS NULL
     )`,
  )
  if (productsToMigrate.length === 0) return { migrated: 0, products: 0 }

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    let totalMigrated = 0
    for (const row of productsToMigrate) {
      const pid = row.product_id

      const poolRes = await client.query(
        `INSERT INTO stock_pools (name, kind, is_active)
         VALUES ($1, 'digital_code', true)
         RETURNING id`,
        [`auto:product:${pid}`],
      )
      const poolId = poolRes.rows[0].id

      await client.query(
        `INSERT INTO product_option_stock_bindings (product_id, product_option_id, pool_id)
         VALUES ($1, NULL, $2)
         ON CONFLICT (product_id, COALESCE(product_option_id, ''))
         DO NOTHING`,
        [pid, poolId],
      )

      const copyRes = await client.query(
        `INSERT INTO stock_pool_items (pool_id, payload, status, reserved_order_item_id, created_at, reserved_at, delivered_at)
         SELECT $1, payload, status, reserved_order_item_id, created_at, reserved_at, delivered_at
         FROM digital_stock_items
         WHERE product_id = $2`,
        [poolId, pid],
      )
      totalMigrated += copyRes.rowCount || 0
    }

    await client.query('COMMIT')
    console.log(`[stock-migration] Migrated ${totalMigrated} items across ${productsToMigrate.length} products`)
    return { migrated: totalMigrated, products: productsToMigrate.length }
  } catch (e) {
    try {
      await client.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client.release()
  }
}


export async function seedDb() {
  const row = await get('SELECT COUNT(*)::int AS c FROM categories')
  if ((row?.c ?? 0) > 0) return

  await query(
    `INSERT INTO categories (name, slug, image_url)
     VALUES
       ($1, $2, $3),
       ($4, $5, $6),
       ($7, $8, $9),
       ($10, $11, $12)
     ON CONFLICT (slug) DO NOTHING`,
    [
      'สินค้าแนะนำ',
      'featured',
      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&w=1200&q=60',
      'อุปกรณ์เกมมิ่ง',
      'gaming',
      'https://images.unsplash.com/photo-1603481546579-65d935ba9cdd?auto=format&fit=crop&w=1200&q=60',
      'ไอเท็มดิจิทัล',
      'digital',
      'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&w=1200&q=60',
      'สินค้าลิมิเต็ด',
      'limited',
      'https://images.unsplash.com/photo-1511379938547-c1f69419868d?auto=format&fit=crop&w=1200&q=60',
    ],
  )

  const categories = await all('SELECT id, slug FROM categories')
  const catId = Object.fromEntries(categories.map((c) => [c.slug, c.id]))

  await query(
    `INSERT INTO products (category_id, name, slug, price, description, image_url, stock)
     VALUES
       ($1, $2, $3, $4, $5, $6, $7),
       ($8, $9, $10, $11, $12, $13, $14),
       ($15, $16, $17, $18, $19, $20, $21),
       ($22, $23, $24, $25, $26, $27, $28),
       ($29, $30, $31, $32, $33, $34, $35),
       ($36, $37, $38, $39, $40, $41, $42)
     ON CONFLICT (slug) DO NOTHING`,
    [
      catId.featured,
      'Neon Mouse Pro',
      'neon-mouse-pro',
      799,
      'เมาส์เกมมิ่งไฟ RGB ตอบสนองไว ดีไซน์นีออน',
      'https://images.unsplash.com/photo-1527814050087-3793815479db?auto=format&fit=crop&w=1400&q=60',
      75,
      catId.gaming,
      'Keyboard Vortex',
      'keyboard-vortex',
      1290,
      'คีย์บอร์ดแมคคานิคอล สวิตช์นุ่ม เสียงแน่น',
      'https://images.unsplash.com/photo-1541140134513-85a161dc4a00?auto=format&fit=crop&w=1400&q=60',
      18,
      catId.digital,
      'Premium Theme Pack',
      'premium-theme-pack',
      199,
      'ธีม UI โทนดำ-นีออน (ดาวน์โหลดทันที)',
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1400&q=60',
      999,
      catId.limited,
      'Limited Hoodie Black',
      'limited-hoodie-black',
      1490,
      'ฮู้ดดี้ลิมิเต็ด โทนดำลายเรืองแสง',
      'https://images.unsplash.com/photo-1520975661595-6453be3f7070?auto=format&fit=crop&w=1400&q=60',
      5,
      catId.featured,
      'Mystery Box',
      'mystery-box',
      399,
      'กล่องสุ่มสินค้า มูลค่าเกินราคา',
      'https://images.unsplash.com/photo-1512511708753-3150cd5a66aa?auto=format&fit=crop&w=1400&q=60',
      33,
      catId.gaming,
      'Headset Pulse',
      'headset-pulse',
      990,
      'หูฟังเกมมิ่งเสียงคมชัด ไมค์ตัดเสียงรบกวน',
      'https://images.unsplash.com/photo-1583394838336-acd977736f90?auto=format&fit=crop&w=1400&q=60',
      12,
    ],
  )
}

