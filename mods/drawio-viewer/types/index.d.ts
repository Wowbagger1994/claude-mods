/** A rendered page of a diagram: the PNG draw.io wrote and its size in pixels. */
export type Preview = {
  png: string
  width: number
  height: number
  /** Bumped on every export, so the terminal reads the same path again. */
  generation: number
}

export type VertexShape = 'box' | 'ellipse' | 'rhombus' | 'text'

/** A shape of the diagram, its position absolute in diagram pixels. */
export type DiagramVertex = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  shape: VertexShape
  fill: string | null
  stroke: string | null
  font: string | null
  isRounded: boolean
  isDashed: boolean
  hasBorder: boolean
}

/** A connector between two shapes, or between loose points. */
export type DiagramEdge = {
  id: string
  label: string
  source: string | null
  target: string | null
  sourcePoint: { x: number; y: number } | null
  targetPoint: { x: number; y: number } | null
  stroke: string | null
  isDashed: boolean
  hasArrow: boolean
}

/** One page of a diagram, read from its XML: what the text view draws. */
export type DiagramModel = { vertices: DiagramVertex[]; edges: DiagramEdge[] }

/** Where a diagram's preview stands. */
export type DiagramStatus = 'exporting' | 'ready' | 'failed' | 'no-drawio'

/** A .drawio file shown in the pane. */
export type Diagram = {
  path: string
  /** 1-based page shown. */
  page: number
  pageCount: number
  /** Saved compressed: draw.io reads it, Claude cannot edit it reliably. */
  isCompressed: boolean
  /** The file's mtime at the last export, to notice a save from outside. */
  mtimeMs: number
  status: DiagramStatus
  error: string | null
  preview: Preview | null
  /** The shown page read from the XML; null when compressed or unreadable. */
  model: DiagramModel | null
}

declare module 'claude-code' {
  interface PluginState {
    'drawio-viewer': {
      diagrams: Diagram[]
      selected: string | null
      hasAutoOpened: boolean
      /** The drawing from the XML in characters, instead of the PNG. */
      isTextView: boolean
    }
  }
}
