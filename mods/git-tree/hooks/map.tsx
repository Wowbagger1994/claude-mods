import type { ElementTable } from 'claude-code'

import type { Commit } from '../types'
import { mergeTitle } from './branches'
import { card } from './card'
import type { Item } from './fold'
import type { Cell, GraphRow } from './graph'
import type { Badge } from './labels'
import { badgesOf, clockOf, dayLabel, shortRef } from './labels'
import { cut, fit, graphCells, graphRoom, laneColor } from './paint'
import type { Actions, TreeView } from './view'

const BRANCH_WIDTH = 18
const AUTHOR_MAX = 12
/** The row's own room besides graph and text: the marker, the gaps. */
const ROW_FIXED = 2 + 1 + BRANCH_WIDTH + 1

const badgeText = (b: Badge) => (b.kind === 'tag' ? `◇ ${shortRef(b.text)}` : b.kind === 'remote' ? `☁ ${shortRef(b.text)}` : `⎇ ${shortRef(b.text)}`)

/** The names on a commit that its branch's own name does not already tell. */
export const extraBadges = (c: Commit, branch: string | undefined): Badge[] => badgesOf(c.refs).filter(b => b.text !== branch && b.kind !== 'head')

/** Whether the branch's own name sits on this commit on GitHub too. */
const isSyncedHere = (c: Commit, branch: string | undefined) => c.refs.some(r => r.kind === 'remote' && r.name === `origin/${branch}`)

const rightOf = (c: Commit) => `${cut(c.author, AUTHOR_MAX)} ${clockOf(c.at)}`

/** A commit's line: the marker, the graph, the branch where it changes, what it did, who and when. */
const commitLine = (el: ElementTable, s: TreeView, c: Commit, row: GraphRow, width: number, showBranch: boolean, act: Actions) => {
  const branch = s.owner.get(c.sha)
  const color = laneColor(row.color)
  const isSelected = c.sha === s.selected
  const isHead = c.sha === s.headSha
  const merge = mergeTitle(c)
  const badges = extraBadges(c, branch)
  const right = rightOf(c)
  const here = isHead ? ' qui ' : ''
  const isSynced = isSyncedHere(c, branch)
  const synced = showBranch && isSynced ? ' ☁' : ''
  // GitHub's copy of the branch on a commit below its tip: worth a word of its own.
  const branchText = showBranch ? `${cut(branch ?? '', BRANCH_WIDTH - synced.length)}${synced}` : isSynced ? '☁ GitHub è qui' : ''
  const room = s.columns - ROW_FIXED - width - here.length - badges.reduce((n, b) => n + badgeText(b).length + 1, 0) - right.length - 3
  return (
    <el.Box key={`row:${c.sha}`} flexDirection="row" justifyContent="space-between">
      <el.Button key={`sel:${c.sha}`} label={c.subject} plain onPress={() => act.select(c.sha)}>
        <el.Text color={color} bold>{isSelected ? '▶ ' : '  '}</el.Text>
        {graphCells(el, row.cells, width, `g:${c.sha}`)}
        <el.Text> </el.Text>
        <el.Text color={color} bold={showBranch} dimColor={!showBranch}>{fit(branchText, BRANCH_WIDTH)}</el.Text>
        <el.Text> </el.Text>
        {isHead && <el.Text bold color="inverseText" backgroundColor={color}>{here}</el.Text>}
        {isHead && <el.Text> </el.Text>}
        {badges.map((b, i) => (
          <el.Text key={`b:${c.sha}:${i}`} color={b.kind === 'tag' ? 'warning' : b.kind === 'remote' ? 'suggestion' : undefined} dimColor={b.kind === 'remote'}>{`${badgeText(b)} `}</el.Text>
        ))}
        <el.Text bold={isSelected || merge !== null} inverse={isSelected} italic={merge !== null}>{cut(merge === null ? c.subject : `⇠ ${merge}`, room)}</el.Text>
      </el.Button>
      <el.Text dimColor>{right}</el.Text>
    </el.Box>
  )
}

/** A folded run: its branch's dotted line, how many commits, over which days. */
const foldLine = (el: ElementTable, s: TreeView, from: number, to: number, width: number, act: Actions) => {
  const first = s.commits[from]!
  const last = s.commits[to]!
  const row = s.rows[from]!
  const color = laneColor(row.color)
  const key = `fold:${first.sha}`
  const isSelected = s.selected === key
  const cells: Cell[] = row.cells.map((x, i) => (i === 2 * row.col ? { ch: '┇', color: x.color } : x))
  const count = to - from + 1
  const days = [dayLabel(last.at, s.now), dayLabel(first.at, s.now)].filter((d, i, all) => all.indexOf(d) === i).join(' → ')
  const authors = [...new Set(s.commits.slice(from, to + 1).map(c => c.author))]
  const who = cut(authors.length === 1 ? authors[0]! : `${authors.length} autori`, AUTHOR_MAX + 6)
  const counted = `${count} commit`
  const hint = isSelected ? '   o per aprirli' : ''
  const room = s.columns - ROW_FIXED - width - counted.length - hint.length - who.length - 3
  return (
    <el.Box key={`row:${key}`} flexDirection="row" justifyContent="space-between">
      <el.Button key={`sel:${key}`} label={`${count} commit`} plain onPress={() => act.select(key)}>
        <el.Text color={color} bold>{isSelected ? '▶ ' : '  '}</el.Text>
        {graphCells(el, cells, width, `g:${key}`)}
        <el.Text> </el.Text>
        <el.Text color={color}>{fit(s.owner.get(first.sha) ?? '', BRANCH_WIDTH)}</el.Text>
        <el.Text> </el.Text>
        <el.Text bold inverse={isSelected} color={isSelected ? undefined : color}>{counted}</el.Text>
        <el.Text dimColor>{`  ${cut(days, room - 2)}`}</el.Text>
        <el.Text color="claude">{hint}</el.Text>
      </el.Button>
      <el.Text dimColor>{who}</el.Text>
    </el.Box>
  )
}

/** A day's heading, with the lanes going on through it. */
const dayLine = (el: ElementTable, s: TreeView, item: Extract<Item, { kind: 'day' }>, width: number) => {
  const above = item.index > 0 ? (s.rows[item.index - 1]?.below ?? []) : []
  const label = `── ${dayLabel(item.at, s.now)} `
  return (
    <el.Text key={item.key}>
      <el.Text>{'  '}</el.Text>
      {graphCells(el, above, width, `d:${item.key}`)}
      <el.Text> </el.Text>
      <el.Text bold color="claude">{label}</el.Text>
      <el.Text dimColor>{'─'.repeat(Math.max(0, s.columns - 3 - width - label.length - 2))}</el.Text>
    </el.Text>
  )
}

/**
 * The graph's width for each line: the widest of its day, so a quiet day is not
 * pushed right by a busy one far below; within a day the texts line up.
 */
export const widthsOf = (items: readonly Item[], rows: readonly GraphRow[]): number[] => {
  const cellsOf = (item: Item) =>
    item.kind === 'day' ? (item.index > 0 ? (rows[item.index - 1]?.below.length ?? 0) : 0) : (rows[item.kind === 'fold' ? item.from : item.index]?.cells.length ?? 0)
  const groups: number[] = []
  let group = -1
  for (const item of items) {
    if (item.kind === 'day' || group < 0) group++
    groups.push(group)
  }
  const widest = items.reduce<number[]>((acc, item, i) => {
    const g = groups[i]!
    const next = [...acc]
    next[g] = Math.max(acc[g] ?? 0, cellsOf(item))
    return next
  }, [])
  return groups.map(g => widest[g] ?? 0)
}

/** The map: the commits as a metro map, the selected one opened under its line. */
export const commitMap = (el: ElementTable, s: TreeView, act: Actions) => {
  const widths = widthsOf(s.items, s.rows).map(w => graphRoom(w, s.columns))
  let lastBranch: string | undefined
  const lines = s.items.flatMap((item, i) => {
    const width = widths[i] ?? 0
    if (item.kind === 'day') {
      lastBranch = undefined
      return [dayLine(el, s, item, width)]
    }
    if (item.kind === 'fold') {
      lastBranch = s.owner.get(s.commits[item.from]!.sha)
      return [foldLine(el, s, item.from, item.to, width, act)]
    }
    const c = s.commits[item.index]!
    const row = s.rows[item.index]!
    const branch = s.owner.get(c.sha)
    const showBranch = branch !== lastBranch
    lastBranch = branch
    const line = commitLine(el, s, c, row, width, showBranch, act)
    if (c.sha !== s.selected) return [line]
    lastBranch = undefined
    return [line, card(el, s, c, row, width, act)]
  })
  return (
    <el.Box key="map" flexDirection="column">
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Text bold color="claude">▍Commit</el.Text>
        <el.Box flexDirection="row" columnGap={2}>
          <el.Button key="down" label="j giù" hotkey="j" plain dimColor onPress={() => act.move(1)} />
          <el.Button key="up" label="k su" hotkey="k" plain dimColor onPress={() => act.move(-1)} />
          <el.Button key="fold" label="o apri/chiudi" hotkey="o" plain dimColor onPress={() => act.toggleFold()} />
          <el.Button key="head" label="h dove sei" hotkey="h" plain dimColor onPress={() => act.toHead()} />
        </el.Box>
      </el.Box>
      {s.commits.length === 0 ? <el.Text dimColor>Nessun commit ancora.</el.Text> : lines}
      {s.hasMore && <el.Button key="more" label="m mostra altri commit" hotkey="m" plain dimColor onPress={() => act.more()} />}
    </el.Box>
  )
}
