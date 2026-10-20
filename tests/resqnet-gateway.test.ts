import assert from 'node:assert/strict'
import test from 'node:test'
import {
  classifyPortalReport,
  normalizePortalReport,
  parseCsvRecord,
  peopleAffectedFromPortal,
  parseResQnetTelemetry,
} from '../src/lib/resqnet-gateway'

test('parses the 12-field captive-portal CSV including quoted commas and escaped quotes', () => {
  const parsed = parseCsvRecord('"Medical Emergency","A, B ""C""","1","Pregnancy emergency","Critical","","Water, medicine","need ""urgent"" help","false","","",""')
  assert.ok(parsed)
  if (!parsed) throw new Error('expected parsed CSV')
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
  if (!fields) throw new Error('expected fields')
  const report = normalizePortalReport(fields)
  assert.ok(report)
  if (!report) throw new Error('expected normalized portal report')
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


test('accepts the compact MPU6500 telemetry JSON and converts fixed-point values', () => {
  const telemetry = parseResQnetTelemetry('{"kind":"telemetry","gps_seen":0,"fix":0,"lat_e6":null,"lon_e6":null,"imu":1,"moving":0,"ax_mg":12,"ay_mg":-5,"az_mg":1000,"gx_dps10":0,"gy_dps10":3,"gz_dps10":-2}')
  assert.ok(telemetry)
  if (!telemetry) throw new Error('expected normalized telemetry')
  assert.equal(telemetry.imuPresent, true)
  assert.equal(telemetry.gpsSeen, false)
  assert.equal(telemetry.gpsFix, false)
  assert.equal(telemetry.moving, false)
  assert.equal(telemetry.axMg, 12)
  assert.equal(telemetry.latitude, null)
})

test('rejects invalid sensor telemetry instead of accepting malformed payloads', () => {
  assert.equal(parseResQnetTelemetry('{"kind":"telemetry","gps_seen":1,"fix":1,"lat_e6":null,"lon_e6":null,"imu":0,"moving":null}'), null)
  assert.equal(parseResQnetTelemetry('{"kind":"unknown"}'), null)
})
