#!/usr/bin/env bun
import { lstat, mkdir, readlink, symlink, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const REPO_ROOT = new URL('..', import.meta.url).pathname

const BINARIES = [
  { name: 'parley', src: join(REPO_ROOT, 'packages/cli/dist/parley') },
  { name: 'parley-server', src: join(REPO_ROOT, 'packages/api/dist/parley-server') },
]

const args = new Set(process.argv.slice(2))
const shouldBuild = args.has('--build')

const installDir = process.env.XDG_BIN_HOME ?? join(homedir(), '.local', 'bin')

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path)
    return true
  } catch {
    return false
  }
}

async function checkBinary(src: string) {
  if (!(await exists(src))) {
    console.error(`Missing binary: ${src}`)
    console.error("Run 'bun run build:bin' first, or pass --build to do it now.")
    process.exit(1)
  }
}

async function buildAll() {
  console.log('Building binaries…')
  const proc = Bun.spawn(['bun', 'run', 'build:bin'], {
    cwd: REPO_ROOT,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const code = await proc.exited

  if (code !== 0) {
    console.error('Build failed.')
    process.exit(code)
  }
}

async function linkOne(name: string, src: string) {
  const target = join(installDir, name)

  if (await exists(target)) {
    const stat = await lstat(target)

    if (!stat.isSymbolicLink()) {
      console.error(`Refusing to overwrite ${target}: not a symlink (likely a real install).`)
      console.error('Move or delete it manually if you want to replace it.')
      process.exit(1)
    }

    const current = await readlink(target)

    if (current === src) {
      console.log(`✓ ${target} → ${src} (already linked)`)
      return
    }

    await unlink(target)
  }

  await symlink(src, target)
  console.log(`→ ${target} → ${src}`)
}

function pathContains(dir: string): boolean {
  const path = process.env.PATH ?? ''
  return path.split(':').includes(dir)
}

async function main() {
  if (shouldBuild) {
    await buildAll()
  }

  for (const { src } of BINARIES) {
    await checkBinary(src)
  }

  await mkdir(installDir, { recursive: true })

  for (const { name, src } of BINARIES) {
    await linkOne(name, src)
  }

  if (!pathContains(installDir)) {
    console.log('')
    console.log(`⚠️  ${installDir} is not on $PATH.`)
    console.log(`Add it to your shell rc: export PATH="${installDir}:$PATH"`)
  }
}

await main()
