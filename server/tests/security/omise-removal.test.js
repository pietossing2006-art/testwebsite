import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..', '..')

const activeFiles = [
  'server/routes/topups.js',
  'server/routes/public.js',
  'server/lib/requestSchemas.js',
  'server/tests/security/error-redaction.test.js',
  'server/tests/security/validation.test.js',
  'client/src/pages/Topup.jsx',
  'client/src/pages/TopupHistory.jsx',
]

const omiseIntegrationPattern = /\bomise\b|OMISE_[A-Z0-9_]+|\/api\/(?:topups\/omise|webhooks\/omise|omise)\b/i

test('Omise integration is removed from active code paths', () => {
  for (const file of activeFiles) {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    assert.equal(omiseIntegrationPattern.test(text), false, `${file} still references Omise`)
  }

  assert.equal(fs.existsSync(path.join(root, 'server/lib/omise.js')), false)
})
