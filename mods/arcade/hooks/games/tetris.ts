import { pack } from '../draw'
import { directionOf, isSpace } from './keys'
import type { Rng } from './rng'
import { nextInt } from './rng'
import type { GameDef, Row, Span } from './types'

export type Kind = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L'
export type Point = { x: number; y: number }

/** A falling piece: its shape (filled cells of a square matrix, row-major) and the matrix's top-left on the board. */
export type Piece = { kind: Kind; cells: Point[]; size: number; x: number; y: number }

/** Row-major, top first; null for an empty cell, else the kind that locked there. */
export type Board = (Kind | null)[][]

export type Tetris = {
  width: number
  height: number
  board: Board
  piece: Piece
  next: Kind
  /** Kinds still to come from the current bag of seven. */
  bag: Kind[]
  rng: Rng
  score: number
  lines: number
  level: number
  /** Milliseconds since the piece last fell a row. */
  fallMs: number
  isOver: boolean
}

export const WIDTH = 10
const MAX_HEIGHT = 20
const MIN_HEIGHT = 14
/** Rows of the board's room the frame takes. */
const FRAME_ROWS = 2
const KINDS: readonly Kind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
/** Points for 1, 2, 3 and 4 rows cleared at once, times the level. */
export const LINE_POINTS = [0, 100, 300, 500, 800]
const LINES_PER_LEVEL = 10
const SOFT_DROP_POINTS = 1
const HARD_DROP_POINTS = 2
/** Milliseconds per row at level 1, less at each level, never below the floor. */
const BASE_FALL_MS = 800
const FALL_STEP_MS = 70
const MIN_FALL_MS = 80
/** Where a rotation that does not fit may try instead: in place, one left, one right. */
const KICKS = [0, -1, 1]

const SHAPES: Record<Kind, string[]> = {
  I: ['....', 'XXXX', '....', '....'],
  O: ['XX', 'XX'],
  T: ['.X.', 'XXX', '...'],
  S: ['.XX', 'XX.', '...'],
  Z: ['XX.', '.XX', '...'],
  J: ['X..', 'XXX', '...'],
  L: ['..X', 'XXX', '...'],
}

export const COLORS: Record<Kind, string> = {
  I: '#22d3ee',
  O: '#facc15',
  T: '#a855f7',
  S: '#22c55e',
  Z: '#ef4444',
  J: '#3b82f6',
  L: '#f97316',
}
const FRAME = '#6b7280'

const cellsOf = (shape: string[]): Point[] =>
  shape.flatMap((line, y) => [...line].flatMap((c, x) => (c === 'X' ? [{ x, y }] : [])))

/** A piece of `kind` at the top, centred. */
export const spawn = (kind: Kind, width: number): Piece => {
  const size = SHAPES[kind].length
  return { kind, cells: cellsOf(SHAPES[kind]), size, x: Math.floor((width - size) / 2), y: 0 }
}

/** The piece turned a quarter clockwise within its square. */
export const rotate = (p: Piece): Piece =>
  p.kind === 'O' ? p : { ...p, cells: p.cells.map(c => ({ x: p.size - 1 - c.y, y: c.x })) }

const blocksOf = (p: Piece): Point[] => p.cells.map(c => ({ x: p.x + c.x, y: p.y + c.y }))

/** True when every block of the piece is inside the board and on an empty cell. */
export const fits = (board: Board, p: Piece): boolean =>
  blocksOf(p).every(b => b.x >= 0 && b.x < (board[0]?.length ?? 0) && b.y >= 0 && b.y < board.length && board[b.y]?.[b.x] === null)

/** Seven kinds in a random order: each comes once per bag. */
const shuffledBag = (rng: Rng): [Kind[], Rng] => {
  let r = rng
  const bag = [...KINDS]
  for (let i = bag.length - 1; i > 0; i--) {
    const [j, next] = nextInt(r, i + 1)
    r = next
    const swap = bag[i]!
    bag[i] = bag[j]!
    bag[j] = swap
  }
  return [bag, r]
}

/** The next kind out of the bag, refilling it when empty. */
const draw = (bag: Kind[], rng: Rng): [Kind, Kind[], Rng] => {
  const [full, r] = bag.length > 0 ? [bag, rng] : shuffledBag(rng)
  return [full[0]!, full.slice(1), r]
}

export const emptyBoard = (width: number, height: number): Board =>
  Array.from({ length: height }, () => Array<Kind | null>(width).fill(null))

export const newTetris = (width: number, height: number, rng: Rng): Tetris => {
  const [first, bag1, r1] = draw([], rng)
  const [next, bag2, r2] = draw(bag1, r1)
  return {
    width,
    height,
    board: emptyBoard(width, height),
    piece: spawn(first, width),
    next,
    bag: bag2,
    rng: r2,
    score: 0,
    lines: 0,
    level: 1,
    fallMs: 0,
    isOver: false,
  }
}

export const fallInterval = (level: number): number => Math.max(MIN_FALL_MS, BASE_FALL_MS - (level - 1) * FALL_STEP_MS)

/** The piece fixed into the board, full rows cleared and scored, the next piece in play (or the end). */
export const lock = (t: Tetris): Tetris => {
  const blocks = blocksOf(t.piece)
  const merged = t.board.map((row, y) => row.map((cell, x) => (blocks.some(b => b.x === x && b.y === y) ? t.piece.kind : cell)))
  const kept = merged.filter(row => row.some(cell => cell === null))
  const cleared = t.height - kept.length
  const board = [...emptyBoard(t.width, cleared), ...kept]
  const lines = t.lines + cleared
  const score = t.score + (LINE_POINTS[cleared] ?? 0) * t.level
  const [next, bag, rng] = draw(t.bag, t.rng)
  const piece = spawn(t.next, t.width)
  return {
    ...t,
    board,
    piece,
    next,
    bag,
    rng,
    score,
    lines,
    level: Math.floor(lines / LINES_PER_LEVEL) + 1,
    fallMs: 0,
    isOver: !fits(board, piece),
  }
}

const moved = (t: Tetris, dx: number, dy: number): Piece | null => {
  const p = { ...t.piece, x: t.piece.x + dx, y: t.piece.y + dy }
  return fits(t.board, p) ? p : null
}

/** One row down; a piece that cannot fall locks. */
const fall = (t: Tetris): Tetris => {
  const p = moved(t, 0, 1)
  return p === null ? lock(t) : { ...t, piece: p }
}

const turn = (t: Tetris): Tetris => {
  const turned = rotate(t.piece)
  const kicked = KICKS.map(dx => ({ ...turned, x: turned.x + dx })).find(p => fits(t.board, p))
  return kicked === undefined ? t : { ...t, piece: kicked }
}

const hardDrop = (t: Tetris): Tetris => {
  let piece = t.piece
  let rows = 0
  while (fits(t.board, { ...piece, y: piece.y + 1 })) {
    piece = { ...piece, y: piece.y + 1 }
    rows++
  }
  return lock({ ...t, piece, score: t.score + rows * HARD_DROP_POINTS })
}

export const keyTetris = (t: Tetris, key: string): Tetris => {
  if (t.isOver) return t
  if (isSpace(key)) return hardDrop(t)
  const dir = directionOf(key)
  if (dir === 'left' || dir === 'right') {
    const p = moved(t, dir === 'left' ? -1 : 1, 0)
    return p === null ? t : { ...t, piece: p }
  }
  if (dir === 'up') return turn(t)
  if (dir === 'down') {
    const p = moved(t, 0, 1)
    return p === null ? lock(t) : { ...t, piece: p, score: t.score + SOFT_DROP_POINTS, fallMs: 0 }
  }
  return t
}

/** Gravity: the piece falls a row each interval, faster at each level. */
export const tickTetris = (t: Tetris, ms: number): Tetris => {
  let state = { ...t, fallMs: t.fallMs + ms }
  while (!state.isOver && state.fallMs >= fallInterval(state.level)) {
    const rest = state.fallMs - fallInterval(state.level)
    state = { ...fall(state), fallMs: rest }
  }
  return state
}

const block = (kind: Kind | null): Span => (kind === null ? { text: ' ·', fg: '#3f3f46' } : { text: '  ', bg: COLORS[kind] })

/** The next piece's rows for the preview: its shape, two columns per cell. */
const preview = (kind: Kind): Row[] => {
  const rows = SHAPES[kind].filter(line => line.includes('X'))
  return rows.map(line => [...line].map((c): Span => (c === 'X' ? { text: '  ', bg: COLORS[kind] } : { text: '  ' })))
}

export const drawTetris = (t: Tetris): Row[] => {
  const blocks = t.isOver ? [] : blocksOf(t.piece)
  const side: Row[] = [[{ text: 'Prossimo', bold: true }], [], ...preview(t.next)]
  const edge = (l: string, r: string): Span => ({ text: `${l}${'─'.repeat(t.width * 2)}${r}`, fg: FRAME })
  const rows = t.board.map((row, y) => {
    const cells = row.map((cell, x) => block(blocks.some(b => b.x === x && b.y === y) ? t.piece.kind : cell))
    return pack([{ text: '│', fg: FRAME }, ...cells, { text: '│', fg: FRAME }, { text: '  ' }, ...(side[y] ?? [])])
  })
  return [[edge('┌', '┐')], ...rows, [edge('└', '┘')]]
}

export const TETRIS: GameDef<Tetris> = {
  id: 'tetris',
  name: 'Tetris',
  keys: '←→ muovi · ↑ ruota · ↓ scendi · spazio fa cadere',
  create: ctx => newTetris(WIDTH, Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, ctx.rows - FRAME_ROWS)), ctx.rng),
  key: keyTetris,
  tick: tickTetris,
  isOver: t => t.isOver,
  score: t => t.score,
  draw: drawTetris,
  status: t => `livello ${t.level} · righe ${t.lines}`,
}
