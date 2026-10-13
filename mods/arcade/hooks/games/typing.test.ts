import { describe, expect, test } from 'claude-code/testing'

import { PALETTE, widthOf } from './style'
import type { Row, Span } from './types'
import type { Typing } from './typing'
import {
  activeWord,
  BURST_MS,
  LOST_MS,
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

    // The lane is the room less the frame's two sides.
    expect(starts.every(f => f.x >= 0 && f.x + f.text.length <= 18)).toBe(true)
    expect(Math.max(...starts.map(f => f.x))).toBe(18 - 14)
  })

  test('starts with one word at the top, three lives, sized to the room inside the frame', () => {
    const s = newTyping(CTX)

    expect(s.falling).toHaveLength(1)
    expect(s.falling[0]!.y).toBe(0)
    expect([s.width, s.height, s.lives]).toEqual([38, 10, LIVES])
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

  test('fills the room: the lane in a rounded frame, the letters typed in its bottom edge', () => {
    const rows = TYPING.draw(typeAll(withWords({ text: 'fetch', x: 3, y: 2 }), 'fe'))

    expect(rows).toHaveLength(CTX.rows)
    // The faint rain left out.
    expect(text(rows)[1 + 2]!.replace(/╷/g, ' ')).toBe('│  ▸fetch'.padEnd(39) + '│')
    expect(text(rows)[0]).toMatch(/^╭─.*─╮$/)
    expect(text(rows)[11]).toMatch(/^╰─ › fe▏ ─.*─╯$/)
  })

  test('the typed letters are green, the rest of the word bright on a lit band, a word near the bottom in red', () => {
    const rows = TYPING.draw(typeAll(withWords({ text: 'fetch', y: 2 }, { text: 'slice', x: 10, y: 9.5 }), 'fe'))
    const typed = rows[1 + 2]!.find(s => s.text === 'fe')
    const rest = rows[1 + 2]!.find(s => s.text === 'tch')
    const danger = rows[1 + 9]!.find(s => s.text === 'slice')

    expect(typed).toMatchObject({ fg: PALETTE.good, bg: PALETTE.faint, bold: true })
    expect(rest).toMatchObject({ fg: PALETTE.white, bg: PALETTE.faint, bold: true })
    expect(danger?.fg).toBe(PALETTE.danger)
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

describe('the look', () => {
  const lines = (rows: Row[]) => rows.map(r => r.map(s => s.text).join(''))
  const all = (rows: Row[]) => rows.flat()
  const find = (row: Row, text: string): Span | undefined => row.find(s => s.text.includes(text))

  test('fits the room at any size: each row as wide as the columns, as many rows as given', () => {
    for (const columns of [20, 40, 80, 100]) {
      for (const rows of [12, 20, 30]) {
        const s = typeAll({ ...newTyping({ ...CTX, columns, rows }), falling: [{ text: 'fetch', x: 0, y: 1 }] }, 'fe')
        const drawn = TYPING.draw({ ...s, errorFor: 1, hits: 3, misses: 1 })

        expect(drawn).toHaveLength(rows)
        expect(drawn.every(r => widthOf(r) === columns)).toBe(true)
      }
    }
  })

  test('the top edge holds the multiplier with a meter toward the next one, coloured as it grows, and the precision', () => {
    const fresh = TYPING.draw(withWords({ text: 'fetch', y: 2 }))[0]!
    const rolling = TYPING.draw({ ...withWords({ text: 'fetch', y: 2 }), combo: 4 })[0]!
    const top = TYPING.draw({ ...withWords({ text: 'fetch', y: 2 }), combo: 99 })[0]!

    expect(lines([fresh])[0]).toMatch(/^╭─ combo ×1 ▱▱▱ ─+ precisione — ─╮$/)
    expect(lines([rolling])[0]).toContain('combo ×2 ▰▱▱')
    expect(find(rolling, '×2')?.fg).toBe(PALETTE.sky)
    expect(lines([top])[0]).toContain('combo ×5 ▰▰▰')
    expect(find(top, '×5')?.fg).toBe(PALETTE.claude)
  })

  test('precision counts the letters right against the mistakes, green, then amber, then red', () => {
    const typed = typeAll(withWords({ text: 'fetch', y: 2 }), 'fexfet')
    const top = (hits: number, misses: number) => TYPING.draw({ ...withWords({ text: 'fetch', y: 2 }), hits, misses })[0]!

    expect([typed.hits, typed.misses]).toEqual([5, 1])
    expect(find(top(19, 1), '95%')?.fg).toBe(PALETTE.good)
    expect(find(top(8, 2), '80%')?.fg).toBe(PALETTE.hurry)
    expect(find(top(1, 1), '50%')?.fg).toBe(PALETTE.danger)
  })

  test('a narrow lane drops the precision rather than overflow', () => {
    const rows = TYPING.draw(newTyping({ ...CTX, columns: 20 }))

    expect(lines(rows)[0]).not.toContain('precisione')
    expect(widthOf(rows[0]!)).toBe(20)
  })

  test('the word being typed is pointed at; words turn amber past the middle of the lane', () => {
    const rows = TYPING.draw(typeAll(withWords({ text: 'fetch', x: 4, y: 1 }, { text: 'slice', x: 10, y: 6.5 }, { text: 'reduce', x: 20, y: 3 }), 'fe'))

    expect(lines(rows)[1 + 1]![1 + 3]).toBe('▸')
    expect(find(rows[1 + 6]!, 'slice')?.fg).toBe(PALETTE.hurry)
    expect(find(rows[1 + 3]!, 'reduce')?.fg).toBe('#e5e7eb')
  })

  test('a word typed whole bursts where it was, with its points; the frame and the bottom edge cheer, then it fades', () => {
    const typed = typeAll({ ...withWords({ text: 'fetch', x: 10, y: 4 }), sinceSpawn: -100_000 }, 'fetch')
    const rows = TYPING.draw(typed)
    const scattered = TYPING.draw(TYPING.tick!(typed, BURST_MS / 2 + 10))
    const gone = TYPING.tick!(typed, BURST_MS)

    expect(typed.burst).toMatchObject({ text: 'fetch', points: 5 })
    expect(lines(rows).slice(1 + 3, 1 + 6).map(r => r.slice(1, -1).replace(/╷/g, ' ').trim())).toEqual(['╲ ┃ ╱', '━ +5 ━', '╱ ┃ ╲'])
    expect(find(rows[1 + 4]!, '+5')?.fg).toBe(PALETTE.good)
    expect(rows[0]![0]!.fg).toBe(PALETTE.good)
    expect(lines(rows)[11]).toContain('✓ fetch +5')
    expect(lines(scattered).join('\n')).toContain('✦  +5  ✦')
    expect(gone.burst).toBeNull()
    expect(lines(TYPING.draw(gone)).join('\n')).not.toContain('+5')
    expect(TYPING.draw(gone)[0]![0]!.fg).toBe(PALETTE.frame)
  })

  test('a mistake turns the frame red', () => {
    const wrong = TYPING.key(withWords({ text: 'fetch', y: 2 }), 'x')

    expect(TYPING.draw(wrong)[0]![0]!.fg).toBe(PALETTE.danger)
    expect(find(TYPING.draw(wrong)[11]!, 'nessuna')?.fg).toBe(PALETTE.danger)
  })

  test('a word lost at the bottom turns the frame red and is named in the bottom edge for a moment', () => {
    const lost = TYPING.tick!({ ...withWords({ text: 'fetch', y: 9.99 }), sinceSpawn: -100_000 }, 100)
    const rows = TYPING.draw(lost)

    expect(rows[0]![0]!.fg).toBe(PALETTE.danger)
    expect(lines(rows)[11]).toContain('♥ persa: fetch')
    const later = TYPING.tick!(lost, LOST_MS)
    expect(lines(TYPING.draw(later))[11]).toContain('scrivi le parole')
    expect(TYPING.draw(later)[0]![0]!.fg).toBe(PALETTE.frame)
  })

  test('a dotted red line marks where the danger starts; faint rain falls behind the words', () => {
    const s = withWords()
    const rain = (t: Typing) => lines(TYPING.draw(t)).slice(1, -1).join('\n').replace(/[^╷\n]/g, ' ')

    expect(lines(TYPING.draw(s))[1 + 8]).toBe(`│${'┈'.repeat(38)}│`)
    expect(find(TYPING.draw(s)[1 + 8]!, '┈')?.fg).toBe('#7f1d1d')
    expect(rain(s)).toContain('╷')
    expect(all(TYPING.draw(s)).filter(sp => sp.text.includes('╷')).every(sp => sp.fg === PALETTE.faint)).toBe(true)
    expect(rain({ ...s, elapsed: 500 })).not.toBe(rain(s))
  })

  test('the bottom edge shows how fast the words fall, warming toward the top speed', () => {
    // Room for the hint and the meter both.
    const wide = { ...newTyping({ ...CTX, columns: 60 }), falling: [] }
    const slow = TYPING.draw(wide)[11]!
    const fast = TYPING.draw({ ...wide, elapsed: 10_000_000 })[11]!

    expect(lines([slow])[0]).toContain('velocità ▰▱▱▱▱')
    expect(find(slow, '▰')?.fg).toBe(PALETTE.good)
    expect(lines([fast])[0]).toContain('velocità ▰▰▰▰▰')
    expect(find(fast, '▰')?.fg).toBe(PALETTE.danger)
  })
})
