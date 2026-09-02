import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createCategory,
  updateCategory,
  deleteCategory,
  adminReorderCategories,
} from '../../db.js'

test('nested categories: validation rules prevent self-parenting and invalid IDs', async () => {
  // Self parenting check
  await assert.rejects(
    async () => {
      await updateCategory({
        id: 5,
        name: 'Gaming',
        slug: 'gaming',
        parentId: 5,
      })
    },
    (err) => err.message === 'invalid_parent_self',
  )

  // Invalid ID checks
  await assert.rejects(
    async () => {
      await updateCategory({
        id: 'bad-id',
        name: 'Gaming',
        slug: 'gaming',
      })
    },
    (err) => err.message === 'invalid_id',
  )

  await assert.rejects(
    async () => {
      await deleteCategory('bad-id')
    },
    (err) => err.message === 'invalid_id',
  )

  // Reorder empty/invalid handling
  const reorderResult = await adminReorderCategories([])
  assert.equal(reorderResult.ok, true)

  const reorderNull = await adminReorderCategories(null)
  assert.equal(reorderNull.ok, true)
})
