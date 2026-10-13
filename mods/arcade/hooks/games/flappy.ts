import { FEET_APART, FEET_TOGETHER, MASCOT, MASCOT_BODY } from '../draw'
import { directionOf, isSpace } from './keys'
import type { Rng } from './rng'
import { nextInt } from './rng'
import { centerPad, framed, pack, PALETTE } from './style'
import type { GameDef, Row, Span } from './types'

/** A pipe: its left column (fractional while it scrolls) and the first row of its gap. */
export type Pipe = { x: number; gapTop: number; isPassed: boolean }

export type Flappy = {
  /** Columns of sky, inside the frame. */
  width: number
  /** Rows of sky, inside the frame; its bottom edge is the ground. */
  height: number
  /** Columns of room, to center the frame. */
  columns: number
  /** The mascot's top row, fractional; 0 is the top of the sky. */
  y: number
  /** Rows per second, down positive. */
  vy: number
  pipes: Pipe[]
  /** Columns before the next pipe enters at the right edge. */
  nextIn: number
  /** False until the first flap: the mascot hovers and nothing scrolls. */
  isFlying: boolean
  /** Columns flown, for the wing beat and the scrolling sky. */
  distance: number
  /** Milliseconds the wings stay up after a flap. */
  flapFor: number
  /** Milliseconds the `+1` of the last pipe passed still shows. */
  cheerFor: number
  score: number
  isOver: boolean
  rng: Rng
}

/** The mascot's left column and size in cells, as drawn. */
export const BIRD_X = 6
export const BIRD_WIDTH = 9
export const BIRD_HEIGHT = 3
/** What a pipe must touch to end the flight: the solid body, a little inside the drawing. */
export const HITBOX = { left: BIRD_X + 2, width: 5, top: 0.4, bottom: 2.6 }

/** Rows per second², down. */
export const GRAVITY = 45
/** A flap's upward speed: it rises about 2 rows (v² / 2g). */
export const FLAP_SPEED = 14
/** Columns per second the pipes scroll. */
export const SPEED = 14
export const PIPE_WIDTH = 4
/** Rows of the gap: the 3-row mascot with room to spare. */
export const GAP = 8
/** Columns from one pipe to the next. */
export const PIPE_SPACING = 28
/** How far a gap may move from the last one, so it can always be reached in time. */
export const MAX_GAP_SHIFT = 5
/** How long the wings stay up after a flap, and the `+1` shows after a pipe. */
export const WING_MS = 180
export const CHEER_MS = 600
/** The least sky: a gap with a row above and below it. */
const MIN_HEIGHT = GAP + 2
const MAX_HEIGHT = 24
/** Columns of the whole board, frame included. */
const MIN_WIDTH = 40
const MAX_WIDTH = 100
/** Rows and columns the frame takes around the sky. */
const FRAME_CELLS = 2

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

export const newFlappy = (columns: number, rows: number, rng: Rng): Flappy => {
  const height = clamp(rows - FRAME_CELLS, MIN_HEIGHT, MAX_HEIGHT)
  return {
    width: clamp(columns, MIN_WIDTH, MAX_WIDTH) - FRAME_CELLS,
    height,
    columns,
    y: Math.floor((height - BIRD_HEIGHT) / 2),
    vy: 0,
    pipes: [],
    nextIn: 0,
    isFlying: false,
    distance: 0,
    flapFor: 0,
    cheerFor: 0,
    score: 0,
    isOver: false,
    rng,
  }
}

/** A flap: up at FLAP_SPEED, whatever the fall; the first one starts the flight. */
export const flap = (f: Flappy): Flappy => (f.isOver ? f : { ...f, vy: -FLAP_SPEED, isFlying: true, flapFor: WING_MS })

/** The row a new gap starts on: random, within reach of the last one, never touching the edges. */
const nextGapTop = (f: Flappy): [number, Rng] => {
  const highest = 1
  const lowest = f.height - GAP - 1
  const last = f.pipes[f.pipes.length - 1]?.gapTop ?? Math.floor((f.height - GAP) / 2)
  const low = Math.max(highest, last - MAX_GAP_SHIFT)
  const high = Math.min(lowest, last + MAX_GAP_SHIFT)
  const [offset, rng] = nextInt(f.rng, high - low + 1)
  return [low + offset, rng]
}

const hitsPipe = (f: Flappy, p: Pipe): boolean => {
  const isAcross = p.x < HITBOX.left + HITBOX.width && p.x + PIPE_WIDTH > HITBOX.left
  const isOutsideGap = f.y + HITBOX.top < p.gapTop || f.y + HITBOX.bottom > p.gapTop + GAP
  return isAcross && isOutsideGap
}

/** `ms` of flight: gravity, scrolling pipes, a point for each pipe left behind; a pipe or the ground ends it. */
export const tickFlappy = (f: Flappy, ms: number): Flappy => {
  if (f.isOver || !f.isFlying) return f
  const dt = ms / 1000
  const vy = f.vy + GRAVITY * dt
  // The mean of the speeds at both ends: the exact parabola. The top of the sky is a ceiling.
  const y = Math.max(0, f.y + ((f.vy + vy) / 2) * dt)
  const moved = SPEED * dt
  const scrolled = f.pipes.map(p => ({ ...p, x: p.x - moved })).filter(p => p.x + PIPE_WIDTH > 0)
  const passed = scrolled.filter(p => !p.isPassed && p.x + PIPE_WIDTH <= HITBOX.left).length
  const pipes = scrolled.map(p => (p.x + PIPE_WIDTH <= HITBOX.left ? { ...p, isPassed: true } : p))

  const base: Flappy = {
    ...f,
    y,
    vy,
    pipes,
    nextIn: f.nextIn - moved,
    distance: f.distance + moved,
    score: f.score + passed,
    flapFor: Math.max(0, f.flapFor - ms),
    cheerFor: passed > 0 ? CHEER_MS : Math.max(0, f.cheerFor - ms),
  }
  const withPipe = base.nextIn > 0 ? base : addPipe(base)
  const isDown = withPipe.y + BIRD_HEIGHT > withPipe.height
  return isDown || withPipe.pipes.some(p => hitsPipe(withPipe, p)) ? { ...withPipe, isOver: true } : withPipe
}

const addPipe = (f: Flappy): Flappy => {
  const [gapTop, rng] = nextGapTop(f)
  return { ...f, pipes: [...f.pipes, { x: f.width + f.nextIn, gapTop, isPassed: false }], nextIn: f.nextIn + PIPE_SPACING, rng }
}

// ── Drawing ─────────────────────────────────────────────────────────────────

/** A pipe's columns, lit side to shaded side: its body, then the wider-looking cap at the gap. */
const PIPE_BODY: readonly Span[] = [
  { text: '▐', fg: '#4ade80' },
  { text: '█', fg: PALETTE.good },
  { text: '█', fg: '#16a34a' },
  { text: '▌', fg: '#15803d' },
]
const PIPE_CAP: readonly Span[] = [
  { text: '█', fg: '#86efac' },
  { text: '█', fg: '#4ade80' },
  { text: '█', fg: PALETTE.good },
  { text: '█', fg: '#15803d' },
]
const GROUND = '#a8a29e'
const STAR = '#52525b'
/** How fast each layer of the far sky drifts, as a share of the pipes' speed. */
const STAR_DRIFT = 0.1
const SKYLINE_DRIFT = 0.25
const CLOUD_DRIFT = 0.45
/** One star in about this many cells; the skyline's buildings, BLOCK columns wide and up to MAX_TOWER rows tall. */
const STAR_ODDS = 60
const BLOCK = 3
const MAX_TOWER = 3
/** A building is at most one row tall for each this many rows of sky. */
const TOWER_SHARE = 6
const CLOUD_PERIOD = 26
const CLOUD = [' ▄██▄  ', '▀▀▀▀▀▀▀']
/** Columns flown between two beats of the feet; ground ties every TIE columns. */
const STRIDE = 2
const TIE = 6
/** Falling faster than this, in rows per second, the wings trail down. */
const DIVE_SPEED = 8

/** The mascot's middle row with the wings up after a flap, level, or trailing in a dive. */
const WINGS_UP = '▐▜█████▛▌'
const WINGS_DOWN = '▗▜█████▛▖'
const DEAD_FACE = ' ▐╳███╳▌ '

/** A fixed scramble of a number, for stars and buildings that stay put as they scroll. */
const hash = (n: number): number => {
  const a = Math.imul(n ^ (n >>> 16), 0x85ebca6b)
  const b = Math.imul(a ^ (a >>> 13), 0xc2b2ae35)
  return (b ^ (b >>> 16)) >>> 0
}

/** The mascot, row by row: wings by the last flap and the fall, feet beating, eyes crossed after a crash. */
const birdRows = (f: Flappy): string[] => {
  const isBeat = f.isFlying && !f.isOver && Math.floor(f.distance / STRIDE) % 2 === 1
  const wings = f.flapFor > 0 ? WINGS_UP : f.vy > DIVE_SPEED && !f.isOver ? WINGS_DOWN : MASCOT_BODY[1]!
  return [f.isOver ? DEAD_FACE : MASCOT_BODY[0]!, wings, isBeat ? FEET_APART : FEET_TOGETHER]
}

const pipeCell = (f: Flappy, x: number, row: number): Span | null => {
  const pipe = f.pipes.find(p => x >= Math.round(p.x) && x < Math.round(p.x) + PIPE_WIDTH)
  if (pipe === undefined || (row >= pipe.gapTop && row < pipe.gapTop + GAP)) return null
  const isCap = row === pipe.gapTop - 1 || row === pipe.gapTop + GAP
  return (isCap ? PIPE_CAP : PIPE_BODY)[x - Math.round(pipe.x)]!
}

/** The far sky, slowest first to nearest: a skyline in the last rows, stars, clouds in the upper half. */
const farCell = (f: Flappy, x: number, row: number): Span | null => {
  const block = Math.floor((x + f.distance * SKYLINE_DRIFT) / BLOCK)
  const tall = hash(block) % (clamp(Math.floor(f.height / TOWER_SHARE), 1, MAX_TOWER) + 1)
  if (row >= f.height - tall) return { text: row === f.height - tall ? '▄' : '█', fg: PALETTE.faint }
  const cloudX = Math.floor(x + f.distance * CLOUD_DRIFT)
  const cloud = Math.floor(cloudX / CLOUD_PERIOD)
  const cloudRow = 1 + (hash(cloud + 7) % Math.max(1, Math.floor(f.height / 2) - 2))
  const glyph = hash(cloud) % 3 === 0 ? undefined : CLOUD[row - cloudRow]?.[cloudX % CLOUD_PERIOD]
  if (glyph !== undefined && glyph !== ' ') return { text: glyph, fg: PALETTE.frame }
  const starX = Math.floor(x + f.distance * STAR_DRIFT)
  const star = hash(starX * 131 + row * 7919)
  if (star % STAR_ODDS !== 0) return null
  return (star >>> 20) % 4 === 0 ? { text: '✦', fg: PALETTE.label } : { text: '·', fg: STAR }
}

/** The `+1` floating up from the mascot's head while a passed pipe is cheered. */
const cheerCell = (f: Flappy, x: number, row: number): Span | null => {
  if (f.cheerFor <= 0) return null
  const rise = Math.floor((1 - f.cheerFor / CHEER_MS) * 2)
  const at = Math.round(f.y) - 1 - rise
  const glyph = '+1'[x - (BIRD_X + 3)]
  return row === at && glyph !== undefined ? { text: glyph, fg: PALETTE.good, bold: true } : null
}

/** Sparks around a crash. */
const crashCell = (f: Flappy, x: number, row: number): Span | null => {
  if (!f.isOver) return null
  const top = Math.round(f.y)
  const sparks: Record<string, string> = { [`${BIRD_X - 1},${top}`]: '✸', [`${BIRD_X + BIRD_WIDTH},${top + 1}`]: '✸', [`${BIRD_X + BIRD_WIDTH - 1},${top - 1}`]: '·', [`${BIRD_X},${top + 3}`]: '·' }
  const spark = sparks[`${x},${row}`]
  return spark === undefined ? null : { text: spark, fg: spark === '✸' ? PALETTE.hurry : PALETTE.danger, bold: true }
}

const skyCell = (f: Flappy, sprite: readonly string[], x: number, row: number): Span => {
  const glyph = sprite[row - Math.round(f.y)]?.[x - BIRD_X]
  if (glyph !== undefined && glyph !== ' ') return { text: glyph, fg: f.isOver ? PALETTE.danger : MASCOT, bold: f.isOver && glyph === '╳' }
  const near = crashCell(f, x, row) ?? cheerCell(f, x, row) ?? pipeCell(f, x, row)
  // The far sky stays behind the mascot: nothing of it shows between its feet.
  return near ?? (glyph === undefined ? farCell(f, x, row) : null) ?? { text: ' ' }
}

/** The bottom edge: the ground scrolling at the pipes' speed, the `+1` cut in under the mascot. */
const groundOf = (f: Flappy): Span[] => {
  const ground = (from: number, to: number): Span[] =>
    Array.from({ length: Math.max(0, to - from) }, (_, i) => ({ text: Math.floor(from + i + f.distance) % TIE === 0 ? '┴' : '─', fg: GROUND }))
  if (f.cheerFor <= 0) return ground(0, f.width - 1)
  const label = ' +1 '
  return [...ground(0, BIRD_X + 1), { text: label, fg: PALETTE.good, bold: true }, ...ground(BIRD_X + 1 + label.length, f.width - 1)]
}

const frameColor = (f: Flappy): string => (f.isOver ? PALETTE.danger : f.cheerFor > 0 ? PALETTE.good : PALETTE.frame)

/** The sky in a rounded frame: the key cut into its top edge, lit on a flap; the ground in its bottom edge. */
export const drawFlappy = (f: Flappy): Row[] => {
  const sprite = birdRows(f)
  const sky = Array.from({ length: f.height }, (_, row) => pack(Array.from({ length: f.width }, (_, x) => skyCell(f, sprite, x, row))))
  const title = f.isOver ? 'schianto!' : 'spazio'
  const titleColor = f.isOver ? PALETTE.danger : f.flapFor > 0 ? PALETTE.sky : PALETTE.label
  const board = framed(sky, f.width, { title, color: frameColor(f), titleColor, footer: groundOf(f) })
  const pad = centerPad(f.columns, f.width + FRAME_CELLS)
  return pad.text === '' ? board : board.map(r => pack([pad, ...r]))
}

export const FLAPPY: GameDef<Flappy> = {
  id: 'flappy',
  name: 'Flappy Claude',
  keys: 'spazio o ↑ per volare',
  create: ctx => newFlappy(ctx.columns, ctx.rows, ctx.rng),
  key: (f, key) => (isSpace(key) || directionOf(key) === 'up' ? flap(f) : f),
  tick: tickFlappy,
  isOver: f => f.isOver,
  score: f => f.score,
  draw: drawFlappy,
  status: f => (f.isFlying ? '' : 'spazio per partire'),
}
