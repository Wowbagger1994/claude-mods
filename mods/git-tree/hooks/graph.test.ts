import { expect, test } from 'claude-code/testing'

import type { Commit } from '../types'
import type { GraphRow } from './graph'
import { graphWidth, layout } from './graph'
import { graphRoom } from './paint'

const c = (sha: string, ...parents: string[]): Commit => ({ sha, parents, author: 'a', at: 0, subject: sha, refs: [] })
const drawn = (rows: readonly GraphRow[]) => rows.map(r => r.cells.map(x => x.ch).join('').trimEnd())

test('a straight line of commits is one lane', () => {
  expect(drawn(layout([c('C', 'B'), c('B', 'A'), c('A')], null))).toEqual(['●', '●', '●'])
})

test('a merge opens a lane to its second parent; where the branch began, the lane closes', () => {
  const rows = layout([c('M', 'C', 'F'), c('F', 'E'), c('E', 'B'), c('C', 'B'), c('B', 'A'), c('A')], null)
  expect(drawn(rows)).toEqual(['◆━┓', '┃ ●', '┃ ●', '● ┃', '●━┛', '●'])
  expect(rows.map(r => r.col)).toEqual([0, 1, 1, 0, 0, 0])
})

test('two tips from one base: the second gets a lane of its own and a colour of its own', () => {
  const rows = layout([c('X', 'B'), c('Y', 'B'), c('B', 'A'), c('A')], null)
  expect(drawn(rows)).toEqual(['●', '┃ ●', '●━┛', '●'])
  expect(rows[0]!.color).not.toBe(rows[1]!.color)
  // The closing stroke wears the colour of the lane it closes.
  expect(rows[2]!.cells[2]!.color).toBe(rows[1]!.color)
})

test('three branches closing at once: the line goes on past the nearer ones', () => {
  expect(drawn(layout([c('X', 'B'), c('Y', 'B'), c('Z', 'B'), c('B')], null))).toEqual(['●', '┃ ●', '┃ ┃ ●', '●━┻━┛'])
})

test('a merge whose second parent a lane already waits for joins that lane', () => {
  expect(drawn(layout([c('T', 'Q'), c('M', 'P', 'Q'), c('P', 'Q'), c('Q')], null))).toEqual(['●', '┣━◆', '┃ ●', '●━┛'])
})

test('a stroke across a lane that passes by crosses it', () => {
  expect(drawn(layout([c('A', 'M'), c('B', 'Y'), c('M', 'X', 'Z'), c('Z', 'X'), c('Y', 'X'), c('X')], null)).slice(0, 3)).toEqual(['●', '┃ ●', '◆━╋━┓'])
})

test('a lane freed by a root commit is taken by the next new tip, not left as a hole forever', () => {
  const rows = layout([c('P', 'X'), c('Q', 'Y'), c('X'), c('T', 'Y'), c('Y')], null)
  expect(drawn(rows)).toEqual(['●', '┃ ●', '● ┃', '● ┃', '●━┛'])
  expect(rows.map(r => r.col)).toEqual([0, 1, 0, 0, 0])
})

test('below each commit, the lanes that go on', () => {
  const rows = layout([c('M', 'C', 'F'), c('F', 'C'), c('C')], null)
  expect(rows.map(r => r.below.map(x => x.ch).join(''))).toEqual(['┃ ┃', '┃ ┃', ''])
})

test('a merge’s new lane fills a free gap on its right rather than widening the graph', () => {
  const rows = layout([c('P', 'X'), c('Q', 'Y'), c('R', 'Z'), c('Y'), c('X', 'W', 'V')], null)
  expect(drawn(rows).slice(3)).toEqual(['┃ ● ┃', '◆━┓ ┃'])
})

test('a merge’s line to its other parent wears that parent’s branch colour', () => {
  const colors: Record<string, number> = { M: 0, C: 0, F: 5, A: 0 }
  const rows = layout([c('M', 'C', 'F'), c('F', 'A'), c('C', 'A'), c('A')], null, sha => colors[sha] ?? -1)
  expect(rows[0]!.cells[2]!.color).toBe(5)
  expect(rows[1]!.color).toBe(5)
})

test('the checked-out commit is marked apart', () => {
  expect(drawn(layout([c('C', 'B'), c('B', 'A'), c('A')], 'B'))).toEqual(['●', '◉', '●'])
})

test('the graph keeps to its share of the pane, all of it when it fits', () => {
  expect(graphRoom(50, 100)).toBe(40)
  expect(graphRoom(5, 100)).toBe(5)
  expect(graphRoom(30, 10)).toBe(7)
})

test('the width is the widest row', () => {
  expect(graphWidth(layout([c('M', 'C', 'F'), c('F', 'C'), c('C')], null))).toBe(3)
  expect(graphWidth([])).toBe(0)
})
