import type { Commit } from '../types'
import type { BranchInfo } from './branches'

const MONTHS = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
const LABEL_GAP = 1

/**
 * Where a moment falls on a line `width` cells long: by its rank among the
 * commits' moments, not by the clock, so a burst of work gets room and a quiet
 * year does not eat the line.
 */
export const rankScale = (times: readonly number[], width: number): ((t: number) => number) => {
  const sorted = [...new Set(times)].sort((a, b) => a - b)
  const last = Math.max(1, sorted.length - 1)
  return t => {
    const rank = sorted.findIndex(x => x >= t)
    const at = rank < 0 ? sorted.length - 1 : rank
    return Math.round((at / last) * (width - 1))
  }
}

/** Where the ticks of the line sit, as shares of its length. */
const TICKS = [0, 1 / 3, 2 / 3, 1]

/**
 * Dates along the line, at four ticks spread over it: `6 dic'25   25 lug   27 lug`.
 * On a line by rank the ticks fall where the work was, so they say when it was.
 * A label that would touch the one on its right is left out.
 */
export const axisOf = (times: readonly number[], width: number, nowMs: number): string => {
  const sorted = [...new Set(times)].sort((a, b) => a - b)
  if (sorted.length === 0) return ' '.repeat(width)
  const thisYear = new Date(nowMs).getFullYear()
  const labelOf = (t: number) => {
    const d = new Date(t * 1000)
    return `${d.getDate()} ${MONTHS[d.getMonth()]!}${d.getFullYear() === thisYear ? '' : `'${String(d.getFullYear()).slice(2)}`}`
  }
  const cells = Array.from({ length: width }, () => ' ')
  let freeUntil = width + LABEL_GAP
  const placed = new Set<string>()
  for (const share of [...TICKS].reverse()) {
    const t = sorted[Math.round(share * (sorted.length - 1))]!
    const label = labelOf(t)
    if (placed.has(label)) continue
    const at = Math.max(0, Math.min(Math.round(share * (width - 1)) - (share === 1 ? label.length - 1 : share === 0 ? 0 : Math.floor(label.length / 2)), width - label.length))
    if (at + label.length + LABEL_GAP > freeUntil) continue
    ;[...label].forEach((ch, i) => (cells[at + i] = ch))
    placed.add(label)
    freeUntil = at
  }
  return cells.join('')
}

/** A branch's span on the line: where it grew from (or began), and where it was merged (or ends now). */
export const spanOf = (b: BranchInfo, bySha: ReadonlyMap<string, Commit>): { from: number; to: number } => {
  const times = b.shas.map(s => bySha.get(s)?.at ?? 0)
  const fork = b.forkSha === null ? undefined : bySha.get(b.forkSha)
  const merge = b.mergeSha === null ? undefined : bySha.get(b.mergeSha)
  return { from: fork?.at ?? Math.min(...times), to: merge?.at ?? Math.max(...times) }
}

/**
 * The bar's characters over the whole line, blanks around it: a branch grown
 * from another `┗━━┛` when merged back, `┗━━●` while open; one with no fork in
 * sight starts at a dot; the one you are on ends in `◉`.
 */
export const barOf = (b: BranchInfo, from: number, to: number, width: number): string => {
  const start = Math.max(0, Math.min(from, width - 2))
  const end = Math.min(width - 1, Math.max(to, start + 1))
  const head = b.forkSha === null ? '●' : '┗'
  const tail = b.status === 'merged' ? '┛' : b.status === 'head' ? '◉' : '●'
  return ' '.repeat(start) + head + '━'.repeat(end - start - 1) + tail + ' '.repeat(width - end - 1)
}

/** What a branch's row says after its bar; `home` is the branch you are on, not named again. */
export const statusOf = (b: BranchInfo, home: string | null): string => {
  const count = `${b.shas.length} ${b.shas.length === 1 ? 'commit' : 'commit'}`
  if (b.status === 'head') return `sei qui · ${count}`
  if (b.status === 'merged') {
    const into = `unito${b.pr === null ? '' : ` #${b.pr}`}${b.mergedInto === null || b.mergedInto === home ? '' : ` in ${b.mergedInto}`}`
    return `${into} · ${count}${b.isOnGitHub ? ' · ☁ resta su GitHub' : ''}`
  }
  if (b.status === 'remote') return `solo su GitHub · ${count}`
  return `aperto · ${count}${b.isOnGitHub ? ' · ☁ su GitHub' : ' · solo qui'}`
}
