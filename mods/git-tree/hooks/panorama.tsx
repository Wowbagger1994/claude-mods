import type { ElementTable } from 'claude-code'

import type { Commit } from '../types'
import type { BranchInfo } from './branches'
import { cut, fit, laneColor } from './paint'
import { axisOf, barOf, rankScale, spanOf, statusOf } from './timeline'
import type { Actions, TreeView } from './view'

/** Branches shown, one per digit key. */
export const SHOWN_BRANCHES = 9
const NAME_WIDTH = 22
const NARROW_NAME_WIDTH = 16
/** Below this many columns the names take less room. */
const NARROW = 100
const MIN_BAR = 16
/** The room the status would like after the bar. */
const STATUS_WIDTH = 42

/** The columns of a branch's row: its name, its bar, what is left for its status. */
export const panoramaColumns = (columns: number) => {
  const name = columns < NARROW ? NARROW_NAME_WIDTH : NAME_WIDTH
  const fixed = 3 + 2 + name + 1
  const bar = Math.max(MIN_BAR, columns - fixed - STATUS_WIDTH)
  return { name, fixed, bar, status: Math.max(0, columns - fixed - bar - 2) }
}

/** The panorama: one row per branch, its life drawn on a shared line of time. */
export const panorama = (el: ElementTable, s: TreeView, act: Actions) => {
  const bySha = new Map<string, Commit>(s.commits.map(c => [c.sha, c]))
  const cols = panoramaColumns(s.columns)
  const barWidth = cols.bar
  const times = s.commits.map(c => c.at)
  const pos = rankScale(times, barWidth)
  const shown = s.infos.slice(0, SHOWN_BRANCHES)
  const rest = s.infos.length - shown.length
  return (
    <el.Box key="panorama" flexDirection="column">
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Text bold color="claude">▍Rami</el.Text>
        <el.Text dimColor>1–9 salta al ramo</el.Text>
      </el.Box>
      <el.Text dimColor>{`${' '.repeat(cols.fixed)}${axisOf(times, barWidth, s.now)}`}</el.Text>
      {shown.map((b, i) => branchRow(el, b, i, bySha, pos, cols, s, act))}
      {rest > 0 && <el.Text dimColor>{`${' '.repeat(5)}… e altri ${rest} rami, nella mappa qui sotto`}</el.Text>}
    </el.Box>
  )
}

const branchRow = (
  el: ElementTable,
  b: BranchInfo,
  i: number,
  bySha: ReadonlyMap<string, Commit>,
  pos: (t: number) => number,
  cols: ReturnType<typeof panoramaColumns>,
  s: TreeView,
  act: Actions,
) => {
  const span = spanOf(b, bySha)
  const color = laneColor(b.color)
  const isHere = b.status === 'head'
  const isSelected = s.selected !== null && b.shas.includes(s.selected)
  return (
    <el.Button key={`jump:${b.name}`} label={b.name} hotkey={String(i + 1)} plain onPress={() => act.jump(b.name)}>
      <el.Text dimColor>{` ${i + 1} `}</el.Text>
      <el.Text color={color} bold>{isSelected ? '▶ ' : isHere ? '◉ ' : '  '}</el.Text>
      <el.Text color={color} bold={isHere || isSelected} dimColor={b.status === 'merged' && !isSelected}>{fit(b.name, cols.name)}</el.Text>
      <el.Text> </el.Text>
      <el.Text color={color} bold>{barOf(b, pos(span.from), pos(span.to), cols.bar)}</el.Text>
      <el.Text dimColor={!isHere} color={isHere ? color : undefined}>{`  ${cut(statusOf(b, s.head.branch), cols.status)}`}</el.Text>
    </el.Button>
  )
}
