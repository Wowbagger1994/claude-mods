import type { Commit, Day, DayFacts, ProjectTime, Scan, SessionDay, Span } from '../types'
import { formatMinutes, isDay } from './calendar'

const WORKTREE = /\/\.claude\/worktrees\/[^/]+(?:\/.*)?$/
const JOB = /\/\.claude\/jobs\/([^/]+)(?:\/.*)?$/
const MINUTE_MS = 60_000

const isString = (v: unknown): v is string => typeof v === 'string'
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0
const isSpan = (v: unknown): v is Span => Array.isArray(v) && v.length === 2 && v.every(isString)

const isSession = (v: unknown): v is SessionDay => {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  return (
    isString(s.sessionId) && isDay(s.day) && isString(s.project) && isString(s.repo) && (s.branch === null || isString(s.branch)) &&
    (s.title === null || isString(s.title)) && isString(s.start) && isString(s.end) && isCount(s.activeMinutes) &&
    Array.isArray(s.spans) && s.spans.every(isSpan) && isCount(s.prompts) &&
    Array.isArray(s.edits) && s.edits.every(isString) && isCount(s.commands)
  )
}

const isCommit = (v: unknown): v is Commit => {
  if (typeof v !== 'object' || v === null) return false
  const c = v as Record<string, unknown>
  return isString(c.project) && isDay(c.day) && isString(c.time) && isString(c.hash) && isString(c.subject)
}

/** The scanner's output, what of it is well formed; null when it is no scan at all. */
export const parseScan = (text: string): Scan | null => {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return null
  }
  if (typeof raw !== 'object' || raw === null) return null
  const o = raw as Record<string, unknown>
  if (!isDay(o.today) || !Array.isArray(o.sessions) || !Array.isArray(o.commits)) return null
  return { today: o.today, sessions: o.sessions.filter(isSession), commits: o.commits.filter(isCommit) }
}

/** The repository a session's directory belongs to: a worktree counts as its repository. */
export const repoOf = (path: string): string => path.replace(WORKTREE, '')

/** What the calendar calls a project: the repository's folder; a background job's scratch space, `job <id>`. */
export const projectName = (path: string): string => {
  const job = JOB.exec(path)
  if (job !== null) return `job ${job[1]}`
  const parts = repoOf(path).split('/').filter(p => p !== '')
  return parts[parts.length - 1] ?? '/'
}

/** Minutes covered by the spans together: where they overlap, once. */
export const unionMinutes = (spans: readonly Span[]): number => {
  const ranges = spans
    .map(([a, b]) => [Date.parse(a), Date.parse(b)] as const)
    .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b >= a)
    .sort((x, y) => x[0] - y[0])
  let total = 0
  let open: [number, number] | null = null
  for (const [a, b] of ranges) {
    if (open !== null && a <= open[1]) open = [open[0], Math.max(open[1], b)]
    else {
      if (open !== null) total += open[1] - open[0]
      open = [a, b]
    }
  }
  if (open !== null) total += open[1] - open[0]
  return Math.round(total / MINUTE_MS)
}

/** The same commit seen on two branches (a rebase, a cherry-pick: they keep the author's time) counts once. */
export const uniqueCommits = (commits: readonly Commit[]): Commit[] => {
  const sorted = [...commits].sort((a, b) => `${a.day} ${a.time}`.localeCompare(`${b.day} ${b.time}`))
  const seen = new Set<string>()
  return sorted.filter(c => {
    const key = `${c.project}\n${c.day} ${c.time}\n${c.subject}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Most minutes first; as long, most commits; then by name. */
const byTime = (a: ProjectTime, b: ProjectTime): number => b.minutes - a.minutes || b.commits - a.commits || a.name.localeCompare(b.name)

export const projectTimes = (sessions: readonly SessionDay[], commits: readonly Commit[]): ProjectTime[] => {
  const names = [...new Set([...sessions.map(s => projectName(s.repo)), ...commits.map(c => projectName(c.project))])]
  return names
    .map(name => {
      const own = sessions.filter(s => projectName(s.repo) === name)
      return {
        name,
        minutes: unionMinutes(own.flatMap(s => s.spans)),
        sessions: own.length,
        commits: commits.filter(c => projectName(c.project) === name).length,
      }
    })
    .sort(byTime)
}

/** `shop 1h 30m`; a project with commits and no session of its own, `shop 3 commit`. */
export const projectLabel = (p: ProjectTime): string =>
  `${p.name} ${p.minutes > 0 || p.commits === 0 ? formatMinutes(p.minutes) : `${p.commits} commit`}`

export const emptyDay = (day: Day): DayFacts => ({ day, activeMinutes: 0, projects: [], sessions: [], commits: [] })

/** The scan by day. */
export const daysOf = (scan: Scan): Map<Day, DayFacts> => {
  const commits = uniqueCommits(scan.commits)
  const days = [...new Set([...scan.sessions.map(s => s.day), ...commits.map(c => c.day)])]
  return new Map(
    days.map(day => {
      const sessions = scan.sessions.filter(s => s.day === day).sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
      const own = commits.filter(c => c.day === day)
      return [day, { day, activeMinutes: unionMinutes(sessions.flatMap(s => s.spans)), projects: projectTimes(sessions, own), sessions, commits: own }]
    }),
  )
}

export const factsOf = (days: ReadonlyMap<Day, DayFacts>, day: Day): DayFacts => days.get(day) ?? emptyDay(day)

/** Several days as one: a week's total and its projects. */
export const mergeDays = (facts: readonly DayFacts[]): Omit<DayFacts, 'day'> => {
  const sessions = facts.flatMap(f => f.sessions)
  const commits = facts.flatMap(f => f.commits)
  return {
    activeMinutes: facts.reduce((sum, f) => sum + f.activeMinutes, 0),
    projects: projectTimes(sessions, commits).map(p => ({
      ...p,
      // A week's project time is its days' added: the union is taken within each day.
      minutes: facts.reduce((sum, f) => sum + (f.projects.find(q => q.name === p.name)?.minutes ?? 0), 0),
    })).sort(byTime),
    sessions,
    commits,
  }
}

/** Half-hour steps of time: today's summary is not stale at every message. */
const STALE_STEP_MINUTES = 30

/** Changes when the facts a summary is written from change. */
export const factsKey = (facts: readonly DayFacts[]): string =>
  JSON.stringify(
    facts.map(f => [
      f.day,
      Math.floor(f.activeMinutes / STALE_STEP_MINUTES),
      f.sessions.map(s => [s.sessionId, s.title]),
      f.commits.map(c => c.hash),
    ]),
  )
