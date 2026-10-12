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
/** An open to-do rewritten because the facts changed. */
export type TodoUpdate = NewTodo & { id: string }
/**
 * What the question brings back: to-dos to add, to close, to rewrite, and the
 * loose commands no longer worth keeping.
 */
export type TodoReply = { add: NewTodo[]; done: string[]; update: TodoUpdate[]; drop: string[] }

const NOTHING: TodoReply = { add: [], done: [], update: [], drop: [] }
/** The last answer goes in the question: the fork's transcript stops before it. Its tail, past this, is enough. */
const MAX_ANSWER = 8_000
const MAX_COMMAND_SHOWN = 300

export const openTodos = (todos: readonly Todo[]): Todo[] => todos.filter(t => t.closed === undefined)
export const closedTodos = (todos: readonly Todo[]): Todo[] =>
  todos.filter(t => t.closed !== undefined).sort((a, b) => (b.closed?.at ?? 0) - (a.closed?.at ?? 0))

/** A loose command as the question shows it: the ones of the last answer are not Claude's to drop. */
export type LooseCommand = { id: string; text: string; isLatest: boolean }

const todoLines = (t: Todo): string[] => [
  `- id=${t.id}: ${t.title}`,
  ...(t.detail === '' ? [] : [`  dettaglio: ${t.detail}`]),
  ...t.commands.map(c => `  comando: ${c.text.slice(0, MAX_COMMAND_SHOWN)}`),
]

/**
 * The question asked over the session's own transcript after each answer of
 * Claude's. The fork's transcript is the main thread's last request, which
 * holds no final answer yet: the answer comes in the question.
 */
export const buildTodoPrompt = (open: readonly Todo[], loose: readonly LooseCommand[], lastAnswer: string): string =>
  [
    'Domanda tecnica del pannello command-deck, non dell’utente: non usare strumenti, non rispondere all’utente.',
    'Il pannello deve rispecchiare il lavoro com’è ADESSO. Rileggi la conversazione e la tua ultima risposta,',
    'riportata in fondo: sopra non c’è ancora.',
    '1. «done»: gli id delle cose da fare già fatte (dall’utente o da te), superate, non più pertinenti,',
    '   o doppioni di un’altra (tieni la più completa). Resta aperta solo una cosa che chiede ancora un’azione all’utente.',
    '2. «update»: le cose aperte da riscrivere perché i fatti sono cambiati (passi o comandi nuovi):',
    '   {"id":"…","title":"…","detail":"…","commands":["…"]}.',
    '3. «add»: le cose che restano da fare ALL’UTENTE (non a te): prove dal vivo, comandi da eseguire, decisioni,',
    '   verifiche, avvisi da gestire (es. ruotare una chiave). Solo azioni concrete, non già nell’elenco.',
    '   Titolo breve all’imperativo (max 100 caratteri), «detail» 0-2 frasi, «commands» i comandi da terminale',
    '   copiati ALLA LETTERA dalle tue risposte ([] se nessuno).',
    '4. «drop»: gli id dei comandi sciolti che non servono più: già eseguiti (da te o dall’utente),',
    '   sostituiti da una versione nuova, legati a lavoro finito o ripresi in una cosa da fare.',
    'Rispondi SOLO con JSON: {"done":["<id>"],"update":[],"add":[],"drop":["<id>"]}.',
    '',
    'Cose da fare aperte:',
    ...(open.length === 0 ? ['(nessuna)'] : open.flatMap(todoLines)),
    '',
    'Comandi sciolti nel pannello:',
    ...(loose.length === 0 ? ['(nessuno)'] : loose.map(c => `- id=${c.id}${c.isLatest ? ' (ultima risposta)' : ''}: ${c.text.slice(0, MAX_COMMAND_SHOWN)}`)),
    '',
    'La tua ultima risposta:',
    '<<<',
    lastAnswer.slice(-MAX_ANSWER),
    '>>>',
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

const toUpdate = (raw: unknown, openIds: readonly string[]): TodoUpdate | null => {
  const todo = toNewTodo(raw)
  const id = (raw as Record<string, unknown> | null)?.id
  return todo !== null && typeof id === 'string' && openIds.includes(id) ? { ...todo, id } : null
}

const idsAmong = (value: unknown, known: readonly string[]): string[] =>
  (Array.isArray(value) ? value : []).filter((id): id is string => typeof id === 'string' && known.includes(id))

/**
 * Reads the reply's JSON: proposals kept when well formed; «done» and «update»
 * only of to-dos that are open, «drop» only of the commands Claude may drop.
 */
export const parseTodoReply = (text: string, openIds: readonly string[], droppableIds: readonly string[] = []): TodoReply => {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) return NOTHING
  try {
    const parsed: unknown = JSON.parse(text.slice(start, end + 1))
    if (typeof parsed !== 'object' || parsed === null) return NOTHING
    const { add, done, update, drop } = parsed as Record<string, unknown>
    const closing = idsAmong(done, openIds)
    return {
      add: (Array.isArray(add) ? add : []).map(toNewTodo).filter((t): t is NewTodo => t !== null).slice(0, MAX_ADDS_PER_REPLY),
      done: closing,
      // A to-do both closed and rewritten is closed.
      update: (Array.isArray(update) ? update : []).map(u => toUpdate(u, openIds)).filter((u): u is TodoUpdate => u !== null && !closing.includes(u.id)),
      drop: idsAmong(drop, droppableIds),
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

const checked = (texts: readonly string[]) => texts.map(text => ({ text, warnings: lint(text) }))

/** The list after a reply: the done ones closed by Claude, the changed ones rewritten, the new ones (not already open) added at the end. */
export const applyReply = (todos: readonly Todo[], reply: TodoReply, at: number): Todo[] => {
  const rewrite = new Map(reply.update.map(u => [u.id, u]))
  const closed = todos.map(t => {
    if (t.closed !== undefined) return t
    if (reply.done.includes(t.id)) return { ...t, closed: { by: 'claude' as const, at } }
    const u = rewrite.get(t.id)
    return u === undefined ? t : { ...t, title: u.title, detail: u.detail, commands: checked(u.commands) }
  })
  const fresh = reply.add
    .filter(n => !openTodos(closed).some(t => sameTitle(t.title, n.title)))
    .map((n, i): Todo => ({ id: `${at}-${i}`, title: n.title, detail: n.detail, commands: checked(n.commands), at }))
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
