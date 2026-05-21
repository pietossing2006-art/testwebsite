import { requiredString, z } from './validation.js'

export const VALID_USERNAME_RE = /^[a-zA-Z0-9._-]+$/
export const ASCII_PRINTABLE_RE = /^[\x20-\x7E]+$/
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const stringWithCode = (code) => requiredString(code).transform((value) => String(value))
const trimmedStringWithCode = (code) => stringWithCode(code).transform((value) => value.trim())
const optionalTrimmedString = z.unknown().optional().transform((value) => (typeof value === 'string' ? value.trim() : null))
const finiteNumberWithCode = (code) =>
  z
    .custom((value) => Number.isFinite(Number(value)), { message: code })
    .transform((value) => Number(value))
const positiveNumberWithCode = (code) =>
  z
    .custom((value) => Number.isFinite(Number(value)) && Number(value) > 0, { message: code })
    .transform((value) => Number(value))
const nonNegativeNumberWithCode = (code, fallback = 0) =>
  z
    .unknown()
    .optional()
    .transform((value) => (value == null || value === '' ? fallback : value))
    .pipe(
      z
        .custom((value) => Number.isFinite(Number(value)) && Number(value) >= 0, { message: code })
        .transform((value) => Number(value)),
    )

export const RegisterBodySchema = z
  .object({
    email: trimmedStringWithCode('invalid_email')
      .pipe(z.string().regex(EMAIL_RE, { message: 'invalid_email' }))
      .transform((value) => value.toLowerCase()),
    password: stringWithCode('weak_password')
      .pipe(z.string().min(8, { message: 'weak_password' }))
      .pipe(z.string().regex(ASCII_PRINTABLE_RE, { message: 'invalid_password_charset' })),
    username: trimmedStringWithCode('invalid_username')
      .pipe(z.string().min(6, { message: 'invalid_username' }))
      .pipe(z.string().regex(VALID_USERNAME_RE, { message: 'invalid_username_charset' })),
    remember: z.unknown().optional(),
  })
  .passthrough()

export const LoginBodySchema = z
  .object({
    login: z.string().optional(),
    email: z.string().optional(),
    password: requiredString('invalid_payload').transform((value) => String(value)),
    remember: z.unknown().optional(),
  })
  .passthrough()
  .refine((data) => typeof data.login === 'string' || typeof data.email === 'string', { message: 'invalid_payload' })
  .transform((data) => ({
    ...data,
    identifier: typeof data.login === 'string' ? data.login : data.email,
  }))

export const ProfileBodySchema = z
  .object({
    display_name: z.unknown().optional().transform((value) => (typeof value === 'string' ? value : null)),
    avatar_url: z.unknown().optional().transform((value) => (typeof value === 'string' ? value : null)),
  })
  .passthrough()

export const PasswordChangeBodySchema = z
  .object({
    old_password: requiredString('invalid_payload').transform((value) => String(value)),
    new_password: stringWithCode('invalid_payload')
      .pipe(z.string().min(8, { message: 'weak_password' }))
      .pipe(z.string().regex(ASCII_PRINTABLE_RE, { message: 'invalid_password_charset' })),
    discord_code: z.union([z.string(), z.undefined(), z.null()]).transform((value) => (typeof value === 'string' ? value : null)),
  })
  .passthrough()

export const AvatarUploadBodySchema = z
  .object({
    image_data: requiredString('invalid_image_data').transform((value) => String(value)),
  })
  .passthrough()

export const TopupAngpaoBodySchema = z
  .object({
    reference: trimmedStringWithCode('invalid_reference'),
  })
  .passthrough()

export const TopupPromptpayBodySchema = z
  .object({
    points: positiveNumberWithCode('invalid_points'),
  })
  .passthrough()

export const PromptpaySlipBodySchema = z
  .object({})
  .passthrough()
  .transform((data, ctx) => {
    const topupId = Number(data.topup_id ?? data.topupId)
    const slipImage = data.slip_image ?? data.slipImage ?? data.image_data ?? data.imageData
    if (!Number.isFinite(topupId)) {
      ctx.addIssue({ code: 'custom', message: 'invalid_topup_id' })
      return z.NEVER
    }
    if (typeof slipImage !== 'string' || !slipImage.trim()) {
      ctx.addIssue({ code: 'custom', message: 'invalid_slip_image' })
      return z.NEVER
    }
    return { topup_id: topupId, slip_image: slipImage }
  })

export const AdminPasswordBodySchema = z
  .object({
    password: stringWithCode('weak_password').pipe(z.string().min(8, { message: 'weak_password' })),
  })
  .passthrough()

export const CategoryBodySchema = z
  .object({
    name: trimmedStringWithCode('invalid_name').pipe(z.string().min(1, { message: 'invalid_name' })),
    slug: trimmedStringWithCode('invalid_slug').pipe(z.string().min(1, { message: 'invalid_slug' })),
    image_url: z.unknown().optional(),
    description: optionalTrimmedString.transform((value) => value || ''),
  })
  .passthrough()

export const CouponRedeemBodySchema = z
  .object({
    code: trimmedStringWithCode('invalid_code').pipe(z.string().min(1, { message: 'invalid_code' })),
  })
  .passthrough()

export const ProductBodySchema = z
  .object({
    category_id: finiteNumberWithCode('invalid_category_id'),
    name: trimmedStringWithCode('invalid_name').pipe(z.string().min(1, { message: 'invalid_name' })),
    slug: trimmedStringWithCode('invalid_slug').pipe(z.string().min(1, { message: 'invalid_slug' })),
    price: finiteNumberWithCode('invalid_price'),
    description: z.unknown().optional(),
    image_url: z.unknown().optional(),
    stock: nonNegativeNumberWithCode('invalid_stock', 0),
    highlights: z.unknown().optional(),
    manual_url: z.unknown().optional(),
    manual_text: z.unknown().optional(),
    manual_video_url: z.unknown().optional(),
    fulfillment_type: z.unknown().optional(),
    farm_form_username_enabled: z.unknown().optional(),
    farm_form_password_enabled: z.unknown().optional(),
    farm_form_auth_key_enabled: z.unknown().optional(),
    farm_form_fields: z.unknown().optional(),
    product_options: z.unknown().optional(),
    sort_order: finiteNumberWithCode('invalid_sort_order')
      .optional()
      .transform((value) => (value == null ? 0 : value)),
    is_featured: z.unknown().optional(),
    is_unlimited_stock: z.unknown().optional(),
  })
  .passthrough()

export const StockItemsBodySchema = z
  .object({
    target_id: finiteNumberWithCode('invalid_id'),
    items: z.unknown().optional(),
    text: z.unknown().optional(),
  })
  .transform((data) => {
    const items = Array.isArray(data.items)
      ? data.items.map((item) => String(item).trim()).filter(Boolean)
      : typeof data.text === 'string'
        ? data.text
            .split(/\r?\n/)
            .map((item) => item.trim())
            .filter(Boolean)
        : []
    return { target_id: data.target_id, items }
  })
