import { execFileSync } from 'node:child_process'

/**
 * Aus dem Finder gestartete Apps erben nicht den PATH der Login-Shell. Damit `claude`
 * (z. B. in ~/.local/bin oder über nvm) gefunden wird, lesen wir den PATH einmal aus.
 */
export function resolveLoginPath(): string {
  const current = process.env.PATH ?? ''
  if (process.platform === 'win32') return current
  try {
    const shell = process.env.SHELL || '/bin/zsh'
    const out = execFileSync(shell, ['-ilc', 'printf "__P__%s__P__" "$PATH"'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: ['ignore', 'pipe', 'ignore']
    })
    const m = out.match(/__P__(.*)__P__/s)
    const loginPath = m?.[1] ?? ''
    const parts = [...loginPath.split(':'), ...current.split(':')].filter(Boolean)
    return [...new Set(parts)].join(':')
  } catch {
    return current
  }
}

/** Umgebung für Kindprozesse der CLIs. */
export function childEnv(path: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: path }
  // Wird die App aus einer Claude-Code-Session heraus gestartet, sollen die Chats
  // nicht glauben, sie liefen verschachtelt.
  delete env.CLAUDECODE
  delete env.CLAUDE_CODE_ENTRYPOINT
  return env
}
