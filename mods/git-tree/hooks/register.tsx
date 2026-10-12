import type { EngineInterface, Register } from 'claude-code'

import type { Commit, CommitDetail, HeadState } from '../types'
import type { BranchInfo } from './branches'
import { branchesOf, branchInfos } from './branches'
import type { GitAction } from './commands'
import { branchAction, branchNameProblem, explainPrompt, FETCH } from './commands'
import type { Item } from './fold'
import { isSelectable, itemsOf } from './fold'
import type { GraphRow } from './graph'
import { layout } from './graph'
import { changedCount, drawable, logArgs, parseAheadBehind, parseLog, parseNumstat } from './log'
import type { Actions } from './view'
import { treeView } from './view'

const PLUGIN = 'git-tree'
const PANE = 'git-tree'
const TITLE = 'Albero di git'
const GIT_TIMEOUT_MS = 15_000
const FETCH_TIMEOUT_MS = 120_000
/** Commits read at first, and added by each «mostra altri». */
const PAGE = 200
const ERROR_LINES = 3
const MIN_COLUMNS = 40

type State = {
  root: string | null
  /** Why there is no tree to show. */
  problem: string | null
  commits: Commit[]
  rows: GraphRow[]
  /** Each commit's branch, and the branches' stories. */
  owner: ReadonlyMap<string, string>
  infos: BranchInfo[]
  /** Folded runs the person opened, by their key: the commits they hold. */
  opened: ReadonlyMap<string, readonly string[]>
  headSha: string | null
  head: HeadState
  localNames: ReadonlySet<string>
  limit: number
  selected: string | null
  details: ReadonlyMap<string, CommitDetail>
  pending: GitAction | null
  isNaming: boolean
  nameProblem: string | null
  busy: string | null
  message: { text: string; isError: boolean } | null
  /** A commit whose detail git could not give: asked again on the next reading. */
  failedDetail: string | null
}

const INITIAL: State = {
  root: null,
  problem: null,
  commits: [],
  rows: [],
  owner: new Map(),
  infos: [],
  opened: new Map(),
  headSha: null,
  head: { branch: null, ahead: null, behind: null, changed: 0 },
  localNames: new Set(),
  limit: PAGE,
  selected: null,
  details: new Map(),
  pending: null,
  isNaming: false,
  nameProblem: null,
  busy: null,
  message: null,
  failedDetail: null,
}

/** The pane's state: replaced whole on each change, never changed in place. */
let state: State = INITIAL

/** Each reading of the tree takes a number: one overtaken by a later one is dropped. */
let loadSeq = 0

/**
 * No optional lock on the index while Claude may be committing; no
 * credential prompt that would hang a fetch with nobody to answer it.
 */
const GIT_ENV = { GIT_OPTIONAL_LOCKS: '0', GIT_TERMINAL_PROMPT: '0' }

/** The map's lines as the state draws them; the selected commit and where you are never fold. */
const itemsNow = (): Item[] =>
  itemsOf(state.commits, state.rows, state.owner, new Set(state.opened.keys()), new Set([state.selected, state.headSha].filter((x): x is string => x !== null)))

const isFold = (key: string) => key.startsWith('fold:')

const set = ($: EngineInterface, patch: Partial<State>) => {
  state = { ...state, ...patch }
  $.ui.invalidate('ui.render')
}

const log = ($: EngineInterface, what: string) => (error: unknown) => $.ui.log(`${PLUGIN}: ${what}: ${String(error)}`, { to: 'debug' })

type Ran = { exitCode: number; stdout: string; stderr: string }

const git = ($: EngineInterface, root: string, args: readonly string[], timeoutMs = GIT_TIMEOUT_MS): Promise<Ran> =>
  $.process.run(['git', '-C', root, ...args], { cwd: root, timeoutMs, env: GIT_ENV }).catch((cause: unknown): Ran => ({ exitCode: -1, stdout: '', stderr: String(cause) }))

const isPaneShown = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE && p.isShown)

/** The repository of the session's folder; null outside one. */
const rootOf = async ($: EngineInterface): Promise<string | null> => {
  const dir = await $.session.root()
  const top = await $.process.run(['git', '-C', dir, 'rev-parse', '--show-toplevel'], { cwd: dir, timeoutMs: GIT_TIMEOUT_MS, env: GIT_ENV }).catch(() => null)
  return top === null || top.exitCode !== 0 ? null : top.stdout.trim()
}

/** Reads a commit's message and files once; kept while the pane lives. */
const loadDetail = async ($: EngineInterface, sha: string) => {
  const root = state.root
  if (root === null || state.details.has(sha)) return
  const [message, numstat] = await Promise.all([
    git($, root, ['show', '-s', '--format=%B', sha]),
    git($, root, ['show', '--numstat', '--format=', '--diff-merges=first-parent', '-M', sha]),
  ])
  // A failed reading is not kept: the next one asks git again.
  if (message.exitCode !== 0 || numstat.exitCode !== 0) {
    set($, { failedDetail: sha })
    return
  }
  const detail: CommitDetail = { sha, body: drawable(message.stdout), files: parseNumstat(numstat.stdout) }
  set($, { details: new Map(state.details).set(sha, detail), failedDetail: state.failedDetail === sha ? null : state.failedDetail })
}

const headOf = async ($: EngineInterface, root: string): Promise<HeadState> => {
  const [branch, counts, status] = await Promise.all([
    git($, root, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git($, root, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']),
    git($, root, ['status', '--porcelain']),
  ])
  return {
    branch: branch.exitCode === 0 ? branch.stdout.trim() : null,
    ...(counts.exitCode === 0 ? parseAheadBehind(counts.stdout) : { ahead: null, behind: null }),
    changed: changedCount(status.stdout),
  }
}

/** Reads the whole tree again: commits, where HEAD is, the local branches. */
const load = async ($: EngineInterface) => {
  const seq = ++loadSeq
  const root = await rootOf($)
  if (seq !== loadSeq) return
  if (root === null) {
    set($, { root: null, problem: 'La cartella di questa sessione non è in un repository git.' })
    return
  }
  // Another repository: nothing of the last one holds.
  if (root !== state.root) state = { ...INITIAL, root }
  const [logged, headSha, locals, head] = await Promise.all([
    git($, root, logArgs(state.limit)),
    git($, root, ['rev-parse', '-q', '--verify', 'HEAD']),
    git($, root, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']),
    headOf($, root),
  ])
  if (seq !== loadSeq) return
  if (logged.exitCode !== 0 && !/does not have any commits|bad default revision/.test(logged.stderr)) {
    set($, { root, problem: `git log non riesce: ${logged.stderr.trim().split('\n')[0] ?? ''}` })
    return
  }
  const commits = parseLog(logged.stdout)
  const sha = headSha.exitCode === 0 ? headSha.stdout.trim() : null
  const owner = branchesOf(commits)
  const infos = branchInfos(commits, owner, head.branch ?? 'HEAD staccata')
  const colors = new Map(infos.map(b => [b.name, b.color]))
  const colorOf = (c: string) => colors.get(owner.get(c) ?? '') ?? -1
  const kept = state.selected
  const isKept = kept !== null && commits.some(c => c.sha === (isFold(kept) ? kept.slice('fold:'.length) : kept))
  const selected = isKept ? kept : ((commits.find(c => c.sha === sha) ?? commits[0])?.sha ?? null)
  set($, {
    root,
    problem: null,
    commits,
    rows: layout(commits, sha, colorOf),
    owner,
    infos,
    headSha: sha,
    head,
    localNames: new Set(locals.stdout.split('\n').map(l => l.trim()).filter(l => l !== '')),
    selected,
    // A question about another commit no longer holds.
    ...(selected === state.selected ? {} : { pending: null, isNaming: false, nameProblem: null }),
    failedDetail: null,
  })
  // A fold the new history no longer makes: its first commit stands in for it.
  if (selected !== null && isFold(selected) && !itemsNow().some(i => i.key === selected)) state = { ...state, selected: selected.slice('fold:'.length) }
  if (state.selected !== null && !isFold(state.selected)) await loadDetail($, state.selected)
}

/** Brings the opened card, then its row, into the pane's window. */
const reveal = async ($: EngineInterface, sha: string) => {
  await $.ui.scroll({ to: { key: 'card' }, in: PANE }).catch(log($, 'scheda non mostrata'))
  await $.ui.scroll({ to: { key: `row:${sha}` }, in: PANE }).catch(log($, 'riga non mostrata'))
}

/** Selects a line: a commit, whose detail is read, or a folded run. */
const select = async ($: EngineInterface, key: string) => {
  set($, { selected: key, pending: null, isNaming: false, nameProblem: null })
  if (!isFold(key)) await loadDetail($, key)
  await reveal($, key)
}

/** Opens the selected run on its first commit; on a commit of an opened run, folds it back. */
const toggleFold = async ($: EngineInterface) => {
  const key = state.selected
  if (key === null) return
  if (isFold(key)) {
    const run = itemsNow().find((i): i is Extract<Item, { kind: 'fold' }> => i.kind === 'fold' && i.key === key)
    if (run === undefined) return
    const shas = state.commits.slice(run.from, run.to + 1).map(c => c.sha)
    set($, { opened: new Map(state.opened).set(key, shas) })
    await select($, shas[0]!)
    return
  }
  const owning = [...state.opened].find(([, shas]) => shas.includes(key))
  if (owning === undefined) return
  const opened = new Map(state.opened)
  opened.delete(owning[0])
  set($, { opened })
  await select($, owning[0])
}

/** Runs a confirmed command, says how it went, reads the tree again. */
const runAction = async ($: EngineInterface, action: GitAction) => {
  const root = state.root
  if (root === null) return
  const command = `git ${action.args.join(' ')}`
  set($, { pending: null, isNaming: false, nameProblem: null, busy: `eseguo ${command}…`, message: null })
  const ran = await git($, root, action.args, action.args[0] === 'fetch' ? FETCH_TIMEOUT_MS : GIT_TIMEOUT_MS)
  const why = `${ran.stderr}\n${ran.stdout}`.trim().split('\n').filter(l => l.trim() !== '').slice(0, ERROR_LINES).join(' · ')
  set($, {
    busy: null,
    message: ran.exitCode === 0 ? { text: `✓ Fatto: ${command}`, isError: false } : { text: `✗ ${command} non è riuscito: ${why}`, isError: true },
  })
  await load($)
}

const submitBranch = async ($: EngineInterface, name: string) => {
  const root = state.root
  const commit = state.commits.find(c => c.sha === state.selected)
  if (root === null || commit === undefined) return
  const problem = branchNameProblem(name, state.localNames)
  if (problem !== null) {
    set($, { nameProblem: problem })
    return
  }
  const checked = await git($, root, ['check-ref-format', '--branch', name])
  if (checked.exitCode !== 0) {
    set($, { nameProblem: `git non accetta «${name}» come nome di ramo.` })
    return
  }
  // The name typed and sent is the person's yes.
  await runAction($, branchAction(name, commit))
}

/** While a branch name is typed, the pane's other keys wait. */
const unlessNaming =
  <A extends unknown[]>(fn: (...args: A) => unknown) =>
  (...args: A) =>
    state.isNaming ? undefined : fn(...args)

const actionsFor = ($: EngineInterface): Actions => ({
  select: unlessNaming((key: string) => select($, key).catch(log($, 'commit non aperto'))),
  move: unlessNaming((delta: number) => {
    const lines = itemsNow().filter(isSelectable)
    const at = lines.findIndex(i => i.key === state.selected)
    const next = lines[Math.min(lines.length - 1, Math.max(0, at + delta))]
    return next === undefined ? undefined : select($, next.key).catch(log($, 'commit non aperto'))
  }),
  jump: unlessNaming((branch: string) => {
    const tip = state.infos.find(b => b.name === branch)?.shas[0]
    return tip === undefined ? undefined : select($, tip).catch(log($, 'ramo non aperto'))
  }),
  toggleFold: unlessNaming(() => toggleFold($).catch(log($, 'gruppo non aperto'))),
  toHead: unlessNaming(() => (state.headSha === null ? undefined : select($, state.headSha).catch(log($, 'commit non aperto')))),
  refresh: unlessNaming(() => load($).catch(log($, 'albero non letto'))),
  more: unlessNaming(() => {
    state = { ...state, limit: state.limit + PAGE }
    return load($).catch(log($, 'albero non letto'))
  }),
  ask: unlessNaming((action: GitAction) => set($, { pending: action, message: null })),
  askFetch: unlessNaming(() => set($, { pending: FETCH, message: null })),
  startBranch: unlessNaming(() => set($, { isNaming: true, nameProblem: null, pending: null, message: null })),
  submitBranch: name => submitBranch($, name).catch(log($, 'ramo non creato')),
  // One command at a time.
  confirm: () => (state.pending === null || state.busy !== null ? undefined : runAction($, state.pending).catch(log($, 'comando non eseguito'))),
  cancel: () => set($, { pending: null, isNaming: false, nameProblem: null }),
  copy: async (text, surface) => {
    const copied = await $.ui.copy({ text, surface })
    $.ui.toast(copied.isCopied ? `Copiato ${text.slice(0, 7)}` : 'Hash non copiato: questo terminale non dà accesso agli appunti')
  },
  explain: unlessNaming((commit: Commit) => (state.root === null ? undefined : $.prompt.submit({ text: explainPrompt(commit, state.root) }))),
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'git-tree', description: 'L’albero di git del repository: rami, merge, commit e comandi con conferma' })
    state = INITIAL
    return next(e)
  })

  on('command.run', { command: 'git-tree' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true }).catch(() => $.ui.open({ id: PANE, title: TITLE }))
    $.clock.after(0, async () => {
      await load($).catch(log($, 'albero non letto'))
      if (state.selected !== null) await reveal($, state.selected)
    })
    return { text: 'Albero di git aperto: j e k scorrono i commit, p passa al ramo, b crea un ramo, f scarica da GitHub.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // Claude may have committed or changed branch: an open tree follows.
    if (e.agentId === undefined && (await isPaneShown($))) $.clock.after(0, () => load($).catch(log($, 'albero non letto')))
    return done
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    if (state.problem !== null) return <el.Text dimColor wrap="wrap">{state.problem}</el.Text>
    if (state.root === null) return <el.Text dimColor>Leggo il repository…</el.Text>
    const selected = state.selected
    return treeView(
      el,
      {
        name: state.root.split('/').pop() ?? state.root,
        commits: state.commits,
        rows: state.rows,
        owner: state.owner,
        infos: state.infos,
        items: itemsNow(),
        headSha: state.headSha,
        head: state.head,
        selected,
        detail: selected === null ? null : (state.details.get(selected) ?? null),
        localNames: state.localNames,
        pending: state.pending,
        isNaming: state.isNaming,
        nameProblem: state.nameProblem,
        isDetailFailed: selected !== null && state.failedDetail === selected,
        busy: state.busy,
        message: state.message,
        hasMore: state.commits.length >= state.limit,
        now: await $.clock.now(),
        columns: Math.max(MIN_COLUMNS, e.props.bodyColumns),
      },
      actionsFor($),
    )
  })
}
