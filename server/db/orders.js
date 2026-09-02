import crypto from 'node:crypto'
import { resolveDiscountQuote } from '../lib/growthDiscounts.js'
import { all, generateOrderRef, get, getAppSettingJson, pool, query, upsertAppSettingJson } from './pool.js'
import { recountProductStockFromPools } from './stock.js'
import { assertBundlePurchasable, buildBundleQuote, computeMysteryEffectiveWeights, drawLinkedProductPrize, drawProductPrize, drawSaltPrize, findBundleStockPool, getBundleItemQty, getBundleWithItems, getProductById, pickWeightedIndex, requireProductOption, resolveProductOption, secureRandom01 } from './catalog.js'
import { campaignToDiscountCandidate, computeDiscountedUnitPrice, couponToDiscountCandidate, getActivePromotionForProduct, getMyVip, insertOrderDiscountApplications, listActiveGrowthCampaigns, lockAndValidateDiscountCoupon, promotionToDiscountCandidate, readAndValidateDiscountCoupon, vipToDiscountCandidate, volumePricingToDiscountCandidate } from './growth.js'
import { createStaffNotification, logAuditEvent, logBoosterAction, sendPushToUser } from './support.js'

export function maskPayload(payload) {
  const s = String(payload ?? '').trim()
  if (!s) return '••••'
  const head = s.slice(0, Math.min(4, s.length))
  return `${head}••••••••`
}


function normalizeFarmFormFields(product) {
  if (Array.isArray(product?.farm_form_fields)) {
    return product.farm_form_fields.map((field, index) => {
      const id = typeof field?.id === 'string' && field.id.trim() ? field.id.trim() : `field_${index + 1}`
      const label = typeof field?.label === 'string' && field.label.trim() ? field.label.trim() : `Field ${index + 1}`
      const type = field?.type === 'checkbox' ? 'checkbox' : 'text'
      const required = Boolean(field?.required)
      return { id, label, type, required }
    })
  }

  const fields = []
  if (product?.farm_form_username_enabled !== false) {
    fields.push({ id: 'username', label: 'Username', type: 'text', required: true })
  }
  if (product?.farm_form_password_enabled !== false) {
    fields.push({ id: 'password', label: 'Password', type: 'text', required: true })
  }
  if (product?.farm_form_auth_key_enabled !== false) {
    fields.push({ id: 'auth_key', label: 'Auth Key', type: 'text', required: false })
  }
  return fields
}


export async function purchaseUidProduct({ userId, productId, qty, uid, uidConfirmed, couponCode }) {
  const userIdNum = Number(userId)
  const productIdNum = Number(productId)
  const qtyNum = Number(qty)
  const uidText = String(uid ?? '').trim()
  if (!Number.isFinite(userIdNum)) throw new Error('invalid_user_id')
  if (!Number.isFinite(productIdNum)) throw new Error('invalid_product_id')
  if (!Number.isFinite(qtyNum) || qtyNum <= 0 || qtyNum > 10) throw new Error('invalid_qty')
  if (!uidText) throw new Error('invalid_uid')
  if (!Boolean(uidConfirmed)) throw new Error('uid_not_confirmed')

  const { productOptionId } = arguments?.[0] ?? {}
  const product = await getProductById(productIdNum)
  if (!product) throw new Error('product_not_found')

  const selectedOption = requireProductOption({ product, productOptionId })

  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice <= 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const promo = await getActivePromotionForProduct(client, productIdNum)
    const promoPrice = computeDiscountedUnitPrice({
      unitPrice: originalUnitPrice,
      percent: promo?.discount_percent,
      amount: promo?.discount_amount_points,
    })
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const couponPrice = computeDiscountedUnitPrice({
      unitPrice: promoPrice.finalUnitPrice,
      percent: coupon?.discount_percent,
      amount: coupon?.discount_amount_points,
    })

    const unitPrice = couponPrice.finalUnitPrice
    const subtotal = originalUnitPrice * qtyNum
    const promoDiscountTotal = promoPrice.discountPoints * qtyNum
    const couponDiscountTotal = couponPrice.discountPoints * qtyNum
    const total = unitPrice * qtyNum

    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [userIdNum])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [userIdNum],
    )

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [userIdNum, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (
         order_id, product_id, qty,
         unit_price_points, unit_price_original_points,
         promo_discount_points, coupon_discount_points,
         product_option
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        orderId,
        productIdNum,
        qtyNum,
        unitPrice,
        originalUnitPrice,
        promoPrice.discountPoints,
        couponPrice.discountPoints,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const orderItemId = orderItemRes.rows[0].id

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [userIdNum, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, userIdNum],
    )

    if (coupon?.id) {
      await client.query('UPDATE discount_coupons SET used_count = COALESCE(used_count, 0) + 1, updated_at = now() WHERE id = $1', [coupon.id])
    }

    const deliveryRes = await client.query(
      `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_item_id, status, payload_masked, payload)
       VALUES ($1, $2, $3, $4, NULL, 'pending_fulfillment', $5, NULL)
       RETURNING id`,
      [userIdNum, orderId, orderItemId, productIdNum, 'รอดำเนินการ'],
    )
    const deliveryId = deliveryRes.rows[0].id

    const farmRes = await client.query(
      `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, uid, uid_confirmed, status, product_option)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', $8::jsonb)
       RETURNING id`,
      [deliveryId, userIdNum, productIdNum, orderId, orderItemId, uidText, true, selectedOption ? JSON.stringify(selectedOption) : null],
    )
    const farmRequestId = farmRes.rows[0]?.id

    await client.query('COMMIT')

    if (farmRequestId) autoAssignFarmRequest(farmRequestId).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries: [{ id: deliveryId, masked: 'รอดำเนินการ' }],
    }
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


export async function purchaseDigitalProduct({ userId, productId, qty, couponCode }) {
  const uid = Number(userId)
  const pid = Number(productId)
  const q = Number(qty)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 999) throw new Error('invalid_qty')

  const { productOptionId } = arguments?.[0] ?? {}

  const product = await getProductById(pid)
  if (!product) throw new Error('product_not_found')
  const selectedOption = requireProductOption({ product, productOptionId })

  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice < 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const promo = await getActivePromotionForProduct(client, pid)
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const campaigns = await listActiveGrowthCampaigns({ targetType: 'product', targetId: pid })
    const vip = await getMyVip(uid).catch(() => null)
    const candidates = [
      promotionToDiscountCandidate(promo),
      ...(campaigns.campaigns || []).map(campaignToDiscountCandidate),
      volumePricingToDiscountCandidate(product, q),
      vipToDiscountCandidate(vip),
      couponToDiscountCandidate(coupon),
    ].filter(Boolean)
    const resolved = resolveDiscountQuote({
      targetType: 'product',
      targetId: pid,
      originalUnitPricePoints: originalUnitPrice,
      quantity: q,
      candidates,
    })

    const unitPrice = resolved.final_unit_price_points
    const total = resolved.final_total_points
    const subtotal = originalUnitPrice * q
    const promoDiscount = resolved.discounts_applied.find((d) => d.source_type === 'product_promotion')?.amount_points || 0
    const couponDiscount = resolved.discounts_applied.find((d) => d.source_type === 'coupon')?.amount_points || 0
    const promoDiscountTotal = promoDiscount * q
    const couponDiscountTotal = couponDiscount * q

    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [uid])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    const optId = selectedOption?.id == null ? null : String(selectedOption.id)
    let poolId = null
    if (optId != null) {
      const binding = await client.query(
        `SELECT pool_id FROM product_option_stock_bindings
         WHERE product_id = $1 AND product_option_id = $2 LIMIT 1`,
        [pid, optId],
      )
      poolId = binding.rows?.[0]?.pool_id != null ? Number(binding.rows[0].pool_id) : null
    }
    if (!Number.isFinite(poolId)) {
      const binding = await client.query(
        `SELECT pool_id FROM product_option_stock_bindings
         WHERE product_id = $1 AND product_option_id IS NULL LIMIT 1`,
        [pid],
      )
      poolId = binding.rows?.[0]?.pool_id != null ? Number(binding.rows[0].pool_id) : null
    }
    if (!Number.isFinite(poolId)) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }

    const poolRes = await client.query(
      'SELECT id, kind, quantity_remaining, is_active FROM stock_pools WHERE id = $1 FOR UPDATE',
      [poolId],
    )
    const pr = poolRes.rows?.[0]
    if (!pr || pr.is_active === false) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }

    const poolKind = String(pr.kind)
    let poolItemsRes = null

    if (poolKind === 'quantity') {
      const poolQuantityRemaining = Number(pr.quantity_remaining ?? 0)
      if (!Number.isFinite(poolQuantityRemaining) || poolQuantityRemaining < q) {
        await client.query('ROLLBACK')
        throw new Error('out_of_stock')
      }
    } else {
      poolItemsRes = await client.query(
        `SELECT id, payload
         FROM stock_pool_items
         WHERE pool_id = $1 AND status = 'available'
         ORDER BY id ASC
         FOR UPDATE SKIP LOCKED
         LIMIT $2`,
        [poolId, q],
      )
      if ((poolItemsRes.rowCount ?? 0) < q) {
        await client.query('ROLLBACK')
        throw new Error('out_of_stock')
      }
    }

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (
         order_id, product_id, qty,
         unit_price_points, unit_price_original_points,
         promo_discount_points, coupon_discount_points,
         product_option
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        orderId,
        pid,
        q,
        unitPrice,
        originalUnitPrice,
        promoDiscount,
        couponDiscount,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const orderItemId = orderItemRes.rows[0].id
    await insertOrderDiscountApplications(client, { orderId, orderItemId, quote: resolved })

    if (coupon?.id) {
      await client.query('UPDATE discount_coupons SET used_count = COALESCE(used_count, 0) + 1, updated_at = now() WHERE id = $1', [coupon.id])
    }

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, uid],
    )

    const deliveries = []
    if (poolKind === 'quantity') {
      await client.query('UPDATE stock_pools SET quantity_remaining = quantity_remaining - $2, updated_at = now() WHERE id = $1', [poolId, q])
    } else {
      const rows = poolItemsRes?.rows ?? []
      for (const r of rows) {
        const stockId = r.id
        const payload = String(r.payload ?? '')
        const masked = maskPayload(payload)

        const dRes = await client.query(
          `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_pool_item_id, status, payload_masked, payload)
           VALUES ($1, $2, $3, $4, $5, 'pending_claim', $6, $7)
           RETURNING id`,
          [uid, orderId, orderItemId, pid, stockId, masked, payload],
        )
        deliveries.push({ id: dRes.rows[0].id, masked })

        await client.query(
          `UPDATE stock_pool_items
           SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now()
           WHERE id = $1`,
          [stockId, orderItemId],
        )
      }

      await recountProductStockFromPools(client, pid)
    }

    await client.query('COMMIT')

    sendPushToUser(uid, {
      title: '✅ สินค้าของคุณพร้อมแล้ว!',
      body: 'เข้าไปที่กล่องรับของเพื่อรับสินค้าของคุณ',
      link: '/inbox',
      tag: `order-delivered-${orderId}`,
      require_interaction: true,
    }).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries,
    }
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


export async function purchaseFarmProduct({ userId, productId, qty, username, password, authKey, couponCode, formData }) {
  const uid = Number(userId)
  const pid = Number(productId)
  const q = Number(qty)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(pid)) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 10) throw new Error('invalid_qty')

  const { productOptionId } = arguments?.[0] ?? {}
  const product = await getProductById(pid)
  if (!product) throw new Error('product_not_found')

  const selectedOption = resolveProductOption({ product, productOptionId })

  const fields = normalizeFarmFormFields(product)
  const inputData = formData && typeof formData === 'object' ? formData : {}
  const fieldValues = {}
  for (const field of fields) {
    let value = inputData?.[field.id]
    if (value == null) {
      if (field.id === 'username') value = username
      if (field.id === 'password') value = password
      if (field.id === 'auth_key') value = authKey
    }
    if (field.type === 'checkbox') {
      const boolVal = value === true || value === 'true' || value === 1 || value === '1'
      if (field.required && !boolVal) throw new Error('invalid_farm_form')
      fieldValues[field.id] = boolVal
    } else {
      const textVal = String(value ?? '').trim()
      if (field.required && !textVal) throw new Error('invalid_farm_form')
      fieldValues[field.id] = textVal ? textVal : null
    }
  }

  const usernameValue = typeof fieldValues.username === 'string' ? fieldValues.username : ''
  const passwordValue = typeof fieldValues.password === 'string' ? fieldValues.password : ''
  const authKeyValue = typeof fieldValues.auth_key === 'string' ? fieldValues.auth_key : ''
  const formDataValue = JSON.stringify(fieldValues)

  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice <= 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const promo = await getActivePromotionForProduct(client, pid)
    const promoPrice = computeDiscountedUnitPrice({
      unitPrice: originalUnitPrice,
      percent: promo?.discount_percent,
      amount: promo?.discount_amount_points,
    })
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const couponPrice = computeDiscountedUnitPrice({
      unitPrice: promoPrice.finalUnitPrice,
      percent: coupon?.discount_percent,
      amount: coupon?.discount_amount_points,
    })

    const unitPrice = couponPrice.finalUnitPrice
    const subtotal = originalUnitPrice * q
    const promoDiscountTotal = promoPrice.discountPoints * q
    const couponDiscountTotal = couponPrice.discountPoints * q
    const total = unitPrice * q

    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [uid])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [uid],
    )

    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (
         order_id, product_id, qty,
         unit_price_points, unit_price_original_points,
         promo_discount_points, coupon_discount_points,
         product_option
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id`,
      [
        orderId,
        pid,
        q,
        unitPrice,
        originalUnitPrice,
        promoPrice.discountPoints,
        couponPrice.discountPoints,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const orderItemId = orderItemRes.rows[0].id

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, uid],
    )

    if (coupon?.id) {
      await client.query('UPDATE discount_coupons SET used_count = used_count + 1, updated_at = now() WHERE id = $1', [coupon.id])
    }

    const dRes = await client.query(
      `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_item_id, status, payload_masked, payload)
       VALUES ($1, $2, $3, $4, NULL, 'pending_fulfillment', $5, NULL)
       RETURNING id`,
      [uid, orderId, orderItemId, pid, 'รอดำเนินการ'],
    )
    const deliveryId = dRes.rows[0].id

    const farmRes2 = await client.query(
      `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, username, password, auth_key, form_data, status, product_option)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'pending',$10::jsonb)
       RETURNING id`,
      [
        deliveryId,
        uid,
        pid,
        orderId,
        orderItemId,
        usernameValue || null,
        passwordValue || null,
        authKeyValue || null,
        formDataValue,
        selectedOption ? JSON.stringify(selectedOption) : null,
      ],
    )
    const farmRequestId2 = farmRes2.rows[0]?.id

    await client.query('COMMIT')

    if (farmRequestId2) autoAssignFarmRequest(farmRequestId2).catch(() => {})
    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries: [{ id: deliveryId, masked: 'รอดำเนินการ' }],
    }
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


export async function purchaseMysteryBox({ userId, productId, qty, couponCode }) {
  const uid = Number(userId)
  const boxId = Number(productId)
  const q = Number(qty)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(boxId)) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 10) throw new Error('invalid_qty')

  const box = await getProductById(boxId)
  if (!box) throw new Error('product_not_found')
  const originalUnitPrice = Number(box.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice < 0) throw new Error('invalid_price')
  if (originalUnitPrice === 0 && q > 1) throw new Error('free_box_single_only')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    // ── Coupon & promo discount ──
    const promo = await getActivePromotionForProduct(client, boxId)
    const promoPrice = computeDiscountedUnitPrice({
      unitPrice: originalUnitPrice,
      percent: promo?.discount_percent,
      amount: promo?.discount_amount_points,
    })
    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const couponPrice = computeDiscountedUnitPrice({
      unitPrice: promoPrice.finalUnitPrice,
      percent: coupon?.discount_percent,
      amount: coupon?.discount_amount_points,
    })

    const unitPrice = couponPrice.finalUnitPrice
    const subtotal = originalUnitPrice * q
    const promoDiscountTotal = promoPrice.discountPoints * q
    const couponDiscountTotal = couponPrice.discountPoints * q
    const total = unitPrice * q

    // ── Wallet check ──
    const walletRes = await client.query('SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE', [uid])
    const balance = Number(walletRes.rows?.[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) {
      await client.query('ROLLBACK')
      throw new Error('insufficient_points')
    }

    // ── Load prizes with stock info + compute effective weights ──
    const prizeRes = await client.query(
      `SELECT mbp.id, mbp.prize_kind, mbp.prize_product_id, mbp.prize_name, mbp.prize_image_url, mbp.weight, mbp.remaining,
              p.name AS prize_product_name, p.image_url AS prize_product_image_url,
              CASE
                WHEN mbp.prize_kind = 'linked_product'
                  THEN COALESCE((SELECT COUNT(*)::int FROM stock_pool_items spi JOIN product_option_stock_bindings b ON b.pool_id = spi.pool_id WHERE b.product_id = mbp.prize_product_id AND b.product_option_id IS NULL AND spi.status = 'available'), 0)
                WHEN mbp.prize_kind = 'product'
                  THEN (SELECT COUNT(*)::int FROM mystery_box_stock_items msi WHERE msi.prize_id = mbp.id AND msi.status = 'available')
                ELSE 0
              END AS prize_available_stock
       FROM mystery_box_prizes mbp
       LEFT JOIN products p ON p.id = mbp.prize_product_id
       WHERE box_product_id = $1 AND is_active = true AND remaining > 0 AND weight > 0
       ORDER BY mbp.id ASC
       FOR UPDATE OF mbp`,
      [boxId],
    )
    const rawPrizes = prizeRes.rows || []
    if (rawPrizes.length === 0) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }
    const prizes = computeMysteryEffectiveWeights(rawPrizes)
    const totalEffective = prizes.reduce((s, r) => s + Math.max(0, Number(r.effective_weight || 0)), 0)
    if (!Number.isFinite(totalEffective) || totalEffective <= 0) {
      await client.query('ROLLBACK')
      throw new Error('out_of_stock')
    }

    // ── Create order + debit wallet ──
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1, $2, $3, $4, $5, $6, 'paid', $7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, promoDiscountTotal, couponDiscountTotal, coupon?.code ?? null, total, generateOrderRef()],
    )
    const orderId = orderRes.rows[0].id

    const orderItemRes = await client.query(
      `INSERT INTO order_items (order_id, product_id, qty, unit_price_points)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orderId, boxId, q, unitPrice],
    )
    const orderItemId = orderItemRes.rows[0].id

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) {
      await client.query('ROLLBACK')
      throw new Error('duplicate_purchase')
    }

    await client.query(
      `UPDATE wallets SET balance = balance - $1, updated_at = now() WHERE user_id = $2`,
      [total, uid],
    )

    // ── Increment coupon used_count if applicable ──
    if (coupon) {
      await client.query(
        `UPDATE discount_coupons SET used_count = COALESCE(used_count, 0) + 1 WHERE id = $1`,
        [coupon.id],
      )
    }

    // ── Draw prizes ──
    const deliveries = []
    const picks = []
    const drawAudits = []
    const drawCtx = { uid, orderId, orderItemId, boxId }

    for (let i = 0; i < q; i++) {
      let picked = false
      let attempts = 0
      const maxAttempts = Math.max(10, prizes.length * 3)

      while (!picked && attempts < maxAttempts) {
        attempts++
        const randomValue = secureRandom01()
        const idx = pickWeightedIndex(prizes, randomValue)
        if (idx < 0) break
        const chosen = prizes[idx]
        if (Number(chosen.remaining) <= 0) continue

        const kind = typeof chosen.prize_kind === 'string' ? chosen.prize_kind : 'product'
        let result = null
        if (kind === 'salt') result = await drawSaltPrize(client, chosen, drawCtx)
        else if (kind === 'linked_product') result = await drawLinkedProductPrize(client, chosen, drawCtx)
        else result = await drawProductPrize(client, chosen, drawCtx)

        if (result === null) continue // stock exhausted for this prize, retry
        if (result.delivery) deliveries.push(result.delivery)
        picks.push(result)
        drawAudits.push({
          prizeId: Number(chosen.id),
          prizeKind: kind,
          prizeName: chosen.prize_name || chosen.prize_product_name || null,
          weight: Number(chosen.weight || 0),
          effectiveWeight: Number(chosen.effective_weight || 0),
          probabilityPercent: totalEffective > 0 ? Number(((Number(chosen.effective_weight || 0) / totalEffective) * 100).toFixed(4)) : null,
          randomValue,
          unitIndex: i,
          attempts,
        })
        picked = true
      }

      if (!picked) {
        await client.query('ROLLBACK')
        throw new Error('out_of_stock')
      }
    }

    await client.query('COMMIT')

    // Audit trail for every draw — lets support/admins reconstruct exactly why a customer got what
    // they got (configured weight, effective weight, probability, and the raw random value used).
    for (const audit of drawAudits) {
      logAuditEvent({
        actorUserId: uid,
        action: 'mystery_box_draw',
        entityType: 'mystery_box_prize',
        entityId: audit.prizeId,
        detail: {
          order_id: orderId,
          box_product_id: boxId,
          prize_kind: audit.prizeKind,
          prize_name: audit.prizeName,
          weight: audit.weight,
          effective_weight: audit.effectiveWeight,
          probability_percent: audit.probabilityPercent,
          random_value: audit.randomValue,
          unit_index: audit.unitIndex,
          attempts: audit.attempts,
        },
        severity: 'info',
      }).catch(() => {})
    }

    sendPushToUser(uid, {
      title: '🎁 เปิดกล่องลุ้นรางวัลสำเร็จ!',
      body: 'เข้าไปที่กล่องรับของเพื่อดูรางวัลของคุณ',
      link: '/inbox',
      tag: `mystery-delivered-${orderId}`,
      require_interaction: true,
    }).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRes.rows[0].ref,
        total_points: total,
        subtotal_points: subtotal,
        promo_discount_points: promoDiscountTotal,
        coupon_discount_points: couponDiscountTotal,
        coupon_code: coupon?.code ?? null,
        created_at: orderRes.rows[0].created_at,
      },
      deliveries,
      picks,
    }
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


export async function purchaseBundle({ userId, bundleId, couponCode }) {
  const uid = Number(userId)
  const bid = Number(bundleId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(bid) || bid <= 0) throw new Error('invalid_bundle_id')

  const bundle = await getBundleWithItems(bid)
  assertBundlePurchasable(bundle)

  const bundlePrice = Math.max(0, Math.trunc(Number(bundle.bundle_price) || 0))
  const originalTotal = Math.max(0, Math.trunc(Number(bundle.original_total) || 0))
  const subtotal = Math.max(originalTotal, bundlePrice)
  const bundleDiscountTotal = Math.max(0, subtotal - bundlePrice)

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const coupon = await lockAndValidateDiscountCoupon(client, couponCode)
    const quote = await buildBundleQuote(client, bundle, coupon, { userId: uid })
    const couponDiscountPoints = quote.coupon_discount_points
    const total = quote.total_points

    await client.query(
      `INSERT INTO wallets (user_id, balance)
       VALUES ($1, 0)
       ON CONFLICT (user_id) DO NOTHING`,
      [uid],
    )

    const wallet = await client.query(`SELECT balance FROM wallets WHERE user_id = $1 FOR UPDATE`, [uid])
    const balance = Number(wallet.rows[0]?.balance ?? 0)
    if (!Number.isFinite(balance) || balance < total) throw new Error('insufficient_points')

    const orderRef = generateOrderRef()
    const orderRes = await client.query(
      `INSERT INTO orders (user_id, subtotal_points, promo_discount_points, coupon_discount_points, coupon_code, total_points, status, ref)
       VALUES ($1,$2,$3,$4,$5,$6,'paid',$7)
       RETURNING id, created_at, ref`,
      [uid, subtotal, bundleDiscountTotal, couponDiscountPoints, coupon?.code ?? null, total, orderRef],
    )
    const orderId = orderRes.rows[0].id
    await insertOrderDiscountApplications(client, { orderId, quote })

    // create order_items + deliveries per bundle item
    const deliveries = []
    const farmRequestIds = []

    for (const item of bundle.items) {
      const itemQty = getBundleItemQty(item)
      const unitPrice = Math.max(0, Math.trunc(Number(item.product_price ?? 0) || 0))
      const itemOptionJson = item.product_option ? JSON.stringify(item.product_option) : null

      const oiRes = await client.query(
        `INSERT INTO order_items (
           order_id, product_id, qty,
           unit_price_points, unit_price_original_points,
           promo_discount_points, coupon_discount_points,
           product_option
         )
         VALUES ($1,$2,$3,$4,$4,0,0,$5::jsonb)
         RETURNING id`,
        [orderId, item.product_id, itemQty, unitPrice, itemOptionJson],
      )
      const orderItemId = oiRes.rows[0].id

      const ft = String(item.fulfillment_type || 'digital_stock')

      if (ft === 'digital_stock') {
        if (item.is_unlimited_stock) {
          const dvRes = await client.query(
            `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, status, payload_masked, payload, delivery_name)
             VALUES ($1,$2,$3,$4,'pending_claim',$5,NULL,$6) RETURNING id`,
            [uid, orderId, orderItemId, item.product_id, 'พร้อมรับสินค้า', item.product_name],
          )
          deliveries.push({ id: dvRes.rows[0].id, product_name: item.product_name })
          continue
        }

        const poolRow = await findBundleStockPool(client, item, { lock: true })
        if (!poolRow || poolRow.is_active === false) throw new Error(`product_out_of_stock:${item.product_id}`)

        const poolKind = String(poolRow.kind || 'digital_code')
        if (poolKind === 'quantity') {
          const remaining = Number(poolRow.quantity_remaining ?? 0) || 0
          if (remaining < itemQty) throw new Error(`product_out_of_stock:${item.product_id}`)
          await client.query(
            `UPDATE stock_pools
             SET quantity_remaining = quantity_remaining - $2, updated_at = now()
             WHERE id = $1`,
            [poolRow.pool_id, itemQty],
          )
        } else {
          const stockRows = await client.query(
            `SELECT id, payload
             FROM stock_pool_items
             WHERE pool_id = $1 AND status = 'available'
             ORDER BY id ASC
             FOR UPDATE SKIP LOCKED
             LIMIT $2`,
            [poolRow.pool_id, itemQty],
          )
          if ((stockRows.rowCount ?? 0) < itemQty) throw new Error(`product_out_of_stock:${item.product_id}`)

          for (const row of stockRows.rows) {
            const payload = String(row.payload ?? '')
            const dvRes = await client.query(
              `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, stock_pool_item_id, status, payload_masked, payload, delivery_name)
               VALUES ($1,$2,$3,$4,$5,'pending_claim',$6,$7,$8) RETURNING id`,
              [uid, orderId, orderItemId, item.product_id, row.id, maskPayload(payload), payload, item.product_name],
            )
            deliveries.push({ id: dvRes.rows[0].id, product_name: item.product_name })

            await client.query(
              `UPDATE stock_pool_items
               SET status = 'reserved', reserved_order_item_id = $2, reserved_at = now()
               WHERE id = $1`,
              [row.id, orderItemId],
            )
          }
        }

        await recountProductStockFromPools(client, item.product_id)
      } else if (ft === 'farm_form' || ft === 'uid_form') {
        const pendingDeliveryRes = await client.query(
          `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, status, payload_masked, payload, delivery_name)
           VALUES ($1,$2,$3,$4,'pending_fulfillment',$5,NULL,$6) RETURNING id`,
          [uid, orderId, orderItemId, item.product_id, 'รอดำเนินการ', item.product_name],
        )
        const pendingDeliveryId = pendingDeliveryRes.rows[0].id
        deliveries.push({ id: pendingDeliveryId, product_name: item.product_name })

        const pendingFarmRes = await client.query(
          ft === 'uid_form'
            ? `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, uid, uid_confirmed, status, product_option)
               VALUES ($1,$2,$3,$4,$5,NULL,false,'pending',$6::jsonb) RETURNING id`
            : `INSERT INTO farm_requests (delivery_id, user_id, product_id, order_id, order_item_id, form_data, status, product_option)
               VALUES ($1,$2,$3,$4,$5,$6::jsonb,'pending',$7::jsonb) RETURNING id`,
          ft === 'uid_form'
            ? [pendingDeliveryId, uid, item.product_id, orderId, orderItemId, itemOptionJson]
            : [pendingDeliveryId, uid, item.product_id, orderId, orderItemId, JSON.stringify({}), itemOptionJson],
        )
        farmRequestIds.push(pendingFarmRes.rows[0].id)
      } else {
        const fallbackDeliveryRes = await client.query(
          `INSERT INTO deliveries (user_id, order_id, order_item_id, product_id, status, payload_masked, payload, delivery_name)
           VALUES ($1,$2,$3,$4,'pending_fulfillment',$5,NULL,$6) RETURNING id`,
          [uid, orderId, orderItemId, item.product_id, 'รอดำเนินการ', item.product_name],
        )
        deliveries.push({ id: fallbackDeliveryRes.rows[0].id, product_name: item.product_name })
      }
    }

    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'debit', $2, 'purchase', $3)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [uid, total, `order:${orderId}`],
    )
    if (txRes.rowCount === 0) throw new Error('duplicate_purchase')

    await client.query(
      `UPDATE wallets
       SET balance = balance - $1, updated_at = now()
       WHERE user_id = $2`,
      [total, uid],
    )

    if (coupon?.id) {
      await client.query(
        `UPDATE discount_coupons
         SET used_count = COALESCE(used_count, 0) + 1, updated_at = now()
         WHERE id = $1`,
        [coupon.id],
      )
    }

    await client.query('COMMIT')

    // fire-and-forget auto-assign farm requests
    for (const frid of farmRequestIds) {
      autoAssignFarmRequest(frid).catch(() => {})
    }

    sendPushToUser(uid, {
      title: 'สั่งซื้อ Bundle สำเร็จ',
      body: `${bundle.name} - ${total.toLocaleString('th-TH')} พ้อย`,
      url: '/inbox',
    }).catch(() => {})

    return {
      order: {
        id: orderId,
        ref: orderRef,
        total_points: total,
        subtotal_points: subtotal,
        promo_discount_points: bundleDiscountTotal,
        coupon_discount_points: couponDiscountPoints,
        coupon_code: coupon?.code ?? null,
        discounts_applied: quote.discounts_applied,
        discounts_rejected: quote.discounts_rejected,
        discounts_considered: quote.discounts_considered,
        created_at: orderRes.rows[0].created_at,
      },
      bundle_name: bundle.name,
      deliveries,
    }
  } catch (e) {
    try { await client.query('ROLLBACK') } catch { }
    throw e
  } finally {
    client.release()
  }
}


export async function quoteProductPurchase({ productId, qty = 1, couponCode } = {}) {
  const pid = Number(productId)
  const q = qty == null ? 1 : Number(qty)
  if (!Number.isFinite(pid) || pid <= 0) throw new Error('invalid_product_id')
  if (!Number.isFinite(q) || q <= 0 || q > 999) throw new Error('invalid_qty')

  const { productOptionId, userId } = arguments?.[0] ?? {}
  const product = await getProductById(pid)
  if (!product) throw new Error('product_not_found')

  const selectedOption = resolveProductOption({ product, productOptionId })
  const originalUnitPrice = selectedOption?.price_points != null ? Number(selectedOption.price_points) : Number(product.price)
  if (!Number.isFinite(originalUnitPrice) || originalUnitPrice < 0) throw new Error('invalid_price')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const promo = await getActivePromotionForProduct(client, pid)
    const coupon = await readAndValidateDiscountCoupon(client, couponCode)
    const campaigns = await listActiveGrowthCampaigns({ targetType: 'product', targetId: pid })
    const vip = userId ? await getMyVip(userId).catch(() => null) : null
    const candidates = [
      promotionToDiscountCandidate(promo),
      ...(campaigns.campaigns || []).map(campaignToDiscountCandidate),
      volumePricingToDiscountCandidate(product, q),
      vipToDiscountCandidate(vip),
      couponToDiscountCandidate(coupon),
    ].filter(Boolean)
    const resolved = resolveDiscountQuote({
      targetType: 'product',
      targetId: pid,
      originalUnitPricePoints: originalUnitPrice,
      quantity: q,
      candidates,
    })
    await client.query('COMMIT')

    const promoDiscount = resolved.discounts_applied.find((d) => d.source_type === 'product_promotion')?.amount_points || 0
    const couponDiscount = resolved.discounts_applied.find((d) => d.source_type === 'coupon')?.amount_points || 0
    const subtotal = originalUnitPrice * q

    return {
      product_id: pid,
      qty: q,
      unit_price_original_points: originalUnitPrice,
      unit_price_points: resolved.final_unit_price_points,
      promo_discount_points: promoDiscount,
      coupon_discount_points: couponDiscount,
      subtotal_points: subtotal,
      promo_discount_total_points: promoDiscount * q,
      coupon_discount_total_points: couponDiscount * q,
      total_points: resolved.final_total_points,
      coupon_code: coupon?.code ?? null,
      coupon_valid: coupon != null,
      discounts_considered: resolved.discounts_considered,
      discounts_applied: resolved.discounts_applied,
      discounts_rejected: resolved.discounts_rejected,
      final_unit_price_points: resolved.final_unit_price_points,
      promotion: promo
        ? {
            id: promo.id,
            title: promo.title ?? null,
            discount_percent: promo.discount_percent ?? null,
            discount_amount_points: promo.discount_amount_points ?? null,
            starts_at: promo.starts_at ?? null,
            ends_at: promo.ends_at ?? null,
          }
        : null,
    }
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


export async function listMyOrders(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  return all(
    `SELECT o.id, o.ref, o.total_points, o.status, o.created_at,
            oi.product_id, p.name AS product_name, p.image_url AS product_image_url,
            c.name AS category_name,
            oi.qty, oi.unit_price_points, oi.product_option
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.user_id = $1
     ORDER BY o.id DESC
     LIMIT $2 OFFSET $3`,
    [uid, limit, offset],
  )
}


export async function getMyOrderDetail(userId, orderId) {
  const uid = Number(userId)
  const oid = Number(orderId)
  if (!Number.isFinite(uid) || uid <= 0) throw new Error('invalid_user_id')
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('invalid_order_id')

  const order = await get(
    `SELECT o.id, o.ref, o.total_points, o.status, o.created_at,
            oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
            p.id AS product_id, p.name AS product_name, p.image_url AS product_image_url,
            p.fulfillment_type,
            c.name AS category_name
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     WHERE o.id = $1 AND o.user_id = $2
     LIMIT 1`,
    [oid, uid],
  )
  if (!order) throw new Error('not_found')

  const deliveries = await all(
    `SELECT d.id, d.status, d.payload_masked, d.delivery_kind,
            CASE WHEN d.status = 'claimed' THEN d.payload ELSE NULL END AS payload,
            d.created_at, d.claimed_at,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), p.name) AS delivery_name,
            fr.id AS farm_request_id,
            fr.status AS farm_status,
            fr.created_at AS farm_created_at,
            fr.assigned_at AS farm_assigned_at,
            fr.started_at AS farm_started_at,
            fr.fulfilled_at AS farm_fulfilled_at,
            fr.cancelled_at AS farm_cancelled_at,
            fr.cancel_note AS farm_cancel_note,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     WHERE d.order_id = $1 AND d.user_id = $2
     ORDER BY d.id ASC`,
    [oid, uid],
  )

  return { order, deliveries }
}


export async function adminListOrders({ limit = 100, offset = 0, status, search, fulfillmentType } = {}) {
  const lim = Math.min(Math.max(1, Number(limit) || 100), 500)
  const off = Math.max(0, Number(offset) || 0)
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const ft = typeof fulfillmentType === 'string' && fulfillmentType.trim() ? fulfillmentType.trim() : null
  const q = typeof search === 'string' ? search.trim() : ''

  const where = []
  const params = []

  if (st) { params.push(st); where.push(`o.status = $${params.length}`) }
  if (ft) { params.push(ft); where.push(`p.fulfillment_type = $${params.length}`) }
  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR p.name ILIKE $${params.length} OR o.ref ILIKE $${params.length} OR CAST(o.id AS TEXT) ILIKE $${params.length})`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const countParams = [...params]
  params.push(lim); params.push(off)

  const [items, countRow] = await Promise.all([
    all(
      `SELECT o.id, o.ref, o.status, o.total_points, o.created_at,
              u.id AS user_id, u.email AS user_email, u.username AS user_username,
              COALESCE(u.display_name, u.username) AS user_display_name,
              oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
              p.id AS product_id, p.name AS product_name, p.image_url AS product_image_url, p.fulfillment_type,
              c.name AS category_name,
              d.id AS delivery_id, d.status AS delivery_status, d.claimed_at,
              fr.id AS farm_request_id, fr.status AS farm_status,
              fr.assigned_at, fr.started_at, fr.fulfilled_at,
              COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN categories c ON c.id = p.category_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
       LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
       ${whereSql}
       ORDER BY o.id DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    ),
    get(
      `SELECT COUNT(DISTINCT o.id)::int AS total,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'pending')::int AS pending_count,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'completed')::int AS completed_count,
              COUNT(DISTINCT o.id) FILTER (WHERE o.status = 'cancelled')::int AS cancelled_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'pending_claim')::int AS pending_claim_count,
              COUNT(DISTINCT d.id) FILTER (WHERE d.status = 'claimed')::int AS claimed_count,
              COUNT(DISTINCT fr.id) FILTER (WHERE fr.status = 'pending')::int AS fr_pending_count,
              COUNT(DISTINCT fr.id) FILTER (WHERE fr.status = 'in_progress')::int AS fr_in_progress_count
       FROM orders o
       JOIN order_items oi ON oi.order_id = o.id
       JOIN products p ON p.id = oi.product_id
       JOIN users u ON u.id = o.user_id
       LEFT JOIN deliveries d ON d.order_id = o.id
       LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
       ${whereSql}`,
      countParams,
    ),
  ])

  return {
    items,
    total: Number(countRow?.total || 0),
    summary: {
      pending: Number(countRow?.pending_count || 0),
      completed: Number(countRow?.completed_count || 0),
      cancelled: Number(countRow?.cancelled_count || 0),
      pending_claim: Number(countRow?.pending_claim_count || 0),
      claimed: Number(countRow?.claimed_count || 0),
      fr_pending: Number(countRow?.fr_pending_count || 0),
      fr_in_progress: Number(countRow?.fr_in_progress_count || 0),
    },
  }
}


export async function adminGetOrderDetail(orderId) {
  const oid = Number(orderId)
  if (!Number.isFinite(oid) || oid <= 0) throw new Error('invalid_order_id')

  const order = await get(
    `SELECT o.id, o.ref, o.status, o.total_points, o.created_at,
            u.id AS user_id, u.email AS user_email,
            COALESCE(u.display_name, u.username) AS user_display_name,
            oi.id AS order_item_id, oi.qty, oi.unit_price_points, oi.product_option,
            p.id AS product_id, p.name AS product_name, p.fulfillment_type, p.image_url AS product_image_url,
            c.name AS category_name
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     JOIN categories c ON c.id = p.category_id
     JOIN users u ON u.id = o.user_id
     WHERE o.id = $1 LIMIT 1`,
    [oid],
  )
  if (!order) throw new Error('not_found')

  const deliveries = await all(
    `SELECT d.id, d.status, d.payload_masked, d.delivery_kind, d.created_at, d.claimed_at,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), p.name) AS delivery_name,
            fr.id AS farm_request_id, fr.status AS farm_status,
            fr.created_at AS farm_created_at, fr.assigned_at, fr.started_at,
            fr.fulfilled_at, fr.cancelled_at, fr.cancel_note,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_staff_name,
            ab.id AS assigned_staff_id
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     WHERE d.order_id = $1
     ORDER BY d.id ASC`,
    [oid],
  )

  return { order, deliveries }
}


export async function adminListUserOrders(userId, { limit = 50, offset = 0, search } = {}) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_id')
  const params = [uid, limit, offset]
  let searchClause = ''
  if (search && typeof search === 'string' && search.trim()) {
    params.push(`%${search.trim().toLowerCase()}%`)
    searchClause = ` AND (LOWER(COALESCE(o.ref,'')) LIKE $4 OR LOWER(p.name) LIKE $4)`
  }
  return all(
    `SELECT o.id AS order_id,
            o.ref,
            o.total_points,
            o.status,
            o.created_at,
            oi.id AS order_item_id,
            oi.product_id,
            p.name AS product_name,
            p.image_url AS product_image_url,
            p.fulfillment_type,
            oi.qty,
            oi.unit_price_points,
            oi.product_option
     FROM orders o
     JOIN order_items oi ON oi.order_id = o.id
     JOIN products p ON p.id = oi.product_id
     WHERE o.user_id = $1${searchClause}
     ORDER BY o.id DESC, oi.id ASC
     LIMIT $2 OFFSET $3`,
    params,
  )
}


export async function adminSearchOrderByRef(ref) {
  const r = String(ref ?? '').trim().toLowerCase()
  if (!r) return null
  return get(
    `SELECT o.id AS order_id,
            o.ref,
            o.user_id,
            o.total_points,
            o.status,
            o.created_at,
            u.username,
            u.email,
            u.display_name,
            u.avatar_url
     FROM orders o
     JOIN users u ON u.id = o.user_id
     WHERE LOWER(o.ref) = $1`,
    [r],
  )
}


export async function listMyInbox(userId, { limit = 50, offset = 0 } = {}) {
  const uid = Number(userId)
  return all(
    `SELECT d.id, d.order_id, d.product_id,
            COALESCE(NULLIF(TRIM(d.delivery_name), ''), NULLIF(TRIM(mbp.prize_name), ''), p.name) AS product_name,
            p.fulfillment_type,
            d.delivery_kind,
            fr.status AS farm_status,
            fr.cancel_note AS farm_cancel_note,
            d.status,
            d.payload_masked,
            CASE WHEN d.status = 'claimed' THEN d.payload ELSE NULL END AS payload,
            d.created_at, d.claimed_at,
            oi.product_option
     FROM deliveries d
     JOIN products p ON p.id = d.product_id
     LEFT JOIN order_items oi ON oi.id = d.order_item_id
     LEFT JOIN farm_requests fr ON fr.delivery_id = d.id
     LEFT JOIN mystery_box_stock_items msi ON msi.id = d.mystery_stock_item_id
     LEFT JOIN mystery_box_prizes mbp ON mbp.id = msi.prize_id
     WHERE d.user_id = $1
     ORDER BY d.id DESC
     LIMIT $2 OFFSET $3`,
    [uid, limit, offset],
  )
}


export async function claimInboxItem({ userId, deliveryId }) {
  const uid = Number(userId)
  const did = Number(deliveryId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')
  if (!Number.isFinite(did)) throw new Error('invalid_delivery_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dRes = await client.query(
      `SELECT id, user_id, stock_item_id, stock_pool_item_id, mystery_stock_item_id, status, payload
       FROM deliveries
       WHERE id = $1
       FOR UPDATE`,
      [did],
    )
    const d = dRes.rows?.[0]
    if (!d) {
      await client.query('ROLLBACK')
      throw new Error('delivery_not_found')
    }
    if (Number(d.user_id) !== uid) {
      await client.query('ROLLBACK')
      throw new Error('forbidden')
    }
    if (String(d.status) !== 'pending_claim') {
      await client.query('ROLLBACK')
      throw new Error('already_claimed')
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'claimed', claimed_at = now()
       WHERE id = $1`,
      [did],
    )

    if (d.stock_pool_item_id) {
      await client.query(
        `UPDATE stock_pool_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.stock_pool_item_id],
      )
    } else if (d.stock_item_id) {
      await client.query(
        `UPDATE digital_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.stock_item_id],
      )
    }

    if (d.mystery_stock_item_id) {
      await client.query(
        `UPDATE mystery_box_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = $1`,
        [d.mystery_stock_item_id],
      )
    }

    await client.query('COMMIT')
    return { ok: true, payload: String(d.payload ?? '') }
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


export async function claimAllInboxItems({ userId }) {
  const uid = Number(userId)
  if (!Number.isFinite(uid)) throw new Error('invalid_user_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const dRes = await client.query(
      `SELECT id, user_id, stock_item_id, stock_pool_item_id, mystery_stock_item_id, status, payload
       FROM deliveries
       WHERE user_id = $1 AND status = 'pending_claim'
       FOR UPDATE`,
      [uid],
    )
    const deliveries = dRes.rows || []
    if (deliveries.length === 0) {
      await client.query('COMMIT')
      return { ok: true, count: 0, items: [] }
    }

    const deliveryIds = deliveries.map((d) => d.id)
    await client.query(
      `UPDATE deliveries
       SET status = 'claimed', claimed_at = now()
       WHERE id = ANY($1::bigint[])`,
      [deliveryIds],
    )

    const poolItemIds = deliveries.map((d) => d.stock_pool_item_id).filter(Boolean)
    if (poolItemIds.length > 0) {
      await client.query(
        `UPDATE stock_pool_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = ANY($1::bigint[])`,
        [poolItemIds],
      )
    }

    const stockItemIds = deliveries.map((d) => d.stock_item_id).filter(Boolean)
    if (stockItemIds.length > 0) {
      await client.query(
        `UPDATE digital_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = ANY($1::bigint[])`,
        [stockItemIds],
      )
    }

    const mysteryItemIds = deliveries.map((d) => d.mystery_stock_item_id).filter(Boolean)
    if (mysteryItemIds.length > 0) {
      await client.query(
        `UPDATE mystery_box_stock_items
         SET status = 'delivered', delivered_at = now()
         WHERE id = ANY($1::bigint[])`,
        [mysteryItemIds],
      )
    }

    await client.query('COMMIT')
    return {
      ok: true,
      count: deliveries.length,
      items: deliveries.map((d) => ({ id: d.id, payload: String(d.payload ?? '') })),
    }
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


const ASSIGNABLE_ROLES = new Set(['booster', 'support', 'admin', 'owner'])

const FARM_ASSIGNABLE_ROLES = new Set(['booster', 'admin', 'owner'])


function normalizeAutoAssignConfig(raw) {
  const o = raw && typeof raw === 'object' ? raw : {}
  const enabled = Boolean(o.enabled)
  const rawRoles = Array.isArray(o.roles) ? o.roles : ['booster']
  const roles = rawRoles
    .map((r) => (typeof r === 'string' ? r.trim().toLowerCase() : ''))
    .filter((r) => ASSIGNABLE_ROLES.has(r))
  if (roles.length === 0) roles.push('booster')
  return { enabled, roles }
}


export async function assignFarmRequestToBooster({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const booster = await get('SELECT id, role FROM users WHERE id = $1', [bid])
  if (!booster) throw new Error('booster_not_found')
  const r = String(booster.role || 'user').trim().toLowerCase()
  if (!ASSIGNABLE_ROLES.has(r)) throw new Error('not_booster')

  const row = await get(
    `UPDATE farm_requests
     SET assigned_booster_id = $2,
         assigned_at = now()
     WHERE id = $1
       AND status = 'pending'
     RETURNING id, assigned_booster_id, assigned_at`,
    [rid, bid],
  )
  if (!row) throw new Error('not_found_or_locked')
  return row
}

// ── Auto-assign config ──


export async function getAutoAssignConfig() {
  const raw = await getAppSettingJson('auto_assign_config')
  return normalizeAutoAssignConfig(raw)
}


export async function updateAutoAssignConfig(config) {
  const next = normalizeAutoAssignConfig(config)
  await upsertAppSettingJson('auto_assign_config', next)
  return next
}


export async function autoAssignFarmRequest(farmRequestId) {
  const config = await getAutoAssignConfig()
  if (!config.enabled || config.roles.length === 0) return null

  const rid = Number(farmRequestId)
  if (!Number.isFinite(rid)) return null

  const fr = await get('SELECT id, status, assigned_booster_id FROM farm_requests WHERE id = $1', [rid])
  if (!fr || fr.status !== 'pending' || fr.assigned_booster_id != null) return null

  // Only assign farm work to farm-capable roles (booster, admin, owner) — exclude support
  const farmRoles = config.roles.filter((r) => FARM_ASSIGNABLE_ROLES.has(r))
  if (farmRoles.length === 0) return null

  const placeholders = farmRoles.map((_, i) => `$${i + 1}`).join(', ')
  const candidate = await get(
    `SELECT u.id
     FROM users u
     INNER JOIN staff_clock_sessions sc ON sc.user_id = u.id AND sc.clock_out IS NULL
     LEFT JOIN (
       SELECT assigned_booster_id, COUNT(*)::int AS active_count
       FROM farm_requests
       WHERE status IN ('pending', 'in_progress')
         AND assigned_booster_id IS NOT NULL
       GROUP BY assigned_booster_id
     ) ac ON ac.assigned_booster_id = u.id
     WHERE LOWER(COALESCE(u.role, 'user')) IN (${placeholders})
       AND u.is_banned = false
     ORDER BY COALESCE(ac.active_count, 0) ASC, u.id ASC
     LIMIT 1`,
    farmRoles,
  )
  if (!candidate) return null

  try {
    const row = await get(
      `UPDATE farm_requests
       SET assigned_booster_id = $2,
           assigned_at = now()
       WHERE id = $1
         AND status = 'pending'
         AND assigned_booster_id IS NULL
       RETURNING id, assigned_booster_id, assigned_at`,
      [rid, candidate.id],
    )
    if (row) {
      createStaffNotification({
        userId: row.assigned_booster_id,
        type: 'assign',
        title: 'คุณได้รับมอบหมายงานใหม่',
        body: `งานจ้าง #${row.id} ได้ถูกมอบหมายให้คุณโดยอัตโนมัติ`,
        link: `/admin?module=fulfillment&id=${row.id}`,
      }).catch(() => {})
    }
    return row || null
  } catch {
    return null
  }
}

// ── Staff clock-in / clock-out ──


export async function boosterListMyFarmRequests({ boosterId, limit = 200, offset = 0, status } = {}) {
  const bid = Number(boosterId)
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null

  if (st) {
    return all(
      `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
              fr.cancel_note, fr.cancelled_at,
              fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
              fr.delivery_id, fr.order_id, fr.order_item_id,
              COALESCE(oi.qty, 1) AS order_qty,
              u.email,
              p.name AS product_name,
              p.fulfillment_type, p.farm_form_fields,
              p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
       FROM farm_requests fr
       LEFT JOIN order_items oi ON oi.id = fr.order_item_id
       JOIN users u ON u.id = fr.user_id
       JOIN products p ON p.id = fr.product_id
       WHERE fr.assigned_booster_id = $1
         AND fr.status = $2
       ORDER BY fr.id DESC
       LIMIT $3 OFFSET $4`,
      [bid, st, lim, off],
    )
  }

  return all(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     WHERE fr.assigned_booster_id = $1
     ORDER BY fr.id DESC
     LIMIT $2 OFFSET $3`,
    [bid, lim, off],
  )
}


export async function adminListBoosterFarmRequests({ limit = 200, offset = 0, status, assignedTo } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const a = assignedTo == null || assignedTo === '' ? null : Number(assignedTo)
  if (a != null && !Number.isFinite(a)) throw new Error('invalid_assigned_to')

  const where = [`fr.assigned_booster_id IS NOT NULL`]
  const params = []
  if (st) {
    params.push(st)
    where.push(`fr.status = $${params.length}`)
  }
  if (a != null) {
    params.push(a)
    where.push(`fr.assigned_booster_id = $${params.length}`)
  }
  params.push(lim)
  params.push(off)
  const w = `WHERE ${where.join(' AND ')}`

  return all(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled,
            fr.assigned_booster_id,
            ab.email AS assigned_booster_email
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     ${w}
     ORDER BY fr.id DESC
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  )
}


export async function adminListAvailableBoosterFarmRequests({ limit = 200, offset = 0 } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  return all(
    `SELECT fr.id, fr.status, fr.created_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     WHERE fr.status = 'pending'
       AND fr.assigned_booster_id IS NULL
     ORDER BY fr.id ASC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}


export async function boosterListAvailableFarmRequests({ limit = 200, offset = 0 } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')

  return all(
    `SELECT fr.id, fr.status, fr.created_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id,
            COALESCE(oi.qty, 1) AS order_qty,
            u.email,
            p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     WHERE fr.status = 'pending'
       AND fr.assigned_booster_id IS NULL
     ORDER BY fr.id ASC
     LIMIT $1 OFFSET $2`,
    [lim, off],
  )
}


export async function boosterClaimFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const up = await client.query(
      `UPDATE farm_requests
       SET assigned_booster_id = $2,
           assigned_at = now()
       WHERE id = $1
         AND status = 'pending'
         AND assigned_booster_id IS NULL
       RETURNING id`,
      [rid, bid],
    )

    if (up.rowCount < 1) {
      const rRes = await client.query('SELECT id, status, assigned_booster_id FROM farm_requests WHERE id = $1', [rid])
      const r = rRes.rows?.[0]
      await client.query('ROLLBACK')
      if (!r) throw new Error('not_found')
      if (r.assigned_booster_id != null) throw new Error('already_claimed')
      throw new Error('locked')
    }

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'claim', meta: null })
    await client.query('COMMIT')
    return { ok: true }
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


export async function boosterCancelFarmRequest({ id, boosterId, note }) {
  const rid = Number(id)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')
  const cancelNote = String(note ?? '').trim()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT fr.id, fr.delivery_id, fr.user_id, fr.order_id, fr.order_item_id, fr.status, fr.assigned_booster_id
       FROM farm_requests fr
       WHERE fr.id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled') {
      await client.query('ROLLBACK')
      throw new Error('already_fulfilled')
    }

    if (currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query(
        `UPDATE farm_requests
         SET cancel_note = COALESCE(NULLIF($2, ''), cancel_note), cancelled_at = COALESCE(cancelled_at, now())
         WHERE id = $1`,
        [rid, cancelNote],
      )
      await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'cancel', meta: { refunded: false } })
      await client.query('COMMIT')
      return { ok: true, refunded: false }
    }

    if (!['pending', 'in_progress'].includes(currentStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const oiRes = await client.query(
      `SELECT qty, unit_price_points
       FROM order_items
       WHERE id = $1`,
      [r.order_item_id],
    )
    const oi = oiRes.rows?.[0]
    const qty = Number(oi?.qty ?? 0)
    const unit = Number(oi?.unit_price_points ?? 0)
    const refund = qty * unit
    if (!Number.isFinite(refund) || refund <= 0) {
      await client.query('ROLLBACK')
      throw new Error('invalid_refund')
    }

    const refType = 'farm_cancel'
    const refId = `farm:${rid}`
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, $3, $4)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [r.user_id, refund, refType, refId],
    )
    const applied = txRes.rowCount > 0
    if (applied) {
      await client.query(
        `UPDATE wallets
         SET balance = balance + $1, updated_at = now()
         WHERE user_id = $2`,
        [refund, r.user_id],
      )
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'cancelled', payload_masked = $2, payload = NULL
       WHERE id = $1`,
      [r.delivery_id, cancelNote || 'ยกเลิก'],
    )

    await client.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE id = $1`,
      [r.order_id],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'cancelled', cancel_note = $2, cancelled_at = now()
       WHERE id = $1`,
      [rid, cancelNote || null],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'cancel', meta: { refunded: applied, points: refund, reason: cancelNote || null } })
    await client.query('COMMIT')
    return { ok: true, refunded: applied, points: refund }
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


export async function boosterReleaseFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id, started_at
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }
    const st = String(r.status)
    if (st === 'fulfilled' || st === 'cancelled' || st === 'canceled') {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }
    if (r.started_at) {
      await client.query('ROLLBACK')
      throw new Error('already_started')
    }

    await client.query(
      `UPDATE farm_requests
       SET assigned_booster_id = NULL,
           assigned_at = NULL
       WHERE id = $1`,
      [rid],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'release', meta: null })
    await client.query('COMMIT')
    return { ok: true }
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


export async function queueReleaseExpiredBoosterClaims({ slaSeconds = 300, limit = 50 } = {}) {
  const sla = Number(slaSeconds)
  const lim = Number(limit)
  if (!Number.isFinite(sla) || sla <= 0) throw new Error('invalid_sla_seconds')
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const cutoffRes = await client.query(`SELECT now() - ($1::text || ' seconds')::interval AS cutoff`, [sla])
    const cutoff = cutoffRes.rows?.[0]?.cutoff

    const candRes = await client.query(
      `SELECT id, assigned_booster_id
       FROM farm_requests
       WHERE status = 'pending'
         AND assigned_booster_id IS NOT NULL
         AND started_at IS NULL
         AND assigned_at IS NOT NULL
         AND assigned_at < $1
       ORDER BY assigned_at ASC
       LIMIT $2
       FOR UPDATE SKIP LOCKED`,
      [cutoff, lim],
    )

    const rows = Array.isArray(candRes.rows) ? candRes.rows : []
    if (rows.length < 1) {
      await client.query('COMMIT')
      return { ok: true, released: 0 }
    }

    for (const r of rows) {
      const rid = Number(r.id)
      const prevBoosterId = Number(r.assigned_booster_id)
      if (!Number.isFinite(rid) || !Number.isFinite(prevBoosterId)) continue

      await client.query(
        `UPDATE farm_requests
         SET assigned_booster_id = NULL,
             assigned_at = NULL
         WHERE id = $1`,
        [rid],
      )

      await logBoosterAction(client, {
        boosterId: prevBoosterId,
        requestId: rid,
        action: 'sla_release',
        meta: { sla_seconds: sla },
      })
    }

    await client.query('COMMIT')
    return { ok: true, released: rows.length }
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


export async function boosterStartFarmRequest({ requestId, boosterId }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id, started_at
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (r.assigned_booster_id == null) {
      // auto-assign to this booster
      await client.query(
        `UPDATE farm_requests SET assigned_booster_id = $2, assigned_at = now() WHERE id = $1`,
        [rid, bid],
      )
    } else if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled' || currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    await client.query(
      `UPDATE farm_requests
       SET status = CASE WHEN status = 'pending' THEN 'in_progress' ELSE status END,
           started_at = COALESCE(started_at, now())
       WHERE id = $1`,
      [rid],
    )

    await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'start', meta: null })
    await client.query('COMMIT')
    return { ok: true }
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


export async function boosterFulfillFarmRequest({ requestId, boosterId, payload }) {
  const rid = Number(requestId)
  const bid = Number(boosterId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(bid)) throw new Error('invalid_booster_id')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT id, status, assigned_booster_id
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (Number(r.assigned_booster_id) !== bid) {
      await client.query('ROLLBACK')
      throw new Error('not_assigned')
    }

    if (String(r.status) === 'pending') {
      await client.query(
        `UPDATE farm_requests
         SET status = 'in_progress', started_at = COALESCE(started_at, now())
         WHERE id = $1`,
        [rid],
      )
      await logBoosterAction(client, { boosterId: bid, requestId: rid, action: 'start', meta: { implicit: true } })
    }

    await client.query('COMMIT')
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

  await adminFulfillFarmRequest({ id: rid, payload })

  const client2 = await pool.connect()
  try {
    await client2.query('BEGIN')
    await logBoosterAction(client2, { boosterId: bid, requestId: rid, action: 'fulfill', meta: null })
    await client2.query('COMMIT')
    return { ok: true }
  } catch (e) {
    try {
      await client2.query('ROLLBACK')
    } catch {
      // ignore
    }
    throw e
  } finally {
    client2.release()
  }
}


export async function adminStartFarmRequest({ id, staffId }) {
  const rid = Number(id)
  const sid = Number(staffId) || null
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const row = await get(
    `UPDATE farm_requests
     SET status = 'in_progress',
         started_at = COALESCE(started_at, now()),
         assigned_booster_id = CASE WHEN assigned_booster_id IS NULL AND $2::bigint IS NOT NULL THEN $2::bigint ELSE assigned_booster_id END,
         assigned_at = CASE WHEN assigned_booster_id IS NULL AND $2::bigint IS NOT NULL THEN now() ELSE assigned_at END
     WHERE id = $1
       AND status = 'pending'
     RETURNING id, status, started_at, assigned_booster_id`,
    [rid, sid],
  )
  if (!row) throw new Error('not_pending')
  return row
}


export async function adminCancelFarmRequest({ id, note }) {
  const rid = Number(id)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const cancelNote = String(note ?? '').trim()

  const client = await pool.connect()
  try {
    await client.query('BEGIN')

    const rRes = await client.query(
      `SELECT fr.id, fr.delivery_id, fr.user_id, fr.order_id, fr.order_item_id, fr.status
       FROM farm_requests fr
       WHERE fr.id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }

    const currentStatus = String(r.status)
    if (currentStatus === 'fulfilled') {
      await client.query('ROLLBACK')
      throw new Error('already_fulfilled')
    }

    if (currentStatus === 'cancelled' || currentStatus === 'canceled') {
      await client.query(
        `UPDATE farm_requests
         SET cancel_note = COALESCE(NULLIF($2, ''), cancel_note), cancelled_at = COALESCE(cancelled_at, now())
         WHERE id = $1`,
        [rid, cancelNote],
      )
      await client.query('COMMIT')
      return { ok: true, refunded: false }
    }

    if (!['pending', 'in_progress'].includes(currentStatus)) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const oiRes = await client.query(
      `SELECT qty, unit_price_points
       FROM order_items
       WHERE id = $1`,
      [r.order_item_id],
    )
    const oi = oiRes.rows?.[0]
    const qty = Number(oi?.qty ?? 0)
    const unit = Number(oi?.unit_price_points ?? 0)
    const refund = qty * unit
    if (!Number.isFinite(refund) || refund <= 0) {
      await client.query('ROLLBACK')
      throw new Error('invalid_refund')
    }

    const refType = 'farm_cancel'
    const refId = `farm:${rid}`
    const txRes = await client.query(
      `INSERT INTO transactions (user_id, type, points, ref_type, ref_id)
       VALUES ($1, 'credit', $2, $3, $4)
       ON CONFLICT (ref_type, ref_id) DO NOTHING
       RETURNING id`,
      [r.user_id, refund, refType, refId],
    )
    const applied = txRes.rowCount > 0
    if (applied) {
      await client.query(
        `UPDATE wallets
         SET balance = balance + $1, updated_at = now()
         WHERE user_id = $2`,
        [refund, r.user_id],
      )
    }

    await client.query(
      `UPDATE deliveries
       SET status = 'cancelled', payload_masked = $2, payload = NULL
       WHERE id = $1`,
      [r.delivery_id, cancelNote || 'ยกเลิก'],
    )

    await client.query(
      `UPDATE orders
       SET status = 'cancelled'
       WHERE id = $1`,
      [r.order_id],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'cancelled', cancel_note = $2, cancelled_at = now()
       WHERE id = $1`,
      [rid, cancelNote || null],
    )

    await client.query('COMMIT')
    return { ok: true, refunded: applied, points: refund }
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


export async function adminListFarmRequests({ limit = 200, offset = 0, status, assignedTo, search, scope, staffUserId } = {}) {
  const lim = Number(limit)
  const off = Number(offset)
  if (!Number.isFinite(lim) || lim <= 0 || lim > 500) throw new Error('invalid_limit')
  if (!Number.isFinite(off) || off < 0) throw new Error('invalid_offset')
  const st = typeof status === 'string' && status.trim() ? status.trim() : null
  const staffId = staffUserId == null || staffUserId === '' ? null : Number(staffUserId)

  const scopeRaw = typeof scope === 'string' ? scope.trim().toLowerCase() : ''
  const queueScope = scopeRaw || 'all'

  const assignedRaw = typeof assignedTo === 'string' ? assignedTo.trim().toLowerCase() : assignedTo
  const unassignedOnly = assignedRaw === 'unassigned'
  const mineOnly = assignedRaw === 'me'
  const a = unassignedOnly || mineOnly || assignedTo == null || assignedTo === '' ? null : Number(assignedTo)

  const q = typeof search === 'string' ? search.trim() : ''

  const where = []
  const params = []

  if (st) {
    params.push(st)
    where.push(`fr.status = $${params.length}`)
  }

  if (queueScope === 'mine') {
    if (Number.isFinite(staffId) && staffId > 0) {
      params.push(staffId)
      where.push(`fr.assigned_booster_id = $${params.length}`)
    }
    if (!st) where.push(`fr.status IN ('pending', 'in_progress')`)
  } else if (queueScope === 'unassigned') {
    where.push(`fr.assigned_booster_id IS NULL`)
    if (!st) where.push(`fr.status = 'pending'`)
  } else if (queueScope === 'in_progress') {
    where.push(`fr.status = 'in_progress'`)
  }

  if (unassignedOnly) {
    where.push('fr.assigned_booster_id IS NULL')
  } else if (mineOnly) {
    if (Number.isFinite(staffId) && staffId > 0) {
      params.push(staffId)
      where.push(`fr.assigned_booster_id = $${params.length}`)
    }
  } else if (a != null && Number.isFinite(a)) {
    params.push(a)
    where.push(`fr.assigned_booster_id = $${params.length}`)
  }

  if (q) {
    params.push(`%${q.replace(/[%_]/g, '')}%`)
    where.push(`(u.email ILIKE $${params.length} OR p.name ILIKE $${params.length} OR CAST(fr.id AS TEXT) ILIKE $${params.length} OR CAST(fr.order_id AS TEXT) ILIKE $${params.length})`)
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''
  const baseParams = [...params]
  const listParams = [...baseParams, lim, off]

  const [items, summaryRow] = await Promise.all([
    all(
      `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
              fr.cancel_note, fr.cancelled_at,
              fr.uid, fr.uid_confirmed,
              fr.delivery_id, fr.order_id, fr.order_item_id,
              COALESCE(oi.qty, 1) AS order_qty,
              u.email, u.email AS user_email,
              u.username AS user_username,
              COALESCE(u.display_name, u.username) AS user_display_name,
              p.name AS product_name,
              p.fulfillment_type,
              fr.assigned_booster_id,
              ab.email AS assigned_booster_email,
              ab.username AS assigned_username,
              COALESCE(ab.display_name, ab.username, ab.email) AS assigned_display_name
       FROM farm_requests fr
       LEFT JOIN order_items oi ON oi.id = fr.order_item_id
       JOIN users u ON u.id = fr.user_id
       JOIN products p ON p.id = fr.product_id
       LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
       ${whereSql}
       ORDER BY fr.id DESC
       LIMIT $${listParams.length - 1} OFFSET $${listParams.length}`,
      listParams,
    ),
    get(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'pending')::int AS pending_count,
         COUNT(*) FILTER (WHERE status = 'in_progress')::int AS in_progress_count,
         COUNT(*) FILTER (WHERE status = 'fulfilled')::int AS fulfilled_count,
         COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_count,
         COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND assigned_booster_id IS NULL)::int AS unassigned_count,
         COUNT(*) FILTER (WHERE status IN ('pending', 'in_progress') AND assigned_booster_id = $1)::int AS mine_count,
         COUNT(*) FILTER (WHERE status = 'pending' AND assigned_booster_id IS NULL AND created_at <= now() - interval '30 minutes')::int AS over_sla_count
       FROM farm_requests`,
      [Number.isFinite(staffId) && staffId > 0 ? Math.trunc(staffId) : -1],
    ),
  ])

  return {
    items,
    total: Number(summaryRow?.total || 0),
    summary: {
      pending: Number(summaryRow?.pending_count || 0),
      in_progress: Number(summaryRow?.in_progress_count || 0),
      fulfilled: Number(summaryRow?.fulfilled_count || 0),
      cancelled: Number(summaryRow?.cancelled_count || 0),
      unassigned: Number(summaryRow?.unassigned_count || 0),
      mine: Number(summaryRow?.mine_count || 0),
      over_sla: Number(summaryRow?.over_sla_count || 0),
    },
  }
}


export async function adminGetFarmRequestDetail(requestId) {
  const rid = Number(requestId)
  if (!Number.isFinite(rid) || rid <= 0) throw new Error('invalid_request_id')

  const request = await get(
    `SELECT fr.id, fr.status, fr.created_at, fr.assigned_at, fr.started_at, fr.fulfilled_at,
            fr.cancel_note, fr.cancelled_at,
            fr.username, fr.password, fr.auth_key, fr.uid, fr.uid_confirmed, fr.form_data,
            fr.delivery_id, fr.order_id, fr.order_item_id, fr.product_option,
            COALESCE(oi.qty, 1) AS order_qty,
            oi.unit_price_points,
            u.id AS user_id, u.email, u.email AS user_email,
            u.username AS user_username,
            COALESCE(u.display_name, u.username) AS user_display_name,
            p.id AS product_id, p.name AS product_name,
            p.fulfillment_type, p.farm_form_fields,
            p.farm_form_username_enabled, p.farm_form_password_enabled, p.farm_form_auth_key_enabled,
            fr.assigned_booster_id,
            ab.email AS assigned_booster_email,
            ab.username AS assigned_username,
            COALESCE(ab.display_name, ab.username, ab.email) AS assigned_display_name,
            d.status AS delivery_status, d.payload_masked
     FROM farm_requests fr
     LEFT JOIN order_items oi ON oi.id = fr.order_item_id
     JOIN users u ON u.id = fr.user_id
     JOIN products p ON p.id = fr.product_id
     LEFT JOIN users ab ON ab.id = fr.assigned_booster_id
     LEFT JOIN deliveries d ON d.id = fr.delivery_id
     WHERE fr.id = $1`,
    [rid],
  )
  if (!request) throw new Error('not_found')

  const logs = await all(
    `SELECT bal.id, bal.booster_id, bal.action, bal.meta, bal.created_at,
            bu.email AS booster_email, bu.display_name AS booster_display_name
     FROM booster_action_logs bal
     LEFT JOIN users bu ON bu.id = bal.booster_id
     WHERE bal.farm_request_id = $1
     ORDER BY bal.id ASC`,
    [rid],
  )

  return { request, logs }
}


export async function adminFulfillFarmRequest({ id, payload }) {
  const rid = Number(id)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  const finalPayload = String(payload ?? '').trim()
  if (!finalPayload) throw new Error('invalid_payload')

  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const rRes = await client.query(
      `SELECT id, delivery_id, status
       FROM farm_requests
       WHERE id = $1
       FOR UPDATE`,
      [rid],
    )
    const r = rRes.rows?.[0]
    if (!r) {
      await client.query('ROLLBACK')
      throw new Error('not_found')
    }
    if (!['pending', 'in_progress'].includes(String(r.status))) {
      await client.query('ROLLBACK')
      throw new Error('locked')
    }

    const masked = maskPayload(finalPayload)
    await client.query(
      `UPDATE deliveries
       SET status = 'pending_claim', payload_masked = $2, payload = $3
       WHERE id = $1`,
      [r.delivery_id, masked, finalPayload],
    )

    await client.query(
      `UPDATE farm_requests
       SET status = 'fulfilled', fulfilled_at = now()
       WHERE id = $1`,
      [rid],
    )

    const delivRow = await client.query(
      `SELECT user_id FROM deliveries WHERE id = $1 LIMIT 1`,
      [r.delivery_id],
    )
    const delivUserId = delivRow.rows?.[0]?.user_id || null

    await client.query('COMMIT')

    if (delivUserId) {
      sendPushToUser(delivUserId, {
        title: '✅ สินค้าของคุณพร้อมแล้ว!',
        body: 'เข้าไปที่กล่องรับของเพื่อรับสินค้าของคุณ',
        link: '/inbox',
        tag: `delivery-ready-${r.delivery_id}`,
        require_interaction: true,
      }).catch(() => {})
    }

    return { ok: true }
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


export async function adminAddFarmRequestNote({ id, staffId, note }) {
  const rid = Number(id)
  const sid = Number(staffId)
  if (!Number.isFinite(rid)) throw new Error('invalid_request_id')
  if (!Number.isFinite(sid)) throw new Error('invalid_staff_id')
  const content = String(note ?? '').trim()
  if (!content) throw new Error('invalid_note')

  const res = await query(
    `INSERT INTO booster_action_logs (booster_id, farm_request_id, action, meta)
     VALUES ($1, $2, 'note', $3)
     RETURNING id, booster_id, farm_request_id, action, meta, created_at`,
    [sid, rid, JSON.stringify({ note: content })],
  )
  return res.rows?.[0] || null
}

