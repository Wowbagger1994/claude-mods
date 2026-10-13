import { describe, expect, test } from 'claude-code/testing'

import { draw2048, drawDino, drawSnake, EAT_FLASH_MS } from '../draw'
import type { Play2048, SnakePlay } from './classics'
import { G2048, moveFx, RUNNER, SNAKE } from './classics'
import type { Dino } from './dino'
import { DINO_X, newDino } from './dino'
import type { Game2048 } from './g2048'
import { mergesOf, move2048, new2048 } from './g2048'
import type { Snake } from './snake'
import { newSnake } from './snake'
import { PALETTE, widthOf } from './style'
import type { AnyGame, Row } from './types'

const SEED = { seed: 42 }
const ctx = (columns: number, rows: number) => ({ columns, rows, rng: SEED, words: [] })
const lines = (rows: readonly Row[]) => rows.map(r => r.map(s => s.text).join(''))
/** The frame's colour: the one its top-left corner is drawn in. */
const frameColor = (rows: readonly Row[]) => rows[0]!.find(s => s.text.includes('╭'))?.fg
const bottom = (rows: readonly Row[]) => lines(rows)[rows.length - 1]!
const spansOf = (rows: readonly Row[], text: string) => rows.flat().filter(s => s.text.includes(text))

describe('every classic fits its room', () => {
  const games: AnyGame[] = [SNAKE, G2048, RUNNER]
  const KEYS = ['up', 'left', ' ', 'right', 'down']
  for (const game of games) {
    test(`${game.name} stays within the columns and rows at 40, 80 and 100 columns`, () => {
      for (const columns of [40, 80, 100]) {
        for (const rows of [12, 13, 14, 16, 17, 21, 30]) {
          let state = game.create(ctx(columns, rows))
          const frames = [game.draw(state)]
          for (let i = 0; i < 40 && !game.isOver(state); i++) {
            state = game.key(state, KEYS[i % KEYS.length]!)
            if (game.tick !== undefined) state = game.tick(state, 50)
            frames.push(game.draw(state))
          }
          const widest = Math.max(...frames.flat().map(widthOf))
          const tallest = Math.max(...frames.map(f => f.length))

          expect({ columns, rows, fits: widest <= columns && tallest <= rows }).toEqual({ columns, rows, fits: true })
        }
      }
    })
  }
})

describe('snake drawing', () => {
  // A 20×5 board, the snake at (10,2)…(8,2) heading right, the fruit right in front of it.
  const hungry = (): SnakePlay => {
    const snake = newSnake(20, 5, SEED)
    return { snake: { ...snake, food: { x: 11, y: 2 } }, since: 0, columns: 80, clock: 0, ate: null }
  }

  test('a rounded frame titled Snake, every row as wide, centered in the room', () => {
    const rows = SNAKE.draw(hungry())
    const text = lines(rows)

    expect(text[0]!.trimStart().startsWith('╭─ Snake ─')).toBe(true)
    expect(text[text.length - 1]!.trim().startsWith('╰')).toBe(true)
    expect(new Set(text.map(l => [...l].length)).size).toBe(1)
    // 20 cells two columns wide and 2 edges: 42 columns, centered in 80.
    expect(text[1]!.indexOf('│')).toBe(19)
    expect(frameColor(rows)).toBe(PALETTE.frame)
  })

  test('the head has eyes where it goes, the body fades toward the tail', () => {
    const s = hungry().snake
    const rows = drawSnake(s)
    const body = rows[3]!.filter(span => span.bg !== undefined)

    expect(body[body.length - 1]!.text).toBe(' :')
    expect(lines(drawSnake({ ...s, heading: 'up' }))[3]).toContain('▝▘')
    // Tail, neck, head: three colours.
    expect(new Set(body.map(span => span.bg)).size).toBe(3)
  })

  test('the fruit glows on a beat', () => {
    const s = hungry()
    const fruit = (clock: number) => spansOf(SNAKE.draw({ ...s, clock }), '●')[0]!.fg

    expect(fruit(0)).not.toBe(fruit(300))
    expect(fruit(0)).toBe(fruit(600))
  })

  test('eating lights the frame, shows +10, sparks round the spot and swallows down the body; then it fades', () => {
    const fed = SNAKE.tick!(hungry(), 150)
    const rows = SNAKE.draw(fed)
    const later = [...Array(Math.ceil(EAT_FLASH_MS / 50))].reduce<SnakePlay>(acc => SNAKE.tick!(acc, 50), fed)

    expect(fed.ate).toEqual({ at: { x: 11, y: 2 }, points: 10, ms: 0 })
    expect(frameColor(rows)).toBe(PALETTE.good)
    expect(bottom(rows)).toContain(' +10 ')
    expect(spansOf(rows, '✦')).toHaveLength(3)
    expect(spansOf(rows, ' :')[0]!.bg).toBe(PALETTE.white)
    expect(rows.flat().some(span => span.bg === '#d9f99d')).toBe(true)

    expect(later.ate).toBeNull()
    expect(frameColor(SNAKE.draw(later))).toBe(PALETTE.frame)
    expect(bottom(SNAKE.draw(later))).not.toContain('+10')
  })

  test('the bottom edge shows the speed, fuller as the snake grows', () => {
    const s = hungry().snake
    const long: Snake = { ...s, body: Array.from({ length: 20 }, (_, i) => ({ x: i, y: 0 })) }

    expect(bottom(drawSnake(s))).toContain('▱▱▱▱▱▱ velocità')
    // 20 long: a step every 82 ms, three quarters of the way to the fastest.
    expect(bottom(drawSnake(long))).toContain('▰▰▰▰▰▱ velocità')
  })

  test('a crash turns the frame red, crosses the eyes and greys the body', () => {
    const crashed = { ...hungry().snake, isOver: true }
    const rows = drawSnake(crashed)

    expect(frameColor(rows)).toBe(PALETTE.danger)
    expect(bottom(rows)).toContain('✗ schianto')
    expect(spansOf(rows, '××')[0]!.bg).toBe(PALETTE.danger)
    expect(rows.flat().some(span => span.bg === '#71717a')).toBe(true)
  })
})

describe('2048 drawing', () => {
  const GRID = [
    [2, 2, 4, 8],
    [16, 32, 64, 128],
    [256, 512, 1024, 0],
    [0, 0, 0, 0],
  ]
  const play = (columns: number, rows: number, grid = GRID): Play2048 => {
    const p = G2048.create(ctx(columns, rows)) as Play2048
    return { ...p, game: { ...p.game, grid } }
  }

  test('a rounded frame titled 2048, taller tiles when there is room', () => {
    const heights = [12, 14, 17, 30].map(rows => G2048.draw(play(40, rows)).length)

    expect(lines(G2048.draw(play(40, 12)))[0]!.startsWith('╭─ 2048 ─')).toBe(true)
    expect(heights).toEqual([10, 14, 17, 17])
    // Roomy: tiles three rows tall, the number on the middle one.
    expect(lines(G2048.draw(play(80, 21))).slice(1, 4).map(l => l.includes('128'))).toEqual([false, false, false])
    expect(lines(G2048.draw(play(80, 21)))[6]).toContain('128')
  })

  test('the tiles of a merge are marked and the points shown, until the next move', () => {
    const merged = G2048.key(play(40, 14), 'left') as Play2048
    const rows = G2048.draw(merged)
    const after = G2048.key(merged, 'down') as Play2048

    expect(lines(rows)[2]).toContain('✦ 4 ✦')
    expect(bottom(rows)).toContain(' +4 ')
    expect(lines(G2048.draw(after)).join('\n')).not.toContain('✦')
    expect(bottom(G2048.draw(after))).not.toContain('+')
  })

  test('the tile just added shows its number row only: it grows in', () => {
    const moved = G2048.key(play(40, 14), 'left') as Play2048
    const at = moved.last!.spawned!
    const rows = G2048.draw(moved)
    // In the 14-row layout each tile row is a cap, the number, a base, under the top edge.
    const capOf = (r: number, c: number) => rows[1 + r * 3]!.filter(s => s.text.includes('▄'))[c]
    const isLone = (r: number, c: number) => capOf(r, c)?.fg === '#27272a'

    expect(isLone(at.r, at.c)).toBe(true)
    expect(isLone(1, 0)).toBe(false)
  })

  test('the bottom edge shows the way to 2048; a win turns it gold, the end red', () => {
    const stuck: Game2048 = { ...new2048(SEED), grid: GRID, isOver: true }
    const won: Game2048 = { ...new2048(SEED), grid: GRID, hasWon: true }

    expect(bottom(draw2048({ ...new2048(SEED), grid: GRID }))).toContain('▰▰▰▰▰▰▰▰▰▰▱ verso il 2048')
    expect(frameColor(draw2048(won))).toBe('#edc22e')
    expect(bottom(draw2048(won))).toContain('★ 2048!')
    expect(frameColor(draw2048(stuck))).toBe(PALETTE.danger)
    expect(bottom(draw2048(stuck))).toContain('✗ nessuna mossa')
  })

  test('a move tells where tiles merged, the tile added and the points', () => {
    const before: Game2048 = { ...new2048(SEED), grid: GRID }
    const after = move2048(before, 'left')
    const fx = moveFx(before, after, 'left')

    expect(mergesOf(GRID, 'left')[0]).toEqual([1, 0, 0, 0])
    // [2,2,4,8] slid right is [0,4,4,8]: the merged 4 lands second.
    expect(mergesOf(GRID, 'right')[0]).toEqual([0, 1, 0, 0])
    expect(mergesOf([[2], [2], [4], [4]].map(r => [...r, 0, 0, 0]), 'up').map(r => r[0])).toEqual([1, 1, 0, 0])
    expect(fx.gained).toBe(4)
    expect(after.grid[fx.spawned!.r]![fx.spawned!.c]).toBeGreaterThan(0)
    expect(before.grid[fx.spawned!.r]![fx.spawned!.c]).not.toBe(after.grid[fx.spawned!.r]![fx.spawned!.c])
  })
})

describe('runner drawing', () => {
  const runner = (columns = 80, rows = 21): Dino => ({ ...(RUNNER.create(ctx(columns, rows)) as Dino), gap: 10_000 })
  const groundRow = (d: Dino) => drawDino(d)[11]!

  test('a rounded frame titled Claude runner, a soil row and one more of sky when there is room', () => {
    expect(lines(drawDino(runner()))[0]!.startsWith('╭─ Claude runner ─')).toBe(true)
    expect([12, 13, 14, 21].map(rows => drawDino(runner(80, rows)).length)).toEqual([12, 13, 14, 14])
    expect(lines(drawDino(runner(100)))[0]!.indexOf('╭')).toBe(4)
  })

  test('the ground scrolls with the run, the clouds slower', () => {
    const d = runner()
    const moved = { ...d, distance: d.distance + 3 }
    // The middle cloud's top, on the third row of sky.
    const cloudColumn = (distance: number) => lines(drawDino({ ...d, distance }))[3]!.indexOf('▗▄██▄▖')

    expect(groundRow(moved).map(s => s.fg)).not.toEqual(groundRow(d).map(s => s.fg))
    expect(cloudColumn(0)).toBeGreaterThan(0)
    expect(cloudColumn(0) - cloudColumn(25)).toBe(3)
  })

  test('wind streaks show only at speed', () => {
    const streaks = (d: Dino) => lines(drawDino(d)).join('\n').match(/─{3,}/g)?.filter(m => m.length < 6).length ?? 0

    expect(streaks(runner())).toBe(0)
    expect(streaks({ ...runner(), speed: 42 })).toBe(4)
  })

  test('a mascot in the air casts a shadow on the ground', () => {
    const shadow = (d: Dino) => groundRow(d).filter(s => s.fg === '#44403c').map(s => s.text).join('')

    expect(shadow(runner())).toBe('')
    expect(shadow({ ...runner(), y: 2 })).toBe('▀▀▀▀▀')
  })

  test('cacti have arms, and the scenery stays out of the mascot', () => {
    const d = { ...runner(), cacti: [{ x: 30, width: 3, height: 2 }] }
    const text = lines(drawDino(d))
    const feet = text[10]!

    expect(text[9]!.slice(31, 34)).toBe('▌█▐')
    expect(text[10]!.slice(31, 34)).toBe('▀█▀')
    // Between the feet, inside the mascot's box: blanks, not dunes.
    expect(feet.slice(1 + DINO_X, 1 + DINO_X + 9)).toBe('  ▘▘ ▝▝  ')
  })

  test('every hundred points the frame turns gold and says so, for a moment', () => {
    const at = (score: number) => drawDino({ ...runner(), score })

    expect(bottom(at(200))).toContain('✦ 200!')
    expect(frameColor(at(200))).toBe('#edc22e')
    expect(bottom(at(250))).not.toContain('✦')
    expect(frameColor(at(250))).toBe(PALETTE.frame)
  })

  test('a crash turns the frame and the mascot red, with a burst at its front', () => {
    const rows = drawDino({ ...runner(), isOver: true })

    expect(frameColor(rows)).toBe(PALETTE.danger)
    expect(bottom(rows)).toContain('✗ schianto!')
    expect(spansOf(rows, '▐▛███▜▌')[0]!.fg).toBe(PALETTE.danger)
    expect(spansOf(rows, '✸')).toHaveLength(1)
    expect(spansOf(drawDino(runner()), '✸')).toHaveLength(0)
  })

  test('without the room it was given, it draws in the least room', () => {
    expect(drawDino(newDino(40, SEED)).length).toBe(12)
  })
})
