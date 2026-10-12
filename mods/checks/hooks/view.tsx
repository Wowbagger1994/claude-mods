import type { Color, ElementTable, RenderChildren } from 'claude-code'

import type { CiCheck, CommandRun } from '../types'
import type { Tally } from './ci'
import { tally } from './ci'
import { sourceLabel } from './detect'
import type { RepoState } from './state'
import { isFailed } from './state'
import type { Verdict } from './verdict'
import { failuresOf, isCheckFailed, meterCells, overallOf, verdictOf } from './verdict'

const TAIL_SHOWN = 8
const SECOND_MS = 1000
const MINUTE_MS = 60_000
const METER_WIDTH = 12
const HALF = 0.5

export type Actions = {
  run: (repo: string) => unknown
  refreshCi: () => unknown
  askLocal: (repo: string, run: CommandRun) => unknown
  askCi: (repo: string, check: CiCheck) => unknown
}

export type ChecksState = { repos: readonly RepoState[]; now: number }

type Remark = { text: string; color?: Color }

const MARK = { pass: '✓', fail: '✗', cancel: '✗', pending: '◌', skipping: '–' } as const
const COLOR = { pass: 'success', fail: 'error', cancel: 'error', pending: 'warning', skipping: 'inactive' } as const
const VERDICT_COLOR: Record<Verdict, Color | undefined> = { fail: 'error', running: 'warning', pass: 'success', idle: undefined }

export const ago = (at: number, now: number): string => {
  const ms = Math.max(0, now - at)
  if (ms < MINUTE_MS) return 'adesso'
  const minutes = Math.round(ms / MINUTE_MS)
  return minutes < 60 ? `${minutes} min fa` : `${Math.round(minutes / 60)} h fa`
}

const seconds = (ms: number) => `${(ms / SECOND_MS).toFixed(ms < 10 * SECOND_MS ? 1 : 0)} s`

/** The words on a verdict's badge; null when there is nothing to say. */
export const badgeText = (verdict: Verdict, failures: number): string | null => {
  if (verdict === 'fail') return `✗ ${failures} da sistemare`
  if (verdict === 'running') return '◌ in corso'
  if (verdict === 'pass') return '✓ tutto verde'
  return null
}

/** The verdict as a label: dark text on its colour. */
const badge = (el: ElementTable, verdict: Verdict, failures: number) => {
  const text = badgeText(verdict, failures)
  const color = VERDICT_COLOR[verdict]
  if (text === null || color === undefined) return null
  return (
    <el.Text bold color="inverseText" backgroundColor={color}>
      {` ${text} `}
    </el.Text>
  )
}

/** `████████░░░░`: green passed, red failed, yellow pending, the rest dim. */
const meter = (el: ElementTable, t: Tally) => {
  const c = meterCells(t, METER_WIDTH)
  return (
    <el.Text>
      <el.Text color="success">{'█'.repeat(c.pass)}</el.Text>
      <el.Text color="error">{'█'.repeat(c.fail)}</el.Text>
      <el.Text color="warning">{'█'.repeat(c.pending)}</el.Text>
      <el.Text dimColor>{'░'.repeat(c.empty)}</el.Text>
    </el.Text>
  )
}

/** A section's title on the left, what it offers on the right. */
const sectionTitle = (el: ElementTable, title: string, detail: string, right: RenderChildren) => (
  <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
    <el.Text wrap="truncate-end">
      <el.Text bold color="claude">{`▍${title}`}</el.Text>
      <el.Text dimColor>{detail === '' ? '' : `  ${detail}`}</el.Text>
    </el.Text>
    {right}
  </el.Box>
)

/** The meter, the count in its colour, then the remarks. */
const summaryRow = (el: ElementTable, t: Tally, count: { text: string; color: Color } | null, remarks: readonly Remark[]) => (
  <el.Box flexDirection="row" columnGap={1} paddingLeft={1}>
    {meter(el, t)}
    {count !== null && <el.Text bold color={count.color}>{count.text}</el.Text>}
    {remarks.map((r, i) => (
      <el.Text key={r.text} color={r.color} dimColor={r.color === undefined}>{`${count === null && i === 0 ? '' : '· '}${r.text}`}</el.Text>
    ))}
  </el.Box>
)

/** A failure's last lines, behind a red bar. */
const tail = (el: ElementTable, key: string, lines: readonly string[]) => (
  <el.Box flexDirection="column" paddingLeft={3}>
    {lines.slice(-TAIL_SHOWN).map((line, i) => (
      <el.Box key={`${key}:${i}`} flexDirection="row" columnGap={1}>
        <el.Text color="error">│</el.Text>
        <el.Text dimColor wrap="truncate-end">{line}</el.Text>
      </el.Box>
    ))}
  </el.Box>
)

/** The first failure's button stands out: it is the one `c` presses. */
const askButton = (el: ElementTable, key: string, isFirst: boolean, onPress: () => unknown) =>
  isFirst ? (
    <el.Button key={key} label="Chiedi a Claude" hotkey="c" variant="primary" onPress={onPress} />
  ) : (
    <el.Button key={key} label="Chiedi a Claude" plain onPress={onPress} />
  )

/** One local check; dim while a new run replaces it. */
const localRow = (el: ElementTable, r: RepoState, x: CommandRun, isStale: boolean, isFirst: boolean, act: Actions) => {
  const isFail = isFailed(x.exitCode)
  return (
    <el.Box key={`cmd:${r.repo}:${x.label}`} flexDirection="column">
      <el.Box flexDirection="row" justifyContent="space-between" columnGap={2} paddingLeft={1}>
        <el.Box flexDirection="row" columnGap={1} flexShrink={1}>
          <el.Text color={isFail ? 'error' : 'success'} dimColor={isStale}>{isFail ? '✗' : '✓'}</el.Text>
          <el.Text bold={isFail} dimColor={isStale} wrap="truncate-end">{x.label}</el.Text>
          <el.Text dimColor>{seconds(x.durationMs)}</el.Text>
        </el.Box>
        {isFail && askButton(el, `ask-local:${r.repo}:${x.label}`, isFirst, () => act.askLocal(r.repo, x))}
      </el.Box>
      {isFail && !isStale && tail(el, `tail:${r.repo}:${x.label}`, x.tail)}
    </el.Box>
  )
}

/** The run going on, or the last one's age. */
export const localRemarks = (r: RepoState, now: number): Remark[] => {
  if (r.running !== null) {
    const at = r.commands.findIndex(c => c.label === r.running)
    return [{ text: `in corso: ${r.running}${at < 0 ? '' : ` (${at + 1} di ${r.commands.length})`}`, color: 'warning' }]
  }
  if (r.local === null) return []
  return [{ text: ago(r.local.at, now) }, ...(r.isDirty ? [{ text: 'modifiche dopo', color: 'warning' as const }] : [])]
}

/** The last run's outcome; during a run, how far it got, in yellow: the checks done and half the one running. */
export const localTally = (r: RepoState): Tally => {
  if (r.running !== null) {
    const at = r.commands.findIndex(c => c.label === r.running)
    return { total: r.commands.length, passed: 0, failed: 0, pending: Math.max(0, at) + HALF }
  }
  const runs = r.local?.runs ?? []
  const passed = runs.filter(x => !isFailed(x.exitCode)).length
  return { total: runs.length, passed, failed: runs.length - passed, pending: 0 }
}

const localSection = (el: ElementTable, r: RepoState, now: number, act: Actions, firstFailure: string | null, isFirstRepo: boolean) => {
  const runs = r.local?.runs ?? []
  const passed = runs.filter(x => !isFailed(x.exitCode)).length
  const isStale = r.running !== null
  const isGreen = passed === runs.length
  const count = isStale ? null : { text: `${isGreen ? '✓' : '✗'} ${passed}/${runs.length}`, color: isGreen ? 'success' : 'error' }
  const runButton = r.commands.length > 0 && r.running === null && (
    <el.Button key={`run:${r.repo}`} label="▶ Esegui" hotkey={isFirstRepo ? 'e' : undefined} plain dimColor onPress={() => act.run(r.repo)} />
  )
  return (
    <el.Box key={`local:${r.repo}`} flexDirection="column">
      {sectionTitle(el, 'Test locali', sourceLabel(r.source), runButton)}
      {r.commands.length === 0 && r.local === null && (
        <el.Text dimColor wrap="wrap">
          Nessun test veloce trovato. Scrivi i comandi in .claude/checks.json del repo: {'{"checks": [{"label": "unit", "command": "…"}]}'}
        </el.Text>
      )}
      {r.commands.length > 0 && r.local === null && r.running === null && (
        <el.Text dimColor wrap="wrap">{` Non ancora eseguiti: ${r.commands.map(c => c.label).join(', ')}.`}</el.Text>
      )}
      {(r.local !== null || isStale) && summaryRow(el, localTally(r), count, localRemarks(r, now))}
      {runs.map(x => localRow(el, r, x, isStale, firstFailure === `local:${r.repo}:${x.label}`, act))}
    </el.Box>
  )
}

/** The workflow before the name, only when the checks come from more than one. */
const checkName = (c: CiCheck, isMixed: boolean) => (isMixed && c.workflow !== '' && c.workflow !== c.name ? `${c.workflow} · ${c.name}` : c.name)

export const isMixedWorkflows = (checks: readonly CiCheck[]) => new Set(checks.map(c => c.workflow).filter(w => w !== '')).size > 1

/** A failed or pending check, on a row of its own. */
const ciRow = (el: ElementTable, r: RepoState, c: CiCheck, i: number, isMixed: boolean, isFirst: boolean, act: Actions) => (
  <el.Box key={`check:${r.repo}:${i}`} flexDirection="row" justifyContent="space-between" columnGap={2} paddingLeft={1}>
    <el.Box flexDirection="row" columnGap={1} flexShrink={1}>
      <el.Text color={COLOR[c.bucket]}>{MARK[c.bucket]}</el.Text>
      <el.Text bold={isCheckFailed(c)} wrap="truncate-end">{checkName(c, isMixed)}</el.Text>
      {c.link !== '' && <el.Link href={c.link} label="apri" />}
    </el.Box>
    {isCheckFailed(c) && askButton(el, `ask-ci:${r.repo}:${i}`, isFirst, () => act.askCi(r.repo, c))}
  </el.Box>
)

/** Passed and skipped checks: short, side by side, wrapping. */
const ciChips = (el: ElementTable, r: RepoState, checks: readonly { c: CiCheck; i: number }[], isMixed: boolean) =>
  checks.length > 0 && (
    <el.Box flexDirection="row" flexWrap="wrap" columnGap={2} paddingLeft={1}>
      {checks.map(({ c, i }) => (
        <el.Text key={`chip:${r.repo}:${i}`} color={COLOR[c.bucket]} dimColor={c.bucket === 'skipping'}>
          {`${MARK[c.bucket]} ${checkName(c, isMixed)}`}
        </el.Text>
      ))}
    </el.Box>
  )

const isSettled = (c: CiCheck) => c.bucket === 'pass' || c.bucket === 'skipping'

const ciSection = (el: ElementTable, r: RepoState, act: Actions, firstFailure: string | null) => {
  const ci = r.ci
  const where = ci === null ? '' : ci.pr !== null ? `PR #${ci.pr.number} ${ci.pr.title}` : `commit ${ci.sha.slice(0, 7)}`
  const indexed = (ci?.checks ?? []).map((c, i) => ({ c, i }))
  const t = ci === null ? null : tally(ci.checks)
  const isMixed = isMixedWorkflows(ci?.checks ?? [])
  const fetching = r.isFetching && <el.Text dimColor italic>aggiorno…</el.Text>
  return (
    <el.Box key={`ci:${r.repo}`} flexDirection="column">
      {sectionTitle(el, 'CI', where, fetching)}
      {r.ciNote !== null && <el.Text dimColor wrap="wrap">{` ${r.ciNote}`}</el.Text>}
      {t !== null &&
        t.total > 0 &&
        summaryRow(
          el,
          t,
          {
            text: `${t.failed > 0 ? '✗' : t.pending > 0 ? '◌' : '✓'} ${t.passed}/${t.total}`,
            color: t.failed > 0 ? 'error' : t.pending > 0 ? 'warning' : 'success',
          },
          t.pending > 0 ? [{ text: `${t.pending} in corso`, color: 'warning' }] : [],
        )}
      {indexed.filter(({ c }) => !isSettled(c)).map(({ c, i }) => ciRow(el, r, c, i, isMixed, firstFailure === `ci:${r.repo}:${i}`, act))}
      {ciChips(el, r, indexed.filter(({ c }) => isSettled(c)), isMixed)}
    </el.Box>
  )
}

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

/** A repository's card, its border in its verdict's colour. */
const repoCard = (el: ElementTable, r: RepoState, s: ChecksState, act: Actions, firstFailure: string | null) => {
  const verdict = verdictOf(r)
  const color = VERDICT_COLOR[verdict]
  return (
    <el.Box key={`repo:${r.repo}`} flexDirection="column" borderStyle="round" borderColor={color} borderDimColor={color === undefined} paddingX={1} gap={1}>
      <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <el.Text wrap="truncate-end">
          <el.Text bold>{r.name}</el.Text>
          <el.Text dimColor>{r.branch === null ? '' : `  ⎇ ${r.branch}`}</el.Text>
        </el.Text>
        {badge(el, verdict, failuresOf(r))}
      </el.Box>
      {localSection(el, r, s.now, act, firstFailure, r.repo === s.repos[0]?.repo)}
      {ciSection(el, r, act, firstFailure)}
    </el.Box>
  )
}

/** Each repository the session touched: its fast tests here, its CI on GitHub. */
export const checksView = (el: ElementTable, s: ChecksState, act: Actions) => {
  const firstFailure = firstFailureOf(s.repos)
  const overall = overallOf(s.repos)
  return (
    <el.Box flexDirection="column" gap={1}>
      <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <el.Box flexDirection="row" columnGap={2}>
          <el.Text bold color="claude">◆ Verifiche</el.Text>
          {s.repos.length > 1 && badge(el, overall.verdict, overall.failures)}
        </el.Box>
        <el.Button key="refresh-ci" label="↻ aggiorna la CI" hotkey="g" plain dimColor onPress={() => act.refreshCi()} />
      </el.Box>
      {s.repos.length === 0 && (
        <el.Text dimColor wrap="wrap">
          Nessun repository ancora: appena Claude modifica un file in un repo git, qui compaiono i suoi test veloci e la sua CI.
        </el.Text>
      )}
      {s.repos.map(r => repoCard(el, r, s, act, firstFailure))}
    </el.Box>
  )
}
