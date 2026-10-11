import type { DiagramModel, DiagramVertex } from '../types'

/** One run of characters drawn in one style. */
export type Span = { text: string; fg?: string; bg?: string; bold?: boolean; dim?: boolean }

type Cell = { ch: string; fg?: string; bg?: string; bold?: boolean; dim?: boolean; lines: number }
type Rect = { c0: number; r0: number; c1: number; r1: number }
type Pt = { c: number; r: number }

/** A terminal cell is about twice as tall as wide: rows take half the columns' scale. */
const ROW_SCALE = 0.5
const MAX_ROWS = 150
const MIN_BOX_COLS = 5
const MIN_BOX_ROWS = 3
/** Text on a coloured fill: dark, as draw.io draws it by default. */
const ON_FILL = '#1a1a1a'

const UP = 1
const DOWN = 2
const LEFT = 4
const RIGHT = 8
const LINE: Record<number, string> = {
  [UP]: '│', [DOWN]: '│', [UP | DOWN]: '│', [LEFT]: '─', [RIGHT]: '─', [LEFT | RIGHT]: '─',
  [DOWN | RIGHT]: '╭', [DOWN | LEFT]: '╮', [UP | RIGHT]: '╰', [UP | LEFT]: '╯',
  [UP | DOWN | RIGHT]: '├', [UP | DOWN | LEFT]: '┤', [DOWN | LEFT | RIGHT]: '┬', [UP | LEFT | RIGHT]: '┴',
  [UP | DOWN | LEFT | RIGHT]: '┼',
}
const DASHED: Record<string, string> = { '│': '┆', '─': '┄' }

const fit = (text: string, width: number): string =>
  width <= 0 ? '' : text.length <= width ? text : `${text.slice(0, Math.max(0, width - 1))}…`

/**
 * Draws a diagram page with box-drawing characters in at most `columns`
 * cells across: boxes at their scaled places with colours and labels,
 * connectors routed at right angles with an arrowhead and their label.
 */
export const drawDiagram = (model: DiagramModel, columns: number): Span[][] => {
  const shown = model.vertices
  if (shown.length === 0) return []

  const points = model.edges.flatMap(e => [e.sourcePoint, e.targetPoint]).filter(p => p !== null)
  const minX = Math.min(...shown.map(v => v.x), ...points.map(p => p.x))
  const minY = Math.min(...shown.map(v => v.y), ...points.map(p => p.y))
  const maxX = Math.max(...shown.map(v => v.x + v.width), ...points.map(p => p.x))
  const maxY = Math.max(...shown.map(v => v.y + v.height), ...points.map(p => p.y))
  const cols = Math.max(20, columns)
  const sx = (cols - 1) / Math.max(maxX - minX, 1)
  const sy = sx * ROW_SCALE
  const rows = Math.min(MAX_ROWS, Math.ceil((maxY - minY) * sy) + MIN_BOX_ROWS)
  const grid: Cell[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ ch: ' ', lines: 0 })))

  const inGrid = (p: Pt) => p.r >= 0 && p.r < rows && p.c >= 0 && p.c < cols
  const at = (p: Pt): Cell | undefined => (inGrid(p) ? grid[p.r]?.[p.c] : undefined)
  const toCell = (x: number, y: number): Pt => ({ c: Math.round((x - minX) * sx), r: Math.round((y - minY) * sy) })

  const rects = new Map<string, Rect>(
    shown.map(v => {
      const a = toCell(v.x, v.y)
      const b = toCell(v.x + v.width, v.y + v.height)
      return [v.id, { c0: a.c, r0: a.r, c1: Math.min(cols - 1, Math.max(b.c, a.c + MIN_BOX_COLS - 1)), r1: Math.min(rows - 1, Math.max(b.r, a.r + MIN_BOX_ROWS - 1)) }]
    }),
  )
  const isInBox = (p: Pt) => [...rects.values()].some(r => p.c >= r.c0 && p.c <= r.c1 && p.r >= r.r0 && p.r <= r.r1)

  // Connectors first: boxes drawn after them cover any line that crosses a box.
  const labels: { at: Pt; text: string }[] = []
  for (const edge of model.edges) {
    const route = routeEdge(edge.source === null ? null : (rects.get(edge.source) ?? null), edge.target === null ? null : (rects.get(edge.target) ?? null), edge.sourcePoint && toCell(edge.sourcePoint.x, edge.sourcePoint.y), edge.targetPoint && toCell(edge.targetPoint.x, edge.targetPoint.y))
    if (route === null) continue
    const style = { fg: edge.stroke ?? undefined, dim: edge.stroke === null }
    for (let i = 1; i < route.path.length; i += 1) link(at, route.path[i - 1], route.path[i], style)
    route.path.forEach(p => {
      const cell = at(p)
      if (cell === undefined) return
      const ch = LINE[cell.lines] ?? cell.ch
      cell.ch = edge.isDashed ? (DASHED[ch] ?? ch) : ch
    })
    const end = route.path[route.path.length - 1]
    const endCell = end && at(end)
    if (edge.hasArrow && endCell !== undefined) endCell.ch = route.arrow
    if (edge.label !== '') labels.push({ at: route.labelAt, text: edge.label.replace(/\n/g, ' ') })
  }

  for (const v of shown) drawVertex(grid, v, rects.get(v.id))

  for (const label of labels) {
    const text = ` ${label.text} `
    const start = Math.max(0, Math.min(cols - text.length, label.at.c - Math.floor(text.length / 2)))
    ;[...text].forEach((ch, i) => {
      const p = { c: start + i, r: label.at.r }
      const cell = at(p)
      if (cell !== undefined && !isInBox(p)) Object.assign(cell, { ch, fg: undefined, bg: undefined, dim: false, bold: false })
    })
  }

  return grid.map(toSpans)
}

const link = (at: (p: Pt) => Cell | undefined, a: Pt | undefined, b: Pt | undefined, style: { fg?: string; dim: boolean }) => {
  if (a === undefined || b === undefined) return
  const from = at(a)
  const to = at(b)
  const [out, back] = b.r > a.r ? [DOWN, UP] : b.r < a.r ? [UP, DOWN] : b.c > a.c ? [RIGHT, LEFT] : [LEFT, RIGHT]
  if (from !== undefined) Object.assign(from, { lines: from.lines | out, ...style })
  if (to !== undefined) Object.assign(to, { lines: to.lines | back, ...style })
}

const centre = (r: Rect): Pt => ({ c: Math.round((r.c0 + r.c1) / 2), r: Math.round((r.r0 + r.r1) / 2) })

/** Cells of a right-angled route from one box (or point) to another, its arrowhead and where its label goes. */
const routeEdge = (s: Rect | null, t: Rect | null, sp: Pt | null, tp: Pt | null): { path: Pt[]; arrow: string; labelAt: Pt } | null => {
  const a = s === null ? sp : centre(s)
  const b = t === null ? tp : centre(t)
  if (a === null || b === null) return null
  // As draw.io lays out top-down: one box wholly above the other goes out the bottom, in the top.
  const isStacked = s !== null && t !== null && (t.r0 > s.r1 || t.r1 < s.r0)
  const isSideBySide = s !== null && t !== null && (t.c0 > s.c1 || t.c1 < s.c0)
  const isVertical = isStacked || (!isSideBySide && Math.abs(b.r - a.r) * 2 >= Math.abs(b.c - a.c))

  if (isVertical) {
    const down = b.r >= a.r
    const start = { c: a.c, r: s === null ? a.r : down ? s.r1 + 1 : s.r0 - 1 }
    const end = { c: b.c, r: t === null ? b.r : down ? t.r0 - 1 : t.r1 + 1 }
    const mid = Math.round((start.r + end.r) / 2)
    return { path: orthogonal(start, end, mid, true), arrow: down ? '▼' : '▲', labelAt: { c: Math.round((start.c + end.c) / 2), r: mid } }
  }
  const right = b.c >= a.c
  const start = { c: s === null ? a.c : right ? s.c1 + 1 : s.c0 - 1, r: a.r }
  const end = { c: t === null ? b.c : right ? t.c0 - 1 : t.c1 + 1, r: b.r }
  const mid = Math.round((start.c + end.c) / 2)
  return { path: orthogonal(start, end, mid, false), arrow: right ? '▶' : '◀', labelAt: { c: mid, r: start.r === end.r ? start.r - 1 : Math.round((start.r + end.r) / 2) } }
}

/** start → bend at `mid` (a row when vertical, a column when not) → end, one cell per step. */
const orthogonal = (start: Pt, end: Pt, mid: number, isVertical: boolean): Pt[] => {
  const corners = isVertical
    ? [start, { c: start.c, r: mid }, { c: end.c, r: mid }, end]
    : [start, { c: mid, r: start.r }, { c: mid, r: end.r }, end]
  return corners.reduce<Pt[]>((path, corner, i) => {
    if (i === 0) return [corner]
    const from = path[path.length - 1] ?? corner
    const steps = Math.max(Math.abs(corner.c - from.c), Math.abs(corner.r - from.r))
    const dc = Math.sign(corner.c - from.c)
    const dr = Math.sign(corner.r - from.r)
    return [...path, ...Array.from({ length: steps }, (_, k) => ({ c: from.c + dc * (k + 1), r: from.r + dr * (k + 1) }))]
  }, [])
}

const drawVertex = (grid: Cell[][], v: DiagramVertex, r: Rect | undefined) => {
  if (r === undefined) return
  const isRound = v.isRounded || v.shape === 'ellipse'
  const [tl, tr, bl, br] = isRound ? ['╭', '╮', '╰', '╯'] : ['┌', '┐', '└', '┘']
  const h = v.isDashed ? '┄' : '─'
  const vert = v.isDashed ? '┆' : '│'
  const border = v.shape !== 'text' && v.hasBorder
  const fill = v.shape === 'text' ? undefined : (v.fill ?? undefined)

  for (let row = r.r0; row <= r.r1; row += 1) {
    for (let col = r.c0; col <= r.c1; col += 1) {
      const cell = grid[row]?.[col]
      if (cell === undefined) continue
      const isEdgeRow = row === r.r0 || row === r.r1
      const isEdgeCol = col === r.c0 || col === r.c1
      if (border && (isEdgeRow || isEdgeCol)) {
        const ch = row === r.r0 ? (col === r.c0 ? tl : col === r.c1 ? tr : h) : row === r.r1 ? (col === r.c0 ? bl : col === r.c1 ? br : h) : vert
        Object.assign(cell, { ch, fg: v.stroke ?? undefined, bg: undefined, dim: false, bold: false })
      } else {
        Object.assign(cell, { ch: ' ', fg: undefined, bg: fill, dim: false, bold: false })
      }
    }
  }

  const prefix = v.shape === 'rhombus' ? '◇ ' : ''
  const inner = Math.max(1, r.c1 - r.c0 - (border ? 1 : -1))
  const lines = `${prefix}${v.label}`.split('\n').filter(Boolean)
  const top = r.r0 + Math.max(border ? 1 : 0, Math.floor((r.r1 - r.r0 + 1 - lines.length) / 2))
  lines.forEach((line, i) => {
    const row = top + i
    if (row >= r.r1 + (border ? 0 : 1)) return
    const text = fit(line, inner)
    const start = r.c0 + Math.max(border ? 1 : 0, Math.floor((r.c1 - r.c0 + 1 - text.length) / 2))
    ;[...text].forEach((ch, k) => {
      const cell = grid[row]?.[start + k]
      if (cell !== undefined) Object.assign(cell, { ch, fg: v.font ?? (fill ? ON_FILL : undefined), bg: fill, bold: i === 0 })
    })
  })
}

const sameStyle = (a: Span, c: Cell) => a.fg === c.fg && a.bg === c.bg && Boolean(a.bold) === Boolean(c.bold) && Boolean(a.dim) === Boolean(c.dim)

/** A grid row as runs of one style, trailing blanks dropped. */
const toSpans = (row: Cell[]): Span[] => {
  const last = row.reduce((end, c, i) => (c.ch !== ' ' || c.bg !== undefined ? i : end), -1)
  return row.slice(0, last + 1).reduce<Span[]>((spans, c) => {
    const prev = spans[spans.length - 1]
    if (prev !== undefined && sameStyle(prev, c)) return [...spans.slice(0, -1), { ...prev, text: prev.text + c.ch }]
    return [...spans, { text: c.ch, fg: c.fg, bg: c.bg, bold: c.bold, dim: c.dim }]
  }, [])
}
