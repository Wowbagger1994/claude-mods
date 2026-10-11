import { pack } from '../draw'
import type { Rng } from './rng'
import { nextInt } from './rng'
import type { GameContext, GameDef, Row, Span } from './types'

/** A word on its way down: its left column and its row, fractional while it falls. */
export type Falling = { text: string; x: number; y: number }

export type Typing = {
  width: number
  /** Rows the words fall through; the separator and the buffer line sit below. */
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
/** Rows under the falling area: the separator and the buffer line. */
const FOOTER_ROWS = 2
const MIN_WIDTH = 20
const MIN_HEIGHT = 6

const TYPED = '#d97757'
const WORD = '#e5e7eb'
const DANGER = '#ef4444'
const FRAME = '#6b7280'
const HINT = '#9ca3af'

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
    width: Math.max(MIN_WIDTH, ctx.columns),
    height: Math.max(MIN_HEIGHT, ctx.rows - FOOTER_ROWS),
    falling: [],
    buffer: '',
    score: 0,
    lives: LIVES,
    combo: 0,
    elapsed: 0,
    sinceSpawn: 0,
    errorFor: 0,
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

const mistake = (s: Typing): Typing => ({ ...s, buffer: '', combo: 0, errorFor: ERROR_FLASH_MS })

/** One character typed: the word grows, a whole word explodes, a letter no word begins with is a mistake. */
const typeChar = (s: Typing, char: string): Typing => {
  const buffer = s.buffer + char
  const matching = s.falling.filter(f => f.text.startsWith(buffer))
  if (matching.length === 0) return mistake(s)
  const done = matching.filter(f => f.text === buffer).reduce<Falling | null>((low, f) => (low === null || f.y > low.y ? f : low), null)
  if (done === null) return { ...s, buffer }
  return {
    ...s,
    buffer: '',
    falling: s.falling.filter(f => f !== done),
    score: s.score + done.text.length * multiplierOf(s.combo),
    combo: s.combo + 1,
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
  const after: Typing = {
    ...s,
    falling,
    lives,
    combo: landed.length > 0 ? 0 : s.combo,
    buffer: isStillTyping ? s.buffer : '',
    elapsed: s.elapsed + ms,
    sinceSpawn: s.sinceSpawn + ms,
    errorFor: Math.max(0, s.errorFor - ms),
    isOver: lives === 0,
  }
  if (after.isOver || after.sinceSpawn < intervalAt(s.elapsed)) return after
  return spawn({ ...after, sinceSpawn: 0 })
}

export const typingStatus = (s: Typing): string =>
  `${'♥'.repeat(s.lives)}${'♡'.repeat(LIVES - s.lives)} · combo ×${multiplierOf(s.combo)}`

/** One falling row: each word at its column, the typed part of the active one in Claude's orange. */
const drawRow = (s: Typing, row: number, active: Falling | null): Row => {
  const cells: Span[] = Array.from({ length: s.width }, () => ({ text: ' ' }))
  for (const f of s.falling.filter(w => Math.floor(w.y) === row)) {
    const typed = f === active ? s.buffer.length : 0
    const isDanger = f.y >= s.height - DANGER_ROWS
    ;[...f.text].forEach((char, i) => {
      const at = f.x + i
      if (at < 0 || at >= s.width) return
      cells[at] = i < typed ? { text: char, fg: TYPED, bold: true } : { text: char, fg: isDanger ? DANGER : WORD }
    })
  }
  return pack(cells)
}

const bufferLine = (s: Typing): Row => {
  if (s.errorFor > 0) return [{ text: '✗ ', fg: DANGER, bold: true }, { text: 'nessuna parola inizia così', fg: DANGER }]
  if (s.buffer === '') return [{ text: '› ', fg: TYPED, bold: true }, { text: 'scrivi le parole che cadono', fg: HINT }]
  return [{ text: '› ', fg: TYPED, bold: true }, { text: s.buffer, fg: TYPED, bold: true }, { text: '▏', fg: HINT }]
}

export const drawTyping = (s: Typing): Row[] => {
  const active = activeWord(s)
  const rows = Array.from({ length: s.height }, (_, r) => drawRow(s, r, active))
  return [...rows, [{ text: '─'.repeat(s.width), fg: FRAME }], bufferLine(s)]
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
