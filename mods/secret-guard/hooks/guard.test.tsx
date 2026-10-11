import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { WRITE_DENIED } from './register'

const fakeToken = () => ['ya', '29.', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('')

type Fake = { toasts: string[]; written: string[] }

const fakeSession = (on: On): Fake => {
  const fake: Fake = { toasts: [], written: [] }
  on('ui.toast', (_$, e) => {
    fake.toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.log', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'segreti' } }))
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('prompt.submit', (_$, e) => ({ text: e.text }))
  on('tool.call', { tool: 'Bash' }, (_$, e) => ({
    result: { stdout: e.command === 'cat .env' ? `DB_HOST=x\nTOKEN_URL=${fakeToken()}\n` : 'ok\n', stderr: '', interrupted: false },
  }))
  on('tool.call', { tool: 'Write' }, (_$, e) => {
    fake.written.push(e.content)
    return { result: { type: 'create', filePath: e.file_path, content: e.content, structuredPatch: [], originalFile: null } }
  })
  return fake
}

const segreti = ($: Engine) =>
  $.command.run({ command: 'segreti', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } })

test('a token in a Bash result reaches Claude blotted out, with a toast that names its kind only', async ($, on) => {
  const fake = fakeSession(on)
  const ran = await $.tool.call({ tool: 'Bash', command: 'cat .env' })

  expect(ran.deny).toBe(undefined)
  expect((ran.result as { stdout: string }).stdout).toBe('DB_HOST=x\nTOKEN_URL=[segreto oscurato: token Google ya29.]\n')
  expect(JSON.stringify(ran)).not.toContain(fakeToken())
  expect(fake.toasts).toEqual(['🔒 Oscurato 1 segreto (token Google ya29.) nel risultato di Bash'])
  expect((await segreti($)).text).toContain('- token Google ya29.: 1')
})

test('a result with nothing to hide passes untouched and silent', async ($, on) => {
  const fake = fakeSession(on)
  const ran = await $.tool.call({ tool: 'Bash', command: 'ls' })

  expect((ran.result as { stdout: string }).stdout).toBe('ok\n')
  expect(fake.toasts).toEqual([])
  expect((await segreti($)).text).toContain('nessun segreto')
})

test('a Write carrying a blotted-out secret is refused before it reaches the file', async ($, on) => {
  const fake = fakeSession(on)
  const ran = await $.tool.call({ tool: 'Write', file_path: '/r/.env', content: 'TOKEN=[segreto oscurato: token Google ya29.]' })

  expect(ran.deny).toBe(WRITE_DENIED)
  expect(fake.written).toEqual([])
})

test('a Write without one goes through', async ($, on) => {
  const fake = fakeSession(on)
  await $.tool.call({ tool: 'Write', file_path: '/r/a.txt', content: 'ciao' })

  expect(fake.written).toEqual(['ciao'])
})

test('an error that prints a secret reaches Claude blotted out', async ($, on) => {
  fakeSession(on)
  on('tool.call', { tool: 'WebFetch' }, () => ({ isError: true as const, result: undefined, text: `401 for key ${fakeToken()}` }))
  const ran = await $.tool.call({ tool: 'WebFetch', url: 'https://example.com', prompt: 'x' })

  expect(ran.deny).toBe('401 for key [segreto oscurato: token Google ya29.]')
})

test('a secret the user types is left as is, with a warning', async ($, on) => {
  const fake = fakeSession(on)
  const text = `usa questo token: ${fakeToken()}`
  const sent = await $.prompt.submit({ text, wait: false, origin: { kind: 'composer' } })

  expect(sent.text).toBe(text)
  expect(fake.toasts).toEqual(['⚠ Il messaggio contiene 1 segreto (token Google ya29.): Claude lo leggerà.'])
})
