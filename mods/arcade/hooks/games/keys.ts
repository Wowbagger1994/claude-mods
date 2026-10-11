import type { Direction } from './snake'

const DIRECTION_KEYS: Record<string, Direction> = { up: 'up', down: 'down', left: 'left', right: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }

/** The direction an arrow or a WASD letter means; undefined for any other key. */
export const directionOf = (key: string): Direction | undefined => DIRECTION_KEYS[key]

/** Space, however the surface names it. */
export const isSpace = (key: string): boolean => key === ' ' || key === 'space'
