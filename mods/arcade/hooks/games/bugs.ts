import { drawBugs } from './bugs-draw'
import type { Rng } from './rng'
import { nextInt } from './rng'
import type { GameDef, Row, Span } from './types'

/** A bug in a cell of the keypad grid (1–9), and how long it has been there. */
export type Bug = { cell: number; age: number; life: number }

/** The last press, shown on its cell for a moment: a hit, with the points it made, or a miss. */
export type Flash = { cell: number; isHit: boolean; points: number; left: number }

export type Bugs = {
  bugs: Bug[]
  /** Milliseconds left in the round. */
  timeLeft: number
  /** Milliseconds played: bugs live shorter and come faster as it grows. */
  elapsed: number
  /** Milliseconds before the next bug shows up. */
  spawnIn: number
  lives: number
  score: number
  flash: Flash | null
  /** Columns of room, to center the grid; rows of room, to pick tall cells or short ones. */
  columns: number
  rows: number
  isOver: boolean
  rng: Rng
}

export const ROUND_MS = 30_000
export const LIVES = 3
export const HIT_POINTS = 10
/** Extra points for a bug hit within the first third of its life. */
export const FAST_BONUS = 5
const FIRST_SPAWN_MS = 600
const FLASH_MS = 400
/** A bug lives this long at the start, and this long at the end of the round. */
const LIFE_START_MS = 1_600
const LIFE_END_MS = 700
/** A new bug every this many ms at the start, and at the end. */
const SPAWN_START_MS = 900
const SPAWN_END_MS = 420
const CELLS = 9

/** From `start` to `end` as the round goes by. */
const ramp = (elapsed: number, start: number, end: number) => start + (end - start) * Math.min(1, elapsed / ROUND_MS)

export const lifeAt = (elapsed: number): number => Math.round(ramp(elapsed, LIFE_START_MS, LIFE_END_MS))
export const spawnGapAt = (elapsed: number): number => Math.round(ramp(elapsed, SPAWN_START_MS, SPAWN_END_MS))

/** Rows the tall grid takes: the time bar and three rows of five-row cells. */
export const ROOMY_ROWS = 16

export const newBugs = (columns: number, rng: Rng, rows = ROOMY_ROWS): Bugs => ({
  bugs: [],
  timeLeft: ROUND_MS,
  elapsed: 0,
  spawnIn: FIRST_SPAWN_MS,
  lives: LIVES,
  score: 0,
  flash: null,
  columns,
  rows,
  isOver: false,
  rng,
})

/** A bug in a free cell, picked at random; none when all nine are taken. */
const spawn = (g: Bugs): Bugs => {
  const free = Array.from({ length: CELLS }, (_, i) => i + 1).filter(c => !g.bugs.some(b => b.cell === c))
  if (free.length === 0) return { ...g, spawnIn: spawnGapAt(g.elapsed) }
  const [i, rng] = nextInt(g.rng, free.length)
  const bug = { cell: free[i]!, age: 0, life: lifeAt(g.elapsed) }
  return { ...g, bugs: [...g.bugs, bug], spawnIn: spawnGapAt(g.elapsed), rng }
}

const end = (g: Bugs): Bugs => (g.timeLeft <= 0 || g.lives <= 0 ? { ...g, isOver: true } : g)

/** Time passing: bugs age and the ones left too long cost a life; new ones come. */
export const tickBugs = (g: Bugs, ms: number): Bugs => {
  if (g.isOver) return g
  const aged = g.bugs.map(b => ({ ...b, age: b.age + ms }))
  const escaped = aged.filter(b => b.age >= b.life)
  const moved: Bugs = {
    ...g,
    bugs: aged.filter(b => b.age < b.life),
    timeLeft: Math.max(0, g.timeLeft - ms),
    elapsed: g.elapsed + ms,
    spawnIn: g.spawnIn - ms,
    lives: g.lives - escaped.length,
    flash: g.flash === null || g.flash.left <= ms ? null : { ...g.flash, left: g.flash.left - ms },
  }
  return end(moved.spawnIn <= 0 ? spawn(moved) : moved)
}

/** A digit hits the bug in that cell; a digit on an empty cell costs a life. */
export const pressBugs = (g: Bugs, key: string): Bugs => {
  const cell = Number(key)
  if (g.isOver || !/^[1-9]$/.test(key)) return g
  const bug = g.bugs.find(b => b.cell === cell)
  if (bug === undefined) return end({ ...g, lives: g.lives - 1, flash: { cell, isHit: false, points: 0, left: FLASH_MS } })
  const points = HIT_POINTS + (bug.age < bug.life / 3 ? FAST_BONUS : 0)
  return {
    ...g,
    bugs: g.bugs.filter(b => b.cell !== cell),
    score: g.score + points,
    flash: { cell, isHit: true, points, left: FLASH_MS },
  }
}

export { drawBugs }

export const bugsStatus = (g: Bugs): string =>
  `⏱ ${Math.ceil(g.timeLeft / 1000)} s · ${'♥'.repeat(Math.max(0, g.lives))}${'♡'.repeat(LIVES - Math.max(0, g.lives))}`

export const BUGS: GameDef<Bugs> = {
  id: 'bugs',
  name: 'Acchiappa il bug',
  keys: 'premi il numero della cella col bug (1–9, come il tastierino)',
  create: ctx => newBugs(ctx.columns, ctx.rng, ctx.rows),
  key: pressBugs,
  tick: tickBugs,
  isOver: g => g.isOver,
  score: g => g.score,
  draw: g => drawBugs(g),
  status: bugsStatus,
}
