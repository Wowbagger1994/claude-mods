import { directionOf } from './keys'
import { drawMaze } from './maze-view'
import type { Rng } from './rng'
import { nextInt } from './rng'
import type { GameDef } from './types'

/** A cell of the maze: wall, open floor, or the exit door cut into the outer wall. */
export const WALL = '#'
export const OPEN = ' '
export const EXIT = 'E'

/** The maze, row by row (y grows south), one character per cell. */
export type Grid = readonly string[]
export type Point = { x: number; y: number }

/** The exit reached: the points it made, and how long the celebration still lasts. */
export type Cleared = { points: number; ms: number }

export type Maze = {
  level: number
  grid: Grid
  /** Where the player stands, in cells: x grows east, y south. */
  x: number
  y: number
  /** Where the player looks, in steps of `TURN_DEGREES` clockwise from east (0 east, 6 south). */
  heading: number
  /** Cells the player has stood in, as `y * size + x`. */
  visited: readonly boolean[]
  timeLeft: number
  timeLimit: number
  /** Milliseconds spent in this maze: the door's glow and the opening hint follow it. */
  playedMs: number
  score: number
  isOver: boolean
  showMap: boolean
  cleared: Cleared | null
  /** The room the drawing fills, frame included. */
  columns: number
  rows: number
  rng: Rng
}

/** Level 1 is 9×9 cells, each level two more a side. */
const FIRST_SIZE = 9
const SIZE_STEP = 2
export const TURN_DEGREES = 15
export const HEADINGS = 360 / TURN_DEGREES
/** Cells walked per press of ↑ or ↓. */
export const STEP = 0.25
/** Half the player's width: how close it may come to a wall. */
export const RADIUS = 0.2
/** A maze's time: a base, and more for each room of it. */
const TIME_BASE_MS = 20_000
const TIME_PER_ROOM_MS = 3_000
/** An exit's points: this much times the level, and this much per whole second left. */
export const LEVEL_POINTS = 100
export const SECOND_POINTS = 5
/** How long the exit is celebrated before the next maze. */
export const CLEARED_MS = 1_800

export const sizeOf = (level: number): number => FIRST_SIZE + SIZE_STEP * (level - 1)

/** Rooms of a maze `size` cells a side: the open cells at odd coordinates. */
const roomsOf = (size: number) => ((size - 1) / 2) ** 2

export const timeLimitOf = (size: number): number => TIME_BASE_MS + TIME_PER_ROOM_MS * roomsOf(size)

export const pointsFor = (level: number, timeLeft: number): number => LEVEL_POINTS * level + SECOND_POINTS * Math.floor(timeLeft / 1000)

export const cellAt = (grid: Grid, x: number, y: number): string => grid[Math.floor(y)]?.[Math.floor(x)] ?? WALL

const NEIGHBOURS: readonly Point[] = [
  { x: 2, y: 0 },
  { x: -2, y: 0 },
  { x: 0, y: 2 },
  { x: 0, y: -2 },
]

/**
 * A perfect maze `size` cells a side (odd): rooms at odd coordinates, carved
 * depth first from the top-left room, so every room is reached by one path
 * only; the exit is a door in the east wall beside the bottom-right room.
 */
export const carveMaze = (size: number, rng: Rng): [Grid, Rng] => {
  const cells = Array.from({ length: size }, () => Array<string>(size).fill(WALL))
  const isInside = (p: Point) => p.x > 0 && p.y > 0 && p.x < size - 1 && p.y < size - 1
  let r = rng
  const stack: Point[] = [{ x: 1, y: 1 }]
  cells[1]![1] = OPEN
  while (stack.length > 0) {
    const here = stack[stack.length - 1]!
    const options = NEIGHBOURS.map(d => ({ x: here.x + d.x, y: here.y + d.y })).filter(p => isInside(p) && cells[p.y]![p.x] === WALL)
    if (options.length === 0) {
      stack.pop()
      continue
    }
    const [i, next] = nextInt(r, options.length)
    r = next
    const to = options[i]!
    cells[(here.y + to.y) / 2]![(here.x + to.x) / 2] = OPEN
    cells[to.y]![to.x] = OPEN
    stack.push(to)
  }
  cells[size - 2]![size - 1] = EXIT
  return [cells.map(row => row.join('')), r]
}

const markVisited = (visited: readonly boolean[], size: number, x: number, y: number): readonly boolean[] => {
  const i = Math.floor(y) * size + Math.floor(x)
  return visited[i] === true ? visited : visited.map((v, j) => v || j === i)
}

/** A new maze for `level`, the player in the top-left room looking down its open corridor. */
export const newLevel = (level: number, base: Pick<Maze, 'score' | 'showMap' | 'columns' | 'rows' | 'rng'>): Maze => {
  const size = sizeOf(level)
  const [grid, rng] = carveMaze(size, base.rng)
  const timeLimit = timeLimitOf(size)
  return {
    ...base,
    level,
    grid,
    x: 1.5,
    y: 1.5,
    heading: cellAt(grid, 2, 1) === OPEN ? 0 : HEADINGS / 4,
    visited: markVisited(Array<boolean>(size * size).fill(false), size, 1, 1),
    timeLeft: timeLimit,
    timeLimit,
    playedMs: 0,
    isOver: false,
    cleared: null,
    rng,
  }
}

export const newMaze = (columns: number, rows: number, rng: Rng): Maze =>
  newLevel(1, { score: 0, showMap: true, columns, rows, rng })

export const angleOf = (heading: number): number => (heading * TURN_DEGREES * Math.PI) / 180

/** The four corners of the player standing at `p`. */
const cornersOf = (p: Point): Point[] => [-RADIUS, RADIUS].flatMap(dx => [-RADIUS, RADIUS].map(dy => ({ x: p.x + dx, y: p.y + dy })))

const isClear = (grid: Grid, p: Point) => cornersOf(p).every(c => cellAt(grid, c.x, c.y) !== WALL)
const touchesExit = (grid: Grid, p: Point) => cornersOf(p).some(c => cellAt(grid, c.x, c.y) === EXIT)

/** The exit reached: the points made, the celebration started; the player stays at the door, looking at it. */
const reachExit = (g: Maze): Maze => {
  const points = pointsFor(g.level, g.timeLeft)
  return { ...g, score: g.score + points, cleared: { points, ms: CLEARED_MS } }
}

/** A step along the heading (back, when `distance` is negative), sliding along a wall it meets at a slant. */
export const walk = (g: Maze, distance: number): Maze => {
  const angle = angleOf(g.heading)
  const dx = Math.cos(angle) * distance
  const dy = Math.sin(angle) * distance
  const tries: Point[] = [
    { x: g.x + dx, y: g.y + dy },
    { x: g.x + dx, y: g.y },
    { x: g.x, y: g.y + dy },
  ]
  const to = tries.find(p => (p.x !== g.x || p.y !== g.y) && isClear(g.grid, p))
  if (to === undefined) return g
  if (touchesExit(g.grid, to)) return reachExit(g)
  return { ...g, ...to, visited: markVisited(g.visited, g.grid.length, to.x, to.y) }
}

export const turn = (g: Maze, steps: number): Maze => ({ ...g, heading: (((g.heading + steps) % HEADINGS) + HEADINGS) % HEADINGS })

export const keyMaze = (g: Maze, key: string): Maze => {
  if (g.isOver) return g
  if (key === 'm') return { ...g, showMap: !g.showMap }
  if (g.cleared !== null) return g
  const dir = directionOf(key)
  if (dir === 'up') return walk(g, STEP)
  if (dir === 'down') return walk(g, -STEP)
  if (dir === 'left') return turn(g, -1)
  if (dir === 'right') return turn(g, 1)
  return g
}

/** Time passing: the clock runs down and ends the game at zero; after an exit, the next maze. */
export const tickMaze = (g: Maze, ms: number): Maze => {
  if (g.isOver) return g
  if (g.cleared !== null) {
    return g.cleared.ms > ms ? { ...g, cleared: { ...g.cleared, ms: g.cleared.ms - ms } } : newLevel(g.level + 1, g)
  }
  const timeLeft = Math.max(0, g.timeLeft - ms)
  return { ...g, timeLeft, playedMs: g.playedMs + ms, isOver: timeLeft === 0 }
}

export const mazeStatus = (g: Maze): string => `livello ${g.level} · ${Math.ceil(g.timeLeft / 1000)} s`

export const MAZE: GameDef<Maze> = {
  id: 'maze',
  name: 'Labirinto 3D',
  keys: '↑↓ avanti e indietro · ←→ gira · m mappa',
  create: ctx => newMaze(ctx.columns, ctx.rows, ctx.rng),
  key: keyMaze,
  tick: tickMaze,
  isOver: g => g.isOver,
  score: g => g.score,
  draw: g => drawMaze(g),
  status: mazeStatus,
}
