import type { GameId } from '../../types'
import { BUGS } from './bugs'
import { G2048, RUNNER, SNAKE } from './classics'
import { FLAPPY } from './flappy'
import { MINES } from './mines'
import { TETRIS } from './tetris'
import type { AnyGame } from './types'
import { TYPING } from './typing'

/** The games in menu order: the number beside each is its menu key. */
export const GAMES: readonly AnyGame[] = [SNAKE, G2048, RUNNER, FLAPPY, BUGS, TETRIS, MINES, TYPING]

export const gameOf = (id: GameId): AnyGame => GAMES.find(g => g.id === id) ?? GAMES[0]!

export const isGameId = (value: unknown): value is GameId => GAMES.some(g => g.id === value)
