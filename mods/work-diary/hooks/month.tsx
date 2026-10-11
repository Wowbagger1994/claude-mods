import type { ElementTable } from 'claude-code'

import type { Day } from '../types'
import { dayNumber, monthGrid, monthLabel, shortMinutes, WEEKDAYS, weekOf } from './calendar'
import { factsOf } from './facts'
import type { Actions, DiaryState } from './view'

const MIN_CELL = 6
const MAX_CELL = 12
/** The arrow left of a week: the one the report is about. */
const GUTTER = 2
/** Cells by time worked, light to Claude's orange; the text on them dark, to read on any theme. */
export const HEAT = [
  { upTo: 0, bg: undefined },
  { upTo: 60, bg: '#f6e0d4' },
  { upTo: 180, bg: '#efbfa5' },
  { upTo: 360, bg: '#e69a74' },
  { upTo: Infinity, bg: '#d97757' },
] as const
const ON_HEAT = '#1f1410'

export const heatOf = (minutes: number): string | undefined => HEAT.find(level => minutes <= level.upTo)?.bg

/** Cells as wide as the pane allows, seven to a row and a column apart. */
export const cellWidth = (columns: number): number =>
  // Less the gutter, the six gaps, the frame and its padding.
  Math.max(MIN_CELL, Math.min(MAX_CELL, Math.floor((columns - GUTTER - 6 - 4) / 7)))

const pad = (text: string, width: number) => text.padEnd(width).slice(0, width)

type Cell = { day: Day; minutes: number; isSelected: boolean; isToday: boolean; isFuture: boolean }

/** Each week is two rows: the days' numbers (pressable) over their time. */
const weekRows = (el: ElementTable, cells: (Cell | null)[], w: number, isSelectedWeek: boolean, act: Actions, r: number) => {
  const style = (c: Cell) => {
    const bg = heatOf(c.minutes)
    return c.isSelected
      ? { inverse: true, bold: true }
      : { backgroundColor: bg, color: bg === undefined ? undefined : ON_HEAT, dimColor: bg === undefined && c.isFuture }
  }
  const gutter = (text: string) => <el.Text color="claude" bold>{pad(text, GUTTER)}</el.Text>
  return [
    <el.Box key={`days:${r}`} flexDirection="row" columnGap={1}>
      {gutter(isSelectedWeek ? '▸' : '')}
      {cells.map((c, i) =>
        c === null ? (
          <el.Text key={`blank:${r}:${i}`}>{pad('', w)}</el.Text>
        ) : (
          <el.Button key={`cell:${c.day}`} plain onPress={() => act.select(c.day)}>
            <el.Text {...style(c)}>{pad(` ${dayNumber(c.day)}${c.isToday ? ' ●' : ''}`, w)}</el.Text>
          </el.Button>
        ),
      )}
    </el.Box>,
    <el.Box key={`times:${r}`} flexDirection="row" columnGap={1}>
      {gutter('')}
      {cells.map((c, i) => (
        <el.Text key={`time:${r}:${i}`} {...(c === null ? {} : style(c))}>
          {pad(c === null || c.minutes === 0 ? '' : ` ${shortMinutes(c.minutes)}`, w)}
        </el.Text>
      ))}
    </el.Box>,
  ]
}

/** A wall calendar of the selected day's month, shaded by the hours of work. */
export const monthCalendar = (el: ElementTable, s: DiaryState, act: Actions) => {
  const w = cellWidth(s.columns)
  const week = new Set(weekOf(s.selected))
  const cellOf = (day: Day | null): Cell | null =>
    day === null
      ? null
      : {
          day,
          minutes: factsOf(s.days, day).activeMinutes,
          isSelected: day === s.selected,
          isToday: day === s.today,
          isFuture: s.today !== null && day > s.today,
        }
  return (
    <el.Box key="calendar" flexDirection="column" borderStyle="round" borderColor="claude" paddingX={1}>
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Button key="prev" label="‹ mese" hotkey="p" plain dimColor onPress={() => act.shift(-1)} />
        <el.Text bold color="claude">{monthLabel(s.selected).toUpperCase()}</el.Text>
        <el.Button key="next" label="mese ›" hotkey="n" plain dimColor onPress={() => act.shift(1)} />
      </el.Box>
      <el.Box flexDirection="row" columnGap={1}>
        <el.Text>{pad('', GUTTER)}</el.Text>
        {WEEKDAYS.map(d => (
          <el.Text key={`wd:${d}`} bold dimColor={d === 'sab' || d === 'dom'}>{pad(` ${d}`, w)}</el.Text>
        ))}
      </el.Box>
      {monthGrid(s.selected).flatMap((row, r) => weekRows(el, row.map(cellOf), w, row.some(d => d !== null && week.has(d)), act, r))}
      <el.Box flexDirection="row" columnGap={1} marginTop={1}>
        <el.Text dimColor>meno</el.Text>
        {HEAT.slice(1).map(level => (
          <el.Text key={`heat:${level.bg}`} backgroundColor={level.bg}>{'   '}</el.Text>
        ))}
        <el.Text dimColor>più ore · ● oggi</el.Text>
      </el.Box>
    </el.Box>
  )
}
