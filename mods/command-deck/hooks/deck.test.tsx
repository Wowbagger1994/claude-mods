import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PANE_PROPS = {
  title: 'Comandi',
  isFocused: true,
  bodyColumns: 100,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 30 },
  view: {},
}

type Fake = {
  /** What Claude answers the to-do question; null: the question is not answered. */
  forkReply: string | null
  prompts: string[]
  statuses: (string | undefined)[]
  clock: ReturnType<typeof mock.clock>
  toasts: string[]
  opens: string[]
  copies: { text: string; surface?: string }[]
  isShown: boolean
  copyFails: boolean
}

/** The running test's clock, so an answer can let the to-do question run. */
let clockNow: ReturnType<typeof mock.clock> | null = null

/** Stands in for the session: panes, toasts, the clipboard, the clock and Bash's permissions. */
const fakeSession = (on: On): Fake => {
  const fake: Fake = {
    forkReply: '{"add":[],"done":[]}',
    prompts: [],
    statuses: [],
    clock: (clockNow = mock.clock(on)),
    toasts: [],
    opens: [],
    copies: [],
    isShown: false,
    copyFails: false,
  }
  on('model.fork', (_$, e) => {
    fake.prompts.push(e.prompt)
    const usage = { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 }
    return {
      value:
        fake.forkReply === null
          ? { isAnswered: false as const, reason: 'empty-reply' as const, usage }
          : { isAnswered: true as const, text: fake.forkReply, usage },
    }
  })
  on('ui.status', (_$, e) => {
    fake.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.open', (_$, e) => {
    fake.opens.push(e.id)
    fake.isShown = true
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({
    value: [{ id: 'command-deck', title: 'Comandi', isShown: fake.isShown, isFocused: false, isPlaced: true, plugin: 'command-deck' }],
  }))
  on('ui.toast', (_$, e) => {
    fake.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    fake.copies.push({ text: e.text, surface: e.surface })
    return { value: fake.copyFails ? { isCopied: false as const, reason: 'no-clipboard' as const } : { isCopied: true as const } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'command-deck' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'Bash' }, (_$, e) =>
    e.command.startsWith('git push')
      ? { deny: 'Permission for this action was denied by the Claude Code auto mode classifier. Reason: [Self-Modification].' }
      : e.command.startsWith('rm ')
        ? { deny: "The user doesn't want to proceed with this tool use. The tool use was rejected." }
        : { result: { stdout: '', stderr: '', interrupted: false } },
  )
  return fake
}

/** An answer of Claude's, and the to-do question that follows it, answered. */
const answer = async ($: Engine, text: string, agentId?: string) => {
  await $.turn.complete({ reason: 'answer', answer: text, durationMs: 1, isAborted: false, turnId: 't', ...(agentId === undefined ? {} : { agentId }) })
  await clockNow?.settle()
}

const mountPane = ($: Engine) =>
  $.ui.mount({ plugin: 'command-deck', surface: 'terminal', component: 'Pane', requestId: 'command-deck', props: PANE_PROPS })

const codes = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
  (await ui.findAll({ type: 'Code' })).map(c => c.props.source)

test('the commands of an answer reach the deck, newest first, with a toast when the pane is closed', async ($, on) => {
  const fake = fakeSession(on)

  await answer($, 'Fai così:\n```bash\nbrew install jq\n```\ne poi\n```\ngit status\n```')
  await answer($, 'Ancora:\n```sh\nls -la\n```')
  const ui = await mountPane($)

  expect(await codes(ui)).toEqual(['ls -la', 'brew install jq', 'git status'])
  expect(fake.toasts).toEqual(['2 comandi pronti da copiare: /command-deck', '1 comando pronto da copiare: /command-deck'])
})

test('no toast when the pane is open, nor for commands already on the deck', async ($, on) => {
  const fake = fakeSession(on)

  await answer($, '```bash\nls\n```')
  await answer($, '```bash\nls\n```')
  fake.isShown = true
  await answer($, '```bash\npwd\n```')

  expect(fake.toasts).toEqual(['1 comando pronto da copiare: /command-deck'])
})

test('a subagent’s answer adds nothing', async ($, on) => {
  const fake = fakeSession(on)

  await answer($, '```bash\nrm -rf build\n```', 'agent-1')
  const ui = await mountPane($)

  expect(await codes(ui)).toEqual([])
  expect(fake.toasts).toEqual([])
})

test('a Bash call the permissions deny lands on the deck as the person’s to run, and the pane opens', async ($, on) => {
  const fake = fakeSession(on)

  const ran = await $.tool.call({ tool: 'Bash', command: 'git push origin main' })
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  const ui = await mountPane($)

  expect(ran.deny).toContain('denied')
  expect(await codes(ui)).toEqual(['git push origin main'])
  expect((await ui.find({ type: 'Text', text: '○ Esegui tu: git push origin main' }))?.props.bold).toBe(true)
  expect(fake.opens).toEqual(['command-deck'])
  expect(fake.toasts).toEqual(['Comando negato: copialo da /command-deck ed eseguilo tu'])
})

test('a call the person refused at the permission prompt is not handed back', async ($, on) => {
  const fake = fakeSession(on)

  const ran = await $.tool.call({ tool: 'Bash', command: 'rm -rf build' })
  const ui = await mountPane($)

  expect(ran.deny).toContain("doesn't want to proceed")
  expect(await codes(ui)).toEqual([])
  expect(fake.opens).toEqual([])
})

test('Copia puts the command on the clipboard of the surface pressed, and says so', async ($, on) => {
  const fake = fakeSession(on)
  await answer($, '```bash\nbrew install jq\n```\n```bash\nls\n```')
  const ui = await mountPane($)

  const second = (await ui.findAll({ type: 'Button' })).filter(b => String(b.props.label).startsWith('Copia'))[1]
  await ui.press({ key: String(second?.key) })

  expect(second?.props.hotkey).toBe('2')
  expect(fake.copies).toEqual([{ text: 'ls', surface: 'terminal' }])
  expect(fake.toasts.at(-1)).toBe('Copiato')
})

test('a copy that fails says why', async ($, on) => {
  const fake = fakeSession(on)
  fake.copyFails = true
  await answer($, '```bash\nls\n```')
  const ui = await mountPane($)

  const button = (await ui.findAll({ type: 'Button' })).find(b => String(b.props.label).startsWith('Copia'))
  await ui.press({ key: String(button?.key) })

  expect(fake.toasts.at(-1)).toBe('Non copiato: questo terminale non dà accesso agli appunti')
})

test('the rules a command breaks are shown under it', async ($, on) => {
  fakeSession(on)
  await answer($, "```bash\nssh <utente>@host 'echo x >> /etc/a'\n```")
  const ui = await mountPane($)
  const warnings = (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.startsWith('⚠'))

  expect(warnings).toEqual([
    '⚠ Segnaposto da sostituire: <utente>',
    "⚠ ssh senza -t: con un comando remoto usa ssh -t utente@host '…'",
    '⚠ Scrive con >> sul server: prima una guardia sulla macchina e sul file atteso',
  ])
})

test('Svuota empties the deck; an empty deck explains itself', async ($, on) => {
  fakeSession(on)
  await answer($, '```bash\nls\n```')
  const ui = await mountPane($)

  await ui.press({ key: 'clear' })

  expect(await codes(ui)).toEqual([])
  expect((await ui.find({ type: 'Text', text: /Niente da fare/ }))?.type).toBe('Text')
})

test('/command-deck opens the pane', async ($, on) => {
  const fake = fakeSession(on)
  const reply = await $.command.run({ command: 'command-deck', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

  expect(reply.text).toContain('Pannello Da fare aperto')
  expect(fake.opens).toEqual(['command-deck'])
})

const titles = async (ui: Awaited<ReturnType<typeof mountPane>>) =>
  (await ui.findAll({ type: 'Text' })).map(t => t.text).filter(t => t.startsWith('○ '))

test('after an answer Claude lists what is left for the person, each with its commands to copy', async ($, on) => {
  const fake = fakeSession(on)
  fake.forkReply = JSON.stringify({ add: [{ title: 'Prova la copia', detail: 'Premi 1 e incolla.', commands: ['ls -la ~/.claude'] }], done: [] })

  await answer($, 'Ecco, prova:\n```bash\nls -la ~/.claude\n```\n```bash\npwd\n```')
  const ui = await mountPane($)

  expect(await titles(ui)).toEqual(['○ Prova la copia'])
  // The to-do's command comes first and is not repeated among the loose ones.
  expect(await codes(ui)).toEqual(['ls -la ~/.claude', 'pwd'])
  expect((await ui.findAll({ type: 'Button' })).filter(b => String(b.props.label).startsWith('Copia')).map(b => b.props.hotkey)).toEqual(['1', '2'])
  expect(fake.toasts).toEqual(['1 cosa da fare e 2 comandi: /command-deck'])
  expect(fake.statuses.at(-1)).toBe('☐ 1 da fare · /command-deck')
})

test('Claude closes what the conversation shows done, and is told what is open', async ($, on) => {
  const fake = fakeSession(on)
  fake.forkReply = JSON.stringify({ add: [{ title: 'Riavvia Claude', detail: '', commands: [] }], done: [] })
  await answer($, 'Riavvia.')
  const ui = await mountPane($)

  fake.forkReply = null
  await answer($, 'ok')
  const asked = fake.prompts.at(-1) ?? ''
  const openId = /- id=(\S+): Riavvia Claude/.exec(asked)?.[1] ?? ''
  fake.forkReply = JSON.stringify({ add: [], done: [openId] })
  await answer($, 'Bene che funziona.')

  expect(openId).not.toBe('')
  expect(await titles(ui)).toEqual([])
  await ui.press({ key: 'toggle-done' })
  expect((await ui.findAll({ type: 'Text' })).map(t => t.text)).toContain('✓ Riavvia Claude · chiuso da Claude')
  expect(fake.statuses.at(-1)).toBe(undefined)
})

test('Fatto closes it as yours; Riapri brings it back', async ($, on) => {
  const fake = fakeSession(on)
  fake.forkReply = JSON.stringify({ add: [{ title: 'Ruota la chiave del servizio push', detail: '', commands: [] }], done: [] })
  await answer($, 'Ruotala.')
  const ui = await mountPane($)

  const done = (await ui.findAll({ type: 'Button' })).find(b => b.props.label === 'Fatto')
  await ui.press({ key: String(done?.key) })
  await ui.press({ key: 'toggle-done' })
  const shown = (await ui.findAll({ type: 'Text' })).map(t => t.text)
  const reopen = (await ui.findAll({ type: 'Button' })).find(b => b.props.label === 'Riapri')
  await ui.press({ key: String(reopen?.key) })

  expect(shown).toContain('✓ Ruota la chiave del servizio push · fatto da te')
  expect(await titles(ui)).toEqual(['○ Ruota la chiave del servizio push'])
})

test('a subagent’s answer asks no question; an unanswered one changes nothing', async ($, on) => {
  const fake = fakeSession(on)

  await answer($, 'fatto', 'agent-1')
  expect(fake.prompts).toEqual([])

  fake.forkReply = null
  await answer($, 'Ecco.')
  const ui = await mountPane($)

  expect(fake.prompts).toHaveLength(1)
  expect(await titles(ui)).toEqual([])
})

