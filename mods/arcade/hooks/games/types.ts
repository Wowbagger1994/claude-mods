import type { GameId } from '../../types'
import type { Rng } from './rng'

/** A run of text drawn alike: what one `Text` draws. */
export type Span = { text: string; fg?: string; bg?: string; bold?: boolean }
export type Row = Span[]

/** What a game starts from: the room it has, a random source, the words of the code Claude is editing. */
export type GameContext = {
  /** Cells across the board may use. */
  columns: number
  /** Rows the board may use, below the score line and above the help line. */
  rows: number
  rng: Rng
  /** Names from the files Claude edited lately, most recent first; may be empty. */
  words: readonly string[]
}

/**
 * One game of the arcade: plain functions over its own state, never mutated.
 * The arcade owns the menu, pause, record and game-over screens; the game
 * only plays.
 */
export type GameDef<S> = {
  id: GameId
  name: string
  /** One line of help shown under the board. */
  keys: string
  /**
   * The game reads letters as moves (typing): the arcade then pauses on Tab
   * and leaves `p` and `m` to the game.
   */
  isTyping?: boolean
  create: (ctx: GameContext) => S
  /** A key: a special key's name (`up`, `return`, `tab`, `backspace`…) or the character typed (`" "` for space). */
  key: (state: S, key: string) => S
  /** Time passing, in ms; absent for a game that moves on keys only. */
  tick?: (state: S, ms: number) => S
  isOver: (state: S) => boolean
  score: (state: S) => number
  draw: (state: S) => Row[]
  /** A word or two beside the score (`livello 3`, `vite ♥♥`); absent, nothing. */
  status?: (state: S) => string
}

/** A game of any state type, as the arcade holds it. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGame = GameDef<any>
