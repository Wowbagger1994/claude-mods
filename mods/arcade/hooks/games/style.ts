import type { Row, Span } from './types'

/**
 * The arcade's look, shared by every game: dim rounded frames with a title cut
 * into the top edge, one accent per game, and the same colours for the same
 * meaning (good, hurry, danger) everywhere.
 */
export const PALETTE = {
  /** Frames and empty cells, the quietest. */
  frame: '#3f3f46',
  /** Labels and keys cut into a frame. */
  label: '#a1a1aa',
  /** Faint marks on an empty board. */
  faint: '#27272a',
  /** Claude's orange: the arcade's own accent. */
  claude: '#d97757',
  good: '#22c55e',
  hurry: '#f59e0b',
  danger: '#ef4444',
  purple: '#c084fc',
  sky: '#38bdf8',
  white: '#fafafa',
} as const

/** Merges neighbouring spans drawn alike, so a row is a few Texts, not one per cell. */
export const pack = (spans: Span[]): Row =>
  spans.reduce<Row>((row, span) => {
    const last = row[row.length - 1]
    const isAlike = last !== undefined && last.fg === span.fg && last.bg === span.bg && last.bold === span.bold
    return isAlike ? [...row.slice(0, -1), { ...last, text: last.text + span.text }] : [...row, span]
  }, [])

/** Characters a row draws across, counted as the terminal does for one-column glyphs. */
export const widthOf = (row: Row): number => row.reduce((n, s) => n + [...s.text].length, 0)

/** The row padded with blanks to `width`, or cut to it. */
export const fitRow = (row: Row, width: number): Row => {
  const out: Span[] = []
  let left = width
  for (const span of row) {
    if (left <= 0) break
    const chars = [...span.text]
    out.push(chars.length <= left ? span : { ...span, text: chars.slice(0, left).join('') })
    left -= Math.min(left, chars.length)
  }
  return left > 0 ? [...out, { text: ' '.repeat(left) }] : out
}

export type FrameOptions = {
  /** Cut into the top edge, after `╭─ `. */
  title?: string
  /** The frame's colour; dim by default. */
  color?: string
  titleColor?: string
  /** Spans cut into the bottom edge, after `╰─`. */
  footer?: Span[]
}

/**
 * Rows wrapped in a rounded frame, each padded to `width` inside it:
 *
 *   ╭─ Titolo ───╮
 *   │ …          │
 *   ╰────────────╯
 */
export const framed = (rows: readonly Row[], width: number, o: FrameOptions = {}): Row[] => {
  const color = o.color ?? PALETTE.frame
  const title = o.title === undefined ? '' : ` ${o.title} `
  const titleRoom = Math.min([...title].length, Math.max(0, width - 1))
  const top: Row = [
    { text: '╭─', fg: color },
    ...(titleRoom > 0 ? [{ text: [...title].slice(0, titleRoom).join(''), fg: o.titleColor ?? PALETTE.label, bold: true }] : []),
    { text: `${'─'.repeat(Math.max(0, width - 1 - titleRoom))}╮`, fg: color },
  ]
  const footer = fitRow(o.footer ?? [], Math.max(0, width - 1)).map(s => (s.fg === undefined && s.text.trim() === '' ? { ...s, text: '─'.repeat([...s.text].length), fg: color } : s))
  const bottom: Row = [{ text: '╰─', fg: color }, ...footer, { text: '╯', fg: color }]
  const side: Span = { text: '│', fg: color }
  return [pack(top), ...rows.map(r => pack([side, ...fitRow(r, width), side])), pack(bottom)]
}

/** A meter `cells` long, `share` (0 to 1) of it full: `▰▰▰▱▱`. */
export const meter = (share: number, cells: number, color: string): Span[] => {
  const full = Math.max(0, Math.min(cells, Math.ceil(cells * share)))
  return [
    { text: '▰'.repeat(full), fg: color },
    { text: '▱'.repeat(cells - full), fg: PALETTE.frame },
  ]
}

/** Blanks before a block `width` wide, to center it in `columns`. */
export const centerPad = (columns: number, width: number): Span => ({ text: ' '.repeat(Math.max(0, Math.floor((columns - width) / 2))) })
