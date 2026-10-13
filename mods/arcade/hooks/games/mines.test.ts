import { describe, expect, test } from 'claude-code/testing'

import type { Mines } from './mines'
import { keyMines, layMines, MINES, minesAround, newMines, NUMBER_COLORS, OPENED_BG, reveal, scoreMines, tickMines, TILE, toggleFlag, WIN_BONUS } from './mines'
import { PALETTE, widthOf } from './style'
import type { Row } from './types'

const SEED = { seed: 5 }
const CTX = { columns: 100, rows: 30, rng: SEED, words: [] }

/** A 5x4 board with mines where the layout has `*`, the cursor at (0,0). */
const board = (...layout: string[]): Mines => {
  const m = newMines(layout[0]!.length, layout.length, SEED)
  const mines = layout.map(line => [...line].map(c => c === '*'))
  return { ...m, mines, mineCount: mines.flat().filter(Boolean).length, cursor: { x: 0, y: 0 } }
}
const LAYOUT = ['.....', '.....', '...*.', '....*']
const textOf = (rows: Row[]) => rows.map(r => r.map(s => s.text).join(''))
const frameColor = (rows: Row[]) => rows[0]!.find(s => s.text.startsWith('╭'))?.fg
/** The spans of the cell at (x, y): three columns after the frame's side. */
const cellAt = (rows: Row[], x: number, y: number) => {
  const out: Row = []
  let at = 0
  for (const span of rows[y + 1]!) {
    for (const ch of [...span.text]) {
      if (at >= 1 + x * 3 && at < 4 + x * 3) out.push({ ...span, text: ch })
      at++
    }
  }
  return out
}
/** LAYOUT won: every safe cell open. */
const wonGame = () => reveal(reveal(reveal(board(...LAYOUT), { x: 0, y: 0 }), { x: 3, y: 3 }), { x: 4, y: 2 })

describe('campo minato', () => {
  test('a 16x10 field with about 15% mines in a roomy pane, smaller in a small one', () => {
    const big = MINES.create(CTX)
    const small = MINES.create({ ...CTX, columns: 30, rows: 8 })

    expect([big.width, big.height, big.mineCount]).toEqual([16, 10, 24])
    expect([small.width, small.height]).toEqual([9, 6])
  })

  test('the first cell opened is never a mine, nor any around it', () => {
    for (let seed = 0; seed < 40; seed++) {
      const m = newMines(16, 10, { seed })
      const first = { x: seed % 16, y: seed % 10 }
      const laid = layMines(m, first)

      expect(laid.mines!.flat().filter(Boolean)).toHaveLength(24)
      expect(laid.mines![first.y]![first.x]).toBe(false)
      expect(minesAround(laid, first)).toBe(0)
    }
  })

  test('opening a cell with no mines around opens the whole empty area', () => {
    const opened = reveal(board(...LAYOUT), { x: 0, y: 0 })

    expect(opened.revealed[0]).toEqual([true, true, true, true, true])
    expect(opened.revealed[3]![2]).toBe(true)
    expect(opened.revealed[3]![3]).toBe(false)
    expect(opened.isOver).toBe(false)
  })

  test('a numbered cell opens alone', () => {
    const opened = reveal(board(...LAYOUT), { x: 3, y: 3 })

    expect(opened.revealed.flat().filter(Boolean)).toHaveLength(1)
    expect(minesAround(opened, { x: 3, y: 3 })).toBe(2)
  })

  test('a mine ends the game and every mine is shown', () => {
    const lost = reveal(board(...LAYOUT), { x: 3, y: 2 })
    const text = MINES.draw(lost).map(r => r.map(s => s.text).join('')).join('\n')

    expect([lost.isOver, lost.hasWon]).toEqual([true, false])
    expect(text.split('✸').length - 1).toBe(1)
    expect(text.split('✱').length - 1).toBe(2)
  })

  test('a flag stops a cell from opening, and toggles off', () => {
    const flagged = keyMines(board(...LAYOUT), 'f')

    expect(flagged.flagged[0]![0]).toBe(true)
    expect(keyMines(flagged, ' ')).toBe(flagged)
    expect(keyMines(flagged, 'f').flagged[0]![0]).toBe(false)
    expect(MINES.status!(flagged)).toBe('⚑ 1 · 0s')
  })

  test('the cursor moves with arrows or WASD and stays on the board', () => {
    const m = board(...LAYOUT)

    expect(keyMines(m, 'right').cursor).toEqual({ x: 1, y: 0 })
    expect(keyMines(m, 's').cursor).toEqual({ x: 0, y: 1 })
    expect(keyMines(m, 'up').cursor).toEqual({ x: 0, y: 0 })
    expect(keyMines(keyMines(m, 'right'), 'return').revealed[0]![0]).toBe(true)
  })

  test('opening every safe cell wins, with a bonus for speed', () => {
    const m = reveal(board(...LAYOUT), { x: 0, y: 0 })
    const won = reveal(reveal(tickMines(m, 20_000), { x: 3, y: 3 }), { x: 4, y: 2 })
    const slow = { ...won, elapsedMs: 100_000 }

    expect([won.isOver, won.hasWon]).toEqual([true, true])
    expect(scoreMines(won)).toBe(18 + WIN_BONUS - 20 * 5)
    expect(scoreMines(slow)).toBeLessThan(scoreMines(won))
    expect(scoreMines(reveal(board(...LAYOUT), { x: 3, y: 3 }))).toBe(1)
  })

  test('the clock starts with the first cell and stops at the end', () => {
    const fresh = newMines(8, 6, SEED)
    const started = keyMines(fresh, ' ')

    expect(tickMines(fresh, 1000).elapsedMs).toBe(0)
    expect(tickMines(started, 1000).elapsedMs).toBe(1000)
    expect(tickMines({ ...started, isOver: true }, 1000).elapsedMs).toBe(0)
  })

  test('a flag cannot go on an opened cell', () => {
    const opened = reveal(board(...LAYOUT), { x: 0, y: 0 })

    expect(toggleFlag(opened, { x: 0, y: 0 })).toBe(opened)
  })
  test('draws the field in a rounded frame: mines and flags in the top edge, progress and the last event in the bottom one', () => {
    const m = keyMines(MINES.create(CTX), ' ')
    const count = m.revealed.flat().filter(Boolean).length
    const share = Math.floor((count / (16 * 10 - 24)) * 100)
    const text = textOf(MINES.draw(m)).map(line => line.trim())

    expect(text).toHaveLength(12)
    expect(text[0]).toMatch(/^╭─ ✱ 24 · ⚑ 0 ─+╮$/)
    expect(text[11]).toMatch(new RegExp(`^╰─▰+▱* ${share}% ─ \\+${count} ─+╯$`))
  })

  test('on a narrow field the bottom edge keeps the event, dropping the meter first', () => {
    const flagged = keyMines(board(...LAYOUT), 'f')

    expect(textOf(MINES.draw(flagged))[5]).toBe('╰─ 0% ─ ⚑ messa ╯')
    expect(textOf(MINES.draw(wonGame()))[5]).toBe('╰─ ripulito! ───╯')
  })

  test('more flags than mines turn the count amber', () => {
    const m = keyMines(keyMines(keyMines(keyMines(keyMines(board(...LAYOUT), 'f'), 'right'), 'f'), 'right'), 'f')
    const title = MINES.draw(m)[0]!.find(s => s.text.includes('⚑'))

    expect(title?.fg).toBe(PALETTE.hurry)
    expect(MINES.draw(board(...LAYOUT))[0]!.find(s => s.text.includes('⚑'))?.fg).toBe(PALETTE.label)
  })

  test('covered cells are raised tiles; the one under the cursor is lit orange', () => {
    const rows = MINES.draw(board(...LAYOUT))

    expect(cellAt(rows, 1, 0).map(s => s.text).join('')).toBe('▐█▌')
    expect(cellAt(rows, 1, 0).every(s => s.fg === TILE)).toBe(true)
    expect(cellAt(rows, 0, 0).map(s => s.text).join('')).toBe('▐█▌')
    expect(cellAt(rows, 0, 0).every(s => s.fg === PALETTE.claude)).toBe(true)
  })

  test('an opened cell under the cursor shows on orange', () => {
    const m = keyMines(board(...LAYOUT), ' ')
    const cell = cellAt(MINES.draw(m), 0, 0)

    expect(cell.every(s => s.bg === PALETTE.claude)).toBe(true)
  })

  test('numbers take their classic colours, one each', () => {
    const m = { ...reveal(reveal(board(...LAYOUT), { x: 0, y: 0 }), { x: 3, y: 3 }), cursor: { x: 0, y: 3 }, event: null }
    const rows = MINES.draw(m)

    expect(cellAt(rows, 2, 1).map(s => s.text).join('')).toBe(' 1 ')
    expect(cellAt(rows, 2, 1)[1]!.fg).toBe(NUMBER_COLORS[1])
    expect(cellAt(rows, 3, 3)[1]!.fg).toBe(NUMBER_COLORS[2])
    expect(new Set(NUMBER_COLORS.slice(1)).size).toBe(8)
  })

  test('the cells the last key opened are washed green, the count in the bottom edge, until the next key', () => {
    const opened = keyMines(board(...LAYOUT), ' ')
    const washed = (m: Mines) => MINES.draw(m).flat().filter(s => s.bg === OPENED_BG).reduce((n, s) => n + [...s.text].length, 0)
    const count = opened.revealed.flat().filter(Boolean).length

    // Every opened cell but the one under the cursor, three columns each.
    expect(washed(opened)).toBe((count - 1) * 3)
    expect(textOf(MINES.draw(opened))[5]).toContain(` +${count} `)
    const moved = keyMines(opened, 'down')
    expect(washed(moved)).toBe(0)
    expect(textOf(MINES.draw(moved))[5]).not.toContain('+')
  })

  test('a flag stands on its tile, dark on the cursor; the bottom edge says it went on, then off', () => {
    const flagged = keyMines(board(...LAYOUT), 'f')
    const away = keyMines(flagged, 'right')

    expect(cellAt(MINES.draw(flagged), 0, 0)[1]).toEqual({ text: '⚑', fg: '#1a1a1a', bg: PALETTE.claude, bold: true })
    expect(cellAt(MINES.draw(away), 0, 0)[1]).toEqual({ text: '⚑', fg: PALETTE.danger, bg: TILE, bold: true })
    expect(textOf(MINES.draw(keyMines(flagged, 'f')))[5]).toContain(' ⚑ tolta ')
  })

  test('a lost game: the exploded mine on a red tile, the others, a wrong flag crossed, BOOM in a red frame', () => {
    const wrongFlag = toggleFlag(board(...LAYOUT), { x: 0, y: 0 })
    const lost = reveal(wrongFlag, { x: 3, y: 2 })
    const rows = MINES.draw(lost)

    expect(cellAt(rows, 3, 2)[1]).toEqual({ text: '✸', fg: PALETTE.white, bg: PALETTE.danger, bold: true })
    expect(cellAt(rows, 4, 3).map(s => s.text).join('')).toBe(' ✱ ')
    expect(cellAt(rows, 0, 0)[1]!.text).toBe('✗')
    expect(frameColor(rows)).toBe(PALETTE.danger)
    expect(textOf(rows)[5]).toContain(' BOOM ')
  })

  test('a won game flags every mine in green in a green frame', () => {
    const rows = MINES.draw(wonGame())

    expect(cellAt(rows, 3, 2)[1]).toEqual({ text: '⚑', fg: PALETTE.good, bg: TILE, bold: true })
    expect(cellAt(rows, 4, 3)[1]!.fg).toBe(PALETTE.good)
    expect(frameColor(rows)).toBe(PALETTE.good)
    expect(textOf(rows)[5]).toContain(' ripulito! ')
  })

  test('fits the room at 40, 80 and 100 columns, centered', () => {
    for (const columns of [40, 80, 100]) {
      for (const rows of [12, 16, 30]) {
        const m = keyMines(MINES.create({ ...CTX, columns, rows }), ' ')
        const drawn = MINES.draw(keyMines(m, 'f'))

        expect(drawn.every(r => widthOf(r) <= columns)).toBe(true)
        expect(drawn.length).toBeLessThanOrEqual(rows)
      }
    }
    expect(textOf(MINES.draw(MINES.create(CTX)))[0]!.indexOf('╭')).toBe(25)
  })
})
