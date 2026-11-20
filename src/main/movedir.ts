import { existsSync, mkdirSync, readdirSync, renameSync, statSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { sessionsDir } from './sessions'

/**
 * Ein Arbeitsverzeichnis an einen anderen Ort bringen. Nicht nur die Artefakte im Ordner selbst:
 * Claude legt Verlauf **und** Gedächtnis unter einem aus dem Pfad gebildeten Namen ab
 * (`~/.claude/projects/-Users-…-abc/`). Bleibt der zurück, findet `claude --resume` die Session
 * nicht mehr („No conversation found with session ID“) und das Gedächtnis des Projekts fehlt.
 * Deshalb wandert dieser Ordner mit.
 *
 * Codex braucht nichts davon: Der setzt über die Thread-Id fort und bekommt das Verzeichnis als
 * Parameter.
 */

/** Pfad ohne abschließende Schrägstriche (sonst stimmt der Vergleich zweier Pfade nicht). */
export function normPath(p: string): string {
  const r = resolve(p.trim())
  return r.length > 1 ? r.replace(/\/+$/, '') : r
}

/** Wohin der Ordner kommt: beim Verschieben in den gewählten Ordner hinein, sonst ist es der Pfad selbst. */
export function targetPath(from: string, picked: string, move: boolean): string {
  const ziel = normPath(picked)
  return move ? join(ziel, basename(normPath(from))) : ziel
}

/**
 * Inhalt von `src` nach `dst` schieben. Was es dort schon gibt, bleibt unangetastet: Ordner werden
 * zusammengeführt, bei Dateien gewinnt die vorhandene.
 * @returns Pfade (relativ), die deshalb liegen geblieben sind
 */
export function mergeInto(src: string, dst: string, prefix = ''): string[] {
  const skipped: string[] = []
  mkdirSync(dst, { recursive: true })
  for (const name of readdirSync(src)) {
    const from = join(src, name)
    const to = join(dst, name)
    const rel = prefix ? `${prefix}/${name}` : name
    if (!existsSync(to)) {
      renameSync(from, to)
      continue
    }
    if (statSync(from).isDirectory() && statSync(to).isDirectory()) {
      skipped.push(...mergeInto(from, to, rel))
      continue
    }
    skipped.push(rel)
  }
  return skipped
}

/** Was beim Umzug zu tun ist, bevor irgendetwas angefasst wird. */
export function checkMove(from: string, to: string, move: boolean): string | null {
  if (from === to) return 'Das ist schon das Arbeitsverzeichnis dieses Chats.'
  if (move) {
    if (!existsSync(from)) return `Den bisherigen Ordner gibt es nicht mehr: ${from}`
    if (existsSync(to)) return `Dort gibt es schon „${basename(to)}“: ${to}`
    return null
  }
  if (!existsSync(to)) return `Diesen Ordner gibt es nicht: ${to}`
  if (!statSync(to).isDirectory()) return `Das ist kein Ordner: ${to}`
  return null
}

/**
 * Den Ordner (wenn gewünscht) verschieben und in jedem Fall Claudes Projektordner nachziehen.
 * @returns Dateien, die im alten Projektordner bleiben mussten, weil es sie am Ziel schon gibt
 */
export function moveWorkdirFiles(from: string, to: string, move: boolean, home: string): string[] {
  if (move) {
    mkdirSync(join(to, '..'), { recursive: true })
    renameSync(from, to)
  }
  const alt = sessionsDir(home, from)
  if (!existsSync(alt)) return []
  const neu = sessionsDir(home, to)
  if (!existsSync(neu)) {
    mkdirSync(join(neu, '..'), { recursive: true })
    renameSync(alt, neu)
    return []
  }
  return mergeInto(alt, neu)
}
