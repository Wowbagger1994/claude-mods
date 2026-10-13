import { directionOf, isSpace } from './keys'
import type { Rng } from './rng'
import { nextInt } from './rng'
import { centerPad, framed, meter, pack, PALETTE } from './style'
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
  /** Columns of the room, to center the drawing; 0 draws it at the left. */
  columns: number
  /** Rows just cleared, lit for a moment: the board as it was with them, and which they were. */
  flash: { board: Board; rows: number[]; ms: number } | null
  /** A hard drop's streak: the cells the piece fell through, for a moment. */
  trail: { kind: Kind; cells: Point[]; ms: number } | null
  /** The last clear's points and name, cut into the well's bottom edge for a while. */
  banner: { text: string; ms: number } | null
}

export const WIDTH = 10
const MAX_HEIGHT = 20
const MIN_HEIGHT = 14
/** Rows of the board's room the frame takes. */
const FRAME_ROWS = 2
const KINDS: readonly Kind[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L']
/** Points for 1, 2, 3 and 4 rows cleared at once, times the level. */
export const LINE_POINTS = [0, 100, 300, 500, 800]
export const LINES_PER_LEVEL = 10
const SOFT_DROP_POINTS = 1
const HARD_DROP_POINTS = 2
/** Milliseconds per row at level 1, less at each level, never below the floor. */
const BASE_FALL_MS = 800
const FALL_STEP_MS = 70
const MIN_FALL_MS = 80
/** How long cleared rows stay lit, a hard drop's streak lasts, a clear's points show. */
export const FLASH_MS = 240
export const TRAIL_MS = 160
export const BANNER_MS = 1600
/** A clear of 1, 2, 3 and 4 rows, by name. */
const CLEAR_NAMES = ['', 'singola', 'doppia', 'tripla', 'TETRIS!']
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
/** Each kind's lit top edge, the bevel over its colour. */
export const LIGHTS: Record<Kind, string> = {
  I: '#a5f3fc',
  O: '#fef08a',
  T: '#d8b4fe',
  S: '#86efac',
  Z: '#fca5a5',
  J: '#93c5fd',
  L: '#fdba74',
}

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

export const newTetris = (width: number, height: number, rng: Rng, columns = 0): Tetris => {
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
    columns,
    flash: null,
    trail: null,
    banner: null,
  }
}

export const fallInterval = (level: number): number => Math.max(MIN_FALL_MS, BASE_FALL_MS - (level - 1) * FALL_STEP_MS)

/** The piece fixed into the board, full rows cleared and scored, the next piece in play (or the end). */
export const lock = (t: Tetris): Tetris => {
  const blocks = blocksOf(t.piece)
  const merged = t.board.map((row, y) => row.map((cell, x) => (blocks.some(b => b.x === x && b.y === y) ? t.piece.kind : cell)))
  const kept = merged.filter(row => row.some(cell => cell === null))
  const full = merged.flatMap((row, y) => (row.every(cell => cell !== null) ? [y] : []))
  const cleared = full.length
  const board = [...emptyBoard(t.width, cleared), ...kept]
  const lines = t.lines + cleared
  const points = (LINE_POINTS[cleared] ?? 0) * t.level
  const score = t.score + points
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
    flash: cleared > 0 ? { board: merged, rows: full, ms: FLASH_MS } : null,
    banner: cleared > 0 ? { text: `+${points} ${CLEAR_NAMES[cleared]}`, ms: BANNER_MS } : t.banner,
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

/** Where the piece would come to rest, dropped straight down. */
const landing = (board: Board, piece: Piece): Piece => {
  let p = piece
  while (fits(board, { ...p, y: p.y + 1 })) p = { ...p, y: p.y + 1 }
  return p
}

const hardDrop = (t: Tetris): Tetris => {
  const piece = landing(t.board, t.piece)
  const rows = piece.y - t.piece.y
  const cells = blocksOf(t.piece).flatMap(b => Array.from({ length: rows }, (_, dy) => ({ x: b.x, y: b.y + dy })))
  const trail = rows > 0 ? { kind: t.piece.kind, cells, ms: TRAIL_MS } : t.trail
  return lock({ ...t, piece, score: t.score + rows * HARD_DROP_POINTS, trail })
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

/** An effect `ms` older, gone once its time is up. */
const aged = <E extends { ms: number }>(effect: E | null, ms: number): E | null =>
  effect === null || effect.ms <= ms ? null : { ...effect, ms: effect.ms - ms }

/** Gravity: the piece falls a row each interval, faster at each level. */
export const tickTetris = (t: Tetris, ms: number): Tetris => {
  let state = { ...t, fallMs: t.fallMs + ms, flash: aged(t.flash, ms), trail: aged(t.trail, ms), banner: aged(t.banner, ms) }
  while (!state.isOver && state.fallMs >= fallInterval(state.level)) {
    const rest = state.fallMs - fallInterval(state.level)
    state = { ...fall(state), fallMs: rest }
  }
  return state
}

/** A block, two columns: its colour under a lit top edge, like a bevel. */
const BLOCK = '▆▆'
/** Where the piece will land, its shadow. */
const GHOST = '░░'
/** A hard drop's streak, a thin line down the middle of each column. */
const STREAK = '▕▏'
/** The blocks of a lost game, greyed. */
const DEAD = { fg: '#52525b', bg: '#71717a' }
/** The jammed piece of a lost game: white crosses on red, unlike any block. */
export const JAMMED: Span = { text: '╳╳', fg: PALETTE.white, bg: PALETTE.danger, bold: true }
const EMPTY: Span = { text: ' ·', fg: PALETTE.faint }
const CLEARED: Span = { text: '██', fg: PALETTE.white, bold: true }
/** Inside of the side boxes; the blank between the well and them. */
const PANEL_INNER = 13
const GAP = 2
/** Free rows over the stack below which the well turns amber, then red: a share of its height. */
const HURRY_SHARE = 1 / 3
const DANGER_SHARE = 1 / 6

const blockOf = (kind: Kind): Span => ({ text: BLOCK, fg: COLORS[kind], bg: LIGHTS[kind] })

/** What the well shows at this moment: the board, the lit rows, the piece and its shadow, a streak. */
type View = { board: Board; lit: number[]; piece: Point[]; pieceSpan: Span; ghost: Point[]; trail: Point[] }

const has = (points: readonly Point[], x: number, y: number) => points.some(p => p.x === x && p.y === y)

const viewOf = (t: Tetris): View => {
  if (t.isOver) return { board: t.board, lit: [], piece: blocksOf(t.piece), pieceSpan: JAMMED, ghost: [], trail: [] }
  const trail = t.trail?.cells ?? []
  if (t.flash !== null) return { board: t.flash.board, lit: t.flash.rows, piece: [], pieceSpan: EMPTY, ghost: [], trail }
  const ghost = blocksOf(landing(t.board, t.piece))
  return { board: t.board, lit: [], piece: blocksOf(t.piece), pieceSpan: blockOf(t.piece.kind), ghost, trail }
}

const cellOf = (t: Tetris, v: View, x: number, y: number): Span => {
  if (v.lit.includes(y)) return CLEARED
  if (has(v.piece, x, y)) return v.pieceSpan
  const kind = v.board[y]?.[x] ?? null
  if (kind !== null) return t.isOver ? { text: BLOCK, ...DEAD } : blockOf(kind)
  if (has(v.ghost, x, y)) return { text: GHOST, fg: COLORS[t.piece.kind] }
  if (has(v.trail, x, y)) return { text: STREAK, fg: LIGHTS[t.trail!.kind] }
  return EMPTY
}

/** Rows free over the highest block. */
const freeRows = (board: Board): number => {
  const top = board.findIndex(row => row.some(cell => cell !== null))
  return top === -1 ? board.length : top
}

/** The well's frame: red when lost, green as rows clear, amber then red as the stack nears the top. */
const wellColor = (t: Tetris): string => {
  if (t.isOver) return PALETTE.danger
  if (t.flash !== null) return PALETTE.good
  const free = freeRows(t.board)
  return free <= t.height * DANGER_SHARE ? PALETTE.danger : free <= t.height * HURRY_SHARE ? PALETTE.hurry : PALETTE.frame
}

/** The bottom edge: a clear's points while they show, the end, or a plain line. */
const wellFooter = (t: Tetris): Span[] => {
  if (t.isOver) return [{ text: ' pozzo pieno ', fg: PALETTE.danger, bold: true }]
  return t.banner === null ? [] : [{ text: ` ${t.banner.text} `, fg: PALETTE.good, bold: true }]
}

const wellRows = (t: Tetris): Row[] => {
  const v = viewOf(t)
  const rows = v.board.map((row, y) => row.map((_, x) => cellOf(t, v, x, y)))
  return framed(rows, t.width * 2, { color: wellColor(t), footer: wellFooter(t) })
}

/** The next piece in a box, centered, its blocks as in the well. */
const nextBox = (kind: Kind): Row[] => {
  const shape = SHAPES[kind].filter(line => line.includes('X')).map(line => line.replace(/\.+$/, ''))
  const wide = Math.max(...shape.map(line => line.length)) * 2
  const rows = shape.map(line => [centerPad(PANEL_INNER, wide), ...[...line].map((c): Span => (c === 'X' ? blockOf(kind) : { text: '  ' }))])
  return framed([[], ...rows, ...(rows.length < 2 ? [[]] : []), []], PANEL_INNER, { title: 'Prossimo' })
}

/** The level in a box: rows cleared, and a meter of the way to the next level. */
const levelBox = (t: Tetris): Row[] => {
  const share = (t.lines % LINES_PER_LEVEL) / LINES_PER_LEVEL
  return framed(
    [
      [{ text: ' righe ', fg: PALETTE.label }, { text: String(t.lines), fg: PALETTE.white, bold: true }],
      [{ text: ' ' }, ...meter(share, PANEL_INNER - 3, PALETTE.sky)],
    ],
    PANEL_INNER,
    { title: `livello ${t.level}` },
  )
}

/** The well, and beside it the next piece and the level when there is room, centered in the columns. */
export const drawTetris = (t: Tetris): Row[] => {
  const well = wellRows(t)
  const wellWidth = t.width * 2 + 2
  const fullWidth = wellWidth + GAP + PANEL_INNER + 2
  const hasPanel = t.columns === 0 || t.columns >= fullWidth
  const panel = hasPanel ? [...nextBox(t.next), [], ...levelBox(t)] : []
  const pad = centerPad(t.columns, hasPanel ? fullWidth : wellWidth)
  return well.map((row, i) => pack([pad, ...row, ...(panel[i] === undefined ? [] : [{ text: ' '.repeat(GAP) }, ...panel[i]!])]))
}

export const TETRIS: GameDef<Tetris> = {
  id: 'tetris',
  name: 'Tetris',
  keys: '←→ muovi · ↑ ruota · ↓ scendi · spazio fa cadere',
  create: ctx => newTetris(WIDTH, Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, ctx.rows - FRAME_ROWS)), ctx.rng, ctx.columns),
  key: keyTetris,
  tick: tickTetris,
  isOver: t => t.isOver,
  score: t => t.score,
  draw: drawTetris,
  status: t => `livello ${t.level} · righe ${t.lines}`,
}
