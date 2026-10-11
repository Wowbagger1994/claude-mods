import { describe, expect, test } from 'claude-code/testing'

import type { ChangedFile } from '../types'
import { addEdit, mapEdit, shortPath, tabLabel, toEditRecord, toFileEdit } from './diff'

const editResult = {
  filePath: '/Users/me/Repos/app/src/app.js',
  oldString: 'const a = 1',
  newString: 'const a = 2',
  originalFile: 'const a = 1\nconst b = 2\n',
  structuredPatch: [{ oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: ['-const a = 1', '+const a = 2'] }],
  userModified: false,
  replaceAll: false,
}

const file = (path: string, root: string | null = null): ChangedFile => ({
  path,
  isNew: false,
  edits: [],
  lineCount: null,
  marks: [],
  root,
  branch: null,
})

const recordOf = (result: unknown) => {
  const record = toEditRecord(result)
  if (record === null) throw new Error('record expected')
  return record
}

describe('toEditRecord', () => {
  test('reads the hunks of an Edit result and counts the lines after it', async () => {
    const record = recordOf(editResult)

    expect(record.filePath).toBe('/Users/me/Repos/app/src/app.js')
    expect(record.hunks.length).toBe(1)
    expect(record.isNew).toBe(false)
    expect(record.lineCount).toBe(2)
  })

  test('builds an all-added hunk for a new file written with an empty patch', async () => {
    const record = recordOf({ type: 'create', filePath: '/x/new.ts', content: 'a\nb\n', structuredPatch: [] })

    expect(record.isNew).toBe(true)
    expect(record.hunks[0]?.lines).toEqual(['+a', '+b'])
    expect(record.lineCount).toBe(2)
  })

  test('leaves the line count unknown when the result holds no file text', async () => {
    expect(recordOf({ ...editResult, originalFile: null }).lineCount).toBe(null)
  })

  test('ignores a staged edit, a write that changed nothing and a malformed value', async () => {
    expect(toEditRecord({ ...editResult, staged: true })).toBe(null)
    expect(toEditRecord({ type: 'update', filePath: '/x/a.ts', content: 'a', structuredPatch: [] })).toBe(null)
    expect(toEditRecord('not a record')).toBe(null)
  })
})

describe('toFileEdit', () => {
  test('writes a unified diff with its header, counts, time and a pending explanation', async () => {
    const edit = toFileEdit('t1', recordOf(editResult), 1000)

    expect(edit.diff).toBe('@@ -1,1 +1,1 @@\n-const a = 1\n+const a = 2')
    expect(edit.added).toBe(1)
    expect(edit.removed).toBe(1)
    expect(edit.at).toBe(1000)
    expect(edit.explanationState).toBe('pending')
  })

  test('strips control characters Code would refuse, keeping tabs', async () => {
    const record = recordOf({
      ...editResult,
      structuredPatch: [{ oldStart: 1, oldLines: 0, newStart: 1, newLines: 1, lines: ['+a\r\u001b[0m\tb'] }],
    })

    expect(toFileEdit('t2', record, 0).diff).toBe('@@ -1,0 +1,1 @@\n+a[0m\tb')
  })
})

describe('addEdit', () => {
  test('groups edits by file, moves the touched file last and leaves the input alone', async () => {
    const a = recordOf(editResult)
    const b = recordOf({ ...editResult, filePath: '/Users/me/Repos/app/src/b.js' })

    const one = addEdit([], a, toFileEdit('1', a, 0), null)
    const two = addEdit(one, b, toFileEdit('2', b, 0), null)
    const three = addEdit(two, a, toFileEdit('3', a, 0), null)

    expect(three.map(f => f.path)).toEqual(['/Users/me/Repos/app/src/b.js', '/Users/me/Repos/app/src/app.js'])
    expect(three[1]?.edits.map(e => e.id)).toEqual(['1', '3'])
    expect(one[0]?.edits.length).toBe(1)
  })

  test('keeps the worktree, carries the line count forward and marks the changed lines', async () => {
    const a = recordOf(editResult)
    const repo = { root: '/Users/me/Repos/app', branch: 'main' }
    const first = addEdit([], a, toFileEdit('1', a, 0), repo)
    const unknown = recordOf({ ...editResult, originalFile: null })
    const second = addEdit(first, unknown, toFileEdit('2', unknown, 0), null)

    expect(second[0]?.root).toBe('/Users/me/Repos/app')
    expect(second[0]?.branch).toBe('main')
    expect(second[0]?.lineCount).toBe(2)
    expect(second[0]?.marks.map(m => [m.editId, m.start, m.kind])).toEqual([['2', 1, 'changed']])
  })
})

describe('mapEdit', () => {
  test('changes one edit and leaves the others and the input alone', async () => {
    const a = recordOf(editResult)
    const files = addEdit(addEdit([], a, toFileEdit('1', a, 0), null), a, toFileEdit('2', a, 0), null)
    const changed = mapEdit(files, '2', e => ({ ...e, explanationState: 'done', explanation: 'perché' }))

    expect(changed[0]?.edits.map(e => e.explanationState)).toEqual(['pending', 'done'])
    expect(files[0]?.edits[1]?.explanationState).toBe('pending')
  })
})

describe('labels', () => {
  test('adds the folder only when two tabs of a group share a file name', async () => {
    const group = [file('/r/src/index.js'), file('/r/test/index.js'), file('/r/src/app.js')]

    expect(tabLabel('/r/src/index.js', group)).toBe('src/index.js')
    expect(tabLabel('/r/src/app.js', group)).toBe('app.js')
  })

  test('writes a path inside its worktree, else with the home folder as ~', async () => {
    expect(shortPath('/Users/me/Repos/app/src/a.js', '/Users/me/Repos/app')).toBe('src/a.js')
    expect(shortPath('/Users/me/notes/a.md')).toBe('~/notes/a.md')
  })
})
