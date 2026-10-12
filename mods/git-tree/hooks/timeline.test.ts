import { expect, test } from 'claude-code/testing'

import type { BranchInfo } from './branches'
import type { Item } from './fold'
import type { GraphRow } from './graph'
import { widthsOf } from './map'
import { axisOf, barOf, rankScale, statusOf } from './timeline'

const at = (iso: string) => Date.parse(iso) / 1000
const NOW = Date.parse('2026-07-28T12:00:00')
const info = (over: Partial<BranchInfo>): BranchInfo => ({
  name: 'b', color: 1, status: 'open', shas: ['x'], forkSha: 'f', mergeSha: null, pr: null, mergedInto: null, isOnGitHub: false, ...over,
})

test('the line goes by rank: a burst of work gets the room, a quiet year does not eat it', () => {
  const pos = rankScale([at('2025-01-01T10:00'), at('2026-07-27T10:00'), at('2026-07-27T11:00'), at('2026-07-27T12:00')], 10)
  expect([at('2025-01-01T10:00'), at('2026-07-27T10:00'), at('2026-07-27T12:00')].map(pos)).toEqual([0, 3, 9])
})

test('the axis dates four ticks, the year when another, never two labels touching', () => {
  const times = [at('2025-12-06T10:00'), at('2026-03-05T10:00'), at('2026-07-25T10:00'), at('2026-07-27T10:00')]
  // At 30 columns «6 dic'25» would touch «5 mar», and is left out.
  expect(axisOf(times, 30, NOW)).toBe('        5 mar   25 lug  27 lug')
  expect(axisOf(times, 40, NOW)).toBe("6 dic'25   5 mar       25 lug     27 lug")
  // Narrower: the newest stay.
  expect(axisOf(times, 14, NOW)).toBe('  5 mar 27 lug')
  expect(axisOf([], 5, NOW)).toBe('     ')
})

test('bars: grown from a fork and merged back, still open, a trunk with no fork, the one you are on', () => {
  expect(barOf(info({ status: 'merged' }), 2, 5, 8)).toBe('  ┗━━┛  ')
  expect(barOf(info({ status: 'open' }), 2, 2, 8)).toBe('  ┗●    ')
  expect(barOf(info({ status: 'open', forkSha: null }), 0, 3, 5)).toBe('●━━● ')
  expect(barOf(info({ status: 'head', forkSha: null }), 0, 4, 5)).toBe('●━━━◉')
})

test('what became of a branch, in words; the branch you are on is not named again', () => {
  expect(statusOf(info({ status: 'head', shas: ['a', 'b'] }), 'main')).toBe('sei qui · 2 commit')
  expect(statusOf(info({ status: 'merged', pr: 3, mergedInto: 'main', isOnGitHub: true }), 'main')).toBe('unito #3 · 1 commit · ☁ resta su GitHub')
  expect(statusOf(info({ status: 'merged', mergedInto: 'dev' }), 'main')).toBe('unito in dev · 1 commit')
  expect(statusOf(info({ status: 'remote' }), 'main')).toBe('solo su GitHub · 1 commit')
  expect(statusOf(info({ status: 'open' }), 'main')).toBe('aperto · 1 commit · solo qui')
})

test('the graph is as wide as the widest line of its day, not of the whole history', () => {
  const row = (n: number, below = 0): GraphRow => ({ cells: Array.from({ length: n }, () => ({ ch: '┃', color: 0 })), col: 0, color: 0, below: Array.from({ length: below }, () => ({ ch: '┃', color: 0 })), isPlain: false })
  const rows = [row(1, 1), row(5, 5), row(1, 1)]
  const items: Item[] = [
    { kind: 'day', key: 'd1', at: 0, index: 0 },
    { kind: 'commit', key: 'a', index: 0 },
    { kind: 'day', key: 'd2', at: 0, index: 1 },
    { kind: 'commit', key: 'b', index: 1 },
    { kind: 'commit', key: 'c', index: 2 },
  ]
  expect(widthsOf(items, rows)).toEqual([1, 1, 5, 5, 5])
})
