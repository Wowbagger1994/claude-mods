import type { EngineInterface, Register } from 'claude-code'

import type { CheckCommand, CheckSource, CiCheck, CiStatus, CommandRun } from '../types'
import { news, parsePrChecks, parseRuns, runIdOf, scrub, tailOf, tally } from './ci'
import { ciCommands, defaultCommands, isCheckWorkflow, parseOverride } from './detect'
import type { RepoState } from './state'
import { isFailed, statusLine } from './state'
import type { Actions } from './view'
import { checksView } from './view'

const PLUGIN = 'checks'
const PANE = 'checks'
const TITLE = 'Verifiche'
const CHECK_TIMEOUT_MS = 5 * 60_000
const GIT_TIMEOUT_MS = 15_000
const GH_TIMEOUT_MS = 30_000
/** How often the CI is asked again while a check is running. */
const POLL_MS = 30_000
/** A push takes a moment to start its runs on GitHub. */
const AFTER_PUSH_MS = 15_000
/** A CI asked less than this ago is not asked again at the end of an answer. */
const CI_FRESH_MS = 60_000
const TAIL_LINES = 40
const LOG_LINES = 120

/** This session's repositories, by their top directory: rebuilt, never changed in place. */
let repos: ReadonlyMap<string, RepoState> = new Map()
/** Directories already resolved to their repository (null: none). */
let topOf: ReadonlyMap<string, string | null> = new Map()
/** CI failures already told, by `sha:name`. */
let told: ReadonlySet<string> = new Set()
/** Repositories with a CI question already scheduled. */
let polling: ReadonlySet<string> = new Set()
/** A run asked while one is going: done once it ends. */
let runAgain: ReadonlySet<string> = new Set()

const patch = ($: EngineInterface, repo: string, change: Partial<RepoState>) => {
  const old = repos.get(repo)
  if (old === undefined) return
  repos = new Map(repos).set(repo, { ...old, ...change })
  $.ui.invalidate('ui.render')
  $.ui.status(statusLine([...repos.values()]) ?? undefined)
}

const isPaneShown = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE && p.isShown)
const tell = async ($: EngineInterface, text: string) => {
  if (!(await isPaneShown($))) $.ui.toast(text)
}

const git = async ($: EngineInterface, cwd: string, args: string[]): Promise<string | null> => {
  const ran = await $.process.run(['git', '-C', cwd, ...args], { timeoutMs: GIT_TIMEOUT_MS }).catch(() => null)
  return ran !== null && ran.exitCode === 0 ? ran.stdout.trim() : null
}

const dirOf = (path: string) => path.slice(0, Math.max(1, path.lastIndexOf('/')))
const nameOf = (repo: string) => repo.split('/').filter(p => p !== '').pop() ?? repo

/** The repository holding a directory, its worktree's top for a worktree; null outside one. */
const repoOf = async ($: EngineInterface, dir: string): Promise<string | null> => {
  if (topOf.has(dir)) return topOf.get(dir) ?? null
  const top = await git($, dir, ['rev-parse', '--show-toplevel'])
  topOf = new Map(topOf).set(dir, top)
  return top
}

/** The repository's own list, else its CI's fast steps, else its kind's usual test. */
const checksOf = async ($: EngineInterface, repo: string): Promise<{ commands: CheckCommand[]; source: CheckSource }> => {
  const override = `${repo}/.claude/checks.json`
  if (await $.fs.exists(override)) {
    const commands = parseOverride(await $.fs.read(override))
    if (commands !== null) return { commands, source: { kind: 'override', path: '.claude/checks.json' } }
  }
  const workflows = `${repo}/.github/workflows`
  if (await $.fs.exists(workflows)) {
    const hasNodeModules = await $.fs.exists(`${repo}/node_modules`)
    for (const entry of [...(await $.fs.list(workflows))].sort((a, b) => a.name.localeCompare(b.name))) {
      const text = await $.fs.read(`${workflows}/${entry.name}`).catch(() => '')
      const commands = isCheckWorkflow(entry.name, text) ? ciCommands(text, hasNodeModules) : []
      if (commands.length > 0) return { commands, source: { kind: 'ci', path: `.github/workflows/${entry.name}` } }
    }
  }
  const files = (await $.fs.list(repo)).map(e => e.name)
  const pkg = files.includes('package.json') ? await $.fs.read(`${repo}/package.json`).catch(() => null) : null
  const found = defaultCommands(files, pkg)
  return found === null ? { commands: [], source: { kind: 'none' } } : { commands: found.commands, source: { kind: 'default', what: found.what } }
}

const ensureRepo = async ($: EngineInterface, repo: string): Promise<RepoState> => {
  const known = repos.get(repo)
  if (known !== undefined) return known
  const [{ commands, source }, branch] = await Promise.all([checksOf($, repo), git($, repo, ['branch', '--show-current'])])
  const state: RepoState = {
    repo, name: nameOf(repo), branch: branch === '' ? null : branch, commands, source,
    local: null, running: null, isDirty: false, ci: null, ciNote: null, isFetching: false,
  }
  // Two callers may have raced here: the first one in stays.
  if (!repos.has(repo)) repos = new Map(repos).set(repo, state)
  $.ui.invalidate('ui.render')
  return repos.get(repo)!
}

const runOne = async ($: EngineInterface, repo: string, c: CheckCommand): Promise<CommandRun> => {
  patch($, repo, { running: c.label })
  const start = await $.clock.now()
  const ran = await $.process
    .run(['/bin/bash', '-c', c.command], { cwd: repo, timeoutMs: CHECK_TIMEOUT_MS })
    .catch((cause: unknown) => ({ exitCode: -1, stdout: '', stderr: `non eseguito: ${String(cause)}` }))
  return { label: c.label, command: c.command, exitCode: ran.exitCode, durationMs: (await $.clock.now()) - start, tail: tailOf(`${ran.stdout}\n${ran.stderr}`, TAIL_LINES) }
}

/** Runs the repository's fast checks one after another; told when they fail, or pass again. */
const runLocal = async ($: EngineInterface, repo: string) => {
  const r = repos.get(repo)
  if (r === undefined || r.commands.length === 0) return
  if (r.running !== null) {
    runAgain = new Set(runAgain).add(repo)
    return
  }
  const wasFailing = (r.local?.runs ?? []).some(x => isFailed(x.exitCode))
  patch($, repo, { isDirty: false })
  const runs: CommandRun[] = []
  for (const c of r.commands) runs.push(await runOne($, repo, c))
  patch($, repo, { running: null, local: { at: await $.clock.now(), runs } })
  const failed = runs.filter(x => isFailed(x.exitCode))
  if (failed.length > 0) await tell($, `✗ ${r.name}: ${failed.map(x => x.label).join(', ')} — /checks`)
  else if (wasFailing) await tell($, `✓ ${r.name}: i test sono di nuovo verdi`)
  if (runAgain.has(repo)) {
    runAgain = new Set([...runAgain].filter(x => x !== repo))
    await runLocal($, repo)
  }
}

/** The PR's checks, or with no PR the runs of the last commit. */
const ciOf = async ($: EngineInterface, repo: string): Promise<CiStatus | string> => {
  const sha = await git($, repo, ['rev-parse', 'HEAD'])
  if (sha === null) return 'nessun commit'
  const gh = (args: string[]) => $.process.run(['gh', ...args], { cwd: repo, timeoutMs: GH_TIMEOUT_MS })
  const at = await $.clock.now()
  const view = await gh(['pr', 'view', '--json', 'number,url,title'])
  if (view.exitCode === 0) {
    const pr = JSON.parse(view.stdout) as { number: number; url: string; title: string }
    // gh exits 8 while checks are pending: the JSON is there all the same.
    const checks = parsePrChecks((await gh(['pr', 'checks', String(pr.number), '--json', 'name,bucket,link,workflow'])).stdout)
    return checks === null ? 'checks della PR illeggibili' : { sha, pr: { number: pr.number, url: pr.url, title: pr.title }, checks, at }
  }
  const runs = parseRuns((await gh(['run', 'list', '--commit', sha, '--json', 'name,status,conclusion,url,workflowName'])).stdout)
  if (runs === null) return 'esecuzioni della CI illeggibili'
  return runs.length === 0 ? `nessuna esecuzione della CI per ${sha.slice(0, 7)} (non ancora pushato?)` : { sha, pr: null, checks: runs, at }
}

const schedulePoll = ($: EngineInterface, repo: string, ms: number) => {
  if (polling.has(repo)) return
  polling = new Set(polling).add(repo)
  $.clock.after(ms, () => {
    polling = new Set([...polling].filter(x => x !== repo))
    void fetchCi($, repo)
  })
}

const fetchCi = async ($: EngineInterface, repo: string) => {
  const before = repos.get(repo)
  if (before === undefined || before.isFetching) return
  patch($, repo, { isFetching: true })
  try {
    const found = await ciOf($, repo)
    if (typeof found === 'string') {
      patch($, repo, { ci: null, ciNote: found })
      return
    }
    const sameCommit = before.ci?.sha === found.sha ? before.ci.checks : null
    const { failed, isDone } = news(sameCommit, found.checks, told, found.sha)
    told = new Set([...told, ...failed.map(c => `${found.sha}:${c.name}`)])
    patch($, repo, { ci: found, ciNote: null })
    if (failed.length > 0) await tell($, `✗ CI di ${before.name}: ${failed.map(c => c.name).join(', ')} — /checks, poi c per chiedere a Claude`)
    // Over with a failure already told: nothing to add; over and all passed: said once.
    else if (isDone && sameCommit !== null && tally(found.checks).failed === 0) await tell($, `✓ CI di ${before.name}: tutto verde`)
    if (found.checks.some(c => c.bucket === 'pending')) schedulePoll($, repo, POLL_MS)
  } catch (cause) {
    patch($, repo, { ciNote: `CI non letta: ${cause instanceof Error ? cause.message : String(cause)}` })
  } finally {
    patch($, repo, { isFetching: false })
  }
}

const ask = async ($: EngineInterface, text: string) => {
  await $.prompt.submit({ text: scrub(text) })
  $.ui.toast('Mandato a Claude')
}

const fence = (lines: readonly string[]) => ['```', ...lines, '```'].join('\n')
const NO_GIT = 'Guarda la causa e proponi la correzione. Non fare commit né push.'

const actionsFor = ($: EngineInterface): Actions => ({
  run: repo => runLocal($, repo),
  refreshCi: () => Promise.all([...repos.keys()].map(repo => fetchCi($, repo))),
  askLocal: (repo, run) =>
    ask($, `Nel repo ${repo} il controllo veloce «${run.label}» fallisce (uscita ${run.exitCode}).\nComando: ${run.command}\nUltime righe:\n${fence(run.tail)}\n${NO_GIT}`),
  askCi: async (repo, check) => {
    const id = runIdOf(check.link)
    const log = id === null ? null : await $.process.run(['gh', 'run', 'view', id, '--log-failed'], { cwd: repo, timeoutMs: GH_TIMEOUT_MS }).catch(() => null)
    const lines = log !== null && log.exitCode === 0 ? tailOf(log.stdout, LOG_LINES) : []
    const branch = repos.get(repo)?.branch ?? '?'
    const body = lines.length > 0 ? `Parte finale del log:\n${fence(lines)}` : `Log non disponibile: guardalo con gh run view ${id ?? ''} --log-failed.`
    await ask($, `Nella CI di ${repo} (ramo ${branch}) il controllo «${check.name}» è fallito: ${check.link}\n${body}\n${NO_GIT}`)
  },
})

/** A file Claude wrote: its repository joins the pane, to be checked at the end of the answer. */
const afterEdit = async ($: EngineInterface, path: unknown) => {
  if (typeof path !== 'string' || !path.startsWith('/')) return
  const repo = await repoOf($, dirOf(path))
  if (repo === null) return
  await ensureRepo($, repo)
  patch($, repo, { isDirty: true })
}

const fetchStale = async ($: EngineInterface) => {
  const now = await $.clock.now()
  await Promise.all([...repos.values()].filter(r => r.ci === null || now - r.ci.at > CI_FRESH_MS).map(r => fetchCi($, r.repo)))
}

const log = ($: EngineInterface, what: string) => (error: unknown) => $.ui.log(`${PLUGIN}: ${what}: ${String(error)}`, { to: 'debug' })

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'checks', description: 'Verifiche: test veloci e CI dei repo su cui lavora Claude' })
    const done = await next(e)
    $.clock.after(0, async () => {
      const repo = await repoOf($, await $.session.root())
      if (repo !== null) await ensureRepo($, repo).then(() => fetchCi($, repo))
    })
    return done
  })

  on('command.run', { command: 'checks' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true }).catch(() => $.ui.open({ id: PANE, title: TITLE }))
    $.clock.after(0, async () => {
      const root = await repoOf($, await $.session.root())
      if (root !== null) await ensureRepo($, root)
      await fetchStale($)
    })
    return { text: 'Verifiche aperte: e esegue i test veloci, g aggiorna la CI, c chiede a Claude del primo errore.' }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const done = await next(e)
    if (done.deny === undefined) await afterEdit($, e.file_path).catch(log($, 'repo non letto'))
    return done
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const done = await next(e)
    if (done.deny === undefined) await afterEdit($, e.file_path).catch(log($, 'repo non letto'))
    return done
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const done = await next(e)
    // A push starts the CI: ask again once GitHub has the runs.
    if (done.deny === undefined && /\bgit\b[^|;&]*\bpush\b/.test(e.command)) for (const repo of repos.keys()) schedulePoll($, repo, AFTER_PUSH_MS)
    return done
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.agentId === undefined) {
      // The answer ends now; the checks follow.
      $.clock.after(0, async () => {
        for (const r of [...repos.values()].filter(x => x.isDirty)) await runLocal($, r.repo).catch(log($, 'test non eseguiti'))
        await fetchStale($).catch(log($, 'CI non letta'))
      })
    }
    return done
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) =>
    checksView($.ui.resolve(e), { repos: [...repos.values()], now: await $.clock.now() }, actionsFor($)),
  )
}
