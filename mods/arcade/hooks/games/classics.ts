import { draw2048, drawDino, drawSnake } from '../draw'
import type { Dino } from './dino'
import { dropDino, jumpDino, newDino, stepDino } from './dino'
import type { Game2048 } from './g2048'
import { move2048, new2048 } from './g2048'
import { directionOf, isSpace } from './keys'
import type { Snake } from './snake'
import { newSnake, snakeInterval, stepSnake, turnSnake } from './snake'
import type { GameDef } from './types'

const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n))

/** The snake and the milliseconds since it last moved: it steps faster as it grows. */
export type SnakePlay = { snake: Snake; since: number }

export const SNAKE: GameDef<SnakePlay> = {
  id: 'snake',
  name: 'Snake',
  keys: 'frecce o WASD per girare',
  create: ctx => ({
    snake: newSnake(clamp(Math.floor((ctx.columns - 2) / 2), 10, 30), clamp(ctx.rows - 2, 6, 16), ctx.rng),
    since: 0,
  }),
  key: (s, key) => {
    const dir = directionOf(key)
    return dir === undefined ? s : { ...s, snake: turnSnake(s.snake, dir) }
  },
  tick: (s, ms) => {
    let snake = s.snake
    let since = s.since + ms
    while (since >= snakeInterval(snake) && !snake.isOver) {
      since -= snakeInterval(snake)
      snake = stepSnake(snake)
    }
    return { snake, since }
  },
  isOver: s => s.snake.isOver,
  score: s => s.snake.score,
  draw: s => drawSnake(s.snake),
}

export const G2048: GameDef<Game2048> = {
  id: '2048',
  name: '2048',
  keys: 'frecce o WASD per spostare le tessere',
  create: ctx => new2048(ctx.rng),
  key: (g, key) => {
    const dir = directionOf(key)
    return dir === undefined ? g : move2048(g, dir)
  },
  isOver: g => g.isOver,
  score: g => g.score,
  draw: draw2048,
}

export const RUNNER: GameDef<Dino> = {
  id: 'dino',
  name: 'Claude runner',
  keys: 'spazio o ↑ per saltare, ↓ per scendere',
  create: ctx => newDino(clamp(ctx.columns, 30, 90), ctx.rng),
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
