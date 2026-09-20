import test from 'node:test'
import assert from 'node:assert/strict'

import {
  INSPECTION_CATEGORIES,
  inspectionResult,
  issuesFromChecklist,
  normalizeChecklist,
  normalizeIssueStatus,
} from '../../lib/trackerInspections.js'

test('normalizeChecklist fills every category and drops unknown keys', () => {
  const checklist = normalizeChecklist({
    electric: { status: 'bad', note: '  ปลั๊กไฟห้องนอนไม่มีไฟ ' },
    doors: { status: 'ok', note: 'should be dropped' },
    bogus: { status: 'bad' },
  })

  assert.deepEqual(Object.keys(checklist), INSPECTION_CATEGORIES.map((c) => c.key))
  assert.deepEqual(checklist.electric, { status: 'bad', note: 'ปลั๊กไฟห้องนอนไม่มีไฟ' })
  assert.deepEqual(checklist.doors, { status: 'ok', note: '' })
  assert.deepEqual(checklist.structure, { status: null, note: '' })
  assert.equal('bogus' in checklist, false)
})

test('normalizeChecklist rejects invalid payloads', () => {
  assert.throws(() => normalizeChecklist(null), /Checklist is required/)
  assert.throws(() => normalizeChecklist([]), /Checklist is required/)
  assert.throws(() => normalizeChecklist({ ac: { status: 'broken' } }), /Invalid status for ac/)
})

test('inspectionResult and issuesFromChecklist follow the bad categories', () => {
  const clean = normalizeChecklist({ ac: { status: 'ok' }, plumbing: { status: 'na' } })
  assert.equal(inspectionResult(clean), 'ok')
  assert.deepEqual(issuesFromChecklist(clean), [])

  const broken = normalizeChecklist({
    plumbing: { status: 'bad', note: 'ท่อน้ำใต้อ่างล้างหน้ารั่ว' },
    fixtures: { status: 'bad' },
  })
  assert.equal(inspectionResult(broken), 'issue')
  assert.deepEqual(issuesFromChecklist(broken), [
    { category_key: 'plumbing', category_label: 'ระบบประปา-สุขาภิบาล', note: 'ท่อน้ำใต้อ่างล้างหน้ารั่ว' },
    { category_key: 'fixtures', category_label: 'เฟอร์นิเจอร์บิลท์อิน/สุขภัณฑ์', note: '' },
  ])
})

test('normalizeIssueStatus only accepts the repair pipeline states', () => {
  assert.equal(normalizeIssueStatus('in_progress'), 'in_progress')
  assert.throws(() => normalizeIssueStatus('fixed'), /Invalid issue status/)
})
