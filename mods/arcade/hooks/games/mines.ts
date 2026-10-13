import { directionOf, isSpace } from './keys'
import type { Rng } from './rng'
import { nextInt } from './rng'
import { centerPad, framed, meter, pack, PALETTE, widthOf } from './style'
import type { GameDef, Row, Span } from './types'

export type Point = { x: number; y: number }

/** What the last key did, shown until the next one: cells opened, a flag set or taken off. */
export type MinesEvent = { kind: 'open'; cells: Point[] } | { kind: 'flag'; isOn: boolean }

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
  /** Columns of the room, to center the drawing; 0 draws it at the left. */
  columns: number
  event: MinesEvent | null
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

/** The classic colours of 1 to 8, brightened for a dark terminal. */
export const NUMBER_COLORS = ['', '#60a5fa', '#4ade80', '#f87171', '#c084fc', '#fbbf24', '#2dd4bf', '#fafafa', '#a1a1aa']
/** A covered cell: a raised tile, `▐█▌`, half a column of gap each side. */
export const TILE = '#52525b'
const CURSOR = PALETTE.claude
const DARK_TEXT = '#1a1a1a'
/** The wash on the cells the last key opened. */
export const OPENED_BG = '#14532d'
/** Cells of the progress meter in the bottom edge; fewer on a field narrower than `WIDE_FIELD`. */
const METER_CELLS = 8
const SHORT_METER_CELLS = 5
const WIDE_FIELD = 12

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))
const grid = <T,>(width: number, height: number, value: T): T[][] =>
  Array.from({ length: height }, () => Array<T>(width).fill(value))

export const newMines = (width: number, height: number, rng: Rng, columns = 0): Mines => ({
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
  columns,
  event: null,
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

/** The game after a cell was opened, remembering which cells that opened. */
const withOpened = (before: Mines, after: Mines): Mines => {
  if (after === before) return before
  const cells = after.revealed.flatMap((row, y) => row.flatMap((isOpen, x) => (isOpen && before.revealed[y]?.[x] !== true ? [{ x, y }] : [])))
  return { ...after, event: { kind: 'open', cells } }
}

/** The game after a flag was toggled, remembering whether it went on or off. */
const withFlag = (before: Mines, after: Mines): Mines =>
  after === before ? before : { ...after, event: { kind: 'flag', isOn: after.flagged[after.cursor.y]?.[after.cursor.x] === true } }

export const keyMines = (m: Mines, key: string): Mines => {
  if (m.isOver) return m
  if (isSpace(key) || key === 'return') return withOpened(m, reveal(m, m.cursor))
  if (key === 'f') return withFlag(m, toggleFlag(m, m.cursor))
  const dir = directionOf(key)
  if (dir === undefined) return m
  const dx = dir === 'left' ? -1 : dir === 'right' ? 1 : 0
  const dy = dir === 'up' ? -1 : dir === 'down' ? 1 : 0
  return { ...m, cursor: { x: clamp(m.cursor.x + dx, 0, m.width - 1), y: clamp(m.cursor.y + dy, 0, m.height - 1) }, event: null }
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

/** A tile three columns wide: `▐` and `▌` in its colour around the middle. */
const tile = (color: string, middle: Span = { text: '█', fg: color }): Span[] => [{ text: '▐', fg: color }, middle, { text: '▌', fg: color }]

const onTile = (text: string, fg: string): Span => ({ text, fg, bg: TILE, bold: true })

const isFresh = (m: Mines, x: number, y: number) => m.event?.kind === 'open' && m.event.cells.some(p => p.x === x && p.y === y)

/** An opened cell: its count in its colour, or a faint dot; washed green when the last key opened it. */
const openedSpan = (m: Mines, x: number, y: number): Span => {
  const n = minesAround(m, { x, y })
  const span: Span = n === 0 ? { text: ' · ', fg: PALETTE.frame } : { text: ` ${n} `, fg: NUMBER_COLORS[n], bold: true }
  return isFresh(m, x, y) ? { ...span, bg: OPENED_BG } : span
}

/** A cell as the game shows it, three columns: a tile, a flag, a number, or at the end the mines. */
const cellSpans = (m: Mines, x: number, y: number): Span[] => {
  const isMine = m.mines?.[y]?.[x] === true
  const isFlag = m.flagged[y]?.[x] === true
  if (m.isOver && isMine && (m.hasWon || isFlag)) return tile(TILE, onTile('⚑', m.hasWon ? PALETTE.good : PALETTE.danger))
  if (m.isOver && isMine) {
    const isExploded = m.exploded?.x === x && m.exploded?.y === y
    return isExploded ? tile(PALETTE.danger, { text: '✸', fg: PALETTE.white, bg: PALETTE.danger, bold: true }) : [{ text: ' ✱ ', fg: PALETTE.danger, bold: true }]
  }
  if (isFlag) return tile(TILE, onTile(m.isOver ? '✗' : '⚑', PALETTE.danger))
  return m.revealed[y]?.[x] === true ? [openedSpan(m, x, y)] : tile(TILE)
}

/** The cell under the cursor, in Claude's orange: a lit tile, or an opened cell on orange. */
const cursorSpans = (m: Mines, x: number, y: number): Span[] => {
  if (m.revealed[y]?.[x] === true) return [{ ...openedSpan(m, x, y), fg: DARK_TEXT, bg: CURSOR, bold: true }]
  const middle: Span = m.flagged[y]?.[x] === true ? { text: '⚑', fg: DARK_TEXT, bg: CURSOR, bold: true } : { text: '█', fg: CURSOR }
  return tile(CURSOR, middle)
}

/** What the last key did, or how the game ended, for the bottom edge. */
const eventLabel = (m: Mines): Span[] => {
  if (m.isOver) return [m.hasWon ? { text: ' ripulito! ', fg: PALETTE.good, bold: true } : { text: ' BOOM ', fg: PALETTE.danger, bold: true }]
  if (m.event?.kind === 'open' && m.event.cells.length > 0) return [{ text: ` +${m.event.cells.length} `, fg: PALETTE.good, bold: true }]
  if (m.event?.kind === 'flag') return [{ text: m.event.isOn ? ' ⚑ messa ' : ' ⚑ tolta ', fg: PALETTE.hurry, bold: true }]
  return []
}

/**
 * The bottom edge: the share of safe cells opened as a meter, then the last
 * event; on a field too narrow for all, the meter goes first, then the share.
 */
const footerOf = (m: Mines): Span[] => {
  const share = revealedCount(m) / Math.max(1, m.width * m.height - m.mineCount)
  const cells = m.width >= WIDE_FIELD ? METER_CELLS : SHORT_METER_CELLS
  const event = eventLabel(m)
  const percent: Span = { text: ` ${Math.floor(share * 100)}% `, fg: PALETTE.label }
  // A blank with no colour becomes the frame's line: `▰▰▱▱ 31% ─ +43 ─`.
  const tail = event.length > 0 ? [{ text: ' ' }, ...event] : []
  const room = m.width * CELL_WIDTH - 1
  const choices = [[...meter(share, cells, PALETTE.good), percent, ...tail], [percent, ...tail], event]
  return choices.find(spans => widthOf(spans) <= room) ?? event
}

/** The top edge: the mines in the field and the flags set, amber with more flags than mines. */
const titleOf = (m: Mines) => {
  const flags = m.flagged.flat().filter(Boolean).length
  return { title: `✱ ${m.mineCount} · ⚑ ${flags}`, titleColor: flags > m.mineCount ? PALETTE.hurry : PALETTE.label }
}

const frameColor = (m: Mines): string => (!m.isOver ? PALETTE.frame : m.hasWon ? PALETTE.good : PALETTE.danger)

/** The field in a rounded frame, centered: the counts on top, the progress and the last event below. */
export const drawMines = (m: Mines): Row[] => {
  const rows = m.revealed.map((row, y) =>
    row.flatMap((_, x) => (!m.isOver && m.cursor.x === x && m.cursor.y === y ? cursorSpans(m, x, y) : cellSpans(m, x, y))),
  )
  const width = m.width * CELL_WIDTH
  const pad = centerPad(m.columns, width + 2)
  return framed(rows, width, { ...titleOf(m), color: frameColor(m), footer: footerOf(m) }).map(row => pack([pad, ...row]))
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
      ctx.columns,
    ),
  key: keyMines,
  tick: tickMines,
  isOver: m => m.isOver,
  score: scoreMines,
  draw: drawMines,
  status: m => `⚑ ${flagsLeft(m)} · ${Math.floor(m.elapsedMs / 1000)}s`,
}
