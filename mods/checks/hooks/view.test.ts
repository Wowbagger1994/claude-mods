import { expect, test } from 'claude-code/testing'

import type { RepoState } from './state'
import { badgeText, isMixedWorkflows, localRemarks, localTally } from './view'

const repo = (over: Partial<RepoState>): RepoState => ({
  repo: '/r/a', name: 'a', branch: 'main', commands: [], source: { kind: 'none' },
  local: null, running: null, isDirty: false, ci: null, ciNote: null, isFetching: false, ...over,
})
const run = (exitCode: number) => ({ label: 'x', command: 'x', exitCode, durationMs: 1, tail: [] })
const commands = ['lint', 'unit', 'types'].map(label => ({ label, command: label }))
const check = (workflow: string) => ({ name: 'c', workflow, bucket: 'pass' as const, link: '' })

test('the badge names the failures, the run, or the green; nothing before any result', () => {
  expect(badgeText('fail', 3)).toBe('✗ 3 da sistemare')
  expect(badgeText('running', 0)).toBe('◌ in corso')
  expect(badgeText('pass', 0)).toBe('✓ tutto verde')
  expect(badgeText('idle', 0)).toBeNull()
})

test('the local meter: the last outcome, or during a run the checks done and half the one running', () => {
  expect(localTally(repo({ local: { at: 0, runs: [run(0), run(1)] } }))).toEqual({ total: 2, passed: 1, failed: 1, pending: 0 })
  expect(localTally(repo({ commands, running: 'lint' }))).toEqual({ total: 3, passed: 0, failed: 0, pending: 0.5 })
  expect(localTally(repo({ commands, running: 'types' }))).toEqual({ total: 3, passed: 0, failed: 0, pending: 2.5 })
})

test('the remarks: which check runs and where, or the age of the last run and edits since', () => {
  expect(localRemarks(repo({ commands, running: 'unit' }), 0)).toEqual([{ text: 'in corso: unit (2 di 3)', color: 'warning' }])
  expect(localRemarks(repo({}), 0)).toEqual([])
  expect(localRemarks(repo({ local: { at: 0, runs: [] }, isDirty: true }), 5 * 60_000)).toEqual([{ text: '5 min fa' }, { text: 'modifiche dopo', color: 'warning' }])
})

test('the workflow is named before each check only when there are several', () => {
  expect(isMixedWorkflows([check('CI'), check('CI')])).toBe(false)
  expect(isMixedWorkflows([check('CI'), check('')])).toBe(false)
  expect(isMixedWorkflows([check('CI'), check('Docs')])).toBe(true)
})
