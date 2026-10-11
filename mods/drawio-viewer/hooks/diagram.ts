import type { Diagram } from '../types'

/** draw.io Desktop's command line, as the brew cask installs it. */
export const DRAWIO_BIN = '/Applications/draw.io.app/Contents/MacOS/draw.io'
export const INSTALL_HINT = 'brew install --cask drawio'
/** Export at twice the size: the terminal scales down, a sharper picture. */
const EXPORT_SCALE = 2
const EXPORT_BORDER = 16
/** Most cells an Image may span either way. */
const MAX_CELLS = 255
/** A terminal cell is about twice as tall as it is wide. */
const CELL_ASPECT = 2

/** True for a file the pane previews: an uncompressed or compressed .drawio. */
export const isDrawioPath = (path: string): boolean => /\.drawio$/i.test(path)

/** Pages in a diagram file: one `<diagram>` element each, at least one. */
export const pageCount = (xml: string): number => Math.max(1, (xml.match(/<diagram[\s/>]/g) ?? []).length)

/** A diagram saved compressed keeps its pages as base64 text instead of `<mxGraphModel>` XML. */
export const isCompressed = (xml: string): boolean => /<diagram[\s/>]/.test(xml) && !/<mxGraphModel[\s/>]/.test(xml)

/** A safe file name for a diagram's preview: its path with every other character as `_`. */
export const previewName = (path: string, page: number): string =>
  `${path.replace(/^\/+/, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(-180)}-p${page}.png`

/** The argv that has draw.io write one page of a diagram as PNG. */
export const exportArgv = (path: string, page: number, out: string): string[] => [
  DRAWIO_BIN,
  '--export',
  '--format',
  'png',
  '--scale',
  String(EXPORT_SCALE),
  '--border',
  String(EXPORT_BORDER),
  '--page-index',
  String(page),
  '--output',
  out,
  path,
]

/** Reads `sips -g pixelWidth -g pixelHeight` into the PNG's size, or null. */
export const parseSips = (stdout: string): { width: number; height: number } | null => {
  const width = Number(/pixelWidth:\s*(\d+)/.exec(stdout)?.[1])
  const height = Number(/pixelHeight:\s*(\d+)/.exec(stdout)?.[1])
  return width > 0 && height > 0 ? { width, height } : null
}

/**
 * The cells a picture of `width`×`height` pixels spans to fit `columns`×`rows`
 * without distortion, cells being about twice as tall as wide.
 */
export const fitImage = (
  width: number,
  height: number,
  columns: number,
  rows: number,
): { columns: number; rows: number } => {
  const ratio = height / width / CELL_ASPECT
  const byWidth = Math.min(columns, MAX_CELLS)
  const byHeight = Math.floor(Math.min(rows, MAX_CELLS) / ratio)
  const cols = Math.max(1, Math.min(byWidth, byHeight))

  return { columns: cols, rows: Math.max(1, Math.min(MAX_CELLS, Math.round(cols * ratio))) }
}

/** An empty, uncompressed diagram: what `/drawio new.drawio` writes for a file that does not exist. */
export const EMPTY_DIAGRAM = [
  '<mxfile host="drawio-viewer">',
  '  <diagram id="page-1" name="Pagina 1">',
  '    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10" page="1" pageWidth="827" pageHeight="1169">',
  '      <root>',
  '        <mxCell id="0" />',
  '        <mxCell id="1" parent="0" />',
  '      </root>',
  '    </mxGraphModel>',
  '  </diagram>',
  '</mxfile>',
  '',
].join('\n')

/** A diagram not exported yet. */
export const newDiagram = (path: string): Diagram => ({
  path,
  page: 1,
  pageCount: 1,
  isCompressed: false,
  mtimeMs: 0,
  status: 'exporting',
  error: null,
  preview: null,
  model: null,
})

/** Adds or replaces a diagram by path, keeping the list's order. Never mutates. */
export const upsert = (list: readonly Diagram[], path: string, fn: (d: Diagram) => Diagram): Diagram[] =>
  list.some(d => d.path === path)
    ? list.map(d => (d.path === path ? fn(d) : d))
    : [...list, fn(newDiagram(path))]

/** The last line of a command's error output, short enough for the pane. */
export const lastLine = (text: string): string =>
  text.trim().split('\n').filter(Boolean).pop()?.slice(0, 200) ?? 'errore sconosciuto'

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1) || path

/** The tab label: the file name without `.drawio`. */
export const diagramLabel = (path: string): string => baseName(path).replace(/\.drawio$/i, '')
