import { describe, expect, test } from 'claude-code/testing'

import type { Typing } from './typing'
import {
  activeWord,
  FALLBACK_WORDS,
  intervalAt,
  LIVES,
  multiplierOf,
  newTyping,
  poolOf,
  speedAt,
  TYPING,
  typingStatus,
} from './typing'

const CTX = { columns: 40, rows: 12, rng: { seed: 3 }, words: [] as string[] }
const CLAUDE_WORDS = Array.from({ length: 25 }, (_, i) => `parola${String.fromCharCode(97 + i)}`)

/** A board with the given words falling, nothing else on it, no spawn due soon. */
const withWords = (...falling: { text: string; x?: number; y: number }[]): Typing => ({
  ...newTyping(CTX),
  falling: falling.map(f => ({ x: 0, ...f })),
})

const typeAll = (s: Typing, text: string): Typing => [...text].reduce((acc, c) => TYPING.key(acc, c), s)

describe('words', () => {
  test('Claude’s words come first; the fallback fills in when they are few', () => {
    expect(poolOf(['fetchUser', 'cartTotal']).slice(0, 2)).toEqual(['fetchUser', 'cartTotal'])
    expect(poolOf(['fetchUser'])).toContain('promise')
    expect(poolOf(CLAUDE_WORDS)).toEqual(CLAUDE_WORDS)
  })

  test('the fallback words are code words of 4 to 12 letters', () => {
    expect(FALLBACK_WORDS.length).toBeGreaterThanOrEqual(40)
    expect(FALLBACK_WORDS.every(w => /^[A-Za-z]{4,12}$/.test(w))).toBe(true)
  })

  test('with enough of Claude’s words, every falling word is one of them, inside the board', () => {
    const s = Array.from({ length: 300 }).reduce<Typing>(acc => TYPING.tick!(acc, 100), {
      ...newTyping({ ...CTX, words: CLAUDE_WORDS }),
      lives: 1000,
    })
    const seen = s.falling

    expect(seen.length).toBeGreaterThan(0)
    expect(seen.every(f => CLAUDE_WORDS.includes(f.text))).toBe(true)
    expect(seen.every(f => f.x >= 0 && f.x + f.text.length <= s.width)).toBe(true)
  })

  test('a word never starts past the right edge, even a long one on a narrow board', () => {
    const long = Array.from({ length: 25 }, (_, i) => `abcdefghijklm${String.fromCharCode(97 + i)}`)
    const starts = Array.from({ length: 300 }, (_, seed) => newTyping({ columns: 20, rows: 12, rng: { seed }, words: long }).falling[0]!)

    expect(starts.every(f => f.x >= 0 && f.x + f.text.length <= 20)).toBe(true)
    expect(Math.max(...starts.map(f => f.x))).toBe(20 - 14)
  })

  test('starts with one word at the top, three lives, sized to the room', () => {
    const s = newTyping(CTX)

    expect(s.falling).toHaveLength(1)
    expect(s.falling[0]!.y).toBe(0)
    expect([s.width, s.height, s.lives]).toEqual([40, 10, LIVES])
  })
})

describe('typing', () => {
  test('a whole word explodes, scores its length and starts a combo', () => {
    const s = typeAll(withWords({ text: 'fetch', y: 2 }), 'fetch')

    expect(s.falling).toEqual([])
    expect([s.score, s.combo, s.buffer]).toEqual([5, 1, ''])
  })

  test('the letters typed so far stay in the buffer and mark the lowest word they begin', () => {
    const s = typeAll(withWords({ text: 'fetch', y: 1 }, { text: 'filter', y: 5 }, { text: 'fetchAll', y: 3 }), 'fe')

    expect(s.buffer).toBe('fe')
    expect(activeWord(s)?.text).toBe('fetchAll')
  })

  test('of two equal words, the lower one explodes', () => {
    const s = typeAll(withWords({ text: 'fetch', y: 1 }, { text: 'fetch', y: 6 }), 'fetch')

    expect(s.falling.map(f => f.y)).toEqual([1])
  })

  test('a letter no word begins with is a mistake: buffer emptied, combo lost', () => {
    const s = typeAll({ ...withWords({ text: 'fetch', y: 2 }), combo: 4 }, 'fx')

    expect([s.buffer, s.combo]).toEqual(['', 0])
    expect(s.errorFor).toBeGreaterThan(0)
  })

  test('capitals count: "Fetch" is not "fetch"', () => {
    const s = TYPING.key(withWords({ text: 'fetch', y: 2 }), 'F')

    expect(s.buffer).toBe('')
    expect(s.errorFor).toBeGreaterThan(0)
  })

  test('backspace takes a letter back; Enter and space start over without a penalty', () => {
    const typed = typeAll({ ...withWords({ text: 'fetch', y: 2 }), combo: 2 }, 'fet')

    expect(TYPING.key(typed, 'backspace').buffer).toBe('fe')
    expect(TYPING.key(typed, 'return')).toMatchObject({ buffer: '', combo: 2, errorFor: 0 })
    expect(TYPING.key(typed, ' ')).toMatchObject({ buffer: '', combo: 2, errorFor: 0 })
  })

  test('a combo multiplies the points every three words, up to five', () => {
    const s = typeAll({ ...withWords({ text: 'fetch', y: 2 }), combo: 3 }, 'fetch')

    expect(s.score).toBe(10)
    expect([multiplierOf(0), multiplierOf(2), multiplierOf(3), multiplierOf(6), multiplierOf(99)]).toEqual([1, 1, 2, 3, 5])
  })

  test('other special keys do nothing', () => {
    const s = withWords({ text: 'fetch', y: 2 })

    expect(TYPING.key(s, 'left')).toBe(s)
  })
})

describe('falling', () => {
  test('words fall faster and come more often as time goes on', () => {
    expect(speedAt(60_000)).toBeGreaterThan(speedAt(0))
    expect(intervalAt(60_000)).toBeLessThan(intervalAt(0))
    expect(speedAt(10_000_000)).toBe(4)
    expect(intervalAt(10_000_000)).toBe(700)
  })

  test('a word reaching the bottom costs a life and the combo; the last life ends the game', () => {
    const near = { ...withWords({ text: 'fetch', y: 9.99 }), combo: 5, sinceSpawn: -100_000 }
    const lost = TYPING.tick!(near, 100)
    const last = TYPING.tick!({ ...near, lives: 1 }, 100)

    expect([lost.lives, lost.combo, lost.isOver]).toEqual([LIVES - 1, 0, false])
    expect(last.isOver).toBe(true)
    expect(TYPING.key(last, 'f')).toBe(last)
  })

  test('the buffer empties when the word it was typing falls off', () => {
    const typed = typeAll({ ...withWords({ text: 'fetch', y: 9.99 }), sinceSpawn: -100_000 }, 'fe')

    expect(TYPING.tick!(typed, 100).buffer).toBe('')
  })

  test('a new word arrives once the interval has passed', () => {
    const s = { ...withWords({ text: 'fetch', y: 0 }), sinceSpawn: 0 }

    expect(TYPING.tick!(s, 2_000).falling).toHaveLength(1)
    expect(TYPING.tick!(s, 2_300).falling).toHaveLength(2)
  })
})

describe('drawing', () => {
  const text = (rows: { text: string }[][]) => rows.map(r => r.map(s => s.text).join(''))

  test('fills the room: falling rows, a separator, the buffer line', () => {
    const rows = TYPING.draw(typeAll(withWords({ text: 'fetch', x: 3, y: 2 }), 'fe'))

    expect(rows).toHaveLength(CTX.rows)
    expect(text(rows)[2]).toBe('   fetch'.padEnd(40))
    expect(text(rows)[11]).toBe('› fe▏')
  })

  test('the typed letters are in Claude’s orange, a word near the bottom in red', () => {
    const rows = TYPING.draw(typeAll(withWords({ text: 'fetch', y: 2 }, { text: 'slice', x: 10, y: 9.5 }), 'fe'))
    const typed = rows[2]!.find(s => s.text === 'fe')
    const danger = rows[9]!.find(s => s.text === 'slice')

    expect(typed?.fg).toBe('#d97757')
    expect(rows[2]!.find(s => s.text === 'tch')?.fg).toBe('#e5e7eb')
    expect(danger?.fg).toBe('#ef4444')
  })

  test('a mistake shows on the buffer line until it fades', () => {
    const wrong = TYPING.key(withWords({ text: 'fetch', y: 2 }), 'x')

    expect(text(TYPING.draw(wrong))[11]).toContain('nessuna parola')
    expect(text(TYPING.draw({ ...TYPING.tick!(wrong, 500), falling: [] }))[11]).toContain('scrivi le parole')
  })

  test('the status shows lives and multiplier', () => {
    expect(typingStatus({ ...newTyping(CTX), lives: 2, combo: 3 })).toBe('♥♥♡ · combo ×2')
  })

  test('is a typing game: the arcade pauses it on Tab', () => {
    expect(TYPING.isTyping).toBe(true)
    expect(TYPING.id).toBe('typing')
  })
})
