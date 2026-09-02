import { resolveDiscountQuote } from '../../lib/growthDiscounts.js'
import { generateOrderRef, pool } from '../pool.js'
import { recountProductStockFromPools } from '../stock.js'
import {
  assertBundlePurchasable, buildBundleQuote, computeMysteryEffectiveWeights, drawLinkedProductPrize,
  drawProductPrize, drawSaltPrize, findBundleStockPool, getBundleItemQty, getBundleWithItems,
  getProductById, pickWeightedIndex, requireProductOption, resolveProductOption, secureRandom01,
} from '../catalog.js'
import {
  campaignToDiscountCandidate, computeDiscountedUnitPrice, couponToDiscountCandidate,
  getActivePromotionForProduct, getMyVip, insertOrderDiscountApplications, listActiveGrowthCampaigns,
  lockAndValidateDiscountCoupon, promotionToDiscountCandidate, readAndValidateDiscountCoupon,
  vipToDiscountCandidate, volumePricingToDiscountCandidate,
} from '../growth.js'
import { logAuditEvent, sendPushToUser } from '../support.js'
import { autoAssignFarmRequest } from './assignment.js'


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
