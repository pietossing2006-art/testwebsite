import test from 'node:test'
import assert from 'node:assert/strict'

import {
  DEFAULT_TOPUP_SETTINGS,
  normalizeTopupSettings,
  toPublicTopupSettings,
  getEffectiveTopupConfig,
} from '../../lib/topupSettings.js'

test('DEFAULT_TOPUP_SETTINGS includes phone and target fields', () => {
  assert.equal(DEFAULT_TOPUP_SETTINGS.truemoney_phone, '')
  assert.equal(DEFAULT_TOPUP_SETTINGS.promptpay_target, '')
  assert.equal(DEFAULT_TOPUP_SETTINGS.promptpay_name, '')
  assert.equal(DEFAULT_TOPUP_SETTINGS.angpao, true)
  assert.equal(DEFAULT_TOPUP_SETTINGS.promptpay, true)
  assert.equal(DEFAULT_TOPUP_SETTINGS.coupon, true)
})

test('normalizeTopupSettings strips dashes, spaces and trims phone/target numbers', () => {
  const normalized = normalizeTopupSettings({
    angpao: true,
    truemoney_phone: ' 095-250-1621 ',
    promptpay_target: ' 1-1002-00345-67-8 ',
    promptpay_name: '  VxperS Official  ',
  })

  assert.equal(normalized.truemoney_phone, '0952501621')
  assert.equal(normalized.promptpay_target, '1100200345678')
  assert.equal(normalized.promptpay_name, 'VxperS Official')
})

test('toPublicTopupSettings prevents leaking phone numbers or targets to anonymous clients', () => {
  const adminSettings = {
    angpao: true,
    coupon: true,
    promptpay: true,
    truemoney_phone: '0952501621',
    promptpay_target: '0952501621',
    promptpay_name: 'VxperS Store',
  }

  const publicSettings = toPublicTopupSettings(adminSettings)

  assert.deepEqual(publicSettings, {
    angpao: true,
    coupon: true,
    promptpay: true,
  })
  assert.equal('truemoney_phone' in publicSettings, false)
  assert.equal('promptpay_target' in publicSettings, false)
  assert.equal('promptpay_name' in publicSettings, false)
})

test('getEffectiveTopupConfig falls back to .env values when DB settings are empty', async () => {
  const previousPhone = process.env.TW_VOUCHER_PHONE
  const previousPromptpay = process.env.PROMPTPAY_TARGET
  try {
    process.env.TW_VOUCHER_PHONE = '0952501621'
    process.env.PROMPTPAY_TARGET = '0952501621'

    const config = await getEffectiveTopupConfig()
    assert.ok(config.truemoneyPhone, 'must resolve a phone number')
    assert.ok(config.promptpayTarget, 'must resolve a promptpay target')
  } finally {
    process.env.TW_VOUCHER_PHONE = previousPhone
    process.env.PROMPTPAY_TARGET = previousPromptpay
  }
})
