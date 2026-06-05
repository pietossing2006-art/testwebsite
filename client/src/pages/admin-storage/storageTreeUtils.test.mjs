import test from 'node:test'
import assert from 'node:assert/strict'

import {
  collectAncestorPaths,
  countTreeFolders,
  createExpandedPathSet,
  filterTreeByQuery,
  normalizeStoragePath,
  togglePathInSet,
} from './storageTreeUtils.js'

test('normalizeStoragePath trims slash noise and keeps safe route style paths', () => {
  assert.equal(normalizeStoragePath(' /albums//raid\\june/ '), 'albums/raid/june')
  assert.equal(normalizeStoragePath('.'), '')
})

test('collectAncestorPaths returns root and parent paths in order', () => {
  assert.deepEqual(collectAncestorPaths('a/b/c'), ['', 'a', 'a/b'])
  assert.deepEqual(collectAncestorPaths('a'), [''])
  assert.deepEqual(collectAncestorPaths(''), [''])
})

test('createExpandedPathSet opens root and selected ancestors', () => {
  const expanded = createExpandedPathSet('a/b/c')

  assert.equal(expanded.has(''), true)
  assert.equal(expanded.has('a'), true)
  assert.equal(expanded.has('a/b'), true)
  assert.equal(expanded.has('a/b/c'), true)
})

test('togglePathInSet returns a new set with one path toggled', () => {
  const current = new Set([''])
  const opened = togglePathInSet(current, 'albums')
  const closed = togglePathInSet(opened, '')

  assert.equal(current.has('albums'), false)
  assert.equal(opened.has('albums'), true)
  assert.equal(closed.has(''), false)
})

test('filterTreeByQuery keeps matching folders with their descendants', () => {
  const tree = {
    name: 'All files',
    path: '',
    children: [
      { name: 'Screenshots', path: 'screenshots', children: [] },
      {
        name: 'Raid Runs',
        path: 'raid-runs',
        children: [{ name: 'June', path: 'raid-runs/june', children: [] }],
      },
    ],
  }

  const result = filterTreeByQuery(tree, 'raid')

  assert.equal(result.children.length, 1)
  assert.equal(result.children[0].name, 'Raid Runs')
  assert.equal(result.children[0].children[0].name, 'June')
})

test('filterTreeByQuery keeps parents for matching descendants', () => {
  const tree = {
    name: 'All files',
    path: '',
    children: [
      {
        name: 'Events',
        path: 'events',
        children: [{ name: 'June Finals', path: 'events/june-finals', children: [] }],
      },
    ],
  }

  const result = filterTreeByQuery(tree, 'finals')

  assert.equal(result.children.length, 1)
  assert.equal(result.children[0].name, 'Events')
  assert.equal(result.children[0].children[0].name, 'June Finals')
})

test('countTreeFolders counts root and child folder nodes', () => {
  const tree = {
    name: 'All files',
    path: '',
    children: [
      { name: 'A', path: 'a', children: [] },
      { name: 'B', path: 'b', children: [{ name: 'C', path: 'b/c', children: [] }] },
    ],
  }

  assert.equal(countTreeFolders(tree), 4)
})
