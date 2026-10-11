import type { ElementTable } from 'claude-code'

import type { Diagram } from '../types'
import { diagramLabel, fitImage, INSTALL_HINT } from './diagram'
import { drawDiagram } from './textview'

/** Rows the pane keeps for its own lines around the picture. */
const CHROME_ROWS = 9
const MIN_IMAGE_ROWS = 8
const MAX_HOTKEYS = 9

export type Actions = {
  select: (path: string) => unknown
  turnPage: (diagram: Diagram, delta: number) => unknown
  refresh: (path: string) => unknown
  openInEditor: (path: string) => unknown
  openInDrawio: (path: string) => unknown
  openPreview: (png: string) => unknown
  toggleView: () => unknown
  close: (path: string) => unknown
}

export type ViewState = {
  diagrams: Diagram[]
  current: Diagram
  columns: number
  rows: number
  /** The drawing in characters instead of the PNG. */
  isTextView: boolean
  /** The surface draws pictures: the terminal does, the desktop app does not. */
  canShowImages: boolean
  /** A background session that Claude Code keeps from drawing pictures (see `areImagesBlocked`). */
  areImagesBlocked: boolean
}

const IMAGES_HINT =
  'Qui Claude Code spegne le immagini: per vedere il PNG aggiungi "CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1" in "env" di ~/.claude/settings.json e riavvia Claude.'

const tabs = (el: ElementTable, s: ViewState, act: Actions) => (
  <el.Box flexDirection="row" flexWrap="wrap" columnGap={1}>
    <el.Text bold color="claude">◆ draw.io</el.Text>
    {s.diagrams.map((d, i) => (
      <el.Button
        key={`tab:${d.path}`}
        label={`${d.path === s.current.path ? '●' : '◇'} ${diagramLabel(d.path)}`}
        hotkey={i < MAX_HOTKEYS ? String(i + 1) : undefined}
        variant={d.path === s.current.path ? 'primary' : undefined}
        dimColor={d.path !== s.current.path}
        onPress={() => act.select(d.path)}
      />
    ))}
  </el.Box>
)

const pageControls = (el: ElementTable, d: Diagram, act: Actions) =>
  d.pageCount > 1 && (
    <el.Box flexDirection="row" columnGap={1}>
      <el.Button key="page-prev" label="◀" plain hotkey="p" onPress={() => act.turnPage(d, -1)} />
      <el.Text dimColor>
        pagina {d.page}/{d.pageCount}
      </el.Text>
      <el.Button key="page-next" label="▶" plain hotkey="n" onPress={() => act.turnPage(d, 1)} />
    </el.Box>
  )

const statusLine = (el: ElementTable, d: Diagram, act: Actions) => {
  if (d.status === 'no-drawio') {
    return (
      <el.Box flexDirection="column">
        <el.Text color="warning">draw.io Desktop non è installato: senza, il diagramma si vede solo a caratteri, senza immagine né «Anteprima grande».</el.Text>
        <el.Text>
          <el.Text dimColor>Installalo con </el.Text>
          <el.Text bold>{INSTALL_HINT}</el.Text>
          <el.Text dimColor>, poi premi «Aggiorna».</el.Text>
        </el.Text>
      </el.Box>
    )
  }
  if (d.status === 'failed') {
    return (
      <el.Box flexDirection="row" columnGap={1}>
        <el.Text color="error">Anteprima non riuscita: {d.error ?? 'errore sconosciuto'}</el.Text>
        <el.Button key="retry" label="Riprova" plain onPress={() => act.refresh(d.path)} />
      </el.Box>
    )
  }
  if (d.status === 'exporting') return <el.Text dimColor italic>Disegno l’anteprima…</el.Text>
  return null
}

const textDrawing = (el: ElementTable, s: ViewState) => {
  // A diagram saved by version 0.1 has no model yet: shown as not read until its next refresh.
  const model = s.current.model ?? null
  if (model === null) {
    return s.current.isCompressed ? null : <el.Text dimColor italic>Leggo il diagramma…</el.Text>
  }
  const rows = drawDiagram(model, s.columns)
  if (rows.length === 0) return <el.Text dimColor>Pagina vuota: chiedi a Claude di disegnarci qualcosa.</el.Text>

  return (
    <el.Box key="drawing" flexDirection="column">
      {rows.map((row, r) => (
        <el.Text key={`row:${r}`} wrap="truncate-end">
          {row.length === 0
            ? ' '
            : row.map(span => (
                <el.Text color={span.fg} backgroundColor={span.bg} bold={span.bold} dimColor={span.dim}>
                  {span.text}
                </el.Text>
              ))}
        </el.Text>
      ))}
    </el.Box>
  )
}

const isPictureShown = (el: ElementTable, s: ViewState) =>
  !s.isTextView && s.canShowImages && !s.areImagesBlocked && s.current.preview !== null && 'Image' in el

const picture = (el: ElementTable, s: ViewState) => {
  const preview = s.current.preview
  if (preview === null || !('Image' in el)) return null
  const size = fitImage(preview.width, preview.height, s.columns, Math.max(MIN_IMAGE_ROWS, s.rows - CHROME_ROWS))

  return (
    <el.Image
      key="preview"
      source={{ file: preview.png, format: 'png', generation: preview.generation }}
      columns={size.columns}
      rows={size.rows}
      alt={`Diagramma ${diagramLabel(s.current.path)}, pagina ${s.current.page}`}
    />
  )
}

const actions = (el: ElementTable, d: Diagram, act: Actions, s: ViewState) => (
  <el.Box flexDirection="row" columnGap={2}>
    {d.preview !== null && (
      <el.Button key="open-preview" label="Anteprima grande" hotkey="g" variant="primary" onPress={() => act.openPreview(d.preview?.png ?? '')} />
    )}
    <el.Button key="open-editor" label="Modifica in VS Code" hotkey="v" onPress={() => act.openInEditor(d.path)} />
    {s.canShowImages && !s.areImagesBlocked && (
      <el.Button key="toggle-view" label={s.isTextView ? 'Vista immagine' : 'Vista a caratteri'} hotkey="i" plain dimColor onPress={act.toggleView} />
    )}
    <el.Button key="open-drawio" label="Apri in draw.io" hotkey="d" plain onPress={() => act.openInDrawio(d.path)} />
    <el.Button key="refresh" label="Aggiorna" hotkey="r" plain dimColor onPress={() => act.refresh(d.path)} />
    <el.Button key="close" label="Chiudi" hotkey="x" plain dimColor onPress={() => act.close(d.path)} />
  </el.Box>
)

/** The pane with at least one diagram. */
export const paneView = (el: ElementTable, s: ViewState, act: Actions) => {
  const d = s.current

  return (
    <el.Box flexDirection="column" gap={1}>
      {tabs(el, s, act)}
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Text bold>{d.path.replace(/^\/Users\/[^/]+/, '~')}</el.Text>
        {pageControls(el, d, act)}
      </el.Box>
      {d.isCompressed && (
        <el.Text color="warning">
          Diagramma salvato compresso: Claude non riesce a modificarlo bene. In draw.io togli «Compresso» da
          File › Proprietà e salva.
        </el.Text>
      )}
      {statusLine(el, d, act)}
      {isPictureShown(el, s) ? picture(el, s) : textDrawing(el, s)}
      {s.canShowImages && s.areImagesBlocked && <el.Text dimColor>{IMAGES_HINT}</el.Text>}
      {actions(el, d, act, s)}
      <el.Text dimColor>
        Per modificarlo chiedi a Claude (es. «aggiungi un nodo Database collegato all’API») o usa VS Code: l’anteprima
        si aggiorna da sola quando il file cambia.
      </el.Text>
    </el.Box>
  )
}

/** The pane before any diagram. */
export const emptyView = (el: ElementTable) => (
  <el.Box flexDirection="column">
    <el.Text bold color="claude">◆ draw.io</el.Text>
    <el.Text dimColor>Nessun diagramma aperto. Usa /drawio percorso/file.drawio: se il file non esiste lo crea vuoto.</el.Text>
  </el.Box>
)
