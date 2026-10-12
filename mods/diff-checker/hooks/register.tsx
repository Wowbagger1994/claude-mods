import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { ChangedFile, ExplanationState } from '../types'
import { addEdit, mapEdit, toEditRecord, toFileEdit } from './diff'
import { keptExpanded, withoutGroup } from './drawings'
import { buildPrompt, parseExplanations, pendingEdits } from './explain'
import type { RepoInfo } from './diff'
import { dirOf, parseRevParse, revParseArgv } from './git'
import type { Actions } from './view'
import { emptyView, paneView } from './view'

const PLUGIN = 'diff-checker'
const PANE = 'diff-checker'
const TITLE = 'Diff checker'
/** Rounds of questions one end of turn may ask, so a reply that skips ids cannot loop. */
const MAX_ASK_ROUNDS = 2

const changes = atom({ plugin: 'diff-checker', key: 'changes' } as const, [])
const selected = atom({ plugin: 'diff-checker', key: 'selected' } as const, null)
const hasAutoOpened = atom({ plugin: 'diff-checker', key: 'hasAutoOpened' } as const, false)
const expanded = atom({ plugin: 'diff-checker', key: 'expanded' } as const, {})
const isOverviewOpen = atom({ plugin: 'diff-checker', key: 'isOverviewOpen' } as const, true)
const confirmingClear = atom({ plugin: 'diff-checker', key: 'confirmingClear' } as const, null)
/** `confirmingClear` for every file. */
const ALL = '*'

const GIT_TIMEOUT_MS = 5_000

/** One question at a time: the module's own flag, reset by a reload. */
let isAsking = false
/** Asked once per folder per load: the module's own cache, rebuilt after a reload. */
const repoCache = new Map<string, Promise<RepoInfo | null>>()

const askGit = async ($: EngineInterface, dir: string): Promise<RepoInfo | null> => {
  try {
    const { exitCode, stdout } = await $.process.run(revParseArgv(dir), { timeoutMs: GIT_TIMEOUT_MS })
    return parseRevParse(exitCode, stdout)
  } catch {
    return null
  }
}

/** The worktree and branch a file lives in, or null outside git or when git cannot answer. */
const repoOf = ($: EngineInterface, filePath: string): Promise<RepoInfo | null> => {
  const dir = dirOf(filePath)
  const known = repoCache.get(dir)
  if (known !== undefined) return known

  const asked = askGit($, dir)
  repoCache.set(dir, asked)
  return asked
}

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE })

/** Opens the pane by itself once per session, at the first change. */
const autoOpenOnce = async ($: EngineInterface) => {
  if (await read($, hasAutoOpened)) return
  await update($, hasAutoOpened, () => true)
  const opened = await openPane($)
  if (!opened.isPlaced) $.ui.toast('Diff checker: allarga il terminale (144 colonne) o usa /diff-checker')
}

const showStatus = ($: EngineInterface, files: readonly ChangedFile[]) => {
  if (files.length === 0) return $.ui.status(undefined)
  const added = files.reduce((s, f) => s + f.edits.reduce((x, e) => x + e.added, 0), 0)
  const removed = files.reduce((s, f) => s + f.edits.reduce((x, e) => x + e.removed, 0), 0)
  $.ui.status(`◆ ${files.length} file · +${added} −${removed}`)
}

type Ran = { deny?: string; isError?: true; result?: unknown }

const recordChange = async ($: EngineInterface, toolUseId: string | undefined, result: unknown) => {
  const record = toEditRecord(result)
  if (record === null) return

  const at = await $.clock.now()
  const repo = await repoOf($, record.filePath)
  const edit = toFileEdit(toolUseId ?? `${record.filePath}:${at}`, record, at)
  await update($, changes, list => addEdit(list, record, edit, repo))
  await update($, selected, () => record.filePath)
  showStatus($, await read($, changes))
  await autoOpenOnce($)
}

/** The edit has already run when the diff is read: a failure here never changes its answer. */
const recordSafely = async ($: EngineInterface, toolUseId: string | undefined, ran: Ran) => {
  if (ran.deny !== undefined || ran.isError === true) return
  try {
    await recordChange($, toolUseId, ran.result)
  } catch (error) {
    $.ui.log(`${PLUGIN}: diff non registrato: ${String(error)}`, { to: 'debug' })
  }
}

const setStates = (
  $: EngineInterface,
  ids: readonly string[],
  state: ExplanationState,
  texts: ReadonlyMap<string, string> = new Map(),
) =>
  update($, changes, files =>
    ids.reduce(
      (acc, id) => mapEdit(acc, id, e => ({ ...e, explanationState: state, explanation: texts.get(id) ?? e.explanation })),
      files,
    ),
  )

/** Asks Claude, over this session's transcript, why it made the edits still waiting for a reason. */
export const explainPending = async ($: EngineInterface) => {
  if (isAsking) return
  isAsking = true
  try {
    for (let round = 0; round < MAX_ASK_ROUNDS; round += 1) {
      const pending = pendingEdits(await read($, changes))
      if (pending.length === 0) return
      const ids = pending.map(p => p.edit.id)

      await setStates($, ids, 'loading')
      const reply = await $.model.fork({ prompt: buildPrompt(pending) })

      if (!reply.isAnswered) {
        await setStates($, ids, reply.reason === 'nothing-to-fork' ? 'pending' : 'failed')
        return
      }
      const texts = parseExplanations(reply.text, ids)
      await setStates($, ids.filter(id => texts.has(id)), 'done', texts)
      await setStates($, ids.filter(id => !texts.has(id)), 'failed')
    }
  } catch (error) {
    $.ui.log(`${PLUGIN}: spiegazioni non riuscite: ${String(error)}`, { to: 'debug' })
    const stuck = (await read($, changes)).flatMap(f => f.edits).filter(e => e.explanationState === 'loading')
    await setStates($, stuck.map(e => e.id), 'failed')
  } finally {
    isAsking = false
  }
}

const clearAll = async ($: EngineInterface) => {
  await update($, changes, () => [])
  await update($, selected, () => null)
  await update($, expanded, () => ({}))
  await update($, confirmingClear, () => null)
  showStatus($, [])
}

/** Empties one worktree's group, the files of the others kept, and what was open in them. */
const clearGroup = async ($: EngineInterface, key: string) => {
  const kept = withoutGroup(await read($, changes), key)
  await update($, changes, () => kept)
  await update($, selected, path => (kept.some(f => f.path === path) ? path : null))
  await update($, expanded, map => keptExpanded(map, kept))
  await update($, confirmingClear, () => null)
  showStatus($, kept)
}

const actionsFor = ($: EngineInterface): Actions => ({
  select: path => update($, selected, () => path),
  toggleEdit: (id, isOpen) => update($, expanded, map => ({ ...map, [id]: isOpen })),
  setAllEdits: (file, isOpen) =>
    update($, expanded, map => ({ ...map, ...Object.fromEntries(file.edits.map(e => [e.id, isOpen])) })),
  toggleOverview: () => update($, isOverviewOpen, isOpen => !isOpen),
  askClear: () => update($, confirmingClear, () => ALL),
  askClearGroup: key => update($, confirmingClear, () => key),
  cancelClear: () => update($, confirmingClear, () => null),
  confirmClear: () => clearAll($),
  confirmClearGroup: key => clearGroup($, key),
  retryExplanation: async id => {
    await setStates($, [id], 'pending')
    await explainPending($)
  },
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'diff-checker',
      description: 'Apre il pannello con i file modificati da Claude, i diff e il perché di ogni modifica',
    })

    return next(e)
  })

  on('command.run', { command: 'diff-checker' }, async $ => {
    await openPane($)
    const count = (await read($, changes)).length

    return { text: count === 0 ? 'Pannello aperto: nessuna modifica ancora.' : `Pannello aperto: ${count} file.` }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    await recordSafely($, e.tool_use_id, ran)

    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    await recordSafely($, e.tool_use_id, ran)

    return ran
  }).catch(($, e, next) => next(e))

  // The main thread's turn is over and its transcript holds the reasons: ask outside this dispatch.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined && pendingEdits(await read($, changes)).length > 0) {
      $.clock.after(0, () => void explainPending($))
    }

    return done
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    const files = await read($, changes)
    const wanted = await read($, selected)
    const current = files.find(f => f.path === wanted) ?? files[files.length - 1]
    if (current === undefined) return emptyView(el)

    return paneView(
      el,
      {
        files,
        current,
        expanded: await read($, expanded),
        isOverviewOpen: await read($, isOverviewOpen),
        confirmingClear: await read($, confirmingClear),
        isFocused: e.props.isFocused,
        columns: Math.max(40, e.props.bodyColumns),
        now: await $.clock.now(),
      },
      actionsFor($),
    )
  })
}
