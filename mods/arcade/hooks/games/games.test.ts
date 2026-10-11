import { describe, expect, test } from 'claude-code/testing'

import type { Dino } from './dino'
import { HITBOX, dropDino, jumpDino, newDino, stepDino } from './dino'
import { move2048, new2048, slide, slideRow } from './g2048'
import { nextInt, nextRandom } from './rng'
import type { Snake } from './snake'
import { FRUIT_POINTS, newSnake, snakeInterval, stepSnake, turnSnake } from './snake'

const SEED = { seed: 42 }

describe('rng', () => {
  test('replays the same numbers from the same seed, each in [0, 1)', () => {
    const [a, next] = nextRandom(SEED)
    const [b] = nextRandom(next)

    expect(nextRandom(SEED)[0]).toBe(a)
    expect(a).not.toBe(b)
    expect(a >= 0 && a < 1 && b >= 0 && b < 1).toBe(true)
    expect(Array.from({ length: 200 }, (_, i) => nextInt({ seed: i }, 3)[0]).every(n => n >= 0 && n < 3)).toBe(true)
  })
})

describe('snake', () => {
  // A 10x5 board, the snake at (5,2)…(3,2) heading right, the fruit put where a test wants it.
  const board = (food = { x: 0, y: 0 }): Snake => ({ ...newSnake(10, 5, SEED), food })

  test('starts as three cells in the middle heading right, the fruit off its body', () => {
    const s = newSnake(10, 5, SEED)

    expect(s.body).toEqual([{ x: 5, y: 2 }, { x: 4, y: 2 }, { x: 3, y: 2 }])
    expect(s.body.some(p => p.x === s.food.x && p.y === s.food.y)).toBe(false)
  })

  test('moves one cell a step, its tail following', () => {
    const s = stepSnake(board())

    expect(s.body).toEqual([{ x: 6, y: 2 }, { x: 5, y: 2 }, { x: 4, y: 2 }])
  })

  test('turns on the next step, and ignores a turn back onto itself', () => {
    expect(stepSnake(turnSnake(board(), 'up')).body[0]).toEqual({ x: 5, y: 1 })
    expect(stepSnake(turnSnake(board(), 'left')).body[0]).toEqual({ x: 6, y: 2 })
    // Up then left before a step: the heading is still right, so left is a reversal and is dropped.
    expect(turnSnake(turnSnake(board(), 'up'), 'left').next).toBe('up')
  })

  test('grows and scores when it eats, and places a new fruit off its body', () => {
    const s = stepSnake(board({ x: 6, y: 2 }))

    expect(s.body).toHaveLength(4)
    expect(s.score).toBe(FRUIT_POINTS)
    expect(s.body.some(p => p.x === s.food.x && p.y === s.food.y)).toBe(false)
    expect(snakeInterval(s)).toBeLessThan(snakeInterval(board()))
  })

  test('ends at a wall', () => {
    const s = Array.from({ length: 5 }).reduce<Snake>(acc => stepSnake(acc), board())

    expect(s.isOver).toBe(true)
    expect(stepSnake(s)).toBe(s)
  })

  test('ends when it runs into itself, but may enter the cell its tail is leaving', () => {
    const coiled: Snake = { ...board(), body: [{ x: 5, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 2 }, { x: 4, y: 1 }], heading: 'up', next: 'left' }
    const chasing: Snake = { ...board(), body: [{ x: 5, y: 2 }, { x: 5, y: 3 }, { x: 4, y: 3 }, { x: 4, y: 2 }], heading: 'up', next: 'left' }

    expect(stepSnake(coiled).isOver).toBe(true)
    expect(stepSnake(chasing).isOver).toBe(false)
  })
})

describe('2048', () => {
  test('slides a row left, merging each pair once', () => {
    expect(slideRow([2, 2, 2, 2])).toEqual({ row: [4, 4, 0, 0], gained: 8 })
    expect(slideRow([0, 4, 0, 4])).toEqual({ row: [8, 0, 0, 0], gained: 8 })
    expect(slideRow([2, 2, 4, 0])).toEqual({ row: [4, 4, 0, 0], gained: 4 })
    expect(slideRow([2, 4, 8, 16])).toEqual({ row: [2, 4, 8, 16], gained: 0 })
  })

  const GRID = [
    [2, 0, 0, 2],
    [0, 4, 0, 0],
    [0, 4, 0, 0],
    [8, 0, 0, 0],
  ]

  test('slides the grid each way', () => {
    expect(slide(GRID, 'left').grid[0]).toEqual([4, 0, 0, 0])
    expect(slide(GRID, 'right').grid[0]).toEqual([0, 0, 0, 4])
    expect(slide(GRID, 'up').grid.map(r => r[1])).toEqual([8, 0, 0, 0])
    expect(slide(GRID, 'down').grid.map(r => r[1])).toEqual([0, 0, 0, 8])
    expect(slide(GRID, 'down').grid.map(r => r[0])).toEqual([0, 0, 2, 8])
  })

  test('starts with two tiles, adds one after a move and scores the merges', () => {
    const g = new2048(SEED)
    const tiles = (grid: number[][]) => grid.flat().filter(n => n !== 0).length
    const moved = move2048({ ...g, grid: GRID }, 'left')

    expect(tiles(g.grid)).toBe(2)
    expect(moved.score).toBe(4)
    expect(tiles(moved.grid)).toBe(tiles(slide(GRID, 'left').grid) + 1)
  })

  test('a move that moves nothing changes nothing', () => {
    const g = { ...new2048(SEED), grid: [[2, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }

    expect(move2048(g, 'left')).toBe(g)
  })

  test('ends when no move is left, and notes a 2048 tile', () => {
    // Sliding the last row left leaves one hole; whatever lands there (2 or 4) meets no equal neighbour.
    const full = [
      [2, 4, 2, 4],
      [4, 2, 4, 2],
      [2, 4, 2, 8],
      [0, 16, 32, 64],
    ]
    const g = move2048({ ...new2048(SEED), grid: full }, 'left')
    const won = move2048({ ...new2048(SEED), grid: [[1024, 1024, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]] }, 'left')

    expect(g.isOver).toBe(true)
    expect(won.hasWon).toBe(true)
  })
})

describe('dino', () => {
  const run = (d: Dino, ms: number, step = 50) => Array.from({ length: ms / step }).reduce<Dino>(acc => stepDino(acc, step), d)

  test('a jump rises about five rows and lands within a second', () => {
    const up = jumpDino(newDino(80, SEED))
    const peaks = Array.from({ length: 12 }).reduce<{ d: Dino; top: number }>(
      acc => {
        const d = stepDino(acc.d, 50)
        return { d, top: Math.max(acc.top, d.y) }
      },
      { d: { ...up, cacti: [] }, top: 0 },
    )

    expect(peaks.top).toBeGreaterThan(4.5)
    expect(peaks.top).toBeLessThan(5.5)
    expect(run({ ...up, gap: 1000 }, 1000).y).toBe(0)
  })

  test('jumps only from the ground; down mid-air drops it', () => {
    const air = stepDino(jumpDino({ ...newDino(80, SEED), gap: 1000 }), 100)

    expect(jumpDino(air)).toBe(air)
    expect(dropDino(air).vy).toBeLessThan(0)
    expect(dropDino(newDino(80, SEED)).vy).toBe(0)
  })

  test('scores the distance run and speeds up', () => {
    const d = run({ ...newDino(80, SEED), gap: 10_000 }, 2000)

    expect(d.score).toBe(Math.floor(d.distance / 2))
    expect(d.score).toBeGreaterThan(15)
    expect(d.speed).toBeGreaterThan(newDino(80, SEED).speed)
  })

  test('a cactus scrolls in from the right and ends the run when it reaches a standing dino', () => {
    const d = { ...newDino(40, SEED), gap: 0.1 }
    const spawned = stepDino(d, 50)
    const hit = run({ ...d, cacti: [{ x: HITBOX.left + 8, width: 1, height: 1 }], gap: 1000 }, 500)

    expect(spawned.cacti).toHaveLength(1)
    expect(spawned.cacti[0]!.x).toBeGreaterThan(38)
    expect(hit.isOver).toBe(true)
  })

  test('a dino in the air clears a cactus lower than it', () => {
    const d = { ...newDino(40, SEED), y: 3, vy: 0, cacti: [{ x: HITBOX.left, width: 1, height: 2 }], gap: 1000 }

    expect(stepDino(d, 10).isOver).toBe(false)
  })

  test('only the body counts: a cactus under the ear, before the body, is no hit', () => {
    const d = { ...newDino(40, SEED), cacti: [{ x: HITBOX.left - 1.5, width: 1, height: 2 }], gap: 1000 }

    expect(stepDino(d, 10).isOver).toBe(false)
    expect(stepDino({ ...d, cacti: [{ x: HITBOX.left, width: 1, height: 2 }] }, 10).isOver).toBe(true)
  })

  test('every gap is long enough to land and jump again, even at top speed', () => {
    // At the slowest the cacti come closest in time: from one start to the next, the flight (0.8 s) and a landing must fit.
    const gaps = Array.from({ length: 300 }, (_, i) => newDino(10_000, { seed: i }).gap)

    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(Math.ceil(18 * 0.9) + HITBOX.width + 3)
  })
})
