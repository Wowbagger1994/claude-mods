import { describe, expect, test } from 'claude-code/testing'

import type { Kind, Tetris } from './tetris'
import { emptyBoard, fallInterval, fits, keyTetris, LINE_POINTS, lock, newTetris, rotate, spawn, TETRIS, tickTetris } from './tetris'

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

  test('draws the frame, the piece in its colour and the next piece beside', () => {
    const t = withPiece('T')
    const rows = TETRIS.draw(t)
    const text = rows.map(r => r.map(s => s.text).join(''))

    expect(rows).toHaveLength(22)
    expect(text[0]).toBe(`┌${'─'.repeat(20)}┐`)
    expect(rows[1]!.some(s => s.bg === '#a855f7')).toBe(true)
    expect(text[1]).toContain('Prossimo')
    expect(TETRIS.status!(t)).toBe('livello 1 · righe 0')
  })
})
