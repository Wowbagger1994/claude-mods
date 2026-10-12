import type { Commit } from '../types'

/** The graph's strokes, heavy as a metro map's lines. */
export const LINE = { down: '┃', across: '━', close: '┛', open: '┓', joinRight: '┫', joinLeft: '┣', cross: '╋' } as const
export const DOT = { commit: '●', head: '◉', merge: '◆' } as const

/** One character of the graph, and the lane colour it wears; -1 for none. */
export type Cell = { ch: string; color: number }

/**
 * A commit's row: its characters, the lane its dot sits in, its branch's colour,
 * the lanes going on below it, for what is drawn between it and the next, and
 * whether it is plain: a commit like its neighbours, nothing starting, ending or
 * joining there, one that may fold into a run.
 */
export type GraphRow = { cells: Cell[]; col: number; color: number; below: Cell[]; isPlain: boolean }

/** A lane waits for a commit, its parent's, and keeps its colour from tip to base. */
type Lane = { sha: string; color: number } | null

/** Where a stroke from the dot ends: a lane closing into it, a lane it opens, a lane it joins. */
type Stroke = { lane: number; ch: string; color: number }

const BLANK: Cell = { ch: ' ', color: -1 }
/** A stroke's end with the line going on past it, to a farther lane. */
const THROUGH: Record<string, string> = { [LINE.close]: '┻', [LINE.open]: '┳', [LINE.joinRight]: LINE.cross, [LINE.joinLeft]: LINE.cross }

const dotOf = (c: Commit, headSha: string | null) => (c.sha === headSha ? DOT.head : c.parents.length > 1 ? DOT.merge : DOT.commit)

/** The same lanes taken, in the same places. */
const isSameShape = (a: readonly Lane[], b: readonly Lane[]) => a.length === b.length && a.every((l, i) => (l === null) === (b[i] === null))

/** A free lane for a merge's parent: right of the dot first, else a new one at the end. */
const freeLane = (lanes: readonly Lane[], col: number, taken: ReadonlySet<number>) => {
  const free = lanes.findIndex((l, i) => l === null && i > col && !taken.has(i))
  return free >= 0 ? free : lanes.length
}

/** The lanes going on: a line where one waits, a gap where none does. */
const belowOf = (lanes: readonly Lane[]): Cell[] =>
  lanes.flatMap((l, i) => [...(i > 0 ? [BLANK] : []), l === null ? BLANK : { ch: LINE.down, color: l.color }])

const trimmed = (lanes: readonly Lane[]): Lane[] => {
  const last = lanes.reduce((at, l, i) => (l === null ? at : i), -1)
  return lanes.slice(0, last + 1)
}

/** The characters of a row: the dot, the strokes from it, the lanes passing by. */
const cellsOf = (dot: Cell, col: number, before: readonly Lane[], after: readonly Lane[], strokes: readonly Stroke[]): Cell[] => {
  const width = Math.max(before.length, after.length, col + 1)
  const ends = strokes.map(s => s.lane)
  const left = Math.min(col, ...ends)
  const right = Math.max(col, ...ends)
  // A stroke's cells wear the colour of the nearest end beyond them.
  const strokeColor = (x: number) => {
    const beyond = strokes.filter(s => (x > 2 * col ? 2 * s.lane >= x : 2 * s.lane <= x)).sort((a, b) => Math.abs(a.lane - col) - Math.abs(b.lane - col))
    return beyond[0]?.color ?? -1
  }
  const cells: Cell[] = []
  for (let i = 0; i < width; i++) {
    const stroke = strokes.find(s => s.lane === i)
    const passing = before[i] ?? null
    const isSpanned = i > left && i < right
    if (i === col) cells.push(dot)
    else if (stroke !== undefined) cells.push({ ch: isSpanned ? (THROUGH[stroke.ch] ?? stroke.ch) : stroke.ch, color: stroke.color })
    else if (passing !== null) cells.push({ ch: isSpanned ? LINE.cross : LINE.down, color: passing.color })
    else cells.push(isSpanned ? { ch: LINE.across, color: strokeColor(2 * i) } : BLANK)
    if (i < width - 1) cells.push(i >= left && i < right ? { ch: LINE.across, color: strokeColor(2 * i + 1) } : BLANK)
  }
  return cells
}

/**
 * The graph of commits given newest first, in topological order: one row per
 * commit, lanes two characters apart. `colorOf` gives a commit its branch's
 * colour; a line wears the colour of the branch it belongs to: the child's down
 * to its first parent, the merged branch's from a merge to its other parents.
 */
export const layout = (commits: readonly Commit[], headSha: string | null, colorOf: (sha: string) => number = sha => commits.findIndex(c => c.sha === sha)): GraphRow[] => {
  let lanes: Lane[] = []
  const rows: GraphRow[] = []
  for (const c of commits) {
    const before = lanes
    const waiting = lanes.flatMap((l, i) => (l?.sha === c.sha ? [i] : []))
    const isTip = waiting.length === 0
    // A new tip takes the first free lane, or a new one at the end.
    const free = lanes.findIndex(l => l === null)
    const at = isTip ? (free >= 0 ? free : lanes.length) : waiting[0]!
    const color = colorOf(c.sha)
    const closing = waiting.slice(1)
    const strokes: Stroke[] = closing.map(i => ({ lane: i, ch: LINE.close, color: lanes[i]!.color }))

    let after: Lane[] = lanes.map((l, i) => (closing.includes(i) ? null : l))
    after[at] = c.parents[0] === undefined ? null : { sha: c.parents[0], color }
    const taken = new Set(closing)
    for (const p of c.parents.slice(1)) {
      const joined = after.findIndex((l, i) => i !== at && l?.sha === p)
      if (joined >= 0) {
        strokes.push({ lane: joined, ch: joined > at ? LINE.joinRight : LINE.joinLeft, color: after[joined]!.color })
        continue
      }
      const slot = freeLane(after, at, taken)
      const owned = colorOf(p)
      const lane = { sha: p, color: owned >= 0 ? owned : color }
      after = slot === after.length ? [...after, lane] : after.map((l, i) => (i === slot ? lane : l))
      taken.add(slot)
      strokes.push({ lane: slot, ch: LINE.open, color: lane.color })
    }
    lanes = trimmed(after)
    const isPlain = strokes.length === 0 && !isTip && c.parents.length === 1 && c.refs.length === 0 && c.sha !== headSha && isSameShape(trimmed(before), lanes)
    rows.push({ cells: cellsOf({ ch: dotOf(c, headSha), color }, at, before, after, strokes), col: at, color, below: belowOf(lanes), isPlain })
  }
  return rows
}

/** The widest row's characters: where the text after the graph starts. */
export const graphWidth = (rows: readonly GraphRow[]) => rows.reduce((w, r) => Math.max(w, r.cells.length), 0)
