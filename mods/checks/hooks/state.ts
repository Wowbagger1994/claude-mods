import type { CheckCommand, CheckSource, CiStatus, LocalRun } from '../types'

/** One repository the session worked in, and what is known of its checks. */
export type RepoState = {
  repo: string
  name: string
  branch: string | null
  commands: CheckCommand[]
  source: CheckSource
  local: LocalRun | null
  /** The check running now; null when none. */
  running: string | null
  /** Claude edited it since its last run. */
  isDirty: boolean
  ci: CiStatus | null
  /** Why there is no CI to show: no gh, no run for the commit, an error. */
  ciNote: string | null
  isFetching: boolean
}

export const isFailed = (exitCode: number) => exitCode !== 0

/** `✓ test 4/4 · CI ✓ 2/2`, `✗ test 1/4 · CI ⏳ 1/3`; null with nothing to tell. */
export const statusLine = (repos: readonly RepoState[]): string | null => {
  const runs = repos.flatMap(r => r.local?.runs ?? [])
  const isRunning = repos.some(r => r.running !== null)
  const checks = repos.flatMap(r => r.ci?.checks ?? []).filter(c => c.bucket !== 'skipping')
  const parts: string[] = []
  if (isRunning) parts.push('⏳ test')
  else if (runs.length > 0) {
    const passed = runs.filter(r => !isFailed(r.exitCode)).length
    parts.push(`${passed === runs.length ? '✓' : '✗'} test ${passed}/${runs.length}`)
  }
  if (checks.length > 0) {
    const passed = checks.filter(c => c.bucket === 'pass').length
    const mark = checks.some(c => c.bucket === 'fail' || c.bucket === 'cancel') ? '✗' : checks.some(c => c.bucket === 'pending') ? '⏳' : '✓'
    parts.push(`CI ${mark} ${passed}/${checks.length}`)
  }
  return parts.length === 0 ? null : `${parts.join(' · ')} · /checks`
}
