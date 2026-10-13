import { describe, expect, test } from 'claude-code/testing'

import type { Bugs } from './bugs'
import { BUGS, FAST_BONUS, HIT_POINTS, LIVES, ROOMY_ROWS, ROUND_MS, drawBugs, lifeAt, newBugs, pressBugs, spawnGapAt, tickBugs } from './bugs'

const SEED = { seed: 11 }
const fresh = (): Bugs => newBugs(80, SEED)
/** A round with one bug in `cell`, `age` ms old, living 1 s. */
const withBug = (cell: number, age = 0): Bugs => ({ ...fresh(), bugs: [{ cell, age, life: 1_000 }], spawnIn: 10_000 })
const text = (rows: ReturnType<typeof drawBugs>) => rows.map(r => r.map(s => s.text).join(''))
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
    const rows = text(drawBugs(withBug(9)))

    expect(rows[1]).toMatch(/╭─ 7 ─+╮ ╭─ 8 ─+╮ ╭─ 9 ─+╮/)
    expect(rows[rows.length - 5]).toMatch(/╭─ 1 ─+╮ ╭─ 2 ─+╮ ╭─ 3 ─+╮/)
    expect(rows[3]).toMatch(/│ +· +│ │ +· +│ │ +━▐●█●▌━ +│/)
    expect(rows[rows.length - 2]).not.toContain('▐●█●▌')
    expect(BUGS.status?.(withBug(9))).toBe('⏱ 30 s · ♥♥♥')
  })

  test('with room the cells are tall under the time bar; with little they are short and the bar goes', () => {
    const tall = drawBugs({ ...withBug(9), rows: ROOMY_ROWS })
    const short = drawBugs({ ...withBug(9), rows: ROOMY_ROWS - 1 })

    expect(tall).toHaveLength(ROOMY_ROWS)
    expect(text(tall)[0]).toContain('▕')
    expect(short).toHaveLength(9)
    expect(text(short)[0]).toContain('╭─ 7')
    expect(text(short)[1]).toContain('━▐●█●▌━')
  })

  test('a game started in a low pane gets the short cells', () => {
    const low = BUGS.create({ columns: 80, rows: 12, rng: SEED, words: [] })
    const high = BUGS.create({ columns: 80, rows: 30, rng: SEED, words: [] })

    expect([BUGS.draw(low).length, BUGS.draw(high).length]).toEqual([9, ROOMY_ROWS])
  })

  test('the bar under a bug is the life it has left, and the bug turns amber, then red', () => {
    const bottom = (age: number) => drawBugs(withBug(9, age))[5]!
    const bar = (age: number) => bottom(age).filter(s => s.text.includes('▰')).map(s => s.text).join('')
    const colorOf = (age: number) => bottom(age).find(s => s.text.includes('▰'))?.fg

    expect([bar(0), bar(500), bar(900)].map(b => [...b].filter(c => c === '▰').length)).toEqual([9, 5, 1])
    expect([colorOf(0), colorOf(500), colorOf(900)]).toEqual(['#c084fc', '#f59e0b', '#ef4444'])
  })

  test('the legs take turns as the bug lives', () => {
    expect(text(drawBugs(withBug(9, 0)))[2]).toContain('╲▗▄▖╱')
    expect(text(drawBugs(withBug(9, 200)))[2]).toContain('╱▗▄▖╲')
  })

  test('a hit shows the bug squashed and the points it made; a miss says so', () => {
    const hit = text(drawBugs(pressBugs(withBug(5, 100), '5')))
    const miss = text(drawBugs(pressBugs(withBug(5), '1')))

    expect(hit[8]).toContain('━━ ✸ ━━')
    expect(hit[10]).toMatch(/╰─+ \+15 ─+╯/)
    expect(miss[13]).toContain('✗ mancato')
  })

  test('the time bar empties as the round goes, and every row fits the room', () => {
    const bar = (timeLeft: number) => text(drawBugs({ ...fresh(), timeLeft }))[0]!
    const fill = (timeLeft: number) => [...bar(timeLeft)].filter(c => c === '█').length

    expect(bar(ROUND_MS)).toMatch(/▏ 30 s$/)
    expect(fill(ROUND_MS)).toBeGreaterThan(fill(ROUND_MS / 2))
    expect(fill(ROUND_MS / 2)).toBeGreaterThan(fill(1_000))
    for (const columns of [36, 41, 80]) {
      const widths = text(drawBugs({ ...withBug(9), columns })).map(r => [...r].length)
      expect(Math.max(...widths)).toBeLessThanOrEqual(Math.max(columns, 35))
    }
  })
})
