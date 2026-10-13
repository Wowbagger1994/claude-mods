import type { Ate, Fx2048 } from '../draw'
import { draw2048, drawDino, drawSnake, EAT_FLASH_MS } from '../draw'
import type { Dino } from './dino'
import { dropDino, jumpDino, newDino, stepDino } from './dino'
import type { Game2048 } from './g2048'
import { mergesOf, move2048, new2048, slide } from './g2048'
import { directionOf, isSpace } from './keys'
import type { Direction, Snake } from './snake'
import { newSnake, snakeInterval, stepSnake, turnSnake } from './snake'
import type { GameDef } from './types'

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/**
 * The snake and the milliseconds since it last moved: it steps faster as it
 * grows. The rest is for the drawing: the room, the time played, the last bite.
 */
export type SnakePlay = { snake: Snake; since: number; columns?: number; clock?: number; ate?: Ate | null }

/** The bite `ms` older, gone once its flash is over. */
const aged = (ate: Ate | null | undefined, ms: number): Ate | null =>
  ate === undefined || ate === null || ate.ms + ms >= EAT_FLASH_MS ? null : { ...ate, ms: ate.ms + ms }

export const SNAKE: GameDef<SnakePlay> = {
  id: 'snake',
  name: 'Snake',
  keys: 'frecce o WASD per girare',
  create: ctx => ({
    snake: newSnake(clamp(Math.floor((ctx.columns - 2) / 2), 10, 30), clamp(ctx.rows - 2, 6, 16), ctx.rng),
    since: 0,
    columns: ctx.columns,
    clock: 0,
    ate: null,
  }),
  key: (s, key) => {
    const dir = directionOf(key)
    return dir === undefined ? s : { ...s, snake: turnSnake(s.snake, dir) }
  },
  tick: (s, ms) => {
    let snake = s.snake
    let since = s.since + ms
    let ate = aged(s.ate, ms)
    while (since >= snakeInterval(snake) && !snake.isOver) {
      since -= snakeInterval(snake)
      const before = snake
      snake = stepSnake(snake)
      if (snake.score > before.score) ate = { at: snake.body[0]!, points: snake.score - before.score, ms: 0 }
    }
    return { ...s, snake, since, clock: (s.clock ?? 0) + ms, ate }
  },
  isOver: s => s.snake.isOver,
  score: s => s.snake.score,
  draw: s => drawSnake(s.snake, s),
}

/** The 2048 game, the room it is drawn in, and what the last move did. */
export type Play2048 = { game: Game2048; columns: number; rows: number; last: Fx2048 | null }

/** What a move from `before` to `after` did, for the drawing to mark. */
export const moveFx = (before: Game2048, after: Game2048, dir: Direction): Fx2048 => {
  const slid = slide(before.grid, dir).grid
  const added = after.grid.flatMap((row, r) => row.flatMap((n, c) => (n !== slid[r]![c] ? [{ r, c }] : [])))
  return { merged: mergesOf(before.grid, dir), spawned: added[0] ?? null, gained: after.score - before.score }
}

export const G2048: GameDef<Play2048> = {
  id: '2048',
  name: '2048',
  keys: 'frecce o WASD per spostare le tessere',
  create: ctx => ({ game: new2048(ctx.rng), columns: ctx.columns, rows: ctx.rows, last: null }),
  key: (p, key) => {
    const dir = directionOf(key)
    if (dir === undefined) return p
    const game = move2048(p.game, dir)
    return game === p.game ? p : { ...p, game, last: moveFx(p.game, game, dir) }
  },
  isOver: p => p.game.isOver,
  score: p => p.game.score,
  draw: p => draw2048(p.game, p),
}

export const RUNNER: GameDef<Dino> = {
  id: 'dino',
  name: 'Claude runner',
  keys: 'spazio o ↑ per saltare, ↓ per scendere',
  // Two columns go to the frame.
  create: ctx => ({ ...newDino(clamp(ctx.columns - 2, 30, 90), ctx.rng), screen: { columns: ctx.columns, rows: ctx.rows } }),
  key: (d, key) => {
    const dir = directionOf(key)
    if (isSpace(key) || dir === 'up') return jumpDino(d)
    return dir === 'down' ? dropDino(d) : d
  },
  tick: stepDino,
  isOver: d => d.isOver,
  score: d => d.score,
  draw: drawDino,
}
