import { expect, test } from 'claude-code/testing'

import type { CiCheck } from '../types'
import { bucketOf, news, parsePrChecks, parseRuns, runIdOf, scrub, tailOf, tally } from './ci'

const check = (name: string, bucket: CiCheck['bucket']): CiCheck => ({ name, workflow: 'CI', bucket, link: '' })

test('a PR’s checks and a commit’s runs read alike', () => {
  expect(parsePrChecks('[{"name":"lint","bucket":"fail","link":"https://x/actions/runs/9/job/1","workflow":"CI"},{"name":"odd","bucket":"weird"}]')).toEqual([
    { name: 'lint', workflow: 'CI', bucket: 'fail', link: 'https://x/actions/runs/9/job/1' },
    { name: 'odd', workflow: '', bucket: 'pending', link: '' },
  ])
  expect(parseRuns('[{"name":"CI","status":"completed","conclusion":"success","url":"u","workflowName":"CI"}]')).toEqual([{ name: 'CI', workflow: 'CI', bucket: 'pass', link: 'u' }])
  expect(parsePrChecks('no pull requests found')).toBeNull()
  expect(parseRuns('{}')).toBeNull()
})

test('a run’s status and conclusion as a bucket', () => {
  expect(bucketOf('in_progress', '')).toBe('pending')
  expect(bucketOf('queued', '')).toBe('pending')
  expect(bucketOf('completed', 'success')).toBe('pass')
  expect(bucketOf('completed', 'failure')).toBe('fail')
  expect(bucketOf('completed', 'timed_out')).toBe('fail')
  expect(bucketOf('completed', 'cancelled')).toBe('cancel')
  expect(bucketOf('completed', 'skipped')).toBe('skipping')
})

test('the tally leaves skipped checks out', () => {
  expect(tally([check('a', 'pass'), check('b', 'fail'), check('c', 'pending'), check('d', 'skipping'), check('e', 'cancel')])).toEqual({ total: 4, passed: 1, failed: 2, pending: 1 })
})

test('the run id is read off a check’s link', () => {
  expect(runIdOf('https://github.com/o/r/actions/runs/37950618136/job/1')).toBe('37950618136')
  expect(runIdOf('https://ci.example.com/build/3')).toBeNull()
})

test('news: each failure told once per commit; the end told when the last pending one finishes', () => {
  const told = new Set(['abc:lint'])
  expect(news([check('lint', 'pending'), check('test', 'pending')], [check('lint', 'fail'), check('test', 'pending')], new Set(), 'abc')).toEqual({ failed: [check('lint', 'fail')], isDone: false })
  expect(news([check('lint', 'fail'), check('test', 'pending')], [check('lint', 'fail'), check('test', 'pass')], told, 'abc')).toEqual({ failed: [], isDone: true })
  // Already over when first seen: nothing ends now, but its failure is new.
  expect(news(null, [check('lint', 'fail')], new Set(), 'def').failed).toHaveLength(1)
  expect(news([check('a', 'pass')], [check('a', 'pass')], told, 'abc').isDone).toBe(false)
  expect(news([check('a', 'pending')], [], told, 'abc').isDone).toBe(false)
})

test('a log leaves the machine with its secrets masked, by shape', () => {
  const token = 'ghp_' + 'Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8'
  const google = 'ya29.' + 'a0AfH6SMBx-short'
  expect(scrub(`auth ${token} ok`)).toBe('auth [segreto oscurato] ok')
  expect(scrub(`bearer ${google}`)).toBe('bearer [segreto oscurato]')
  expect(scrub('a1'.repeat(20))).toBe('[oscurato]')
  // Paths and plain words stay readable.
  expect(scrub('/Users/me/Repos/a_rather_long_repository_name/src/module_with_a_long_name.py')).toBe('/Users/me/Repos/a_rather_long_repository_name/src/module_with_a_long_name.py')
  expect(scrub('x'.repeat(40))).toBe('x'.repeat(40))
  expect(scrub('FAILED tools/ci/tests/test_catalog.py::test_x')).toBe('FAILED tools/ci/tests/test_catalog.py::test_x')
  expect(tailOf('a\n\nb  \nc\n', 2)).toEqual(['b', 'c'])
})
