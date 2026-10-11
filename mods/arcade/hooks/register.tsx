import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { GameId } from '../types'
import { isGameId } from './games/catalog'
import { addWords, isSecretFile, wordsFrom } from './words'

const PLUGIN = 'arcade'
const PANE = 'arcade'
const TITLE = 'Arcade'
/** Claude working this long earns an invitation to play. */
const INVITE_AFTER_MS = 10_000
/** At most one invitation in this long: a reminder, not a nag. */
const INVITE_COOLDOWN_MS = 10 * 60_000
/** Room the pane gives the board below its own line. */
const MIN_BOARD_ROWS = 14

const best = atom({ plugin: 'arcade', key: 'best' } as const, {})
const isBusy = atom({ plugin: 'arcade', key: 'isBusy' } as const, false)
const doneCount = atom({ plugin: 'arcade', key: 'doneCount' } as const, 0)
const words = atom({ plugin: 'arcade', key: 'words' } as const, [])

/** The main conversation's turn in progress, so a fork's turns neither start nor end Claude's work. */
let activeTurn: string | null = null
let lastInviteAt = Number.NEGATIVE_INFINITY

const isPaneShown = async ($: EngineInterface) => (await $.ui.panes()).some(p => p.id === PANE && p.isShown)

/** Opens the pane and gives the board the keys. */
const openArcade = async ($: EngineInterface) => {
  const opened = await $.ui.open({ id: PANE, title: TITLE, focus: true })
  if (!opened.isPlaced) {
    $.ui.toast('Arcade: allarga il terminale per vedere il pannello')
    return
  }
  // Without the focus the keys stay with the prompt: a click on the board gives them.
  const isFocused = await $.ui
    .focus({ requestId: PANE, key: 'board' })
    .then(r => !('deny' in r && r.deny !== undefined))
    .catch((error: unknown) => {
      $.ui.log(`${PLUGIN}: focus non dato al gioco: ${String(error)}`, { to: 'debug' })
      return false
    })
  if (!isFocused) $.ui.toast('Arcade: clicca sul gioco per dargli i tasti')
}

const invite = async ($: EngineInterface, turnId: string) => {
  try {
    if (activeTurn !== turnId) return
    const now = await $.clock.now()
    if (now - lastInviteAt < INVITE_COOLDOWN_MS || (await isPaneShown($))) return
    lastInviteAt = now
    $.ui.toast('Claude ci mette un po’: /play per una partita (otto giochi, con i record)')
  } catch (error) {
    $.ui.log(`${PLUGIN}: invito non mostrato: ${String(error)}`, { to: 'debug' })
  }
}

/** Where the records outlive the session: `$.state` is the session's, `$.store` the machine's. */
const STORE_BEST = 'best'

/** What the store holds, as far as it is records: known games, finite scores. */
const savedBest = (raw: unknown): Partial<Record<GameId, number>> =>
  typeof raw !== 'object' || raw === null
    ? {}
    : Object.fromEntries(Object.entries(raw).filter(([g, s]) => isGameId(g) && typeof s === 'number' && Number.isFinite(s)))

/** The better of two sets of records, game by game. */
const bestOf = (a: Partial<Record<GameId, number>>, b: Partial<Record<GameId, number>>): Partial<Record<GameId, number>> =>
  Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map(g => [g, Math.max(a[g as GameId] ?? 0, b[g as GameId] ?? 0)]))

/** A board's message: `{ kind: 'score', game, score }` when a game ends; anything else is ignored. */
const recordScore = async ($: EngineInterface, data: unknown) => {
  if (typeof data !== 'object' || data === null) return
  const { kind, game, score } = data as Record<string, unknown>
  if (kind !== 'score' || !isGameId(game) || typeof score !== 'number' || !Number.isFinite(score)) return
  await update($, best, b => (score > (b[game] ?? 0) ? { ...b, [game]: score } : b))
  // Another session may have set a record meanwhile: the store keeps the better of both.
  await $.store.set(STORE_BEST, bestOf(savedBest(await $.store.get(STORE_BEST)), await read($, best)))
}

/** The names in what Claude just wrote join the typing game's words. */
const harvest = async ($: EngineInterface, path: string, code: string, ran: { deny?: string; isError?: true }) => {
  if (ran.deny !== undefined || ran.isError === true || isSecretFile(path)) return
  const fresh = wordsFrom(code)
  if (fresh.length > 0) await update($, words, pool => addWords(pool, fresh))
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'play', description: 'Otto giochi da fare mentre Claude lavora, con i record' })
    // A session that stopped mid-turn left this on: a new one starts idle.
    activeTurn = null
    await update($, isBusy, () => false)
    const saved = savedBest(await $.store.get(STORE_BEST))
    await update($, best, b => bestOf(b, saved))
    return next(e)
  })

  on('command.run', { command: 'play' }, async $ => {
    await openArcade($)
    return { text: 'Arcade aperto: Esc torna al prompt, ctrl+x tab al gioco.' }
  })

  on('turn.start', async ($, e, next) => {
    const started = await next(e)
    if (activeTurn === null) {
      activeTurn = e.turnId
      await update($, isBusy, () => true)
      $.clock.after(INVITE_AFTER_MS, () => void invite($, e.turnId))
    }
    return started
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    if (e.turnId === activeTurn) {
      activeTurn = null
      await update($, isBusy, () => false)
      await update($, doneCount, n => n + 1)
      if (await isPaneShown($)) $.ui.toast('Claude ha finito')
    }
    return done
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Edit' }, async ($, e, next) => {
    const ran = await next(e)
    await harvest($, e.file_path, e.new_string, ran)
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.call', { tool: 'Write' }, async ($, e, next) => {
    const ran = await next(e)
    await harvest($, e.file_path, e.content, ran)
    return ran
  }).catch(($, e, next) => next(e))

  on('ui.message', async ($, e) => {
    await recordScore($, e.data)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const el = $.ui.resolve(e)
    if (!('Client' in el)) return <el.Text dimColor>I giochi si giocano nel terminale.</el.Text>
    const props = {
      best: await read($, best),
      isBusy: await read($, isBusy),
      doneCount: await read($, doneCount),
      words: await read($, words),
      seed: Math.floor(await $.clock.now()),
    }
    return (
      <el.Client
        key="board"
        module="./board.tsx"
        props={props}
        width={e.props.bodyColumns}
        height={Math.max(MIN_BOARD_ROWS, e.props.scroll.bodyRows)}
      />
    )
  })
}
