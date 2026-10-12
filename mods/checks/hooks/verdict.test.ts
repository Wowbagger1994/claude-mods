import { expect, test } from 'claude-code/testing'

import type { RepoState } from './state'
import { failuresOf, meterCells, overallOf, verdictOf } from './verdict'

const repo = (over: Partial<RepoState>): RepoState => ({
  repo: '/r/a', name: 'a', branch: 'main', commands: [], source: { kind: 'none' },
  local: null, running: null, isDirty: false, ci: null, ciNote: null, isFetching: false, ...over,
})
const run = (exitCode: number) => ({ label: 'x', command: 'x', exitCode, durationMs: 1, tail: [] })
const ci = (...buckets: ('pass' | 'fail' | 'pending' | 'skipping' | 'cancel')[]) => ({
  sha: 's', pr: null, at: 0, checks: buckets.map((bucket, i) => ({ name: `c${i}`, workflow: '', bucket, link: '' })),
})

test('a repository is red with a failure anywhere, yellow while something runs, green once all passed', () => {
  expect(verdictOf(repo({}))).toBe('idle')
  expect(verdictOf(repo({ local: { at: 0, runs: [run(0)] } }))).toBe('pass')
  expect(verdictOf(repo({ local: { at: 0, runs: [run(0)] }, ci: ci('pass', 'skipping') }))).toBe('pass')
  expect(verdictOf(repo({ local: { at: 0, runs: [run(0)] }, ci: ci('pass', 'pending') }))).toBe('running')
  expect(verdictOf(repo({ running: 'lint' }))).toBe('running')
  // A failure outweighs what still runs: it is already known.
  expect(verdictOf(repo({ running: 'lint', ci: ci('fail') }))).toBe('fail')
  expect(verdictOf(repo({ local: { at: 0, runs: [run(2)] }, ci: ci('pass') }))).toBe('fail')
  expect(verdictOf(repo({ ci: ci('cancel') }))).toBe('fail')
  expect(verdictOf(repo({ ci: ci('skipping') }))).toBe('idle')
})

test('the failures counted: local runs and CI checks', () => {
  expect(failuresOf(repo({ local: { at: 0, runs: [run(1), run(0)] }, ci: ci('fail', 'cancel', 'pass') }))).toBe(3)
  expect(failuresOf(repo({}))).toBe(0)
})

test('the whole pane takes the worst verdict, failures summed', () => {
  expect(overallOf([])).toEqual({ verdict: 'idle', failures: 0 })
  expect(overallOf([repo({ local: { at: 0, runs: [run(0)] } }), repo({ running: 'x' })])).toEqual({ verdict: 'running', failures: 0 })
  expect(overallOf([repo({ local: { at: 0, runs: [run(1)] } }), repo({ ci: ci('fail', 'pending') })])).toEqual({ verdict: 'fail', failures: 2 })
  expect(overallOf([repo({ local: { at: 0, runs: [run(0)] } }), repo({})])).toEqual({ verdict: 'pass', failures: 0 })
})

test('the meter splits its cells among passed, failed and pending, never hiding a nonzero part', () => {
  expect(meterCells({ total: 4, passed: 4, failed: 0, pending: 0 }, 12)).toEqual({ pass: 12, fail: 0, pending: 0, empty: 0 })
  expect(meterCells({ total: 4, passed: 2, failed: 1, pending: 1 }, 12)).toEqual({ pass: 6, fail: 3, pending: 3, empty: 0 })
  // One failure among many still gets its red cell, taken from the largest part.
  expect(meterCells({ total: 100, passed: 99, failed: 1, pending: 0 }, 12)).toEqual({ pass: 11, fail: 1, pending: 0, empty: 0 })
  expect(meterCells({ total: 3, passed: 1, failed: 0, pending: 0 }, 12)).toEqual({ pass: 4, fail: 0, pending: 0, empty: 8 })
  expect(meterCells({ total: 0, passed: 0, failed: 0, pending: 0 }, 12)).toEqual({ pass: 0, fail: 0, pending: 0, empty: 12 })
})
