import { describe, expect, test } from 'claude-code/testing'

import { GAMES } from './games/catalog'
import { PALETTE } from './games/style'
import type { Row } from './games/types'
import { bannerRows, indexOfMenuKey, lookOf, menuKeyOf, menuKeysText, menuRows, wrapWords } from './menu'

const text = (rows: readonly Row[]) => rows.map(r => r.map(s => s.text).join(''))

describe('menu', () => {
  test('every game on its line in a frame titled ◆ ARCADE, the keys in its bottom edge', () => {
    const rows = text(menuRows(0, {}, 80))

    expect(rows[0]).toMatch(/^╭─ ◆ ARCADE ─+╮$/)
    expect(rows.at(-1)).toMatch(/^╰─ ↑↓ scegli · Invio gioca · 1–9 · a–b ─+╯$/)
    expect(rows.slice(2, 2 + GAMES.length).map(r => r.slice(1, 16))).toEqual(GAMES.map((g, i) => `${i === 0 ? ' ▶ ' : '   '}${menuKeyOf(i)} ${lookOf(g.id).icon} ${g.name}`.padEnd(15).slice(0, 15)))
  })

  test('the line under the cursor is lit; a record shows as a star, none as a dash', () => {
    const rows = menuRows(1, { '2048': 300 }, 80)
    const lit = rows[3]!

    expect(lit.every(s => s.bg !== undefined || s.text === '│')).toBe(true)
    expect(rows[2]!.some(s => s.bg !== undefined)).toBe(false)
    expect(text(rows)[3]).toMatch(/2048 .*★ 300 │$/)
    expect(lit.find(s => s.text.startsWith('★'))?.fg).toBe(PALETTE.hurry)
    expect(text(rows)[2]).toMatch(/Snake .*— │$/)
  })

  test('wide, each game says what to do; narrow, the taglines go and the names give way to the record', () => {
    const wide = text(menuRows(0, {}, 80))
    const narrow = text(menuRows(0, { typing: 12_345 }, 30))

    expect(wide[2]).toContain('mangia e cresci')
    expect(narrow[2]).not.toContain('mangia')
    expect(narrow[9]).toMatch(/Pioggia di \S*… ★ 12345 │$/)
    for (const columns of [30, 60, 100]) expect(new Set(text(menuRows(0, { snake: 99_999 }, columns)).map(r => [...r].length)).size).toBe(1)
  })
})

describe('menu keys', () => {
  test('1–9 start the first nine games, then letters but w and s, which move the cursor', () => {
    expect([0, 8, 9, 10, 26].map(menuKeyOf)).toEqual(['1', '9', 'a', 'b', 'r'])
    expect(['1', '9', 'a', 'b', 'c'].map(k => indexOfMenuKey(k, 11))).toEqual([0, 8, 9, 10, -1])
    expect(['0', 's', 'w', 'return', 'up', 'é'].map(k => indexOfMenuKey(k, 30))).toEqual([-1, -1, -1, -1, -1, -1])
    expect([menuKeysText(8), menuKeysText(10), menuKeysText(11)]).toEqual(['1–8', '1–9 · a', '1–9 · a–b'])
  })
})

describe('banners', () => {
  test('a message in a frame of its colour, wrapped to the room, the keys last and quieter', () => {
    const rows = bannerRows({ title: 'FINE', color: PALETTE.danger, lines: ['Partita finita: 25 punti. Nuovo record!', 'Invio rigioca · m menu'] }, 30)

    expect(text(rows)).toEqual([
      '╭─ FINE ───────────────────────╮',
      '│ Partita finita: 25 punti.    │',
      '│ Nuovo record!                │',
      '│ Invio rigioca · m menu       │',
      '╰──────────────────────────────╯',
    ])
    expect(rows[1]!.find(s => s.text.includes('Partita'))?.fg).toBe(PALETTE.danger)
    expect(rows[3]!.find(s => s.text.includes('Invio'))?.fg).toBe(PALETTE.label)
  })

  test('words go to the next line only when they would not fit', () => {
    expect(wrapWords('uno due tre', 7)).toEqual(['uno due', 'tre'])
    expect(wrapWords('uno', 2)).toEqual(['uno'])
  })
})
