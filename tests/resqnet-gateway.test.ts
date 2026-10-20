import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyPortalReport,
  normalizePortalReport,
  parseCsvRecord,
  peopleAffectedFromPortal,
} from '../src/lib/resqnet-gateway'

test('parses the 12-field captive-portal CSV including quoted commas and escaped quotes', () => {
  const parsed = parseCsvRecord('"Medical Emergency","A, B ""C""","1","Pregnancy emergency","Critical","","Water, medicine","need ""urgent"" help","false","","",""')
  assert.ok(parsed)
  assert.equal(parsed.length, 12)
  assert.equal(parsed[1], 'A, B "C"')
  assert.equal(parsed[6], 'Water, medicine')
  assert.equal(parsed[7], 'need "urgent" help')
})

test('rejects malformed CSV quoting and unexpected field counts', () => {
  assert.equal(parseCsvRecord('"Medical Emergency","unfinished'), null)
  assert.equal(normalizePortalReport(['Instant SOS']), null)
})

test('maps a phone medical report into validated portal fields', () => {
  const fields = parseCsvRecord('"Medical Emergency","Demo","4+","Severe bleeding","Critical","Trapped but safe","Water","Need help","false","","",""')
  assert.ok(fields)
  const report = normalizePortalReport(fields)
  assert.ok(report)
  assert.equal(report.type, 'Medical Emergency')
  assert.equal(report.locationAvailable, false)
  assert.equal(report.latitude, null)
})

test('maps portal classifications and severity to the dashboard incident taxonomy', () => {
  assert.deepEqual(classifyPortalReport('Instant SOS', ''), { category: 'RESCUE', priority: 'CRITICAL' })
  assert.deepEqual(classifyPortalReport('Medical Emergency', 'Serious'), { category: 'MEDICAL', priority: 'HIGH' })
  assert.deepEqual(classifyPortalReport('Safe & Waiting', ''), { category: 'RESCUE', priority: 'LOW' })
})

test('interprets people values with the portal 4+ option as a lower bound', () => {
  assert.equal(peopleAffectedFromPortal('4+'), 4)
  assert.equal(peopleAffectedFromPortal('2'), 2)
  assert.equal(peopleAffectedFromPortal(''), null)
  assert.equal(peopleAffectedFromPortal('many'), undefined)
})
