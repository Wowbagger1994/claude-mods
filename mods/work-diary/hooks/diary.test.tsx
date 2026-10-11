import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import type { Scan, SessionDay } from '../types'
import { daysOf, factsKey } from './facts'

const PANE_PROPS = {
  title: 'Diario',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 60 },
  view: {},
}
const NOW = Date.parse('2026-10-10T10:00:00Z')

const session = (id: string, day: string, from: string, to: string, over: Partial<SessionDay> = {}): SessionDay => ({
  sessionId: id,
  day,
  project: '/Users/me/Repos/mouse',
  branch: 'main',
  title: `Sessione ${id}`,
  start: `${day}T${from}:00+02:00`,
  end: `${day}T${to}:00+02:00`,
  activeMinutes: 60,
  spans: [[`${day}T${from}:00+02:00`, `${day}T${to}:00+02:00`]],
  prompts: 4,
  edits: ['/Users/me/Repos/mouse/diario.ts'],
  commands: 3,
  ...over,
  repo: over.repo ?? over.project ?? '/Users/me/Repos/mouse',
})

const SCAN: Scan = {
  today: '2026-10-10',
  sessions: [
    session('oggi', '2026-10-10', '09:00', '11:00'),
    session('ieri', '2026-10-09', '14:00', '14:45', { project: '/Users/me/Repos/shop/.claude/worktrees/fix' }),
    // In parallel, in another project: the day stays 45 minutes.
    session('accanto', '2026-10-09', '14:00', '14:45', { title: 'Sessione accanto' }),
    session('settembre', '2026-09-21', '09:00', '13:00'),
  ],
  commits: [{ project: '/Users/me/Repos/shop', day: '2026-10-09', time: '14:40', hash: 'c0ffee1', subject: 'fix: controllo accessi' }],
}

type Fake = {
  argv: string[][]
  prompts: string[]
  /** What the scan prints, and how it exits. */
  scan: { stdout: string; exitCode: number; stderr: string }
  /** What the summaries' model answers: by a word of the prompt, else the default. */
  reply: (prompt: string) => string | null
  opens: string[]
  clock: ReturnType<typeof mock.clock>
  /** How long the model takes to answer, on the mocked clock. */
  replyMs: number
  /** `$.store`: what earlier sessions kept. */
  store: Map<string, unknown>
}

const fakeSession = (on: On): Fake => {
  const fake: Fake = {
    argv: [],
    prompts: [],
    scan: { stdout: JSON.stringify(SCAN), exitCode: 0, stderr: '' },
    reply: prompt => (prompt.startsWith('Settimana') ? '- Settimana di diario e accessi' : `- Riassunto ${prompt.split(":")[0]}`),
    opens: [],
    clock: mock.clock(on, { now: NOW }),
    replyMs: 0,
    store: new Map(),
  }
  on('store.get', (_$, e) => ({ value: fake.store.get(e.key) }))
  on('store.set', (_$, e) => {
    fake.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/Users/me' : undefined }))
  on('process.run', (_$, e) => {
    fake.argv.push([...e.argv])
    return { value: { ...fake.scan, isStdoutTruncated: false, isStderrTruncated: false } }
  })
  on('model.complete', async (_$, e) => {
    fake.prompts.push(e.prompt)
    if (fake.replyMs > 0) await fake.clock.sleep(fake.replyMs)
    const text = fake.reply(e.prompt)
    const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    return { value: text === null ? { isAnswered: false as const, reason: 'empty-reply' as const, usage } : { isAnswered: true as const, text, usage } }
  })
  on('ui.open', (_$, e) => {
    fake.opens.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'diary' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  return fake
}

const openDiary = async ($: Engine, fake: Fake) => {
  const answer = await $.command.run({ command: 'diary', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  await fake.clock.settle()
  return answer
}

const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: 'work-diary', surface: 'terminal', component: 'Pane', requestId: 'work-diary', props: PANE_PROPS })

/** Presses a Button of the pane by its key, as a click or its hotkey does. */
const press = async ($: Engine, fake: Fake, key: string) => {
  await $.ui.press({ plugin: 'work-diary', key })
  await fake.clock.settle()
}

const paneText = async (ui: Awaited<ReturnType<typeof mountPane>>) => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

test('/diary opens the pane and reads the last 30 days of transcripts with the plugin’s scanner', async ($, on) => {
  const fake = fakeSession(on)
  const answer = await openDiary($, fake)

  expect(answer.text).toContain('Diario aperto')
  expect(fake.opens).toEqual(['work-diary'])
  expect(fake.argv).toHaveLength(1)
  const [python, isolated, script, dir, since] = fake.argv[0]!
  expect([python, isolated, dir, since]).toEqual(['python3', '-I', '/Users/me/.claude/projects', '2026-09-09'])
  expect(script).toMatch(/\/hooks\/scan\.py$/)
})

/** The cell of a day in the calendar: its number's Text, as drawn. */
const cellOf = async (ui: Awaited<ReturnType<typeof mountPane>>, day: string) => {
  const button = (await ui.findAll({ type: 'Button' })).find(b => b.props.key === `cell:${day}`)
  const text = (button?.children ?? []).find(c => typeof c !== 'string') as { props?: Record<string, unknown> } | undefined
  return { text: button?.text, props: text?.props ?? {} }
}

test('the calendar is the month: each day’s time, shaded by it, today selected and its week marked', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  const ui = await mountPane($)
  const text = await paneText(ui)

  expect(text).toContain('OTTOBRE 2026')
  expect(await cellOf(ui, '2026-10-10')).toMatchObject({ text: expect.stringContaining('10 ●'), props: { inverse: true } })
  // Friday: 45 minutes, the lightest shade; Thursday, nothing.
  expect((await cellOf(ui, '2026-10-09')).props).toMatchObject({ backgroundColor: '#f6e0d4' })
  expect((await cellOf(ui, '2026-10-08')).props.backgroundColor).toBeUndefined()
  expect(text).toMatch(/ 45m/)
  expect(text).toMatch(/ 2h /)
  expect((await ui.findAll({ type: 'Text' })).filter(t => t.text.trim() === '▸')).toHaveLength(1)
})

test('the week and the day: Claude’s lines, projects by time, sessions by title', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  const ui = await mountPane($)
  const text = await paneText(ui)

  expect(text).toContain('Settimana 5 – 11 ottobre 2026')
  expect(text).toContain('2h 45m · 1 commit')
  expect(text).toContain('Settimana di diario e accessi')
  expect(text).toMatch(/mouse\s*\n█+/)
  expect(text).toContain('Sabato 10 ottobre')
  expect(text).toContain('Riassunto sab 10 ottobre')
  expect(text).toContain('● mouse')
  expect(text).toContain('Sessione oggi')
  // Today, the week, then the week's other day with work: three summaries, no more.
  expect(fake.prompts).toHaveLength(3)
  expect(fake.prompts.join('\n')).not.toContain('/Users/me')
})

test('the keys: a d by day, w s by week, p n by month, t today, r rewrite', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  const ui = await mountPane($)
  const hotkeys = (await ui.findAll({ type: 'Button' })).map(b => `${String(b.props.key)}=${String(b.props.hotkey)}`)

  expect(hotkeys).toEqual(expect.arrayContaining(['day-back=a', 'day-on=d', 'week-back=w', 'week-on=s', 'prev=p', 'next=n', 'today=t', 'rewrite=r']))
})

test('a day picked in the calendar shows its lines, its projects and commits', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  const ui = await mountPane($)

  await press($, fake, 'cell:2026-10-09')
  const text = await paneText(ui)

  expect(text).toContain('Venerdì 9 ottobre')
  expect(text).toContain('Riassunto ven 9 ottobre')
  expect(text).toContain('● shop')
  expect(text).toContain('● mouse')
  expect(text).toContain('fix: controllo accessi')
  // Each session under its own project, once.
  expect(text.split('Sessione accanto')).toHaveLength(2)
  expect(text.split('Sessione ieri')).toHaveLength(2)
  expect((await cellOf(ui, '2026-10-09')).props).toMatchObject({ inverse: true })
  // Already written while today was shown: no new question.
  expect(fake.prompts).toHaveLength(3)
})

test('summaries are kept: opening again with the same facts asks nothing; r writes the day and the week anew', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  await openDiary($, fake)
  expect(fake.argv).toHaveLength(2)
  expect(fake.prompts).toHaveLength(3)

  const ui = await mountPane($)
  await press($, fake, 'rewrite')
  await fake.clock.settle()
  expect(fake.prompts).toHaveLength(5)
  expect(fake.prompts.slice(3).map(p => p.slice(0, 9))).toEqual(['sab 10 ot', 'Settimana'])
})

test('r asked while Claude is writing, then another day picked: the day r was for is rewritten, not the new one', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  await mountPane($)
  fake.replyMs = 1_000
  // The press waits for the writing, asleep on the clock: picked meanwhile, Friday.
  const rewriting = $.ui.press({ plugin: 'work-diary', key: 'rewrite' })
  await fake.clock.settle()
  await press($, fake, 'cell:2026-10-09')
  await fake.clock.advance(10_000)
  await rewriting

  // Saturday and its week anew; Friday, already written and not stale, untouched.
  expect(fake.prompts.slice(3).map(p => p.slice(0, 9))).toEqual(['sab 10 ot', 'Settimana'])
})

test('r on a day with no work rewrites the week only, never another day', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  await mountPane($)
  await press($, fake, 'cell:2026-10-07')
  await press($, fake, 'rewrite')

  expect(fake.prompts.slice(3).map(p => p.slice(0, 9))).toEqual(['Settimana'])
})

test('summaries are kept past the session: written ones go to the store, saved ones come back and are not asked again', async ($, on) => {
  const fake = fakeSession(on)
  const friday = daysOf(SCAN).get('2026-10-09')!
  fake.store.set('summaries', { 'day:2026-10-09': { text: '• Salvato da ieri', factsKey: factsKey([friday]), at: 1 }, 'day:x': 'rotto' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  await openDiary($, fake)
  const ui = await mountPane($)
  await press($, fake, 'cell:2026-10-09')

  expect(await paneText(ui)).toContain('Salvato da ieri')
  // Today and the week asked; Friday, kept, not.
  expect(fake.prompts.map(p => p.slice(0, 9))).toEqual(['sab 10 ot', 'Settimana'])
  expect(Object.keys(fake.store.get('summaries') as object).sort()).toEqual(['day:2026-10-09', 'day:2026-10-10', 'week:2026-10-05'])
})

test('the store keeps another session’s summaries, and lets the old ones go', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  await mountPane($)
  fake.store.set('summaries', { ...(fake.store.get('summaries') as object), 'day:2026-10-08': { text: '• altra sessione', factsKey: 'k', at: 2 }, 'day:2026-08-01': { text: '• vecchio', factsKey: 'k', at: 0 } })
  await press($, fake, 'rewrite')

  const kept = Object.keys(fake.store.get('summaries') as object)
  expect(kept).toContain('day:2026-10-08')
  expect(kept).not.toContain('day:2026-08-01')
})

test('a new session makes today’s summary stale: it is written again, the others not', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  fake.scan = { ...fake.scan, stdout: JSON.stringify({ ...SCAN, sessions: [...SCAN.sessions, session('nuova', '2026-10-10', '12:00', '12:30')] }) }
  await openDiary($, fake)

  // Today anew, and the week that reads it; Friday untouched.
  expect(fake.prompts.slice(3).map(p => p.slice(0, 9))).toEqual(['sab 10 ot', 'Settimana'])
})

test('w s a d move by week and day, p n by month; t comes back; old and future days say why they are empty', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  const ui = await mountPane($)

  await press($, fake, 'week-back')
  expect(await paneText(ui)).toContain('Settimana 28 settembre – 4 ottobre 2026')
  expect(await paneText(ui)).toContain('Nessun lavoro con Claude in questa settimana.')
  expect(await paneText(ui)).toContain('Sabato 3 ottobre')

  await press($, fake, 'prev')
  expect(await paneText(ui)).toContain('SETTEMBRE 2026')
  expect(await paneText(ui)).toContain('Giovedì 3 settembre')
  expect(await paneText(ui)).toContain('Oltre i 30 giorni')

  await press($, fake, 'today')
  // Today reads the transcripts again: past a midnight, today is the new day.
  expect(fake.argv).toHaveLength(2)
  await press($, fake, 'day-on')
  expect(await paneText(ui)).toContain('Domenica 11 ottobre')
  expect(await paneText(ui)).toContain('Questo giorno deve ancora venire.')
  await press($, fake, 'week-on')
  await press($, fake, 'day-back')
  expect(await paneText(ui)).toContain('Sabato 17 ottobre')
  await press($, fake, 'next')
  expect(await paneText(ui)).toContain('NOVEMBRE 2026')
  // A month on is the same day of it, not thirty days.
  expect(await paneText(ui)).toContain('Martedì 17 novembre')
})

test('a day of another month, picked: its lines, and its week’s', async ($, on) => {
  const fake = fakeSession(on)
  await openDiary($, fake)
  const ui = await mountPane($)

  await press($, fake, 'prev')
  // Four hours: the darker shade.
  expect((await cellOf(ui, '2026-09-21')).props).toMatchObject({ backgroundColor: '#e69a74' })
  await press($, fake, 'cell:2026-09-21')

  expect(await paneText(ui)).toContain('Lunedì 21 settembre')
  expect(await paneText(ui)).toContain('Riassunto lun 21 settembre')
  expect(fake.prompts.slice(3).map(p => p.slice(0, 12))).toEqual(['lun 21 sette', 'Settimana 21'])
})

test('a scan that fails says why; a summary the model does not give is left to r', async ($, on) => {
  const fake = fakeSession(on)
  fake.scan = { stdout: '', exitCode: 1, stderr: 'Traceback\nFileNotFoundError: projects' }
  await openDiary($, fake)
  const ui = await mountPane($)
  expect(await paneText(ui)).toContain('Transcript non letti: FileNotFoundError: projects')
  expect(fake.prompts).toHaveLength(0)

  fake.scan = { stdout: JSON.stringify(SCAN), exitCode: 0, stderr: '' }
  fake.reply = () => null
  await openDiary($, fake)
  expect(await paneText(ui)).not.toContain('Transcript non letti')
  expect(await paneText(ui)).toContain('Resoconto non ancora scritto: premi r.')
})
