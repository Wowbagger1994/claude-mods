import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PANE_PROPS = { title: 'Verifiche', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }
const SHA = 'abc1234def5678'
const CI_YML = `name: CI
jobs:
  lint:
    steps:
      - name: Lint
        run: python3 tools/lint.py
      - name: Unit
        run: python -m unittest -v
      - name: Smoke
        run: |
          docker compose up -d
`
type Out = { exitCode: number; stdout: string; stderr: string }
const ok = (stdout = ''): Out => ({ exitCode: 0, stdout, stderr: '' })

type World = {
  root: string
  files: Record<string, string>
  dirs: Record<string, string[]>
  bash: Record<string, Out>
  /** Milliseconds a check takes, on the mocked clock. */
  bashMs: number
  pr: { number: number; url: string; title: string } | null
  prChecks: string
  runs: string
  log: string
  calls: string[]
  prompts: string[]
  toasts: string[]
  statuses: (string | undefined)[]
  isShown: boolean
  /** Edits the permissions refuse. */
  denied: string[]
  clock: ReturnType<typeof mock.clock>
}

const fakeSession = (on: On): World => {
  const w: World = {
    root: '/r',
    files: { '/r/app/.github/workflows/ci.yml': CI_YML },
    dirs: { '/r/app/.github/workflows': ['ci.yml', 'deploy.yml'], '/r/app': ['.github', 'src'] },
    bash: {},
    bashMs: 0,
    pr: null,
    prChecks: '[]',
    runs: JSON.stringify([{ name: 'CI', status: 'completed', conclusion: 'success', url: 'https://github.com/o/app/actions/runs/11', workflowName: 'CI' }]),
    log: '',
    calls: [],
    prompts: [],
    toasts: [],
    statuses: [],
    isShown: false,
    denied: [],
    clock: mock.clock(on, { now: Date.parse('2026-10-10T10:00:00Z') }),
  }
  on('process.run', async (_$, e) => {
    const argv = [...e.argv]
    w.calls.push(argv.join(' '))
    const value = (out: Out) => ({ value: { ...out, isStdoutTruncated: false, isStderrTruncated: false } })
    if (argv[0] === 'git') {
      const [dir, ...args] = argv.slice(2)
      const inApp = dir === '/r/app' || dir!.startsWith('/r/app/')
      if (args.join(' ') === 'rev-parse --show-toplevel') return value(inApp ? ok('/r/app\n') : { exitCode: 128, stdout: '', stderr: 'not a git repository' })
      if (args.join(' ') === 'branch --show-current') return value(ok('feature/x\n'))
      if (args.join(' ') === 'rev-parse HEAD') return value(ok(`${SHA}\n`))
    }
    if (argv[0] === 'gh') {
      const what = argv.slice(1, 3).join(' ')
      if (what === 'pr view') return value(w.pr === null ? { exitCode: 1, stdout: '', stderr: 'no pull requests found' } : ok(JSON.stringify(w.pr)))
      if (what === 'pr checks') return value({ exitCode: w.prChecks.includes('pending') ? 8 : 0, stdout: w.prChecks, stderr: '' })
      if (what === 'run list') return value(ok(w.runs))
      if (what === 'run view') return value(ok(w.log))
    }
    if (argv[0] === '/bin/bash') {
      if (w.bashMs > 0) await w.clock.sleep(w.bashMs)
      return value(w.bash[argv[2]!] ?? ok('OK\n'))
    }
    return value({ exitCode: 127, stdout: '', stderr: 'unknown' })
  })
  on('fs.exists', (_$, e) => ({ value: e.path in w.files || e.path in w.dirs }))
  on('fs.list', (_$, e) => ({ value: (w.dirs[e.path] ?? []).map(name => ({ name, kind: 'file' as const, size: 1, mtimeMs: 0, isLink: false })) }))
  on('fs.read', (_$, e) => {
    const text = w.files[e.path]
    if (text === undefined) throw new Error('ENOENT')
    return { value: text }
  })
  on('session.root', () => ({ value: w.root }))
  on('prompt.submit', (_$, e) => {
    w.prompts.push(e.text)
    return { text: e.text }
  })
  on('ui.open', () => {
    w.isShown = true
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({ value: [{ id: 'checks', title: 'Verifiche', isShown: w.isShown, isFocused: false, isPlaced: true, plugin: 'checks' }] }))
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.status', (_$, e) => {
    w.statuses.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'checks' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  on('tool.call', { tool: 'Edit' }, (_$, e) => (w.denied.includes(e.file_path) ? { deny: 'no' } : { result: { filePath: e.file_path } }))
  on('tool.call', { tool: 'Bash' }, () => ({ result: { stdout: '', stderr: '' } }))
  return w
}

const start = async ($: Engine, w: World) => {
  await $.session.start({ cwd: w.root, surface: 'terminal', isInteractive: true })
  await w.clock.settle()
}
const edit = ($: Engine, path: string) => $.tool.call({ tool: 'Edit', file_path: path, old_string: 'a', new_string: 'b' })
const endTurn = async ($: Engine, w: World, agentId?: string) => {
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't', ...(agentId === undefined ? {} : { agentId }) })
  await w.clock.settle()
}
const mountPane = ($: Engine) => $.ui.mount({ plugin: 'checks', surface: 'terminal', component: 'Pane', requestId: 'checks', props: PANE_PROPS })
const paneText = async (ui: Awaited<ReturnType<typeof mountPane>>) => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
const press = async ($: Engine, w: World, key: string) => {
  await $.ui.press({ plugin: 'checks', key })
  await w.clock.settle()
}
const bashCalls = (w: World) => w.calls.filter(c => c.startsWith('/bin/bash')).map(c => c.slice('/bin/bash -c '.length))

test('an edit in a repo brings it in; the end of the answer runs its CI’s fast steps, as this Mac runs them', async ($, on) => {
  const w = fakeSession(on)
  await start($, w)
  const ui = await mountPane($)
  expect(await paneText(ui)).toContain('Nessun repository ancora')

  await edit($, '/r/app/src/a.py')
  expect(bashCalls(w)).toEqual([])
  await endTurn($, w)

  expect(bashCalls(w)).toEqual(['python3 tools/lint.py', 'python3 -m unittest -v'])
  const text = await paneText(ui)
  expect(text).toContain('app')
  expect(text).toContain('feature/x')
  expect(text).toContain('i passi veloci di .github/workflows/ci.yml')
  expect(text).toContain('✓ 2/2')
  expect(text).toContain(`commit ${SHA.slice(0, 7)}`)
  expect(w.statuses.at(-1)).toBe('✓ test 2/2 · CI ✓ 1/1 · /checks')

  // An answer with no edit after: no run.
  await endTurn($, w)
  expect(bashCalls(w)).toHaveLength(2)
})

test('no edit, a refused edit, or a subagent’s answer: nothing runs', async ($, on) => {
  const w = fakeSession(on)
  w.denied = ['/r/app/denied.py']
  await start($, w)
  await endTurn($, w)
  await edit($, '/r/app/denied.py').catch(() => undefined)
  await endTurn($, w)
  await edit($, '/r/app/src/a.py')
  await endTurn($, w, 'agent-1')

  expect(bashCalls(w)).toEqual([])
  // A subagent's edit is still the repo's: the next answer of the session checks it; an edit outside any repo adds nothing.
  await edit($, '/tmp/notes.txt')
  await endTurn($, w)
  expect(bashCalls(w)).toEqual(['python3 tools/lint.py', 'python3 -m unittest -v'])
})

test('a failing check is told, shown with its last lines, and handed to Claude with its secrets masked', async ($, on) => {
  const w = fakeSession(on)
  const token = 'ghp_' + 'Zz9Yy8Xx7Ww6Vv5Uu4Tt3Ss2Rr1Qq0Pp9Oo8'
  w.bash['python3 -m unittest -v'] = { exitCode: 1, stdout: `test_a ... FAIL\nAssertionError: 2 != 3\nusing ${token}\n`, stderr: 'FAILED (failures=1)\n' }
  await start($, w)
  await edit($, '/r/app/src/a.py')
  await endTurn($, w)

  expect(w.toasts).toEqual(['✗ app: Unit — /checks'])
  expect(w.statuses.at(-1)).toContain('✗ test 1/2')
  const ui = await mountPane($)
  expect(await paneText(ui)).toContain('AssertionError: 2 != 3')
  const ask = (await ui.findAll({ type: 'Button' })).find(b => String(b.props.key).startsWith('ask-local:'))
  expect(ask?.props.hotkey).toBe('c')
  expect((await ui.findAll({ type: 'Button' })).find(b => b.props.key === 'run:/r/app')?.props.hotkey).toBe('e')

  await press($, w, String(ask?.props.key))
  expect(w.prompts).toHaveLength(1)
  expect(w.prompts[0]).toContain('«Unit» fallisce (uscita 1)')
  expect(w.prompts[0]).toContain('python3 -m unittest -v')
  expect(w.prompts[0]).toContain('FAILED (failures=1)')
  expect(w.prompts[0]).toContain('Non fare commit né push.')
  expect(w.prompts[0]).not.toContain(token)
})

test('fixed, the next run says the tests are green again', async ($, on) => {
  const w = fakeSession(on)
  w.bash['python3 tools/lint.py'] = { exitCode: 2, stdout: '', stderr: 'E1' }
  await start($, w)
  await edit($, '/r/app/src/a.py')
  await endTurn($, w)
  delete w.bash['python3 tools/lint.py']
  await edit($, '/r/app/src/a.py')
  await endTurn($, w)

  expect(w.toasts).toEqual(['✗ app: Lint — /checks', '✓ app: i test sono di nuovo verdi'])
})

test('an answer ending while the checks run brings one more run after, not a parallel one', async ($, on) => {
  const w = fakeSession(on)
  w.bashMs = 1_000
  await start($, w)
  await edit($, '/r/app/src/a.py')
  await endTurn($, w)
  await edit($, '/r/app/src/b.py')
  await endTurn($, w)
  await w.clock.advance(10_000)

  expect(bashCalls(w)).toEqual(['python3 tools/lint.py', 'python3 -m unittest -v', 'python3 tools/lint.py', 'python3 -m unittest -v'])
})

test('a PR’s checks are asked again while pending; a failure is told once, the end too; c hands the failed log to Claude', async ($, on) => {
  const w = fakeSession(on)
  w.root = '/r/app'
  w.pr = { number: 7, url: 'https://github.com/o/app/pull/7', title: 'Diario' }
  const link = 'https://github.com/o/app/actions/runs/99/job/5'
  w.prChecks = JSON.stringify([{ name: 'lint', bucket: 'pending', link, workflow: 'CI' }, { name: 'test', bucket: 'pending', link: 'l2', workflow: 'CI' }])
  await start($, w)
  const asked = () => w.calls.filter(c => c.startsWith('gh pr checks 7')).length
  expect(asked()).toBe(1)
  expect(w.statuses.at(-1)).toBe('CI ⏳ 0/2 · /checks')

  w.prChecks = JSON.stringify([{ name: 'lint', bucket: 'fail', link, workflow: 'CI' }, { name: 'test', bucket: 'pending', link: 'l2', workflow: 'CI' }])
  await w.clock.advance(30_000)
  expect(asked()).toBe(2)
  expect(w.toasts).toEqual(['✗ CI di app: lint — /checks, poi c per chiedere a Claude'])

  w.prChecks = JSON.stringify([{ name: 'lint', bucket: 'fail', link, workflow: 'CI' }, { name: 'test', bucket: 'pass', link: 'l2', workflow: 'CI' }])
  await w.clock.advance(30_000)
  await w.clock.advance(120_000)
  // Nothing pending: no more questions, the failure not told again.
  expect(asked()).toBe(3)
  expect(w.toasts).toHaveLength(1)

  const ui = await mountPane($)
  expect(await paneText(ui)).toContain('PR #7 Diario')
  w.log = 'lint\tRun\tE501 line too long\nlint\tRun\tError: Process completed with exit code 1.'
  await press($, w, 'ask-ci:/r/app:0')
  expect(w.calls).toContain('gh run view 99 --log-failed')
  expect(w.prompts[0]).toContain('«lint» è fallito')
  expect(w.prompts[0]).toContain('E501 line too long')
  expect(w.prompts[0]).toContain('ramo feature/x')
})

test('a CI all green after pending says so; a git push asks the CI again shortly after', async ($, on) => {
  const w = fakeSession(on)
  w.root = '/r/app'
  w.runs = JSON.stringify([{ name: 'CI', status: 'in_progress', conclusion: '', url: 'u', workflowName: 'CI' }])
  await start($, w)
  w.runs = JSON.stringify([{ name: 'CI', status: 'completed', conclusion: 'success', url: 'u', workflowName: 'CI' }])
  await w.clock.advance(30_000)
  expect(w.toasts).toEqual(['✓ CI di app: tutto verde'])

  const before = w.calls.filter(c => c.startsWith('gh run list')).length
  await $.tool.call({ tool: 'Bash', command: 'git push origin feature/x' })
  await w.clock.advance(14_000)
  expect(w.calls.filter(c => c.startsWith('gh run list')).length).toBe(before)
  await w.clock.advance(2_000)
  expect(w.calls.filter(c => c.startsWith('gh run list')).length).toBe(before + 1)
})

test('the pane open, nothing is toasted: the pane shows it', async ($, on) => {
  const w = fakeSession(on)
  w.bash['python3 tools/lint.py'] = { exitCode: 1, stdout: '', stderr: 'E' }
  await start($, w)
  await $.command.run({ command: 'checks', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  await edit($, '/r/app/src/a.py')
  await endTurn($, w)

  expect(w.toasts).toEqual([])
})

test('the repository’s .claude/checks.json wins', async ($, on) => {
  const w = fakeSession(on)
  w.files['/r/app/.claude/checks.json'] = '{"checks":[{"label":"tutto","command":"make check"}]}'
  await start($, w)
  await edit($, '/r/app/src/a.py')
  await endTurn($, w)
  expect(bashCalls(w)).toEqual(['make check'])
})

test('no CI and no tests found: the pane says how to add them, and no run is made', async ($, on) => {
  const w = fakeSession(on)
  w.dirs = { '/r/app': ['src'] }
  w.files = {}
  w.runs = '[]'
  await start($, w)
  await edit($, '/r/app/src/a.py')
  await endTurn($, w)
  const ui = await mountPane($)

  expect(bashCalls(w)).toEqual([])
  expect(await paneText(ui)).toContain('.claude/checks.json')
  expect(await paneText(ui)).toContain('nessuna esecuzione della CI per abc1234')
})
