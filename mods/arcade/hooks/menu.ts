import type { GameId } from '../types'
import { GAMES } from './games/catalog'
import { framed, PALETTE } from './games/style'
import type { Row, Span } from './games/types'

/** Each game's sign in the menu and the header: a one-column icon, its colour, a few words on what to do. */
const LOOKS: Record<GameId, { icon: string; color: string; tagline: string }> = {
  snake: { icon: '●', color: PALETTE.good, tagline: 'mangia e cresci' },
  '2048': { icon: '▦', color: PALETTE.hurry, tagline: 'unisci le tessere' },
  dino: { icon: '▟', color: PALETTE.claude, tagline: 'salta i cactus' },
  flappy: { icon: '▲', color: PALETTE.sky, tagline: 'vola tra i tubi' },
  bugs: { icon: '✸', color: PALETTE.purple, tagline: 'schiaccia i bug' },
  tetris: { icon: '▙', color: '#06b6d4', tagline: 'completa le righe' },
  mines: { icon: '✱', color: PALETTE.danger, tagline: 'evita le mine' },
  typing: { icon: '▍', color: PALETTE.white, tagline: 'scrivi il codice' },
  breakout: { icon: '▬', color: '#f472b6', tagline: 'rompi i mattoni' },
  wordle: { icon: '▣', color: PALETTE.good, tagline: 'indovina la parola' },
  maze: { icon: '▓', color: PALETTE.sky, tagline: 'trova l’uscita' },
}

/** The menu keys after 1–9: letters, but not w and s, which move the cursor. */
const LETTER_KEYS = 'abcdefghijklmnopqrtuvxyz'

/** The key that starts the game at `index` from the menu: 1–9, then a, b, c… */
export const menuKeyOf = (index: number): string => (index < 9 ? String(index + 1) : (LETTER_KEYS[index - 9] ?? ''))

/** The game a menu key starts, by its place; -1 for any other key. */
export const indexOfMenuKey = (key: string, count: number): number => {
  const letter = key.length === 1 ? LETTER_KEYS.indexOf(key) : -1
  const index = /^[1-9]$/.test(key) ? Number(key) - 1 : letter >= 0 ? 9 + letter : -1
  return index < count ? index : -1
}

/** The menu keys in words: `1–8`, `1–9 · a–b`. */
export const menuKeysText = (count: number): string =>
  count <= 9 ? `1–${count}` : `1–9 · ${menuKeyOf(9)}${count > 10 ? `–${menuKeyOf(count - 1)}` : ''}`

export const lookOf = (id: GameId) => LOOKS[id]

/** The widest the menu and the banners get, inside their frame. */
const MAX_INNER = 56
const MIN_INNER = 30
const NAME_WIDTH = 18
const SELECTED_BG = '#3b2a22'

export const innerWidth = (columns: number) => Math.max(MIN_INNER, Math.min(MAX_INNER, columns - 2))

const cut = (text: string, width: number) => ([...text].length <= width ? text : `${[...text].slice(0, Math.max(0, width - 1)).join('')}…`)

/** A game's line: the cursor, its key, icon and name, what to do, its record on the right. */
const gameLine = (index: number, cursor: number, best: number, inner: number): Row => {
  const g = GAMES[index]!
  const look = LOOKS[g.id]
  const isOn = index === cursor
  const bg = isOn ? SELECTED_BG : undefined
  const record = best > 0 ? `★ ${best} ` : '— '
  // Cursor, key and icon take 7 columns; the name gives way to the record in a narrow pane.
  const nameWidth = Math.max(4, Math.min(NAME_WIDTH, inner - 7 - record.length - 1))
  const room = Math.max(0, inner - 7 - nameWidth - record.length)
  const tagline = look.tagline.length <= room - 1 ? look.tagline : ''
  return [
    { text: isOn ? ' ▶ ' : '   ', fg: PALETTE.claude, bg, bold: true },
    { text: `${menuKeyOf(index)} `, fg: isOn ? PALETTE.claude : PALETTE.label, bg, bold: true },
    { text: `${look.icon} `, fg: look.color, bg, bold: true },
    { text: cut(g.name, nameWidth).padEnd(nameWidth + 1), fg: isOn ? PALETTE.white : undefined, bg, bold: isOn },
    { text: tagline.padEnd(Math.max(0, room - 1)), fg: PALETTE.label, bg },
    { text: record, fg: best > 0 ? PALETTE.hurry : PALETTE.frame, bg, bold: best > 0 },
  ]
}

/** The menu: every game on its line in a frame titled with the arcade, the keys in its bottom edge. */
export const menuRows = (cursor: number, best: Partial<Record<GameId, number>>, columns: number): Row[] => {
  const inner = innerWidth(columns)
  const lines = GAMES.map((g, i) => gameLine(i, cursor, best[g.id] ?? 0, inner))
  return framed([[], ...lines, []], inner, {
    title: '◆ ARCADE',
    titleColor: PALETTE.claude,
    footer: [{ text: ` ↑↓ scegli · Invio gioca · ${menuKeysText(GAMES.length)} `, fg: PALETTE.label }],
  })
}

export type Banner = { title: string; color: string; lines: string[] }

/** Words of `line` in lines at most `width` long. */
export const wrapWords = (line: string, width: number): string[] =>
  line.split(' ').reduce<string[]>((out, word) => {
    const last = out[out.length - 1]
    if (last !== undefined && [...last].length + 1 + [...word].length <= width) return [...out.slice(0, -1), `${last} ${word}`]
    return [...out, word]
  }, [])

/** A message in a frame of its colour, its lines wrapped to the room, the last (the keys) quieter: the end of a game, or a pause. */
export const bannerRows = (b: Banner, columns: number): Row[] => {
  const inner = innerWidth(columns)
  const rows = b.lines.flatMap((line, i) =>
    wrapWords(line, inner - 1).map((part): Row => [{ text: ` ${part}`, fg: i < b.lines.length - 1 ? b.color : PALETTE.label, bold: i < b.lines.length - 1 }]),
  )
  return framed(rows, inner, { title: b.title, color: b.color, titleColor: b.color })
}
