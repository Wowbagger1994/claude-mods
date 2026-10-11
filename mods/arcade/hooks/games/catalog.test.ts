import { describe, expect, test } from 'claude-code/testing'

import { GAMES } from './catalog'
import type { AnyGame, Row } from './types'

const HEX = /^#[0-9a-f]{6}$/i
/** Wide or zero-width characters the terminal would draw out of step with the cells. */
const isOneColumn = (ch: string) => {
  const cp = ch.codePointAt(0) ?? 0
  const isWide = cp > 0xffff || (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)
  const isZeroWidth = (cp >= 0x0300 && cp <= 0x036f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)
  return cp >= 0x20 && !isWide && !isZeroWidth
}

const KEYS = ['up', 'left', ' ', 'right', 'down', '5', 'f', 'return', 'c', 'o']

/** A few seconds of play with some keys: the drawings a game shows along the way. */
const playFor = (game: AnyGame): Row[][] => {
  let state = game.create({ columns: 100, rows: 30, rng: { seed: 11 }, words: ['cartTotal', 'formatPrice'] })
  const frames: Row[][] = [game.draw(state)]
  for (let i = 0; i < 80 && !game.isOver(state); i++) {
    state = game.key(state, KEYS[i % KEYS.length]!)
    if (game.tick !== undefined) state = game.tick(state, 50)
    frames.push(game.draw(state))
  }
  return frames
}

describe('every game in the catalog', () => {
  test('has its own id and a name', () => {
    expect(new Set(GAMES.map(g => g.id)).size).toBe(GAMES.length)
    expect(GAMES.every(g => g.name !== '' && g.keys !== '')).toBe(true)
  })

  for (const game of GAMES) {
    test(`${game.name} draws only one-column characters and hex colours`, () => {
      const spans = playFor(game).flat(2)
      const badChars = [...new Set(spans.flatMap(s => [...s.text].filter(ch => !isOneColumn(ch))))]
      const badColours = [...new Set(spans.flatMap(s => [s.fg, s.bg]).filter((c): c is string => c !== undefined && !HEX.test(c)))]

      expect(badChars).toEqual([])
      expect(badColours).toEqual([])
    })
  }
})
