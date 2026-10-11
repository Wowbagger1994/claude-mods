import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PANE_PROPS = {
  title: 'Diff checker',
  isFocused: true,
  bodyColumns: 120,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 80 },
  view: {},
}

/** Worktrees the fake git knows: a file under one of these roots is in it. */
const WORKTREES: Record<string, string> = { '/w/app-main': 'main', '/w/app-feature': 'feature-x' }

const patch = (minus: string, plus: string) => [
  { oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, lines: [`-${minus}`, `+${plus}`] },
]

type Session = {
  opens: string[]
  prompts: string[]
  statuses: (string | undefined)[]
  logs: string[]
  clock: ReturnType<typeof mock.clock>
}

/**
 * Stands in for the session beneath the plugin: pane opens, Edit results with
 * their diff, git, the status line, and Claude's reply to the explanation question.
 */
const fakeSession = (on: On, reply: (prompt: string) => string | null = () => null): Session => {
  const session: Session = { opens: [], prompts: [], statuses: [], logs: [], clock: mock.clock(on) }
  on('ui.log', (_$, e) => {
    session.logs.push(e.text)
    return { value: undefined }
  })
  on('turn.complete', () => ({ text: '' }))
  on('ui.open', (_$, e) => {
    session.opens.push(e.id)
    return { value: { isPlaced: true as const } }
  })
  on('ui.status', (_$, e) => {
    session.statuses.push(e.text)
    return { value: undefined }
  })
  on('tool.call', { tool: 'Edit' }, (_$, e) => ({
    result: {
      filePath: e.file_path,
      oldString: e.old_string,
      newString: e.new_string,
      originalFile: `${e.old_string}\n`,
      structuredPatch: patch(e.old_string, e.new_string),
      userModified: false,
      replaceAll: false,
    },
  }))
  on('process.run', (_$, e) => {
    const dir = e.argv[2] ?? ''
    const root = Object.keys(WORKTREES).find(r => dir === r || dir.startsWith(`${r}/`))
    const stdout = root === undefined ? '' : `${root}\n${WORKTREES[root]}\n`
    return {
      value: { exitCode: root === undefined ? 128 : 0, stdout, stderr: '', isStdoutTruncated: false, isStderrTruncated: false },
    }
  })
  on('model.fork', (_$, e) => {
    session.prompts.push(e.prompt)
    const text = reply(e.prompt)
    const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    return {
      value: text === null ? { isAnswered: false as const, reason: 'empty-reply' as const, usage } : { isAnswered: true as const, text, usage },
    }
  })
  return session
}

const edit = ($: Engine, file_path: string, old_string: string, new_string: string) =>
  $.tool.call({ tool: 'Edit', file_path, old_string, new_string })

const endTurn = ($: Engine) =>
  $.turn.complete({ reason: 'answer', answer: 'fatto', durationMs: 10, isAborted: false, turnId: 't' })

const mountPane = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'diff-checker', surface, component: 'Pane', requestId: 'diff-checker', props: PANE_PROPS })

/** The ids in the prompts: what the explanation question asked about. */
const idsIn = (prompt: string) => [...prompt.matchAll(/<edit id="([^"]+)"/g)].map(m => m[1] ?? '')

/** Explains every edit asked about with "perché <id>". */
const explainAll = (prompt: string) =>
  JSON.stringify(Object.fromEntries(idsIn(prompt).map(id => [id, `Perché **${id}**.`])))

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: an empty session says nothing has changed yet`, async $ => {
    const ui = await mountPane($, surface)

    expect((await ui.find({ type: 'Text', text: /Nessuna modifica/ }))?.text).toContain('Nessuna modifica in questa sessione')
  })

  test(`${surface}: each edited file gets a tab with its bar, the last one shows its diff`, async ($, on) => {
    fakeSession(on)
    await edit($, '/r/src/app.js', 'let a = 1', 'let a = 2')
    await edit($, '/r/src/util.js', 'x()', 'y()')

    const ui = await mountPane($, surface)
    const app = await ui.find({ key: 'tab:/r/src/app.js' })
    const util = await ui.find({ key: 'tab:/r/src/util.js' })

    expect(app?.props.label).toBe('◇ app.js ▰▰▰▰')
    expect(util?.props.label).toBe('● util.js ▰▰▰▰')
    expect((await ui.find({ type: 'Code' }))?.props.source).toBe('@@ -1,1 +1,1 @@\n-x()\n+y()')
  })

  test(`${surface}: pressing a tab shows that file's diff`, async ($, on) => {
    fakeSession(on)
    await edit($, '/r/src/app.js', 'let a = 1', 'let a = 2')
    await edit($, '/r/src/util.js', 'x()', 'y()')

    const ui = await mountPane($, surface)
    await ui.press({ key: 'tab:/r/src/app.js' })

    expect((await ui.find({ type: 'Code' }))?.props.source).toContain('+let a = 2')
  })

  test(`${surface}: Svuota asks first, Annulla keeps everything, Sì empties`, async ($, on) => {
    fakeSession(on)
    await edit($, '/r/src/app.js', 'a', 'b')
    const ui = await mountPane($, surface)

    await ui.press({ key: 'clear' })
    expect((await ui.find({ type: 'Text', text: 'Svuotare tutto?' }))?.text).toBe('Svuotare tutto?')
    await ui.press({ key: 'clear-no' })
    expect((await ui.find({ type: 'Code' }))?.type).toBe('Code')

    await ui.press({ key: 'clear' })
    await ui.press({ key: 'clear-yes' })
    expect(await ui.find({ type: 'Code' })).toBe(undefined)
    expect((await ui.find({ type: 'Text', text: /Nessuna modifica/ }))?.text).toContain('Nessuna modifica in questa sessione')
  })

  test(`${surface}: only the latest edit is open; an older one opens on press`, async ($, on) => {
    fakeSession(on)
    await edit($, '/r/src/app.js', 'a', 'b')
    await edit($, '/r/src/app.js', 'b', 'c')
    const ui = await mountPane($, surface)

    expect((await ui.findAll({ type: 'Code' })).map(c => c.props.source)).toEqual(['@@ -1,1 +1,1 @@\n-b\n+c'])
    const older = (await ui.findAll({ type: 'Button', text: '▸ apri' }))[0]
    await ui.press({ key: older?.key ?? '' })

    expect((await ui.findAll({ type: 'Code' })).length).toBe(2)
  })

  test(`${surface}: files from two worktrees are grouped under their worktree and branch`, async ($, on) => {
    fakeSession(on)
    await edit($, '/w/app-main/src/app.js', 'a', 'b')
    await edit($, '/w/app-feature/src/app.js', 'a', 'c')
    const ui = await mountPane($, surface)

    expect((await ui.find({ type: 'Text', text: 'app-main ⎇ main:' }))?.props.color).toBe('claude')
    expect((await ui.find({ type: 'Text', text: 'app-feature ⎇ feature-x:' }))?.props.color).toBe('claude')
    expect((await ui.find({ key: 'tab:/w/app-main/src/app.js' }))?.props.label).toBe('◇ app.js ▰▰▰▰')
  })

  test(`${surface}: the overview shows the file map and the timeline, and hides on press`, async ($, on) => {
    fakeSession(on)
    await edit($, '/r/src/app.js', 'a', 'b')
    await edit($, '/r/src/util.js', 'x', 'y')
    const ui = await mountPane($, surface)

    expect((await ui.find({ key: 'map-open:/r/src/app.js' }))?.props.label).toBe('app.js')
    expect((await ui.find({ key: 'time-open:/r/src/util.js' }))?.props.label).toBe('util.js')
    await ui.press({ key: 'map-open:/r/src/app.js' })
    expect((await ui.find({ type: 'Code' }))?.props.source).toContain('+b')

    await ui.press({ key: 'overview' })
    expect(await ui.find({ key: 'map-open:/r/src/app.js' })).toBe(undefined)
  })

  test(`${surface}: at the end of the turn each edit gets Claude's reason`, async ($, on) => {
    const session = fakeSession(on, explainAll)
    const { clock } = session
    await edit($, '/r/src/app.js', 'a', 'b')
    const ui = await mountPane($, surface)
    expect((await ui.find({ type: 'Text', text: 'Il perché arriva a fine turno.' }))?.type).toBe('Text')

    await endTurn($)
    await clock.settle()

    expect(session.prompts.length).toBe(1)
    const id = idsIn(session.prompts[0] ?? '')[0] ?? ''
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toBe(`Perché **${id}**.`)
  })

  test(`${surface}: a failed explanation offers Riprova, which asks again`, async ($, on) => {
    let isDown = true
    const session = fakeSession(on, prompt => (isDown ? null : explainAll(prompt)))
    const { clock } = session
    await edit($, '/r/src/app.js', 'a', 'b')
    const ui = await mountPane($, surface)

    await endTurn($)
    await clock.settle()
    expect((await ui.find({ type: 'Text', text: 'Spiegazione non disponibile.' }))?.props.color).toBe('warning')

    isDown = false
    const retry = await ui.find({ type: 'Button', text: 'Riprova' })
    await ui.press({ key: retry?.key ?? '' })

    expect(session.prompts.length).toBe(2)
    expect((await ui.find({ type: 'Markdown' }))?.props.text).toContain('Perché')
  })
}

test('the pane opens by itself once, at the first edit only', async ($, on) => {
  const session = fakeSession(on)
  await edit($, '/r/a.js', 'a', 'b')
  await edit($, '/r/b.js', 'c', 'd')

  expect(session.logs).toEqual([])
  expect(session.opens).toEqual(['diff-checker'])
})

test('the status line counts files and lines', async ($, on) => {
  const session = fakeSession(on)
  await edit($, '/r/a.js', 'a', 'b')
  await edit($, '/r/b.js', 'c', 'd')

  expect(session.statuses[session.statuses.length - 1]).toBe('◆ 2 file · +2 −2')
})

test('a subagent finishing its turn does not ask yet', async ($, on) => {
  const session = fakeSession(on, explainAll)
  const { clock } = session
  await edit($, '/r/a.js', 'a', 'b')

  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 's', agentId: 'agent-1' })
  await clock.settle()

  expect(session.prompts.length).toBe(0)
})

test('a failed edit adds no tab', async ($, on) => {
  on('tool.call', { tool: 'Edit' }, () => ({ deny: 'no' }))
  await edit($, '/r/a.js', 'a', 'b')

  const ui = await mountPane($, 'terminal')

  expect(await ui.find({ type: 'Code' })).toBe(undefined)
})
