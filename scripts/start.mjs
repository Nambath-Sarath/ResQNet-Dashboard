import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const standaloneServer = join(projectDir, '.next', 'standalone', 'server.js')
const tsxCommand = join(projectDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
const children = []

try {
  await access(standaloneServer)
} catch {
  console.error('Production server is missing. Run "npm run build" first.')
  process.exit(1)
}

function start(command, args, cwd = projectDir) {
  const child = spawn(command, args, {
    cwd,
    env: {
      ...process.env,
      NODE_ENV: 'production',
      HOSTNAME: process.env.HOSTNAME ?? '0.0.0.0',
      PORT: process.env.PORT ?? '3000',
      DATABASE_URL: process.env.DATABASE_URL ?? 'file:./db/custom.db',
    },
    stdio: 'inherit',
  })
  children.push(child)
  child.on('exit', (code, signal) => {
    if (code && code !== 0) {
      console.error(`${command} exited with ${code ?? signal}`)
      stop()
      process.exit(code)
    }
  })
  return child
}

function stop() {
  for (const child of children) {
    if (!child.killed) child.kill()
  }
}

process.once('SIGINT', () => {
  stop()
  process.exit(0)
})
process.once('SIGTERM', () => {
  stop()
  process.exit(0)
})

start(process.execPath, [standaloneServer])

const realtimeEntry = join(projectDir, 'mini-services', 'realtime', 'index.ts')
try {
  await access(realtimeEntry)
  if (process.env.START_REALTIME !== 'false') {
    start(process.execPath, [tsxCommand, realtimeEntry])
  }
} catch {
  // The dashboard remains usable without the optional realtime service.
}
