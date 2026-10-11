import type { ChangedFile, FileEdit } from '../types'
import { shortPath } from './diff'

/** Diff lines sent per edit: enough to recall it, short enough to keep the question small. */
const MAX_DIFF_LINES = 60
/** Edits explained in one question; the rest wait for the next turn. */
const MAX_EDITS_PER_ASK = 12
/** An explanation is cut past this many characters. */
const MAX_EXPLANATION_CHARS = 600

export type PendingEdit = { file: ChangedFile; edit: FileEdit }

/** Edits still waiting for an explanation, oldest first, at most one question's worth. */
export const pendingEdits = (files: readonly ChangedFile[]): PendingEdit[] =>
  files
    .flatMap(file => file.edits.filter(e => e.explanationState === 'pending').map(edit => ({ file, edit })))
    .sort((a, b) => a.edit.at - b.edit.at)
    .slice(0, MAX_EDITS_PER_ASK)

/** The one question asked over the session's own transcript. */
export const buildPrompt = (pending: readonly PendingEdit[]): string => {
  const blocks = pending.map(({ file, edit }) => {
    const diff = edit.diff.split('\n').slice(0, MAX_DIFF_LINES).join('\n')
    return `<edit id="${edit.id}" file="${shortPath(file.path, file.root)}">\n${diff}\n</edit>`
  })

  return [
    'Domanda tecnica del pannello diff-checker, non dell’utente: non usare strumenti.',
    'Per ognuna delle modifiche qui sotto, che hai fatto tu in questa sessione, spiega in italiano',
    'PERCHÉ l’hai fatta: lo scopo e il motivo, in 1-3 frasi. Non ripetere cosa cambia riga per riga.',
    'Puoi usare `codice` inline. Rispondi SOLO con un oggetto JSON: {"<id>": "<spiegazione>", ...}.',
    '',
    ...blocks,
  ].join('\n')
}

/** Reads the reply's JSON object into id → explanation, ignoring anything else it says. */
export const parseExplanations = (text: string, ids: readonly string[]): Map<string, string> => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return new Map()

  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (typeof parsed !== 'object' || parsed === null) return new Map()
    const entries = Object.entries(parsed as Record<string, unknown>)
      .filter((entry): entry is [string, string] => ids.includes(entry[0]) && typeof entry[1] === 'string')
      .map(([id, why]) => [id, why.trim().slice(0, MAX_EXPLANATION_CHARS)] as [string, string])
      .filter(([, why]) => why !== '')

    return new Map(entries)
  } catch {
    return new Map()
  }
}
