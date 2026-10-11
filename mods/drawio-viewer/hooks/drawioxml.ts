import type { DiagramModel, DiagramEdge, DiagramVertex, VertexShape } from '../types'

type Attrs = Record<string, string>
type RawCell = { attrs: Attrs; body: string }

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'", nbsp: ' ' }

/** Decodes the XML entities draw.io writes in attribute values. */
const decodeEntities = (text: string): string =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code: string) => {
    if (code[0] === '#') {
      const n = code[1] === 'x' || code[1] === 'X' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10)
      return Number.isFinite(n) ? String.fromCodePoint(n) : whole
    }
    return ENTITIES[code.toLowerCase()] ?? whole
  })

const parseAttrs = (text: string): Attrs =>
  Object.fromEntries([...text.matchAll(/([\w:-]+)="([^"]*)"/g)].map(m => [m[1] ?? '', decodeEntities(m[2] ?? '')]))

/** A label as plain text: HTML line breaks kept as newlines, every other tag dropped. */
export const labelText = (value: string): string =>
  decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(div|p|li)>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .filter(line => line !== '')
    .join('\n')

/** Reads `key=value;flag;` into a map; a bare word (the shape, e.g. `ellipse`) maps to "1". */
export const parseStyle = (style: string): Attrs =>
  Object.fromEntries(
    style
      .split(';')
      .filter(Boolean)
      .map(part => {
        const at = part.indexOf('=')
        return at < 0 ? [part, '1'] : [part.slice(0, at), part.slice(at + 1)]
      }),
  )

/** The inside of each `<diagram>`: one string per page, in order. */
export const pagesOf = (xml: string): string[] =>
  [...xml.matchAll(/<diagram\b[^>]*>([\s\S]*?)<\/diagram>/g)].map(m => m[1] ?? '')

/** Every cell, a `<UserObject>`/`<object>` wrapper's id and label folded into its inner `<mxCell>`. */
const rawCells = (page: string): RawCell[] => {
  const wrapped: RawCell[] = []
  const rest = page.replace(/<(UserObject|object)\b([^>]*)>([\s\S]*?)<\/\1>/g, (_whole, _tag, outer: string, inner: string) => {
    const wrapper = parseAttrs(outer)
    const cell = /<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/.exec(inner)
    const attrs = { ...parseAttrs(cell?.[1] ?? ''), id: wrapper.id ?? '', value: wrapper.label ?? wrapper.value ?? '' }
    wrapped.push({ attrs, body: cell?.[2] ?? '' })
    return ''
  })
  const plain = [...rest.matchAll(/<mxCell\b([^>]*?)(?:\/>|>([\s\S]*?)<\/mxCell>)/g)].map(m => ({
    attrs: parseAttrs(m[1] ?? ''),
    body: m[2] ?? '',
  }))
  return [...plain, ...wrapped]
}

const num = (value: string | undefined): number => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

const color = (value: string | undefined): string | null =>
  value === undefined || value === 'none' || value === 'default' || value === '' ? null : value

const shapeOf = (style: Attrs): VertexShape => {
  if (style.text === '1' || style.shape === 'text') return 'text'
  if (style.ellipse === '1' || style.shape === 'ellipse') return 'ellipse'
  if (style.rhombus === '1' || style.shape === 'rhombus') return 'rhombus'
  return 'box'
}

const point = (body: string, as: string): { x: number; y: number } | null => {
  const tag = [...body.matchAll(/<mxPoint\b([^>]*)\/?>/g)].map(m => parseAttrs(m[1] ?? '')).find(a => a.as === as)
  return tag === undefined ? null : { x: num(tag.x), y: num(tag.y) }
}

/**
 * One page's vertices and edges, positions absolute (a group's children moved
 * by the group's corner), an edge's label children folded into its label.
 */
export const parseModel = (page: string): DiagramModel => {
  const cells = rawCells(page)
  const byId = new Map(cells.map(c => [c.attrs.id ?? '', c]))
  const edgeIds = new Set(cells.filter(c => c.attrs.edge === '1').map(c => c.attrs.id ?? ''))

  const corner = (id: string | undefined, depth = 0): { x: number; y: number } => {
    const cell = id === undefined ? undefined : byId.get(id)
    if (cell === undefined || cell.attrs.vertex !== '1' || depth > 20) return { x: 0, y: 0 }
    const geo = parseAttrs(/<mxGeometry\b([^>]*)/.exec(cell.body)?.[1] ?? '')
    const up = corner(cell.attrs.parent, depth + 1)
    return { x: up.x + num(geo.x), y: up.y + num(geo.y) }
  }

  const edgeLabels = new Map<string, string>()
  const vertices: DiagramVertex[] = cells
    .filter(c => c.attrs.vertex === '1')
    .flatMap(c => {
      const label = labelText(c.attrs.value ?? '')
      if (edgeIds.has(c.attrs.parent ?? '')) {
        if (label !== '') edgeLabels.set(c.attrs.parent ?? '', label)
        return []
      }
      const geo = parseAttrs(/<mxGeometry\b([^>]*)/.exec(c.body)?.[1] ?? '')
      const style = parseStyle(c.attrs.style ?? '')
      const at = corner(c.attrs.id)
      return [
        {
          id: c.attrs.id ?? '',
          label,
          x: at.x,
          y: at.y,
          width: Math.max(num(geo.width), 1),
          height: Math.max(num(geo.height), 1),
          shape: shapeOf(style),
          fill: color(style.fillColor),
          stroke: color(style.strokeColor),
          font: color(style.fontColor),
          isRounded: style.rounded === '1',
          isDashed: style.dashed === '1',
          hasBorder: style.strokeColor !== 'none',
        },
      ]
    })

  const edges: DiagramEdge[] = cells
    .filter(c => c.attrs.edge === '1')
    .map(c => {
      const style = parseStyle(c.attrs.style ?? '')
      const own = labelText(c.attrs.value ?? '')
      return {
        id: c.attrs.id ?? '',
        label: own !== '' ? own : (edgeLabels.get(c.attrs.id ?? '') ?? ''),
        source: c.attrs.source ?? null,
        target: c.attrs.target ?? null,
        sourcePoint: point(c.body, 'sourcePoint'),
        targetPoint: point(c.body, 'targetPoint'),
        stroke: color(style.strokeColor),
        isDashed: style.dashed === '1',
        hasArrow: style.endArrow !== 'none',
      }
    })

  return { vertices, edges }
}
