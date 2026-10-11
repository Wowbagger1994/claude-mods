import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { DRAWIO_BIN } from './diagram'

const PANE_PROPS = {
  title: 'draw.io',
  isFocused: true,
  bodyColumns: 120,
  placement: 'dock' as const,
  scroll: { offset: 0, bodyRows: 50 },
  view: {},
}

const XML = [
  '<mxfile><diagram id="a"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>',
  '<mxCell id="api" value="API" style="rounded=1;fillColor=#dae8fc;" vertex="1" parent="1"><mxGeometry x="0" y="0" width="120" height="60" as="geometry"/></mxCell>',
  '<mxCell id="db" value="Database" style="rounded=1;" vertex="1" parent="1"><mxGeometry x="0" y="200" width="120" height="60" as="geometry"/></mxCell>',
  '<mxCell id="e" value="query" style="endArrow=classic;" edge="1" parent="1" source="api" target="db"><mxGeometry relative="1" as="geometry"/></mxCell>',
  '</root></mxGraphModel></diagram></mxfile>',
].join('')
const TWO_PAGES = '<mxfile><diagram id="a"><mxGraphModel/></diagram><diagram id="b"><mxGraphModel/></diagram></mxfile>'

type Fake = {
  files: Map<string, { text: string; mtimeMs: number }>
  /** Environment variables beyond HOME, as the engine has them. */
  env: Record<string, string>
  runs: string[][]
  logs: string[]
  isDrawioInstalled: boolean
  exportFails: boolean
  clock: ReturnType<typeof mock.clock>
}

/** Stands in for the machine beneath the plugin: files, draw.io, sips, the pane and the clock. */
const fakeMachine = (on: On, files: Record<string, string> = {}): Fake => {
  const fake: Fake = {
    files: new Map(Object.entries(files).map(([p, text]) => [p, { text, mtimeMs: 1 }])),
    env: {},
    runs: [],
    logs: [],
    isDrawioInstalled: true,
    exportFails: false,
    clock: mock.clock(on),
  }
  on('ui.open', () => ({ value: { isPlaced: true as const } }))
  on('ui.panes', () => ({
    value: [{ id: 'drawio-viewer', title: 'draw.io', isShown: true, isFocused: false, isPlaced: true, plugin: 'drawio-viewer' }],
  }))
  on('ui.log', (_$, e) => {
    fake.logs.push(e.text)
    return { value: undefined }
  })
  on('env.get', (_$, e) => ({ value: e.name === 'HOME' ? '/Users/test' : fake.env[e.name] }))
  on('command.register', () => ({ value: { command: 'drawio' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_$, e) => ({ value: e.path === DRAWIO_BIN ? fake.isDrawioInstalled : fake.files.has(e.path) }))
  on('fs.write', (_$, e) => {
    fake.files.set(e.path, { text: e.text, mtimeMs: fake.clock.now() })
    return { value: undefined }
  })
  on('fs.read', (_$, e) => ({ value: fake.files.get(e.path)?.text ?? '' }))
  on('fs.stat', (_$, e) => {
    const file = fake.files.get(e.path)
    if (file === undefined) return { deny: `ENOENT ${e.path}` }
    const realPath = e.path.startsWith('/') ? e.path : `/work/${e.path}`
    return { value: { kind: 'file' as const, size: file.text.length, mtimeMs: file.mtimeMs, isLink: false, realPath } }
  })
  on('process.run', (_$, e) => {
    fake.runs.push([...e.argv])
    const isExport = e.argv[0] === DRAWIO_BIN
    const isSips = e.argv[0] === 'sips'
    const failed = isExport && fake.exportFails
    return {
      value: {
        exitCode: failed ? 1 : 0,
        stdout: isSips ? 'x\n  pixelWidth: 800\n  pixelHeight: 400\n' : '',
        stderr: failed ? 'Error: export failed\n' : '',
        isStdoutTruncated: false,
        isStderrTruncated: false,
      },
    }
  })
  return fake
}

const mountPane = ($: Engine, surface: 'terminal' | 'desktop') =>
  $.ui.mount({ plugin: 'drawio-viewer', surface, component: 'Pane', requestId: 'drawio-viewer', props: PANE_PROPS })

/** Types `/drawio <args>` at the composer. */
const drawio = ($: Engine, args: string) =>
  $.command.run({
    command: 'drawio',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: true, columns: 160 },
  })

const exports = (fake: Fake) => fake.runs.filter(r => r[0] === DRAWIO_BIN)

test('/drawio on a file shows its PNG preview in the terminal', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  const answer = await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')
  const image = await ui.find({ type: 'Image' })

  expect(answer.text).toBe('Aperto /r/arch.drawio.')
  expect(exports(fake).length).toBe(1)
  expect(image?.props.source).toEqual({
    file: '/Users/test/Library/Caches/drawio-viewer/r_arch.drawio-p1.png',
    format: 'png',
    generation: fake.clock.now(),
  })
  // 800x400 is 2:1: the full 120 columns take 30 rows
  expect([image?.props.columns, image?.props.rows]).toEqual([120, 30])
})

test('a background session, where Claude Code draws no pictures, shows characters and the setting that fixes it', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  fake.env = { CLAUDE_CODE_SESSION_KIND: 'bg' }
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

  expect(await ui.find({ type: 'Image' })).toBe(undefined)
  expect(text).toContain('Database')
  expect(text).toContain('"CLAUDE_CODE_FORCE_TERMINAL_IMAGES": "1"')
  expect(await ui.find({ type: 'Button', key: 'toggle-view' })).toBe(undefined)
})

for (const [value, isShown] of [['1', true], ['0', false]] as const) {
  test(`a background session with CLAUDE_CODE_FORCE_TERMINAL_IMAGES=${value} ${isShown ? 'shows' : 'does not show'} the PNG`, async ($, on) => {
    const fake = fakeMachine(on, { '/r/arch.drawio': XML })
    fake.env = { CLAUDE_CODE_SESSION_KIND: 'bg', CLAUDE_CODE_FORCE_TERMINAL_IMAGES: value }
    await drawio($, '/r/arch.drawio')
    await fake.clock.settle()
    const ui = await mountPane($, 'terminal')

    expect((await ui.find({ type: 'Image' })) !== undefined).toBe(isShown)
  })
}

test('/drawio on a missing file writes an empty uncompressed diagram first', async ($, on) => {
  const fake = fakeMachine(on)
  const answer = await drawio($, 'docs/new.drawio')

  expect(answer.text).toContain('Creato docs/new.drawio')
  const written = [...fake.files.entries()].find(([path]) => path.endsWith('docs/new.drawio'))
  expect(written?.[1].text).toContain('<mxGraphModel')
})

test('/drawio refuses a path that is not .drawio', async ($, on) => {
  fakeMachine(on)
  const answer = await drawio($, 'notes.txt')

  expect(answer.text).toContain('non finisce in .drawio')
})

test('an edit by Claude to a .drawio re-exports it, and leaves other files alone', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML, '/r/app.js': 'const a = 1' })
  on('tool.call', { tool: 'Edit' }, () => ({ result: { filePath: '/r/arch.drawio' } }))

  await $.tool.call({ tool: 'Edit', file_path: '/r/arch.drawio', old_string: '<root/>', new_string: '<root></root>' })
  await fake.clock.settle()
  await $.tool.call({ tool: 'Edit', file_path: '/r/app.js', old_string: 'a', new_string: 'b' })
  await fake.clock.settle()

  expect(exports(fake).map(r => r[r.length - 1])).toEqual(['/r/arch.drawio'])
})

test('a save from outside is noticed while the pane is shown', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()

  fake.files.set('/r/arch.drawio', { text: XML, mtimeMs: fake.clock.now() + 10 })
  await $.session.start({ cwd: '/work', surface: 'terminal', isInteractive: true })
  await fake.clock.advance(2_500)

  expect(exports(fake).length).toBe(2)
})

test('without draw.io the pane says how to install it and exports nothing', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  fake.isDrawioInstalled = false
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')

  const texts = await ui.findAll({ type: 'Text', text: 'brew install --cask drawio' })
  expect(texts.some(t => t.props.bold === true)).toBe(true)
  expect(exports(fake).length).toBe(0)
})

test('a failed export shows draw.io’s error and Riprova exports again', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  fake.exportFails = true
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')

  expect((await ui.find({ type: 'Text', text: /Anteprima non riuscita/ }))?.text).toContain('Error: export failed')
  fake.exportFails = false
  await ui.press({ key: 'retry' })
  await fake.clock.settle()

  expect((await ui.find({ type: 'Image' }))?.type).toBe('Image')
})

test('a two-page diagram turns pages and exports the page shown', async ($, on) => {
  const fake = fakeMachine(on, { '/r/flows.drawio': TWO_PAGES })
  await drawio($, '/r/flows.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')

  expect((await ui.find({ type: 'Text', text: 'pagina 1/2' }))?.type).toBe('Text')
  await ui.press({ key: 'page-next' })
  await fake.clock.settle()

  expect((await ui.find({ type: 'Text', text: 'pagina 2/2' }))?.type).toBe('Text')
  expect(exports(fake).pop()?.slice(-5, -3)).toEqual(['--page-index', '2'])
})

test('the buttons open the file in VS Code and in draw.io', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')

  await ui.press({ key: 'open-editor' })
  await ui.press({ key: 'open-drawio' })

  expect(fake.runs.slice(-2)).toEqual([
    ['code', '/r/arch.drawio'],
    ['open', '-a', 'draw.io', '/r/arch.drawio'],
  ])
})

test('Anteprima grande opens the exported PNG in Preview', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')

  await ui.press({ key: 'open-preview' })

  expect(fake.runs[fake.runs.length - 1]).toEqual([
    'open',
    '-a',
    'Preview',
    '/Users/test/Library/Caches/drawio-viewer/r_arch.drawio-p1.png',
  ])
})

test('a compressed diagram is flagged', async ($, on) => {
  const fake = fakeMachine(on, { '/r/old.drawio': '<mxfile><diagram id="a">7VhNb9sw</diagram></mxfile>' })
  await drawio($, '/r/old.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')

  expect((await ui.find({ type: 'Text', text: /salvato compresso/ }))?.props.color).toBe('warning')
})

test('the desktop app, which has no terminal pictures, draws the diagram in characters', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'desktop')
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

  expect(await ui.find({ type: 'Image' })).toBe(undefined)
  expect(text).toContain('Database')
  expect(text).not.toContain('CLAUDE_CODE_FORCE_TERMINAL_IMAGES')
})

test('the i button swaps the picture for the drawing in characters, labels readable', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')
  await ui.press({ key: 'toggle-view' })
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

  expect(await ui.find({ type: 'Image' })).toBe(undefined)
  expect(text).toContain('API')
  expect(text).toContain('Database')
  expect(text).toContain('query')
  expect(text).toContain('▼')
  expect((await ui.find({ type: 'Button', key: 'toggle-view' }))?.props.label).toBe('Vista immagine')
})

test('the text view needs no draw.io: shown even when it is not installed', async ($, on) => {
  const fake = fakeMachine(on, { '/r/arch.drawio': XML })
  fake.isDrawioInstalled = false
  await drawio($, '/r/arch.drawio')
  await fake.clock.settle()
  const ui = await mountPane($, 'terminal')
  const text = (await ui.findAll({ type: 'Text' })).map(t => t.text).join('\n')

  expect(text).toContain('Database')
  expect(text).toContain('senza, il diagramma si vede solo a caratteri')
})

test('an empty pane explains the command', async $ => {
  const ui = await mountPane($, 'terminal')

  expect((await ui.find({ type: 'Text', text: /Usa \/drawio/ }))?.type).toBe('Text')
})
