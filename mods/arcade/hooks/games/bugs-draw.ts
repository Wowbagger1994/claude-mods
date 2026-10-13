import { pack } from './style'
import type { Bug, Bugs } from './bugs'
import { ROOMY_ROWS, ROUND_MS } from './bugs'
import type { Row, Span } from './types'

/** Colours of a bug as its life runs out, of the frames, of a hit and a miss. */
const FRESH = '#c084fc'
const HURRY = '#f59e0b'
const ESCAPING = '#ef4444'
const HIT = '#22c55e'
const MISS = '#ef4444'
const EYES = '#fafafa'
const FRAME = '#3f3f46'
const KEY = '#a1a1aa'
const DOT = '#27272a'
const BAR_EMPTY = '#3f3f46'

/** The widest and narrowest inside of a cell; the gap between cells. */
const MAX_INNER = 11
const MIN_INNER = 9
const GAP = 1
/** A bug's legs change step this often. */
const STEP_MS = 160
const KEYPAD = [
  [7, 8, 9],
  [4, 5, 6],
  [1, 2, 3],
]

/**
 * A bug, nine columns by three rows, in two steps of its legs. `B` is its body,
 * `E` an eye, anything else drawn as is in the bug's colour.
 */
const BUG_STEPS: readonly (readonly string[])[] = [
  ['  ╲▗▄▖╱  ', ' ━▐EBE▌━ ', '  ╱▝▀▘╲  '],
  ['  ╱▗▄▖╲  ', ' ╺▐EBE▌╸ ', '  ╲▝▀▘╱  '],
]
/** The bug squashed, as a hit shows it. */
const SPLAT = ['  ╲ ┃ ╱  ', ' ━━ ✸ ━━ ', '  ╱ ┃ ╲  ']

/** How far a bug is through its life, 0 to 1. */
const spent = (b: Bug) => Math.min(1, b.age / b.life)
const colorOf = (b: Bug) => (spent(b) > 2 / 3 ? ESCAPING : spent(b) > 1 / 3 ? HURRY : FRESH)

const centered = (text: string, width: number) => {
  const left = Math.max(0, Math.floor((width - [...text].length) / 2))
  return ' '.repeat(left) + text + ' '.repeat(Math.max(0, width - left - [...text].length))
}

/** One row of the bug's art, its eyes white on its body. */
const bugSpans = (art: string, color: string, inner: number): Span[] => {
  const line = centered(art, inner)
  return [...line].map((ch): Span =>
    ch === 'E' ? { text: '●', fg: EYES, bg: color, bold: true } : ch === 'B' ? { text: '█', fg: color } : { text: ch, fg: color, bold: true },
  )
}

/** The rows inside a cell: `tall` cells hold three, short ones the bug's middle row. */
const insideOf = (g: Bugs, cell: number, inner: number, isTall: boolean): Span[][] => {
  const pick = (rows: readonly string[]) => (isTall ? rows : [rows[1]!])
  const flash = g.flash?.cell === cell ? g.flash : null
  if (flash?.isHit) return pick(SPLAT).map(r => [{ text: centered(r, inner), fg: HIT, bold: true }])
  if (flash !== null) return pick(['', '✗ mancato', '']).map(r => [{ text: centered(r, inner), fg: MISS, bold: true }])
  const bug = g.bugs.find(b => b.cell === cell)
  if (bug === undefined) return pick(['', '·', '']).map(r => [{ text: centered(r, inner), fg: DOT }])
  const step = BUG_STEPS[Math.floor(bug.age / STEP_MS) % BUG_STEPS.length]!
  return pick(step).map(r => bugSpans(r, colorOf(bug), inner))
}

/** The top edge, its key cut into it: `╭─ 7 ──────╮`. */
const topOf = (cell: number, inner: number, color: string, isLit: boolean): Span[] => [
  { text: '╭─', fg: color },
  { text: ` ${cell} `, fg: isLit ? color : KEY, bold: true },
  { text: `${'─'.repeat(inner - 4)}╮`, fg: color },
]

/** The bottom edge: the life a bug has left, the points a hit made, or a plain line. */
const bottomOf = (g: Bugs, cell: number, inner: number, color: string): Span[] => {
  const flash = g.flash?.cell === cell ? g.flash : null
  const bug = g.bugs.find(b => b.cell === cell)
  const label = flash?.isHit ? ` +${flash.points} ` : null
  if (label !== null) {
    const left = Math.floor((inner - label.length) / 2)
    return [
      { text: `╰${'─'.repeat(left)}`, fg: color },
      { text: label, fg: HIT, bold: true },
      { text: `${'─'.repeat(inner - left - label.length)}╯`, fg: color },
    ]
  }
  if (flash !== null || bug === undefined) return [{ text: `╰${'─'.repeat(inner)}╯`, fg: color }]
  const cells = inner - 2
  const full = Math.ceil(cells * (1 - spent(bug)))
  return [
    { text: '╰─', fg: color },
    { text: '▰'.repeat(full), fg: colorOf(bug) },
    { text: '▱'.repeat(cells - full), fg: BAR_EMPTY },
    { text: '─╯', fg: color },
  ]
}

const frameColor = (g: Bugs, cell: number): string => {
  const flash = g.flash?.cell === cell ? g.flash : null
  if (flash !== null) return flash.isHit ? HIT : MISS
  const bug = g.bugs.find(b => b.cell === cell)
  return bug === undefined ? FRAME : colorOf(bug)
}

/** A cell, framed, row by row. */
const cellRows = (g: Bugs, cell: number, inner: number, isTall: boolean): Span[][] => {
  const color = frameColor(g, cell)
  const isLit = color !== FRAME
  return [
    topOf(cell, inner, color, isLit),
    ...insideOf(g, cell, inner, isTall).map(r => [{ text: '│', fg: color }, ...r, { text: '│', fg: color }]),
    bottomOf(g, cell, inner, color),
  ]
}

/** The round's time as a bar across the grid, green, then amber, then red. */
const timeBar = (g: Bugs, width: number): Span[] => {
  const label = ` ${Math.ceil(g.timeLeft / 1000)} s`
  const cells = Math.max(1, width - label.length - 2)
  const left = g.timeLeft / ROUND_MS
  const full = Math.ceil(cells * left)
  const color = left > 1 / 2 ? HIT : left > 1 / 5 ? HURRY : ESCAPING
  return [
    { text: '▕', fg: FRAME },
    { text: '█'.repeat(full), fg: color },
    { text: '░'.repeat(cells - full), fg: BAR_EMPTY },
    { text: '▏', fg: FRAME },
    { text: label, fg: color, bold: true },
  ]
}

/**
 * The 3×3 grid numbered as the keypad, centered in the room: with room, tall
 * cells under the time bar; with little, short ones and no bar.
 */
export const drawBugs = (g: Bugs): Row[] => {
  const inner = Math.max(MIN_INNER, Math.min(MAX_INNER, Math.floor((g.columns - GAP * 2) / 3) - 2))
  const width = (inner + 2) * 3 + GAP * 2
  const isTall = g.rows >= ROOMY_ROWS
  const pad: Span = { text: ' '.repeat(Math.max(0, Math.floor((g.columns - width) / 2))) }
  const grid = KEYPAD.flatMap(cells => {
    const columns = cells.map(cell => cellRows(g, cell, inner, isTall))
    return columns[0]!.map((_, line) =>
      pack([pad, ...columns.flatMap((rows, i) => (i === 0 ? rows[line]! : [{ text: ' '.repeat(GAP) }, ...rows[line]!]))]),
    )
  })
  return isTall ? [pack([pad, ...timeBar(g, width)]), ...grid] : grid
}
