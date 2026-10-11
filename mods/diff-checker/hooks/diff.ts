import type { ChangedFile, FileEdit } from '../types'
import { countLines, marksOf, shiftMarks } from './marks'
import type { Hunk } from './marks'

/** Edits kept per file: older ones fall off so one drawing stays well under 100k chars. */
const MAX_EDITS_PER_FILE = 20
/** A single edit's diff is cut past this many characters. */
const MAX_DIFF_CHARS = 30_000
/** Files kept in the pane; the oldest touched falls off. */
const MAX_FILES = 40

/** What Edit and Write report back that the pane needs. */
export type EditRecord = {
  filePath: string
  isNew: boolean
  hunks: Hunk[]
  /** Lines in the file after the edit, when the result says enough to count them. */
  lineCount: number | null
}

/** The worktree a file lives in, as git reports it. */
export type RepoInfo = { root: string; branch: string | null }

const isHunk = (value: unknown): value is Hunk => {
  const h = value as Hunk
  return (
    typeof h === 'object' &&
    h !== null &&
    typeof h.oldStart === 'number' &&
    typeof h.oldLines === 'number' &&
    typeof h.newStart === 'number' &&
    typeof h.newLines === 'number' &&
    Array.isArray(h.lines) &&
    h.lines.every(line => typeof line === 'string')
  )
}

const signCount = (hunks: readonly Hunk[], sign: '+' | '-'): number =>
  hunks.reduce((sum, h) => sum + h.lines.filter(l => l.startsWith(sign)).length, 0)

const lineCountAfter = (r: Record<string, unknown>, hunks: readonly Hunk[]): number | null => {
  if (typeof r.content === 'string') return countLines(r.content)
  if (typeof r.originalFile === 'string') {
    return countLines(r.originalFile) + signCount(hunks, '+') - signCount(hunks, '-')
  }
  return null
}

/**
 * Reads an Edit or Write result into an EditRecord, or null when it holds
 * nothing to show (an error, a staged edit, a write that changed nothing).
 */
export const toEditRecord = (result: unknown): EditRecord | null => {
  const r = result as Record<string, unknown> | null
  if (typeof r !== 'object' || r === null || typeof r.filePath !== 'string') return null
  if (r.staged === true) return null

  const hunks = Array.isArray(r.structuredPatch) ? r.structuredPatch.filter(isHunk) : []
  if (hunks.length > 0) {
    return { filePath: r.filePath, isNew: r.type === 'create', hunks, lineCount: lineCountAfter(r, hunks) }
  }

  if (r.type === 'create' && typeof r.content === 'string') {
    const lines = r.content.replace(/\n$/, '').split('\n')
    const hunk = { oldStart: 0, oldLines: 0, newStart: 1, newLines: lines.length, lines: lines.map(l => `+${l}`) }
    return { filePath: r.filePath, isNew: true, hunks: [hunk], lineCount: lines.length }
  }

  return null
}

/** `Code` accepts tab and newline only: any other control character refuses the tree. */
const sanitize = (line: string): string =>
  // eslint-disable-next-line no-control-regex
  line.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')

const header = (h: Hunk): string => `@@ -${h.oldStart},${h.oldLines} +${h.newStart},${h.newLines} @@`

/** Turns one record into the unified diff `Code` draws, with its +/- counts. */
export const toFileEdit = (id: string, record: EditRecord, at: number): FileEdit => {
  const text = record.hunks.flatMap(h => [header(h), ...h.lines.map(sanitize)]).join('\n')

  return {
    id,
    diff: text.length > MAX_DIFF_CHARS ? cutAtHunk(text) : text,
    added: signCount(record.hunks, '+'),
    removed: signCount(record.hunks, '-'),
    at,
    explanation: null,
    explanationState: 'pending',
  }
}

/** Cuts a long diff at the last hunk boundary before the limit, so it still parses. */
const cutAtHunk = (text: string): string => {
  const cut = text.lastIndexOf('\n@@', MAX_DIFF_CHARS)
  return cut > 0 ? text.slice(0, cut) : text.slice(0, MAX_DIFF_CHARS)
}

/** Adds an edit to the list, moving its file to the end (most recent). Never mutates. */
export const addEdit = (
  files: readonly ChangedFile[],
  record: EditRecord,
  edit: FileEdit,
  repo: RepoInfo | null,
): ChangedFile[] => {
  const previous = files.find(f => f.path === record.filePath)
  const others = files.filter(f => f.path !== record.filePath)
  const edits = [...(previous?.edits ?? []), edit].slice(-MAX_EDITS_PER_FILE)
  const kept = new Set(edits.map(e => e.id))
  const marks = [...shiftMarks(previous?.marks ?? [], record.hunks), ...marksOf(edit.id, record.hunks)]
  const carried = previous?.lineCount == null ? null : previous.lineCount + edit.added - edit.removed

  const file: ChangedFile = {
    path: record.filePath,
    isNew: previous?.isNew ?? record.isNew,
    edits,
    lineCount: record.lineCount ?? carried,
    marks: marks.filter(m => kept.has(m.editId)),
    root: repo?.root ?? previous?.root ?? null,
    branch: repo?.branch ?? previous?.branch ?? null,
  }

  return [...others, file].slice(-MAX_FILES)
}

/** Replaces one edit wherever it is, through `fn`. Never mutates. */
export const mapEdit = (
  files: readonly ChangedFile[],
  id: string,
  fn: (edit: FileEdit) => FileEdit,
): ChangedFile[] =>
  files.map(file =>
    file.edits.some(e => e.id === id) ? { ...file, edits: file.edits.map(e => (e.id === id ? fn(e) : e)) } : file,
  )

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1) || path

/** The tab label: the file name, with its folder when two tabs of the group share a name. */
export const tabLabel = (path: string, group: readonly ChangedFile[]): string => {
  const parts = path.split('/')
  const name = baseName(path)
  const isShared = group.some(f => f.path !== path && baseName(f.path) === name)

  return isShared && parts.length > 1 ? `${parts[parts.length - 2]}/${name}` : name
}

/** The path as shown above the diff: inside its worktree when known, else with the home folder as ~. */
export const shortPath = (path: string, root: string | null = null): string =>
  root !== null && path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path.replace(/^\/Users\/[^/]+/, '~')

/** A worktree's short name: its folder's name. */
export const worktreeName = (root: string): string => baseName(root)
