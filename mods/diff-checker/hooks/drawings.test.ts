import { describe, expect, test } from 'claude-code/testing'

import type { ChangedFile, FileEdit } from '../types'
import {
  changeBar,
  editTone,
  fit,
  groupByRoot,
  groupKey,
  keptExpanded,
  minimapCells,
  relativeTime,
  timelineCells,
  toRuns,
  treemapWidths,
  withoutGroup,
} from './drawings'

const edit = (id: string, at: number, added = 1, removed = 0): FileEdit => ({
  id,
  diff: '',
  added,
  removed,
  at,
  explanation: null,
  explanationState: 'pending',
})

const file = (path: string, root: string | null): ChangedFile => ({
  path,
  isNew: false,
  edits: [],
  lineCount: null,
  marks: [],
  root,
  branch: null,
})

const glyphs = (cells: readonly { glyph: string }[]) => cells.map(c => c.glyph).join('')

describe('minimapCells', () => {
  test('paints the latest edit’s lines by kind and earlier edits dim', async () => {
    const marks = [
      { editId: 'old', start: 1, end: 2, kind: 'added' as const },
      { editId: 'new', start: 6, end: 7, kind: 'changed' as const },
      { editId: 'new', start: 10, end: 10, kind: 'removed' as const },
    ]
    const cells = minimapCells(marks, 10, 'new', 10)

    expect(glyphs(cells)).toBe('▆▆───██──▼')
    expect(cells[5]?.tone).toBe('changed')
    expect(cells[0]?.tone).toBe('older')
  })

  test('squeezes a long file into the width, a cell lit when any of its lines changed', async () => {
    const cells = minimapCells([{ editId: 'e', start: 95, end: 95, kind: 'added' }], 100, 'e', 10)

    expect(glyphs(cells)).toBe('─────────█')
  })

  test('never draws more cells than the file has lines', async () => {
    expect(minimapCells([], 3, 'e', 40).length).toBe(3)
  })
})

describe('timelineCells', () => {
  test('places each edit by its time and counts edits sharing a cell', async () => {
    const edits = [edit('a', 0), edit('b', 1), edit('c', 100)]

    expect(glyphs(timelineCells(edits, 0, 100, 11, 'c'))).toBe('2·········●')
  })

  test('colours the session’s latest edit apart from the others', async () => {
    const cells = timelineCells([edit('a', 0, 0, 5), edit('z', 100)], 0, 100, 5, 'z')

    expect(cells[0]?.tone).toBe('removed')
    expect(cells[4]?.tone).toBe('latest')
  })
})

describe('treemapWidths', () => {
  test('shares the width by weight, every block at least the minimum, summing to the width', async () => {
    const widths = treemapWidths([30, 10, 0], 60, 10)

    expect(widths.reduce((s, w) => s + w, 0)).toBe(60)
    expect(Math.min(...widths)).toBeGreaterThanOrEqual(10)
    expect(widths[0]).toBeGreaterThan(widths[1] ?? 0)
  })

  test('shrinks the minimum when the blocks cannot all have it', async () => {
    expect(treemapWidths([1, 1, 1], 9, 10)).toEqual([3, 3, 3])
  })
})

describe('small helpers', () => {
  test('editTone reads the balance of added and removed lines', async () => {
    expect(editTone(9, 1)).toBe('added')
    expect(editTone(1, 9)).toBe('removed')
    expect(editTone(5, 5)).toBe('changed')
  })

  test('changeBar fills in proportion, at least one block for any change', async () => {
    expect(changeBar(10, 10, 4)).toBe('▰▰▰▰')
    expect(changeBar(1, 100, 4)).toBe('▰▱▱▱')
    expect(changeBar(0, 10, 4)).toBe('▱▱▱▱')
  })

  test('relativeTime is coarse', async () => {
    expect(relativeTime(0, 30_000)).toBe('ora')
    expect(relativeTime(0, 5 * 60_000)).toBe('5 min fa')
    expect(relativeTime(0, 2 * 3_600_000)).toBe('2 h fa')
  })

  test('toRuns joins neighbouring cells of one tone', async () => {
    const runs = toRuns([
      { glyph: '─', tone: 'idle' },
      { glyph: '─', tone: 'idle' },
      { glyph: '█', tone: 'added' },
    ])

    expect(runs).toEqual([
      { text: '──', tone: 'idle' },
      { text: '█', tone: 'added' },
    ])
  })

  test('groupByRoot keeps first-touched order and puts files outside git together', async () => {
    const groups = groupByRoot([file('/a/x', '/a'), file('/b/y', '/b'), file('/a/z', '/a'), file('/t/q', null)])

    expect(groups.map(g => [g.root, g.files.map(f => f.path)])).toEqual([
      ['/a', ['/a/x', '/a/z']],
      ['/b', ['/b/y']],
      [null, ['/t/q']],
    ])
  })

  test('fit cuts with an ellipsis', async () => {
    expect(fit('discount.js', 6)).toBe('disco…')
    expect(fit('a.js', 6)).toBe('a.js')
  })
})

test('a group is cleared by its key, the files outside git by -, the others kept in their order', () => {
  const files = [file('/w/a/x.js', '/w/a'), file('/w/b/y.js', '/w/b'), file('/tmp/z.txt', null), file('/w/a/k.js', '/w/a')]

  expect(groupKey('/w/a')).toBe('/w/a')
  expect(groupKey(null)).toBe('-')
  expect(withoutGroup(files, '/w/a').map(f => f.path)).toEqual(['/w/b/y.js', '/tmp/z.txt'])
  expect(withoutGroup(files, '-').map(f => f.path)).toEqual(['/w/a/x.js', '/w/b/y.js', '/w/a/k.js'])
  expect(withoutGroup(files, '/w/none')).toHaveLength(4)
})

test('what was opened in a cleared file is forgotten, the rest kept', () => {
  const kept = [{ ...file('/w/b/y.js', '/w/b'), edits: [edit('e2', 2)] }]
  expect(keptExpanded({ e1: true, e2: false, e3: true }, kept)).toEqual({ e2: false })
})
