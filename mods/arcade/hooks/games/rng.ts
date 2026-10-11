/** A seeded random source (mulberry32): the same seed, the same game, so tests can replay one. */
export type Rng = { seed: number }

/** A number in [0, 1) and the source moved on. */
export const nextRandom = (rng: Rng): [number, Rng] => {
  const seed = (rng.seed + 0x6d2b79f5) | 0
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return [((t ^ (t >>> 14)) >>> 0) / 4294967296, { seed }]
}

/** An integer in [0, n) and the source moved on. */
export const nextInt = (rng: Rng, n: number): [number, Rng] => {
  const [r, next] = nextRandom(rng)
  return [Math.floor(r * n), next]
}
