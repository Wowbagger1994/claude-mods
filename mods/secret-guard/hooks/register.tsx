import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { Finding } from './detect'
import { describe, hasMask, maskDeep, maskText } from './detect'

const PLUGIN = 'secret-guard'
/** Tools that write text into files: a blotted-out secret must never be written back. */
const WRITING_TOOLS = new Set(['Edit', 'Write', 'NotebookEdit', 'MultiEdit'])
/** The fields of those tools that carry the text written; `old_string` only names what is replaced. */
const WRITTEN_FIELDS = ['new_string', 'content', 'new_source', 'edits'] as const

const counts = atom({ plugin: 'secret-guard', key: 'counts' } as const, {})

export const WRITE_DENIED =
  'Il testo contiene un segreto oscurato da secret-guard («[segreto oscurato: …]»): non si può scrivere nel file. ' +
  'Riscrivi la modifica senza toccare la parte con il segreto, ad esempio con un Edit più piccolo che la lasci com’è, ' +
  'oppure chiedi all’utente di inserire lui il valore.'

/** The text a writing tool would put in a file, all its fields together. */
const writtenText = (e: Record<string, unknown>): string =>
  WRITTEN_FIELDS.map(field => e[field])
    .filter(v => v !== undefined)
    .map(v => (typeof v === 'string' ? v : JSON.stringify(v)))
    .join('\n')

const plural = (n: number) => (n === 1 ? '1 segreto' : `${n} segreti`)

/** Counts what was blotted out, by label, and tells the user without ever showing a value. */
const report = async ($: EngineInterface, found: readonly Finding[], where: string) => {
  await update($, counts, c =>
    found.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.label]: (acc[f.label] ?? 0) + 1 }), c),
  )
  $.ui.toast(`🔒 Oscurato ${plural(found.length)} (${describe(found)}) ${where}`)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'segreti', description: 'Quanti segreti secret-guard ha oscurato in questa sessione, per tipo' })
    return next(e)
  })

  on('command.run', { command: 'segreti' }, async $ => {
    const c = await read($, counts)
    const lines = Object.entries(c).map(([label, n]) => `- ${label}: ${n}`)
    return {
      text:
        lines.length === 0
          ? 'secret-guard: nessun segreto oscurato in questa sessione.'
          : `secret-guard ha oscurato in questa sessione:\n${lines.join('\n')}`,
    }
  })

  // Every tool: what a tool hands back is masked before Claude reads it.
  on('tool.call', async ($, e, next) => {
    const input = e as unknown as Record<string, unknown>
    if (WRITING_TOOLS.has(e.tool) && hasMask(writtenText(input))) return { deny: WRITE_DENIED }

    const ran = await next(e)
    if (ran.deny !== undefined) return ran
    if (ran.isError === true) {
      const masked = maskText(ran.text ?? '')
      if (masked.found.length === 0) return ran
      await report($, masked.found, `nell’errore di ${e.tool}`)
      return { deny: masked.text }
    }
    const masked = maskDeep(ran.result)
    if (masked.found.length === 0) return ran
    await report($, masked.found, `nel risultato di ${e.tool}`)
    // A result of our own (no `ref`): core maps it for Claude and records it in place of the real one.
    return ran.context === undefined ? { result: masked.value } : { result: masked.value, context: ran.context }
  }).catch(($, e, next) => next(e))

  // The user's own words are theirs: only a warning, never a change.
  on('prompt.submit', async ($, e, next) => {
    const { found } = maskText(e.text)
    if (found.length > 0) $.ui.toast(`⚠ Il messaggio contiene ${plural(found.length)} (${describe(found)}): Claude lo leggerà.`)
    return next(e)
  }).catch(($, e, next) => {
    $.ui.log(`${PLUGIN}: controllo del messaggio non riuscito`, { to: 'debug' })
    return next(e)
  })
}
