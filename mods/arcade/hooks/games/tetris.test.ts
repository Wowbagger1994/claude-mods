import { describe, expect, test } from 'claude-code/testing'

import { fitRow, PALETTE, widthOf } from './style'
import type { Kind, Tetris } from './tetris'
import {
  BANNER_MS,
  COLORS,
  emptyBoard,
  fallInterval,
  fits,
  FLASH_MS,
  JAMMED,
  keyTetris,
  LIGHTS,
  LINE_POINTS,
  lock,
  newTetris,
  rotate,
  spawn,
  TETRIS,
  tickTetris,
  TRAIL_MS,
} from './tetris'
import type { Row } from './types'

const SEED = { seed: 11 }
const CTX = { columns: 100, rows: 30, rng: SEED, words: [] }

/** A game with the piece of `kind` at the top and an empty board. */
const withPiece = (kind: Kind, t: Tetris = newTetris(10, 20, SEED)): Tetris => ({ ...t, piece: spawn(kind, 10) })
const blocks = (t: Tetris) => t.piece.cells.map(c => ({ x: t.piece.x + c.x, y: t.piece.y + c.y }))
/** A bottom row full but for column `hole`. */
const almostFull = (t: Tetris, hole: number, rows = 1): Tetris => ({
  ...t,
  board: t.board.map((row, y) => (y >= t.height - rows ? row.map((_, x) => (x === hole ? null : 'Z')) : row)),
})

const textOf = (rows: Row[]) => rows.map(r => r.map(s => s.text).join(''))
/** The well alone, without the side boxes: its first 22 columns. */
const wellOf = (rows: Row[]) => rows.map(r => fitRow(r, 22))
/** The colour of the well's frame, read off its top-left corner. */
const wellColor = (rows: Row[]) => rows[0]!.find(s => s.text.startsWith('╭'))?.fg
/** The I laid flat drops into the one hole of the last row: a single clear. */
const oneClear = (): Tetris => {
  const base = almostFull(withPiece('I'), -1)
  return { ...base, board: base.board.map((row, y) => (y === 19 ? row.map((c, x) => (x >= 3 && x <= 6 ? null : c)) : row)) }
}
/** A board whose stack reaches up to row `top`. */
const stackedTo = (t: Tetris, top: number): Tetris => ({ ...t, board: t.board.map((row, y) => (y >= top ? row.map((_, x) => (x === 0 ? 'Z' : null)) : row)) })

describe('tetris', () => {
  test('a field 10 wide and up to 20 tall, shorter in a short pane but never under 14', () => {
    const tall = TETRIS.create(CTX)
    const short = TETRIS.create({ ...CTX, rows: 18 })
    const tiny = TETRIS.create({ ...CTX, rows: 8 })

    expect([tall.width, tall.height]).toEqual([10, 20])
    expect(short.height).toBe(16)
    expect(tiny.height).toBe(14)
  })

  test('each bag deals all seven pieces once', () => {
    let t = newTetris(10, 20, SEED)
    const kinds: Kind[] = [t.piece.kind]
    for (let i = 0; i < 13; i++) {
      t = lock({ ...t, board: emptyBoard(10, 20) })
      kinds.push(t.piece.kind)
    }

    expect(new Set(kinds.slice(0, 7)).size).toBe(7)
    expect(new Set(kinds.slice(7, 14)).size).toBe(7)
  })

  test('the order in a bag changes with the seed', () => {
    const order = (seed: number) => {
      let t = newTetris(10, 20, { seed })
      const kinds: Kind[] = [t.piece.kind]
      for (let i = 0; i < 6; i++) {
        t = lock({ ...t, board: emptyBoard(10, 20) })
        kinds.push(t.piece.kind)
      }
      return kinds.join('')
    }

    expect(new Set(Array.from({ length: 8 }, (_, seed) => order(seed))).size).toBeGreaterThan(4)
  })

  test('arrows move the piece sideways, not through the wall', () => {
    const t = withPiece('O')
    const x = t.piece.x

    expect(keyTetris(t, 'left').piece.x).toBe(x - 1)
    expect(keyTetris(t, 'd').piece.x).toBe(x + 1)
    const atWall = Array.from({ length: 10 }).reduce<Tetris>(acc => keyTetris(acc, 'left'), t)
    expect(atWall.piece.x).toBe(0)
  })

  test('up turns the piece a quarter, kicking off a wall when it must', () => {
    const t = withPiece('T')
    const turned = keyTetris(t, 'up')

    expect(turned.piece.cells).toEqual(rotate(t.piece).cells)
    expect(turned.piece.cells).not.toEqual(t.piece.cells)
    // A vertical I against the right wall turns flat by stepping one column in.
    const upright = { ...withPiece('I'), piece: { ...rotate(spawn('I', 10)), x: 7, y: 5 } }
    const kicked = keyTetris(upright, 'up')
    expect(blocks(kicked).every(b => b.x >= 0 && b.x < 10)).toBe(true)
    expect(kicked.piece.x).not.toBe(7)
  })

  test('down drops one row for a point; space drops to the bottom for two a row', () => {
    const t = withPiece('O')
    const soft = keyTetris(t, 'down')
    const hard = keyTetris(t, ' ')

    expect([soft.piece.y, soft.score]).toEqual([1, 1])
    expect(hard.score).toBe(2 * 18)
    expect(hard.board[19]!.filter(c => c === 'O')).toHaveLength(2)
    expect(hard.piece.kind).toBe(t.next)
  })

  test('gravity pulls a row each interval, faster each level', () => {
    const t = withPiece('O')

    expect(tickTetris(t, fallInterval(1) - 1).piece.y).toBe(0)
    expect(tickTetris(t, fallInterval(1)).piece.y).toBe(1)
    expect(tickTetris(t, fallInterval(1) * 3).piece.y).toBe(3)
    expect(fallInterval(5)).toBeLessThan(fallInterval(1))
  })

  test('a full row clears and scores by the level', () => {
    // An I laid flat in the hole of the last row: x 3..6 filled by the piece, the rest by the board.
    const base = almostFull(withPiece('I'), -1)
    const holed = { ...base, board: base.board.map((row, y) => (y === 19 ? row.map((c, x) => (x >= 3 && x <= 6 ? null : c)) : row)) }
    const dropped = keyTetris({ ...holed, level: 2 }, ' ')

    expect(dropped.lines).toBe(1)
    expect(dropped.score).toBe(LINE_POINTS[1]! * 2 + 2 * 18)
    expect(dropped.board[19]!.filter(c => c !== null)).toHaveLength(0)
  })

  test('four rows at once score 800 times the level, and ten rows raise the level', () => {
    const t = { ...withPiece('I'), piece: { ...rotate(spawn('I', 10)), x: -2, y: 0 }, lines: 8 }
    const four = keyTetris(almostFull(t, 0, 4), ' ')

    expect(four.lines).toBe(12)
    expect(four.level).toBe(2)
    expect(four.score).toBe(LINE_POINTS[4]! + 2 * 16)
  })

  test('the game ends when a new piece does not fit', () => {
    const t = withPiece('O')
    const blocked = { ...t, board: t.board.map((row, y) => (y < 2 ? row.map((_, x) => (x === 0 ? 'Z' : null)) : row)) }
    const full = { ...t, board: t.board.map((row, y) => (y === 1 ? row.map(() => 'Z' as Kind).map((c, x) => (x === 9 ? null : c)) : row)) }

    expect(lock({ ...blocked, piece: { ...t.piece, y: 10 } }).isOver).toBe(false)
    expect(fits(full.board, spawn(t.next, 10))).toBe(false)
    expect(lock({ ...full, piece: { ...t.piece, y: 5 } }).isOver).toBe(true)
    expect(keyTetris({ ...t, isOver: true }, 'left')).toEqual({ ...t, isOver: true })
  })

  test('draws a rounded well, and beside it the next piece and the level in their own boxes', () => {
    const t = withPiece('T')
    const text = textOf(TETRIS.draw(t))

    expect(text).toHaveLength(22)
    expect(text[0]).toMatch(/^╭─{20}╮  ╭─ Prossimo ─+╮$/)
    expect(text[21]).toMatch(/^╰─{20}╯$/)
    expect(text.some(line => line.includes('╭─ livello 1 ─╮'))).toBe(true)
    expect(text.some(line => line.includes('righe 0'))).toBe(true)
    expect(TETRIS.status!(t)).toBe('livello 1 · righe 0')
  })

  test('blocks are bevelled: their colour under a lit top edge, the next piece too', () => {
    const rows = TETRIS.draw(withPiece('T'))
    const lit = rows.flat().filter(s => s.fg === COLORS.T && s.bg === LIGHTS.T)

    expect(lit.length).toBeGreaterThan(0)
    expect(lit.every(s => /^(▆▆)+$/.test(s.text))).toBe(true)
    const next = rows.flat().filter(s => s.fg === COLORS[withPiece('T').next])
    expect(next.length).toBeGreaterThan(0)
  })

  test('a ghost shows where the piece will land', () => {
    const t = withPiece('O')
    const rows = TETRIS.draw(t)
    const ghostRows = rows.flatMap((r, i) => (r.some(s => s.text.includes('░░') && s.fg === COLORS.O) ? [i] : []))

    // The O lands on the last two rows of 20: drawn rows 19 and 20, under the top edge.
    expect(ghostRows).toEqual([19, 20])
    expect(textOf(TETRIS.draw(keyTetris(t, ' '))).filter(line => line.includes('░░'))).toHaveLength(2)
  })

  test('a hard drop leaves a streak down the columns it fell, gone after a moment', () => {
    const dropped = keyTetris(withPiece('O'), ' ')
    const streaked = (t: Tetris) => textOf(TETRIS.draw(t)).filter(line => line.includes('▕▏▕▏')).length

    // The O fell 18 rows: two hidden by the next piece at the top, two by its ghost over the stack.
    expect(streaked(dropped)).toBe(14)
    expect(TETRIS.draw(dropped).flat().find(s => s.text.includes('▕▏'))?.fg).toBe(LIGHTS.O)
    expect(streaked(tickTetris(dropped, TRAIL_MS - 1))).toBe(streaked(dropped))
    expect(streaked(tickTetris(dropped, TRAIL_MS))).toBe(0)
    expect(streaked(keyTetris(withPiece('O'), 'down'))).toBe(0)
  })

  test('cleared rows flash white in a green well, then the points stay in the bottom edge', () => {
    const cleared = keyTetris({ ...oneClear(), level: 2 }, ' ')
    const rows = TETRIS.draw(cleared)
    const text = textOf(rows)

    expect(text[20]).toContain('█'.repeat(20))
    expect(rows[20]!.find(s => s.text.includes('██'))?.fg).toBe(PALETTE.white)
    expect(wellColor(rows)).toBe(PALETTE.good)
    expect(text[21]).toContain(' +200 singola ')

    const after = tickTetris(cleared, FLASH_MS)
    expect(textOf(TETRIS.draw(after)).some(line => line.includes('██'))).toBe(false)
    expect(wellColor(TETRIS.draw(after))).toBe(PALETTE.frame)
    expect(textOf(TETRIS.draw(after))[21]).toContain('+200 singola')
    expect(textOf(TETRIS.draw(tickTetris(cleared, BANNER_MS)))[21]).toMatch(/^╰─{20}╯/)
  })

  test('four rows at once are a TETRIS! in the bottom edge', () => {
    const t = { ...withPiece('I'), piece: { ...rotate(spawn('I', 10)), x: -2, y: 0 } }
    const four = keyTetris(almostFull(t, 0, 4), ' ')

    expect(textOf(TETRIS.draw(four))[21]).toContain('+800 TETRIS!')
  })

  test('the well turns amber, then red, as the stack nears the top', () => {
    const t = withPiece('O')

    expect(wellColor(TETRIS.draw(stackedTo(t, 12)))).toBe(PALETTE.frame)
    expect(wellColor(TETRIS.draw(stackedTo(t, 6)))).toBe(PALETTE.hurry)
    expect(wellColor(TETRIS.draw(stackedTo(t, 3)))).toBe(PALETTE.danger)
  })

  test('a lost game greys the stack, shows the jammed piece in red and says the well is full', () => {
    const t = withPiece('O')
    const full = { ...t, board: t.board.map((row, y) => (y === 1 ? row.map((_, x) => (x === 9 ? null : 'Z' as Kind)) : row)) }
    const lost = lock({ ...full, piece: { ...t.piece, y: 5 } })
    const rows = TETRIS.draw(lost)

    expect(lost.isOver).toBe(true)
    expect(wellColor(rows)).toBe(PALETTE.danger)
    expect(wellOf(rows).flat().some(s => s.bg === '#71717a')).toBe(true)
    expect(wellOf(rows).flat().some(s => s.bg === LIGHTS.Z)).toBe(false)
    // The O that did not fit, jammed at the top: two rows of two crossed cells.
    expect(textOf(wellOf(rows)).slice(1, 3).every(line => line.includes('╳╳╳╳'))).toBe(true)
    expect(wellOf(rows).flat().find(s => s.text.includes('╳'))).toMatchObject({ fg: JAMMED.fg, bg: JAMMED.bg })
    expect(textOf(rows)[21]).toContain('pozzo pieno')
  })

  test('the level box meters the rows still needed for the next level', () => {
    const text = textOf(TETRIS.draw({ ...withPiece('O'), lines: 13, level: 2 }))

    expect(text.some(line => line.includes('livello 2'))).toBe(true)
    expect(text.some(line => line.includes('righe 13'))).toBe(true)
    expect(text.some(line => line.includes('▰▰▰▱▱▱▱▱▱▱'))).toBe(true)
  })

  test('fits the room: centered in wide columns, the side boxes dropped when too narrow', () => {
    for (const columns of [30, 40, 80, 100]) {
      for (const rows of [16, 22, 30]) {
        const drawn = TETRIS.draw(TETRIS.create({ ...CTX, columns, rows }))

        expect(drawn.every(r => widthOf(r) <= columns)).toBe(true)
        expect(drawn.length).toBeLessThanOrEqual(rows)
      }
    }
    const wide = textOf(TETRIS.draw(TETRIS.create({ ...CTX, columns: 100 })))
    const narrow = textOf(TETRIS.draw(TETRIS.create({ ...CTX, columns: 30 })))
    expect(wide[0]!.indexOf('╭')).toBe(30)
    expect(narrow.join('')).not.toContain('Prossimo')
    expect(narrow[0]!.trim()).toMatch(/^╭─+╮$/)
  })
})
