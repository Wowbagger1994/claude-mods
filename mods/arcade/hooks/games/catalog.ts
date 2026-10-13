import type { GameId } from '../../types'
import { BREAKOUT } from './breakout'
import { BUGS } from './bugs'
import { G2048, RUNNER, SNAKE } from './classics'
import { FLAPPY } from './flappy'
import { MAZE } from './maze'
import { MINES } from './mines'
import { TETRIS } from './tetris'
import type { AnyGame } from './types'
import { TYPING } from './typing'
import { WORDLE } from './wordle'

/** The games in menu order: the key beside each (1–9, then letters) starts it. */
export const GAMES: readonly AnyGame[] = [SNAKE, G2048, RUNNER, FLAPPY, BUGS, TETRIS, MINES, TYPING, BREAKOUT, WORDLE, MAZE]

export const gameOf = (id: GameId): AnyGame => GAMES.find(g => g.id === id) ?? GAMES[0]!

export const isGameId = (value: unknown): value is GameId => GAMES.some(g => g.id === value)
