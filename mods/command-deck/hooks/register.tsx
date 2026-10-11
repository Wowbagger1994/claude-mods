import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { DeckCommand, Todo } from '../types'
import { addCommands, newTexts, toCommands } from './deck'
import { commandsIn } from './extract'
import { applyReply, buildTodoPrompt, closedTodos, closeTodo, deniedTodo, openTodos, parseTodoReply, readyText, reopenTodo } from './todos'
import type { Actions } from './view'
import { deckView } from './view'

/** How the auto-mode classifier words a refusal: "Permission for this action was denied by the Claude Code auto mode classifier." */
const CLASSIFIER_DENY = /auto mode classifier/i
const PLUGIN = 'command-deck'
const PANE = 'command-deck'
const TITLE = 'Da fare'

const commands = atom({ plugin: 'command-deck', key: 'commands' } as const, [])
const todos = atom({ plugin: 'command-deck', key: 'todos' } as const, [])
const isDoneShown = atom({ plugin: 'command-deck', key: 'isDoneShown' } as const, false)

/** A question about the last answer is out; a new answer meanwhile asks again once it is back. */
let isReading = false
let isReadAgain = false
/** Commands the answers added since the last toast: told together with the to-dos the question finds. */
let unannouncedCommands = 0

/** Why a copy did not reach the clipboard, in the person's words. */
const COPY_FAILURES: Record<'no-surface' | 'no-clipboard' | 'refused', string> = {
  'no-surface': 'nessun terminale collegato',
  'no-clipboard': 'questo terminale non dà accesso agli appunti',
  refused: 'copia rifiutata',
}

const isPaneShown = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE && p.isShown)

/** The status line: how much is left to do, nothing when nothing is. */
const showCount = async ($: EngineInterface) => {
  const open = openTodos(await read($, todos)).length
  $.ui.status(open === 0 ? undefined : `☐ ${open} da fare · /command-deck`)
}

const setTodos = async ($: EngineInterface, fn: (list: Todo[]) => Todo[]) => {
  await update($, todos, fn)
  await showCount($)
}

/** Puts the commands on top of the deck; answers how many of them are new. */
const remember = async ($: EngineInterface, fresh: DeckCommand[]): Promise<number> => {
  const added = newTexts(await read($, commands), fresh).length
  await update($, commands, d => addCommands(d, fresh))
  return added
}

const afterAnswer = async ($: EngineInterface, answer: string) => {
  const texts = commandsIn(answer)
  if (texts.length > 0) unannouncedCommands += await remember($, toCommands(texts, 'answer', await $.clock.now()))
}

const announce = async ($: EngineInterface, todoCount: number) => {
  const text = readyText(todoCount, unannouncedCommands)
  unannouncedCommands = 0
  if (text !== null && !(await isPaneShown($))) $.ui.toast(text)
}

/** Asks Claude, over this session's transcript, what is left for the person and what got done. */
const readTodos = async ($: EngineInterface) => {
  if (isReading) {
    isReadAgain = true
    return
  }
  isReading = true
  $.ui.invalidate('ui.render')
  let found = 0
  try {
    do {
      isReadAgain = false
      const before = openTodos(await read($, todos))
      const reply = await $.model.fork({ prompt: buildTodoPrompt(before) })
      if (!reply.isAnswered) continue
      const parsed = parseTodoReply(reply.text, before.map(t => t.id))
      const at = await $.clock.now()
      await setTodos($, list => applyReply(list, parsed, at))
      // New ones are those minted now: their ids start with this moment.
      found += openTodos(await read($, todos)).filter(t => t.at === at && !before.some(b => b.id === t.id)).length
    } while (isReadAgain)
  } catch (error) {
    $.ui.log(`${PLUGIN}: cose da fare non lette: ${String(error)}`, { to: 'debug' })
  } finally {
    isReading = false
    $.ui.invalidate('ui.render')
    // Whether the question worked or not, the commands found are told.
    await announce($, found).catch(() => undefined)
  }
}

/** A Bash call the permissions refused: the person runs it, so it becomes a to-do, shown. */
const afterDenied = async ($: EngineInterface, command: string) => {
  const at = await $.clock.now()
  await remember($, toCommands([command], 'denied', at))
  await setTodos($, list => applyReply(list, { add: [deniedTodo(command)], done: [] }, at))
  await $.ui.open({ id: PANE, title: TITLE })
  $.ui.toast('Comando negato: copialo da /command-deck ed eseguilo tu')
}

const actionsFor = ($: EngineInterface): Actions => ({
  copy: async (text, surface) => {
    const copied = await $.ui.copy({ text, surface })
    $.ui.toast(copied.isCopied ? 'Copiato' : `Non copiato: ${COPY_FAILURES[copied.reason]}`)
  },
  close: async t => {
    const at = await $.clock.now()
    await setTodos($, list => closeTodo(list, t.id, 'you', at))
  },
  reopen: t => setTodos($, list => reopenTodo(list, t.id)),
  toggleDone: () => update($, isDoneShown, shown => !shown),
  clearCommands: () => update($, commands, () => []),
})

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'command-deck', description: 'Quello che ti resta da fare e i comandi da copiare' })
    await showCount($)
    return next(e)
  })

  on('command.run', { command: 'command-deck' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE, focus: true })
    return { text: 'Pannello Da fare aperto: premi il numero per copiare un comando.' }
  })

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    // A subagent's or a fork's answer is not the person's: no commands, no to-dos (and no question about the question).
    if (e.agentId === undefined) {
      await afterAnswer($, e.answer).catch((error: unknown) =>
        $.ui.log(`${PLUGIN}: comandi non letti: ${String(error)}`, { to: 'debug' }),
      )
      // The question takes seconds: the turn ends now, the list follows.
      $.clock.after(0, () => void readTodos($))
    }
    return done
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const ran = await next(e)
    // Only the auto-mode classifier's refusals: a "No" the person pressed is theirs, not a command to hand back.
    if (ran.deny !== undefined && CLASSIFIER_DENY.test(ran.deny)) {
      await afterDenied($, e.command).catch((error: unknown) =>
        $.ui.log(`${PLUGIN}: comando negato non salvato: ${String(error)}`, { to: 'debug' }),
      )
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const list = await read($, todos)
    const open = openTodos(list)
    const underTodos = new Set(open.flatMap(t => t.commands.map(c => c.text)))
    return deckView(
      $.ui.resolve(e),
      {
        open,
        closed: closedTodos(list),
        commands: (await read($, commands)).filter(c => !underTodos.has(c.text)),
        isDoneShown: await read($, isDoneShown),
        isReading,
      },
      actionsFor($),
    )
  })
}
