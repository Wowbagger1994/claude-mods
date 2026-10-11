import { describe, expect, test } from 'claude-code/testing'

import type { Mark } from '../types'
import { countLines, marksOf, shiftMarks, toOps } from './marks'

// A 10-line file; lines 4-5 replaced by three lines, line 8 removed.
const hunks = [
  {
    oldStart: 2,
    oldLines: 8,
    newStart: 2,
    newLines: 8,
    lines: [' l2', ' l3', '-l4', '-l5', '+n4', '+n5', '+n6', ' l6', ' l7', '-l8', ' l9'],
  },
]

describe('toOps', () => {
  test('splits a hunk into its runs of changed lines, in both files’ coordinates', async () => {
    expect(toOps(hunks)).toEqual([
      { oldStart: 4, oldCount: 2, newStart: 4, newCount: 3 },
      { oldStart: 8, oldCount: 1, newStart: 9, newCount: 0 },
    ])
  })
})

describe('marksOf', () => {
  test('marks replaced lines as changed and a removal at the line it left off', async () => {
    expect(marksOf('e', hunks)).toEqual([
      { editId: 'e', start: 4, end: 6, kind: 'changed' },
      { editId: 'e', start: 9, end: 9, kind: 'removed' },
    ])
  })

  test('marks a new file’s lines as added', async () => {
    const created = [{ oldStart: 0, oldLines: 0, newStart: 1, newLines: 2, lines: ['+a', '+b'] }]

    expect(marksOf('n', created)).toEqual([{ editId: 'n', start: 1, end: 2, kind: 'added' }])
  })
})

describe('shiftMarks', () => {
  const mark = (start: number, end: number): Mark => ({ editId: 'old', start, end, kind: 'added' })

  test('moves marks below an edit by the lines it added or took out, leaves those above', async () => {
    const shifted = shiftMarks([mark(1, 1), mark(7, 7), mark(10, 10)], hunks)

    // line 7 sits below the +1 at 4-5; line 10 below both the +1 and the -1 at 8
    expect(shifted.map(m => [m.start, m.end])).toEqual([
      [1, 1],
      [8, 8],
      [10, 10],
    ])
  })

  test('drops marks on lines the edit rewrote', async () => {
    expect(shiftMarks([mark(5, 5), mark(8, 8)], hunks)).toEqual([])
  })

  test('shifts a mark down when lines are inserted right above it', async () => {
    const insert = [{ oldStart: 3, oldLines: 0, newStart: 3, newLines: 2, lines: ['+x', '+y'] }]

    expect(shiftMarks([mark(3, 4)], insert).map(m => [m.start, m.end])).toEqual([[5, 6]])
  })
})

describe('countLines', () => {
  test('does not count a final newline as a line', async () => {
    expect(countLines('a\nb\n')).toBe(2)
    expect(countLines('a\nb')).toBe(2)
    expect(countLines('')).toBe(0)
  })
})
