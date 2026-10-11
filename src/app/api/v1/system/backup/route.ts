import { db } from '@/lib/db'
import { getCurrentOperator, handleError, requireRole, audit } from '@/lib/auth'
import { publishEvent } from '@/lib/realtime'
import { writeFile, readFile, mkdir, rename, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { backupPathForId as safeBackupPathForId } from '@/lib/backup-utils'

export const dynamic = 'force-dynamic'

const BACKUP_DIR = join(tmpdir(), 'resqnet-backups')

function backupPathForId(id: string): string | null {
  return safeBackupPathForId(BACKUP_DIR, id)
}

function sqlString(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

async function verifySqliteBackup(path: string): Promise<boolean> {
  return db.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`ATTACH DATABASE ${sqlString(path)} AS backup_check`)
    try {
      const result = await tx.$queryRawUnsafe<Array<{ integrity_check: string }>>(
        'PRAGMA backup_check.integrity_check',
      )
      return result[0]?.integrity_check === 'ok'
    } finally {
      await tx.$executeRawUnsafe('DETACH DATABASE backup_check')
    }
  })
}

/**
 * GET /api/v1/system/backup — list available backups + last backup info.
 * POST /api/v1/system/backup — trigger a backup (admin only).
 * DELETE /api/v1/system/backup?id=X — remove a backup (admin only).
 *
 * Spec §9.2 + §11.1 + §6.10: "Back up to a separate storage location when possible.
 * Test restoring a backup; creating backups without testing restoration is insufficient."
 */
export async function GET() {
  try {
    const op = await getCurrentOperator()
    if (!op) {
      return Response.json({ error: { code: 'UNAUTHENTICATED', message: 'Authentication required.' } }, { status: 401 })
    }
    const backups: { id: string; name: string; size: number; created_at: string }[] = []
    if (existsSync(BACKUP_DIR)) {
      try {
        const { readdir, stat } = await import('fs/promises')
        const files = await readdir(BACKUP_DIR)
        for (const f of files) {
          if (!f.endsWith('.db')) continue
          const full = join(BACKUP_DIR, f)
          const st = await stat(full)
          backups.push({
            id: f.replace(/\.db$/, ''),
            name: f,
            size: st.size,
            created_at: st.mtime.toISOString(),
          })
        }
      } catch {
        // ignore dir read errors
      }
    }
    backups.sort((a, b) => b.created_at.localeCompare(a.created_at))

    const lastBackupEvent = await db.systemEvent.findFirst({
      where: { event_type: 'backup.success' },
      orderBy: { occurred_at: 'desc' },
    })

    return Response.json({
      backups,
      total: backups.length,
      last_backup_at: lastBackupEvent?.occurred_at ?? null,
      backup_dir: BACKUP_DIR,
      note: 'Backups are stored in a separate directory (/tmp/resqnet-backups) for this prototype. In production, use a separate storage target (not the same SD card).',
    })
  } catch (err) {
    return handleError(err)
  }
}

export async function POST(req: Request) {
  try {
    const op = await requireRole('ADMINISTRATOR')
    const url = new URL(req.url)
    const testRestore = url.searchParams.get('test') === 'true'
    const backupId = url.searchParams.get('id')

    if (testRestore && backupId) {
      // Test-restore workflow: verify the backup file exists + can be read,
      // and that records can be queried from a copy.
      const backupPath = backupPathForId(backupId)
      if (!backupPath) {
        return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid backup id.' } }, { status: 400 })
      }
      if (!existsSync(backupPath)) {
        return Response.json({ error: { code: 'NOT_FOUND', message: 'Backup file not found.' } }, { status: 404 })
      }
      // Verify readability and SQLite integrity.
      const buf = await readFile(backupPath)
      if (buf.length === 0) {
        return Response.json({ error: { code: 'CORRUPT', message: 'Backup file is empty.' } }, { status: 500 })
      }
      if (!await verifySqliteBackup(backupPath)) {
        return Response.json({ error: { code: 'CORRUPT', message: 'SQLite integrity check failed.' } }, { status: 500 })
      }
      // Record the test-restore event
      await db.systemEvent.create({
        data: {
          event_type: 'backup.test_restore',
          severity: 'info',
          entity_type: 'backup',
          entity_id: backupId,
          payload: JSON.stringify({ size: buf.length, verified: true }),
          occurred_at: new Date(),
        },
      })
      await audit({
        actor_id: op.id,
        action: 'backup.test_restore',
        entity_type: 'backup',
        entity_id: backupId,
        metadata: { size_bytes: buf.length },
      })
      await publishEvent({
        event_type: 'system.health_changed',
        entity_id: backupId,
        data: { kind: 'backup.test_restore', size: buf.length },
      })
      return Response.json({
        backup_id: backupId,
        verified: true,
        size_bytes: buf.length,
        readable: true,
        note: 'Backup file exists, is non-empty, and is readable. Full restore to a separate Pi is still required before production use.',
      })
    }

    // Create a backup: copy the current DB file to the backup dir.
    await mkdir(BACKUP_DIR, { recursive: true })
    const ts = new Date().toISOString().replace(/[:.]/g, '-')
    const backupName = `resqnet-${ts}.db`
    const backupPath = join(BACKUP_DIR, backupName)
    const temporaryPath = `${backupPath}.tmp`

    // VACUUM INTO creates a transaction-consistent SQLite backup.
    await db.$executeRawUnsafe(`VACUUM INTO ${sqlString(temporaryPath)}`)
    await rename(temporaryPath, backupPath)
    if (!await verifySqliteBackup(backupPath)) {
      return Response.json({ error: { code: 'CORRUPT', message: 'SQLite integrity check failed.' } }, { status: 500 })
    }
    const backupSize = (await stat(backupPath)).size

    // Record the backup event
    const event = await db.systemEvent.create({
      data: {
        event_type: 'backup.success',
        severity: 'info',
        payload: JSON.stringify({ destination: BACKUP_DIR, size: backupSize, name: backupName }),
        occurred_at: new Date(),
      },
    })

    await audit({
      actor_id: op.id,
      action: 'backup.create',
      entity_type: 'backup',
      entity_id: backupName.replace(/\.db$/, ''),
      metadata: { size: backupSize, destination: BACKUP_DIR },
    })
    await publishEvent({
      event_type: 'system.health_changed',
      entity_id: backupName.replace(/\.db$/, ''),
      data: { kind: 'backup.success', size: backupSize, destination: BACKUP_DIR },
    })

    return Response.json({
      backup_id: backupName.replace(/\.db$/, ''),
      name: backupName,
      size_bytes: backupSize,
      destination: BACKUP_DIR,
      created_at: new Date().toISOString(),
      event_id: event.id,
      note: 'Backup created successfully. Test the restore on a separate Pi before production use.',
    }, { status: 201 })
  } catch (err) {
    return handleError(err)
  }
}

export async function DELETE(req: Request) {
  try {
    const op = await requireRole('ADMINISTRATOR')
    const url = new URL(req.url)
    const id = url.searchParams.get('id')
    if (!id) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'id query param required.' } }, { status: 400 })
    }
    const backupPath = backupPathForId(id)
    if (!backupPath) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid backup id.' } }, { status: 400 })
    }
    if (!existsSync(backupPath)) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Backup not found.' } }, { status: 404 })
    }
    const { unlink } = await import('fs/promises')
    await unlink(backupPath)
    await audit({
      actor_id: op.id,
      action: 'backup.delete',
      entity_type: 'backup',
      entity_id: id,
    })
    return new Response(null, { status: 204 })
  } catch (err) {
    return handleError(err)
  }
}
