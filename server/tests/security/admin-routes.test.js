import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..', '..', '..')

const adminRouteFiles = [
  'server/routes/admin-core.js',
  'server/routes/admin-catalog.js',
  'server/routes/admin-ops.js',
  'server/routes/growth.js',
]

const adminRoutePattern = /router\.(?:get|post|put|patch|delete)\(\s*['"`]\/api\/admin[^'"\n]*['"`][^\n]*/g
const roleGuardPattern = /\b(?:requireAdmin|requireOwner|requireFinance|requireStaff|requireSupportStaff|requireBooster|requireAnyRole|requireStorageMediaAccess)\b/

test('all /api/admin route declarations include an admin or staff role guard', () => {
  for (const file of adminRouteFiles) {
    const text = fs.readFileSync(path.join(root, file), 'utf8')
    const routeLines = text.match(adminRoutePattern) || []
    assert.ok(routeLines.length > 0, `${file} should declare admin routes`)
    for (const line of routeLines) {
      assert.match(line, /\brequireAuth\b|\brequireStorageMediaAccess\b/, `${file}: missing auth guard in ${line}`)
      assert.match(line, roleGuardPattern, `${file}: missing role guard in ${line}`)
    }
  }
})
