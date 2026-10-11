import type { ChangeKind, Mark } from '../types'

/** The hunk shape Edit and Write report in `structuredPatch`. */
export type Hunk = {
  oldStart: number
  oldLines: number
  newStart: number
  newLines: number
  lines: string[]
}

/** One run of changed lines inside a hunk, in the old file's and the new file's coordinates. */
type Op = {
  oldStart: number
  oldCount: number
  newStart: number
  newCount: number
}

/** Splits hunks into their runs of -/+ lines, context lines left out. */
export const toOps = (hunks: readonly Hunk[]): Op[] =>
  hunks.flatMap(hunk => {
    const ops: Op[] = []
    let oldLine = hunk.oldStart
    let newLine = hunk.newStart
    let open: Op | null = null

    for (const line of hunk.lines) {
      const sign = line[0]
      if (sign === '-' || sign === '+') {
        open = open ?? { oldStart: oldLine, oldCount: 0, newStart: newLine, newCount: 0 }
        if (sign === '-') {
          open = { ...open, oldCount: open.oldCount + 1 }
          oldLine += 1
        } else {
          open = { ...open, newCount: open.newCount + 1 }
          newLine += 1
        }
        continue
      }
      if (open !== null) ops.push(open)
      open = null
      oldLine += 1
      newLine += 1
    }
    if (open !== null) ops.push(open)

    return ops
  })

const kindOf = (op: Op): ChangeKind => (op.newCount === 0 ? 'removed' : op.oldCount === 0 ? 'added' : 'changed')

/** The marks one edit leaves, in the new file's lines. A removal marks the line it left off at. */
export const marksOf = (editId: string, hunks: readonly Hunk[]): Mark[] =>
  toOps(hunks).map(op => {
    const start = Math.max(1, op.newStart)
    const end = op.newCount === 0 ? start : start + op.newCount - 1

    return { editId, start, end, kind: kindOf(op) }
  })

const overlaps = (mark: Mark, op: Op): boolean =>
  op.oldCount > 0 && mark.start <= op.oldStart + op.oldCount - 1 && mark.end >= op.oldStart

/** True when the op sits wholly above the mark. A pure insertion goes in before old line `oldStart`. */
const isAbove = (op: Op, mark: Mark): boolean =>
  op.oldCount === 0 ? op.oldStart <= mark.start : op.oldStart + op.oldCount - 1 < mark.start

/**
 * Moves earlier marks to where a new edit leaves their lines: shifted by the
 * lines added or taken out above them, dropped when the edit rewrote them.
 */
export const shiftMarks = (marks: readonly Mark[], hunks: readonly Hunk[]): Mark[] => {
  const ops = toOps(hunks)

  return marks
    .filter(mark => !ops.some(op => overlaps(mark, op)))
    .map(mark => {
      const delta = ops
        .filter(op => isAbove(op, mark))
        .reduce((sum, op) => sum + op.newCount - op.oldCount, 0)

      return { ...mark, start: Math.max(1, mark.start + delta), end: Math.max(1, mark.end + delta) }
    })
}

/** Lines of a text, a final newline not counted as a line of its own. */
export const countLines = (text: string): number => (text === '' ? 0 : text.replace(/\n$/, '').split('\n').length)
