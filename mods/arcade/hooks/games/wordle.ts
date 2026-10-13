import type { Rng } from './rng'
import { nextInt } from './rng'
import { centerPad, fitRow, framed, pack, PALETTE, widthOf } from './style'
import type { GameContext, GameDef, Row, Span } from './types'

/** Where a letter of a guess stands: in its place, elsewhere in the word, not in it. */
export type Mark = 'hit' | 'near' | 'miss'
export type Guess = { word: string; marks: readonly Mark[] }
/** Where the word to guess came from: Claude's code or the fallback list. */
export type Source = 'code' | 'vocab'
/** Guessing; the word just solved (the next comes soon); the word missed (the game ends). */
export type Phase = 'guessing' | 'solved' | 'lost'

export type Wordle = {
  columns: number
  rows: number
  target: string
  source: Source
  guesses: readonly Guess[]
  /** The letters typed toward the next guess. */
  input: string
  phase: Phase
  /** Words played so far, this one included. */
  round: number
  /** Points of the word just solved. */
  gained: number
  score: number
  /** Milliseconds since the last guess went in: its tiles turn one by one. */
  flipMs: number
  /** Milliseconds the warning for a short guess still shows. */
  shakeMs: number
  codeWords: readonly string[]
  vocabWords: readonly string[]
  /** Words already played, not picked again until every word was. */
  used: readonly string[]
  rng: Rng
}

export const WORD_LENGTH = 5
export const MAX_TRIES = 6
/** A word solved in `n` tries scores (MAX_TRIES + 1 − n) × this. */
export const POINTS_PER_TRY = 10
/** Each tile of a guess takes this long to turn; the solved word shows this long before the next. */
export const FLIP_MS = 150
export const FLIP_TOTAL_MS = FLIP_MS * WORD_LENGTH
export const CELEBRATE_MS = 2000
export const SHAKE_MS = 450
const SHAKE_STEP_MS = 75

/** Common five-letter words of programming, for when Claude's code gives few. */
export const FALLBACK_WORDS: readonly string[] = [
  'array', 'async', 'await', 'class', 'const', 'catch', 'fetch', 'false', 'index', 'input',
  'merge', 'parse', 'print', 'query', 'react', 'regex', 'shift', 'slice', 'split', 'stack',
  'state', 'store', 'style', 'super', 'table', 'throw', 'token', 'value', 'while', 'yield',
  'cache', 'chunk', 'clone', 'event', 'frame', 'patch', 'proxy', 'queue', 'range', 'route',
  'scope', 'shell', 'debug', 'build', 'break', 'final', 'float', 'model', 'mount', 'error',
  'label', 'match', 'union', 'write', 'close', 'start', 'timer', 'width', 'delay', 'entry',
  'group', 'layer', 'local', 'logic', 'lexer', 'macro', 'mutex', 'graph', 'bytes', 'trait',
  'tuple', 'block', 'field', 'flags', 'level', 'limit', 'order', 'panic', 'reset', 'scale',
  'sleep', 'spawn', 'trace', 'types', 'valid', 'watch', 'click', 'color', 'hooks', 'props',
]

/** The parts of a name, cut at camelCase humps, underscores and digits: `fetchUserData` → fetch, user, data. */
export const partsOf = (name: string): string[] =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[^A-Za-z]+/)
    .map(p => p.toLowerCase())

/** Five-letter words in the names of Claude's code, newest first, each once. */
export const codeWordsOf = (names: readonly string[]): string[] => {
  const found = names.flatMap(n => [n.toLowerCase(), ...partsOf(n)])
  return [...new Set(found.filter(w => /^[a-z]{5}$/.test(w)))]
}

type Picked = { target: string; source: Source; used: readonly string[]; rng: Rng }

/** A word not played yet: one of Claude's code while there are any, then the fallback; all played, round again. */
export const pickWord = (code: readonly string[], vocab: readonly string[], used: readonly string[], rng: Rng): Picked => {
  const freshCode = code.filter(w => !used.includes(w))
  const freshVocab = vocab.filter(w => !used.includes(w))
  if (freshCode.length === 0 && freshVocab.length === 0) return pickWord(code, vocab, [], rng)
  const [choices, source]: [readonly string[], Source] = freshCode.length > 0 ? [freshCode, 'code'] : [freshVocab, 'vocab']
  const [i, next] = nextInt(rng, choices.length)
  const target = choices[i]!
  return { target, source, used: [...used, target], rng: next }
}

/**
 * The marks of a guess: first the letters in their place, then, left to
 * right, a letter elsewhere in the word only while that word has some of it
 * not yet matched (so `speed` against `abide` gets one amber `e`, not two).
 */
export const marksOf = (guess: string, target: string): Mark[] => {
  const g = [...guess]
  const t = [...target]
  const spare = t.reduce<Record<string, number>>((acc, ch, i) => (g[i] === ch ? acc : { ...acc, [ch]: (acc[ch] ?? 0) + 1 }), {})
  return g.reduce<{ marks: Mark[]; spare: Record<string, number> }>(
    (acc, ch, i) => {
      if (t[i] === ch) return { ...acc, marks: [...acc.marks, 'hit'] }
      const left = acc.spare[ch] ?? 0
      return left > 0 ? { marks: [...acc.marks, 'near'], spare: { ...acc.spare, [ch]: left - 1 } } : { ...acc, marks: [...acc.marks, 'miss'] }
    },
    { marks: [], spare },
  ).marks
}

export const pointsFor = (tries: number): number => (MAX_TRIES + 1 - tries) * POINTS_PER_TRY

const withWord = (s: Wordle): Wordle => {
  const p = pickWord(s.codeWords, s.vocabWords, s.used, s.rng)
  return { ...s, target: p.target, source: p.source, used: p.used, rng: p.rng, guesses: [], input: '', phase: 'guessing', gained: 0, flipMs: FLIP_TOTAL_MS, shakeMs: 0 }
}

export const newWordle = (ctx: GameContext): Wordle => {
  const codeWords = codeWordsOf(ctx.words)
  return withWord({
    columns: ctx.columns,
    rows: ctx.rows,
    target: '',
    source: 'vocab',
    guesses: [],
    input: '',
    phase: 'guessing',
    round: 1,
    gained: 0,
    score: 0,
    flipMs: FLIP_TOTAL_MS,
    shakeMs: 0,
    codeWords,
    vocabWords: FALLBACK_WORDS.filter(w => !codeWords.includes(w)),
    used: [],
    rng: ctx.rng,
  })
}

const nextWord = (s: Wordle): Wordle => withWord({ ...s, round: s.round + 1 })

export const isFlipDone = (s: Wordle): boolean => s.flipMs >= FLIP_TOTAL_MS

const isLetter = (key: string): boolean => /^[a-zA-Z]$/.test(key)

const typeLetter = (s: Wordle, key: string): Wordle =>
  s.input.length < WORD_LENGTH ? { ...s, input: s.input + key.toLowerCase() } : s

/** Enter: a short guess shakes; a whole one is marked, solving the word or using up a try. */
const submit = (s: Wordle): Wordle => {
  if (s.input.length < WORD_LENGTH) return { ...s, shakeMs: SHAKE_MS }
  const guesses = [...s.guesses, { word: s.input, marks: marksOf(s.input, s.target) }]
  const sent: Wordle = { ...s, guesses, input: '', flipMs: 0, shakeMs: 0 }
  if (s.input === s.target) {
    const gained = pointsFor(guesses.length)
    return { ...sent, phase: 'solved', gained, score: s.score + gained }
  }
  return guesses.length >= MAX_TRIES ? { ...sent, phase: 'lost' } : sent
}

export const keyWordle = (s: Wordle, key: string): Wordle => {
  if (s.phase === 'lost') return s
  if (s.phase === 'solved') {
    // Once the tiles have turned, Enter or a letter goes on to the next word at once.
    if (!isFlipDone(s)) return s
    if (key === 'return') return nextWord(s)
    return isLetter(key) ? typeLetter(nextWord(s), key) : s
  }
  if (key === 'return') return submit(s)
  if (key === 'backspace' || key === 'delete') return { ...s, input: s.input.slice(0, -1) }
  return isLetter(key) ? typeLetter(s, key) : s
}

/** Time passing: the tiles turn, the warning fades, a solved word gives way to the next. */
export const tickWordle = (s: Wordle, ms: number): Wordle => {
  const flipMs = Math.min(s.flipMs + ms, FLIP_TOTAL_MS + CELEBRATE_MS)
  const next = { ...s, flipMs, shakeMs: Math.max(0, s.shakeMs - ms) }
  return next.phase === 'solved' && flipMs >= FLIP_TOTAL_MS + CELEBRATE_MS ? nextWord(next) : next
}

/** The word is missed once the last guess has turned: then the arcade shows the end. */
export const isOverWordle = (s: Wordle): boolean => s.phase === 'lost' && isFlipDone(s)

export const wordleStatus = (s: Wordle): string => `parola ${s.round} · tentativi ${s.guesses.length}/${MAX_TRIES}`

/** Tiles of each guess already turned: all but the last guess's, which turn one by one. */
export const turnedOf = (s: Wordle, row: number): number =>
  row < s.guesses.length - 1 ? WORD_LENGTH : Math.min(WORD_LENGTH, Math.floor(s.flipMs / FLIP_MS))

const RANK: Record<Mark, number> = { miss: 1, near: 2, hit: 3 }

/** The best each letter did in the tiles turned so far: what the keyboard map shows. */
export const lettersOf = (s: Wordle): Readonly<Record<string, Mark>> =>
  s.guesses.reduce<Record<string, Mark>>(
    (acc, g, row) =>
      [...g.word].slice(0, turnedOf(s, row)).reduce((a, ch, i) => {
        const mark = g.marks[i]!
        return a[ch] !== undefined && RANK[a[ch]!] >= RANK[mark] ? a : { ...a, [ch]: mark }
      }, acc),
    {},
  )

// ── Drawing ─────────────────────────────────────────────────────────────────

const TILE: Record<Mark, string> = { hit: '#16a34a', near: '#d97706', miss: '#3f3f46' }
const TYPED = '#52525b'
const SPENT = '#52525b'
const KEY_IDLE = '#27272a'
const KEYBOARD = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']
const SOURCE_TEXT: Record<Source, string> = { code: 'dal tuo codice', vocab: 'dal vocabolario' }
/** The widest the frame's inside grows; room each side of the grid for the `›` and the `+60`. */
const MAX_INNER = 46
const GRID_SIDE = 4
const FRAME_ROWS = 2
const KEYBOARD_ROWS = KEYBOARD.length

/** How the board is laid out: tile size, a blank between guess rows, blanks around the note. */
type Layout = { tileH: 1 | 3; tileW: 3 | 5; rowGap: 0 | 1; isSpaced: boolean; keyGap: 0 | 1; inner: number }

const gridWidthOf = (tileW: number) => tileW * WORD_LENGTH + (WORD_LENGTH - 1)
type Shape = Pick<Layout, 'tileH' | 'rowGap' | 'isSpaced'>
/** Blanks around the note when spaced: above the grid, above the note, above the keyboard. */
const SPACER_ROWS = 3
const NOTE_ROWS = 1

export const heightOf = (l: Shape): number =>
  FRAME_ROWS + l.tileH * MAX_TRIES + l.rowGap * (MAX_TRIES - 1) + (l.isSpaced ? SPACER_ROWS : 0) + NOTE_ROWS + KEYBOARD_ROWS

/** From the roomiest to the most compact: tall tiles, spaced rows, blanks around the note, then nothing spare. */
const SHAPES: readonly Shape[] = [
  { tileH: 3, rowGap: 0, isSpaced: true },
  { tileH: 1, rowGap: 1, isSpaced: true },
  { tileH: 1, rowGap: 0, isSpaced: true },
  { tileH: 1, rowGap: 0, isSpaced: false },
]

export const layoutOf = (columns: number, rows: number): Layout => {
  const inner = Math.max(1, Math.min(MAX_INNER, columns - 2))
  const tileW = inner >= gridWidthOf(5) + GRID_SIDE * 2 ? 5 : 3
  const fits = SHAPES.filter(l => heightOf(l) <= rows && (l.tileH === 1 || tileW === 5))
  const shape = fits[0] ?? SHAPES[SHAPES.length - 1]!
  const keyGap = inner >= KEYBOARD[0]!.length * 4 - 1 ? 1 : 0
  return { ...shape, tileW, keyGap, inner }
}

const centered = (text: string, width: number): string => {
  const left = Math.max(0, Math.floor((width - text.length) / 2))
  return ' '.repeat(left) + text + ' '.repeat(Math.max(0, width - left - text.length))
}

/** A tile's lines: tall ones have a half-block lip above and below; flat ones are the middle line alone. */
const solidTile = (l: Layout, letter: string, color: string, fg: string): Span[] => {
  const middle: Span = { text: centered(letter, l.tileW), fg, bg: color, bold: true }
  return l.tileH === 1 ? [middle] : [{ text: '▄'.repeat(l.tileW), fg: color }, middle, { text: '▀'.repeat(l.tileW), fg: color }]
}

/** A tile turning: seen edge-on, a bar of the colour it is turning to. */
const edgeTile = (l: Layout, color: string): Span[] => {
  const bar: Span = { text: '━'.repeat(l.tileW), fg: color, bold: true }
  const blank: Span = { text: ' '.repeat(l.tileW) }
  return l.tileH === 1 ? [bar] : [blank, bar, blank]
}

/** The tiles of one guess row, each as its lines. */
const tilesOf = (s: Wordle, l: Layout, row: number): Span[][] =>
  Array.from({ length: WORD_LENGTH }, (_, i) => {
    const guess = s.guesses[row]
    if (guess !== undefined) {
      const turned = turnedOf(s, row)
      const color = TILE[guess.marks[i]!]
      if (i < turned) return solidTile(l, guess.word[i]!.toUpperCase(), color, PALETTE.white)
      return i === turned ? edgeTile(l, color) : solidTile(l, guess.word[i]!.toUpperCase(), TYPED, PALETTE.white)
    }
    const isCurrent = row === s.guesses.length && s.phase === 'guessing'
    if (!isCurrent) return solidTile(l, '', PALETTE.faint, PALETTE.faint)
    if (i < s.input.length) return solidTile(l, s.input[i]!.toUpperCase(), TYPED, PALETTE.white)
    return solidTile(l, i === s.input.length ? '_' : '', PALETTE.faint, PALETTE.claude)
  })

/** The current row shakes side to side while the warning shows. */
const shakeOf = (s: Wordle, row: number): number =>
  s.shakeMs > 0 && row === s.guesses.length ? (Math.floor(s.shakeMs / SHAKE_STEP_MS) % 2 === 0 ? 1 : -1) : 0

/** Beside a guess row: the `›` of the current row, the `+N` of the word solved, the `✗` of the last miss. */
const marksBeside = (s: Wordle, row: number): [Span, Span] => {
  const isCurrent = row === s.guesses.length && s.phase === 'guessing'
  const isLast = row === s.guesses.length - 1 && isFlipDone(s)
  const left: Span = isCurrent ? { text: '› ', fg: PALETTE.claude, bold: true } : { text: '  ' }
  if (isLast && s.phase === 'solved') return [left, { text: ` +${s.gained}`, fg: PALETTE.good, bold: true }]
  if (isLast && s.phase === 'lost') return [left, { text: ' ✗', fg: PALETTE.danger, bold: true }]
  return [left, { text: '' }]
}

const gridRows = (s: Wordle, l: Layout): Row[] => {
  const gridW = gridWidthOf(l.tileW)
  const base = Math.floor((l.inner - gridW) / 2)
  return Array.from({ length: MAX_TRIES }, (_, row) => {
    const tiles = tilesOf(s, l, row)
    const left = base + shakeOf(s, row)
    const [marker, after] = marksBeside(s, row)
    const middle = Math.floor(l.tileH / 2)
    const lines = Array.from({ length: l.tileH }, (_, line): Row => {
      const isMiddle = line === middle
      const head: Span[] = isMiddle ? [{ text: ' '.repeat(Math.max(0, left - 2)) }, marker] : [{ text: ' '.repeat(Math.max(0, left)) }]
      const cells = tiles.flatMap((t, i) => (i === 0 ? [t[line]!] : [{ text: ' ' }, t[line]!]))
      return pack([...head, ...cells, ...(isMiddle ? [after] : [])])
    })
    return row < MAX_TRIES - 1 && l.rowGap === 1 ? [...lines, []] : lines
  }).flat()
}

/** A word as small tiles of one colour, for the note: ` T O T A L `. */
const wordTiles = (word: string, color: string): Span => ({ text: ` ${[...word.toUpperCase()].join(' ')} `, fg: PALETTE.white, bg: color, bold: true })

/** The line under the grid: the word solved or missed and where it came from, a warning, or the tries left. */
export const noteOf = (s: Wordle): Span[] => {
  const label = (text: string): Span => ({ text, fg: PALETTE.label })
  if (s.phase === 'solved' && isFlipDone(s)) {
    return [{ text: '✓ ', fg: PALETTE.good, bold: true }, wordTiles(s.target, TILE.hit), label(` ${SOURCE_TEXT[s.source]} `), { text: `+${s.gained}`, fg: PALETTE.good, bold: true }]
  }
  if (s.phase === 'lost' && isFlipDone(s)) {
    return [{ text: '✗ era ', fg: PALETTE.danger, bold: true }, wordTiles(s.target, PALETTE.danger), label(` ${SOURCE_TEXT[s.source]}`)]
  }
  if (s.phase !== 'guessing') return []
  if (s.shakeMs > 0) return [{ text: `✗ servono ${WORD_LENGTH} lettere`, fg: PALETTE.danger, bold: true }]
  const left = MAX_TRIES - s.guesses.length
  if (s.guesses.length === 0) return [label('indovina la parola di 5 lettere')]
  if (left === 1) return [{ text: 'ultimo tentativo!', fg: PALETTE.danger, bold: true }]
  return [{ text: `ancora ${left} tentativi`, fg: left > 2 ? PALETTE.label : PALETTE.hurry }]
}

/** A key of the map, coloured by the best its letter did. */
const keySpan = (letter: string, mark: Mark | undefined): Span => {
  const text = ` ${letter.toUpperCase()} `
  if (mark === undefined) return { text, fg: PALETTE.label, bg: KEY_IDLE }
  return mark === 'miss' ? { text, fg: SPENT } : { text, fg: PALETTE.white, bg: TILE[mark], bold: true }
}

const keyboardRows = (s: Wordle, l: Layout): Row[] => {
  const letters = lettersOf(s)
  return KEYBOARD.map(line => {
    const keys = [...line].flatMap((ch, i) => (i > 0 && l.keyGap > 0 ? [{ text: ' ' }, keySpan(ch, letters[ch])] : [keySpan(ch, letters[ch])]))
    return pack([centerPad(l.inner, widthOf(keys)), ...keys])
  })
}

const frameColor = (s: Wordle): string => {
  if (s.shakeMs > 0) return PALETTE.danger
  if (!isFlipDone(s)) return PALETTE.frame
  return s.phase === 'solved' ? PALETTE.good : s.phase === 'lost' ? PALETTE.danger : PALETTE.frame
}

/**
 * The 6×5 grid of tiles in a rounded frame, a note under it, the keyboard map
 * at the bottom; the frame turns green on a word solved, red on a short guess
 * or the word missed. Tall tiles, spaced rows and blanks when there is room.
 */
export const drawWordle = (s: Wordle): Row[] => {
  const l = layoutOf(s.columns, s.rows)
  const note = noteOf(s)
  const noteRow = pack([centerPad(l.inner, widthOf(note)), ...note])
  const blank: Row[] = l.isSpaced ? [[]] : []
  const body = [...blank, ...gridRows(s, l), ...blank, noteRow, ...blank, ...keyboardRows(s, l)]
  const color = frameColor(s)
  const titleColor = color === PALETTE.frame ? PALETTE.label : color
  const frame = framed(body, l.inner, { title: `parola ${s.round}`, color, titleColor })
  const pad = centerPad(s.columns, l.inner + 2)
  return frame.map(r => {
    const row = pad.text === '' ? r : pack([pad, ...r])
    return widthOf(row) > s.columns ? fitRow(row, s.columns) : row
  })
}

export const WORDLE: GameDef<Wordle> = {
  id: 'wordle',
  name: 'Wordle del codice',
  keys: 'scrivi 5 lettere · Invio prova · ⌫ cancella',
  isTyping: true,
  create: newWordle,
  key: keyWordle,
  tick: tickWordle,
  isOver: isOverWordle,
  score: s => s.score,
  draw: drawWordle,
  status: wordleStatus,
}
