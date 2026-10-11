import { expect, test } from 'claude-code/testing'

import type { Commit, SessionDay } from '../types'
import { daysOf, factsKey, mergeDays, parseScan, projectLabel, projectName, repoOf, uniqueCommits, unionMinutes } from './facts'

const session = (over: Partial<SessionDay>): SessionDay => ({
  sessionId: 's1',
  day: '2026-10-10',
  project: '/Users/me/Repos/mouse',
  branch: null,
  title: 'Diario',
  start: '2026-10-10T09:00:00+02:00',
  end: '2026-10-10T10:00:00+02:00',
  activeMinutes: 60,
  spans: [['2026-10-10T09:00:00+02:00', '2026-10-10T10:00:00+02:00']],
  prompts: 3,
  edits: [],
  commands: 2,
  ...over,
  repo: over.repo ?? over.project ?? '/Users/me/Repos/mouse',
})

const commit = (over: Partial<Commit>): Commit => ({ project: '/Users/me/Repos/mouse', day: '2026-10-10', time: '09:30', hash: 'abc1234', subject: 'feat: x', ...over })

test('overlapping spans count once, apart ones add up, whatever their offsets', () => {
  expect(unionMinutes([['2026-10-10T10:00:00+02:00', '2026-10-10T11:00:00+02:00'], ['2026-10-10T10:30:00+02:00', '2026-10-10T11:30:00+02:00']])).toBe(90)
  expect(unionMinutes([['2026-10-10T10:00:00+02:00', '2026-10-10T10:20:00+02:00'], ['2026-10-10T11:00:00+02:00', '2026-10-10T11:10:00+02:00']])).toBe(30)
  // 08:15 UTC is 10:15 in Rome: inside the first span.
  expect(unionMinutes([['2026-10-10T10:00:00+02:00', '2026-10-10T10:30:00+02:00'], ['2026-10-10T08:15:00Z', '2026-10-10T08:45:00Z']])).toBe(45)
  // A span inside another, and one unreadable or backwards.
  expect(unionMinutes([['2026-10-10T10:00:00+02:00', '2026-10-10T12:00:00+02:00'], ['2026-10-10T10:30:00+02:00', '2026-10-10T10:40:00+02:00'], ['x', 'y'], ['2026-10-10T13:00:00+02:00', '2026-10-10T12:00:00+02:00']])).toBe(120)
  expect(unionMinutes([])).toBe(0)
})

test('a worktree is its repository; a background job is named by its id', () => {
  expect(repoOf('/r/shop_backend/.claude/worktrees/console-ui')).toBe('/r/shop_backend')
  expect(repoOf('/r/shop_backend/.claude/worktrees/console-ui/src')).toBe('/r/shop_backend')
  expect(projectName('/r/shop_backend/.claude/worktrees/console-ui')).toBe('shop_backend')
  expect(projectName('/Users/me/.claude/jobs/fdabb902/tmp')).toBe('job fdabb902')
  expect(projectName('/Users/me/Repos/mouse/')).toBe('mouse')
  expect(projectName('/')).toBe('/')
})

test('a commit seen on two branches (same author time and subject) counts once; a “wip” of another time is another commit', () => {
  const kept = uniqueCommits([
    commit({ hash: 'rebased' }),
    commit({ hash: 'a' }),
    commit({ hash: 'later', time: '11:00' }),
    commit({ hash: 'next-day', day: '2026-10-11' }),
    commit({ hash: 'c', subject: 'fix: y' }),
    commit({ hash: 'd', project: '/r/other' }),
  ])
  expect(kept.map(c => c.hash)).toEqual(['rebased', 'c', 'd', 'later', 'next-day'])
})

test('a day joins its sessions: parallel ones overlap, projects by time, commits on their day', () => {
  const days = daysOf({
    today: '2026-10-10',
    sessions: [
      session({ sessionId: 'late', start: '2026-10-10T09:30:00+02:00', spans: [['2026-10-10T09:30:00+02:00', '2026-10-10T10:30:00+02:00']], project: '/r/shop/.claude/worktrees/w' }),
      session({ sessionId: 'early' }),
      session({ sessionId: 'yesterday', day: '2026-10-09', spans: [['2026-10-09T09:00:00+02:00', '2026-10-09T09:10:00+02:00']] }),
    ],
    commits: [commit({ project: '/r/shop' }), commit({ hash: 'z', day: '2026-10-08', subject: 'only a commit' })],
  })
  const day = days.get('2026-10-10')!

  // 09:00–10:00 and 09:30–10:30: an hour and a half, not two hours.
  expect(day.activeMinutes).toBe(90)
  expect(day.sessions.map(s => s.sessionId)).toEqual(['early', 'late'])
  // As long on each: the one with commits first.
  expect(day.projects).toEqual([
    { name: 'shop', minutes: 60, sessions: 1, commits: 1 },
    { name: 'mouse', minutes: 60, sessions: 1, commits: 0 },
  ])
  expect(days.get('2026-10-09')!.activeMinutes).toBe(10)
  // A day with commits and no session is still a day of work.
  expect(days.get('2026-10-08')!.commits.map(c => c.hash)).toEqual(['z'])
})

test('a week adds its days’ times, project by project', () => {
  const days = daysOf({
    today: '2026-10-10',
    sessions: [session({}), session({ sessionId: 's2', day: '2026-10-09', spans: [['2026-10-09T09:00:00+02:00', '2026-10-09T09:30:00+02:00']] })],
    commits: [],
  })
  const week = mergeDays([...days.values()])
  expect(week.activeMinutes).toBe(90)
  expect(week.projects).toEqual([{ name: 'mouse', minutes: 90, sessions: 2, commits: 0 }])
})

test('the scan keeps what is well formed and refuses what is not a scan', () => {
  expect(parseScan('not json')).toBeNull()
  expect(parseScan('{"today":"ieri","sessions":[],"commits":[]}')).toBeNull()
  expect(parseScan('[]')).toBeNull()
  const scan = parseScan(JSON.stringify({ today: '2026-10-10', sessions: [session({}), { ...session({}), spans: 'x' }, null], commits: [commit({}), { hash: 1 }] }))
  expect(scan?.sessions).toHaveLength(1)
  expect(scan?.commits).toHaveLength(1)
})

test('the facts’ key moves with a new session, title or commit, and with half hours, not with minutes', () => {
  const base = daysOf({ today: '2026-10-10', sessions: [session({})], commits: [] }).get('2026-10-10')!
  const key = factsKey([base])

  expect(factsKey([{ ...base, activeMinutes: base.activeMinutes + 10 }])).toBe(key)
  expect(factsKey([{ ...base, activeMinutes: base.activeMinutes + 30 }])).not.toBe(key)
  expect(factsKey([{ ...base, sessions: [session({ title: 'altro' })] }])).not.toBe(key)
  expect(factsKey([{ ...base, commits: [commit({})] }])).not.toBe(key)
})

test('a project reads by its time, or by its commits when it has no time of its own', () => {
  expect(projectLabel({ name: 'mouse', minutes: 90, sessions: 1, commits: 2 })).toBe('mouse 1h 30m')
  expect(projectLabel({ name: 'shop', minutes: 0, sessions: 0, commits: 3 })).toBe('shop 3 commit')
  expect(projectLabel({ name: 'vuoto', minutes: 0, sessions: 1, commits: 0 })).toBe('vuoto 0m')
})
