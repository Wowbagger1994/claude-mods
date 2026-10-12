import { describe, expect, test } from 'claude-code/testing'

import type { Todo } from '../types'
import type { TodoReply } from './todos'
import { applyReply, buildTodoPrompt, closedTodos, closeTodo, deniedTodo, MAX_OPEN, openTodos, parseTodoReply, readyText, reopenTodo } from './todos'

const todo = (id: string, title: string, closed?: Todo['closed']): Todo => ({ id, title, detail: '', commands: [], at: 1, ...(closed ? { closed } : {}) })
const reply = (over: Partial<TodoReply>): TodoReply => ({ add: [], done: [], update: [], drop: [], ...over })

describe('parseTodoReply', () => {
  test('reads the JSON among other words, and keeps only well-formed to-dos', () => {
    const text = `Ecco: {"add":[{"title":"Prova /play","detail":"Apri il pannello","commands":["ls -la"]},{"title":""},{"detail":"senza titolo"},42],"done":["a"]} fine`

    expect(parseTodoReply(text, ['a'])).toEqual(reply({ add: [{ title: 'Prova /play', detail: 'Apri il pannello', commands: ['ls -la'] }], done: ['a'] }))
  })

  test('closes only to-dos that are open, and gives nothing for a reply that is not JSON', () => {
    expect(parseTodoReply('{"add":[],"done":["a","inventato",7]}', ['a']).done).toEqual(['a'])
    expect(parseTodoReply('non so', ['a'])).toEqual(reply({}))
    expect(parseTodoReply('{rotto', ['a'])).toEqual(reply({}))
  })

  test('rewrites only open to-dos, and one closed in the same reply stays closed', () => {
    const text = JSON.stringify({
      done: ['b'],
      update: [{ id: 'a', title: 'Prova di nuovo', detail: 'Dopo il riavvio', commands: ['ls'] }, { id: 'b', title: 'Due' }, { id: 'x', title: 'Inventata' }, { title: 'Senza id' }],
    })

    expect(parseTodoReply(text, ['a', 'b']).update).toEqual([{ id: 'a', title: 'Prova di nuovo', detail: 'Dopo il riavvio', commands: ['ls'] }])
  })

  test('drops only the loose commands it may drop', () => {
    expect(parseTodoReply('{"drop":["c1","c2","inventato",3]}', [], ['c1']).drop).toEqual(['c1'])
    expect(parseTodoReply('{"drop":["c1"]}', []).drop).toEqual([])
  })

  test('cuts long titles and keeps at most five commands each', () => {
    const reply = parseTodoReply(JSON.stringify({ add: [{ title: 'x'.repeat(300), commands: Array.from({ length: 9 }, (_, i) => `echo ${i}`) }] }), [])

    expect(reply.add[0]?.title).toHaveLength(120)
    expect(reply.add[0]?.commands).toHaveLength(5)
  })
})

describe('applyReply', () => {
  test('adds new to-dos with their commands checked, after the open ones', () => {
    const list = applyReply([todo('a', 'Riavvia Claude')], reply({ add: [{ title: 'Prova ssh', detail: '', commands: ["ssh x@y 'ls'"] }], done: [] }), 5)

    expect(openTodos(list).map(t => t.title)).toEqual(['Riavvia Claude', 'Prova ssh'])
    expect(list[1]?.commands[0]?.warnings[0]).toContain('ssh senza -t')
  })

  test('does not add one already open, whatever its case or spacing', () => {
    const list = applyReply([todo('a', 'Riavvia Claude')], reply({ add: [{ title: 'riavvia   claude', detail: '', commands: [] }], done: [] }), 5)

    expect(list).toHaveLength(1)
  })

  test('closes the ones Claude says are done, as closed by Claude', () => {
    const list = applyReply([todo('a', 'Uno'), todo('b', 'Due')], reply({ add: [], done: ['b'] }), 9)

    expect(openTodos(list).map(t => t.id)).toEqual(['a'])
    expect(closedTodos(list)[0]?.closed).toEqual({ by: 'claude', at: 9 })
  })

  test('rewrites an open one with its commands checked again, keeping its id and time', () => {
    const list = applyReply([todo('a', 'Uno')], reply({ update: [{ id: 'a', title: 'Uno, di nuovo', detail: 'ora', commands: ["ssh x@y 'ls'"] }] }), 9)

    expect(list[0]).toMatchObject({ id: 'a', at: 1, title: 'Uno, di nuovo', detail: 'ora' })
    expect(list[0]?.commands[0]?.warnings[0]).toContain('ssh senza -t')
  })

  test('one you closed stays yours even if Claude names it done again', () => {
    const list = applyReply([todo('a', 'Uno', { by: 'you', at: 2 })], reply({ add: [], done: ['a'] }), 9)

    expect(list[0]?.closed).toEqual({ by: 'you', at: 2 })
  })

  test('keeps at most MAX_OPEN open ones, dropping the oldest', () => {
    const many = Array.from({ length: MAX_OPEN }, (_, i) => todo(`t${i}`, `cosa ${i}`))
    const list = applyReply(many, reply({ add: [{ title: 'nuova', detail: '', commands: [] }], done: [] }), 5)

    expect(openTodos(list)).toHaveLength(MAX_OPEN)
    expect(openTodos(list)[0]?.id).toBe('t1')
  })
})

describe('closing and reopening', () => {
  test('Fatto closes as yours, Riapri brings it back open', () => {
    const closed = closeTodo([todo('a', 'Uno')], 'a', 'you', 3)
    const reopened = reopenTodo(closed, 'a')

    expect(closed[0]?.closed).toEqual({ by: 'you', at: 3 })
    expect(openTodos(reopened).map(t => t.id)).toEqual(['a'])
    expect(reopened[0]).not.toHaveProperty('closed')
  })

  test('the closed ones list newest closed first', () => {
    const list = [todo('a', 'A', { by: 'you', at: 1 }), todo('b', 'B', { by: 'claude', at: 5 })]

    expect(closedTodos(list).map(t => t.id)).toEqual(['b', 'a'])
  })
})

describe('texts', () => {
  test('the question shows each open to-do whole, the loose commands, and the last answer, which the fork does not see', () => {
    const open: Todo = { ...todo('t1', 'Riavvia Claude'), detail: 'Poi /reload-plugins', commands: [{ text: 'claude --continue', warnings: [] }] }
    const asked = buildTodoPrompt([open], [{ id: 'c1', text: 'git status', isLatest: false }, { id: 'c2', text: 'ls', isLatest: true }], 'Ho finito: riavvia.')

    expect(asked).toContain('- id=t1: Riavvia Claude\n  dettaglio: Poi /reload-plugins\n  comando: claude --continue')
    expect(asked).toContain('- id=c1: git status\n- id=c2 (ultima risposta): ls')
    expect(asked).toContain('<<<\nHo finito: riavvia.\n>>>')
    expect(buildTodoPrompt([], [], '')).toContain('Cose da fare aperte:\n(nessuna)')
    expect(buildTodoPrompt([], [], '')).toContain('Comandi sciolti nel pannello:\n(nessuno)')
  })

  test('a long last answer goes in by its tail', () => {
    const asked = buildTodoPrompt([], [], `${'a'.repeat(9_000)}FINE`)

    expect(asked).toContain('aFINE\n>>>')
    expect(asked).not.toContain('a'.repeat(8_001))
  })

  test('a refused command is a to-do of its own, titled by its first line', () => {
    expect(deniedTodo('git push origin main\n# poi')).toMatchObject({ title: 'Esegui tu: git push origin main', commands: ['git push origin main\n# poi'] })
  })

  test('one toast tells the new to-dos and the new commands together', () => {
    expect(readyText(2, 3)).toBe('2 cose da fare e 3 comandi: /command-deck')
    expect(readyText(1, 0)).toBe('1 cosa da fare: /command-deck')
    expect(readyText(0, 1)).toBe('1 comando pronto da copiare: /command-deck')
    expect(readyText(0, 0)).toBe(null)
  })
})
