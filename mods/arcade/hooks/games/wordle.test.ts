import { describe, expect, test } from 'claude-code/testing'

import { PALETTE, widthOf } from './style'
import type { Row, Span } from './types'
import type { Wordle } from './wordle'
import {
  CELEBRATE_MS,
  codeWordsOf,
  FALLBACK_WORDS,
  FLIP_MS,
  FLIP_TOTAL_MS,
  layoutOf,
  lettersOf,
  marksOf,
  MAX_TRIES,
  newWordle,
  pickWord,
  pointsFor,
  SHAKE_MS,
  WORDLE,
} from './wordle'

const GREEN = '#16a34a'
const AMBER = '#d97706'
const GREY = '#3f3f46'

const CTX = { columns: 40, rows: 12, rng: { seed: 5 }, words: [] as string[] }

/** A fresh game whose word is `target`. */
const game = (target: string, ctx: Partial<typeof CTX> = {}): Wordle => ({ ...newWordle({ ...CTX, ...ctx }), target })
const press = (s: Wordle, keys: readonly string[]): Wordle => keys.reduce((acc, k) => WORDLE.key(acc, k), s)
const guess = (s: Wordle, word: string): Wordle => press(s, [...word, 'return'])
/** Enough time for the last guess's tiles to turn, not for a solved word to give way. */
const settle = (s: Wordle): Wordle => WORDLE.tick!(s, FLIP_TOTAL_MS)

const textOf = (row: Row): string => row.map(s => s.text).join('')
const spansOf = (rows: Row[]): Span[] => rows.flat()
/** The tiles' letters of the drawn row showing `letters` (`SWEET`), with their backgrounds. */
const tilesIn = (rows: Row[], letters: string): { letter: string; bg: string | undefined }[] => {
  const row = rows.find(r => textOf(r).replace(/\s/g, '').includes(letters))
  if (row === undefined) throw new Error(`no row shows ${letters}`)
  return row.filter(s => /^\s*[A-Z_]\s*$/.test(s.text)).map(s => ({ letter: s.text.trim(), bg: s.bg }))
}

describe('marks', () => {
  test('green in place, amber elsewhere in the word, grey absent', () => {
    expect(marksOf('stack', 'scope')).toEqual(['hit', 'miss', 'miss', 'near', 'miss'])
    expect(marksOf('total', 'total')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit'])
  })

  test('a letter guessed twice but in the word once is amber once, not twice', () => {
    expect(marksOf('speed', 'abide')).toEqual(['miss', 'miss', 'near', 'miss', 'near'])
  })

  test('a letter in its place takes the word’s only copy before any earlier guess of it', () => {
    expect(marksOf('eeeee', 'cache')).toEqual(['miss', 'miss', 'miss', 'miss', 'hit'])
    expect(marksOf('paper', 'apple')).toEqual(['near', 'near', 'hit', 'near', 'miss'])
  })

  test('a letter twice in the word, guessed twice out of place, is amber twice', () => {
    expect(marksOf('llama', 'hello')).toEqual(['near', 'near', 'miss', 'miss', 'miss'])
  })
})

describe('words', () => {
  test('five-letter parts of Claude’s names, newest first, each once', () => {
    const names = ['cartTotal', 'formatPrice', 'fetch', 'user_names', 'HTTPServer', 'parseJSONValue', 'user2Count', 'Fetch', 'résumé']

    expect(codeWordsOf(names)).toEqual(['total', 'price', 'fetch', 'names', 'parse', 'value', 'count'])
  })

  test('the fallback is common programming words of five lowercase letters, each once', () => {
    expect(FALLBACK_WORDS.length).toBeGreaterThanOrEqual(40)
    expect(FALLBACK_WORDS.every(w => /^[a-z]{5}$/.test(w))).toBe(true)
    expect(new Set(FALLBACK_WORDS).size).toBe(FALLBACK_WORDS.length)
    expect(FALLBACK_WORDS).toEqual(expect.arrayContaining(['array', 'async', 'fetch', 'yield', 'proxy', 'debug']))
  })

  test('Claude’s words come first; the fallback only once they are all played', () => {
    let s = newWordle({ ...CTX, words: ['cartTotal', 'formatPrice'] })
    const seen: string[] = []
    for (let i = 0; i < 3; i++) {
      seen.push(`${s.target}:${s.source}`)
      s = press(settle(guess(s, s.target)), ['return'])
    }

    expect(seen.slice(0, 2).sort()).toEqual(['price:code', 'total:code'])
    expect(seen[2]!.endsWith(':vocab')).toBe(true)
    expect(FALLBACK_WORDS).toContain(seen[2]!.split(':')[0])
  })

  test('with no code, a fallback word; a word is not picked again until all were', () => {
    const s = newWordle(CTX)
    const picked = pickWord(['total'], ['array'], ['total', 'array'], { seed: 1 })

    expect([s.source, FALLBACK_WORDS.includes(s.target)]).toEqual(['vocab', true])
    expect(pickWord(['total'], ['array'], ['total'], { seed: 1 })).toMatchObject({ target: 'array', source: 'vocab', used: ['total', 'array'] })
    expect([picked.target, picked.source, picked.used]).toEqual(['total', 'code', ['total']])
  })

  test('a code word also in the fallback counts as code', () => {
    expect(newWordle({ ...CTX, words: ['fetchUser'] })).toMatchObject({ target: 'fetch', source: 'code' })
  })
})

describe('typing', () => {
  test('letters fill the row up to five, in lowercase; backspace takes one back', () => {
    const s = press(game('total'), ['T', 'o', 'x', 'i', 'c', 'z'])

    expect(s.input).toBe('toxic')
    expect(WORDLE.key(s, 'backspace').input).toBe('toxi')
    expect(WORDLE.key(s, 'delete').input).toBe('toxi')
  })

  test('other keys do nothing', () => {
    const s = press(game('total'), ['t'])

    for (const key of ['left', '5', ' ', 'tab', 'é']) expect(WORDLE.key(s, key)).toBe(s)
  })

  test('any five letters are a guess, word or not', () => {
    const s = guess(game('total'), 'qzxvk')

    expect(s.guesses).toEqual([{ word: 'qzxvk', marks: ['miss', 'miss', 'miss', 'miss', 'miss'] }])
    expect([s.input, s.flipMs]).toEqual(['', 0])
  })

  test('a guess under five letters is no try: it warns, then the warning fades', () => {
    const s = guess(game('total'), 'tot')

    expect([s.guesses.length, s.input, s.shakeMs]).toEqual([0, 'tot', SHAKE_MS])
    expect(WORDLE.tick!(s, SHAKE_MS).shakeMs).toBe(0)
  })
})

describe('the arcade flow', () => {
  test('a word solved scores more for fewer tries: 60 at once, 40 in three, 10 in six', () => {
    const inThree = guess(guess(guess(game('total'), 'sweet'), 'otter'), 'total')

    expect([pointsFor(1), pointsFor(3), pointsFor(MAX_TRIES)]).toEqual([60, 40, 10])
    expect(guess(game('total'), 'total')).toMatchObject({ phase: 'solved', gained: 60, score: 60 })
    expect(inThree).toMatchObject({ phase: 'solved', gained: 40, score: 40 })
  })

  test('the scores add up across words', () => {
    const first = settle(guess(game('total'), 'total'))
    const second = guess({ ...press(first, ['return']), target: 'array' }, 'array')

    expect(second.score).toBe(120)
  })

  test('a solved word gives way to the next after a moment, or at once with Enter once its tiles turned', () => {
    const solved = guess(game('total'), 'total')

    expect(WORDLE.key(solved, 'return')).toBe(solved)
    expect(WORDLE.tick!(solved, FLIP_TOTAL_MS + CELEBRATE_MS - 50)).toMatchObject({ phase: 'solved', round: 1 })
    expect(WORDLE.tick!(solved, FLIP_TOTAL_MS + CELEBRATE_MS)).toMatchObject({ phase: 'guessing', round: 2, guesses: [], input: '' })
    expect(press(settle(solved), ['return'])).toMatchObject({ phase: 'guessing', round: 2, score: 60 })
  })

  test('a letter typed once the tiles turned starts the next word with it', () => {
    const next = press(settle(guess(game('total'), 'total')), ['a'])

    expect(next).toMatchObject({ phase: 'guessing', round: 2, input: 'a' })
    expect(next.target).not.toBe('total')
  })

  test('six misses end the game once the last row has turned, the score kept', () => {
    const scored = { ...game('total'), score: 60 }
    const lost = ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff'].reduce(guess, scored)

    expect(lost.phase).toBe('lost')
    expect(WORDLE.isOver(lost)).toBe(false)
    expect(WORDLE.key(lost, 'g')).toBe(lost)
    expect(WORDLE.isOver(settle(lost))).toBe(true)
    expect(WORDLE.score(settle(lost))).toBe(60)
  })

  test('the status says the word and the tries', () => {
    expect(WORDLE.status!(guess(guess(game('total'), 'sweet'), 'otter'))).toBe('parola 1 · tentativi 2/6')
  })

  test('a typing game: letters are moves', () => {
    expect([WORDLE.id, WORDLE.name, WORDLE.isTyping]).toEqual(['wordle', 'Wordle del codice', true])
  })
})

describe('drawing', () => {
  const SIZES = [40, 80, 100].flatMap(columns => [12, 20, 30].map(rows => ({ columns, rows })))

  /** A game in each look: typing, warned, turning, solved, missed. */
  const states = (size: { columns: number; rows: number }): Wordle[] => {
    const start = game('total', size)
    const typed = press(settle(guess(start, 'sweet')), ['t', 'o'])
    const missed = ['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff'].reduce(guess, start)
    return [start, typed, guess(typed, ''), guess(start, 'otter'), settle(guess(typed, 'tal')), settle(missed)]
  }

  test('fits the room at every size, every row within the columns, as many rows as there are', () => {
    for (const size of SIZES) {
      for (const s of states(size)) {
        const rows = WORDLE.draw(s)
        expect(rows.length).toBeLessThanOrEqual(size.rows)
        expect(Math.max(...rows.map(widthOf))).toBeLessThanOrEqual(size.columns)
        // The frame whole: no row cut short of its right edge.
        expect(rows.every(r => /[╮│╯]$/.test(textOf(r)))).toBe(true)
      }
    }
  })

  test('tall tiles with room, flat ones in a small pane', () => {
    expect(layoutOf(40, 12)).toMatchObject({ tileH: 1, isSpaced: false })
    expect(layoutOf(80, 30)).toMatchObject({ tileH: 3, isSpaced: true })
    expect(textOf(WORDLE.draw(game('total', { columns: 80, rows: 30 }))[2]!)).toContain('▄▄▄▄▄ ▄▄▄▄▄')
    expect(WORDLE.draw(game('total')).some(r => textOf(r).includes('▄'))).toBe(false)
    expect(WORDLE.draw(game('total'))).toHaveLength(12)
  })

  test('a guess turned shows green in place, amber elsewhere, grey absent', () => {
    const rows = WORDLE.draw(settle(guess(game('total'), 'sweet')))

    expect(tilesIn(rows, 'SWEET')).toEqual([
      { letter: 'S', bg: GREY },
      { letter: 'W', bg: GREY },
      { letter: 'E', bg: GREY },
      { letter: 'E', bg: GREY },
      { letter: 'T', bg: AMBER },
    ])
    expect(tilesIn(WORDLE.draw(settle(guess(game('total'), 'tidal'))), 'TIDAL').map(t => t.bg)).toEqual([GREEN, GREY, GREY, GREEN, GREEN])
  })

  test('the tiles turn one by one: edge-on as they turn, still grey after', () => {
    const sent = guess(game('total'), 'tidal')
    const turning = WORDLE.tick!(sent, FLIP_MS * 2 + 10)
    const row = WORDLE.draw(turning).find(r => textOf(r).includes('━'))!

    expect(WORDLE.draw(sent)[1]!.find(s => s.text === '━━━━━')?.fg).toBe(GREEN)
    expect(tilesIn(WORDLE.draw(sent), 'IDAL').map(t => t.bg)).toEqual(['#52525b', '#52525b', '#52525b', '#52525b'])
    expect(tilesIn([row], 'TI').map(t => t.bg)).toEqual([GREEN, GREY, '#52525b', '#52525b'])
    expect(row.find(s => s.text === '━━━━━')?.fg).toBe(GREY)
  })

  test('the current row has a cursor where the next letter goes and a › beside it', () => {
    const rows = WORDLE.draw(press(game('total'), ['t', 'o']))
    const current = rows.find(r => textOf(r).includes('›'))!

    expect(tilesIn([current], 'TO').map(t => t.letter)).toEqual(['T', 'O', '_'])
    expect(current.find(s => s.text.includes('_'))?.fg).toBe(PALETTE.claude)
  })

  test('the keyboard map shows each letter’s best: green kept over a later amber, amber, spent letters dim, untried ones plain', () => {
    const s = ['tidal', 'start', 'otter'].reduce((acc, w) => settle(guess(acc, w)), game('total', { columns: 80, rows: 20 }))
    const keys = spansOf(WORDLE.draw(s)).filter(sp => /^ [A-Z] $/.test(sp.text))
    const key = (k: string) => keys.find(sp => sp.text === ` ${k} `)!

    expect(lettersOf(s)).toEqual({ t: 'hit', i: 'miss', d: 'miss', a: 'hit', l: 'hit', s: 'miss', r: 'miss', o: 'near', e: 'miss' })
    expect([key('T').bg, key('A').bg, key('L').bg, key('O').bg]).toEqual([GREEN, GREEN, GREEN, AMBER])
    expect([key('S').bg, key('S').fg]).toEqual([undefined, '#52525b'])
    expect([key('Q').bg, key('Q').fg]).toEqual(['#27272a', PALETTE.label])
    expect(keys).toHaveLength(26)
  })

  test('the keyboard learns a letter only once its tile has turned', () => {
    const sent = guess(game('total'), 'sweet')

    expect(lettersOf(sent)).toEqual({})
    expect(lettersOf(WORDLE.tick!(sent, FLIP_MS))).toEqual({ s: 'miss' })
    expect(lettersOf(settle(sent))).toEqual({ s: 'miss', w: 'miss', e: 'miss', t: 'near' })
  })

  test('a short guess shakes the row and turns the frame red, saying why', () => {
    const typed = press(game('total'), ['t', 'o'])
    const shaken = WORDLE.draw(guess(typed, ''))
    const markerAt = (rows: Row[]) => textOf(rows.find(r => textOf(r).includes('›'))!).indexOf('›')

    expect(markerAt(shaken)).not.toBe(markerAt(WORDLE.draw(typed)))
    expect(shaken[0]![0]!.fg).toBe(PALETTE.danger)
    expect(spansOf(shaken).find(s => s.text.includes('servono 5 lettere'))?.fg).toBe(PALETTE.danger)
    expect(WORDLE.draw(typed)[0]![0]!.fg).toBe(PALETTE.frame)
  })

  test('a solved word: green frame, +N beside its row, the word and where it came from', () => {
    const s = settle(guess(newWordle({ ...CTX, words: ['cartTotal'] }), 'total'))
    const rows = WORDLE.draw(s)
    const solvedRow = rows.find(r => textOf(r).includes('+60') && textOf(r).includes('T     O'))!

    expect(rows[0]![0]!.fg).toBe(PALETTE.good)
    expect(solvedRow.find(sp => sp.text.includes('+60'))?.fg).toBe(PALETTE.good)
    expect(rows.some(r => textOf(r).includes('✓  T O T A L  dal tuo codice +60'))).toBe(true)
    expect(WORDLE.draw(guess(game('total'), 'total'))[0]![0]!.fg).toBe(PALETTE.frame)
  })

  test('a missed word: red frame and the word revealed, from the vocabulary', () => {
    const s = settle(['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee', 'fffff'].reduce(guess, { ...game('array'), source: 'vocab' as const }))
    const rows = WORDLE.draw(s)
    const word = spansOf(rows).find(sp => sp.text === ' A R R A Y ')

    expect(rows[0]![0]!.fg).toBe(PALETTE.danger)
    expect(rows.some(r => textOf(r).includes('✗ era  A R R A Y  dal vocabolario'))).toBe(true)
    expect(word?.bg).toBe(PALETTE.danger)
  })

  test('the note counts the tries left, amber when few, red on the last', () => {
    const after = (n: number) => textOf(WORDLE.draw(settle(['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee'].slice(0, n).reduce(guess, game('total'))))[7]!)
    const noteSpan = (n: number) => spansOf(WORDLE.draw(settle(['aaaaa', 'bbbbb', 'ccccc', 'ddddd', 'eeeee'].slice(0, n).reduce(guess, game('total'))))).find(s => /tentativ/.test(s.text))

    expect(after(0)).toContain('indovina la parola di 5 lettere')
    expect(after(2)).toContain('ancora 4 tentativi')
    expect(noteSpan(4)?.fg).toBe(PALETTE.hurry)
    expect(noteSpan(5)).toMatchObject({ text: 'ultimo tentativo!', fg: PALETTE.danger })
  })

  test('draws only one-column characters and hex colours, whatever is typed', () => {
    const HEX = /^#[0-9a-f]{6}$/i
    const isOneColumn = (ch: string) => {
      const cp = ch.codePointAt(0) ?? 0
      const isWide = cp > 0xffff || (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) || (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) || (cp >= 0xff00 && cp <= 0xff60)
      const isZeroWidth = (cp >= 0x0300 && cp <= 0x036f) || cp === 0x200d || (cp >= 0xfe00 && cp <= 0xfe0f)
      return cp >= 0x20 && !isWide && !isZeroWidth
    }
    const KEYS = ['t', 'o', 'return', 'up', 'a', ' ', 'l', 'backspace', '5', 'e', 'r', 's', 'return', 'c', 'h']
    const frames: Row[][] = []
    for (const size of SIZES) {
      let s = WORDLE.create({ ...size, rng: { seed: 11 }, words: ['cartTotal', 'formatPrice'] })
      for (let i = 0; i < 200 && !WORDLE.isOver(s); i++) {
        s = WORDLE.tick!(WORDLE.key(s, KEYS[i % KEYS.length]!), 50)
        frames.push(WORDLE.draw(s))
      }
      frames.push(...states(size).map(WORDLE.draw))
    }
    const spans = frames.flat(2)

    expect([...new Set(spans.flatMap(s => [...s.text].filter(ch => !isOneColumn(ch))))]).toEqual([])
    expect([...new Set(spans.flatMap(s => [s.fg, s.bg]).filter((c): c is string => c !== undefined && !HEX.test(c)))]).toEqual([])
  })
})
