import type { ElementTable } from 'claude-code'

import type { Commit, DayFacts, ProjectTime, SessionDay } from '../types'
import { formatMinutes, longDayLabel, mondayOf, weekLabel, weekOf } from './calendar'
import { factsOf, mergeDays, projectName } from './facts'
import { dayKey, weekKey } from './summary'
import type { DiaryState } from './view'

const TOP_PROJECTS = 5
const MAX_SESSIONS = 4
const MAX_COMMITS = 3
const NAME_WIDTH = 16
const BAR_WIDTH = 14
/** Below this many columns the project bars are shorter. */
const NARROW = 80
const NARROW_BAR = 8

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** A bar `minutes` long against the longest, in eighths of a cell. */
export const relativeBar = (minutes: number, longest: number, width = BAR_WIDTH): string => {
  if (longest <= 0 || minutes <= 0) return ''
  const eighths = Math.max(1, Math.round((minutes / longest) * width * 8))
  return '█'.repeat(Math.floor(eighths / 8)) + (['', '▏', '▎', '▍', '▌', '▋', '▊', '▉'][eighths % 8] ?? '')
}

const projectCounts = (p: ProjectTime) =>
  [p.sessions > 0 ? plural(p.sessions, 'sessione', 'sessioni') : '', p.commits > 0 ? plural(p.commits, 'commit', 'commit') : '']
    .filter(x => x !== '')
    .join(' · ')

/** Title on the left, figures on the right. */
const heading = (el: ElementTable, title: string, figures: string) => (
  <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
    <el.Text bold color="claude">{title}</el.Text>
    <el.Text bold>{figures}</el.Text>
  </el.Box>
)

/** Claude's lines, or why there are none yet. */
const summaryText = (el: ElementTable, s: DiaryState, key: string) => {
  const written = s.summaries[key]
  if (s.writing.has(key) && written === undefined) return <el.Text dimColor italic>Claude sta scrivendo il resoconto…</el.Text>
  if (written === undefined) return <el.Text dimColor>Resoconto non ancora scritto: premi r.</el.Text>
  return (
    <el.Box flexDirection="column">
      {written.text.split('\n').map((line, i) => (
        // The bullet apart, so a line that wraps starts under the text, not under it.
        <el.Box key={`${key}:${i}`} flexDirection="row" columnGap={1}>
          <el.Text color="claude">•</el.Text>
          <el.Text wrap="wrap">{line.replace(/^•\s*/, '')}</el.Text>
        </el.Box>
      ))}
      {s.writing.has(key) && <el.Text dimColor italic>Claude lo sta riscrivendo…</el.Text>}
    </el.Box>
  )
}

const projectBars = (el: ElementTable, projects: readonly ProjectTime[], columns: number) => {
  const longest = projects[0]?.minutes ?? 0
  const barWidth = columns < NARROW ? NARROW_BAR : BAR_WIDTH
  return (
    <el.Box flexDirection="column">
      {projects.slice(0, TOP_PROJECTS).map(p => (
        <el.Box key={`bar:${p.name}`} flexDirection="row" columnGap={1}>
          <el.Text wrap="truncate-end">{p.name.padEnd(NAME_WIDTH).slice(0, NAME_WIDTH)}</el.Text>
          <el.Text color="claude">{relativeBar(p.minutes, longest, barWidth).padEnd(barWidth)}</el.Text>
          <el.Text bold>{(p.minutes > 0 ? formatMinutes(p.minutes) : '').padEnd(7)}</el.Text>
          <el.Text dimColor wrap="truncate-end">{projectCounts(p)}</el.Text>
        </el.Box>
      ))}
      {projects.length > TOP_PROJECTS && <el.Text dimColor>{`… e altri ${projects.length - TOP_PROJECTS} progetti`}</el.Text>}
    </el.Box>
  )
}

/** The week of the selected day: its total, Claude's lines, its projects. */
export const weekReport = (el: ElementTable, s: DiaryState) => {
  const week = mergeDays(weekOf(s.selected).map(d => factsOf(s.days, d)))
  const hasWork = week.sessions.length > 0 || week.commits.length > 0
  const figures = hasWork ? [formatMinutes(week.activeMinutes), week.commits.length > 0 ? plural(week.commits.length, 'commit', 'commit') : ''].filter(x => x !== '').join(' · ') : ''
  return (
    <el.Box key="week" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap={1}>
      {heading(el, `Settimana ${weekLabel(s.selected)}`, figures)}
      {hasWork ? summaryText(el, s, weekKey(mondayOf(s.selected))) : <el.Text dimColor>Nessun lavoro con Claude in questa settimana.</el.Text>}
      {hasWork && projectBars(el, week.projects, s.columns)}
    </el.Box>
  )
}

const sessionLines = (el: ElementTable, sessions: readonly SessionDay[]) => [
  ...sessions.slice(0, MAX_SESSIONS).map(x => (
    <el.Text key={`session:${x.sessionId}`} wrap="truncate-end">
      <el.Text dimColor>{`   ${formatMinutes(x.activeMinutes).padStart(6)}  `}</el.Text>
      {x.title ?? 'senza titolo'}
    </el.Text>
  )),
  ...(sessions.length > MAX_SESSIONS ? [<el.Text key="more-sessions" dimColor>{`   … e altre ${sessions.length - MAX_SESSIONS} sessioni`}</el.Text>] : []),
]

const commitLines = (el: ElementTable, commits: readonly Commit[], project: string) => [
  ...commits.slice(-MAX_COMMITS).reverse().map(c => (
    <el.Text key={`commit:${c.hash}`} wrap="truncate-end">
      <el.Text color="success">{'   ✓ '}</el.Text>
      <el.Text dimColor>{c.subject}</el.Text>
    </el.Text>
  )),
  ...(commits.length > MAX_COMMITS ? [<el.Text key={`more-commits:${project}`} dimColor>{`   … e altri ${commits.length - MAX_COMMITS} commit`}</el.Text>] : []),
]

/** The day's work project by project: time, sessions by title, latest commits. */
const dayProjects = (el: ElementTable, f: DayFacts) => (
  <el.Box flexDirection="column" gap={1}>
    {f.projects.map(p => {
      const sessions = f.sessions.filter(x => projectName(x.repo) === p.name)
      const commits = f.commits.filter(c => projectName(c.project) === p.name)
      return (
        <el.Box key={`project:${p.name}`} flexDirection="column">
          <el.Text>
            <el.Text bold>{`● ${p.name}`}</el.Text>
            <el.Text dimColor>{`  ${[p.minutes > 0 ? formatMinutes(p.minutes) : '', projectCounts(p)].filter(x => x !== '').join(' · ')}`}</el.Text>
          </el.Text>
          {sessionLines(el, sessions)}
          {commitLines(el, commits, p.name)}
        </el.Box>
      )
    })}
  </el.Box>
)

/** The selected day: Claude's lines, then what was done in each project. */
export const dayReport = (el: ElementTable, s: DiaryState) => {
  const f = factsOf(s.days, s.selected)
  const hasWork = f.sessions.length > 0 || f.commits.length > 0
  const isFuture = s.today !== null && s.selected > s.today
  const isForgotten = s.oldest !== null && s.selected < s.oldest
  const why = isFuture
    ? 'Questo giorno deve ancora venire.'
    : isForgotten
      ? 'Oltre i 30 giorni: Claude Code non tiene più i transcript.'
      : 'Nessun lavoro con Claude in questo giorno.'
  const title = longDayLabel(s.selected)
  return (
    <el.Box key="day" flexDirection="column" borderStyle="round" borderDimColor paddingX={1} gap={1}>
      {heading(el, `${title.charAt(0).toUpperCase()}${title.slice(1)}`, hasWork ? formatMinutes(f.activeMinutes) : '')}
      {hasWork ? summaryText(el, s, dayKey(s.selected)) : <el.Text dimColor>{why}</el.Text>}
      {hasWork && dayProjects(el, f)}
    </el.Box>
  )
}
