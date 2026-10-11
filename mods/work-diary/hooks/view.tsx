import type { ElementTable } from 'claude-code'

import type { Day, DayFacts, Summary } from '../types'
import { monthCalendar } from './month'
import { dayReport, weekReport } from './report'

export type Actions = {
  select: (day: Day) => unknown
  /** One month back (-1) or ahead (1). */
  shift: (n: -1 | 1) => unknown
  /** Days back (negative) or ahead: a day with a and d, a week with w and s. */
  move: (days: number) => unknown
  today: () => unknown
  rewrite: () => unknown
}

export type DiaryState = {
  selected: Day
  /** Null before the first reading of the transcripts. */
  today: Day | null
  /** The first day the transcripts still cover. */
  oldest: Day | null
  days: ReadonlyMap<Day, DayFacts>
  summaries: Readonly<Record<string, Summary>>
  /** Summaries Claude is writing now, by key. */
  writing: ReadonlySet<string>
  isScanning: boolean
  error: string | null
  /** Cells across the pane. */
  columns: number
}

const keysBar = (el: ElementTable, act: Actions) => (
  <el.Box key="keys" flexDirection="row" columnGap={2} flexWrap="wrap">
    <el.Button key="day-back" label="giorno prima" hotkey="a" plain dimColor onPress={() => act.move(-1)} />
    <el.Button key="day-on" label="giorno dopo" hotkey="d" plain dimColor onPress={() => act.move(1)} />
    <el.Button key="week-back" label="settimana prima" hotkey="w" plain dimColor onPress={() => act.move(-7)} />
    <el.Button key="week-on" label="settimana dopo" hotkey="s" plain dimColor onPress={() => act.move(7)} />
    <el.Button key="today" label="oggi" hotkey="t" plain dimColor onPress={() => act.today()} />
    <el.Button key="rewrite" label="riscrivi i resoconti" hotkey="r" plain dimColor onPress={() => act.rewrite()} />
  </el.Box>
)

/** The diary: the month as a calendar, the selected day's week, then the day itself. */
export const diaryView = (el: ElementTable, s: DiaryState, act: Actions) => (
  <el.Box flexDirection="column" gap={1}>
    {s.isScanning && <el.Text dimColor italic>Leggo i transcript degli ultimi 30 giorni…</el.Text>}
    {s.error !== null && <el.Text color="error">{s.error}</el.Text>}
    {monthCalendar(el, s, act)}
    {keysBar(el, act)}
    {weekReport(el, s)}
    {dayReport(el, s)}
  </el.Box>
)
