import { cp, access, mkdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = fileURLToPath(new URL('..', import.meta.url))
const nextCommand = join(projectDir, 'node_modules', 'next', 'dist', 'bin', 'next')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectDir,
      env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
      stdio: 'inherit',
    })
    child.on('error', reject)
    child.on('exit', (code, signal) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} exited with ${code ?? signal}`))
    })
  })
}

async function exists(path) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

await run(process.execPath, [nextCommand, 'build'])

const standaloneDir = join(projectDir, '.next', 'standalone')
if (!(await exists(join(standaloneDir, 'server.js')))) {
  throw new Error('Next.js standalone server was not generated.')
}

await mkdir(join(standaloneDir, '.next'), { recursive: true })
if (await exists(join(projectDir, '.next', 'static'))) {
  await cp(join(projectDir, '.next', 'static'), join(standaloneDir, '.next', 'static'), {
    recursive: true,
    force: true,
  })
}
if (await exists(join(projectDir, 'public'))) {
  await cp(join(projectDir, 'public'), join(standaloneDir, 'public'), {
    recursive: true,
    force: true,
  })
}

console.log('Build complete. Run "npm start" to start the production server.')
