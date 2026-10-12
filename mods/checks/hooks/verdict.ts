import type { CiCheck } from '../types'
import type { Tally } from './ci'
import type { RepoState } from './state'
import { isFailed } from './state'

/** How a repository stands, worst first: red, yellow, green, nothing known yet. */
export type Verdict = 'fail' | 'running' | 'pass' | 'idle'

const RANK: Record<Verdict, number> = { fail: 0, running: 1, pass: 2, idle: 3 }

export const isCheckFailed = (c: CiCheck) => c.bucket === 'fail' || c.bucket === 'cancel'

/** The local runs and the CI checks that failed. */
export const failuresOf = (r: RepoState): number =>
  (r.local?.runs ?? []).filter(x => isFailed(x.exitCode)).length + (r.ci?.checks ?? []).filter(isCheckFailed).length

export const verdictOf = (r: RepoState): Verdict => {
  if (failuresOf(r) > 0) return 'fail'
  const checks = r.ci?.checks ?? []
  if (r.running !== null || checks.some(c => c.bucket === 'pending')) return 'running'
  const hasResult = (r.local?.runs.length ?? 0) > 0 || checks.some(c => c.bucket === 'pass')
  return hasResult ? 'pass' : 'idle'
}

/** The pane's verdict: its worst repository's, with every failure counted. */
export const overallOf = (repos: readonly RepoState[]): { verdict: Verdict; failures: number } => ({
  verdict: repos.map(verdictOf).reduce<Verdict>((worst, v) => (RANK[v] < RANK[worst] ? v : worst), 'idle'),
  failures: repos.reduce((n, r) => n + failuresOf(r), 0),
})

export type MeterCells = { pass: number; fail: number; pending: number; empty: number }

type Part = 'pass' | 'fail' | 'pending'

/** A tally as `width` cells: each part its share, at least one cell when it is not zero. */
export const meterCells = (t: Tally, width: number): MeterCells => {
  if (t.total <= 0) return { pass: 0, fail: 0, pending: 0, empty: width }
  const counts: Record<Part, number> = { pass: t.passed, fail: t.failed, pending: t.pending }
  const parts: Part[] = ['pass', 'fail', 'pending']
  const exact = (p: Part) => (counts[p] * width) / t.total
  const target = Math.min(width, Math.round(((t.passed + t.failed + t.pending) * width) / t.total))
  const start = Object.fromEntries(parts.map(p => [p, counts[p] > 0 ? Math.max(1, Math.round(exact(p))) : 0])) as Record<Part, number>
  const sum = (c: Record<Part, number>) => c.pass + c.fail + c.pending
  const settle = (c: Record<Part, number>): Record<Part, number> => {
    if (sum(c) > target) {
      // Taken from the largest part that can spare a cell.
      const from = parts.filter(p => c[p] > 1).sort((a, b) => c[b] - c[a])[0]
      return from === undefined ? c : settle({ ...c, [from]: c[from] - 1 })
    }
    if (sum(c) < target) {
      // Given to the part furthest below its share.
      const to = parts.filter(p => counts[p] > 0).sort((a, b) => exact(b) - c[b] - (exact(a) - c[a]))[0]
      return to === undefined ? c : settle({ ...c, [to]: c[to] + 1 })
    }
    return c
  }
  const cells = settle(start)
  return { ...cells, empty: width - sum(cells) }
}
