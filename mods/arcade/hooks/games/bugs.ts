import { pack } from '../draw'
import type { Rng } from './rng'
import { nextInt } from './rng'
import type { GameDef, Row, Span } from './types'

/** A bug in a cell of the keypad grid (1–9), and how long it has been there. */
export type Bug = { cell: number; age: number; life: number }

/** The last press, shown on its cell for a moment: a hit or a miss. */
export type Flash = { cell: number; isHit: boolean; left: number }

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
  /** Columns of room, to center the grid. */
  columns: number
  isOver: boolean
  rng: Rng
}

export const ROUND_MS = 30_000
export const LIVES = 3
export const HIT_POINTS = 10
/** Extra points for a bug hit within the first third of its life. */
export const FAST_BONUS = 5
const FIRST_SPAWN_MS = 600
const FLASH_MS = 250
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

export const newBugs = (columns: number, rng: Rng): Bugs => ({
  bugs: [],
  timeLeft: ROUND_MS,
  elapsed: 0,
  spawnIn: FIRST_SPAWN_MS,
  lives: LIVES,
  score: 0,
  flash: null,
  columns,
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
  if (bug === undefined) return end({ ...g, lives: g.lives - 1, flash: { cell, isHit: false, left: FLASH_MS } })
  const points = HIT_POINTS + (bug.age < bug.life / 3 ? FAST_BONUS : 0)
  return {
    ...g,
    bugs: g.bugs.filter(b => b.cell !== cell),
    score: g.score + points,
    flash: { cell, isHit: true, left: FLASH_MS },
  }
}

const CELL_WIDTH = 11
const GUTTER = 2
const EMPTY_BG = '#262626'
const HIT_BG = '#166534'
const MISS_BG = '#7f1d1d'
const BUG_COLOR = '#c084fc'
const OLD_BUG_COLOR = '#ef4444'
const LABEL = '#737373'
/** A bug, two rows of one-column glyphs. */
const BUG_ART = ['╲▄█▄╱', '╱▀█▀╲']
/** The keypad's rows, top first: 7 8 9 over 4 5 6 over 1 2 3. */
const KEYPAD = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
]

const centered = (text: string, width: number) => {
  const left = Math.floor((width - text.length) / 2)
  return ' '.repeat(left) + text + ' '.repeat(width - left - text.length)
}

/** One of the three text rows of a cell. */
const cellLine = (g: Bugs, cell: number, line: number): Span => {
  const bug = g.bugs.find(b => b.cell === cell)
  const flash = g.flash?.cell === cell ? g.flash : null
  const bg = flash === null ? EMPTY_BG : flash.isHit ? HIT_BG : MISS_BG
  if (line === 0) return { text: ` ${cell}`.padEnd(CELL_WIDTH), fg: LABEL, bg }
  if (bug === undefined) return { text: ' '.repeat(CELL_WIDTH), bg }
  // A bug about to escape turns red.
  const fg = bug.age > (bug.life * 2) / 3 ? OLD_BUG_COLOR : BUG_COLOR
  return { text: centered(BUG_ART[line - 1] ?? '', CELL_WIDTH), fg, bg, bold: true }
}

/** The 3×3 grid, numbered as the keypad, centered in the room. */
export const drawBugs = (g: Bugs): Row[] => {
  const width = CELL_WIDTH * 3 + GUTTER * 2
  const pad = ' '.repeat(Math.max(0, Math.floor((g.columns - width) / 2)))
  return KEYPAD.flatMap((cells, r) => {
    const lines = [0, 1, 2].map(line =>
      pack([
        { text: pad },
        ...cells.flatMap((cell, i): Span[] => (i === 0 ? [cellLine(g, cell, line)] : [{ text: ' '.repeat(GUTTER) }, cellLine(g, cell, line)])),
      ]),
    )
    return r < KEYPAD.length - 1 ? [...lines, [{ text: '' }]] : lines
  })
}

export const bugsStatus = (g: Bugs): string =>
  `⏱ ${Math.ceil(g.timeLeft / 1000)} s · ${'♥'.repeat(Math.max(0, g.lives))}${'♡'.repeat(LIVES - Math.max(0, g.lives))}`

export const BUGS: GameDef<Bugs> = {
  id: 'bugs',
  name: 'Acchiappa il bug',
  keys: 'premi il numero della cella col bug (1–9, come il tastierino)',
  create: ctx => newBugs(ctx.columns, ctx.rng),
  key: pressBugs,
  tick: tickBugs,
  isOver: g => g.isOver,
  score: g => g.score,
  draw: drawBugs,
  status: bugsStatus,
}
