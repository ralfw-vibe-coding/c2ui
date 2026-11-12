import { execFile, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { app } from 'electron'
import type { BuildInfo, UpdaterTools } from './updater'

/** Die echten Wirkungen des Updaters. */
export function realUpdaterTools(): UpdaterTools {
  return {
    list: (dir) => readdir(dir),
    run: (command, args) =>
      new Promise((resolve, reject) =>
        execFile(command, args, { maxBuffer: 16 * 1024 * 1024 }, (err, stdout, stderr) =>
          err ? reject(new Error(String(stderr).trim() || err.message)) : resolve(String(stdout))
        )
      ),
    read: (path) => readFile(path, 'utf8'),
    write: (path, text) => writeFile(path, text),
    remove: (path) => rm(path, { recursive: true, force: true }),
    detach: (command, args) => spawn(command, args, { detached: true, stdio: 'ignore' }).unref(),
    quit: () => app.quit(),
    now: () => new Date()
  }
}

/** Build-Angaben der laufenden App (vom Packskript geschrieben); null für die App aus dem Repo. */
export function currentBuild(): BuildInfo | null {
  if (!app.isPackaged) return null
  try {
    const x = JSON.parse(readFileSync(join(process.resourcesPath, 'build.json'), 'utf8'))
    const build = Number(x.build)
    if (!Number.isInteger(build) || build <= 0) return null
    return { version: String(x.version ?? '?'), build, commit: x.commit ? String(x.commit) : undefined, arch: x.arch ? String(x.arch) : undefined }
  } catch {
    return null
  }
}
