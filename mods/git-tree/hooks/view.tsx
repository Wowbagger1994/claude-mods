import type { ElementTable, RenderSurface } from 'claude-code'

import type { Commit, CommitDetail, HeadState } from '../types'
import type { BranchInfo } from './branches'
import type { GitAction } from './commands'
import type { Item } from './fold'
import type { GraphRow } from './graph'
import { ageOf } from './labels'
import { commitMap } from './map'
import { laneColor } from './paint'
import { panorama } from './panorama'

export type Actions = {
  /** Selects a line of the map: a commit by its hash, a folded run by its key. */
  select: (key: string) => unknown
  move: (delta: number) => unknown
  toHead: () => unknown
  jump: (branch: string) => unknown
  toggleFold: () => unknown
  refresh: () => unknown
  more: () => unknown
  ask: (action: GitAction) => unknown
  askFetch: () => unknown
  startBranch: () => unknown
  submitBranch: (name: string) => unknown
  confirm: () => unknown
  cancel: () => unknown
  copy: (text: string, surface: RenderSurface) => unknown
  explain: (commit: Commit) => unknown
}

export type TreeView = {
  name: string
  commits: readonly Commit[]
  rows: readonly GraphRow[]
  /** Each commit's branch. */
  owner: ReadonlyMap<string, string>
  infos: readonly BranchInfo[]
  items: readonly Item[]
  headSha: string | null
  head: HeadState
  /** The selected line's key: a commit's hash or a fold's key. */
  selected: string | null
  detail: CommitDetail | null
  localNames: ReadonlySet<string>
  /** A command waiting for the person's yes. */
  pending: GitAction | null
  isNaming: boolean
  nameProblem: string | null
  /** The selected commit's detail could not be read. */
  isDetailFailed: boolean
  /** The command running now, in words. */
  busy: string | null
  message: { text: string; isError: boolean } | null
  hasMore: boolean
  now: number
  columns: number
}

/** Where the checked-out branch stands against GitHub, in words. */
export const syncText = (h: HeadState): { text: string; isCalm: boolean } => {
  if (h.branch === null) return { text: 'nessun ramo: i commit fatti qui non hanno un nome', isCalm: false }
  if (h.ahead === null || h.behind === null) return { text: 'non collegato a GitHub', isCalm: false }
  if (h.ahead === 0 && h.behind === 0) return { text: '☁ allineato con GitHub', isCalm: true }
  return { text: [...(h.ahead > 0 ? [`↑ ${h.ahead} da mandare`] : []), ...(h.behind > 0 ? [`↓ ${h.behind} da scaricare`] : [])].join(' · '), isCalm: false }
}

/** The card of where you are: the branch as a label in its colour, GitHub, the files not committed. */
const hero = (el: ElementTable, s: TreeView) => {
  const here = s.infos.find(b => b.status === 'head')
  const color = laneColor(here?.color ?? 0)
  const sync = syncText(s.head)
  const last = s.commits.find(c => c.sha === s.headSha)
  const facts = [
    last === undefined ? null : `ultimo commit ${ageOf(last.at, s.now)}`,
    `${s.commits.length}${s.hasMore ? '+' : ''} commit`,
    `${s.infos.length} ${s.infos.length === 1 ? 'ramo' : 'rami'}`,
  ].filter((f): f is string => f !== null)
  return (
    <el.Box key="hero" flexDirection="column" borderStyle="round" borderColor={color} paddingX={1}>
      <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
        <el.Text>
          <el.Text dimColor bold>{'SEI SU  '}</el.Text>
          <el.Text bold color="inverseText" backgroundColor={s.head.branch === null ? 'warning' : color}>{` ⎇ ${s.head.branch ?? `HEAD staccata su ${s.headSha?.slice(0, 7) ?? '?'}`} `}</el.Text>
          <el.Text>{'   '}</el.Text>
          <el.Text color={sync.isCalm ? 'success' : 'warning'}>{sync.text}</el.Text>
        </el.Text>
        {s.head.changed > 0 && <el.Text color="warning" bold>{`✎ ${s.head.changed} ${s.head.changed === 1 ? 'file modificato' : 'file modificati'}`}</el.Text>}
      </el.Box>
      <el.Text dimColor>{facts.join(' · ')}</el.Text>
    </el.Box>
  )
}

const header = (el: ElementTable, s: TreeView, act: Actions) => (
  <el.Box flexDirection="row" justifyContent="space-between" columnGap={2}>
    <el.Text>
      <el.Text bold color="claude">◆ ALBERO DI GIT</el.Text>
      <el.Text dimColor>{'  ·  '}</el.Text>
      <el.Text bold>{s.name}</el.Text>
    </el.Text>
    <el.Box flexDirection="row" columnGap={2}>
      <el.Button key="fetch" label="↓ scarica" hotkey="f" plain dimColor onPress={() => act.askFetch()} />
      <el.Button key="refresh" label="↻ aggiorna" hotkey="r" plain dimColor onPress={() => act.refresh()} />
    </el.Box>
  </el.Box>
)

/** A command's words, the command itself, and the yes. */
export const confirmBox = (el: ElementTable, a: GitAction, act: Actions) => (
  <el.Box flexDirection="column" borderStyle="round" borderColor="warning" paddingX={1}>
    <el.Text color="warning" wrap="wrap">{a.explain}</el.Text>
    <el.Text dimColor>{`$ git ${a.args.join(' ')}`}</el.Text>
    <el.Box flexDirection="row" columnGap={2}>
      <el.Button key="confirm" label="Sì, esegui" hotkey="s" variant="primary" onPress={() => act.confirm()} />
      <el.Button key="cancel" label="Annulla" hotkey="n" plain dimColor onPress={() => act.cancel()} />
    </el.Box>
  </el.Box>
)

/** The fetch's question, or what the last command said. */
const notice = (el: ElementTable, s: TreeView, act: Actions) => {
  if (s.busy !== null) return <el.Text color="warning" italic>{`◌ ${s.busy}`}</el.Text>
  if (s.pending !== null && s.pending.args[0] === 'fetch') return confirmBox(el, s.pending, act)
  if (s.message !== null) return <el.Text color={s.message.isError ? 'error' : 'success'} wrap="wrap">{s.message.text}</el.Text>
  return null
}

/** The pane: where you are, the branches over time, then the commits as a metro map. */
export const treeView = (el: ElementTable, s: TreeView, act: Actions) => (
  <el.Box flexDirection="column" gap={1}>
    {header(el, s, act)}
    {hero(el, s)}
    {notice(el, s, act)}
    {s.infos.length > 0 && panorama(el, s, act)}
    {commitMap(el, s, act)}
  </el.Box>
)
