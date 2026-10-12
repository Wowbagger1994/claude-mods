import { expect, test } from 'claude-code/testing'

import type { Commit, Ref } from '../types'
import { foldKey, itemsOf } from './fold'
import { layout } from './graph'
import { clockOf, dayKey, dayLabel } from './labels'

const DAY = 86_400
const T0 = Date.parse('2026-07-27T10:00:00') / 1000
const c = (sha: string, parents: string[], at: number, refs: Ref[] = []): Commit => ({ sha, parents, author: 'a', at, subject: sha, refs })

/** main merges a branch of five plain commits; main itself has three plain ones below. */
const HISTORY = [
  c('M', ['C', 'B5'], T0, [{ kind: 'head', name: 'main' }]),
  c('B5', ['B4'], T0 - 60),
  c('B4', ['B3'], T0 - 120),
  c('B3', ['B2'], T0 - 180),
  c('B2', ['B1'], T0 - DAY),
  c('B1', ['C'], T0 - DAY - 60),
  c('C', ['D'], T0 - 2 * DAY),
  c('D', ['E'], T0 - 2 * DAY - 60),
  c('E', ['F'], T0 - 2 * DAY - 120),
  c('F', [], T0 - 3 * DAY),
]
const OWNER = new Map(HISTORY.map(h => [h.sha, h.sha.startsWith('B') ? 'b' : 'main']))
const shape = (items: ReturnType<typeof itemsOf>) =>
  items.map(i => (i.kind === 'day' ? `— ${dayKey(i.at)}` : i.kind === 'fold' ? `fold ${HISTORY[i.from]!.sha}..${HISTORY[i.to]!.sha}` : HISTORY[i.index]!.sha))

test('a plain commit: nothing begins, ends or joins there, no names on it', () => {
  const rows = layout(HISTORY, 'M')
  // B5 too: its lane was opened by the merge above, and simply goes on.
  expect(rows.map(r => r.isPlain)).toEqual([false, true, true, true, true, true, false, true, true, false])
})

test('long plain runs of one branch fold into one line, days head the lines when they go back', () => {
  const items = itemsOf(HISTORY, layout(HISTORY, 'M'), OWNER, new Set(), new Set())
  expect(shape(items)).toEqual(['— 2026-07-27', 'M', 'fold B5..B1', '— 2026-07-25', 'C', 'D', 'E', '— 2026-07-24', 'F'])
})

test('an opened run shows its commits; a kept commit (the selection) breaks a run around it', () => {
  const rows = layout(HISTORY, 'M')
  expect(shape(itemsOf(HISTORY, rows, OWNER, new Set([foldKey('B5')]), new Set()))).toEqual([
    '— 2026-07-27', 'M', 'B5', 'B4', 'B3', '— 2026-07-26', 'B2', 'B1', '— 2026-07-25', 'C', 'D', 'E', '— 2026-07-24', 'F',
  ])
  // B5 and B4 are too few to fold; B2 and B1 too.
  expect(shape(itemsOf(HISTORY, rows, OWNER, new Set(), new Set(['B3'])))).toEqual([
    '— 2026-07-27', 'M', 'B5', 'B4', 'B3', '— 2026-07-26', 'B2', 'B1', '— 2026-07-25', 'C', 'D', 'E', '— 2026-07-24', 'F',
  ])
  // The run reaches the 26th: B1, of the same day, needs no heading of its own.
  expect(shape(itemsOf(HISTORY, rows, OWNER, new Set(), new Set(['B1'])))).toEqual(['— 2026-07-27', 'M', 'fold B5..B2', 'B1', '— 2026-07-25', 'C', 'D', 'E', '— 2026-07-24', 'F'])
})

test('a heading only when the day goes back: topological order wandering forward adds none', () => {
  const wander = [c('P', ['Q'], T0), c('Q', ['R'], T0 - 2 * DAY), c('R', [], T0 - DAY)]
  const items = itemsOf(wander, layout(wander, null), new Map(wander.map(h => [h.sha, 'main'])), new Set(), new Set())
  expect(items.filter(i => i.kind === 'day').length).toBe(2)
})

test('a run never folds across another branch, nor across a commit with a name on it', () => {
  const rows = layout(HISTORY, 'M')
  const split = new Map(OWNER).set('B3', 'other')
  expect(shape(itemsOf(HISTORY, rows, split, new Set(), new Set())).filter(x => x.startsWith('fold'))).toEqual([])
  const tagged = HISTORY.map(h => (h.sha === 'B3' ? { ...h, refs: [{ kind: 'tag' as const, name: 'v2' }] } : h))
  expect(shape(itemsOf(tagged, layout(tagged, 'M'), OWNER, new Set(), new Set())).filter(x => x.startsWith('fold'))).toEqual([])
})

test('days in words: today, yesterday, the weekday, the year when another', () => {
  const now = Date.parse('2026-07-30T12:00:00')
  expect(dayLabel(now / 1000 - 3600, now)).toBe('oggi')
  expect(dayLabel(now / 1000 - DAY, now)).toBe('ieri')
  expect(dayLabel(T0, now)).toBe('lunedì 27 luglio')
  expect(dayLabel(Date.parse('2025-12-11T10:00:00') / 1000, now)).toBe('11 dicembre 2025')
  expect(clockOf(Date.parse('2026-07-27T09:05:00') / 1000)).toBe('09:05')
})
