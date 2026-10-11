import assert from 'node:assert/strict'
import test from 'node:test'
import { backupPathForId } from '../src/lib/backup-utils'
import { WRITE_ROLES } from '../src/lib/auth'
import { finiteNumber, parseLimit } from '../src/lib/query-validation'

test('backup IDs cannot escape the backup directory', () => {
  const root = 'C:\\resqnet\\backups'
  assert.equal(backupPathForId(root, '../outside'), null)
  assert.equal(backupPathForId(root, '..\\outside'), null)
  assert.equal(backupPathForId(root, 'backup-2025_01'), 'C:\\resqnet\\backups\\backup-2025_01.db')
})

test('write access is limited to operational roles', () => {
  assert.equal(WRITE_ROLES.includes('VIEWER' as never), false)
  assert.equal(WRITE_ROLES.includes('DISPATCHER'), true)
  assert.equal(WRITE_ROLES.includes('ADMINISTRATOR'), true)
})

test('query limits reject invalid and unsafe values', () => {
  assert.equal(parseLimit(null), 100)
  assert.equal(parseLimit('25'), 25)
  assert.throws(() => parseLimit('0'), /between 1 and 200/)
  assert.throws(() => parseLimit('not-a-number'), /positive integer/)
})

test('telemetry numbers must be finite and within operational bounds', () => {
  assert.equal(finiteNumber('75', 'battery', { min: 0, max: 100 }), 75)
  assert.throws(() => finiteNumber('Infinity', 'battery', { min: 0, max: 100 }), /finite number/)
  assert.throws(() => finiteNumber(101, 'battery', { min: 0, max: 100 }), /at most 100/)
})
