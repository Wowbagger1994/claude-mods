import type { GameId } from '../types'
import { GAMES, gameOf } from './games/catalog'
import { directionOf, isSpace } from './games/keys'
import { indexOfMenuKey } from './menu'
import type { AnyGame } from './games/types'

/** What the hooks module hands the board: records, Claude's work, the words of the code it edits. */
export type BoardProps = {
  best: Partial<Record<GameId, number>>
  isBusy: boolean
  /** Bumped at each end of Claude's work: a change pauses a game in progress. */
  doneCount: number
  seed: number
  /** Names from the files Claude edited lately, for the typing game. */
  words: string[]
}

export type Size = { columns: number; rows: number }
export type Screen = 'menu' | 'playing' | 'paused' | 'over'

export type Play = {
  screen: Screen
  game: GameId
  /** The game highlighted in the menu. */
  cursor: number
  /** The game's own state, as its GameDef made it; null before the first game. */
  state: unknown
  /** Milliseconds since the game ended: a key pressed in panic right then does not restart it. */
  overFor: number
  pausedBy: 'you' | 'claude' | null
  /** The `doneCount` already seen. */
  seenDone: number
  /** Games started, to seed each one differently. */
  started: number
  isRecord: boolean
}

/** A game that just ended, for the hooks module to keep the record. */
export type Score = { game: GameId; score: number }
export type Step = { play: Play; score: Score | null }

const RESTART_GUARD_MS = 600
/** Rows of the board's region taken by Claude's line, the score line and the help line. */
export const CHROME_ROWS = 3

export { GAMES }

export const newPlay = (props: BoardProps): Play => ({
  screen: 'menu',
  game: GAMES[0]!.id,
  cursor: 0,
  state: null,
  overFor: 0,
  pausedBy: null,
  seenDone: props.doneCount,
  started: 0,
  isRecord: false,
})

const defOf = (p: Play): AnyGame => gameOf(p.game)

export const scoreOf = (p: Play): number => (p.state === null ? 0 : defOf(p).score(p.state))

export const statusOf = (p: Play): string => (p.state === null ? '' : (defOf(p).status?.(p.state) ?? ''))

export const drawOf = (p: Play) => (p.state === null ? [] : defOf(p).draw(p.state))

const start = (p: Play, game: GameId, props: BoardProps, size: Size): Play => ({
  ...p,
  screen: 'playing',
  game,
  state: gameOf(game).create({
    columns: size.columns,
    rows: Math.max(1, size.rows - CHROME_ROWS),
    rng: { seed: (props.seed + p.started * 7919) | 0 },
    words: props.words,
  }),
  overFor: 0,
  pausedBy: null,
  started: p.started + 1,
  isRecord: false,
})

/** The game's new state: when it just ended, the over screen and the score to record. */
const settle = (p: Play, state: unknown, props: BoardProps): Step => {
  const next = { ...p, state }
  if (!defOf(p).isOver(state)) return { play: next, score: null }
  const score = defOf(p).score(state)
  return { play: { ...next, screen: 'over', isRecord: score > (props.best[p.game] ?? 0) }, score: { game: p.game, score } }
}

/** The key that pauses: Tab in a typing game, whose letters are moves; `p` elsewhere. */
export const pauseKeyOf = (game: AnyGame): string => (game.isTyping === true ? 'tab' : 'p')

const isGo = (key: string) => key === 'return' || isSpace(key)
const none = (play: Play): Step => ({ play, score: null })

const menuKey = (p: Play, key: string, props: BoardProps, size: Size): Step => {
  const picked = indexOfMenuKey(key, GAMES.length)
  if (picked >= 0) return none(start(p, GAMES[picked]!.id, props, size))
  const dir = directionOf(key)
  if (dir === 'up' || dir === 'down') {
    return none({ ...p, cursor: (p.cursor + (dir === 'up' ? GAMES.length - 1 : 1)) % GAMES.length })
  }
  return isGo(key) ? none(start(p, GAMES[p.cursor]!.id, props, size)) : none(p)
}

/** A key pressed while the board has the focus. */
export const onKey = (p: Play, key: string, props: BoardProps, size: Size): Step => {
  const def = defOf(p)
  switch (p.screen) {
    case 'menu':
      return menuKey(p, key, props, size)
    case 'playing':
      if (key === pauseKeyOf(def)) return none({ ...p, screen: 'paused', pausedBy: 'you' })
      return settle(p, def.key(p.state, key), props)
    case 'paused':
      if (key === 'm') return none({ ...p, screen: 'menu', pausedBy: null })
      return isGo(key) || key === pauseKeyOf(def) ? none({ ...p, screen: 'playing', pausedBy: null }) : none(p)
    case 'over':
      if (key === 'm') return none({ ...p, screen: 'menu' })
      return isGo(key) && p.overFor >= RESTART_GUARD_MS ? none(start(p, p.game, props, size)) : none(p)
  }
}

/** `ms` of the frame clock: a game with a clock moves, one without waits for keys. */
export const onTick = (p: Play, ms: number, props: BoardProps): Step => {
  if (p.screen === 'over') return none({ ...p, overFor: p.overFor + ms })
  const tick = defOf(p).tick
  if (p.screen !== 'playing' || tick === undefined) return none(p)
  return settle(p, tick(p.state, ms), props)
}

/** New props: Claude finishing its work pauses a game in progress. */
export const onProps = (p: Play, props: BoardProps): Play => {
  if (props.doneCount === p.seenDone) return p
  return p.screen === 'playing'
    ? { ...p, screen: 'paused', pausedBy: 'claude', seenDone: props.doneCount }
    : { ...p, seenDone: props.doneCount }
}

/** True while a tick changes something: the board redraws on each tick only then. */
export const isMoving = (p: Play): boolean =>
  (p.screen === 'playing' && defOf(p).tick !== undefined) || (p.screen === 'over' && p.overFor < RESTART_GUARD_MS)
