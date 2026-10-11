import { pack } from '../draw'
import { directionOf, isSpace } from './keys'
import type { Rng } from './rng'
import { nextInt } from './rng'
import type { GameDef, Row, Span } from './types'

export type Point = { x: number; y: number }

export type Mines = {
  width: number
  height: number
  /** Where the mines are; null until the first cell is opened, so that one is never a mine. */
  mines: boolean[][] | null
  mineCount: number
  revealed: boolean[][]
  flagged: boolean[][]
  cursor: Point
  /** Milliseconds since the first cell was opened, while the game runs. */
  elapsedMs: number
  isOver: boolean
  hasWon: boolean
  /** The mine that ended the game, drawn in red. */
  exploded: Point | null
  rng: Rng
}

const MAX = { width: 16, height: 10 }
const MIN = { width: 8, height: 6 }
/** Each cell is three columns wide, plus the two-column frame. */
const CELL_WIDTH = 3
const FRAME_ROWS = 2
export const MINE_SHARE = 0.15
/** A won game's bonus: this much, less a little per second, never below the floor. */
export const WIN_BONUS = 1000
const BONUS_PER_SECOND = 5
const MIN_WIN_BONUS = 100

const NUMBER_COLORS = ['', '#3b82f6', '#22c55e', '#ef4444', '#6366f1', '#b91c1c', '#14b8a6', '#e5e7eb', '#9ca3af']
const HIDDEN = '#4b5563'
const CURSOR = '#d97757'
const FRAME = '#6b7280'
const FLAG = '#ef4444'
const DARK_TEXT = '#1a1a1a'

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
const grid = <T,>(width: number, height: number, value: T): T[][] =>
  Array.from({ length: height }, () => Array<T>(width).fill(value))

export const newMines = (width: number, height: number, rng: Rng): Mines => ({
  width,
  height,
  mines: null,
  mineCount: Math.round(width * height * MINE_SHARE),
  revealed: grid(width, height, false),
  flagged: grid(width, height, false),
  cursor: { x: Math.floor(width / 2), y: Math.floor(height / 2) },
  elapsedMs: 0,
  isOver: false,
  hasWon: false,
  exploded: null,
  rng,
})

const neighbours = (m: Pick<Mines, 'width' | 'height'>, p: Point): Point[] =>
  [-1, 0, 1]
    .flatMap(dy => [-1, 0, 1].map(dx => ({ x: p.x + dx, y: p.y + dy })))
    .filter(q => (q.x !== p.x || q.y !== p.y) && q.x >= 0 && q.y >= 0 && q.x < m.width && q.y < m.height)

/** Mines laid at random, none on the first cell opened nor around it (unless the board is too small for that). */
export const layMines = (m: Mines, first: Point): Mines => {
  const all = Array.from({ length: m.width * m.height }, (_, i) => ({ x: i % m.width, y: Math.floor(i / m.width) }))
  const near = new Set([first, ...neighbours(m, first)].map(p => `${p.x},${p.y}`))
  const away = all.filter(p => !near.has(`${p.x},${p.y}`))
  const candidates = away.length >= m.mineCount ? away : all.filter(p => p.x !== first.x || p.y !== first.y)
  let rng = m.rng
  const pool = [...candidates]
  const chosen: Point[] = []
  for (let i = 0; i < m.mineCount && pool.length > 0; i++) {
    const [j, next] = nextInt(rng, pool.length)
    rng = next
    chosen.push(pool.splice(j, 1)[0]!)
  }
  const mines = grid(m.width, m.height, false).map((row, y) => row.map((_, x) => chosen.some(p => p.x === x && p.y === y)))
  return { ...m, mines, mineCount: chosen.length, rng }
}

export const minesAround = (m: Mines, p: Point): number => neighbours(m, p).filter(q => m.mines?.[q.y]?.[q.x] === true).length

const revealedCount = (m: Mines): number => m.revealed.flat().filter(Boolean).length

/** Opens a cell: a mine ends the game; a cell with no mines around opens its neighbours too. */
export const reveal = (start: Mines, p: Point): Mines => {
  const m = start.mines === null ? layMines(start, p) : start
  if (m.isOver || m.revealed[p.y]?.[p.x] === true || m.flagged[p.y]?.[p.x] === true) return m
  if (m.mines?.[p.y]?.[p.x] === true) return { ...m, isOver: true, hasWon: false, exploded: p }

  const revealed = m.revealed.map(row => [...row])
  const queue = [p]
  while (queue.length > 0) {
    const q = queue.shift()!
    if (revealed[q.y]![q.x] || m.flagged[q.y]![q.x]) continue
    revealed[q.y]![q.x] = true
    if (minesAround(m, q) === 0) queue.push(...neighbours(m, q).filter(n => !revealed[n.y]![n.x]))
  }
  const opened = { ...m, revealed }
  const hasWon = revealedCount(opened) === m.width * m.height - m.mineCount
  return hasWon ? { ...opened, isOver: true, hasWon: true } : opened
}

export const toggleFlag = (m: Mines, p: Point): Mines =>
  m.isOver || m.revealed[p.y]?.[p.x] === true
    ? m
    : { ...m, flagged: m.flagged.map((row, y) => row.map((f, x) => (x === p.x && y === p.y ? !f : f))) }

export const keyMines = (m: Mines, key: string): Mines => {
  if (m.isOver) return m
  if (isSpace(key) || key === 'return') return reveal(m, m.cursor)
  if (key === 'f') return toggleFlag(m, m.cursor)
  const dir = directionOf(key)
  if (dir === undefined) return m
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
  return { ...m, cursor: { x: clamp(m.cursor.x + dx, 0, m.width - 1), y: clamp(m.cursor.y + dy, 0, m.height - 1) } }
}

/** The clock runs from the first cell opened to the end. */
export const tickMines = (m: Mines, ms: number): Mines => (m.mines === null || m.isOver ? m : { ...m, elapsedMs: m.elapsedMs + ms })

/** Cells opened, and on a win a bonus that shrinks with the seconds taken. */
export const scoreMines = (m: Mines): number => {
  const seconds = Math.floor(m.elapsedMs / 1000)
  const bonus = m.hasWon ? Math.max(MIN_WIN_BONUS, WIN_BONUS - seconds * BONUS_PER_SECOND) : 0
  return revealedCount(m) + bonus
}

const flagsLeft = (m: Mines): number => m.mineCount - m.flagged.flat().filter(Boolean).length

const cellSpan = (m: Mines, x: number, y: number): Span => {
  const isMine = m.mines?.[y]?.[x] === true
  const isFlag = m.flagged[y]?.[x] === true
  if (m.isOver && isMine && !isFlag) {
    const isExploded = m.exploded?.x === x && m.exploded?.y === y
    return { text: ' ✱ ', fg: isExploded ? DARK_TEXT : FLAG, bg: isExploded ? FLAG : undefined, bold: true }
  }
  if (isFlag) return { text: m.isOver && !isMine ? ' ✗ ' : ' ⚑ ', fg: FLAG, bg: HIDDEN, bold: true }
  if (m.revealed[y]?.[x] !== true) return { text: '   ', bg: HIDDEN }
  const n = minesAround(m, { x, y })
  return n === 0 ? { text: ' · ', fg: '#3f3f46' } : { text: ` ${n} `, fg: NUMBER_COLORS[n], bold: true }
}

export const drawMines = (m: Mines): Row[] => {
  const edge = (l: string, r: string): Row => [{ text: `${l}${'─'.repeat(m.width * CELL_WIDTH)}${r}`, fg: FRAME }]
  const rows = m.revealed.map((row, y) =>
    pack([
      { text: '│', fg: FRAME },
      ...row.map((_, x) => {
        const span = cellSpan(m, x, y)
        const isCursor = !m.isOver && m.cursor.x === x && m.cursor.y === y
        return isCursor ? { ...span, bg: CURSOR, fg: DARK_TEXT } : span
      }),
      { text: '│', fg: FRAME },
    ]),
  )
  return [edge('┌', '┐'), ...rows, edge('└', '┘')]
}

export const MINES: GameDef<Mines> = {
  id: 'mines',
  name: 'Campo minato',
  keys: 'frecce muovi · spazio scopre · f bandierina',
  create: ctx =>
    newMines(
      clamp(Math.floor((ctx.columns - 2) / CELL_WIDTH), MIN.width, MAX.width),
      clamp(ctx.rows - FRAME_ROWS, MIN.height, MAX.height),
      ctx.rng,
    ),
  key: keyMines,
  tick: tickMines,
  isOver: m => m.isOver,
  score: scoreMines,
  draw: drawMines,
  status: m => `⚑ ${flagsLeft(m)} · ${Math.floor(m.elapsedMs / 1000)}s`,
}
