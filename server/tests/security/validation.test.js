import test from 'node:test'
import assert from 'node:assert/strict'

import { validateBody } from '../../lib/validation.js'
import {
  AvatarUploadBodySchema,
  AdminPasswordBodySchema,
  CategoryBodySchema,
  CouponRedeemBodySchema,
  LoginBodySchema,
  PasswordChangeBodySchema,
  PromptpaySlipBodySchema,
  ProductBodySchema,
  RegisterBodySchema,
  ReviewBodySchema,
  StockItemsBodySchema,
  TopupAngpaoBodySchema,
  TopupPromptpayBodySchema,
} from '../../lib/requestSchemas.js'

test('RegisterBodySchema normalizes valid account input', () => {
  const parsed = validateBody(RegisterBodySchema, {
    email: '  USER@Example.COM ',
    password: 'strong-password-1',
    username: '  player_01 ',
    remember: 1,
  })

  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.email, 'user@example.com')
  assert.equal(parsed.data.username, 'player_01')
  assert.equal(parsed.data.password, 'strong-password-1')
  assert.equal(parsed.data.remember, 1)
})

test('RegisterBodySchema preserves route-specific error codes', () => {
  assert.deepEqual(validateBody(RegisterBodySchema, { email: 'bad', password: 'strong-password-1', username: 'player_01' }), {
    ok: false,
    error: 'invalid_email',
  })
  assert.deepEqual(validateBody(RegisterBodySchema, { email: 'u@example.com', password: 'short', username: 'player_01' }), {
    ok: false,
    error: 'weak_password',
  })
  assert.deepEqual(validateBody(RegisterBodySchema, { email: 'u@example.com', password: 'strong-password-1', username: 'player thai' }), {
    ok: false,
    error: 'invalid_username_charset',
  })
})

test('LoginBodySchema produces the effective login identifier', () => {
  const withLogin = validateBody(LoginBodySchema, { login: 'player_01', password: 'secret' })
  const withEmail = validateBody(LoginBodySchema, { email: 'u@example.com', password: 'secret' })

  assert.equal(withLogin.ok, true)
  assert.equal(withLogin.data.identifier, 'player_01')
  assert.equal(withEmail.ok, true)
  assert.equal(withEmail.data.identifier, 'u@example.com')
  assert.deepEqual(validateBody(LoginBodySchema, { email: 123, password: 'secret' }), { ok: false, error: 'invalid_payload' })
})

test('PasswordChangeBodySchema validates new password constraints', () => {
  assert.equal(
    validateBody(PasswordChangeBodySchema, {
      old_password: 'old-password',
      new_password: 'new-password',
      discord_code: ' 123456 ',
    }).ok,
    true,
  )
  assert.deepEqual(validateBody(PasswordChangeBodySchema, { old_password: 'old-password', new_password: 'short' }), {
    ok: false,
    error: 'weak_password',
  })
  assert.deepEqual(validateBody(PasswordChangeBodySchema, { old_password: 'old-password', new_password: 'รหัสผ่านใหม่' }), {
    ok: false,
    error: 'invalid_password_charset',
  })
})

test('AvatarUploadBodySchema requires an image data string', () => {
  assert.equal(validateBody(AvatarUploadBodySchema, { image_data: 'data:image/png;base64,AA==' }).ok, true)
  assert.deepEqual(validateBody(AvatarUploadBodySchema, { image_data: null }, { fallbackError: 'invalid_image_data' }), {
    ok: false,
    error: 'invalid_image_data',
  })
})

test('topup schemas normalize payment request bodies', () => {
  assert.deepEqual(validateBody(TopupAngpaoBodySchema, { reference: ' https://gift.truemoney.com/campaign/?v=abc ' }).data, {
    reference: 'https://gift.truemoney.com/campaign/?v=abc',
  })
  assert.deepEqual(validateBody(TopupPromptpayBodySchema, { points: '150' }).data, { points: 150 })
  assert.deepEqual(validateBody(PromptpaySlipBodySchema, { topupId: '12', imageData: 'data:image/png;base64,AA==' }).data, {
    topup_id: 12,
    slip_image: 'data:image/png;base64,AA==',
  })
})

test('topup schemas preserve route error codes', () => {
  assert.deepEqual(validateBody(TopupPromptpayBodySchema, { points: '0' }), { ok: false, error: 'invalid_points' })
  assert.deepEqual(validateBody(PromptpaySlipBodySchema, { topup_id: 'x', slip_image: 'data:image/png;base64,AA==' }), {
    ok: false,
    error: 'invalid_topup_id',
  })
})

test('admin/catalog schemas validate small management forms', () => {
  assert.deepEqual(validateBody(AdminPasswordBodySchema, { password: 'new-admin-password' }).data, {
    password: 'new-admin-password',
  })
  assert.deepEqual(
    validateBody(CategoryBodySchema, {
      name: '  Premium ',
      slug: ' premium ',
      image_url: '/uploads/cat.png',
      description: '  Store tier ',
    }).data,
    {
      name: 'Premium',
      slug: 'premium',
      image_url: '/uploads/cat.png',
      description: 'Store tier',
    },
  )
  assert.deepEqual(validateBody(CouponRedeemBodySchema, { code: '  SAVE10 ' }).data, { code: 'SAVE10' })
  assert.deepEqual(validateBody(AdminPasswordBodySchema, { password: 'short' }), { ok: false, error: 'weak_password' })
  assert.deepEqual(validateBody(CategoryBodySchema, { name: '', slug: 'premium' }), { ok: false, error: 'invalid_name' })
  assert.deepEqual(validateBody(CouponRedeemBodySchema, { code: '' }), { ok: false, error: 'invalid_code' })
})

test('ProductBodySchema normalizes product management fields', () => {
  const parsed = validateBody(ProductBodySchema, {
    category_id: '2',
    name: '  Nitro Pack ',
    slug: ' nitro-pack ',
    price: '499',
    stock: '7',
    sort_order: '3',
    is_featured: 1,
    product_options: [{ option_id: 'monthly' }],
  })

  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.category_id, 2)
  assert.equal(parsed.data.name, 'Nitro Pack')
  assert.equal(parsed.data.slug, 'nitro-pack')
  assert.equal(parsed.data.price, 499)
  assert.equal(parsed.data.stock, 7)
  assert.equal(parsed.data.sort_order, 3)
  assert.deepEqual(parsed.data.product_options, [{ option_id: 'monthly' }])

  assert.deepEqual(validateBody(ProductBodySchema, { category_id: 'x', name: 'x', slug: 'x', price: 1 }), {
    ok: false,
    error: 'invalid_category_id',
  })
  assert.deepEqual(validateBody(ProductBodySchema, { category_id: 1, name: '', slug: 'x', price: 1 }), {
    ok: false,
    error: 'invalid_name',
  })
  assert.deepEqual(validateBody(ProductBodySchema, { category_id: 1, name: 'x', slug: 'x', price: 1, stock: -1 }), {
    ok: false,
    error: 'invalid_stock',
  })
})

test('ReviewBodySchema accepts reviewer display name without exposing order item IDs', () => {
  const parsed = validateBody(ReviewBodySchema, {
    reviewer_name: '  ชื่อ  ',
    rating: '5',
    comment: ' รีวิวดีมาก ',
  })

  assert.equal(parsed.ok, true)
  assert.equal(parsed.data.reviewer_name, 'ชื่อ')
  assert.equal(parsed.data.rating, 5)
  assert.equal(parsed.data.comment, 'รีวิวดีมาก')
  assert.equal('order_item_id' in parsed.data, false)
})

test('StockItemsBodySchema normalizes multiline stock input', () => {
  const parsed = validateBody(StockItemsBodySchema, {
    target_id: '9',
    text: " first \n\n second \r\n third ",
  })

  assert.deepEqual(parsed.data, {
    target_id: 9,
    items: ['first', 'second', 'third'],
  })
  assert.deepEqual(validateBody(StockItemsBodySchema, { target_id: 'x', items: [] }, { fallbackError: 'invalid_product_id' }), {
    ok: false,
    error: 'invalid_id',
  })
})
