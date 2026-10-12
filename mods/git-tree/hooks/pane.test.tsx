import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PANE_PROPS = { title: 'Albero di git', isFocused: true, bodyColumns: 100, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} }
const sha = (ch: string) => ch.repeat(40)
const [F2, F1, R1, C, F0, B, B2, B3, A] = ['f', 'e', 'd', 'c', '9', 'b', '8', '7', 'a'].map(sha) as [string, string, string, string, string, string, string, string, string]
const NOW_S = Date.parse('2026-10-12T12:00:00Z') / 1000

/**
 * main merged an old branch by pull request; feature/x goes on from it, GitHub
 * one commit behind; fix lives on GitHub only; main has a quiet run of three below.
 */
const LOG = [
  [F2, F1, 'Ada', NOW_S - 600, 'refs/heads/feature/x', 'Secondo passo della feature'],
  [F1, C, 'Ada', NOW_S - 3600, 'refs/remotes/origin/feature/x', 'Primo passo della feature'],
  [R1, C, 'Bea', NOW_S - 7200, 'refs/remotes/origin/fix', 'Corregge il README'],
  [C, `${B} ${F0}`, 'Ada', NOW_S - 86400 * 2, 'HEAD -> refs/heads/main, refs/remotes/origin/main, tag: refs/tags/v1', 'Merge pull request #5 from ada/vecchia'],
  [F0, A, 'Bea', NOW_S - 86400 * 3, '', 'Vecchia feature'],
  [B, B2, 'Ada', NOW_S - 86400 * 4, '', 'Sistema i test'],
  [B2, B3, 'Ada', NOW_S - 86400 * 4 - 60, '', 'Rinomina i file'],
  [B3, A, 'Ada', NOW_S - 86400 * 4 - 120, '', 'Aggiunge il README'],
  [A, '', 'Ada', NOW_S - 86400 * 5, '', 'Primo commit'],
]
  .map(fields => fields.join('\x1f'))
  .join('\n')

/** Lets the work a press or a command started finish, on the mocked clock. */
let settle: () => Promise<unknown> = async () => undefined
let advance: (ms: number) => Promise<unknown> = async () => undefined

type World = {
  calls: string[]
  prompts: string[]
  toasts: string[]
  copies: string[]
  status: string
  isRepo: boolean
  isShown: boolean
  logs: number
  /** Milliseconds a git verb takes, on the mocked clock. */
  delays: Record<string, number>
  /** What the next `git log` calls print, in turn, before the usual history. */
  nextLogs: string[]
  isShowFailing: boolean
  envs: (Record<string, string> | undefined)[]
}

const fakeRepo = (on: On): World => {
  const w: World = { calls: [], prompts: [], toasts: [], copies: [], status: '', isRepo: true, isShown: false, logs: 0, delays: {}, nextLogs: [], isShowFailing: false, envs: [] }
  const clock = mock.clock(on, { now: NOW_S * 1000 })
  settle = () => clock.settle()
  advance = ms => clock.advance(ms)
  on('process.run', async (_$, e) => {
    const [, , , ...args] = e.argv
    const cmd = args.join(' ')
    w.calls.push(cmd)
    w.envs.push(e.init?.env as Record<string, string> | undefined)
    // The answer is fixed when git is called, then takes its time.
    const answer = respond(args, cmd)
    const delay = w.delays[args[0] ?? '']
    if (delay !== undefined) await clock.sleep(delay)
    return answer
  })
  const respond = (args: string[], cmd: string) => {
    const out = (stdout: string, exitCode = 0) => ({ value: { exitCode, stdout, stderr: exitCode === 0 ? '' : 'fatal: no', isStdoutTruncated: false, isStderrTruncated: false } })
    if (cmd === 'rev-parse --show-toplevel') return w.isRepo ? out('/r/app\n') : out('', 128)
    if (args[0] === 'log') {
      w.logs++
      return out(w.nextLogs.shift() ?? LOG)
    }
    if (cmd === 'rev-parse -q --verify HEAD') return out(`${C}\n`)
    if (args[0] === 'for-each-ref') return out('main\nfeature/x\n')
    if (args[0] === 'symbolic-ref') return out('main\n')
    if (args[0] === 'rev-list') return out('0\t2\n')
    if (args[0] === 'status') return out(w.status)
    if (args[0] === 'show' && w.isShowFailing) return out('', 128)
    if (cmd.startsWith('show -s')) return out(`Titolo di ${args[3]!.slice(0, 7)}\n\nIl perché della modifica.\n`)
    if (cmd.startsWith('show --numstat')) return out('3\t1\tsrc/a.ts\n-\t-\tlogo.png\n')
    if (args[0] === 'check-ref-format') return out('', args[2]!.includes('..') ? 1 : 0)
    return out('')
  }
  on('session.root', () => ({ value: '/r/app/src' }))
  on('prompt.submit', (_$, e) => {
    w.prompts.push(e.text)
    return { text: e.text }
  })
  on('ui.open', () => {
    w.isShown = true
    return { value: { isPlaced: true as const } }
  })
  on('ui.panes', () => ({ value: [{ id: 'git-tree', title: 'Albero di git', isShown: w.isShown, isFocused: true, isPlaced: true, plugin: 'git-tree' }] }))
  on('ui.toast', (_$, e) => {
    w.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.copy', (_$, e) => {
    w.copies.push(e.text)
    return { value: { isCopied: true as const } }
  })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'git-tree' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('turn.complete', () => ({ text: '' }))
  return w
}

const open = async ($: Engine, columns = PANE_PROPS.bodyColumns) => {
  await $.session.start({ cwd: '/r/app/src', surface: 'terminal', isInteractive: true })
  await $.command.run({ command: 'git-tree', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 160 } })
  await settle()
  return $.ui.mount({ plugin: 'git-tree', surface: 'terminal', component: 'Pane', requestId: 'git-tree', props: { ...PANE_PROPS, bodyColumns: columns } })
}
const textOf = async (ui: Awaited<ReturnType<typeof open>>) => (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')
const buttons = async (ui: Awaited<ReturnType<typeof open>>) => ui.findAll({ type: 'Button' })
const press = async ($: Engine, key: string) => {
  await $.ui.press({ plugin: 'git-tree', key })
  await settle()
}
const gitCalls = (w: World, verb: string) => w.calls.filter(c => c.startsWith(verb))

test('the tree opens on the commit you are on: the branch against GitHub, every commit, the card of the selected one', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  const text = await textOf(ui)
  expect(text).toContain('◆ ALBERO DI GIT')
  // Where you are, as a label, and against GitHub.
  expect(text).toContain('SEI SU')
  expect(text).toContain(' ⎇ main ')
  expect(text).toContain('↑ 2 da mandare')
  for (const subject of ['Secondo passo della feature', 'Corregge il README', 'Primo commit']) expect(text).toContain(subject)
  // A merge says what it took; the commit you are on says so; a tag; GitHub's copy of feature/x one behind.
  expect(text).toContain('⇠ unisce vecchia (#5)')
  expect(text).toContain(' qui ')
  expect(text).toContain('◇ v1')
  expect(text).toContain('☁ GitHub è qui')
  // Days head the map; the quiet run folds.
  expect(text).toContain('── oggi ')
  expect(text).toContain('3 commit')
  expect(text).not.toContain('Rinomina i file')
  // The merge on the checked-out commit: its card says why, and what changed.
  expect(text).toContain('Il perché della modifica.')
  expect(text).toContain('2 file · ')
  expect(text).toContain('logo.png')
  expect(gitCalls(w, 'show -s')).toEqual([`show -s --format=%B ${C}`])
})

test('the panorama: one row per branch, what became of it, a digit to go there', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  const text = await textOf(ui)
  expect(text).toContain('sei qui · 5 commit')
  expect(text).toContain('aperto · 2 commit · ☁ su GitHub')
  expect(text).toContain('solo su GitHub · 1 commit')
  expect(text).toContain('unito #5 · 1 commit')
  const jumps = (await buttons(ui)).filter(b => String(b.props.key).startsWith('jump:')).map(b => `${String(b.props.key)}=${String(b.props.hotkey)}`)
  expect(jumps).toEqual(['jump:main=1', 'jump:feature/x=2', 'jump:fix=3', 'jump:vecchia=4'])
  await press($, 'jump:fix')
  expect(await textOf(ui)).toContain(`${R1} · Bea`)
  expect(gitCalls(w, 'show -s')).toContain(`show -s --format=%B ${R1}`)
})

test('o opens a folded run on its first commit, and folds it back from any of them', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  await press($, `sel:${F0}`)
  await press($, 'down')
  expect(await textOf(ui)).toContain('o per aprirli')
  await press($, 'fold')
  expect(await textOf(ui)).toContain(`${B} · Ada`)
  expect(await textOf(ui)).toContain('Rinomina i file')
  await press($, 'down')
  await press($, 'fold')
  expect(await textOf(ui)).not.toContain('Rinomina i file')
  expect(await textOf(ui)).toContain('o per aprirli')
  // Read: C on opening, F0, B on opening the run, B2; a folded run reads nothing.
  expect(gitCalls(w, 'show -s')).toEqual([C, F0, B, B2].map(x => `show -s --format=%B ${x}`))
})

test('j and k move along the commits, each opened once', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  const keys = (await buttons(ui)).map(b => `${String(b.props.key)}=${String(b.props.hotkey)}`)
  expect(keys).toEqual(expect.arrayContaining(['down=j', 'up=k', 'head=h', 'fetch=f', 'refresh=r', 'branch=b', 'copy=y', 'explain=c']))
  await press($, 'down')
  expect(await textOf(ui)).toContain(`${F0} · Bea`)
  await press($, 'up')
  await press($, 'up')
  expect(gitCalls(w, 'show -s')).toEqual([`show -s --format=%B ${C}`, `show -s --format=%B ${F0}`, `show -s --format=%B ${R1}`])
  await press($, 'head')
  expect(gitCalls(w, 'show -s')).toHaveLength(3)
})

test('going to a branch is asked first, then run, then the tree is read again', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  await press($, `sel:${F2}`)
  const go = (await buttons(ui)).find(b => b.props.label === '⇄ passa a feature/x')
  expect(go?.props.hotkey).toBe('p')
  await press($, String(go?.props.key))
  expect(await textOf(ui)).toContain('Passi al ramo feature/x.')
  expect(await textOf(ui)).toContain('$ git switch feature/x')
  expect(gitCalls(w, 'switch')).toEqual([])

  await press($, 'cancel')
  expect(await textOf(ui)).not.toContain('$ git switch feature/x')
  await press($, String(go?.props.key))
  const logsBefore = w.logs
  await press($, 'confirm')
  expect(gitCalls(w, 'switch')).toEqual(['switch feature/x'])
  expect(await textOf(ui)).toContain('✓ Fatto: git switch feature/x')
  expect(w.logs).toBe(logsBefore + 1)
})

test('a branch only on GitHub becomes a local one that follows it', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  await press($, `sel:${R1}`)
  await press($, String((await buttons(ui)).find(b => b.props.label === '⇄ passa a fix')?.props.key))
  expect(await textOf(ui)).toContain('collegato a origin/fix su GitHub')
  await press($, 'confirm')
  expect(gitCalls(w, 'switch')).toEqual(['switch --create fix --track origin/fix'])
})

test('with files not committed, no switching is offered, and why', async ($, on) => {
  const w = fakeRepo(on)
  w.status = ' M src/a.ts\n?? b.txt\n'
  const ui = await open($)
  await press($, `sel:${F2}`)
  expect((await buttons(ui)).some(b => String(b.props.label).startsWith('⇄'))).toBe(false)
  expect(await textOf(ui)).toContain('prima committa o metti da parte (git stash) i 2 file modificati')
  expect(await textOf(ui)).toContain('✎ 2 file modificati')
  w.status = ' M src/a.ts\n'
  await press($, 'refresh')
  expect(await textOf(ui)).toContain('metti da parte (git stash) il file modificato.')
})

test('a new branch: a bad name is refused before git, a good one is checked by git and made where the selection is', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  await press($, `sel:${F0}`)
  await press($, 'branch')
  expect(await ui.find({ type: 'Input', key: 'branch-name' })).toBeDefined()
  // While the name is typed, the pane's keys wait.
  await press($, 'down')
  expect(await textOf(ui)).toContain(`${F0} · Bea`)

  await $.ui.input({ plugin: 'git-tree', key: 'branch-name', text: '-D main' })
  await settle()
  expect(await textOf(ui)).toContain('«-»')
  await $.ui.input({ plugin: 'git-tree', key: 'branch-name', text: 'a..b' })
  await settle()
  expect(await textOf(ui)).toContain('git non accetta «a..b»')
  expect(gitCalls(w, 'branch')).toEqual([])

  await $.ui.input({ plugin: 'git-tree', key: 'branch-name', text: ' feature/y ' })
  await settle()
  expect(gitCalls(w, 'branch')).toEqual([`branch feature/y ${F0}`])
  expect(await textOf(ui)).toContain('✓ Fatto: git branch feature/y')
})

test('fetching from GitHub is asked first too', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  await press($, 'fetch')
  expect(await textOf(ui)).toContain('Non cambia i tuoi file né i tuoi rami locali.')
  expect(gitCalls(w, 'fetch')).toEqual([])
  await press($, 'confirm')
  expect(gitCalls(w, 'fetch')).toEqual(['fetch --all'])
})

test('the hash is copied, and Claude is asked to explain the commit without touching the repository', async ($, on) => {
  const w = fakeRepo(on)
  await open($)
  await press($, 'copy')
  expect(w.copies).toEqual([C])
  expect(w.toasts).toEqual([`Copiato ${C.slice(0, 7)}`])
  await press($, 'explain')
  expect(w.prompts).toHaveLength(1)
  expect(w.prompts[0]).toContain(`${C.slice(0, 7)} del repository /r/app`)
  expect(w.prompts[0]).toContain('Non fare commit né push')
})

test('outside a repository the pane says so', async ($, on) => {
  const w = fakeRepo(on)
  w.isRepo = false
  const ui = await open($)
  expect(await textOf(ui)).toContain('non è in un repository git')
})

test('the end of an answer reads the tree again, only while it is shown', async ($, on) => {
  const w = fakeRepo(on)
  await open($)
  const before = w.logs
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't' })
  await settle()
  expect(w.logs).toBe(before + 1)
  w.isShown = false
  await $.turn.complete({ reason: 'answer', answer: '', durationMs: 1, isAborted: false, turnId: 't2' })
  await settle()
  expect(w.logs).toBe(before + 1)
})

test('every git call runs with no optional lock and no credential prompt', async ($, on) => {
  const w = fakeRepo(on)
  await open($)
  expect(w.envs.length).toBeGreaterThan(5)
  for (const env of w.envs) expect(env).toEqual({ GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' })
})

test('a slow reading overtaken by a later one is dropped, not drawn over it', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  // The first reading is slow and finds an older history; the second is quick.
  w.delays = { log: 5_000 }
  w.nextLogs = [LOG.split('\n').slice(1).join('\n')]
  void $.ui.press({ plugin: 'git-tree', key: 'refresh' })
  await settle()
  w.delays = {}
  await press($, 'refresh')
  expect(await textOf(ui)).toContain('Secondo passo della feature')
  // The slow one ends last, and is dropped.
  await advance(6_000)
  expect(w.logs).toBe(3)
  expect(await textOf(ui)).toContain('Secondo passo della feature')
})

test('a commit git could not read says so, is not kept, and is read again on r', async ($, on) => {
  const w = fakeRepo(on)
  w.isShowFailing = true
  const ui = await open($)
  expect(await textOf(ui)).toContain('Non riesco a leggere il commit: r per riprovare.')
  w.isShowFailing = false
  await press($, 'refresh')
  expect(await textOf(ui)).toContain('Il perché della modifica.')
  expect(await textOf(ui)).not.toContain('Non riesco')
})

test('one command at a time: a switch confirmed while a fetch runs waits its turn, unrun', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  w.delays = { fetch: 5_000 }
  await press($, 'fetch')
  void $.ui.press({ plugin: 'git-tree', key: 'confirm' })
  await press($, `sel:${F2}`)
  await press($, String((await buttons(ui)).find(b => b.props.label === '⇄ passa a feature/x')?.props.key))
  await press($, 'confirm')
  expect(gitCalls(w, 'switch')).toEqual([])
  await advance(6_000)
  expect(gitCalls(w, 'fetch')).toEqual(['fetch --all'])
  expect(await textOf(ui)).toContain('✓ Fatto: git fetch --all')
  expect(gitCalls(w, 'switch')).toEqual([])
})

test('a question about one commit goes when the reading moves the selection elsewhere', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  await press($, `sel:${F2}`)
  await press($, String((await buttons(ui)).find(b => b.props.label === '⇄ passa a feature/x')?.props.key))
  // feature/x's tip is gone from the history: the selection moves, the question with it.
  w.nextLogs = [LOG.split('\n').slice(1).join('\n')]
  await press($, 'refresh')
  expect(await textOf(ui)).not.toContain('$ git switch feature/x')
})

test('a digit goes to the branch’s newest commit', async ($, on) => {
  fakeRepo(on)
  const ui = await open($)
  await press($, 'jump:feature/x')
  expect(await textOf(ui)).toContain(`${F2} · Ada`)
})

test('the selected commit stays in sight when its run grows by a commit read later', async ($, on) => {
  const w = fakeRepo(on)
  const ui = await open($)
  await press($, `sel:${F0}`)
  await press($, 'down')
  await press($, 'fold')
  await press($, 'down')
  expect(await textOf(ui)).toContain(`${B2} · Ada`)
  // A new plain commit on top of the run: a run with another first commit, never opened.
  const B0 = sha('6')
  const lines = LOG.replace(`${C}\x1f${B} ${F0}`, `${C}\x1f${B0} ${F0}`).split('\n')
  const at = lines.findIndex(l => l.startsWith(`${B}\x1f`))
  w.nextLogs = [[...lines.slice(0, at), [B0, B, 'Ada', NOW_S - 86400 * 4 + 60, '', 'Un commit in più'].join('\x1f'), ...lines.slice(at)].join('\n')]
  await press($, 'refresh')
  expect(await textOf(ui)).toContain('Un commit in più')
  expect(await textOf(ui)).toContain(`${B2} · Ada`)
})

test('in a narrow pane a branch’s status is cut to its room, never wrapped', async ($, on) => {
  fakeRepo(on)
  const ui = await open($, 70)
  const text = await textOf(ui)
  expect(text).toContain('aperto · 2 commit · ☁ su GitH…')
})
