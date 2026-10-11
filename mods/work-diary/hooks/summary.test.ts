import { expect, test } from 'claude-code/testing'

import type { DayFacts, SessionDay } from '../types'
import { cleanReply, dayFactsText, dayKey, dayPrompt, pruneSummaries, scrub, weekKey, weekPrompt } from './summary'

const session: SessionDay = {
  sessionId: 's1',
  day: '2026-10-10',
  project: '/Users/me/Repos/shop/.claude/worktrees/fix-idor',
  repo: '/Users/me/Repos/shop',
  branch: 'fix/idor',
  title: 'Correggi IDOR company',
  start: '2026-10-10T09:05:00+02:00',
  end: '2026-10-10T11:40:00+02:00',
  activeMinutes: 95,
  spans: [],
  prompts: 12,
  edits: Array.from({ length: 10 }, (_, i) => `/Users/me/Repos/shop/src/file${i}.py`),
  commands: 30,
}

const facts: DayFacts = {
  day: '2026-10-10',
  activeMinutes: 95,
  projects: [{ name: 'shop', minutes: 95, sessions: 1, commits: 1 }],
  sessions: [session],
  commits: [{ project: '/Users/me/Repos/shop', day: '2026-10-10', time: '11:30', hash: 'a1', subject: 'fix: access check on company' }],
}

test('the day’s facts name sessions, projects, files by name and commits, never full paths', () => {
  const text = dayFactsText(facts)

  expect(text).toContain('sab 10 ottobre: 1h 35m')
  expect(text).toContain('09:05–11:40 shop (fix/idor): «Correggi IDOR company»')
  expect(text).toContain('12 messaggi, 30 comandi')
  expect(text).toContain('file0.py')
  expect(text).toContain('e altri 2')
  expect(text).not.toContain('file9.py')
  expect(text).not.toContain('/Users/me')
  expect(text).toContain('11:30 shop: fix: access check on company')
  expect(dayPrompt(facts)).toContain('da 3 a 5 righe')
})

test('a token in a title or a commit never reaches the model', () => {
  const token = 'ghp_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'
  expect(scrub(`fix: rotate ${token} now`)).toBe('fix: rotate … now')
  const leaky = { ...facts, commits: [{ ...facts.commits[0]!, subject: `chore: key ${token}` }] }
  expect(dayFactsText(leaky)).not.toContain(token)
})

test('the week reads each day’s summary when written, its facts otherwise', () => {
  const other: DayFacts = { ...facts, day: '2026-10-09', sessions: [{ ...session, day: '2026-10-09', title: 'Ieri' }] }
  const empty: DayFacts = { day: '2026-10-08', activeMinutes: 0, projects: [], sessions: [], commits: [] }
  const prompt = weekPrompt([empty, other, facts], { [dayKey('2026-10-10')]: { text: '• Hai chiuso la IDOR', factsKey: '', at: 0 } })

  expect(prompt).toContain('• Hai chiuso la IDOR')
  expect(prompt).not.toContain('Correggi IDOR company')
  expect(prompt).toContain('«Ieri»')
  expect(prompt).not.toContain('gio 8 ottobre')
})

test('a reply becomes bullet lines: markdown, numbers and headings go, at most the cap', () => {
  expect(cleanReply('## Giornata\n- uno\n* due\n\n1. tre\n• quattro\nCinque\nsei', 5)).toBe('• uno\n• due\n• tre\n• quattro\n• Cinque')
  expect(cleanReply('  \n#\n', 5)).toBeNull()
})

test('summaries older than the transcripts go, days and weeks alike', () => {
  const s = { text: 'x', factsKey: '', at: 0 }
  const kept = pruneSummaries({ [dayKey('2026-09-01')]: s, [dayKey('2026-09-09')]: s, [dayKey('2026-10-10')]: s, [weekKey('2026-08-31')]: s, [weekKey('2026-10-05')]: s }, '2026-10-10')
  expect(Object.keys(kept)).toEqual([dayKey('2026-09-09'), dayKey('2026-10-10'), weekKey('2026-10-05')])
})
