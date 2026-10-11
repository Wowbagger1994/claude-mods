import { describe, expect, test } from 'claude-code/testing'

import type { ChangedFile, ExplanationState } from '../types'
import { buildPrompt, parseExplanations, pendingEdits } from './explain'
import { parseRevParse } from './git'

const fileWith = (path: string, edits: [string, number, ExplanationState][]): ChangedFile => ({
  path,
  isNew: false,
  edits: edits.map(([id, at, explanationState]) => ({
    id,
    diff: `@@ -1,1 +1,1 @@\n-${id}\n+${id}!`,
    added: 1,
    removed: 1,
    at,
    explanation: null,
    explanationState,
  })),
  lineCount: 1,
  marks: [],
  root: '/r',
  branch: 'main',
})

describe('pendingEdits', () => {
  test('lists only edits waiting for a reason, oldest first, across files', async () => {
    const files = [
      fileWith('/r/a.js', [
        ['a1', 3, 'pending'],
        ['a2', 1, 'done'],
      ]),
      fileWith('/r/b.js', [['b1', 2, 'pending']]),
    ]

    expect(pendingEdits(files).map(p => p.edit.id)).toEqual(['b1', 'a1'])
  })
})

describe('buildPrompt', () => {
  test('names each edit by id and worktree path and asks for JSON only', async () => {
    const prompt = buildPrompt(pendingEdits([fileWith('/r/src/a.js', [['t1', 0, 'pending']])]))

    expect(prompt).toContain('<edit id="t1" file="src/a.js">')
    expect(prompt).toContain('+t1!')
    expect(prompt).toContain('SOLO con un oggetto JSON')
  })
})

describe('parseExplanations', () => {
  test('reads the JSON object even with words around it, keeping only asked ids', async () => {
    const reply = 'Ecco:\n{"t1": "  Per rendere il carrello immutabile.  ", "zz": "altro", "t2": 3}\nFine.'
    const texts = parseExplanations(reply, ['t1', 't2'])

    expect([...texts.entries()]).toEqual([['t1', 'Per rendere il carrello immutabile.']])
  })

  test('answers nothing for a reply that is not JSON', async () => {
    expect(parseExplanations('Non saprei.', ['t1']).size).toBe(0)
    expect(parseExplanations('{non json}', ['t1']).size).toBe(0)
  })
})

describe('parseRevParse', () => {
  test('reads the worktree root and branch', async () => {
    expect(parseRevParse(0, '/Users/me/Repos/app-feature\nfeature-x\n')).toEqual({
      root: '/Users/me/Repos/app-feature',
      branch: 'feature-x',
    })
  })

  test('has no branch on a detached HEAD and nothing outside git', async () => {
    expect(parseRevParse(0, '/r\nHEAD\n')).toEqual({ root: '/r', branch: null })
    expect(parseRevParse(128, '')).toBe(null)
  })
})
