import type { ElementTable } from 'claude-code'

import type { CiCheck, CommandRun } from '../types'
import { tally } from './ci'
import { sourceLabel } from './detect'
import type { RepoState } from './state'
import { isFailed } from './state'

const TAIL_SHOWN = 8
const SECOND_MS = 1000
const MINUTE_MS = 60_000

export type Actions = {
  run: (repo: string) => unknown
  refreshCi: () => unknown
  askLocal: (repo: string, run: CommandRun) => unknown
  askCi: (repo: string, check: CiCheck) => unknown
}

export type ChecksState = { repos: readonly RepoState[]; now: number }

const MARK = { pass: '✓', fail: '✗', cancel: '✗', pending: '◌', skipping: '–' } as const
const COLOR = { pass: 'success', fail: 'error', cancel: 'error', pending: 'warning', skipping: 'inactive' } as const

export const ago = (at: number, now: number): string => {
  const ms = Math.max(0, now - at)
  if (ms < MINUTE_MS) return 'adesso'
  const minutes = Math.round(ms / MINUTE_MS)
  return minutes < 60 ? `${minutes} min fa` : `${Math.round(minutes / 60)} h fa`
}

const seconds = (ms: number) => `${(ms / SECOND_MS).toFixed(ms < 10 * SECOND_MS ? 1 : 0)} s`

const localSection = (el: ElementTable, r: RepoState, now: number, act: Actions, firstFailure: string | null, isFirstRepo: boolean) => {
  const runs = r.local?.runs ?? []
  const passed = runs.filter(x => !isFailed(x.exitCode)).length
  const summary =
    r.running !== null
      ? `in corso: ${r.running}`
      : r.local === null
        ? r.commands.length === 0
          ? ''
          : 'non ancora eseguiti'
        : `${passed === runs.length ? '✓' : '✗'} ${passed}/${runs.length} · ${ago(r.local.at, now)}${r.isDirty ? ' · modifiche dopo' : ''}`
  return (
    <el.Box key={`local:${r.repo}`} flexDirection="column">
      <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <el.Text>
          <el.Text bold>Test locali</el.Text>
          <el.Text dimColor>{`  ${sourceLabel(r.source)}`}</el.Text>
        </el.Text>
        <el.Box flexDirection="row" columnGap={2}>
          <el.Text color={r.running !== null ? 'warning' : passed === runs.length ? 'success' : 'error'}>{summary}</el.Text>
          {r.commands.length > 0 && r.running === null && (
            <el.Button key={`run:${r.repo}`} label="Esegui" hotkey={isFirstRepo ? 'e' : undefined} plain dimColor onPress={() => act.run(r.repo)} />
          )}
        </el.Box>
      </el.Box>
      {r.commands.length === 0 && r.local === null && (
        <el.Text dimColor wrap="wrap">
          Nessun test veloce trovato. Scrivi i comandi in .claude/checks.json del repo: {'{"checks": [{"label": "unit", "command": "…"}]}'}
        </el.Text>
      )}
      {runs.map(x => {
        const isFirst = firstFailure === `local:${r.repo}:${x.label}`
        return (
          <el.Box key={`cmd:${r.repo}:${x.label}`} flexDirection="column">
            <el.Box flexDirection="row" columnGap={1}>
              <el.Text color={isFailed(x.exitCode) ? 'error' : 'success'}>{isFailed(x.exitCode) ? '✗' : '✓'}</el.Text>
              <el.Text wrap="truncate-end">{x.label}</el.Text>
              <el.Text dimColor>{seconds(x.durationMs)}</el.Text>
              {isFailed(x.exitCode) && (
                <el.Button key={`ask-local:${r.repo}:${x.label}`} label="Chiedi a Claude" hotkey={isFirst ? 'c' : undefined} plain onPress={() => act.askLocal(r.repo, x)} />
              )}
            </el.Box>
            {isFailed(x.exitCode) &&
              x.tail.slice(-TAIL_SHOWN).map((line, i) => (
                <el.Text key={`tail:${r.repo}:${x.label}:${i}`} dimColor wrap="truncate-end">{`    ${line}`}</el.Text>
              ))}
          </el.Box>
        )
      })}
    </el.Box>
  )
}

const ciSection = (el: ElementTable, r: RepoState, act: Actions, firstFailure: string | null) => {
  const ci = r.ci
  const t = ci === null ? null : tally(ci.checks)
  const where = ci === null ? '' : ci.pr !== null ? `PR #${ci.pr.number} ${ci.pr.title}` : `commit ${ci.sha.slice(0, 7)}`
  const summary =
    t === null ? '' : t.failed > 0 ? `✗ ${t.passed}/${t.total}` : t.pending > 0 ? `◌ ${t.passed}/${t.total} in corso` : `✓ ${t.passed}/${t.total}`
  return (
    <el.Box key={`ci:${r.repo}`} flexDirection="column">
      <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <el.Text wrap="truncate-end">
          <el.Text bold>CI</el.Text>
          <el.Text dimColor>{`  ${where}`}</el.Text>
        </el.Text>
        <el.Text color={t === null ? undefined : t.failed > 0 ? 'error' : t.pending > 0 ? 'warning' : 'success'}>{r.isFetching ? 'aggiorno…' : summary}</el.Text>
      </el.Box>
      {r.ciNote !== null && <el.Text dimColor>{r.ciNote}</el.Text>}
      {(ci?.checks ?? []).map((c, i) => {
        const isFail = isCheckFailed(c)
        const isFirst = firstFailure === `ci:${r.repo}:${i}`
        return (
          <el.Box key={`check:${r.repo}:${i}`} flexDirection="row" columnGap={1}>
            <el.Text color={COLOR[c.bucket]}>{MARK[c.bucket]}</el.Text>
            <el.Text wrap="truncate-end">{c.workflow !== '' && c.workflow !== c.name ? `${c.workflow} · ${c.name}` : c.name}</el.Text>
            {c.link !== '' && <el.Link href={c.link} label="apri" />}
            {isFail && <el.Button key={`ask-ci:${r.repo}:${i}`} label="Chiedi a Claude" hotkey={isFirst ? 'c' : undefined} plain onPress={() => act.askCi(r.repo, c)} />}
          </el.Box>
        )
      })}
    </el.Box>
  )
}

const isCheckFailed = (c: CiCheck) => c.bucket === 'fail' || c.bucket === 'cancel'

/** The failure `c` asks Claude about: the first shown, a repository's local ones before its CI's. */
export const firstFailureOf = (repos: readonly RepoState[]): string | null => {
  for (const r of repos) {
    const local = (r.local?.runs ?? []).find(x => isFailed(x.exitCode))
    if (local !== undefined) return `local:${r.repo}:${local.label}`
    const ci = (r.ci?.checks ?? []).findIndex(isCheckFailed)
    if (ci >= 0) return `ci:${r.repo}:${ci}`
  }
  return null
}

/** Each repository the session touched: its fast tests here, its CI on GitHub. */
export const checksView = (el: ElementTable, s: ChecksState, act: Actions) => {
  const firstFailure = firstFailureOf(s.repos)
  return (
    <el.Box flexDirection="column" gap={1}>
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Text bold color="claude">◆ Verifiche</el.Text>
        <el.Button key="refresh-ci" label="aggiorna la CI" hotkey="g" plain dimColor onPress={() => act.refreshCi()} />
      </el.Box>
      {s.repos.length === 0 && (
        <el.Text dimColor wrap="wrap">
          Nessun repository ancora: appena Claude modifica un file in un repo git, qui compaiono i suoi test veloci e la sua CI.
        </el.Text>
      )}
      {s.repos.map(r => (
        <el.Box key={`repo:${r.repo}`} flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap={1}>
          <el.Text>
            <el.Text bold>{r.name}</el.Text>
            <el.Text dimColor>{r.branch === null ? '' : `  ${r.branch}`}</el.Text>
          </el.Text>
          {localSection(el, r, s.now, act, firstFailure, r.repo === s.repos[0]?.repo)}
          {ciSection(el, r, act, firstFailure)}
        </el.Box>
      ))}
    </el.Box>
  )
}
