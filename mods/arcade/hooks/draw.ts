import type { Dino } from './games/dino'
import { DINO_X } from './games/dino'
import type { Game2048 } from './games/g2048'
import type { Snake } from './games/snake'

import type { Row, Span } from './games/types'

export type { Row, Span }

const SNAKE_HEAD = '#4ade80'
const SNAKE_BODY = '#16a34a'
const FRUIT = '#ef4444'
const FRAME = '#6b7280'
/** Claude's orange. */
export const MASCOT = '#d97757'
const CACTUS = '#15803d'
const GROUND = '#a8a29e'
const DARK_TEXT = '#1a1a1a'
const LIGHT_TEXT = '#f9f6f2'

/** Merges neighbouring spans drawn alike, so a row is a few Texts, not one per cell. */
export const pack = (spans: Span[]): Row =>
  spans.reduce<Row>((row, span) => {
    const last = row[row.length - 1]
    const isAlike = last !== undefined && last.fg === span.fg && last.bg === span.bg && last.bold === span.bold
    return isAlike ? [...row.slice(0, -1), { ...last, text: last.text + span.text }] : [...row, span]
  }, [])

/** The board in a frame, each cell two columns wide so it looks square. */
export const drawSnake = (s: Snake): Row[] => {
  const head = s.body[0]
  const cell = (x: number, y: number): Span => {
    if (head !== undefined && head.x === x && head.y === y) return { text: '  ', bg: s.isOver ? FRUIT : SNAKE_HEAD }
    if (s.body.some(p => p.x === x && p.y === y)) return { text: '  ', bg: SNAKE_BODY }
    if (s.food.x === x && s.food.y === y) return { text: '● ', fg: FRUIT, bold: true }
    return { text: '  ' }
  }
  const edge = (left: string, right: string): Row => [{ text: `${left}${'─'.repeat(s.width * 2)}${right}`, fg: FRAME }]
  const rows = Array.from({ length: s.height }, (_, y) =>
    pack([{ text: '│', fg: FRAME }, ...Array.from({ length: s.width }, (_, x) => cell(x, y)), { text: '│', fg: FRAME }]),
  )
  return [edge('┌', '┐'), ...rows, edge('└', '┘')]
}

const TILE_WIDTH = 7
const TILE_COLORS: Record<number, string> = {
  0: '#3f3a35',
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
  2048: '#edc22e',
}
const BIG_TILE = '#3c3a32'

const centered = (text: string, width: number) => {
  const left = Math.floor((width - text.length) / 2)
  return ' '.repeat(Math.max(0, left)) + text + ' '.repeat(Math.max(0, width - left - text.length))
}

/** The grid as tiles three rows tall, the number in the middle one. */
export const draw2048 = (g: Game2048): Row[] =>
  g.grid.flatMap(row =>
    [0, 1, 2].map(line =>
      pack(
        row.flatMap((n, c): Span[] => {
          const bg = TILE_COLORS[n] ?? BIG_TILE
          const label = line === 1 && n !== 0 ? String(n) : ''
          const tile: Span = { text: centered(label, TILE_WIDTH), bg, fg: n <= 4 ? DARK_TEXT : LIGHT_TEXT, bold: true }
          return c === 0 ? [tile] : [{ text: ' ' }, tile]
        }),
      ),
    ),
  )

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

/** The mascot, the cacti and the ground: the bottom of the sky is row DINO_SKY - 1. */
export const drawDino = (d: Dino): Row[] => {
  const lift = Math.round(d.y)
  const sprite = mascotRows(d)
  const cells = (row: number): Span[] => {
    // `row` counts up from the ground: 0 is the row just above it.
    const line = sprite[sprite.length - 1 - (row - lift)]
    return Array.from({ length: d.width }, (_, x): Span => {
      const glyph = line?.[x - DINO_X]
      if (glyph !== undefined && glyph !== ' ') return { text: glyph, fg: d.isOver ? FRUIT : MASCOT }
      const isCactus = d.cacti.some(c => x >= Math.round(c.x) && x < Math.round(c.x) + c.width && row < c.height)
      return isCactus ? { text: '█', fg: CACTUS } : { text: ' ' }
    })
  }
  const sky = Array.from({ length: DINO_SKY }, (_, i) => pack(cells(DINO_SKY - 1 - i)))
  const ground: Row = [{ text: '▔'.repeat(d.width), fg: GROUND }]
  return [...sky, ground]
}
