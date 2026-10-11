import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Diagram } from '../types'
import {
  DRAWIO_BIN,
  EMPTY_DIAGRAM,
  exportArgv,
  isCompressed,
  isDrawioPath,
  lastLine,
  pageCount,
  parseSips,
  previewName,
  upsert,
} from './diagram'
import { pagesOf, parseModel } from './drawioxml'
import type { Actions } from './view'
import { emptyView, paneView } from './view'

const PLUGIN = 'drawio-viewer'
const PANE = 'drawio-viewer'
const TITLE = 'draw.io'
/** How often an open pane looks for a save from VS Code or draw.io. */
const POLL_MS = 2_000
/** draw.io starts Electron for each export: the first can take a while. */
const EXPORT_TIMEOUT_MS = 60_000
const USAGE = 'Uso: /drawio percorso/file.drawio (se il file non esiste lo crea vuoto).'

const diagrams = atom({ plugin: 'drawio-viewer', key: 'diagrams' } as const, [])
const selected = atom({ plugin: 'drawio-viewer', key: 'selected' } as const, null)
const hasAutoOpened = atom({ plugin: 'drawio-viewer', key: 'hasAutoOpened' } as const, false)
const isTextView = atom({ plugin: 'drawio-viewer', key: 'isTextView' } as const, false)

/** Paths being exported now, so a poll and an edit never export one file twice at once. */
const exporting = new Set<string>()
/** Paths whose file changed while they were exporting: exported again once that ends. */
const again = new Set<string>()

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE })

const autoOpenOnce = async ($: EngineInterface) => {
  if (await read($, hasAutoOpened)) return
  await update($, hasAutoOpened, () => true)
  const opened = await openPane($)
  if (!opened.isPlaced) $.ui.toast('draw.io: allarga il terminale (144 colonne) o usa /drawio')
}

const setDiagram = ($: EngineInterface, path: string, fn: (d: Diagram) => Diagram) =>
  update($, diagrams, list => upsert(list, path, fn))

const cacheDir = async ($: EngineInterface): Promise<string> => {
  const home = (await $.env.get('HOME')) ?? '/tmp'
  const dir = `${home}/Library/Caches/drawio-viewer`
  await $.process.run(['mkdir', '-p', dir])
  return dir
}

/** Exports the diagram's page to PNG and records it; any failure is shown in the pane, never thrown. */
const exportOnce = async ($: EngineInterface, path: string) => {
  const { mtimeMs } = await $.fs.stat(path)
  const xml = await $.fs.read(path)
  const pages = pageCount(xml)
  const current = (await read($, diagrams)).find(d => d.path === path)
  const page = Math.min(current?.page ?? 1, pages)
  const compressed = isCompressed(xml)
  // The text view needs only the XML: it is ready before (and without) draw.io.
  const model = compressed ? null : parseModel(pagesOf(xml)[page - 1] ?? '')
  await setDiagram($, path, d => ({ ...d, page, pageCount: pages, isCompressed: compressed, mtimeMs, model, status: 'exporting' }))

  if (!(await $.fs.exists(DRAWIO_BIN))) {
    await setDiagram($, path, d => ({ ...d, status: 'no-drawio', error: null }))
    return
  }

  const out = `${await cacheDir($)}/${previewName(path, page)}`
  const ran = await $.process.run(exportArgv(path, page, out), { timeoutMs: EXPORT_TIMEOUT_MS })
  if (ran.exitCode !== 0) {
    await setDiagram($, path, d => ({ ...d, status: 'failed', error: lastLine(ran.stderr || ran.stdout) }))
    return
  }
  const size = parseSips((await $.process.run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', out])).stdout)
  if (size === null) {
    await setDiagram($, path, d => ({ ...d, status: 'failed', error: 'draw.io non ha scritto un PNG leggibile' }))
    return
  }
  const generation = await $.clock.now()
  await setDiagram($, path, d => ({ ...d, status: 'ready', error: null, preview: { png: out, ...size, generation } }))
}

/**
 * Claude Code draws no pictures in a background session (`claude --bg`, or
 * one it moved behind its pty host) unless CLAUDE_CODE_FORCE_TERMINAL_IMAGES
 * is set: Ghostty would show them, the engine just does not try.
 */
const areImagesBlocked = async ($: EngineInterface): Promise<boolean> => {
  const forced = (await $.env.get('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')) ?? ''
  const isForced = forced !== '' && forced !== '0' && forced.toLowerCase() !== 'false'
  return (await $.env.get('CLAUDE_CODE_SESSION_KIND')) === 'bg' && !isForced
}

const refresh = async ($: EngineInterface, path: string) => {
  if (exporting.has(path)) {
    again.add(path)
    return
  }
  exporting.add(path)
  try {
    do {
      again.delete(path)
      await exportOnce($, path)
    } while (again.has(path))
  } catch (error) {
    await setDiagram($, path, d => ({ ...d, status: 'failed', error: String(error) }))
  } finally {
    exporting.delete(path)
  }
}

/** While the pane is shown, re-exports a diagram saved from outside (VS Code, draw.io). */
const pollChanges = async ($: EngineInterface) => {
  try {
    const isShown = (await $.ui.panes()).some(p => p.id === PANE && p.isShown)
    if (!isShown) return
    for (const d of await read($, diagrams)) {
      if (exporting.has(d.path) || d.status === 'no-drawio') continue
      const { mtimeMs } = await $.fs.stat(d.path)
      if (mtimeMs > d.mtimeMs) await refresh($, d.path)
    }
  } catch (error) {
    $.ui.log(`${PLUGIN}: controllo dei file non riuscito: ${String(error)}`, { to: 'debug' })
  }
}

/** `/drawio file.drawio`: shows the file, writing an empty diagram first when it does not exist. */
const showFile = async ($: EngineInterface, arg: string): Promise<string> => {
  if (!isDrawioPath(arg)) return `${USAGE} «${arg}» non finisce in .drawio.`
  const isMissing = !(await $.fs.exists(arg))
  if (isMissing) await $.fs.write(arg, EMPTY_DIAGRAM)
  const path = (await $.fs.stat(arg, { resolve: true })).realPath ?? arg

  await setDiagram($, path, d => ({ ...d, status: 'exporting' }))
  await update($, selected, () => path)
  await openPane($)
  $.clock.after(0, () => void refresh($, path))

  return isMissing ? `Creato ${arg}, un diagramma vuoto: chiedi a Claude di disegnarci qualcosa.` : `Aperto ${arg}.`
}

type Ran = { deny?: string; isError?: true }

const actionsFor = ($: EngineInterface): Actions => ({
  select: path => update($, selected, () => path),
  turnPage: async (d, delta) => {
    const page = Math.min(d.pageCount, Math.max(1, d.page + delta))
    await setDiagram($, d.path, x => ({ ...x, page }))
    await refresh($, d.path)
  },
  refresh: path => refresh($, path),
  openInEditor: path => $.process.run(['code', path]),
  openInDrawio: path => $.process.run(['open', '-a', 'draw.io', path]),
  openPreview: png => $.process.run(['open', '-a', 'Preview', png]),
  toggleView: () => update($, isTextView, isText => !isText),
  close: async path => {
    await update($, diagrams, list => list.filter(d => d.path !== path))
    await update($, selected, () => null)
  },
})

// A diagram Claude edits is shown and re-exported once the edit has run.
const afterEdit = async ($: EngineInterface, path: string, ran: Ran) => {
  if (ran.deny !== undefined || ran.isError === true || !isDrawioPath(path)) return
  try {
    await setDiagram($, path, d => ({ ...d, status: 'exporting' }))
    await update($, selected, () => path)
    await autoOpenOnce($)
    // Exporting takes seconds: Claude gets the edit's answer now, the picture follows.
    $.clock.after(0, () => void refresh($, path))
  } catch (error) {
    $.ui.log(`${PLUGIN}: anteprima non aggiornata: ${String(error)}`, { to: 'debug' })
  }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'drawio',
      description: 'Mostra un diagramma draw.io nel pannello (lo crea se non esiste)',
      argumentHint: '<file.drawio>',
    })
    $.clock.every(POLL_MS, () => void pollChanges($))

    return next(e)
  })

  on('command.run', { command: 'drawio' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === '') {
      await openPane($)
      return { text: (await read($, diagrams)).length === 0 ? USAGE : 'Pannello draw.io aperto.' }
    }
    try {
      return { text: await showFile($, arg) }
    } catch (error) {
      return { text: `Non riesco ad aprire ${arg}: ${String(error)}` }
    }
  })

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    await afterEdit($, e.file_path, ran)
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    await afterEdit($, e.file_path, ran)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    const list = await read($, diagrams)
    const wanted = await read($, selected)
    const current = list.find(d => d.path === wanted) ?? list[list.length - 1]
    if (current === undefined) return emptyView(el)

    const columns = Math.max(20, e.props.bodyColumns)
    const rows = e.props.scroll.bodyRows
    const isText = await read($, isTextView)
    // Only the terminal paints cells; elsewhere the pane shows the drawing in characters.
    const canShowImages = e.surface === 'terminal'
    const blocked = await areImagesBlocked($)

    return paneView(
      el,
      { diagrams: list, current, columns, rows, isTextView: isText, canShowImages, areImagesBlocked: blocked },
      actionsFor($),
    )
  })
}
