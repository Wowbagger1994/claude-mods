import type { Rng } from './rng'
import { nextInt } from './rng'

/** A cactus: its left column (fractional while it scrolls), width and height in cells. */
export type Cactus = { x: number; width: number; height: number }

export type Dino = {
  width: number
  /** Rows above the ground; 0 when standing. */
  y: number
  /** Rows per second, up positive. */
  vy: number
  /** Columns per second the ground scrolls. */
  speed: number
  /** Columns run so far. */
  distance: number
  cacti: Cactus[]
  /** Columns left before the next cactus appears at the right edge. */
  gap: number
  score: number
  isOver: boolean
  rng: Rng
  /** The room the arcade gave the game, for the drawing only; absent, the least room. */
  screen?: { columns: number; rows: number }
}

/** The runner (Claude's mascot): its left column and its size in cells, as drawn. */
export const DINO_X = 2
export const DINO_WIDTH = 9
export const DINO_HEIGHT = 3
/** The part a cactus must touch to end the run: the solid body, not the ears and feet at its sides. */
export const HITBOX = { left: DINO_X + 2, width: 5 }

/** A jump peaks 5 rows up and lasts 0.8 s: v0 = 4h/t, g = 2·v0/t. */
const JUMP_SPEED = 25
const GRAVITY = 62.5
const START_SPEED = 18
const MAX_SPEED = 42
/** Columns per second gained each second. */
const ACCELERATION = 0.6
const MAX_CACTUS_HEIGHT = 2
const MAX_CACTUS_WIDTH = 3
/** Two columns run make one point. */
const COLUMNS_PER_POINT = 2

/** Columns before the next cactus: never shorter than a jump's flight plus a landing, so it is always passable. */
const nextGap = (speed: number, rng: Rng): [number, Rng] => {
  const shortest = Math.ceil(speed * 0.9) + HITBOX.width + MAX_CACTUS_WIDTH
  const [extra, next] = nextInt(rng, shortest)
  return [shortest + extra, next]
}

export const newDino = (width: number, rng: Rng): Dino => {
  const [gap, next] = nextGap(START_SPEED, rng)
  return { width, y: 0, vy: 0, speed: START_SPEED, distance: 0, cacti: [], gap: Math.min(gap, width), score: 0, isOver: false, rng: next }
}

/** Jumps when standing; a press mid-air does nothing. */
export const jumpDino = (d: Dino): Dino => (d.isOver || d.y > 0 ? d : { ...d, vy: JUMP_SPEED })

/** A press of down mid-air: heads straight back down, as fast as it went up. */
export const dropDino = (d: Dino): Dino => (d.isOver || d.y === 0 ? d : { ...d, vy: -JUMP_SPEED })

const isHit = (d: Dino, c: Cactus) => c.x < HITBOX.left + HITBOX.width && c.x + c.width > HITBOX.left && d.y < c.height

/** `ms` of running: the dino rises or falls, cacti scroll in and out, a touch ends the run. */
export const stepDino = (d: Dino, ms: number): Dino => {
  if (d.isOver) return d
  const dt = ms / 1000
  const isFlying = d.y > 0 || d.vy > 0
  const vy = isFlying ? d.vy - GRAVITY * dt : 0
  // The mean of the speeds at both ends: the exact parabola, whatever the frame length.
  const y = isFlying ? Math.max(0, d.y + ((d.vy + vy) / 2) * dt) : 0
  const moved = d.speed * dt
  const scrolled = d.cacti.map(c => ({ ...c, x: c.x - moved })).filter(c => c.x + c.width > 0)

  let gap = d.gap - moved
  let rng = d.rng
  let cacti = scrolled
  if (gap <= 0) {
    const [width, r1] = nextInt(rng, MAX_CACTUS_WIDTH)
    const [height, r2] = nextInt(r1, MAX_CACTUS_HEIGHT)
    const [next, r3] = nextGap(d.speed, r2)
    cacti = [...scrolled, { x: d.width + gap, width: width + 1, height: height + 1 }]
    gap = next
    rng = r3
  }

  const distance = d.distance + moved
  const after: Dino = {
    ...d,
    y,
    vy: y === 0 ? 0 : vy,
    speed: Math.min(MAX_SPEED, d.speed + ACCELERATION * dt),
    distance,
    cacti,
    gap,
    score: Math.floor(distance / COLUMNS_PER_POINT),
    rng,
  }
  return cacti.some(c => isHit(after, c)) ? { ...after, isOver: true } : after
}
