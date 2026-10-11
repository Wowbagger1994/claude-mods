import type { ElementTable } from 'claude-code'

import type { ChangedFile, FileEdit } from '../types'
import { shortPath, tabLabel, worktreeName } from './diff'
import type { Run, Tone } from './drawings'
import {
  changeBar,
  churn,
  editTone,
  fit,
  groupByRoot,
  minimapCells,
  relativeTime,
  timelineCells,
  toRuns,
  treemapWidths,
} from './drawings'

/** Tabs 1..9 answer a digit while the pane holds the keyboard. */
const MAX_HOTKEYS = 9
/** No file-map block narrower than this: room for a name and its counts. */
const MIN_BLOCK = 14
const TIMELINE_LABEL = 16
const BAR_CELLS = 4
/** Columns the minimap leaves for its line numbers either side. */
const MINIMAP_MARGIN = 12

/** What a press does: the register module owns the state, the view only asks. */
export type Actions = {
  select: (path: string) => unknown
  toggleEdit: (id: string, isOpen: boolean) => unknown
  setAllEdits: (file: ChangedFile, isOpen: boolean) => unknown
  toggleOverview: () => unknown
  askClear: () => unknown
  confirmClear: () => unknown
  cancelClear: () => unknown
  retryExplanation: (id: string) => unknown
}

export type ViewState = {
  files: ChangedFile[]
  current: ChangedFile
  expanded: Record<string, boolean>
  isOverviewOpen: boolean
  isConfirmingClear: boolean
  isFocused: boolean
  columns: number
  now: number
}

const TONE_COLOR: Record<Tone, string | undefined> = {
  added: 'success',
  removed: 'error',
  changed: 'warning',
  latest: 'claude',
  older: 'success',
  idle: undefined,
}

const isDim = (tone: Tone) => tone === 'idle' || tone === 'older'

const spans = (el: ElementTable, runs: readonly Run[]) =>
  runs.map(run => (
    <el.Text color={TONE_COLOR[run.tone]} dimColor={isDim(run.tone)}>
      {run.text}
    </el.Text>
  ))

const counts = (el: ElementTable, added: number, removed: number) => (
  <el.Text>
    <el.Text color="success">+{added}</el.Text> <el.Text color="error">−{removed}</el.Text>
  </el.Text>
)

const header = (el: ElementTable, s: ViewState, act: Actions) => {
  const added = s.files.reduce((sum, f) => sum + f.edits.reduce((x, e) => x + e.added, 0), 0)
  const removed = s.files.reduce((sum, f) => sum + f.edits.reduce((x, e) => x + e.removed, 0), 0)

  return (
    <el.Box flexDirection="row" justifyContent="space-between">
      <el.Text>
        <el.Text bold color="claude">◆ Diff checker</el.Text>
        <el.Text dimColor>
          {'  '}
          {s.files.length} file ·{' '}
        </el.Text>
        {counts(el, added, removed)}
      </el.Text>
      <el.Box flexDirection="row" columnGap={2}>
        <el.Button
          key="overview"
          label={s.isOverviewOpen ? '▾ Panoramica' : '▸ Panoramica'}
          hotkey="m"
          plain
          dimColor
          onPress={act.toggleOverview}
        />
        {s.isConfirmingClear ? (
          <el.Box flexDirection="row" columnGap={1}>
            <el.Text color="warning">Svuotare tutto?</el.Text>
            <el.Button key="clear-yes" label="Sì, svuota" variant="primary" onPress={act.confirmClear} />
            <el.Button key="clear-no" label="Annulla" onPress={act.cancelClear} />
          </el.Box>
        ) : (
          <el.Button key="clear" label="⌫ Svuota" plain dimColor onPress={act.askClear} />
        )}
      </el.Box>
    </el.Box>
  )
}

const fileMap = (el: ElementTable, s: ViewState, act: Actions) => {
  const byWeight = [...s.files].sort((a, b) => churn(b) - churn(a))
  const perRow = Math.max(1, Math.floor(s.columns / MIN_BLOCK))
  const rows = Array.from({ length: Math.ceil(byWeight.length / perRow) }, (_, i) =>
    byWeight.slice(i * perRow, (i + 1) * perRow),
  )

  return (
    <el.Box flexDirection="column">
      <el.Text dimColor>MAPPA DEI FILE · grandezza = righe cambiate</el.Text>
      {rows.map((row, r) => {
        const widths = treemapWidths(row.map(churn), s.columns, MIN_BLOCK)
        return (
          <el.Box key={`map-row:${r}`} flexDirection="row">
            {row.map((file, i) => {
              const width = widths[i] ?? MIN_BLOCK
              const added = file.edits.reduce((x, e) => x + e.added, 0)
              const removed = file.edits.reduce((x, e) => x + e.removed, 0)
              const isCurrent = file.path === s.current.path
              return (
                <el.Box
                  key={`map:${file.path}`}
                  width={width}
                  flexDirection="column"
                  borderStyle={isCurrent ? 'bold' : 'round'}
                  borderColor={isCurrent ? 'claude' : TONE_COLOR[editTone(added, removed)]}
                  paddingX={1}
                >
                  <el.Button
                    key={`map-open:${file.path}`}
                    label={fit(tabLabel(file.path, s.files), width - 4)}
                    plain
                    onPress={() => act.select(file.path)}
                  />
                  {counts(el, added, removed)}
                </el.Box>
              )
            })}
          </el.Box>
        )
      })}
    </el.Box>
  )
}

const timeline = (el: ElementTable, s: ViewState, act: Actions) => {
  const all = s.files.flatMap(f => f.edits)
  const from = Math.min(...all.map(e => e.at))
  const to = Math.max(...all.map(e => e.at))
  const latest = all.reduce((a, b) => (b.at > a.at ? b : a))
  const width = Math.max(10, s.columns - TIMELINE_LABEL - 1)

  return (
    <el.Box flexDirection="column">
      <el.Text dimColor>
        LINEA DEL TEMPO · dalla prima modifica ({relativeTime(from, s.now)}) all’ultima ({relativeTime(to, s.now)})
      </el.Text>
      {s.files.map(file => (
        <el.Box key={`time:${file.path}`} flexDirection="row">
          <el.Box width={TIMELINE_LABEL}>
            <el.Button
              key={`time-open:${file.path}`}
              label={fit(tabLabel(file.path, s.files), TIMELINE_LABEL - 1)}
              plain
              dimColor={file.path !== s.current.path}
              onPress={() => act.select(file.path)}
            />
          </el.Box>
          <el.Text>{spans(el, toRuns(timelineCells(file.edits, from, to, width, latest.id)))}</el.Text>
        </el.Box>
      ))}
    </el.Box>
  )
}

const tabs = (el: ElementTable, s: ViewState, act: Actions) => {
  const groups = groupByRoot(s.files)
  const isGrouped = groups.length > 1
  const maxChurn = Math.max(...s.files.map(churn))
  const order = groups.flatMap(g => g.files.map(f => f.path))

  return (
    <el.Box flexDirection="column">
      {groups.map(group => (
        <el.Box key={`group:${group.root ?? '-'}`} flexDirection="row" flexWrap="wrap" columnGap={1}>
          {isGrouped && (
            <el.Text color="claude">
              {group.root === null ? 'fuori da git' : worktreeName(group.root)}
              {group.files[0]?.branch ? ` ⎇ ${group.files[0].branch}` : ''}:
            </el.Text>
          )}
          {group.files.map(file => {
            const index = order.indexOf(file.path)
            const isCurrent = file.path === s.current.path
            return (
              <el.Button
                key={`tab:${file.path}`}
                label={`${isCurrent ? '●' : '◇'} ${tabLabel(file.path, group.files)} ${changeBar(churn(file), maxChurn, BAR_CELLS)}`}
                hotkey={index < MAX_HOTKEYS ? String(index + 1) : undefined}
                variant={isCurrent ? 'primary' : undefined}
                dimColor={!isCurrent}
                onPress={() => act.select(file.path)}
              />
            )
          })}
        </el.Box>
      ))}
    </el.Box>
  )
}

const fileHeader = (el: ElementTable, s: ViewState, act: Actions) => {
  const file = s.current
  const latest = file.edits[file.edits.length - 1]
  const added = file.edits.reduce((x, e) => x + e.added, 0)
  const removed = file.edits.reduce((x, e) => x + e.removed, 0)
  const lines = file.lineCount ?? Math.max(1, ...file.marks.map(m => m.end))
  const cells = minimapCells(file.marks, lines, latest?.id ?? '', Math.max(10, s.columns - MINIMAP_MARGIN))
  const where = [
    file.root === null ? null : worktreeName(file.root),
    file.branch === null ? null : `⎇ ${file.branch}`,
    file.isNew ? 'nuovo file' : null,
    `${file.edits.length} ${file.edits.length === 1 ? 'modifica' : 'modifiche'}`,
  ].filter(Boolean)

  return (
    <el.Box flexDirection="column">
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Text>
          <el.Text bold>{shortPath(file.path, file.root)}</el.Text>
          <el.Text dimColor> · {where.join(' · ')} · </el.Text>
          {counts(el, added, removed)}
        </el.Text>
        <el.Box flexDirection="row" columnGap={2}>
          <el.Button key="open-all" label="apri tutte" hotkey="e" plain dimColor onPress={() => act.setAllEdits(file, true)} />
          <el.Button key="close-all" label="chiudi tutte" hotkey="c" plain dimColor onPress={() => act.setAllEdits(file, false)} />
        </el.Box>
      </el.Box>
      <el.Text>
        <el.Text dimColor>riga 1 </el.Text>
        {spans(el, toRuns(cells))}
        <el.Text dimColor>
          {' '}
          {file.lineCount === null ? `~${lines}` : lines}
        </el.Text>
      </el.Text>
    </el.Box>
  )
}

const explanation = (el: ElementTable, edit: FileEdit, act: Actions, isOpen: boolean) => {
  if (edit.explanationState === 'done' && edit.explanation !== null) {
    return isOpen ? (
      <el.Markdown key={`why:${edit.id}`} text={edit.explanation} />
    ) : (
      <el.Text dimColor wrap="truncate-end">
        {edit.explanation.replace(/\s+/g, ' ')}
      </el.Text>
    )
  }
  if (!isOpen) return null
  if (edit.explanationState === 'failed') {
    return (
      <el.Box flexDirection="row" columnGap={1}>
        <el.Text color="warning">Spiegazione non disponibile.</el.Text>
        <el.Button key={`retry:${edit.id}`} label="Riprova" plain onPress={() => act.retryExplanation(edit.id)} />
      </el.Box>
    )
  }
  return (
    <el.Text dimColor italic>
      {edit.explanationState === 'loading' ? 'Claude sta scrivendo il perché…' : 'Il perché arriva a fine turno.'}
    </el.Text>
  )
}

const editCard = (el: ElementTable, s: ViewState, act: Actions, edit: FileEdit, number: number, isLatest: boolean) => {
  const isOpen = s.expanded[edit.id] ?? isLatest

  return (
    <el.Box
      key={`edit:${edit.id}`}
      flexDirection="column"
      borderStyle="round"
      borderColor={isLatest ? 'claude' : 'subtle'}
      paddingX={1}
    >
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Text>
          <el.Text bold>#{number}</el.Text>
          <el.Text dimColor>
            {' · '}
            {isLatest ? 'ultima · ' : ''}
            {relativeTime(edit.at, s.now)} ·{' '}
          </el.Text>
          {counts(el, edit.added, edit.removed)}
        </el.Text>
        <el.Button
          key={`toggle:${edit.id}`}
          label={isOpen ? '▾ chiudi' : '▸ apri'}
          plain
          dimColor
          onPress={() => act.toggleEdit(edit.id, !isOpen)}
        />
      </el.Box>
      {explanation(el, edit, act, isOpen)}
      {isOpen && <el.Code source={edit.diff} format="diff" path={s.current.path} wrap="truncate-end" />}
    </el.Box>
  )
}

/** The whole pane for a session with at least one change. */
export const paneView = (el: ElementTable, s: ViewState, act: Actions) => {
  const newestFirst = [...s.current.edits].reverse()

  return (
    <el.Box flexDirection="column" gap={1}>
      {header(el, s, act)}
      {s.isOverviewOpen && fileMap(el, s, act)}
      {s.isOverviewOpen && timeline(el, s, act)}
      {tabs(el, s, act)}
      {fileHeader(el, s, act)}
      {newestFirst.map((edit, i) => editCard(el, s, act, edit, s.current.edits.length - i, i === 0))}
      {s.isFocused && (
        <el.Text dimColor>1–9 file · e/c apri/chiudi tutte · m panoramica · frecce per scorrere · Esc torna al prompt</el.Text>
      )}
    </el.Box>
  )
}

/** The pane before anything changed. */
export const emptyView = (el: ElementTable) => (
  <el.Box flexDirection="column">
    <el.Text bold color="claude">◆ Diff checker</el.Text>
    <el.Text dimColor>Nessuna modifica in questa sessione: il pannello si riempie quando Claude modifica o crea un file.</el.Text>
  </el.Box>
)
