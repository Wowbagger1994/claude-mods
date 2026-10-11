import { expect, test } from 'claude-code/testing'

import type { RepoState } from './state'
import { statusLine } from './state'

const repo = (over: Partial<RepoState>): RepoState => ({
  repo: '/r/a', name: 'a', branch: 'main', commands: [], source: { kind: 'none' },
  local: null, running: null, isDirty: false, ci: null, ciNote: null, isFetching: false, ...over,
})
const run = (exitCode: number) => ({ label: 'x', command: 'x', exitCode, durationMs: 1, tail: [] })
const ci = (...buckets: ('pass' | 'fail' | 'pending' | 'skipping')[]) => ({ sha: 's', pr: null, at: 0, checks: buckets.map((bucket, i) => ({ name: `c${i}`, workflow: '', bucket, link: '' })) })

test('the status line: tests and CI of every repository, or nothing', () => {
  expect(statusLine([])).toBeNull()
  expect(statusLine([repo({})])).toBeNull()
  expect(statusLine([repo({ local: { at: 0, runs: [run(0), run(0)] } })])).toBe('✓ test 2/2 · /checks')
  expect(statusLine([repo({ local: { at: 0, runs: [run(0), run(1)] } }), repo({ local: { at: 0, runs: [run(0)] } })])).toBe('✗ test 2/3 · /checks')
  expect(statusLine([repo({ running: 'lint', local: { at: 0, runs: [run(1)] } })])).toBe('⏳ test · /checks')
  expect(statusLine([repo({ ci: ci('pass', 'pending', 'skipping') })])).toBe('CI ⏳ 1/2 · /checks')
  expect(statusLine([repo({ ci: ci('pass', 'fail', 'pending') })])).toBe('CI ✗ 1/3 · /checks')
  expect(statusLine([repo({ local: { at: 0, runs: [run(0)] }, ci: ci('pass') })])).toBe('✓ test 1/1 · CI ✓ 1/1 · /checks')
})
