import type { ChangeKind, ChangedFile, FileEdit, Mark } from '../types'

/** How a cell is painted: by what changed there, `older` for an earlier edit's lines, `idle` for none. */
export type Tone = ChangeKind | 'older' | 'idle' | 'latest'

/** A run of cells drawn in one tone, ready for a Text span. */
export type Run = { text: string; tone: Tone }

const MINUTE = 60_000
const HOUR = 60 * MINUTE

/** Joins neighbouring cells of one tone into runs, so a row is a handful of spans. */
export const toRuns = (cells: readonly { glyph: string; tone: Tone }[]): Run[] =>
  cells.reduce<Run[]>((runs, cell) => {
    const last = runs[runs.length - 1]
    return last !== undefined && last.tone === cell.tone
      ? [...runs.slice(0, -1), { text: last.text + cell.glyph, tone: last.tone }]
      : [...runs, { text: cell.glyph, tone: cell.tone }]
  }, [])

const KIND_RANK: Record<ChangeKind, number> = { removed: 1, added: 2, changed: 3 }

/**
 * The minimap: the whole file squeezed into `width` cells, left to right as top
 * to bottom. A cell shows the strongest change in its slice of lines; the latest
 * edit's in its own colour, earlier edits' dim.
 */
export const minimapCells = (
  marks: readonly Mark[],
  lineCount: number,
  latestId: string,
  width: number,
): { glyph: string; tone: Tone }[] => {
  const lines = Math.max(lineCount, 1, ...marks.map(m => m.end))
  const cells = Math.max(1, Math.min(width, lines))

  return Array.from({ length: cells }, (_, i) => {
    const from = Math.floor((i * lines) / cells) + 1
    const to = Math.floor(((i + 1) * lines) / cells)
    const hits = marks.filter(m => m.start <= Math.max(to, from) && m.end >= from)
    const latest = hits.filter(m => m.editId === latestId)
    const strongest = [...latest].sort((a, b) => KIND_RANK[b.kind] - KIND_RANK[a.kind])[0]

    if (strongest !== undefined) return { glyph: strongest.kind === 'removed' ? '▼' : '█', tone: strongest.kind }
    if (hits.length > 0) return { glyph: '▆', tone: 'older' }
    return { glyph: '─', tone: 'idle' }
  })
}

/** Where an edit's weight lies: mostly added, mostly removed, or both. */
export const editTone = (added: number, removed: number): ChangeKind => {
  const total = added + removed
  if (total === 0 || added / total >= 2 / 3) return 'added'
  if (removed / total >= 2 / 3) return 'removed'
  return 'changed'
}

/**
 * One timeline row: the session from the first edit to the last across `width`
 * cells, a dot where this file was edited, a digit where several edits fell in one cell.
 */
export const timelineCells = (
  edits: readonly FileEdit[],
  from: number,
  to: number,
  width: number,
  latestId: string,
): { glyph: string; tone: Tone }[] => {
  const span = Math.max(to - from, 1)
  const slots = Math.max(width, 1)
  const at = (edit: FileEdit) => Math.min(slots - 1, Math.round(((edit.at - from) / span) * (slots - 1)))

  return Array.from({ length: slots }, (_, i) => {
    const here = edits.filter(e => at(e) === i)
    if (here.length === 0) return { glyph: '·', tone: 'idle' }

    const glyph = here.length === 1 ? '●' : here.length < 10 ? String(here.length) : '◉'
    const isLatest = here.some(e => e.id === latestId)
    const added = here.reduce((s, e) => s + e.added, 0)
    const removed = here.reduce((s, e) => s + e.removed, 0)

    return { glyph, tone: isLatest ? 'latest' : editTone(added, removed) }
  })
}

/**
 * The file map's block widths: each file's share of `width` by lines changed,
 * no block under `minWidth`, the widths summing to `width` (largest remainder).
 */
export const treemapWidths = (weights: readonly number[], width: number, minWidth: number): number[] => {
  if (weights.length === 0) return []
  const floor = Math.min(minWidth, Math.floor(width / weights.length))
  const spare = Math.max(0, width - floor * weights.length)
  const total = weights.reduce((s, w) => s + Math.max(w, 1), 0)
  const exact = weights.map(w => (Math.max(w, 1) / total) * spare)
  const base = exact.map(Math.floor)
  const left = spare - base.reduce((s, b) => s + b, 0)
  const order = exact.map((x, i) => ({ i, frac: x - Math.floor(x) })).sort((a, b) => b.frac - a.frac)
  const bonus = new Set(order.slice(0, left).map(o => o.i))

  return base.map((b, i) => floor + b + (bonus.has(i) ? 1 : 0))
}

/** A bar of `cells` blocks, filled in proportion to `value` of `max`, at least one when value > 0. */
export const changeBar = (value: number, max: number, cells: number): string => {
  const filled = max <= 0 || value <= 0 ? 0 : Math.max(1, Math.round((value / max) * cells))
  return '▰'.repeat(filled) + '▱'.repeat(Math.max(0, cells - filled))
}

/** "ora", "5 min fa", "2 h fa": coarse on purpose, the pane redraws only on change. */
export const relativeTime = (at: number, now: number): string => {
  const ago = Math.max(0, now - at)
  if (ago < MINUTE) return 'ora'
  if (ago < HOUR) return `${Math.floor(ago / MINUTE)} min fa`
  return `${Math.floor(ago / HOUR)} h fa`
}

/** Files grouped by worktree in first-touched order; files outside git share the `null` group. */
export const groupByRoot = (files: readonly ChangedFile[]): { root: string | null; files: ChangedFile[] }[] =>
  files.reduce<{ root: string | null; files: ChangedFile[] }[]>((groups, file) => {
    const group = groups.find(g => g.root === file.root)
    return group === undefined
      ? [...groups, { root: file.root, files: [file] }]
      : groups.map(g => (g === group ? { ...g, files: [...g.files, file] } : g))
  }, [])

/** A group's address in a key or a confirmation: its root, `-` for the files outside git. */
export const groupKey = (root: string | null): string => root ?? '-'

/** The files of the other groups: a group cleared, the rest kept as they were. */
export const withoutGroup = (files: readonly ChangedFile[], key: string): ChangedFile[] => files.filter(f => groupKey(f.root) !== key)

/** The opened or closed edits that still belong to a file shown. */
export const keptExpanded = (expanded: Readonly<Record<string, boolean>>, files: readonly ChangedFile[]): Record<string, boolean> => {
  const ids = new Set(files.flatMap(f => f.edits.map(e => e.id)))
  return Object.fromEntries(Object.entries(expanded).filter(([id]) => ids.has(id)))
}

/** Cuts a label to `width` cells with an ellipsis. */
export const fit = (text: string, width: number): string =>
  width <= 0 ? '' : text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`

/** Lines a file has changed over the session, the file map's weight. */
export const churn = (file: ChangedFile): number => file.edits.reduce((s, e) => s + e.added + e.removed, 0)
