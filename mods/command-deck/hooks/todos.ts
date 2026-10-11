import type { ClosedBy, Todo } from '../types'
import { lint } from './extract'

/** Open to-dos kept: past this many the oldest drop, as stale. */
export const MAX_OPEN = 30
/** Closed to-dos kept for «Riapri». */
export const MAX_CLOSED = 20
const MAX_ADDS_PER_REPLY = 8
const MAX_COMMANDS_PER_TODO = 5
const MAX_TITLE = 120
const MAX_DETAIL = 400
const MAX_COMMAND = 2_000

/** A to-do as the reply proposes it, before it gets an id and a time. */
export type NewTodo = { title: string; detail: string; commands: string[] }
export type TodoReply = { add: NewTodo[]; done: string[] }

const NOTHING: TodoReply = { add: [], done: [] }

export const openTodos = (todos: readonly Todo[]): Todo[] => todos.filter(t => t.closed === undefined)
export const closedTodos = (todos: readonly Todo[]): Todo[] =>
  todos.filter(t => t.closed !== undefined).sort((a, b) => (b.closed?.at ?? 0) - (a.closed?.at ?? 0))

/** The question asked over the session's own transcript, after each answer of Claude's. */
export const buildTodoPrompt = (open: readonly Todo[]): string =>
  [
    'Domanda tecnica del pannello command-deck, non dell’utente: non usare strumenti, non rispondere all’utente.',
    'Rileggi la conversazione, soprattutto l’ultimo messaggio dell’utente e la tua ultima risposta.',
    '1. «add»: le cose che restano da fare ALL’UTENTE (non a te): prove da fare dal vivo, comandi da eseguire,',
    '   decisioni da prendere, verifiche, avvisi da gestire (es. ruotare una chiave). Solo azioni concrete e ancora aperte,',
    '   non già nell’elenco qui sotto, non le cose che hai fatto o farai tu. Titolo breve all’imperativo (max 100 caratteri),',
    '   «detail» 0-2 frasi, «commands» i comandi da terminale per farla copiati ALLA LETTERA dalle tue risposte ([] se nessuno).',
    '2. «done»: gli id dell’elenco qui sotto che dalla conversazione risultano fatti o non più necessari',
    '   (es. l’utente scrive che funziona, o tu li hai già risolti). Nel dubbio non chiuderli.',
    'Rispondi SOLO con JSON: {"add":[{"title":"…","detail":"…","commands":["…"]}],"done":["<id>"]}.',
    '',
    'Elenco attuale delle cose da fare:',
    ...(open.length === 0 ? ['(vuoto)'] : open.map(t => `- id=${t.id}: ${t.title}`)),
  ].join('\n')

const cut = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '')

const toNewTodo = (raw: unknown): NewTodo | null => {
  if (typeof raw !== 'object' || raw === null) return null
  const { title, detail, commands } = raw as Record<string, unknown>
  const name = cut(title, MAX_TITLE)
  if (name === '') return null
  const texts = Array.isArray(commands) ? commands.map(c => cut(c, MAX_COMMAND)).filter(c => c !== '') : []
  return { title: name, detail: cut(detail, MAX_DETAIL), commands: texts.slice(0, MAX_COMMANDS_PER_TODO) }
}

/** Reads the reply's JSON: proposals kept when well formed, «done» ids only of to-dos that are open. */
export const parseTodoReply = (text: string, openIds: readonly string[]): TodoReply => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return NOTHING
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (typeof parsed !== 'object' || parsed === null) return NOTHING
    const { add, done } = parsed as Record<string, unknown>
    return {
      add: (Array.isArray(add) ? add : []).map(toNewTodo).filter((t): t is NewTodo => t !== null).slice(0, MAX_ADDS_PER_REPLY),
      done: (Array.isArray(done) ? done : []).filter((id): id is string => typeof id === 'string' && openIds.includes(id)),
    }
  } catch {
    return NOTHING
  }
}

const sameTitle = (a: string, b: string) => a.toLowerCase().replace(/\s+/g, ' ') === b.toLowerCase().replace(/\s+/g, ' ')

const trim = (todos: readonly Todo[]): Todo[] => [
  ...openTodos(todos).slice(-MAX_OPEN),
  ...closedTodos(todos).slice(0, MAX_CLOSED),
]

/** The list after a reply: the done ones closed by Claude, the new ones (not already open) added at the end. */
export const applyReply = (todos: readonly Todo[], reply: TodoReply, at: number): Todo[] => {
  const closed = todos.map(t => (t.closed === undefined && reply.done.includes(t.id) ? { ...t, closed: { by: 'claude' as const, at } } : t))
  const fresh = reply.add
    .filter(n => !openTodos(closed).some(t => sameTitle(t.title, n.title)))
    .map((n, i): Todo => ({
      id: `${at}-${i}`,
      title: n.title,
      detail: n.detail,
      commands: n.commands.map(text => ({ text, warnings: lint(text) })),
      at,
    }))
  return trim([...closed, ...fresh])
}

/** A Bash call the classifier refused: the person runs it. */
export const deniedTodo = (command: string): NewTodo => ({
  // The command in the title keeps two refusals apart: equal titles count as one to-do.
  title: `Esegui tu: ${(command.split('\n')[0] ?? '').slice(0, 70)}`,
  detail: 'Claude non ha potuto lanciarlo: controllalo e incollalo nel terminale.',
  commands: [command],
})

export const closeTodo = (todos: readonly Todo[], id: string, by: ClosedBy, at: number): Todo[] =>
  trim(todos.map(t => (t.id === id && t.closed === undefined ? { ...t, closed: { by, at } } : t)))

export const reopenTodo = (todos: readonly Todo[], id: string): Todo[] =>
  trim(todos.map(t => (t.id === id ? { id: t.id, title: t.title, detail: t.detail, commands: t.commands, at: t.at } : t)))

/** One toast for what an answer left: the new to-dos and the new commands, when the pane is closed. */
export const readyText = (todoCount: number, commandCount: number): string | null => {
  const things = todoCount === 1 ? '1 cosa da fare' : `${todoCount} cose da fare`
  const cmds = commandCount === 1 ? '1 comando pronto da copiare' : `${commandCount} comandi pronti da copiare`
  if (todoCount > 0 && commandCount > 0) return `${things} e ${commandCount === 1 ? '1 comando' : `${commandCount} comandi`}: /command-deck`
  if (todoCount > 0) return `${things}: /command-deck`
  return commandCount > 0 ? `${cmds}: /command-deck` : null
}
