import type { Rng } from './rng'
import { nextInt } from './rng'

export type Direction = 'up' | 'down' | 'left' | 'right'
export type Point = { x: number; y: number }

export type Snake = {
  width: number
  height: number
  /** Head first. */
  body: Point[]
  /** Where the head went on the last step. */
  heading: Direction
  /** Where it goes on the next step: the last turn pressed. */
  next: Direction
  food: Point
  score: number
  isOver: boolean
  rng: Rng
}

const START_LENGTH = 3
/** Points for each fruit eaten. */
export const FRUIT_POINTS = 10

const MOVES: Record<Direction, Point> = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }
const OPPOSITE: Record<Direction, Direction> = { up: 'down', down: 'up', left: 'right', right: 'left' }

const same = (a: Point, b: Point) => a.x === b.x && a.y === b.y

/** A free cell for the fruit, picked at random; null when the snake fills the board. */
const placeFood = (width: number, height: number, body: Point[], rng: Rng): [Point | null, Rng] => {
  const free = Array.from({ length: width * height }, (_, i) => ({ x: i % width, y: Math.floor(i / width) })).filter(
    p => !body.some(b => same(b, p)),
  )
  if (free.length === 0) return [null, rng]
  const [i, next] = nextInt(rng, free.length)
  return [free[i] ?? null, next]
}

/** A snake of three in the middle, heading right, and a fruit somewhere free. */
export const newSnake = (width: number, height: number, rng: Rng): Snake => {
  const y = Math.floor(height / 2)
  const head = Math.floor(width / 2)
  const body = Array.from({ length: START_LENGTH }, (_, i) => ({ x: head - i, y }))
  const [food, next] = placeFood(width, height, body, rng)
  return { width, height, body, heading: 'right', next: 'right', food: food ?? body[0]!, score: 0, isOver: false, rng: next }
}

/** Takes a turn for the next step; turning back onto itself is ignored. */
export const turnSnake = (s: Snake, to: Direction): Snake => (s.isOver || to === OPPOSITE[s.heading] ? s : { ...s, next: to })

/** One step: the head moves, a fruit makes it grow, a wall or its own body ends the game. */
export const stepSnake = (s: Snake): Snake => {
  if (s.isOver) return s
  const head = s.body[0]!
  const move = MOVES[s.next]
  const to = { x: head.x + move.x, y: head.y + move.y }
  const isEating = same(to, s.food)
  // The tail moves away this step unless the snake grows: its cell is free to enter.
  const stays = isEating ? s.body : s.body.slice(0, -1)
  const isOut = to.x < 0 || to.y < 0 || to.x >= s.width || to.y >= s.height
  if (isOut || stays.some(p => same(p, to))) return { ...s, heading: s.next, isOver: true }

  const body = [to, ...stays]
  if (!isEating) return { ...s, body, heading: s.next }
  const [food, rng] = placeFood(s.width, s.height, body, s.rng)
  const score = s.score + FRUIT_POINTS
  // A full board is a win: nothing left to eat.
  return food === null
    ? { ...s, body, heading: s.next, score, isOver: true }
    : { ...s, body, heading: s.next, food, score, rng }
}

/** Milliseconds between steps: faster as it grows, never below 60. */
export const snakeInterval = (s: Snake): number => Math.max(60, 150 - (s.body.length - START_LENGTH) * 4)
