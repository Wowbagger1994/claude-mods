import { describe, expect, test } from 'claude-code/testing'

import type { Bugs } from './bugs'
import { BUGS, FAST_BONUS, HIT_POINTS, LIVES, ROUND_MS, drawBugs, lifeAt, newBugs, pressBugs, spawnGapAt, tickBugs } from './bugs'

const SEED = { seed: 11 }
const fresh = (): Bugs => newBugs(80, SEED)
/** A round with one bug in `cell`, `age` ms old, living 1 s. */
const withBug = (cell: number, age = 0): Bugs => ({ ...fresh(), bugs: [{ cell, age, life: 1_000 }], spawnIn: 10_000 })
const run = (g: Bugs, ms: number) => Array.from({ length: ms / 50 }).reduce<Bugs>(acc => tickBugs(acc, 50), g)

describe('bugs', () => {
  test('starts empty with 30 seconds and three lives; the first bug comes soon', () => {
    const g = fresh()
    const later = run(g, 700)

    expect([g.bugs.length, g.timeLeft, g.lives]).toEqual([0, ROUND_MS, LIVES])
    expect(later.bugs).toHaveLength(1)
    expect(later.bugs[0]!.cell).toBeGreaterThanOrEqual(1)
    expect(later.bugs[0]!.cell).toBeLessThanOrEqual(9)
  })

  test('a quick hit scores the bonus, a late one the points alone', () => {
    const quick = pressBugs(withBug(5, 100), '5')
    const late = pressBugs(withBug(5, 600), '5')

    expect(quick.score).toBe(HIT_POINTS + FAST_BONUS)
    expect(late.score).toBe(HIT_POINTS)
    expect(quick.bugs).toEqual([])
    expect(quick.flash).toMatchObject({ cell: 5, isHit: true })
  })

  test('a digit on an empty cell costs a life; other keys do nothing', () => {
    const missed = pressBugs(withBug(5), '4')

    expect(missed.lives).toBe(LIVES - 1)
    expect(missed.flash).toMatchObject({ cell: 4, isHit: false })
    expect(pressBugs(withBug(5), 'x')).toEqual(withBug(5))
    expect(pressBugs(withBug(5), '0')).toEqual(withBug(5))
  })

  test('a bug left too long escapes and costs a life', () => {
    const g = run(withBug(3), 1_000)

    expect(g.bugs.some(b => b.cell === 3)).toBe(false)
    expect(g.lives).toBe(LIVES - 1)
  })

  test('bugs live shorter and come faster as the round goes on', () => {
    expect(lifeAt(ROUND_MS)).toBeLessThan(lifeAt(0))
    expect(spawnGapAt(ROUND_MS)).toBeLessThan(spawnGapAt(0))
  })

  test('the round ends when time runs out, or at the third life lost', () => {
    const timed = run({ ...fresh(), spawnIn: 1e9 }, ROUND_MS)
    const broke = ['1', '2', '3'].reduce(pressBugs, { ...fresh(), spawnIn: 1e9 })

    expect(timed.isOver).toBe(true)
    expect(broke.isOver).toBe(true)
    expect(pressBugs(broke, '1')).toBe(broke)
  })

  test('puts a new bug in a free cell, and none when all nine are taken', () => {
    const eight = Array.from({ length: 8 }, (_, i) => ({ cell: i + 1, age: 0, life: 1e9 }))
    const g = tickBugs({ ...fresh(), bugs: eight, spawnIn: 0 }, 50)
    const full = tickBugs({ ...g, spawnIn: 0 }, 50)

    expect(g.bugs.map(b => b.cell).sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(full.bugs).toHaveLength(9)
  })

  test('draws the grid as the keypad: 7 8 9 on top, 1 2 3 at the bottom, the bug in its cell', () => {
    const rows = drawBugs(withBug(9)).map(r => r.map(s => s.text).join(''))

    expect(rows[0]).toMatch(/ 7 .* 8 .* 9 /)
    expect(rows[rows.length - 3]).toMatch(/ 1 .* 2 .* 3 /)
    expect(rows[1]).toContain('╲▄█▄╱')
    expect(rows[rows.length - 2]).not.toContain('╲▄█▄╱')
    expect(BUGS.status?.(withBug(9))).toBe('⏱ 30 s · ♥♥♥')
  })
})
