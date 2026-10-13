import { describe, expect, test } from 'claude-code/testing'

import type { Flappy } from './flappy'
import { BIRD_X, CHEER_MS, FLAPPY, GAP, HITBOX, MAX_GAP_SHIFT, PIPE_WIDTH, WING_MS, drawFlappy, flap, newFlappy, tickFlappy } from './flappy'
import { PALETTE, widthOf } from './style'
import type { Row } from './types'

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

  test('draws the mascot in Claude’s orange, the pipes, and the ground as the bottom edge of a rounded frame', () => {
    const f = { ...flying(), flapFor: 0, y: 5, pipes: [{ x: 40, gapTop: 6, isPassed: false }] }
    const rows = drawFlappy(f)
    const text = textOf(rows)

    expect(rows).toHaveLength(f.height + 2)
    expect(text[1 + 5]!.slice(1 + BIRD_X, 1 + BIRD_X + 9)).toBe(' ▐▛███▜▌ ')
    expect(rows.flat().some(s => s.fg === '#d97757')).toBe(true)
    expect(text[1 + 0]![1 + 40]).toBe('▐')
    expect(text[1 + 8]![1 + 40]).toBe(' ')
    expect(text[0]).toMatch(/^╭─ spazio ─+╮$/)
    expect(text[text.length - 1]).toMatch(/^╰[─┴]+╯$/)
  })
})

const textOf = (rows: Row[]) => rows.map(r => r.map(s => s.text).join(''))
/** Each cell of a row with the colour it is drawn in. */
const cellsOf = (row: Row) => row.flatMap(s => [...s.text].map(ch => ({ ch, fg: s.fg, bold: s.bold })))
/** The sky's cells drawn in one of `colors`, the rest blank: one layer of the drawing. */
const layerOf = (f: Flappy, colors: string[]) =>
  drawFlappy(f)
    .slice(1, -1)
    .map(r => cellsOf(r).slice(1, -1).map(c => (c.fg !== undefined && colors.includes(c.fg) ? c.ch : ' ')).join(''))
/** No pipe, no mascot in the way: the far sky alone, `distance` columns into the flight. */
const farSky = (distance: number): Flappy => ({ ...flying(), y: 0, distance, pipes: [] })

describe('the look', () => {
  test('fits the room: every row within the columns, the frame within the rows', () => {
    for (const columns of [40, 80, 100]) {
      for (const rows of [12, 21, 30]) {
        const f = { ...flap(newFlappy(columns, rows, SEED)), pipes: [{ x: 10, gapTop: 1, isPassed: false }] }
        const drawn = drawFlappy(f)

        expect(drawn.length).toBeLessThanOrEqual(rows)
        expect(drawn.every(r => widthOf(r) === columns)).toBe(true)
      }
    }
  })

  test('a wide room centers the frame', () => {
    const rows = drawFlappy(newFlappy(140, 21, SEED))

    expect(textOf(rows)[0]!.indexOf('╭')).toBe(20)
    expect(rows.every(r => widthOf(r) === 120)).toBe(true)
  })

  test('a flap lifts the wings and lights the key in the top edge; they come down after a moment', () => {
    const up = { ...flying(), y: 5 }
    const later = { ...tickFlappy(up, WING_MS), vy: 0 }

    expect(textOf(drawFlappy(up))[1 + 6]!.slice(1 + BIRD_X, 1 + BIRD_X + 9)).toBe('▐▜█████▛▌')
    expect(drawFlappy(up)[0]!.find(s => s.text.includes('spazio'))?.fg).toBe(PALETTE.sky)
    expect(textOf(drawFlappy(later))[Math.round(later.y) + 2]!.slice(1 + BIRD_X, 1 + BIRD_X + 9)).toBe('▝▜█████▛▘')
    expect(drawFlappy(later)[0]!.find(s => s.text.includes('spazio'))?.fg).toBe(PALETTE.label)
  })

  test('in a fast fall the wings trail down', () => {
    const diving = { ...flying(), flapFor: 0, y: 5, vy: 12 }

    expect(textOf(drawFlappy(diving))[1 + 6]!.slice(1 + BIRD_X, 1 + BIRD_X + 9)).toBe('▗▜█████▛▖')
  })

  test('a pipe is shaded across its body, with a solid cap at each side of the gap', () => {
    const f = { ...flying(), flapFor: 0, y: 5, pipes: [{ x: 30, gapTop: 6, isPassed: false }] }
    const rows = drawFlappy(f)
    const body = cellsOf(rows[1 + 2]!).slice(1 + 30, 1 + 34)
    const cap = cellsOf(rows[1 + 5]!).slice(1 + 30, 1 + 34)

    expect(body.map(c => c.ch).join('')).toBe('▐██▌')
    expect(new Set(body.map(c => c.fg)).size).toBeGreaterThanOrEqual(3)
    expect(cap.map(c => c.ch).join('')).toBe('████')
    expect(textOf(rows)[1 + 6 + GAP]!.slice(1 + 30, 1 + 34)).toBe('████')
    expect(textOf(rows)[1 + 6 + GAP + 1]!.slice(1 + 30, 1 + 34)).toBe('▐██▌')
  })

  test('passing a pipe flashes the frame green, floats a +1 over the head and cuts one into the ground, then fades', () => {
    const f = { ...flying(), y: 8, pipes: [{ x: HITBOX.left - PIPE_WIDTH + 0.5, gapTop: 6, isPassed: false }] }
    const passed = { ...tickFlappy(f, 50), vy: 0 }
    const rows = drawFlappy(passed)
    const text = textOf(rows)

    expect(passed.cheerFor).toBe(CHEER_MS)
    expect(rows[0]![0]!.fg).toBe(PALETTE.good)
    expect(text[1 + 8 - 1]!.slice(1 + BIRD_X + 3, 1 + BIRD_X + 5)).toBe('+1')
    expect(text[text.length - 1]).toContain(' +1 ')
    expect(rows[rows.length - 1]!.find(s => s.text.includes('+1'))?.fg).toBe(PALETTE.good)

    // Held level while the time passes, so the fall does not end the flight.
    const held = Array.from({ length: CHEER_MS / 50 }).reduce<Flappy>(acc => tickFlappy({ ...acc, y: 8, vy: 0 }, 50), passed)
    const faded = drawFlappy(held)

    expect(held.isOver).toBe(false)
    expect(faded[0]![0]!.fg).toBe(PALETTE.frame)
    expect(textOf(faded).join('\n')).not.toContain('+1')
  })

  test('a crash turns the frame and the mascot red, crosses its eyes and throws sparks', () => {
    const crashed = tickFlappy({ ...flying(), y: 2, pipes: [{ x: HITBOX.left, gapTop: 6, isPassed: false }] }, 10)
    const rows = drawFlappy(crashed)
    const text = textOf(rows)
    const top = Math.round(crashed.y)

    expect(crashed.isOver).toBe(true)
    expect(text[0]).toContain('schianto!')
    expect(rows[0]![0]!.fg).toBe(PALETTE.danger)
    expect(text[1 + top]!.slice(1 + BIRD_X, 1 + BIRD_X + 9)).toBe(' ▐╳███╳▌ ')
    expect(cellsOf(rows[1 + top]!)[1 + BIRD_X + 2]!.fg).toBe(PALETTE.danger)
    expect(text.join('\n')).toContain('✸')
  })

  test('the far sky stays behind the mascot: nothing of it shows between its ears or feet', () => {
    const boxes = [0, 31, 77, 143, 260].flatMap(distance =>
      [0, 5, 9, 14].map(y => {
        const rows = drawFlappy({ ...flying(), flapFor: 0, distance, y })
        return rows.slice(1 + y, 1 + y + 3).flatMap(r => cellsOf(r).slice(1 + BIRD_X, 1 + BIRD_X + 9))
      }),
    )

    expect(boxes.flat().filter(c => c.ch !== ' ' && c.fg !== '#d97757')).toEqual([])
  })

  test('the far sky has stars, clouds and a skyline, each drifting slower than the pipes', () => {
    const STARS = ['#52525b', PALETTE.label]
    const OTHERS = [PALETTE.faint, PALETTE.frame]
    /** The layer `distance` columns in, against the start moved left by `by`, where no nearer layer hides either. */
    const drift = (colors: string[], distance: number, by: number) => {
      const [now, then] = [layerOf(farSky(distance), colors), layerOf(farSky(0), colors)]
      const nearer = OTHERS.filter(c => !colors.includes(c))
      const [nowCover, thenCover] = [layerOf(farSky(distance), nearer), layerOf(farSky(0), nearer)]
      const seen = now.flatMap((r, y) => [...r].slice(0, -by).filter((_, x) => nowCover[y]![x] === ' ' && thenCover[y]![x + by] === ' '))
      const was = then.flatMap((r, y) => [...r].slice(by).filter((_, x) => nowCover[y]![x] === ' ' && thenCover[y]![x + by] === ' '))
      return { seen: seen.join(''), was: was.join('') }
    }

    // The pipes move one column per column flown; the skyline a quarter, the clouds under half, the stars a tenth.
    for (const [colors, distance, by] of [[[PALETTE.faint], 12, 3], [[PALETTE.frame], 20, 9], [STARS, 10, 1]] as const) {
      const { seen, was } = drift([...colors], distance, by)

      expect(seen.trim()).not.toBe('')
      expect(seen).toBe(was)
      expect(layerOf(farSky(distance), [...colors])).not.toEqual(layerOf(farSky(0), [...colors]))
    }
  })
})
