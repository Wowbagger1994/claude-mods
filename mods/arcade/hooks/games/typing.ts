import type { Rng } from './rng'
import { nextInt } from './rng'
import { fitRow, framed, meter, pack, PALETTE, widthOf } from './style'
import type { GameContext, GameDef, Row, Span } from './types'

/** A word on its way down: its left column and its row, fractional while it falls. */
export type Falling = { text: string; x: number; y: number }

/** A word just typed whole, bursting where it was for a moment, with the points it made. */
export type Burst = { text: string; x: number; y: number; points: number; left: number }

export type Typing = {
  /** Columns of the lane the words fall through, inside its frame. */
  width: number
  /** Rows of the lane; the frame's edges sit above and below it. */
  height: number
  falling: Falling[]
  /** What the player typed so far toward a word. */
  buffer: string
  score: number
  lives: number
  /** Words typed in a row without a mistake or a loss. */
  combo: number
  /** Milliseconds played: speed and spawn rate grow with it. */
  elapsed: number
  sinceSpawn: number
  /** Milliseconds the buffer line still shows the last mistake. */
  errorFor: number
  /** Letters typed that some word began with, and mistakes: the precision. */
  hits: number
  misses: number
  burst: Burst | null
  /** The last word that reached the bottom, and how long the lane still shows it. */
  lost: string
  lostFor: number
  pool: readonly string[]
  isOver: boolean
  rng: Rng
}

export const LIVES = 3
/** Below this many words of Claude's code, the fallback list fills in. */
export const MIN_POOL = 20
/** Rows per second at the start, the most, and gained each second. */
const START_SPEED = 1.2
const MAX_SPEED = 4
const ACCELERATION = 0.02
/** Milliseconds between new words at the start, at the fastest, and lost each second. */
const START_INTERVAL = 2200
const MIN_INTERVAL = 700
const INTERVAL_DROP = 20
/** Words typed in a row for each step of the multiplier, and its cap. */
const COMBO_STEP = 3
const MAX_MULTIPLIER = 5
/** The last rows before the bottom: a word there is drawn in red. */
const DANGER_ROWS = 2
const ERROR_FLASH_MS = 400
/** How long a typed word bursts, and a lost one shows. */
export const BURST_MS = 450
export const LOST_MS = 700
/** Rows and columns the frame takes around the lane. */
const FRAME_CELLS = 2
const MIN_WIDTH = 20
const MIN_HEIGHT = 6

/** Words of JS and TS, for when Claude has written too little code yet. */
export const FALLBACK_WORDS: readonly string[] = [
  'const', 'function', 'promise', 'interface', 'async', 'await', 'return', 'export', 'import', 'default',
  'string', 'number', 'boolean', 'undefined', 'object', 'array', 'class', 'extends', 'implements', 'readonly',
  'typeof', 'instanceof', 'switch', 'case', 'break', 'continue', 'while', 'throw', 'catch', 'finally',
  'yield', 'static', 'private', 'public', 'protected', 'module', 'require', 'console', 'length', 'filter',
  'reduce', 'splice', 'slice', 'concat', 'values', 'entries', 'assign', 'freeze', 'resolve', 'reject',
  'setTimeout', 'fetch', 'response', 'request', 'header', 'render', 'effect', 'state', 'props', 'hooks',
]

/** Claude's words first; the fallback fills in when they are few. */
export const poolOf = (words: readonly string[]): string[] =>
  words.length >= MIN_POOL ? [...words] : [...new Set([...words, ...FALLBACK_WORDS])]

/** Rows per second after `elapsed` ms. */
export const speedAt = (elapsed: number): number => Math.min(MAX_SPEED, START_SPEED + (ACCELERATION * elapsed) / 1000)

/** Milliseconds between new words after `elapsed` ms. */
export const intervalAt = (elapsed: number): number => Math.max(MIN_INTERVAL, START_INTERVAL - (INTERVAL_DROP * elapsed) / 1000)

/** Points a word earns are its length times this. */
export const multiplierOf = (combo: number): number => Math.min(MAX_MULTIPLIER, 1 + Math.floor(combo / COMBO_STEP))

/** A word from the pool, preferring one not already falling, at a column that keeps it on the board. */
const spawn = (s: Typing): Typing => {
  const shown = new Set(s.falling.map(f => f.text))
  const fresh = s.pool.filter(w => !shown.has(w) && w.length <= s.width)
  const choices = fresh.length > 0 ? fresh : s.pool.filter(w => w.length <= s.width)
  if (choices.length === 0) return s
  const [i, r1] = nextInt(s.rng, choices.length)
  const text = choices[i]!
  const [x, r2] = nextInt(r1, s.width - text.length + 1)
  return { ...s, falling: [...s.falling, { text, x, y: 0 }], rng: r2 }
}

export const newTyping = (ctx: GameContext): Typing =>
  spawn({
    width: Math.max(MIN_WIDTH, ctx.columns) - FRAME_CELLS,
    height: Math.max(MIN_HEIGHT, ctx.rows - FRAME_CELLS),
    falling: [],
    buffer: '',
    score: 0,
    lives: LIVES,
    combo: 0,
    elapsed: 0,
    sinceSpawn: 0,
    errorFor: 0,
    hits: 0,
    misses: 0,
    burst: null,
    lost: '',
    lostFor: 0,
    pool: poolOf(ctx.words),
    isOver: false,
    rng: ctx.rng,
  })

/** The word the buffer is typing: the lowest one it begins; null when the buffer is empty or begins none. */
export const activeWord = (s: Typing): Falling | null => {
  if (s.buffer === '') return null
  const matching = s.falling.filter(f => f.text.startsWith(s.buffer))
  return matching.reduce<Falling | null>((low, f) => (low === null || f.y > low.y ? f : low), null)
}

const mistake = (s: Typing): Typing => ({ ...s, buffer: '', combo: 0, errorFor: ERROR_FLASH_MS, misses: s.misses + 1 })

/** One character typed: the word grows, a whole word explodes, a letter no word begins with is a mistake. */
const typeChar = (s: Typing, char: string): Typing => {
  const buffer = s.buffer + char
  const matching = s.falling.filter(f => f.text.startsWith(buffer))
  if (matching.length === 0) return mistake(s)
  const done = matching.filter(f => f.text === buffer).reduce<Falling | null>((low, f) => (low === null || f.y > low.y ? f : low), null)
  if (done === null) return { ...s, buffer, hits: s.hits + 1 }
  const points = done.text.length * multiplierOf(s.combo)
  return {
    ...s,
    buffer: '',
    falling: s.falling.filter(f => f !== done),
    score: s.score + points,
    combo: s.combo + 1,
    hits: s.hits + 1,
    burst: { text: done.text, x: done.x, y: done.y, points, left: BURST_MS },
  }
}

export const keyTyping = (s: Typing, key: string): Typing => {
  if (s.isOver) return s
  if (key === 'backspace') return { ...s, buffer: s.buffer.slice(0, -1) }
  // Space and Enter start the word over without a penalty: a typist's reflex after a word is no mistake.
  if (key === 'return' || key === ' ' || key === 'space') return { ...s, buffer: '' }
  return [...key].length === 1 ? typeChar(s, key) : s
}

/** Time passing: words fall, one reaching the bottom costs a life, new ones come faster and faster. */
export const tickTyping = (s: Typing, ms: number): Typing => {
  if (s.isOver) return s
  const moved = speedAt(s.elapsed) * (ms / 1000)
  const fallen = s.falling.map(f => ({ ...f, y: f.y + moved }))
  const landed = fallen.filter(f => f.y >= s.height)
  const falling = fallen.filter(f => f.y < s.height)
  const lives = Math.max(0, s.lives - landed.length)
  const isStillTyping = s.buffer !== '' && falling.some(f => f.text.startsWith(s.buffer))
  const burstLeft = (s.burst?.left ?? 0) - ms
  const after: Typing = {
    ...s,
    falling,
    lives,
    combo: landed.length > 0 ? 0 : s.combo,
    buffer: isStillTyping ? s.buffer : '',
    elapsed: s.elapsed + ms,
    sinceSpawn: s.sinceSpawn + ms,
    errorFor: Math.max(0, s.errorFor - ms),
    burst: s.burst !== null && burstLeft > 0 ? { ...s.burst, left: burstLeft } : null,
    lost: landed[0]?.text ?? s.lost,
    lostFor: landed.length > 0 ? LOST_MS : Math.max(0, s.lostFor - ms),
    isOver: lives === 0,
  }
  if (after.isOver || after.sinceSpawn < intervalAt(s.elapsed)) return after
  return spawn({ ...after, sinceSpawn: 0 })
}

export const typingStatus = (s: Typing): string =>
  `${'♥'.repeat(s.lives)}${'♡'.repeat(LIVES - s.lives)} · combo ×${multiplierOf(s.combo)}`

// ── Drawing ─────────────────────────────────────────────────────────────────

const WORD = '#e5e7eb'
const DANGER_LINE = '#7f1d1d'
const FADING = '#15803d'
/** The multiplier's colour, ×1 to ×5: it warms as the combo grows. */
const COMBO_COLORS = [PALETTE.label, PALETTE.sky, PALETTE.purple, PALETTE.hurry, PALETTE.claude]
/** One drop of rain every this many columns, falling this many rows a second. */
const RAIN_SPACING = 7
const RAIN_SPEED = 6
/** Below these shares of the letters right, the precision turns amber, then red. */
const PRECISE = 0.9
const SLOPPY = 0.7
/** A word below this share of the lane turns amber. */
const HURRY_SHARE = 0.6

/** A fixed scramble of a number, for drops that keep their column. */
const hash = (n: number): number => {
  const a = Math.imul(n ^ (n >>> 16), 0x85ebca6b)
  const b = Math.imul(a ^ (a >>> 13), 0xc2b2ae35)
  return (b ^ (b >>> 16)) >>> 0
}

/** Faint rain behind the words, falling with the time played; a dotted line where the danger starts. */
const backdrop = (s: Typing, row: number): Span[] => {
  if (row === s.height - DANGER_ROWS) return Array.from({ length: s.width }, () => ({ text: '┈', fg: DANGER_LINE }))
  const cells: Span[] = Array.from({ length: s.width }, () => ({ text: ' ' }))
  const drops = Math.max(1, Math.floor(s.width / RAIN_SPACING))
  const fall = (s.elapsed / 1000) * RAIN_SPEED
  Array.from({ length: drops }, (_, i) => i).forEach(i => {
    const x = hash(i * 2 + 1) % s.width
    if (Math.floor(hash(i * 2 + 2) + fall) % s.height === row) cells[x] = { text: '╷', fg: PALETTE.faint }
  })
  return cells
}

const wordColor = (s: Typing, f: Falling): string =>
  f.y >= s.height - DANGER_ROWS ? PALETTE.danger : f.y >= s.height * HURRY_SHARE ? PALETTE.hurry : WORD

/** A word's letters: the typed part of the active one green, the rest bright on a lit band; others by how low they are. */
const wordSpans = (s: Typing, f: Falling, active: Falling | null): Span[] => {
  const typed = f === active ? s.buffer.length : 0
  return [...f.text].map((char, i): Span => {
    if (f !== active) return { text: char, fg: wordColor(s, f) }
    return i < typed ? { text: char, fg: PALETTE.good, bg: PALETTE.faint, bold: true } : { text: char, fg: PALETTE.white, bg: PALETTE.faint, bold: true }
  })
}

/** The burst of a typed word: rays round its points, then sparks scattering wider as it fades. */
const burstRows = (b: Burst): [string, string, string] => {
  const label = `+${b.points}`
  return b.left > BURST_MS / 2 ? ['╲ ┃ ╱', `━ ${label} ━`, '╱ ┃ ╲'] : ['·   ✦   ·', `✦  ${label}  ✦`, '·   ✦   ·']
}

/** Spans laid over `cells` from column `at`, those past the lane left out. */
const overlay = (cells: Span[], at: number, spans: readonly Span[]): Span[] =>
  cells.map((c, x) => (x >= at && x < at + spans.length ? spans[x - at]! : c))

const burstOver = (s: Typing, row: number, cells: Span[]): Span[] => {
  const b = s.burst
  const line = b === null ? undefined : burstRows(b)[row - Math.floor(b.y) + 1]
  if (b === null || line === undefined) return cells
  const center = b.x + Math.floor(b.text.length / 2)
  const at = Math.max(0, Math.min(s.width - line.length, center - Math.floor(line.length / 2)))
  const color = b.left > BURST_MS / 2 ? PALETTE.good : FADING
  return overlay(cells, at, [...line].map((ch): Span => (ch === ' ' ? { text: ' ' } : { text: ch, fg: color, bold: true })))
}

/** One row of the lane: the backdrop, a burst over it, the words still falling over both. */
const laneRow = (s: Typing, row: number, active: Falling | null): Row =>
  pack(
    s.falling
      .filter(w => Math.floor(w.y) === row)
      .reduce((cells, f) => {
        const marked = f === active && f.x > 0 ? overlay(cells, f.x - 1, [{ text: '▸', fg: PALETTE.good, bold: true }]) : cells
        return overlay(marked, f.x, wordSpans(s, f, active))
      }, burstOver(s, row, backdrop(s, row))),
  )

const precisionSpans = (s: Typing): Span[] => {
  const typed = s.hits + s.misses
  if (typed === 0) return [{ text: ' precisione — ', fg: PALETTE.label }]
  const share = s.hits / typed
  const color = share >= PRECISE ? PALETTE.good : share >= SLOPPY ? PALETTE.hurry : PALETTE.danger
  return [{ text: ' precisione ', fg: PALETTE.label }, { text: `${Math.floor(share * 100)}% `, fg: color, bold: true }]
}

/** The multiplier, and a meter filling toward the next one (full at the top). */
const comboSpans = (s: Typing): Span[] => {
  const multiplier = multiplierOf(s.combo)
  const share = multiplier === MAX_MULTIPLIER ? 1 : (s.combo % COMBO_STEP) / COMBO_STEP
  const color = COMBO_COLORS[multiplier - 1]!
  return [{ text: ' combo ', fg: PALETTE.label }, { text: `×${multiplier} `, fg: color, bold: true }, ...meter(share, COMBO_STEP, color), { text: ' ' }]
}

/** An edge of the frame: `left` after its first corner, `right` before the last, dashes between; `right` left out when there is no room. */
const edgeRow = (corners: [string, string], left: Span[], right: Span[], width: number, color: string): Row => {
  // `╭─`, then the room, then `─╮`: as wide as the rows between the sides.
  const room = width - 2
  const shown = widthOf(left) + widthOf(right) + 1 <= room ? right : []
  const head = fitRow(left, Math.min(widthOf(left), room))
  const dashes = room - widthOf(head) - widthOf(shown)
  return pack([{ text: `${corners[0]}─`, fg: color }, ...head, { text: '─'.repeat(dashes), fg: color }, ...shown, { text: `─${corners[1]}`, fg: color }])
}

/** What the bottom edge says: a mistake, the letters typed, the word just typed, the word just lost, or what to do. */
const promptSpans = (s: Typing): Span[] => {
  if (s.errorFor > 0) return [{ text: ' ✗ ', fg: PALETTE.danger, bold: true }, { text: 'nessuna parola inizia così ', fg: PALETTE.danger }]
  if (s.buffer !== '') return [{ text: ' › ', fg: PALETTE.claude, bold: true }, { text: s.buffer, fg: PALETTE.good, bold: true }, { text: '▏', fg: PALETTE.label }, { text: ' ' }]
  if (s.burst !== null) return [{ text: ' ✓ ', fg: PALETTE.good, bold: true }, { text: `${s.burst.text} `, fg: PALETTE.white }, { text: `+${s.burst.points} `, fg: PALETTE.good, bold: true }]
  if (s.lostFor > 0) return [{ text: ' ♥ ', fg: PALETTE.danger, bold: true }, { text: `persa: ${s.lost} `, fg: PALETTE.danger }]
  return [{ text: ' › ', fg: PALETTE.claude, bold: true }, { text: 'scrivi le parole che cadono ', fg: PALETTE.label }]
}

/** How fast the words fall, as a meter warming toward the top speed. */
const speedSpans = (s: Typing): Span[] => {
  const share = (speedAt(s.elapsed) - START_SPEED) / (MAX_SPEED - START_SPEED)
  const color = share > 2 / 3 ? PALETTE.danger : share > 1 / 3 ? PALETTE.hurry : PALETTE.good
  return [{ text: ' velocità ', fg: PALETTE.label }, ...meter(Math.max(0.1, share), 5, color), { text: ' ' }]
}

const frameColor = (s: Typing): string =>
  s.errorFor > 0 || s.lostFor > 0 ? PALETTE.danger : s.burst !== null ? PALETTE.good : PALETTE.frame

/**
 * The lane in a rounded frame: the combo and the precision in its top edge,
 * the letters typed and the speed in its bottom edge; red on a mistake or a
 * lost word, green as a word bursts.
 */
export const drawTyping = (s: Typing): Row[] => {
  const active = activeWord(s)
  const color = frameColor(s)
  const lane = framed(Array.from({ length: s.height }, (_, r) => laneRow(s, r, active)), s.width, { color })
  const top = edgeRow(['╭', '╮'], comboSpans(s), precisionSpans(s), s.width, color)
  const bottom = edgeRow(['╰', '╯'], promptSpans(s), speedSpans(s), s.width, color)
  return [top, ...lane.slice(1, -1), bottom]
}

export const TYPING: GameDef<Typing> = {
  id: 'typing',
  name: 'Pioggia di parole',
  keys: 'scrivi le parole · ⌫ corregge · Invio o spazio ricomincia la parola',
  isTyping: true,
  create: newTyping,
  key: keyTyping,
  tick: tickTyping,
  isOver: s => s.isOver,
  score: s => s.score,
  draw: drawTyping,
  status: typingStatus,
}
