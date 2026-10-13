import type { Cactus, Dino } from './games/dino'
import { DINO_WIDTH, DINO_X } from './games/dino'
import type { Game2048, Grid } from './games/g2048'
import { WIN_TILE } from './games/g2048'
import type { Direction, Point, Snake } from './games/snake'
import { snakeInterval } from './games/snake'
import { centerPad, framed, meter, pack, PALETTE } from './games/style'
import type { Row, Span } from './games/types'

export { pack }

export type { Row, Span }

// style.ts imports `pack` from here: its PALETTE is read inside functions only,
// never while this module loads, so the import cycle stays harmless.

/** Claude's orange. */
export const MASCOT = '#d97757'
const DARK_TEXT = '#1a1a1a'
const LIGHT_TEXT = '#f9f6f2'
const GOLD = '#edc22e'
const SPARK = '#fde047'

const mod = (n: number, m: number) => ((n % m) + m) % m
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** The colour `t` (0 to 1) of the way from `a` to `b`. */
const mix = (a: string, b: string, t: number): string => {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16)
  const at = [0, 1, 2].map(i => Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * clamp(t, 0, 1)))
  return `#${at.map(n => n.toString(16).padStart(2, '0')).join('')}`
}

const centered = (text: string, width: number) => {
  const length = [...text].length
  const left = Math.max(0, Math.floor((width - length) / 2))
  return ' '.repeat(left) + text + ' '.repeat(Math.max(0, width - left - length))
}

/** A framed block centered in `columns`: blanks before each row, when there is room for any. */
const centeredIn = (rows: Row[], columns: number, width: number): Row[] => {
  const pad = centerPad(columns, width)
  return pad.text === '' ? rows : rows.map(r => pack([pad, ...r]))
}

/** A blank cut into a frame's bottom edge: the frame draws it as a line. */
const EDGE: Span = { text: ' ' }

/** A meter's colour by how far it is: green, then amber, then red. */
const urgency = (share: number) => (share < 1 / 3 ? PALETTE.good : share < 2 / 3 ? PALETTE.hurry : PALETTE.danger)

// ─── Snake ───────────────────────────────────────────────────────────────

/** How long a fruit eaten shows: the frame lit, `+10` in its bottom edge, the bulge down the body. */
export const EAT_FLASH_MS = 700
/** The first part of it: sparks round the spot the fruit was. */
const SPARK_MS = 350
/** The head shines white this long after a bite. */
const BITE_MS = 120
/** The swallowed fruit moves one segment down the body this often. */
const SWALLOW_MS = 45
/** The fruit glows and dims on this beat. */
const FRUIT_BEAT_MS = 300

/** The last fruit eaten: where it was, the points it made, the ms since. */
export type Ate = { at: Point; points: number; ms: number }

/** What the snake's drawing reads besides the board: the room, a clock, the last bite. */
export type SnakeView = { columns?: number; clock?: number; ate?: Ate | null }

const SNAKE_HEAD = '#86efac'
const SNAKE_NECK = '#4ade80'
const SNAKE_TAIL = '#166534'
const SNAKE_BULGE = '#d9f99d'
const DEAD_NECK = '#71717a'
const DEAD_TAIL = '#3f3f46'
const SNAKE_EYES = '#052e16'
const FRUIT = '#ef4444'
const FRUIT_GLOW = '#fca5a5'
/** Two eyes, looking where the head goes. */
const EYES: Record<Direction, string> = { up: '▝▘', down: '▗▖', left: ': ', right: ' :' }
/** The step interval of a new snake and of the fastest one (snake.ts). */
const SLOWEST_MS = 150
const FASTEST_MS = 60

const liveBite = (v: SnakeView): Ate | null => (v.ate !== undefined && v.ate !== null && v.ate.ms < EAT_FLASH_MS ? v.ate : null)

const isFull = (s: Snake) => s.body.length >= s.width * s.height
const isCrashed = (s: Snake) => s.isOver && !isFull(s)

const bodyColor = (s: Snake, i: number, bite: Ate | null): string => {
  const t = s.body.length <= 2 ? 0 : (i - 1) / (s.body.length - 2)
  if (isCrashed(s)) return mix(DEAD_NECK, DEAD_TAIL, t)
  if (bite !== null && Math.floor(bite.ms / SWALLOW_MS) + 1 === i) return SNAKE_BULGE
  return mix(SNAKE_NECK, SNAKE_TAIL, t)
}

const headSpan = (s: Snake, bite: Ate | null): Span => {
  const bg = isCrashed(s) ? PALETTE.danger : bite !== null && bite.ms < BITE_MS ? PALETTE.white : SNAKE_HEAD
  return { text: isCrashed(s) ? '××' : EYES[s.heading], fg: SNAKE_EYES, bg, bold: true }
}

const isBeside = (a: Point, b: Point) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1

/** One cell, two columns wide so it looks square. */
const snakeCell = (s: Snake, v: SnakeView, segments: ReadonlyMap<string, number>, x: number, y: number): Span => {
  const bite = liveBite(v)
  const i = segments.get(`${x},${y}`)
  if (i === 0) return headSpan(s, bite)
  if (i !== undefined) return { text: '  ', bg: bodyColor(s, i, bite) }
  if (s.food.x === x && s.food.y === y) {
    const isGlowing = Math.floor((v.clock ?? 0) / FRUIT_BEAT_MS) % 2 === 1
    return { text: '● ', fg: isGlowing ? FRUIT_GLOW : FRUIT, bold: true }
  }
  if (bite !== null && bite.ms < SPARK_MS && isBeside(bite.at, { x, y })) return { text: '✦ ', fg: SPARK, bold: true }
  return (x + y) % 2 === 0 ? { text: '· ', fg: PALETTE.faint } : { text: '  ' }
}

/** The bottom edge: the end, or the bite's points and how fast the snake goes. */
const snakeFooter = (s: Snake, v: SnakeView): Span[] => {
  if (isCrashed(s)) return [{ text: ' ✗ schianto ', fg: PALETTE.danger, bold: true }]
  if (s.isOver) return [{ text: ' ★ tabellone pieno! ', fg: GOLD, bold: true }]
  const bite = liveBite(v)
  const share = (SLOWEST_MS - snakeInterval(s)) / (SLOWEST_MS - FASTEST_MS)
  const gain: Span[] = bite === null ? [] : [{ text: ` +${bite.points} `, fg: PALETTE.good, bold: true }, EDGE]
  return [...gain, EDGE, ...meter(share, 6, urgency(share)), { text: ' velocità ', fg: PALETTE.label }]
}

/** The board in a rounded frame, each cell two columns wide, centered in the room. */
export const drawSnake = (s: Snake, v: SnakeView = {}): Row[] => {
  const width = s.width * 2
  const segments = new Map(s.body.map((p, i) => [`${p.x},${p.y}`, i] as const))
  const rows = Array.from({ length: s.height }, (_, y) => Array.from({ length: s.width }, (_, x) => snakeCell(s, v, segments, x, y)))
  const color = isCrashed(s) ? PALETTE.danger : s.isOver ? GOLD : liveBite(v) !== null ? PALETTE.good : PALETTE.frame
  const frame = framed(rows, width, { title: 'Snake', color, titleColor: PALETTE.good, footer: snakeFooter(s, v) })
  return centeredIn(frame, v.columns ?? 0, width + 2)
}

// ─── 2048 ────────────────────────────────────────────────────────────────

/** What the last move did: where tiles merged (1 on the cell), the tile it added, the points it made. */
export type Fx2048 = { merged: Grid; spawned: { r: number; c: number } | null; gained: number }

/** What the 2048 drawing reads besides the grid: the room and the last move. */
export type View2048 = { columns?: number; rows?: number; last?: Fx2048 | null }

const TILE_COLORS: Record<number, string> = {
  2: '#eee4da',
  4: '#ede0c8',
  8: '#f2b179',
  16: '#f59563',
  32: '#f67c5f',
  64: '#f65e3b',
  128: '#edcf72',
  256: '#edcc61',
  512: '#edc850',
  1024: '#edc53f',
  2048: GOLD,
}
const BIG_TILE = '#3c3a32'
const EMPTY_TILE = '#27272a'
const EMPTY_DOT = '#52525b'
/** Doublings from 1 to 2048: the cells of the bar in the bottom edge. */
const WIN_STEPS = Math.log2(WIN_TILE)

/**
 * How a tile row is drawn, by the room: `pad` a blank row of the tile's
 * colour, `num` its number, `cap` and `base` half rows above and below.
 */
type TileLine = 'pad' | 'num' | 'cap' | 'base'
type Layout = { minRows: number; lines: TileLine[]; gapRows: number }
/** Each fits its `minRows` with the frame: 4 tile rows of `lines`, `gapRows` between them, 2 edges. */
const LAYOUTS_2048: readonly Layout[] = [
  { minRows: 17, lines: ['pad', 'num', 'pad'], gapRows: 1 },
  { minRows: 14, lines: ['cap', 'num', 'base'], gapRows: 0 },
  { minRows: 0, lines: ['num', 'base'], gapRows: 0 },
]
const MIN_TILE = 6
const MAX_TILE = 9
/** From this many columns the tiles stand two columns apart. */
const WIDE_COLUMNS = 60

const tileColor = (n: number) => (n === 0 ? EMPTY_TILE : (TILE_COLORS[n] ?? BIG_TILE))

const numberSpan = (n: number, width: number, isMerged: boolean): Span => {
  if (n === 0) return { text: centered('·', width), fg: EMPTY_DOT, bg: EMPTY_TILE }
  const marked = `✦ ${n} ✦`
  const label = isMerged && [...marked].length <= width ? marked : String(n)
  return { text: centered(label, width), fg: n <= 4 ? DARK_TEXT : LIGHT_TEXT, bg: tileColor(n), bold: true }
}

/** One line of a tile; a tile just added shows its middle line only, as if it grew in. */
const tileSpan = (n: number, line: TileLine, width: number, isMerged: boolean, isNew: boolean): Span => {
  const shell = isNew ? EMPTY_TILE : tileColor(n)
  if (line === 'num') return numberSpan(n, width, isMerged)
  if (line === 'pad') return { text: ' '.repeat(width), bg: shell }
  return { text: (line === 'cap' ? '▄' : '▀').repeat(width), fg: shell }
}

/** The bottom edge: the end, or the last move's points and the way to 2048. */
const footer2048 = (g: Game2048, last: Fx2048 | null): Span[] => {
  if (g.isOver) return [{ text: ' ✗ nessuna mossa ', fg: PALETTE.danger, bold: true }]
  const top = Math.max(...g.grid.flat())
  const gain: Span[] = last !== null && last.gained > 0 ? [{ text: ` +${last.gained} `, fg: PALETTE.good, bold: true }, EDGE] : []
  const goal: Span = g.hasWon ? { text: ' ★ 2048! ', fg: GOLD, bold: true } : { text: ' verso il 2048 ', fg: PALETTE.label }
  return [...gain, EDGE, ...meter(Math.log2(Math.max(2, top)) / WIN_STEPS, WIN_STEPS, top > WIN_TILE ? GOLD : tileColor(top)), goal]
}

/** The grid in a rounded frame, as tall as the room allows; the last merges marked, the new tile growing in. */
export const draw2048 = (g: Game2048, v: View2048 = {}): Row[] => {
  const columns = v.columns ?? 40
  const layout = LAYOUTS_2048.find(l => (v.rows ?? 0) >= l.minRows) ?? LAYOUTS_2048[LAYOUTS_2048.length - 1]!
  const gap = columns >= WIDE_COLUMNS ? 2 : 1
  const tile = clamp(Math.floor((columns - 4 - 3 * gap) / 4), MIN_TILE, MAX_TILE)
  const width = 4 * tile + 3 * gap + 2
  const last = v.last ?? null
  const tileRows = g.grid.map((cells, r) =>
    layout.lines.map(line =>
      pack([
        { text: ' ' },
        ...cells.flatMap((n, c): Span[] => {
          const span = tileSpan(n, line, tile, last?.merged[r]?.[c] === 1, last?.spawned?.r === r && last.spawned.c === c)
          return c === 0 ? [span] : [{ text: ' '.repeat(gap) }, span]
        }),
      ]),
    ),
  )
  const gapRows: Row[] = Array.from({ length: layout.gapRows }, () => [])
  const inside = tileRows.flatMap((rows, r) => (r === 0 ? rows : [...gapRows, ...rows]))
  const color = g.isOver ? PALETTE.danger : g.hasWon ? GOLD : PALETTE.frame
  const frame = framed(inside, width, { title: '2048', color, titleColor: GOLD, footer: footer2048(g, last) })
  return centeredIn(frame, columns, width + 2)
}

// ─── Claude runner ───────────────────────────────────────────────────────

/** Rows of sky above the ground: a 5-row jump of the 3-row mascot, and one to spare. */
export const DINO_SKY = 9

/**
 * Claude's mascot as the welcome screen draws it, top row first; the feet
 * take turns while it runs, and stay together in the air.
 */
export const MASCOT_BODY = [' ▐▛███▜▌ ', '▝▜█████▛▘']
export const FEET_TOGETHER = '  ▘▘ ▝▝  '
export const FEET_APART = '  ▝▘ ▘▝  '
/** Columns run between two steps of the feet. */
const STRIDE = 1.5

export const mascotRows = (d: Dino): string[] => {
  const isStepping = d.y === 0 && !d.isOver && Math.floor(d.distance / STRIDE) % 2 === 1
  return [...MASCOT_BODY, isStepping ? FEET_APART : FEET_TOGETHER]
}

const CACTUS = '#22c55e'
const CACTUS_ROOT = '#15803d'
const GROUND = '#a8a29e'
const GROUND_SPECK = '#e7e5e4'
const GROUND_DARK = '#78716c'
const SOIL = '#57534e'
const SHADOW = '#44403c'
const CLOUD = '#52525b'
const STREAK = '#71717a'

/** A cactus by `width×height`, top row first: a trunk and arms in the cells that hit. */
const CACTUS_ART: Record<string, readonly string[]> = {
  '1x1': ['█'],
  '1x2': ['▟', '█'],
  '2x1': ['█▟'],
  '2x2': ['█▐', '█▀'],
  '3x1': ['▙█▟'],
  '3x2': ['▌█▐', '▀█▀'],
}
const CLOUD_ART = [' ▗▄██▄▖ ', '▝▀▀▀▀▀▀▘']
/** Clouds, far behind: where each sits along their loop, and its sky row from the top. */
const CLOUDS = [
  { at: 0.1, top: 0 },
  { at: 0.45, top: 2 },
  { at: 0.8, top: 1 },
]
/** The clouds' share of the ground's speed: all alike, so they never run into each other. */
const CLOUD_DRIFT = 0.12
/** Wind streaks, faster than the ground; more of them as the speed grows. Rows count up from the ground. */
const STREAKS = [
  { x: 13, row: 6, length: 4 },
  { x: 49, row: 3, length: 3 },
  { x: 31, row: 7, length: 5 },
  { x: 71, row: 4, length: 3 },
]
const STREAK_DRIFT = 1.7
/** Below this share of the top speed, no wind. */
const CALM = 0.15
const DUNE_DRIFT = 0.3
/** Eighths of a row. */
const MAX_DUNE = 4
const EIGHTHS = ' ▁▂▃▄▅▆▇█'
/** The ground's speed at the start and at most (dino.ts). */
const START_SPEED = 18
const TOP_SPEED = 42
/** Points past each hundred while the milestone shows. */
const MILESTONE_POINTS = 8
/** The board rows from which the drawing adds a soil row, then one more row of sky. */
const SOIL_ROWS = 13
const TALL_ROWS = 14

const speedShare = (d: Dino) => clamp((d.speed - START_SPEED) / (TOP_SPEED - START_SPEED), 0, 1)
const isMilestone = (d: Dino) => !d.isOver && d.score >= 100 && d.score % 100 < MILESTONE_POINTS

const cactusSpan = (c: Cactus, x: number, row: number): Span | null => {
  const column = x - Math.round(c.x)
  if (column < 0 || column >= c.width || row >= c.height) return null
  const art = CACTUS_ART[`${c.width}x${c.height}`]
  const glyph = art === undefined ? '█' : ([...(art[c.height - 1 - row] ?? '')][column] ?? '█')
  return { text: glyph, fg: row === 0 && c.height > 1 ? CACTUS_ROOT : CACTUS }
}

const triangle = (p: number, period: number) => 1 - Math.abs((2 * mod(p, period)) / period - 1)

/** Far dunes, never more than half a row high so no one takes them for a cactus, sliding slower than the ground. */
const duneSpan = (d: Dino, x: number, row: number): Span | null => {
  if (row > 0) return null
  const p = x + Math.floor(d.distance * DUNE_DRIFT)
  const eighths = Math.min(MAX_DUNE, Math.round(triangle(p, 37) * 4 + triangle(p + 5, 13) * 2) - 1)
  return eighths <= 0 ? null : { text: EIGHTHS[eighths]!, fg: PALETTE.faint }
}

const cloudSpan = (d: Dino, x: number, top: number): Span | null => {
  const loop = d.width + 12
  for (const cloud of CLOUDS) {
    const line = CLOUD_ART[top - cloud.top]
    const left = Math.round(mod(cloud.at * loop - d.distance * CLOUD_DRIFT, loop)) - 9
    const glyph = line === undefined ? undefined : [...line][x - left]
    if (glyph !== undefined && glyph !== ' ') return { text: glyph, fg: CLOUD }
  }
  return null
}

const streakSpan = (d: Dino, x: number, row: number): Span | null => {
  const share = speedShare(d)
  const count = share < CALM ? 0 : 1 + Math.floor(share * 3)
  const loop = d.width + 10
  const isOn = STREAKS.slice(0, count).some(s => {
    const left = Math.round(mod(s.x - d.distance * STREAK_DRIFT, loop)) - 6
    return s.row === row && x >= left && x < left + s.length
  })
  return isOn ? { text: '─', fg: STREAK } : null
}

/** A crash: a burst at the mascot's front. */
const burstSpan = (d: Dino, x: number, row: number): Span | null => {
  if (!d.isOver) return null
  const front = DINO_X + DINO_WIDTH
  const middle = Math.round(d.y) + 1
  if (x === front && row === middle) return { text: '✸', fg: SPARK, bold: true }
  if (x === front + 1 && row === middle + 1) return { text: '╱', fg: PALETTE.hurry, bold: true }
  if (x === front + 1 && row === middle - 1) return { text: '╲', fg: PALETTE.hurry, bold: true }
  if (x === front + 2 && row === middle) return { text: '─', fg: PALETTE.hurry, bold: true }
  return null
}

/**
 * One cell of sky, front to back: the mascot, a crash, a cactus, the wind, a
 * cloud, the dunes. The scenery stays out of the mascot's box, so nothing shows
 * between its feet.
 */
const skySpan = (d: Dino, sprite: readonly string[], x: number, row: number, top: number): Span => {
  const line = sprite[sprite.length - 1 - (row - Math.round(d.y))]
  const glyph = line === undefined ? undefined : [...line][x - DINO_X]
  if (glyph !== undefined && glyph !== ' ') return { text: glyph, fg: d.isOver ? PALETTE.danger : MASCOT }
  const front = burstSpan(d, x, row) ?? d.cacti.reduce<Span | null>((hit, c) => hit ?? cactusSpan(c, x, row), null)
  if (front !== null || glyph !== undefined) return front ?? { text: ' ' }
  return streakSpan(d, x, row) ?? cloudSpan(d, x, top) ?? duneSpan(d, x, row) ?? { text: ' ' }
}

/** The ground scrolls under the mascot, speckled; its shadow shrinks as it jumps. */
const groundSpan = (d: Dino, x: number): Span => {
  const lift = Math.round(d.y)
  const shadow = Math.max(2, DINO_WIDTH - 2 - lift)
  const from = DINO_X + Math.floor((DINO_WIDTH - shadow) / 2)
  if (lift > 0 && x >= from && x < from + shadow) return { text: '▀', fg: SHADOW }
  const p = x + Math.floor(d.distance)
  return { text: '▀', fg: mod(p, 11) === 0 ? GROUND_SPECK : mod(p, 7) === 3 ? GROUND_DARK : GROUND }
}

const soilSpan = (d: Dino, x: number): Span => {
  const pebble = mod((x + Math.floor(d.distance)) * 37, 23)
  return pebble === 0 || pebble === 17 ? { text: '·', fg: SOIL } : pebble === 11 ? { text: '˙', fg: SOIL } : { text: ' ' }
}

/** The bottom edge: the crash, or a milestone and how fast the ground runs. */
const runnerFooter = (d: Dino): Span[] => {
  if (d.isOver) return [{ text: ' ✗ schianto! ', fg: PALETTE.danger, bold: true }]
  const share = speedShare(d)
  const milestone: Span[] = isMilestone(d) ? [{ text: ` ✦ ${Math.floor(d.score / 100) * 100}! `, fg: GOLD, bold: true }, EDGE] : []
  return [...milestone, EDGE, ...meter(share, 8, urgency(share)), { text: ' velocità ', fg: PALETTE.label }]
}

/** The mascot, the cacti and the ground in a rounded frame, clouds and dunes drifting behind. */
export const drawDino = (d: Dino): Row[] => {
  const rows = d.screen?.rows ?? 0
  const sky = DINO_SKY + (rows >= TALL_ROWS ? 1 : 0)
  const sprite = mascotRows(d)
  const xs = Array.from({ length: d.width }, (_, x) => x)
  const skyRows = Array.from({ length: sky }, (_, top) => pack(xs.map(x => skySpan(d, sprite, x, sky - 1 - top, top))))
  const ground = pack(xs.map(x => groundSpan(d, x)))
  const soil = rows >= SOIL_ROWS ? [pack(xs.map(x => soilSpan(d, x)))] : []
  const color = d.isOver ? PALETTE.danger : isMilestone(d) ? GOLD : PALETTE.frame
  const frame = framed([...skyRows, ground, ...soil], d.width, { title: 'Claude runner', color, titleColor: MASCOT, footer: runnerFooter(d) })
  return centeredIn(frame, d.screen?.columns ?? 0, d.width + 2)
}
