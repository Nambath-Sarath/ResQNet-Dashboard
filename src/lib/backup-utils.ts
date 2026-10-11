import { isAbsolute, relative, resolve } from 'path'

export function backupPathForId(directory: string, id: string): string | null {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return null
  const root = resolve(directory)
  const candidate = resolve(root, `${id}.db`)
  const rel = relative(root, candidate)
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? candidate : null
}
