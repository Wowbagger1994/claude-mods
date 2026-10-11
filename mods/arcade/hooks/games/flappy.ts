import { FEET_APART, FEET_TOGETHER, MASCOT, MASCOT_BODY, pack } from '../draw'
import { directionOf, isSpace } from './keys'
import type { Rng } from './rng'
import { nextInt } from './rng'
import type { GameDef, Row, Span } from './types'

/** A pipe: its left column (fractional while it scrolls) and the first row of its gap. */
export type Pipe = { x: number; gapTop: number; isPassed: boolean }

export type Flappy = {
  width: number
  /** Rows of sky; the ground is drawn below them. */
  height: number
  /** The mascot's top row, fractional; 0 is the top of the sky. */
  y: number
  /** Rows per second, down positive. */
  vy: number
  pipes: Pipe[]
  /** Columns before the next pipe enters at the right edge. */
  nextIn: number
  /** False until the first flap: the mascot hovers and nothing scrolls. */
  isFlying: boolean
  /** Columns flown, for the wing beat. */
  distance: number
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
const MIN_HEIGHT = 14
const MAX_HEIGHT = 24
const MIN_WIDTH = 40
const MAX_WIDTH = 100
/** Rows the score line and help take below the sky: the ground. */
const GROUND_ROWS = 1

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

export const newFlappy = (columns: number, rows: number, rng: Rng): Flappy => {
  const height = clamp(rows - GROUND_ROWS, MIN_HEIGHT, MAX_HEIGHT)
  return {
    width: clamp(columns, MIN_WIDTH, MAX_WIDTH),
    height,
    y: Math.floor((height - BIRD_HEIGHT) / 2),
    vy: 0,
    pipes: [],
    nextIn: 0,
    isFlying: false,
    distance: 0,
    score: 0,
    isOver: false,
    rng,
  }
}

/** A flap: up at FLAP_SPEED, whatever the fall; the first one starts the flight. */
export const flap = (f: Flappy): Flappy => (f.isOver ? f : { ...f, vy: -FLAP_SPEED, isFlying: true })

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

  const base: Flappy = { ...f, y, vy, pipes, nextIn: f.nextIn - moved, distance: f.distance + moved, score: f.score + passed }
  const withPipe = base.nextIn > 0 ? base : addPipe(base)
  const isDown = withPipe.y + BIRD_HEIGHT > withPipe.height
  return isDown || withPipe.pipes.some(p => hitsPipe(withPipe, p)) ? { ...withPipe, isOver: true } : withPipe
}

const addPipe = (f: Flappy): Flappy => {
  const [gapTop, rng] = nextGapTop(f)
  return { ...f, pipes: [...f.pipes, { x: f.width + f.nextIn, gapTop, isPassed: false }], nextIn: f.nextIn + PIPE_SPACING, rng }
}

const PIPE_COLOR = '#22c55e'
const PIPE_EDGE = '#15803d'
const GROUND = '#a8a29e'
const CRASH = '#ef4444'
/** Columns flown between two beats of the feet. */
const STRIDE = 2

const birdRows = (f: Flappy): string[] => {
  const isBeat = f.isFlying && !f.isOver && Math.floor(f.distance / STRIDE) % 2 === 1
  return [...MASCOT_BODY, isBeat ? FEET_APART : FEET_TOGETHER]
}

/** The sky with the pipes and the mascot, then the ground. */
export const drawFlappy = (f: Flappy): Row[] => {
  const top = Math.round(f.y)
  const sprite = birdRows(f)
  const cell = (x: number, row: number): Span => {
    const glyph = sprite[row - top]?.[x - BIRD_X]
    if (glyph !== undefined && glyph !== ' ') return { text: glyph, fg: f.isOver ? CRASH : MASCOT }
    const pipe = f.pipes.find(p => x >= Math.round(p.x) && x < Math.round(p.x) + PIPE_WIDTH)
    if (pipe === undefined || (row >= pipe.gapTop && row < pipe.gapTop + GAP)) return { text: ' ' }
    // The pipe's lip, just above and below the gap.
    const isLip = row === pipe.gapTop - 1 || row === pipe.gapTop + GAP
    return { text: '█', fg: isLip ? PIPE_EDGE : PIPE_COLOR }
  }
  const sky = Array.from({ length: f.height }, (_, row) => pack(Array.from({ length: f.width }, (_, x) => cell(x, row))))
  return [...sky, [{ text: '▔'.repeat(f.width), fg: GROUND }]]
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
