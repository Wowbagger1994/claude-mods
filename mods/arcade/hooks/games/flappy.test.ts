import { describe, expect, test } from 'claude-code/testing'

import type { Flappy } from './flappy'
import { BIRD_X, FLAPPY, GAP, HITBOX, MAX_GAP_SHIFT, PIPE_WIDTH, drawFlappy, flap, newFlappy, tickFlappy } from './flappy'

const SEED = { seed: 5 }
const fresh = (): Flappy => newFlappy(80, 21, SEED)
const run = (f: Flappy, ms: number) => Array.from({ length: ms / 50 }).reduce<Flappy>(acc => tickFlappy(acc, 50), f)
/** Flying, no pipe for a long while. */
const flying = (): Flappy => ({ ...flap(fresh()), vy: 0, nextIn: 1e6 })

describe('flappy', () => {
  test('hovers until the first flap', () => {
    const f = fresh()

    expect(run(f, 1_000)).toEqual(f)
    expect(FLAPPY.status?.(f)).toBe('spazio per partire')
    expect(flap(f).isFlying).toBe(true)
  })

  test('a flap lifts it about two rows, then gravity pulls it down', () => {
    const f = flap({ ...flying(), y: 8 })
    const top = Array.from({ length: 20 }).reduce<{ f: Flappy; min: number }>(
      acc => {
        const next = tickFlappy(acc.f, 50)
        return { f: next, min: Math.min(acc.min, next.y) }
      },
      { f, min: f.y },
    )

    expect(8 - top.min).toBeGreaterThan(1.8)
    expect(8 - top.min).toBeLessThan(2.6)
    expect(top.f.y).toBeGreaterThan(8)
  })

  test('falling to the ground ends the flight', () => {
    const f = run(flying(), 3_000)

    expect(f.isOver).toBe(true)
    expect(tickFlappy(f, 50)).toBe(f)
    expect(flap(f)).toBe(f)
  })

  test('scores a pipe once it is behind the body', () => {
    const f = { ...flying(), y: 8, pipes: [{ x: HITBOX.left - PIPE_WIDTH + 0.5, gapTop: 6, isPassed: false }] }
    const after = tickFlappy(f, 50)

    expect(after.score).toBe(1)
    expect(tickFlappy({ ...after, vy: 0 }, 50).score).toBe(1)
  })

  test('touching a pipe outside its gap ends the flight; inside the gap it does not', () => {
    const pipe = { x: HITBOX.left, gapTop: 6, isPassed: false }

    expect(tickFlappy({ ...flying(), y: 2, pipes: [pipe] }, 10).isOver).toBe(true)
    expect(tickFlappy({ ...flying(), y: 8, pipes: [pipe] }, 10).isOver).toBe(false)
  })

  test('the ears and feet do not count: a pipe under the ear is no hit', () => {
    // Over the ear's two columns (BIRD_X, BIRD_X + 1), short of the body.
    const pipe = { x: BIRD_X - PIPE_WIDTH + 1.5, gapTop: 12, isPassed: true }

    expect(tickFlappy({ ...flying(), y: 2, pipes: [pipe] }, 10).isOver).toBe(false)
  })

  test('gaps are tall enough, inside the sky, and within reach of the last one', () => {
    const f = run(flap(fresh()), 0)
    const gaps = Array.from({ length: 60 }).reduce<{ f: Flappy; tops: number[] }>(
      acc => {
        // keep it flying in the middle so the pipes keep coming
        const next = tickFlappy({ ...acc.f, y: 8, vy: 0 }, 2_000)
        return { f: { ...next, isOver: false, pipes: next.pipes.slice(-2) }, tops: [...acc.tops, ...next.pipes.slice(-1).map(p => p.gapTop)] }
      },
      { f, tops: [] },
    ).tops

    expect(GAP).toBeGreaterThanOrEqual(7)
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1)
    expect(Math.max(...gaps) + GAP).toBeLessThanOrEqual(fresh().height - 1)
    expect(Math.max(...gaps.slice(1).map((g, i) => Math.abs(g - gaps[i]!)))).toBeLessThanOrEqual(MAX_GAP_SHIFT)
  })

  test('draws the mascot in Claude’s orange, the pipes and the ground', () => {
    const f = { ...flying(), y: 5, pipes: [{ x: 40, gapTop: 6, isPassed: false }] }
    const rows = drawFlappy(f)
    const text = rows.map(r => r.map(s => s.text).join(''))

    expect(rows).toHaveLength(f.height + 1)
    expect(text[5]!.slice(BIRD_X, BIRD_X + 9)).toBe(' ▐▛███▜▌ ')
    expect(rows.flat().some(s => s.fg === '#d97757')).toBe(true)
    expect(text[0]![40]).toBe('█')
    expect(text[8]![40]).toBe(' ')
    expect(text[text.length - 1]).toMatch(/^▔+$/)
  })
})
