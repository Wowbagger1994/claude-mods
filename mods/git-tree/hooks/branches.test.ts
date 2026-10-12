import { expect, test } from 'claude-code/testing'

import type { Commit, Ref } from '../types'
import { branchesOf, branchInfos, mergedBranchOf, mergeTitle, prOf } from './branches'

const c = (sha: string, parents: string[], refs: Ref[] = [], subject = sha): Commit => ({ sha, parents, author: 'a', at: 0, subject, refs })

/** main merged docs/x (#3) and goes on; feature/y is open; fix is on GitHub only; z was merged by hand. */
const HISTORY = [
  c('Y2', ['Y1'], [{ kind: 'local', name: 'feature/y' }]),
  c('Y1', ['M2']),
  c('F', ['M2'], [{ kind: 'remote', name: 'origin/fix' }]),
  c('M2', ['M1', 'X2'], [{ kind: 'head', name: 'main' }, { kind: 'remote', name: 'origin/main' }], 'Merge pull request #3 from ada/docs/x'),
  c('X2', ['X1'], [{ kind: 'remote', name: 'origin/docs/x' }]),
  c('X1', ['M1']),
  c('M1', ['B', 'Z1'], [], "Merge branch 'z'"),
  c('Z1', ['A']),
  c('B', ['A']),
  c('A', []),
]

test('a merge names the branch it took, in the usual words of GitHub and git', () => {
  expect(mergedBranchOf('Merge pull request #4 from lbianchi/docs/manuale-introduttivo')).toBe('docs/manuale-introduttivo')
  expect(mergedBranchOf("Merge branch 'feature/a' into main")).toBe('feature/a')
  expect(mergedBranchOf("Merge remote-tracking branch 'origin/dev'")).toBe('dev')
  expect(mergedBranchOf('Fix the tests')).toBeNull()
  expect(prOf('Merge pull request #12 from a/b')).toBe(12)
  expect(prOf('feat: x (#7)')).toBe(7)
  expect(mergeTitle(c('M', ['a', 'b'], [], 'Merge pull request #3 from ada/docs/x'))).toBe('unisce docs/x (#3)')
  expect(mergeTitle(c('M', ['a'], [], 'Merge pull request #3 from ada/docs/x'))).toBeNull()
})

test('each commit belongs to one branch: yours first down its first parents, then the others, then what merges name', () => {
  const owner = branchesOf(HISTORY)
  expect(Object.fromEntries(owner)).toEqual({
    Y2: 'feature/y', Y1: 'feature/y',
    F: 'fix',
    M2: 'main', M1: 'main', B: 'main', A: 'main',
    X2: 'docs/x', X1: 'docs/x',
    Z1: 'z',
  })
})

test('a commit no tip and no merge reaches is a branch with no name, each its own', () => {
  const owner = branchesOf([c('P', ['Q']), c('Q', []), c('R', []), c('S', [])])
  expect(owner.get('P')).toBe('senza nome')
  expect(owner.get('R')).toBe('senza nome (2)')
  expect(owner.get('S')).toBe('senza nome (3)')
})

test('on a branch of your own, the trunk keeps its history below where yours grew', () => {
  const history = [
    c('M2', ['M1'], [{ kind: 'local', name: 'main' }]),
    c('F1', ['M1'], [{ kind: 'head', name: 'feature/a' }]),
    c('M1', ['M0']),
    c('M0', []),
  ]
  const owner = branchesOf(history)
  expect([...owner]).toEqual([['M2', 'main'], ['M1', 'main'], ['M0', 'main'], ['F1', 'feature/a']])
  // Still, the branch you are on comes first, in the first colour.
  const infos = branchInfos(history, owner, 'feature/a')
  expect(infos.map(i => [i.name, i.color, i.status])).toEqual([['feature/a', 0, 'head'], ['main', 1, 'open']])
  expect(infos[0]!.forkSha).toBe('M1')
})

test('GitHub’s copy ahead of a local branch goes on under the same name', () => {
  const history = [c('N', ['L'], [{ kind: 'remote', name: 'origin/main' }]), c('L', ['K'], [{ kind: 'local', name: 'main' }]), c('K', [])]
  expect([...branchesOf(history).values()]).toEqual(['main', 'main', 'main'])
})

test('a branch merged and then worked on again is open, not merged', () => {
  const history = [
    c('X3', ['X2'], [{ kind: 'local', name: 'x' }]),
    c('M', ['A', 'X2'], [{ kind: 'head', name: 'main' }], 'Merge branch \'x\''),
    c('X2', ['A']),
    c('A', []),
  ]
  const x = branchInfos(history, branchesOf(history), 'main').find(i => i.name === 'x')
  expect(x).toMatchObject({ status: 'open', mergeSha: null, shas: ['X3', 'X2'] })
})

test('the branches’ story: where you are, merged by which pull request, still open, only on GitHub', () => {
  const infos = branchInfos(HISTORY, branchesOf(HISTORY), 'main')
  const byName = Object.fromEntries(infos.map(i => [i.name, i]))
  expect(infos[0]!.name).toBe('main')
  expect(infos[0]!.color).toBe(0)
  expect(byName.main).toMatchObject({ status: 'head', shas: ['M2', 'M1', 'B', 'A'], forkSha: null, isOnGitHub: true })
  expect(byName['docs/x']).toMatchObject({ status: 'merged', forkSha: 'M1', mergeSha: 'M2', pr: 3, mergedInto: 'main', isOnGitHub: true })
  expect(byName.z).toMatchObject({ status: 'merged', forkSha: 'A', mergeSha: 'M1', pr: null })
  expect(byName['feature/y']).toMatchObject({ status: 'open', forkSha: 'M2', mergeSha: null, isOnGitHub: false })
  expect(byName.fix).toMatchObject({ status: 'remote', forkSha: 'M2' })
  expect(new Set(infos.map(i => i.color)).size).toBe(infos.length)
})
