import assert from 'node:assert/strict'
import test from 'node:test'
import { backupPathForId } from '../src/lib/backup-utils'
import { WRITE_ROLES } from '../src/lib/auth'

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
