import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PANE_PROPS = {
  title: 'Arcade',
  isFocused: true,
  bodyColumns: 80,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 24 },
  view: {},
}

type Fake = {
  toasts: string[]
  opens: { id: string; focus?: true }[]
  isShown: boolean
  clock: ReturnType<typeof mock.clock>
  /** `$.store`: what earlier sessions kept. */
  store: Map<string, unknown>
}

/** Stands in for the session: the pane, its toasts and focus, the clock and the turns. */
const fakeSession = (on: On): Fake => {
  const fake: Fake = { toasts: [], opens: [], isShown: false, clock: mock.clock(on), store: new Map() }
  on('store.get', (_$, e) => ({ value: fake.store.get(e.key) }))
  on('store.set', (_$, e) => {
    fake.store.set(e.key, e.value)
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    fake.opens.push({ id: e.id, focus: e.focus })
    fake.isShown = true
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({
    value: [{ id: 'arcade', title: 'Arcade', isShown: fake.isShown, isFocused: false, isPlaced: true, plugin: 'arcade' }],
  }))
  on('ui.toast', (_$, e) => {
    fake.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'play' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('turn.complete', () => ({ text: '' }))
  return fake
}

const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: 'arcade', surface: 'terminal', component: 'Pane', requestId: 'arcade', props: PANE_PROPS })

const boardText = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
  (await ui.findAll({ type: 'Text', in: 'board' })).map(t => t.text).join('\n')

const startTurn = ($: Engine, turnId: string) => $.turn.start({ text: 'lavora', turnId })
const endTurn = ($: Engine, turnId: string, agentId?: string) =>
  $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId, ...(agentId === undefined ? {} : { agentId }) })

test('/play opens the pane and tries to give the board the keys', async ($, on) => {
  const fake = fakeSession(on)
  const answer = await $.command.run({
    command: 'play',
    args: '',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })

  expect(answer.text).toContain('Arcade aperto')
  expect(fake.opens).toEqual([{ id: 'arcade', focus: true }])
  // The test kit cannot move a focus: the fallback says how to give the board the keys.
  expect(fake.toasts).toEqual(['Arcade: clicca sul gioco per dargli i tasti'])
})

test('the menu lists the games; a number starts one and the clock moves it', async ($, on) => {
  fakeSession(on)
  const ui = await mountPane($)

  const menu = await boardText(ui)
  expect(menu).toContain('1. Snake')
  expect(menu).toContain('2. 2048')
  expect(menu).toContain('3. Claude runner')

  await ui.key({ key: '1', in: 'board' })
  const before = await ui.drawn({ in: 'board' })
  await ui.advance(300)

  expect(await boardText(ui)).toContain('punti 0')
  expect(await boardText(ui)).toContain('┌')
  expect(await ui.drawn({ in: 'board' })).not.toEqual(before)
})

test('a finished game keeps its record, shown in the menu', async ($, on) => {
  fakeSession(on)
  const ui = await mountPane($)

  // The dino never jumps: the first cactus ends the run.
  await ui.key({ key: '3', in: 'board' })
  await ui.advance(30_000)
  const over = await boardText(ui)
  await ui.key({ key: 'm', in: 'board' })

  expect(over).toContain('Partita finita')
  expect(over).toContain('Nuovo record!')
  expect(await boardText(ui)).toMatch(/Claude runner\s+record [1-9]\d*/)
})

test('a score is kept only when it beats the record, and odd messages are ignored', async ($, on) => {
  fakeSession(on)
  const ui = await mountPane($)

  await ui.post({ kind: 'score', game: 'snake', score: 50 }, { in: 'board' })
  await ui.post({ kind: 'score', game: 'snake', score: 20 }, { in: 'board' })
  await ui.post({ kind: 'score', game: 'pong', score: 99 }, { in: 'board' })
  await ui.post({ kind: 'score', game: '2048', score: 'tanti' }, { in: 'board' })
  const menu = await boardText(ui)

  expect(menu).toMatch(/Snake\s+record 50/)
  expect(menu).toMatch(/2048\s+record 0/)
  // What the board is handed: an unknown game never reaches the records.
  expect((await ui.find({ type: 'Client' }))?.props.props).toMatchObject({ best: { snake: 50 } })
  expect(Object.keys(((await ui.find({ type: 'Client' }))?.props.props as { best: object }).best)).toEqual(['snake'])
})

test('records outlive the session: kept in the store, the better of old and new, odd entries dropped', async ($, on) => {
  const fake = fakeSession(on)
  fake.store.set('best', { snake: 40, '2048': 300, pong: 9, tetris: 'tanti' })
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  const ui = await mountPane($)
  expect(await boardText(ui)).toMatch(/Snake\s+record 40/)

  await ui.post({ kind: 'score', game: 'snake', score: 55 }, { in: 'board' })
  await ui.post({ kind: 'score', game: '2048', score: 100 }, { in: 'board' })

  expect(fake.store.get('best')).toEqual({ snake: 55, '2048': 300 })
  expect(await boardText(ui)).toMatch(/2048\s+record 300/)

  // Another session beats it meanwhile: its record stays.
  fake.store.set('best', { snake: 70, '2048': 300 })
  await ui.post({ kind: 'score', game: 'snake', score: 60 }, { in: 'board' })
  expect(fake.store.get('best')).toEqual({ snake: 70, '2048': 300 })
})

test('after 10 s of work Claude invites to play, once in ten minutes, and not when the pane is open', async ($, on) => {
  const fake = fakeSession(on)

  await startTurn($, 't1')
  await fake.clock.advance(9_000)
  expect(fake.toasts).toEqual([])
  await fake.clock.advance(2_000)
  expect(fake.toasts).toEqual(['Claude ci mette un po’: /play per una partita (otto giochi, con i record)'])

  await endTurn($, 't1')
  await startTurn($, 't2')
  await fake.clock.advance(11_000)
  expect(fake.toasts).toHaveLength(1)

  await endTurn($, 't2')
  await fake.clock.advance(10 * 60_000)
  fake.isShown = true
  await startTurn($, 't3')
  await fake.clock.advance(11_000)
  expect(fake.toasts).toHaveLength(1)
})

test('a quick answer brings no invitation', async ($, on) => {
  const fake = fakeSession(on)

  await startTurn($, 't1')
  await fake.clock.advance(3_000)
  await endTurn($, 't1')
  await fake.clock.advance(20_000)

  expect(fake.toasts).toEqual([])
})

test('Claude finishing pauses the game in progress and says so', async ($, on) => {
  const fake = fakeSession(on)
  fake.isShown = true
  const ui = await mountPane($)
  await startTurn($, 't1')
  await ui.key({ key: '1', in: 'board' })
  expect(await boardText(ui)).toContain('Claude sta lavorando')

  await endTurn($, 't1')
  const paused = await boardText(ui)

  expect(paused).toContain('Claude ha finito: partita in pausa')
  expect(paused).toContain('✓ Claude ha finito')
  expect(fake.toasts).toContain('Claude ha finito')
})

test('a turn that is not the main conversation’s does not end Claude’s work', async ($, on) => {
  const fake = fakeSession(on)
  fake.isShown = true
  const ui = await mountPane($)
  await startTurn($, 'main')
  await startTurn($, 'fork')
  await ui.key({ key: '1', in: 'board' })

  await endTurn($, 'fork', 'agent-1')

  expect(await boardText(ui)).toContain('Claude sta lavorando')
  expect(await boardText(ui)).not.toContain('in pausa')
})

test('the names in what Claude writes reach the board, newest first; a refused edit adds none', async ($, on) => {
  fakeSession(on)
  let isRefused = false
  on('tool.call', { tool: 'Edit' }, () => (isRefused ? { deny: 'no' } : { result: { filePath: '/r/a.ts' } }))
  on('tool.call', { tool: 'Write' }, () => ({ result: { filePath: '/r/b.ts' } }))
  const ui = await mountPane($)

  await $.tool.call({ tool: 'Write', file_path: '/r/b.ts', content: 'export const formatPrice = (amount) => amount' })
  await $.tool.call({ tool: 'Edit', file_path: '/r/a.ts', old_string: 'x', new_string: 'const cartTotal = 1' })
  isRefused = true
  await $.tool.call({ tool: 'Edit', file_path: '/r/a.ts', old_string: 'x', new_string: 'const refusedName = 1' }).catch(() => undefined)
  await $.tool.call({ tool: 'Write', file_path: '/r/.env', content: 'DB_PASSWORD=hunter22' })

  const words = ((await ui.find({ type: 'Client' }))?.props.props as { words: string[] }).words
  expect(words).toEqual(['const', 'cartTotal', 'export', 'formatPrice', 'amount'])
})

for (const [n, name] of [['1', 'Snake'], ['2', '2048'], ['3', 'Claude runner'], ['4', 'Flappy Claude'], ['5', 'Acchiappa il bug'], ['6', 'Tetris'], ['7', 'Campo minato'], ['8', 'Pioggia di parole']] as const) {
  test(`${name} starts from the menu and is drawn in the pane, moving and keyed`, async ($, on) => {
    fakeSession(on)
    const ui = await mountPane($)
    await ui.key({ key: n, in: 'board' })
    await ui.advance(1_000)
    for (const key of ['up', 'left', ' ', 'right', 'down', '5', 'f', 'a']) await ui.key({ key, in: 'board' })
    await ui.advance(500)

    // drawn() rejects a tree the surface refused (an element or prop it does not know); colours and glyphs are checked in catalog.test.ts.
    expect((await ui.drawn({ in: 'board' })).type).toBe('Box')
    expect(await boardText(ui)).toContain(name)
  })
}

test('in the typing game p is a letter and Tab pauses', async ($, on) => {
  fakeSession(on)
  const ui = await mountPane($)
  await ui.key({ key: '8', in: 'board' })
  await ui.key({ key: 'p', in: 'board' })
  expect(await boardText(ui)).not.toContain('In pausa')

  await ui.key({ key: 'tab', in: 'board' })
  expect(await boardText(ui)).toContain('In pausa')
})

