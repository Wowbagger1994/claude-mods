import type { Commit } from '../types'
import type { GraphRow } from './graph'
import { dayKey } from './labels'

/** This many plain commits in a row, or more, fold into one line. */
export const MIN_RUN = 3

/** What the map draws, top to bottom: a day's heading, a commit, a run of commits folded into one. */
export type Item =
  | { kind: 'day'; key: string; at: number; index: number }
  | { kind: 'commit'; key: string; index: number }
  | { kind: 'fold'; key: string; from: number; to: number }

export const foldKey = (sha: string) => `fold:${sha}`

/** Runs of plain commits of one branch, back to back: [from, to] by row. */
const runsOf = (commits: readonly Commit[], rows: readonly GraphRow[], owner: ReadonlyMap<string, string>, keep: ReadonlySet<string>): [number, number][] => {
  const isFoldable = (i: number) => rows[i]?.isPlain === true && !keep.has(commits[i]!.sha)
  const runs: [number, number][] = []
  let start = -1
  commits.forEach((c, i) => {
    const goesOn = start >= 0 && isFoldable(i) && owner.get(c.sha) === owner.get(commits[start]!.sha) && rows[i]!.col === rows[start]!.col
    if (goesOn) return
    if (start >= 0 && i - start >= MIN_RUN) runs.push([start, i - 1])
    start = isFoldable(i) ? i : -1
  })
  if (start >= 0 && commits.length - start >= MIN_RUN) runs.push([start, commits.length - 1])
  return runs
}

/**
 * The map's lines: commits, long plain runs folded unless opened, and a day's
 * heading before the first line of each older day. Commits in `keep` (the
 * selected one, where you are) never fold.
 */
export const itemsOf = (
  commits: readonly Commit[],
  rows: readonly GraphRow[],
  owner: ReadonlyMap<string, string>,
  opened: ReadonlySet<string>,
  keep: ReadonlySet<string>,
): Item[] => {
  const runs = runsOf(commits, rows, owner, keep).filter(([from]) => !opened.has(foldKey(commits[from]!.sha)))
  const runAt = new Map(runs.map(r => [r[0], r]))
  const items: Item[] = []
  let lastDay: string | null = null
  for (let i = 0; i < commits.length; i++) {
    const run = runAt.get(i)
    const c = commits[i]!
    const day = dayKey(c.at)
    // Topological order wanders in time: a heading only when the day goes back.
    if (lastDay === null || day < lastDay) {
      items.push({ kind: 'day', key: `day:${day}:${i}`, at: c.at, index: i })
      lastDay = day
    }
    if (run !== undefined) {
      items.push({ kind: 'fold', key: foldKey(c.sha), from: run[0], to: run[1] })
      i = run[1]
      // The run's oldest day counts too: the next heading comes after it.
      const oldest = dayKey(commits[run[1]]!.at)
      if (oldest < lastDay) lastDay = oldest
    } else items.push({ kind: 'commit', key: c.sha, index: i })
  }
  return items
}

/** The lines the selection can stop on. */
export const isSelectable = (item: Item) => item.kind !== 'day'
