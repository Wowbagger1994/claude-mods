import type { Rng } from './rng'
import { nextInt, nextRandom } from './rng'
import type { Direction } from './snake'

export const SIZE = 4
/** One new tile in ten is a 4, as in the original. */
const FOUR_CHANCE = 0.1

/** Row-major, 0 for an empty cell. */
export type Grid = number[][]

export type Game2048 = { grid: Grid; score: number; isOver: boolean; hasWon: boolean; rng: Rng }

export const WIN_TILE = 2048

/** One row slid to the left: tiles packed, equal neighbours merged once, and the points the merges made. */
export const slideRow = (row: number[]): { row: number[]; gained: number } => {
  const tiles = row.filter(n => n !== 0)
  const merged: number[] = []
  let gained = 0
  for (let i = 0; i < tiles.length; i++) {
    const a = tiles[i]!
    if (a === tiles[i + 1]) {
      merged.push(a * 2)
      gained += a * 2
      i++
    } else {
      merged.push(a)
    }
  }
  return { row: [...merged, ...Array<number>(row.length - merged.length).fill(0)], gained }
}

const transpose = (g: Grid): Grid => g[0]!.map((_, c) => g.map(row => row[c]!))
const mirror = (g: Grid): Grid => g.map(row => [...row].reverse())

/** The grid turned so that `dir` becomes a slide to the left, and back. */
const VIEWS: Record<Direction, { to: (g: Grid) => Grid; from: (g: Grid) => Grid }> = {
  left: { to: g => g, from: g => g },
  right: { to: mirror, from: mirror },
  up: { to: transpose, from: transpose },
  down: { to: g => mirror(transpose(g)), from: g => transpose(mirror(g)) },
}

/** The whole grid slid one way, the points made, and whether any tile moved. */
export const slide = (grid: Grid, dir: Direction): { grid: Grid; gained: number; hasMoved: boolean } => {
  const view = VIEWS[dir]
  const rows = view.to(grid).map(slideRow)
  const out = view.from(rows.map(r => r.row))
  return {
    grid: out,
    gained: rows.reduce((sum, r) => sum + r.gained, 0),
    hasMoved: out.some((row, r) => row.some((n, c) => n !== grid[r]![c])),
  }
}

const addTile = (grid: Grid, rng: Rng): [Grid, Rng] => {
  const empty = grid.flatMap((row, r) => row.flatMap((n, c) => (n === 0 ? [{ r, c }] : [])))
  if (empty.length === 0) return [grid, rng]
  const [i, afterPick] = nextInt(rng, empty.length)
  const [roll, afterRoll] = nextRandom(afterPick)
  const at = empty[i]!
  const value = roll < FOUR_CHANCE ? 4 : 2
  return [grid.map((row, r) => row.map((n, c) => (r === at.r && c === at.c ? value : n))), afterRoll]
}

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right']

/** No slide moves anything: the game is over. */
export const isStuck = (grid: Grid): boolean => DIRECTIONS.every(d => !slide(grid, d).hasMoved)

export const new2048 = (rng: Rng): Game2048 => {
  const empty: Grid = Array.from({ length: SIZE }, () => Array<number>(SIZE).fill(0))
  const [one, r1] = addTile(empty, rng)
  const [grid, r2] = addTile(one, r1)
  return { grid, score: 0, isOver: false, hasWon: false, rng: r2 }
}

/** A move: the slide, a new tile when something moved, the end when nothing can. */
export const move2048 = (g: Game2048, dir: Direction): Game2048 => {
  if (g.isOver) return g
  const slid = slide(g.grid, dir)
  if (!slid.hasMoved) return g
  const [grid, rng] = addTile(slid.grid, g.rng)
  return {
    grid,
    score: g.score + slid.gained,
    isOver: isStuck(grid),
    hasWon: g.hasWon || grid.some(row => row.some(n => n >= WIN_TILE)),
    rng,
  }
}
