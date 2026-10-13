import { describe, expect, test } from 'claude-code/testing'

import type { Ball, Breakout, Drop } from './breakout'
import {
  BASE_SPEED,
  BONUS_COLORS,
  BREAKOUT,
  BRICK_TOP,
  breakBrick,
  CLEARED_MS,
  COLORS,
  keyBreakout,
  LIGHTS,
  LIVES,
  LOST_MS,
  MAX_LIVES,
  messageRow,
  newBreakout,
  PADDLE,
  PADDLE_LIGHT,
  PADDLE_STEP,
  PADDLE_WIDTH,
  paddleRow,
  paddleWidth,
  pointsOf,
  POPUP_MS,
  ROW_POINTS,
  SHATTER_MS,
  SLOW_FACTOR,
  SLOW_MS,
  speedAt,
  tickBreakout,
  WIDE_MS,
  WIDE_PADDLE_WIDTH,
} from './breakout'
import { PALETTE, widthOf } from './style'
import type { Row, Span } from './types'

const SEED = { seed: 11 }
const CTX = { columns: 60, rows: 20, rng: SEED, words: [] }

/** A fresh game 58 columns by 18 rows: six rows of nine bricks six columns wide, two columns in. */
const fresh = (): Breakout => newBreakout(60, 20, SEED)
/** The game with the ball in flight as given. */
const flying = (g: Breakout, ball: Ball): Breakout => ({ ...g, phase: 'play', ball })
/** The middle column of the brick in column `col`. */
const brickMiddle = (g: Breakout, col: number) => g.brickLeft + col * g.brickWidth + g.brickWidth / 2
/** The wall with only the bricks `keep` says stay. */
const wallOf = (g: Breakout, keep: (row: number, col: number) => boolean): Breakout => ({
  ...g,
  bricks: g.bricks.map((row, r) => row.map((_, c) => keep(r, c))),
})
/** A ball parked mid-field, barely moving, for tests about something else. */
const PARKED: Ball = { x: 1.5, y: 24, vx: 0, vy: -0.1 }
/** A number to three decimals, to compare speeds and places computed with sines. */
const close = (n: number) => Math.round(n * 1000) / 1000 + 0

const textOf = (rows: Row[]) => rows.map(r => r.map(s => s.text).join(''))
/** The span drawn at column `x` of a row. */
const spanAt = (row: Row, x: number): Span | undefined => {
  let at = 0
  for (const span of row) {
    const width = [...span.text].length
    if (x < at + width) return { ...span, text: [...span.text][x - at]! }
    at += width
  }
  return undefined
}
/** The span at field column `x`, text row `row` (inside the frame, the board drawn flush left). */
const cellAt = (g: Breakout, x: number, row: number) => spanAt(BREAKOUT.draw(g)[row + 1]!, x + 1)
const frameColor = (rows: Row[]) => rows[0]!.find(s => s.text.startsWith('╭'))?.fg

describe('breakout rules', () => {
  test('a field that fits the room: wider and taller with room, a wall of three to six rows', () => {
    const small = newBreakout(40, 12, SEED)
    const big = newBreakout(100, 30, SEED)

    expect([small.width, small.height, small.bricks.length, small.bricks[0]!.length]).toEqual([38, 10, 3, 7])
    expect([big.width, big.height, big.bricks.length, big.bricks[0]!.length]).toEqual([58, 22, 6, 9])
    expect(small.brickLeft).toBe(1)
    expect([fresh().lives, fresh().phase, fresh().level, fresh().score]).toEqual([LIVES, 'serve', 1, 0])
  })

  test('the ball waits on the paddle and rides along as it moves', () => {
    const g = fresh()

    expect(Math.floor(g.ball.y)).toBe(paddleRow(g) - 1)
    expect(g.ball.x).toBe(g.paddleX + PADDLE_WIDTH / 2)
    const moved = keyBreakout(g, 'right')
    expect(moved.paddleX).toBe(g.paddleX + PADDLE_STEP)
    expect(moved.ball.x).toBe(g.ball.x + PADDLE_STEP)
    expect(tickBreakout(moved, 1000).ball).toEqual(moved.ball)
  })

  test('arrows and a/d move the paddle, never through a wall', () => {
    const g = fresh()

    expect(keyBreakout(g, 'a').paddleX).toBe(g.paddleX - PADDLE_STEP)
    expect(keyBreakout(g, 'd').paddleX).toBe(g.paddleX + PADDLE_STEP)
    const left = Array.from({ length: 30 }).reduce<Breakout>(s => keyBreakout(s, 'left'), g)
    const right = Array.from({ length: 30 }).reduce<Breakout>(s => keyBreakout(s, 'right'), g)
    expect(left.paddleX).toBe(0)
    expect(right.paddleX).toBe(g.width - PADDLE_WIDTH)
  })

  test('space or up launches the ball upward at the level speed; other keys do not', () => {
    const g = fresh()
    const byUp = keyBreakout(g, 'up')
    const bySpace = keyBreakout(g, ' ')

    expect(byUp.phase).toBe('play')
    expect(bySpace.ball.vy).toBeLessThan(0)
    expect(close(Math.hypot(bySpace.ball.vx, bySpace.ball.vy))).toBe(close(BASE_SPEED))
    expect(Math.abs(bySpace.ball.vx)).toBeGreaterThan(0)
    expect(keyBreakout(g, 'x')).toEqual(g)
    expect(keyBreakout(g, 'down')).toEqual(g)
    // A second launch in flight changes nothing.
    expect(keyBreakout(bySpace, ' ')).toEqual(bySpace)
  })

  test('the launch slants left or right with the seed', () => {
    const sides = Array.from({ length: 8 }, (_, seed) => Math.sign(keyBreakout(newBreakout(60, 20, { seed }), ' ').ball.vx))

    expect(new Set(sides)).toEqual(new Set([-1, 1]))
  })

  test('the ball bounces off the side walls and the ceiling', () => {
    const g = wallOf(fresh(), () => false)
    const fromLeft = tickBreakout(flying(g, { x: 0.5, y: 20, vx: -20, vy: 0 }), 50)
    const fromRight = tickBreakout(flying(g, { x: g.width - 0.5, y: 20, vx: 20, vy: 0 }), 50)
    const fromTop = tickBreakout(flying(g, { x: 10, y: 0.5, vx: 0, vy: -20 }), 50)

    expect(fromLeft.ball.vx).toBe(20)
    expect(close(fromLeft.ball.x)).toBe(close(0.5))
    expect(fromRight.ball.vx).toBe(-20)
    expect(fromRight.ball.x).toBeLessThan(g.width)
    expect(fromTop.ball.vy).toBe(20)
    expect(close(fromTop.ball.y)).toBe(close(0.5))
  })

  test('a brick hit from below breaks, scores its row and sends the ball back down', () => {
    const g = fresh()
    const bottom = g.bricks.length - 1
    const below = (BRICK_TOP + g.bricks.length) * 2 + 0.2
    const hit = tickBreakout(flying(g, { x: brickMiddle(g, 0), y: below, vx: 0, vy: -24 }), 50)

    expect(hit.bricks[bottom]![0]).toBe(false)
    expect(hit.bricks.flat().filter(b => !b)).toHaveLength(1)
    expect(hit.score).toBe(ROW_POINTS)
    expect(hit.ball.vy).toBe(24)
  })

  test('the higher the row, the more a brick is worth', () => {
    const g = fresh()

    expect(g.bricks.map((_, row) => pointsOf(g, row))).toEqual([60, 50, 40, 30, 20, 10])
    // Only the top brick of column 0 left standing above an open shaft: it scores 60.
    const shaft = wallOf(g, (r, c) => c !== 0 || r === 0)
    const hit = tickBreakout(flying(shaft, { x: brickMiddle(g, 0), y: BRICK_TOP * 2 + 2.2, vx: 0, vy: -24 }), 50)
    expect(hit.score).toBe(6 * ROW_POINTS)
  })

  test('a brick hit from the side sends the ball back across', () => {
    const g = wallOf(fresh(), (r, c) => !(r === 5 && c === 1))
    const row = (BRICK_TOP + 5) * 2 + 0.5
    const hit = tickBreakout(flying(g, { x: g.brickLeft + g.brickWidth + 0.3, y: row, vx: -24, vy: 0 }), 50)

    expect(hit.bricks[5]![0]).toBe(false)
    expect(hit.ball.vx).toBe(24)
  })

  test('the paddle sends the ball up, slanting more the nearer an end it lands', () => {
    const g = fresh()
    const top = paddleRow(g)
    const landOn = (x: number) => tickBreakout(flying(g, { x, y: top - 0.3, vx: 0, vy: 24 }), 50).ball
    const middle = landOn(g.paddleX + PADDLE_WIDTH / 2)
    const nearRight = landOn(g.paddleX + PADDLE_WIDTH - 0.5)
    const nearLeft = landOn(g.paddleX + 0.5)

    expect(close(middle.vy)).toBe(close(-24))
    expect(close(middle.vx)).toBe(close(0))
    expect(nearRight.vx).toBeGreaterThan(10)
    expect(nearLeft.vx).toBeLessThan(-10)
    expect(nearRight.vy).toBeLessThan(0)
    expect(close(Math.hypot(nearRight.vx, nearRight.vy))).toBe(close(24))
    expect(nearRight.y).toBeLessThan(top)
  })

  test('a ball past the paddle costs a life, then the next one waits on the paddle', () => {
    const g = fresh()
    const beside = g.paddleX + PADDLE_WIDTH + 3
    const lost = tickBreakout(flying(g, { x: beside, y: paddleRow(g) - 0.3, vx: 0, vy: 30 }), 100)

    expect([lost.lives, lost.phase, lost.isOver]).toEqual([LIVES - 1, 'lost', false])
    expect(lost.lostX).toBe(Math.floor(beside))
    expect(tickBreakout(lost, LOST_MS - 1).phase).toBe('lost')
    const next = tickBreakout(lost, LOST_MS)
    expect(next.phase).toBe('serve')
    expect(next.ball.x).toBe(next.paddleX + PADDLE_WIDTH / 2)
  })

  test('the last ball lost ends the game, and nothing moves after', () => {
    const g = { ...fresh(), lives: 1 }
    const over = tickBreakout(flying(g, { x: 1, y: paddleRow(g) + 1, vx: 0, vy: 30 }), 100)

    expect([over.lives, over.isOver]).toEqual([0, true])
    expect(keyBreakout(over, 'left')).toEqual(over)
    expect(tickBreakout(over, 5000)).toEqual(over)
  })

  test('the last brick clears the level: a moment, then a full wall and a faster ball', () => {
    const g = wallOf(fresh(), (r, c) => r === 5 && c === 0)
    const below = (BRICK_TOP + 6) * 2 + 0.2
    const cleared = tickBreakout(flying(g, { x: brickMiddle(g, 0), y: below, vx: 0, vy: -24 }), 50)

    expect(cleared.phase).toBe('cleared')
    expect(tickBreakout(cleared, CLEARED_MS - 1).level).toBe(1)
    const next = tickBreakout(cleared, CLEARED_MS)
    expect([next.level, next.phase]).toEqual([2, 'serve'])
    expect(next.bricks.flat().every(Boolean)).toBe(true)
    expect(speedAt(2)).toBeGreaterThan(speedAt(1))
    const launched = keyBreakout(next, ' ')
    expect(close(Math.hypot(launched.ball.vx, launched.ball.vy))).toBe(close(speedAt(2)))
  })

  test('broken bricks sometimes drop a bonus, under the brick', () => {
    const g = fresh()
    const broken = g.bricks.flatMap((row, r) => row.map((_, c) => ({ row: r, col: c }))).reduce(breakBrick, flying(g, PARKED))
    const all = g.bricks.length * g.bricks[0]!.length

    // The last brick clears the wall and takes the drops with it: count them one brick short.
    const nearly = g.bricks.flatMap((row, r) => row.map((_, c) => ({ row: r, col: c }))).slice(0, -1).reduce(breakBrick, flying(g, PARKED))
    expect(nearly.drops.length).toBeGreaterThan(0)
    expect(nearly.drops.length).toBeLessThan(all / 2)
    expect(new Set(nearly.drops.map(d => d.kind)).size).toBeGreaterThan(1)
    expect(broken.drops).toEqual([])
    const first = nearly.drops[0]!
    expect(close((first.x - g.brickLeft - g.brickWidth / 2) % g.brickWidth)).toBe(close(0))
  })

  /** A game in flight with a bonus of `kind` about to land on the paddle's middle. */
  const aboutToCatch = (kind: Drop['kind'], g: Breakout = fresh()): Breakout =>
    flying({ ...g, drops: [{ kind, x: g.paddleX + 3, y: paddleRow(g) - 1.2 }] }, PARKED)

  test('a wide bonus caught widens the paddle about its middle for a while', () => {
    const g = aboutToCatch('wide')
    const wide = tickBreakout(g, 50)

    expect(wide.drops).toEqual([])
    expect(paddleWidth(wide)).toBe(WIDE_PADDLE_WIDTH)
    expect(wide.paddleX).toBe(g.paddleX - 2)
    const later = tickBreakout(wide, WIDE_MS)
    expect(paddleWidth(later)).toBe(PADDLE_WIDTH)
    expect(later.paddleX).toBe(g.paddleX)
  })

  test('a slow bonus slows the ball for a while', () => {
    const ball = { x: 10, y: 30, vx: 0, vy: -10 }
    const slow = tickBreakout(aboutToCatch('slow'), 50)
    const normal = tickBreakout(flying(fresh(), ball), 1000)
    const slowed = tickBreakout(flying(slow, ball), 1000)

    expect(slow.slowMs).toBe(SLOW_MS)
    expect(close(30 - normal.ball.y)).toBe(close(10))
    expect(close(30 - slowed.ball.y)).toBe(close(10 * SLOW_FACTOR))
    expect(tickBreakout(slow, SLOW_MS).slowMs).toBe(0)
  })

  test('a heart caught is a life more, up to five', () => {
    expect(tickBreakout(aboutToCatch('life'), 50).lives).toBe(LIVES + 1)
    expect(tickBreakout(aboutToCatch('life', { ...fresh(), lives: MAX_LIVES }), 50).lives).toBe(MAX_LIVES)
  })

  test('a bonus the paddle misses falls out of the field', () => {
    const g = fresh()
    const missed = flying({ ...g, drops: [{ kind: 'wide', x: g.width - 2, y: paddleRow(g) - 1.2 }] }, PARKED)

    expect(tickBreakout(missed, 50).drops).toHaveLength(1)
    expect(paddleWidth(tickBreakout(missed, 50))).toBe(PADDLE_WIDTH)
    expect(tickBreakout(missed, 1000).drops).toEqual([])
  })

  test('a lost ball takes the bonuses with it', () => {
    const g = { ...fresh(), wideMs: 5000, slowMs: 5000, drops: [{ kind: 'slow' as const, x: 3, y: 20 }] }
    const lost = tickBreakout(flying(g, { x: g.width - 1, y: paddleRow(g) + 1, vx: 0, vy: 30 }), 100)

    expect([lost.wideMs, lost.slowMs, lost.drops]).toEqual([0, 0, []])
  })
})

describe('breakout drawing', () => {
  test('a rounded frame, the level in its top edge and the lives in its bottom one', () => {
    const text = textOf(BREAKOUT.draw(fresh()))

    expect(text).toHaveLength(20)
    expect(text[0]).toMatch(/^╭─ livello 1 ─+╮$/)
    expect(text[19]).toMatch(/^╰─ ♥♥♥ ─+╯$/)
    expect(text.slice(1, -1).every(line => /^│.{58}│$/u.test(line))).toBe(true)
    expect(textOf(BREAKOUT.draw({ ...fresh(), lives: 1, level: 3 }))[19]).toMatch(/^╰─ ♥♡♡ ─/)
    expect(textOf(BREAKOUT.draw({ ...fresh(), level: 3 }))[0]).toContain(' livello 3 ')
    expect(BREAKOUT.status!(fresh())).toBe('mattoni 54')
  })

  test('bricks are bevelled tiles in a rainbow, red on top', () => {
    const g = fresh()

    g.bricks.forEach((_, row) => {
      const cell = cellAt(g, g.brickLeft, BRICK_TOP + row)
      expect(cell).toEqual({ text: '▆', fg: COLORS[row], bg: LIGHTS[row] })
    })
    expect(cellAt(g, g.brickLeft + g.brickWidth - 1, BRICK_TOP)?.text).toBe('▉')
    expect(cellAt(g, g.brickLeft + g.brickWidth - 1, BRICK_TOP)?.fg).not.toBe(COLORS[0])
    expect(textOf(BREAKOUT.draw(g))[BRICK_TOP + 1]).toContain('▆▆▆▆▆▉▆▆▆▆▆▉')
  })

  test('the ball is half a row tall: its pixel in the top or bottom half of a cell', () => {
    const g = wallOf(fresh(), () => false)
    const upper = cellAt(flying(g, { x: 10.5, y: 20.2, vx: 0, vy: 0 }), 10, 10)
    const lower = cellAt(flying(g, { x: 10.5, y: 21.7, vx: 0, vy: 0 }), 10, 10)

    expect(upper).toMatchObject({ text: '▀', fg: PALETTE.white })
    expect(lower).toMatchObject({ text: '▄', fg: PALETTE.white })
  })

  test('the ball leaves a faint trail one step behind', () => {
    const g = wallOf(fresh(), () => false)
    const rows = textOf(BREAKOUT.draw(flying(g, { x: 10.5, y: 20.5, vx: 0, vy: -40 })))

    expect(rows[11]!.slice(1, -1)[10]).toBe('▀')
    expect(rows[12]!.slice(1, -1)[10]).toBe('▀')
    expect(cellAt(flying(g, { x: 10.5, y: 20.5, vx: 0, vy: -40 }), 10, 11)?.fg).not.toBe(PALETTE.white)
  })

  test('the paddle is a bevelled bar: lit top, pink body, the ball resting on it', () => {
    const g = fresh()
    const middle = cellAt(g, g.paddleX + 3, g.height - 1)

    expect(middle).toEqual({ text: '▀', fg: PADDLE_LIGHT, bg: PADDLE })
    expect(textOf(BREAKOUT.draw(g))[g.height]!.trim()).toMatch(/^│ *▀{7} *│$/)
    expect(cellAt(g, g.paddleX + 3, g.height - 2)).toMatchObject({ text: '▄', fg: PALETTE.white })
    const wide = { ...g, wideMs: WIDE_MS }
    expect(textOf(BREAKOUT.draw(wide))[g.height]).toContain('▀'.repeat(11))
  })

  test('before a launch, the field says to press space', () => {
    const g = fresh()

    expect(textOf(BREAKOUT.draw(g))[messageRow(g) + 1]).toContain('spazio per lanciare')
    expect(textOf(BREAKOUT.draw(keyBreakout(g, ' '))).join('')).not.toContain('spazio per lanciare')
  })

  test('a broken brick flashes white, crumbles, and is gone; its points float up and fade', () => {
    const g = flying(fresh(), PARKED)
    const broken = breakBrick(g, { row: 0, col: 4 })
    const x = g.brickLeft + 4 * g.brickWidth

    expect(cellAt(broken, x, BRICK_TOP)).toMatchObject({ text: '█', fg: PALETTE.white })
    expect(cellAt(tickBreakout(broken, SHATTER_MS / 2), x, BRICK_TOP)).toMatchObject({ text: '░', fg: COLORS[0] })
    expect(cellAt(tickBreakout(broken, SHATTER_MS), x, BRICK_TOP)?.text).toBe(' ')

    const popupRow = (s: Breakout) => textOf(BREAKOUT.draw(s)).findIndex(line => line.includes('+60'))
    expect(popupRow(broken)).toBe(BRICK_TOP + 1)
    expect(popupRow(tickBreakout(broken, POPUP_MS / 2 + 1))).toBeLessThan(BRICK_TOP + 1)
    expect(popupRow(tickBreakout(broken, POPUP_MS))).toBe(-1)
  })

  test('a lost ball: the frame turns red, the field says so, a spark where it fell', () => {
    const g = fresh()
    const lost = tickBreakout(flying(g, { x: 3.5, y: paddleRow(g) + 1, vx: 0, vy: 30 }), 100)
    const rows = BREAKOUT.draw(lost)

    expect(frameColor(rows)).toBe(PALETTE.danger)
    expect(textOf(rows)[messageRow(g) + 1]).toContain('palla persa')
    expect(cellAt(lost, 3, g.height - 1)).toMatchObject({ text: '✸', fg: PALETTE.danger })
    expect(textOf(rows)[g.height + 1]).toMatch(/^╰─ ♥♥♡ ─/)
    expect(frameColor(BREAKOUT.draw(tickBreakout(lost, LOST_MS)))).toBe(PALETTE.frame)
  })

  test('a cleared wall lights the frame green and names the level passed', () => {
    const g = wallOf(fresh(), (r, c) => r === 0 && c === 0)
    const cleared = breakBrick(flying(g, PARKED), { row: 0, col: 0 })
    const rows = BREAKOUT.draw(cleared)

    expect(frameColor(rows)).toBe(PALETTE.good)
    expect(textOf(rows)[messageRow(g) + 1]).toContain('livello 1 superato!')
    // It blinks while the moment lasts, and goes dim with the next wall.
    expect(frameColor(BREAKOUT.draw(tickBreakout(cleared, 250)))).not.toBe(PALETTE.good)
    expect(frameColor(BREAKOUT.draw(tickBreakout(cleared, CLEARED_MS)))).toBe(PALETTE.frame)
  })

  test('a falling bonus is a pill in its colour; one at work shows its seconds in the bottom edge', () => {
    const g = flying({ ...fresh(), drops: [{ kind: 'wide', x: 20, y: 20.5 }] }, PARKED)
    const text = textOf(BREAKOUT.draw(g))

    expect(text[11]!.slice(1, -1).slice(19, 22)).toBe('▐↔▌')
    expect(cellAt(g, 20, 10)).toMatchObject({ bg: BONUS_COLORS.wide })
    const working = textOf(BREAKOUT.draw({ ...g, drops: [], wideMs: 7500, slowMs: 3000 }))
    expect(working[19]).toContain(' ↔ 8s ')
    expect(working[19]).toContain(' ≈ 3s ')
  })

  test('fits the room: every row within the columns, every board within the rows, centered', () => {
    for (const columns of [30, 40, 80, 100]) {
      for (const rows of [12, 20, 30]) {
        let g = BREAKOUT.create({ ...CTX, columns, rows })
        const frames = [BREAKOUT.draw(g)]
        g = keyBreakout(g, ' ')
        for (let i = 0; i < 60; i++) {
          g = tickBreakout(keyBreakout(g, i % 2 === 0 ? 'left' : 'right'), 50)
          frames.push(BREAKOUT.draw(g))
        }
        for (const drawn of frames) {
          expect(drawn.every(r => widthOf(r) <= columns)).toBe(true)
          expect(drawn.length).toBeLessThanOrEqual(rows)
        }
      }
    }
    const wide = textOf(BREAKOUT.draw(BREAKOUT.create({ ...CTX, columns: 100 })))
    expect(wide[0]!.indexOf('╭')).toBe(20)
  })
})

/** As in catalog.test.ts, until the game is in the catalog. */
const HEX = /^#[0-9a-f]{6}$/i
const isOneColumn = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  const isWide = cp > 0xffff || (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)
  const isZeroWidth = (cp >= 0x0300 && cp <= 0x036f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)
  return cp >= 0x20 && !isWide && !isZeroWidth
}
const KEYS = ['up', 'left', ' ', 'right', 'down', '5', 'f', 'return', 'c', 'o', 'a', 'd']

test('breakout draws only one-column characters and hex colours', () => {
  let g = BREAKOUT.create({ columns: 100, rows: 30, rng: { seed: 11 }, words: [] })
  // Some of everything on the way: bonuses falling and at work, a moment of each kind.
  const frames: Row[][] = [
    BREAKOUT.draw(flying({ ...g, drops: (['wide', 'slow', 'life'] as const).map((kind, i) => ({ kind, x: 10 + i * 6, y: 30 })), wideMs: 900, slowMs: 900 }, PARKED)),
    BREAKOUT.draw(breakBrick(flying(wallOf(g, (r, c) => r === 0 && c === 0), PARKED), { row: 0, col: 0 })),
  ]
  for (let i = 0; i < 400 && !g.isOver; i++) {
    g = BREAKOUT.key(g, KEYS[i % KEYS.length]!)
    g = BREAKOUT.tick!(g, 50)
    frames.push(BREAKOUT.draw(g))
  }
  const spans = frames.flat(2)
  const badChars = [...new Set(spans.flatMap(s => [...s.text].filter(ch => !isOneColumn(ch))))]
  const badColours = [...new Set(spans.flatMap(s => [s.fg, s.bg]).filter((c): c is string => c !== undefined && !HEX.test(c)))]

  expect(badChars).toEqual([])
  expect(badColours).toEqual([])
  expect(spans.some(s => s.text.includes('▆'))).toBe(true)
})
