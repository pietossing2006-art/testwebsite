# Discord Embed Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refresh the Discord embed system so panels and transactional replies feel premium, readable, and brand-consistent without changing command behavior.

**Architecture:** Keep the visual system centralized in `server/lib/discord/shared/context.js`, then migrate the highest-traffic embed producers to the new shared variants. Add lightweight `node:test` coverage around the embed builders so visual-structure regressions are caught without needing live Discord interactions.

**Tech Stack:** Node.js ESM, `discord.js`, built-in `node:test`, built-in `node:assert/strict`

---

## File Structure

- Modify: `C:\Users\Administrator\Desktop\splitwise\server\package.json`
  - Add a test script for server-side Discord embed coverage.
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\shared\context.js`
  - Centralize branded palette, embed variants, and shared embed formatting behavior.
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\globalpanel.js`
  - Update the global panel embed to use the branded shared helpers and clearer hierarchy.
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\topups.js`
  - Update topup panel and transactional topup embeds to use the branded shared helpers and clearer next-step emphasis.
- Create: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`
  - Verify base embed construction, semantic variants, branded panel helpers, and order embed structure.
- Create: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\panels.test.js`
  - Verify the global panel and topup panel builders produce the intended branded hierarchy.

### Task 1: Add a server test harness for Discord embeds

**Files:**
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\package.json`
- Create: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`

- [ ] **Step 1: Write the failing package and context tests**

Update `C:\Users\Administrator\Desktop\splitwise\server\package.json` to add a server test script:

```json
{
  "name": "server",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "node index.js",
    "start": "node index.js",
    "test": "node --test tests/**/*.test.js"
  }
}
```

Create `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiscordContext } from '../../lib/discord/shared/context.js'

test('buildEmbed applies premium defaults and footer branding', () => {
  const ctx = createDiscordContext()
  const embed = ctx.buildEmbed({
    title: 'Wallet Balance',
    description: 'Latest wallet total for this account.',
    footer: 'Custom footer',
  })
  const json = embed.toJSON()

  assert.equal(json.title, 'Wallet Balance')
  assert.equal(json.description, 'Latest wallet total for this account.')
  assert.equal(json.footer?.text, 'Custom footer')
  assert.ok(json.timestamp)
  assert.equal(typeof json.color, 'number')
})

test('buildOrdersEmbeds produces a header embed plus order cards', () => {
  const ctx = createDiscordContext()
  const embeds = ctx.buildOrdersEmbeds({
    profile: { user_id: 7, display_name: 'VX Tester' },
    orders: [
      {
        id: 81,
        ref: 'ORD-81',
        qty: 2,
        total_points: 600,
        unit_price_points: 300,
        product_name: 'Nitro Boost',
        category_name: 'Discord',
        status: 'paid',
        created_at: '2026-05-18T06:30:00.000Z',
      },
    ],
    emoji: { id: '1', name: 'arrow', animated: false },
  })

  assert.equal(embeds.length, 2)
  assert.equal(embeds[0].toJSON().title, 'Recent Orders')
  assert.match(embeds[1].toJSON().title, /Order/)
})
```

- [ ] **Step 2: Run the test command to verify it fails**

Run:

```powershell
npm test
```

Expected: FAIL because the repository does not yet contain `server/tests/discord/context.test.js`, and after adding it the assertions will fail until the branded embed behavior is implemented.

- [ ] **Step 3: Add the minimal test harness implementation**

Create the `server/tests/discord` directory if it does not exist, then save the test file exactly as written above and keep the `package.json` script change minimal. Do not change production code yet.

- [ ] **Step 4: Run the targeted test file and confirm the red state**

Run:

```powershell
node --test .\tests\discord\context.test.js
```

Expected: FAIL with assertion mismatches or missing helper behavior that the branded embed refactor will introduce next.

- [ ] **Step 5: Commit the red test harness**

```powershell
git add server/package.json server/tests/discord/context.test.js
git commit -m "test: add discord embed coverage harness"
```

### Task 2: Refactor the shared Discord context into a branded embed system

**Files:**
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\shared\context.js`
- Test: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`

- [ ] **Step 1: Expand the failing tests to cover branded variants**

Append these tests to `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`:

```js
test('panelEmbed uses the branded panel variant', () => {
  const ctx = createDiscordContext()
  const embed = ctx.panelEmbed('VxperS Store', 'Premium account actions live here.', [
    { name: 'Top Up', value: 'PromptPay, Angpao, Coupon', inline: true },
  ])
  const json = embed.toJSON()

  assert.equal(json.title, 'VxperS Store')
  assert.equal(json.description, 'Premium account actions live here.')
  assert.equal(json.fields?.[0]?.name, 'Top Up')
  assert.equal(json.footer?.text, 'VxperS Store')
})

test('highlightEmbed preserves value-first hierarchy', () => {
  const ctx = createDiscordContext()
  const embed = ctx.highlightEmbed('PromptPay QR Created', 'Scan the QR and verify with your slip.', [
    { name: 'Topup ID', value: '#88', inline: true },
    { name: 'Expires', value: '18 May 2026, 13:45', inline: true },
  ])
  const json = embed.toJSON()

  assert.equal(json.title, 'PromptPay QR Created')
  assert.equal(json.fields?.length, 2)
  assert.ok(json.timestamp)
})
```

- [ ] **Step 2: Run the shared-context tests to verify they fail**

Run:

```powershell
node --test .\tests\discord\context.test.js
```

Expected: FAIL because `panelEmbed()` and `highlightEmbed()` do not exist yet.

- [ ] **Step 3: Implement the branded shared helpers in `context.js`**

Update `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\shared\context.js` so the shared layer exposes explicit branded variants and calmer palette values:

```js
const EMBED_COLORS = {
  primary: 0x3aa0ff,
  discord: 0x4c5bd4,
  panel: 0x2d4f8f,
  highlight: 0xd4a64a,
  success: 0x2fbf71,
  warning: 0xe7a93b,
  danger: 0xd9534f,
  orders: 0x3d6fd6,
}

function buildEmbed({
  title,
  description,
  color = EMBED_COLORS.primary,
  fields,
  imageUrl,
  footer,
} = {}) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(compactText(title || 'VxperS Store', 256))
    .setTimestamp(new Date())

  const desc = String(description ?? '').trim()
  if (desc) embed.setDescription(compactMultilineText(desc, 4096))

  const cleanFields = Array.isArray(fields)
    ? fields
        .filter((field) => field && String(field.name ?? '').trim() && String(field.value ?? '').trim())
        .slice(0, 25)
        .map((field) => ({
          name: compactText(field.name, 256),
          value: compactMultilineText(field.value, 1024),
          inline: Boolean(field.inline),
        }))
    : []

  if (cleanFields.length) embed.addFields(cleanFields)

  const image = String(imageUrl || '').trim()
  if (/^https?:\/\//i.test(image)) embed.setImage(image)

  embed.setFooter({ text: compactText(footer || 'VxperS Store', 2048) })
  return embed
}

function panelEmbed(title, description, fields, imageUrl) {
  return buildEmbed({ title, description, fields, imageUrl, color: EMBED_COLORS.panel, footer: 'VxperS Store' })
}

function highlightEmbed(title, description, fields, imageUrl) {
  return buildEmbed({ title, description, fields, imageUrl, color: EMBED_COLORS.highlight, footer: 'VxperS Store' })
}
```

Also update `buildOrdersEmbeds()` so each order card uses `EMBED_COLORS.orders` rather than the generic primary color.

- [ ] **Step 4: Run the shared-context tests to confirm they pass**

Run:

```powershell
node --test .\tests\discord\context.test.js
```

Expected: PASS for the new branded helper tests and existing order embed structure tests.

- [ ] **Step 5: Commit the shared branded embed system**

```powershell
git add server/lib/discord/shared/context.js server/tests/discord/context.test.js
git commit -m "feat: brand shared discord embeds"
```

### Task 3: Migrate the global panel to the branded panel variant

**Files:**
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\globalpanel.js`
- Create: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\panels.test.js`

- [ ] **Step 1: Write the failing global panel tests**

Create `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\panels.test.js`:

```js
import test from 'node:test'
import assert from 'node:assert/strict'

import { createDiscordContext } from '../../lib/discord/shared/context.js'
import { buildGlobalPanelEmbed } from '../../lib/discord/commands/globalpanel.js'

test('buildGlobalPanelEmbed uses branded panel hierarchy', () => {
  const ctx = createDiscordContext()
  const embed = buildGlobalPanelEmbed(ctx, { id: '1', name: 'arrow', animated: false })
  const json = embed.toJSON()

  assert.equal(json.title, 'VxperS Store')
  assert.ok(json.description?.includes('PromptPay'))
  assert.equal(json.footer?.text, 'VxperS Store')
})
```

- [ ] **Step 2: Run the global panel test and verify it fails**

Run:

```powershell
node --test .\tests\discord\panels.test.js
```

Expected: FAIL because `buildGlobalPanelEmbed` is not exported yet and the panel has not been migrated to the branded helper.

- [ ] **Step 3: Update `globalpanel.js` to use the shared panel builder**

Change `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\globalpanel.js` so `buildGlobalPanelEmbed` is exported and uses `ctx.panelEmbed(...)` with tighter copy:

```js
export function buildGlobalPanelEmbed(ctx, emoji) {
  const arrow = ctx.topupArrow(emoji)
  const image = String(ctx.envValue('DISCORD_GLOBAL_PANEL_IMAGE_URL') || ctx.envValue('DISCORD_PANEL_IMAGE_URL') || '').trim()
  const embed = ctx.panelEmbed(
    'VxperS Store',
    'Premium account actions, topups, and Discord account tools in one place.',
    [
      { name: 'Top Up', value: `${arrow} PromptPay, TrueMoney Angpao, and Coupon`, inline: true },
      { name: 'Account', value: `${arrow} Link, unlink, and profile-linked actions`, inline: true },
      { name: 'Admin', value: `${arrow} Secure staff-only point adjustment tools`, inline: false },
    ],
    image,
  )

  const icon = ctx.storeIconUrl()
  if (/^https?:\/\//i.test(icon)) embed.setThumbnail(icon)
  return embed
}
```

- [ ] **Step 4: Run the panel tests to verify they pass**

Run:

```powershell
node --test .\tests\discord\panels.test.js
```

Expected: PASS for the branded global panel structure.

- [ ] **Step 5: Commit the global panel migration**

```powershell
git add server/lib/discord/commands/globalpanel.js server/tests/discord/panels.test.js
git commit -m "feat: refresh discord global panel embed"
```

### Task 4: Migrate the topup panel and transactional topup embeds

**Files:**
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\topups.js`
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\panels.test.js`
- Test: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`

- [ ] **Step 1: Add failing topup panel tests**

Append these tests to `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\panels.test.js`:

```js
import { buildTopupsPanelEmbed } from '../../lib/discord/commands/topups.js'

test('buildTopupsPanelEmbed emphasizes account, verification path, and image support', () => {
  const ctx = createDiscordContext()
  const embed = buildTopupsPanelEmbed(
    ctx,
    { user_id: 12, display_name: 'Topup Tester' },
    { id: '1', name: 'arrow', animated: false },
  )
  const json = embed.toJSON()

  assert.equal(json.title, 'VxperS Top Up')
  assert.equal(json.fields?.[0]?.name, 'Account')
  assert.ok(json.fields?.some((field) => field.name === 'Verify Slip'))
})
```

- [ ] **Step 2: Run the panel tests and verify the new topup test fails**

Run:

```powershell
node --test .\tests\discord\panels.test.js
```

Expected: FAIL because `buildTopupsPanelEmbed` is not exported yet and the embed still uses the old flat structure.

- [ ] **Step 3: Update `topups.js` to use branded helpers and stronger hierarchy**

Export `buildTopupsPanelEmbed` and update the embed construction in `C:\Users\Administrator\Desktop\splitwise\server\lib\discord\commands\topups.js`:

```js
export function buildTopupsPanelEmbed(ctx, profile, emoji) {
  const arrow = ctx.topupArrow(emoji)
  const embed = ctx.panelEmbed(
    'VxperS Top Up',
    'Choose a topup method, complete payment, then verify once your transfer is finished.',
    [
      { name: 'Account', value: ctx.profileName(profile), inline: true },
      { name: 'PromptPay QR', value: `${arrow} Create a QR that stays valid for 10 minutes`, inline: true },
      { name: 'Verify Slip', value: `${arrow} After payment, use \`/topup verify-slip\` with your transfer slip`, inline: false },
    ],
    ctx.promptpayPanelImageUrl(),
  )

  const icon = ctx.storeIconUrl()
  if (/^https?:\/\//i.test(icon)) embed.setThumbnail(icon)
  return embed
}

function buildPromptpayCreatedPayload(ctx, result) {
  const qrDataUrl = String(result.qr?.imageDataUrl || '')
  const qrBase64 = qrDataUrl.includes(',') ? qrDataUrl.split(',').pop() : ''
  const files = []
  const embed = ctx.highlightEmbed(
    'PromptPay QR Created',
    'Scan the QR to pay, then verify the transfer slip to credit points to your account.',
    [
      { name: 'Topup ID', value: `#${result.topupId}`, inline: true },
      { name: 'Amount', value: `${ctx.formatPoints(result.points)} points`, inline: true },
      { name: 'Expires', value: `${ctx.formatDateTime(result.expiresAt)} (${ctx.formatDuration(result.ttlSeconds)})`, inline: true },
      { name: 'Reference', value: String(result.reference || '-'), inline: false },
      { name: 'Verify Slip', value: `Use \`/topup verify-slip topup_id:${result.topupId}\` and attach the transfer slip`, inline: false },
    ],
  )
```

Keep the existing file attachment and `embed.setImage(...)` behavior exactly as it works today.

- [ ] **Step 4: Run the embed tests to verify the topup migration passes**

Run:

```powershell
node --test .\tests\discord\context.test.js .\tests\discord\panels.test.js
```

Expected: PASS for shared and panel embed coverage.

- [ ] **Step 5: Commit the topup embed migration**

```powershell
git add server/lib/discord/commands/topups.js server/tests/discord/panels.test.js
git commit -m "feat: refresh discord topup embeds"
```

### Task 5: Final verification pass for branded embed behavior

**Files:**
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`
- Modify: `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\panels.test.js`
- Test: `C:\Users\Administrator\Desktop\splitwise\server\package.json`

- [ ] **Step 1: Add a final regression test for semantic helpers**

Append this test to `C:\Users\Administrator\Desktop\splitwise\server\tests\discord\context.test.js`:

```js
test('success, warning, info, and error embeds preserve distinct semantic colors', () => {
  const ctx = createDiscordContext()
  const success = ctx.successEmbed('Success', 'Done').toJSON()
  const warning = ctx.warningEmbed('Warning', 'Check this').toJSON()
  const info = ctx.infoEmbed('Info', 'Heads up').toJSON()
  const error = ctx.errorEmbed('Error', 'Failed').toJSON()

  assert.notEqual(success.color, warning.color)
  assert.notEqual(success.color, error.color)
  assert.notEqual(info.color, error.color)
})
```

- [ ] **Step 2: Run the full server test suite**

Run:

```powershell
npm test
```

Expected: PASS with all tests green under `server/tests/discord`.

- [ ] **Step 3: Run a final focused diff review**

Run:

```powershell
git diff -- server/package.json server/lib/discord/shared/context.js server/lib/discord/commands/globalpanel.js server/lib/discord/commands/topups.js server/tests/discord/context.test.js server/tests/discord/panels.test.js
```

Expected: Only branded embed and test-harness changes appear in the diff.

- [ ] **Step 4: Commit the final verification updates**

```powershell
git add server/tests/discord/context.test.js server/tests/discord/panels.test.js
git commit -m "test: finalize discord embed regression coverage"
```

- [ ] **Step 5: Manual sanity-check checklist**

Use this checklist before considering the work complete:

```text
[ ] Global panel reads like a curated premium menu
[ ] Topup panel clearly explains action order
[ ] PromptPay result embed emphasizes amount, expiry, and verify-slip step
[ ] Order cards remain readable when multiple embeds are returned
[ ] Success, warning, info, and error replies still read as distinct statuses
```
