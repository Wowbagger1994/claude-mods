import { describe, expect, test } from 'claude-code/testing'

import type { Mines } from './mines'
import { keyMines, layMines, MINES, minesAround, newMines, reveal, scoreMines, tickMines, toggleFlag, WIN_BONUS } from './mines'

const SEED = { seed: 5 }
const CTX = { columns: 100, rows: 30, rng: SEED, words: [] }

/** A 5x4 board with mines where the layout has `*`, the cursor at (0,0). */
const board = (...layout: string[]): Mines => {
  const m = newMines(layout[0]!.length, layout.length, SEED)
  const mines = layout.map(line => [...line].map(c => c === '*'))
  return { ...m, mines, mineCount: mines.flat().filter(Boolean).length, cursor: { x: 0, y: 0 } }
}
const LAYOUT = ['.....', '.....', '...*.', '....*']

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
})
