import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import * as storage from '../../lib/storage.js'

let storageTreeRoot = ''

test('setup storage tree fixture root', async () => {
  storageTreeRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'storage-tree-'))
  process.env.STORAGE_BROWSER_ROOT = storageTreeRoot
})

test('buildStorageVideoThumbFfmpegArgs restricts ffmpeg input protocols to local file and pipe', () => {
  const args = storage.buildStorageVideoThumbFfmpegArgs({
    inputPath: 'C:\\uploads\\clip.mp4',
    width: 240,
    ffmpegQ: 8,
  })

  const whitelistIndex = args.indexOf('-protocol_whitelist')
  const inputIndex = args.indexOf('-i')

  assert.ok(whitelistIndex >= 0)
  assert.ok(inputIndex > whitelistIndex)
  assert.equal(args[whitelistIndex + 1], 'file,pipe')
  assert.equal(args[inputIndex + 1], 'C:\\uploads\\clip.mp4')
  assert.equal(args.join(',').includes('http'), false)
  assert.equal(args.join(',').includes('concat'), false)
  assert.equal(args.join(',').includes('subfile'), false)
})

test('default storage tree budget covers large roots before showing partial state', () => {
  assert.ok(storage.STORAGE_TREE_DEFAULT_MAX_FOLDERS >= 50000)
})

test('mapStorageItemsWithConcurrency preserves order while capping active workers', async () => {
  let active = 0
  let maxActive = 0

  const result = await storage.mapStorageItemsWithConcurrency(
    [1, 2, 3, 4, 5, 6],
    async (item) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, item === 1 ? 20 : 2))
      active -= 1
      return item * 10
    },
    { concurrency: 2 },
  )

  assert.deepEqual(result, [10, 20, 30, 40, 50, 60])
  assert.ok(maxActive <= 2)
})

test('createStorageMemoryCache refreshes hits and evicts the oldest idle entry', () => {
  const cache = storage.createStorageMemoryCache({ maxEntries: 2 })

  cache.set('one', Buffer.from('1'))
  cache.set('two', Buffer.from('2'))
  assert.equal(cache.get('one').toString('utf8'), '1')
  cache.set('three', Buffer.from('3'))

  assert.equal(cache.get('two'), null)
  assert.equal(cache.get('one').toString('utf8'), '1')
  assert.equal(cache.get('three').toString('utf8'), '3')
})

test('buildStorageThumbnailCacheKey changes when source file metadata changes', () => {
  const base = {
    kind: 'video',
    absolutePath: path.join(storageTreeRoot, 'clip.mp4'),
    stat: { size: 100, mtimeMs: 200 },
    width: 160,
    quality: 40,
  }

  assert.notEqual(
    storage.buildStorageThumbnailCacheKey(base),
    storage.buildStorageThumbnailCacheKey({ ...base, stat: { size: 101, mtimeMs: 200 } }),
  )
  assert.notEqual(
    storage.buildStorageThumbnailCacheKey(base),
    storage.buildStorageThumbnailCacheKey({ ...base, stat: { size: 100, mtimeMs: 201 } }),
  )
})

test('buildStorageFolderTree skips hidden folders and sorts visible folders', async () => {
  await fs.promises.mkdir(path.join(storageTreeRoot, 'visible', 'beta'), { recursive: true })
  await fs.promises.mkdir(path.join(storageTreeRoot, 'visible', 'alpha'), { recursive: true })
  await fs.promises.mkdir(path.join(storageTreeRoot, 'visible', '.secret'), { recursive: true })

  const result = await storage.buildStorageFolderTree('visible', { maxDepth: 3, maxFolders: 20 })

  assert.equal(result.path, 'visible')
  assert.equal(result.truncated, false)
  assert.deepEqual(result.tree.children.map((item) => item.name), ['alpha', 'beta'])
})

test('buildStorageFolderTree marks traversal truncated when max depth is reached', async () => {
  await fs.promises.mkdir(path.join(storageTreeRoot, 'deep', 'one', 'two'), { recursive: true })

  const result = await storage.buildStorageFolderTree('deep', { maxDepth: 1, maxFolders: 20 })

  assert.equal(result.truncated, true)
  assert.equal(result.tree.children[0].name, 'one')
  assert.equal(result.tree.children[0].truncated, true)
  assert.deepEqual(result.tree.children[0].children, [])
})

test('buildStorageFolderTree stops when max folder count is reached', async () => {
  await fs.promises.mkdir(path.join(storageTreeRoot, 'count', 'a'), { recursive: true })
  await fs.promises.mkdir(path.join(storageTreeRoot, 'count', 'b'), { recursive: true })
  await fs.promises.mkdir(path.join(storageTreeRoot, 'count', 'c'), { recursive: true })

  const result = await storage.buildStorageFolderTree('count', { maxDepth: 3, maxFolders: 2 })

  assert.equal(result.truncated, true)
  assert.equal(result.folder_count, 2)
  assert.deepEqual(result.tree.children.map((item) => item.name), ['a', 'b'])
})

test('buildStorageFolderTree rejects invalid traversal paths', async () => {
  await assert.rejects(
    () => storage.buildStorageFolderTree('../outside', { maxDepth: 3, maxFolders: 20 }),
    /invalid_path/,
  )
})
