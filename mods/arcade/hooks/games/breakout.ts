import { directionOf, isSpace } from './keys'
import type { Rng } from './rng'
import { nextRandom } from './rng'
import { centerPad, framed, pack, PALETTE } from './style'
import type { GameDef, Row, Span } from './types'

/**
 * Breakout on a field of half-block pixels: each text row holds two pixel
 * rows, each column one pixel, so the ball moves half a row at a time and the
 * pixels come out about square.
 */

/** The ball: where it is in pixels (fractional) and its speed in pixels per second, down positive. */
export type Ball = { x: number; y: number; vx: number; vy: number }

/** Waiting on the paddle for a launch, in flight, a moment for a lost ball, a moment for a cleared wall. */
export type Phase = 'serve' | 'play' | 'lost' | 'cleared'

export type BonusKind = 'wide' | 'slow' | 'life'

/** A bonus falling from a broken brick: its middle column and its pixel row. */
export type Drop = { kind: BonusKind; x: number; y: number }

/** A brick just broken, lit for a moment where it was. */
export type Shatter = { row: number; col: number; ms: number }

/** Text floating up for a moment: the points of a brick, the name of a bonus caught. */
export type Popup = { x: number; row: number; text: string; color: string; ms: number }

export type Breakout = {
  /** Columns and text rows of the field, inside the frame. */
  width: number
  height: number
  /** Columns of room, to center the frame. */
  columns: number
  /** The wall: true where a brick stands, top row first. */
  bricks: boolean[][]
  brickWidth: number
  /** The wall's first column, to center it in the field. */
  brickLeft: number
  /** The paddle's first column. */
  paddleX: number
  ball: Ball
  phase: Phase
  /** Milliseconds left of a `lost` or `cleared` moment. */
  phaseMs: number
  lives: number
  score: number
  level: number
  /** Milliseconds left of a wide paddle and of a slow ball. */
  wideMs: number
  slowMs: number
  drops: Drop[]
  shatters: Shatter[]
  popups: Popup[]
  /** The column the last lost ball fell through. */
  lostX: number
  isOver: boolean
  rng: Rng
}

export const LIVES = 3
/** Points of the wall's lowest row; each row up is worth this much more. */
export const ROW_POINTS = 10
/** The wall's first text row: one free row above it to bounce in. */
export const BRICK_TOP = 1
const MIN_BRICK_ROWS = 3
const MAX_BRICK_ROWS = 6
/** One row of bricks for each this many rows of field. */
const ROWS_PER_BRICK_ROW = 3
/** Bricks are this wide, wider in a wide field. */
const BRICK_WIDTH = 5
const WIDE_BRICK_WIDTH = 6
const WIDE_FIELD = 48
export const PADDLE_WIDTH = 7
export const WIDE_PADDLE_WIDTH = 11
/** Columns the paddle moves for a key. */
export const PADDLE_STEP = 3
/** Ball speed in pixels per second at level 1, more at each level, never over the cap. */
export const BASE_SPEED = 24
const LEVEL_SPEEDUP = 0.12
const MAX_SPEED = 44
/** A slow ball moves at this share of its speed. */
export const SLOW_FACTOR = 0.6
/** The steepest bounce off the paddle's ends, from straight up; a launch's range. */
const MAX_BOUNCE = (60 * Math.PI) / 180
const MIN_LAUNCH = (15 * Math.PI) / 180
const MAX_LAUNCH = (35 * Math.PI) / 180
/** The ball never moves more than this many pixels in one step, so it cannot jump a brick. */
const MAX_STEP = 0.5
/** The share of broken bricks that drop a bonus; the share of bonuses that are a life (the rest, half wide, half slow). */
export const DROP_CHANCE = 0.2
const LIFE_SHARE = 0.2
/** Pixels per second a bonus falls. */
export const DROP_SPEED = 9
export const WIDE_MS = 12_000
export const SLOW_MS = 10_000
export const MAX_LIVES = 5
/** How long a lost ball and a cleared wall hold the game; a broken brick stays lit; a popup floats. */
export const LOST_MS = 1_200
export const CLEARED_MS = 1_500
export const SHATTER_MS = 240
export const POPUP_MS = 700
const MIN_WIDTH = 28
const MAX_WIDTH = 58
const MIN_HEIGHT = 10
const MAX_HEIGHT = 22
/** Rows and columns the frame takes around the field. */
const FRAME_CELLS = 2
/** A hair under a whole pixel, to keep a reflected ball inside the field. */
const EPSILON = 1e-6

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

// ── The field ──────────────────────────────────────────────────────────────

export const paddleWidth = (g: Breakout): number => (g.wideMs > 0 ? WIDE_PADDLE_WIDTH : PADDLE_WIDTH)
/** The pixel row of the paddle's top: it fills the field's last text row. */
export const paddleRow = (g: Breakout): number => g.height * 2 - 2
export const speedAt = (level: number): number => Math.min(MAX_SPEED, BASE_SPEED * (1 + LEVEL_SPEEDUP * (level - 1)))
export const bricksLeft = (g: Breakout): number => g.bricks.reduce((n, row) => n + row.filter(Boolean).length, 0)
const brickRowsFor = (height: number) => clamp(Math.floor(height / ROWS_PER_BRICK_ROW), MIN_BRICK_ROWS, MAX_BRICK_ROWS)
/** Points of a brick in `row`, the top row worth the most. */
export const pointsOf = (g: Breakout, row: number): number => (g.bricks.length - row) * ROW_POINTS

const fullWall = (rows: number, cols: number): boolean[][] => Array.from({ length: rows }, () => Array<boolean>(cols).fill(true))

/** The ball resting on the paddle's middle, ready to launch. */
const restingBall = (g: Breakout): Ball => ({ x: g.paddleX + paddleWidth(g) / 2, y: paddleRow(g) - 0.5, vx: 0, vy: 0 })

export const newBreakout = (columns: number, rows: number, rng: Rng): Breakout => {
  const width = clamp(columns - FRAME_CELLS, MIN_WIDTH, MAX_WIDTH)
  const height = clamp(rows - FRAME_CELLS, MIN_HEIGHT, MAX_HEIGHT)
  const brickWidth = width >= WIDE_FIELD ? WIDE_BRICK_WIDTH : BRICK_WIDTH
  const cols = Math.floor(width / brickWidth)
  const base = {
    width,
    height,
    columns,
    bricks: fullWall(brickRowsFor(height), cols),
    brickWidth,
    brickLeft: Math.floor((width - cols * brickWidth) / 2),
    paddleX: Math.floor((width - PADDLE_WIDTH) / 2),
    ball: { x: 0, y: 0, vx: 0, vy: 0 },
    phase: 'serve' as const,
    phaseMs: 0,
    lives: LIVES,
    score: 0,
    level: 1,
    wideMs: 0,
    slowMs: 0,
    drops: [],
    shatters: [],
    popups: [],
    lostX: 0,
    isOver: false,
    rng,
  }
  return { ...base, ball: restingBall(base) }
}

/** The brick a pixel falls in, standing or not; null outside the wall. */
const brickCellOf = (g: Breakout, x: number, y: number): { row: number; col: number } | null => {
  const row = Math.floor(y / 2) - BRICK_TOP
  const col = Math.floor((x - g.brickLeft) / g.brickWidth)
  const isInside = row >= 0 && row < g.bricks.length && col >= 0 && col < (g.bricks[0]?.length ?? 0) && x >= g.brickLeft
  return isInside ? { row, col } : null
}

const standingAt = (g: Breakout, x: number, y: number) => {
  const cell = brickCellOf(g, x, y)
  return cell !== null && g.bricks[cell.row]?.[cell.col] === true ? cell : null
}

// ── Moves ──────────────────────────────────────────────────────────────────

/** The paddle `dx` columns over, inside the field; a ball at rest rides along. */
export const movePaddle = (g: Breakout, dx: number): Breakout => {
  const paddleX = clamp(g.paddleX + dx, 0, g.width - paddleWidth(g))
  const moved = { ...g, paddleX }
  return g.phase === 'serve' ? { ...moved, ball: restingBall(moved) } : moved
}

/** The ball off the paddle, up and a little to one side, picked at random. */
export const launch = (g: Breakout): Breakout => {
  if (g.phase !== 'serve') return g
  const [side, r1] = nextRandom(g.rng)
  const [tilt, r2] = nextRandom(r1)
  const angle = (MIN_LAUNCH + tilt * (MAX_LAUNCH - MIN_LAUNCH)) * (side < 0.5 ? -1 : 1)
  const speed = speedAt(g.level)
  return { ...g, phase: 'play', ball: { ...restingBall(g), vx: speed * Math.sin(angle), vy: -speed * Math.cos(angle) }, rng: r2 }
}

export const keyBreakout = (g: Breakout, key: string): Breakout => {
  if (g.isOver) return g
  const dir = directionOf(key)
  if (dir === 'left' || dir === 'right') return movePaddle(g, dir === 'left' ? -PADDLE_STEP : PADDLE_STEP)
  return isSpace(key) || dir === 'up' ? launch(g) : g
}

// ── Collisions ─────────────────────────────────────────────────────────────

/** A bonus, sometimes, out of a broken brick at column `x`, pixel row `y`. */
const maybeDrop = (g: Breakout, x: number, y: number): Breakout => {
  const [chance, r1] = nextRandom(g.rng)
  if (chance >= DROP_CHANCE) return { ...g, rng: r1 }
  const [pick, r2] = nextRandom(r1)
  const kind: BonusKind = pick < LIFE_SHARE ? 'life' : pick < (1 + LIFE_SHARE) / 2 ? 'wide' : 'slow'
  return { ...g, drops: [...g.drops, { kind, x, y }], rng: r2 }
}

/** The brick at `cell` broken: its points, a flash and a popup where it was, maybe a bonus, maybe the wall cleared. */
export const breakBrick = (g: Breakout, cell: { row: number; col: number }): Breakout => {
  const points = pointsOf(g, cell.row)
  const middle = g.brickLeft + cell.col * g.brickWidth + Math.floor(g.brickWidth / 2)
  const textRow = BRICK_TOP + cell.row
  const broken: Breakout = {
    ...g,
    bricks: g.bricks.map((row, r) => (r === cell.row ? row.map((b, c) => (c === cell.col ? false : b)) : row)),
    score: g.score + points,
    shatters: [...g.shatters, { ...cell, ms: SHATTER_MS }],
    popups: [...g.popups, { x: middle, row: textRow, text: `+${points}`, color: LIGHTS[cell.row % LIGHTS.length]!, ms: POPUP_MS }],
  }
  if (bricksLeft(broken) === 0) return { ...broken, phase: 'cleared', phaseMs: CLEARED_MS, drops: [] }
  return maybeDrop(broken, middle, textRow * 2 + 1)
}

/** The ball off the paddle: straight up from its middle, slanting more the nearer an end it lands. */
const bounceOffPaddle = (g: Breakout, ball: Ball): Ball => {
  const half = paddleWidth(g) / 2
  const offset = clamp((ball.x - (g.paddleX + half)) / half, -1, 1)
  const speed = Math.hypot(ball.vx, ball.vy)
  const angle = offset * MAX_BOUNCE
  const top = paddleRow(g)
  return { x: ball.x, y: top - (ball.y - top) - EPSILON, vx: speed * Math.sin(angle), vy: -speed * Math.cos(angle) }
}

/** A ball through the bottom: a life gone, and the game with it when none are left. */
export const loseBall = (g: Breakout): Breakout => {
  const lives = g.lives - 1
  return { ...g, lives, phase: 'lost', phaseMs: LOST_MS, lostX: clamp(Math.floor(g.ball.x), 0, g.width - 1), drops: [], wideMs: 0, slowMs: 0, isOver: lives <= 0 }
}

/** The ball off the walls and the ceiling, at its new place. */
const offWalls = (g: Breakout, b: Ball): Ball => {
  const fromSide = b.x < 0 ? { x: -b.x, vx: Math.abs(b.vx) } : b.x >= g.width ? { x: 2 * g.width - b.x - EPSILON, vx: -Math.abs(b.vx) } : { x: b.x, vx: b.vx }
  const fromTop = b.y < 0 ? { y: -b.y, vy: Math.abs(b.vy) } : { y: b.y, vy: b.vy }
  return { ...fromSide, ...fromTop }
}

/** The ball moved `dt` seconds (short enough not to skip a pixel), and what it hits. */
const stepBall = (g: Breakout, dt: number): Breakout => {
  const from = g.ball
  const to = offWalls(g, { ...from, x: from.x + from.vx * dt, y: from.y + from.vy * dt })
  const hit = standingAt(g, to.x, to.y)
  if (hit !== null) {
    // Into a brick from the side when it stays in the same row of bricks: then it turns back across, else up or down.
    const isFromSide = Math.floor(from.y / 2) === Math.floor(to.y / 2)
    const ball = { ...from, vx: isFromSide ? -to.vx : to.vx, vy: isFromSide ? to.vy : -to.vy }
    return breakBrick({ ...g, ball }, hit)
  }
  const top = paddleRow(g)
  const isOnPaddle = to.vy > 0 && from.y < top && to.y >= top && to.x >= g.paddleX - MAX_STEP && to.x < g.paddleX + paddleWidth(g) + MAX_STEP
  if (isOnPaddle) return { ...g, ball: bounceOffPaddle(g, to) }
  if (to.y >= g.height * 2) return loseBall({ ...g, ball: to })
  return { ...g, ball: to }
}

/** `ms` of flight in short steps, stopping at a lost ball or a cleared wall. */
const fly = (g: Breakout, ms: number): Breakout => {
  const factor = g.slowMs > 0 ? SLOW_FACTOR : 1
  const distance = Math.hypot(g.ball.vx, g.ball.vy) * factor * (ms / 1000)
  const steps = Math.max(1, Math.ceil(distance / MAX_STEP))
  const dt = (factor * ms) / 1000 / steps
  let state = g
  for (let i = 0; i < steps && state.phase === 'play'; i++) state = stepBall(state, dt)
  return state
}

const BONUS_NAMES: Record<BonusKind, string> = { wide: 'larga!', slow: 'lenta!', life: '+1 ♥' }

/** A bonus caught by the paddle at work. */
export const catchBonus = (g: Breakout, kind: BonusKind): Breakout => {
  const popup = { x: g.paddleX + Math.floor(paddleWidth(g) / 2), row: g.height - 2, text: BONUS_NAMES[kind], color: BONUS_COLORS[kind], ms: POPUP_MS }
  const caught = { ...g, popups: [...g.popups, popup] }
  if (kind === 'life') return { ...caught, lives: Math.min(MAX_LIVES, g.lives + 1) }
  if (kind === 'slow') return { ...caught, slowMs: SLOW_MS }
  // Wider about its middle, kept inside the field.
  const grow = (WIDE_PADDLE_WIDTH - paddleWidth(g)) / 2
  return { ...caught, wideMs: WIDE_MS, paddleX: clamp(Math.round(g.paddleX - grow), 0, g.width - WIDE_PADDLE_WIDTH) }
}

/** Falling bonuses moved on: the ones the paddle meets caught, the ones past it gone. */
const fall = (g: Breakout, ms: number): Breakout => {
  const moved = g.drops.map(d => ({ ...d, y: d.y + DROP_SPEED * (ms / 1000) }))
  const width = paddleWidth(g)
  const isCaught = (d: Drop) => d.y >= paddleRow(g) - 1 && d.x + 1 >= g.paddleX && d.x - 1 < g.paddleX + width
  const caught = moved.filter(isCaught)
  const left = { ...g, drops: moved.filter(d => !isCaught(d) && d.y < g.height * 2) }
  return caught.reduce((state, d) => catchBonus(state, d.kind), left)
}

/** The bonuses' time running out: a wide paddle shrinks back about its middle. */
const wearOff = (g: Breakout, ms: number): Breakout => {
  const wideMs = Math.max(0, g.wideMs - ms)
  const shrunk = g.wideMs > 0 && wideMs === 0
  const paddleX = shrunk ? clamp(g.paddleX + (WIDE_PADDLE_WIDTH - PADDLE_WIDTH) / 2, 0, g.width - PADDLE_WIDTH) : g.paddleX
  return { ...g, wideMs, slowMs: Math.max(0, g.slowMs - ms), paddleX }
}

/** After a lost ball, the next one on the paddle; after a cleared wall, the next level's. */
const afterMoment = (g: Breakout): Breakout => {
  const next =
    g.phase === 'cleared'
      ? { ...g, level: g.level + 1, bricks: fullWall(g.bricks.length, g.bricks[0]?.length ?? 0), shatters: [], wideMs: 0, slowMs: 0, paddleX: Math.floor((g.width - PADDLE_WIDTH) / 2) }
      : g
  return { ...next, phase: 'serve', phaseMs: 0, ball: restingBall(next) }
}

const age = <E extends { ms: number }>(effects: readonly E[], ms: number): E[] => effects.filter(e => e.ms > ms).map(e => ({ ...e, ms: e.ms - ms }))

/** Time passing: the effects fade, the moments run out, the ball flies and the bonuses fall. */
export const tickBreakout = (g: Breakout, ms: number): Breakout => {
  if (g.isOver) return g
  const aged = { ...g, shatters: age(g.shatters, ms), popups: age(g.popups, ms) }
  if (g.phase === 'lost' || g.phase === 'cleared') {
    return g.phaseMs > ms ? { ...aged, phaseMs: g.phaseMs - ms } : afterMoment(aged)
  }
  if (g.phase === 'serve') return aged
  return fall(wearOff(fly(aged, ms), ms), ms)
}

// ── Drawing ────────────────────────────────────────────────────────────────

/** The wall's rows, top to bottom, as a rainbow: each colour, its lit top edge, its shaded side. */
export const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#38bdf8', '#a855f7']
export const LIGHTS = ['#fca5a5', '#fdba74', '#fef08a', '#86efac', '#bae6fd', '#d8b4fe']
export const SHADES = ['#991b1b', '#9a3412', '#a16207', '#166534', '#0369a1', '#6b21a8']
export const BONUS_COLORS: Record<BonusKind, string> = { wide: PALETTE.sky, slow: PALETTE.purple, life: PALETTE.danger }
const BONUS_GLYPHS: Record<BonusKind, string> = { wide: '↔', slow: '≈', life: '♥' }
const BALL = PALETTE.white
const TRAIL = '#52525b'
/** The paddle's lit top, its body, and its ends. */
export const PADDLE_LIGHT = '#fbcfe8'
export const PADDLE = '#f472b6'
const PADDLE_END = '#be185d'
const CHIP_TEXT = '#18181b'
/** How far back the ball's trail is drawn, in seconds of flight. */
const TRAIL_S = 0.06
/** A broken brick shows white for the first half of its flash, crumbled for the rest. */
const FLASH = PALETTE.white
/** The frame of a cleared wall blinks between two greens this often. */
const BLINK_MS = 200
const CLEARED_GLOW = '#86efac'

/** The pixels of the ball and its trail, when it is in flight or at rest on the paddle. */
const ballPixels = (g: Breakout): { x: number; y: number; color: string }[] => {
  if (g.phase === 'lost' || g.phase === 'cleared') return []
  const ball = { x: Math.floor(g.ball.x), y: Math.floor(g.ball.y), color: BALL }
  if (g.phase !== 'play') return [ball]
  const trail = { x: Math.floor(g.ball.x - g.ball.vx * TRAIL_S), y: Math.floor(g.ball.y - g.ball.vy * TRAIL_S), color: TRAIL }
  const isApart = trail.x !== ball.x || trail.y !== ball.y
  return isApart && standingAt(g, trail.x + 0.5, trail.y + 0.5) === null ? [ball, trail] : [ball]
}

/** The paddle's colour at a pixel: a lit top over its body, its ends darker; null off it. */
const paddlePixel = (g: Breakout, x: number, y: number): string | null => {
  const top = paddleRow(g)
  if (y < top || y > top + 1 || x < g.paddleX || x >= g.paddleX + paddleWidth(g)) return null
  const isEnd = x === g.paddleX || x === g.paddleX + paddleWidth(g) - 1
  if (y === top) return isEnd ? PADDLE : PADDLE_LIGHT
  return isEnd ? PADDLE_END : PADDLE
}

/** Two pixels, one over the other, as one cell of half blocks. */
const halfBlock = (top: string | null, bottom: string | null): Span | null => {
  if (top === null && bottom === null) return null
  if (top === null) return { text: '▄', fg: bottom! }
  if (bottom === null || top === bottom) return { text: bottom === null ? '▀' : '█', fg: top }
  return { text: '▀', fg: top, bg: bottom }
}

type Pixel = { x: number; y: number; color: string }

/** Ball, trail and paddle in a cell: drawn when the ball or its trail is there. */
const ballCell = (g: Breakout, pixels: readonly Pixel[], x: number, row: number): Span | null => {
  const at = (y: number) => pixels.find(p => p.x === x && p.y === y)?.color ?? null
  const top = at(row * 2)
  const bottom = at(row * 2 + 1)
  if (top === null && bottom === null) return null
  return halfBlock(top ?? paddlePixel(g, x, row * 2), bottom ?? paddlePixel(g, x, row * 2 + 1))
}

/** A standing brick's cell: its colour under a lit top edge, its last column shaded with a hair of gap. */
const brickCell = (g: Breakout, x: number, row: number): Span | null => {
  const cell = standingAt(g, x + 0.5, row * 2)
  if (cell === null) return null
  const isLast = (x - g.brickLeft) % g.brickWidth === g.brickWidth - 1
  const i = cell.row % COLORS.length
  return isLast ? { text: '▉', fg: SHADES[i]! } : { text: '▆', fg: COLORS[i]!, bg: LIGHTS[i]! }
}

/** A brick just broken: white at first, then crumbling in its colour. */
const shatterCell = (g: Breakout, x: number, row: number): Span | null => {
  const cell = brickCellOf(g, x + 0.5, row * 2)
  const shatter = cell === null ? undefined : g.shatters.find(s => s.row === cell.row && s.col === cell.col)
  if (shatter === undefined) return null
  return shatter.ms > SHATTER_MS / 2 ? { text: '█', fg: FLASH, bold: true } : { text: '░', fg: COLORS[shatter.row % COLORS.length]! }
}

/** A falling bonus, a pill three columns wide: `▐↔▌`. */
const dropCell = (g: Breakout, x: number, row: number): Span | null => {
  const drop = g.drops.find(d => Math.floor(d.y / 2) === row && Math.abs(x - d.x) <= 1)
  if (drop === undefined) return null
  const color = BONUS_COLORS[drop.kind]
  if (x === drop.x) return { text: BONUS_GLYPHS[drop.kind], fg: CHIP_TEXT, bg: color, bold: true }
  return { text: x < drop.x ? '▐' : '▌', fg: color }
}

const paddleCell = (g: Breakout, x: number, row: number): Span | null => halfBlock(paddlePixel(g, x, row * 2), paddlePixel(g, x, row * 2 + 1))

/** Where the lost ball fell through, a spark at the bottom while the moment lasts. */
const lostCell = (g: Breakout, x: number, row: number): Span | null =>
  g.phase === 'lost' && x === g.lostX && row === g.height - 1 ? { text: '✸', fg: PALETTE.danger, bold: true } : null

/** The row a message shows on: halfway between the wall and the paddle. */
export const messageRow = (g: Breakout): number => Math.floor((BRICK_TOP + g.bricks.length + g.height - 1) / 2)

/** The message of the moment, if any: a lost ball, a cleared wall, the launch to make. */
const messageOf = (g: Breakout): { text: string; color: string } | null => {
  if (g.isOver) return { text: 'partita finita', color: PALETTE.danger }
  if (g.phase === 'lost') return { text: 'palla persa', color: PALETTE.danger }
  if (g.phase === 'cleared') return { text: `livello ${g.level} superato!`, color: PALETTE.good }
  return g.phase === 'serve' ? { text: 'spazio per lanciare', color: PALETTE.label } : null
}

/** Text over the field, keyed by `column,row`: the popups, rising, and the message. */
const overlayOf = (g: Breakout): Map<string, Span> => {
  const out = new Map<string, Span>()
  const put = (text: string, x: number, row: number, color: string) =>
    [...text].forEach((ch, i) => {
      if (x + i >= 0 && x + i < g.width && row >= 0) out.set(`${x + i},${row}`, { text: ch, fg: color, bold: true })
    })
  for (const p of g.popups) {
    const rise = Math.floor((1 - p.ms / POPUP_MS) * 2)
    put(p.text, p.x - Math.floor([...p.text].length / 2), p.row - rise, p.color)
  }
  const message = messageOf(g)
  if (message !== null) {
    const text = ` ${message.text} `
    put(text, Math.floor((g.width - [...text].length) / 2), messageRow(g), message.color)
  }
  return out
}

const fieldRows = (g: Breakout): Row[] => {
  const pixels = ballPixels(g)
  const overlay = overlayOf(g)
  return Array.from({ length: g.height }, (_, row) =>
    pack(
      Array.from(
        { length: g.width },
        (_, x): Span =>
          ballCell(g, pixels, x, row) ??
          overlay.get(`${x},${row}`) ??
          brickCell(g, x, row) ??
          shatterCell(g, x, row) ??
          dropCell(g, x, row) ??
          paddleCell(g, x, row) ??
          lostCell(g, x, row) ?? { text: ' ' },
      ),
    ),
  )
}

/** The bottom edge: the lives as hearts, then the bonuses at work with their seconds left. */
const footerOf = (g: Breakout): Span[] => {
  const lives = Math.max(0, g.lives)
  const timer = (kind: BonusKind, ms: number): Span[] =>
    ms > 0 ? [{ text: '─', fg: PALETTE.frame }, { text: ` ${BONUS_GLYPHS[kind]} ${Math.ceil(ms / 1000)}s `, fg: BONUS_COLORS[kind], bold: true }] : []
  return [
    { text: ' ', fg: PALETTE.label },
    { text: '♥'.repeat(lives), fg: PALETTE.danger, bold: true },
    { text: '♡'.repeat(Math.max(0, LIVES - lives)), fg: PALETTE.label },
    { text: ' ', fg: PALETTE.label },
    ...timer('wide', g.wideMs),
    ...timer('slow', g.slowMs),
  ]
}

/** The frame: red for a lost ball, blinking green for a cleared wall, dim otherwise. */
const frameColor = (g: Breakout): string => {
  if (g.isOver || g.phase === 'lost') return PALETTE.danger
  if (g.phase === 'cleared') return Math.floor((CLEARED_MS - g.phaseMs) / BLINK_MS) % 2 === 0 ? PALETTE.good : CLEARED_GLOW
  return PALETTE.frame
}

/** The field in a rounded frame, the level in its top edge and the lives in its bottom one, centered. */
export const drawBreakout = (g: Breakout): Row[] => {
  const color = frameColor(g)
  const titleColor = g.phase === 'cleared' ? PALETTE.good : g.phase === 'lost' || g.isOver ? PALETTE.danger : PALETTE.label
  const board = framed(fieldRows(g), g.width, { title: `livello ${g.level}`, color, titleColor, footer: footerOf(g) })
  const pad = centerPad(g.columns, g.width + FRAME_CELLS)
  return pad.text === '' ? board : board.map(r => pack([pad, ...r]))
}

export const BREAKOUT: GameDef<Breakout> = {
  id: 'breakout',
  name: 'Breakout',
  keys: '←→ o a/d muovi · spazio o ↑ lancia la palla',
  create: ctx => newBreakout(ctx.columns, ctx.rows, ctx.rng),
  key: keyBreakout,
  tick: tickBreakout,
  isOver: g => g.isOver,
  score: g => g.score,
  draw: drawBreakout,
  status: g => `mattoni ${bricksLeft(g)}`,
}
