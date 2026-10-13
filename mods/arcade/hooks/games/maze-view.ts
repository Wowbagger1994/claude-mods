import type { Grid, Maze } from './maze'
import { angleOf, cellAt, EXIT, HEADINGS, OPEN, WALL } from './maze'
import { framed, meter, PALETTE, widthOf } from './style'
import type { Row, Span } from './types'

/**
 * What a ray met: how far, perpendicular to the view (no fish-eye), on which
 * face, where along that face (0 to 1), and whether it was the door.
 */
export type Hit = { dist: number; side: 'x' | 'y'; along: number; isExit: boolean }

/** How a wall looks at a distance: its glyph and colours, and the one colour a half-block edge of it takes. */
type Shade = { ch: string; fg: string; bg: string; edge: string }

/** Rows and columns the frame takes. */
const FRAME = 2
/** The widest and narrowest view, as the tangent of half the field of view (90° and 53°). */
const MAX_PLANE = 1
const MIN_PLANE = 0.5
/** A wall seen this close or closer takes the nearest shade; then each next one, farther. */
const SHADE_STEPS: readonly { upTo: number; ch: string; light: number; cover: number }[] = [
  { upTo: 1.5, ch: '█', light: 1, cover: 1 },
  { upTo: 3, ch: '▓', light: 0.8, cover: 0.75 },
  { upTo: 5, ch: '▒', light: 0.62, cover: 0.5 },
  { upTo: 8, ch: '░', light: 0.48, cover: 0.3 },
  { upTo: Infinity, ch: '░', light: 0.34, cover: 0.3 },
]
/** A wall's own colour behind its glyph, a share of its light. */
const BACK_LIGHT = 0.42
/** Faces running north–south lit, faces running east–west in shade; the door green. */
const WALL_X = '#9cc3e6'
const WALL_Y = '#5f87ad'
const EXIT_X = '#4ade80'
const EXIT_Y = '#22c55e'
/** The door's glow: brighter every other beat. */
const GLOW_MS = 400
const GLOW = 0.25
const BLACK = '#000000'
/** The ceiling, from its top to the horizon; the floor, from the horizon to the bottom; its dots. */
const CEIL_TOP = '#1e3a5f'
const CEIL_HORIZON = '#070b14'
const FLOOR_HORIZON = '#0c0c0e'
const FLOOR_NEAR = '#3a3a40'
const DOT = '#8a8a96'
/** Floor dots: a grid of spots this many a cell, this share of them lit, none beyond this distance. */
const DOT_GRID = 4
const DOT_SHARE = 0.5
const DOT_FAR = 6
/** The line where two wall cells meet, a thin dark gap on the wall's own colour. */
const SEAM = '▏'
const SEAM_COLOR = '#0b0f16'
/** Beyond this distance seams would be noise. */
const SEAM_FAR = 4
/** The minimap: its colours, and at most this share of the view across and down. */
export const MAP = { unknown: '#111827', wall: '#64748b', open: '#1e3a5f', seen: '#38bdf8', player: '#fafafa' } as const
const MAP_SHARE_X = 0.4
const MAP_SHARE_Y = 0.6
/** The player's arrow on the minimap, by quarter turn from east. */
const ARROWS = ['▶', '▼', '◀', '▲']
/** The compass, by eighth of a turn from north, in Italian. */
const POINTS = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO']
/** The clock turns amber, then red, under these shares of the maze's time. */
const HURRY_SHARE = 0.3
const DANGER_SHARE = 0.12
/** The opening hint shows this long. */
const HINT_MS = 2_500
const BANNER_BG = '#14532d'
const HINT_BG = '#0f172a'

const rgbOf = (hex: string): [number, number, number] => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number]
const hexOf = (rgb: readonly number[]): string => `#${rgb.map(v => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`

/** From `a` (t = 0) to `b` (t = 1). */
export const mix = (a: string, b: string, t: number): string => {
  const [ra, rb] = [rgbOf(a), rgbOf(b)]
  return hexOf(ra.map((v, i) => v + (rb[i]! - v) * t))
}

const shadesOf = (base: string, glow = 0): Shade[] =>
  SHADE_STEPS.map(s => {
    const fg = mix(BLACK, base, Math.min(1, s.light + glow))
    const bg = mix(BLACK, base, (s.light + glow) * BACK_LIGHT)
    return { ch: s.ch, fg, bg, edge: mix(bg, fg, s.cover) }
  })

const SHADES = {
  wall: { x: shadesOf(WALL_X), y: shadesOf(WALL_Y) },
  exit: { x: shadesOf(EXIT_X), y: shadesOf(EXIT_Y) },
  glow: { x: shadesOf(EXIT_X, GLOW), y: shadesOf(EXIT_Y, GLOW) },
}

export const shadeOf = (hit: Hit, playedMs = 0): Shade => {
  const step = SHADE_STEPS.findIndex(s => hit.dist <= s.upTo)
  const isGlowing = Math.floor(playedMs / GLOW_MS) % 2 === 1
  const set = hit.isExit ? (isGlowing ? SHADES.glow : SHADES.exit) : SHADES.wall
  return set[hit.side][step]!
}

/**
 * A ray from (px, py) along (dx, dy), stepped cell by cell (DDA) to the first
 * wall or door. The distance is along the view direction when (dx, dy) is the
 * view direction plus a share of the camera plane.
 */
export const castRay = (grid: Grid, px: number, py: number, dx: number, dy: number): Hit => {
  let cx = Math.floor(px)
  let cy = Math.floor(py)
  const stepX = dx < 0 ? -1 : 1
  const stepY = dy < 0 ? -1 : 1
  const deltaX = dx === 0 ? Infinity : Math.abs(1 / dx)
  const deltaY = dy === 0 ? Infinity : Math.abs(1 / dy)
  let sideX = (dx < 0 ? px - cx : cx + 1 - px) * deltaX
  let sideY = (dy < 0 ? py - cy : cy + 1 - py) * deltaY
  const limit = grid.length * 2 + 2
  for (let i = 0; i < limit; i++) {
    const side = sideX < sideY ? 'x' : 'y'
    if (side === 'x') {
      sideX += deltaX
      cx += stepX
    } else {
      sideY += deltaY
      cy += stepY
    }
    const cell = cellAt(grid, cx, cy)
    if (cell === OPEN) continue
    const dist = side === 'x' ? sideX - deltaX : sideY - deltaY
    const at = side === 'x' ? py + dist * dy : px + dist * dx
    return { dist, side, along: at - Math.floor(at), isExit: cell === EXIT }
  }
  return { dist: Infinity, side: 'x', along: 0.5, isExit: false }
}

/** The view's geometry: its size in cells and in half-rows, where the player looks, the camera plane's reach. */
type Camera = { width: number; height: number; halves: number; dirX: number; dirY: number; plane: number }

const cameraOf = (g: Maze, width: number, height: number): Camera => {
  const angle = angleOf(g.heading)
  const halves = height * 2
  const plane = Math.max(MIN_PLANE, Math.min(MAX_PLANE, width / (2 * halves)))
  return { width, height, halves, dirX: Math.cos(angle), dirY: Math.sin(angle), plane }
}

/** The ray of column `c`: the view direction swept across the camera plane, left to right. */
const rayOf = (cam: Camera, c: number): [number, number] => {
  const k = ((2 * (c + 0.5)) / cam.width - 1) * cam.plane
  return [cam.dirX - cam.dirY * k, cam.dirY + cam.dirX * k]
}

/** A column's wall: the half-rows it spans, top inclusive, bottom exclusive, centred on the horizon. */
export const wallSpan = (halves: number, dist: number): [number, number] => {
  const tall = halves / Math.max(dist, 0.01)
  return [halves / 2 - tall / 2, halves / 2 + tall / 2]
}

const integerHash = (x: number, y: number): number => {
  const h = Math.imul(x, 73_856_093) ^ Math.imul(y, 19_349_663)
  return ((Math.imul(h ^ (h >>> 13), 1_274_126_177) >>> 0) % 1000) / 1000
}

/** Where a point on the floor shows in the view: its column and row, or null behind the player. */
const project = (g: Maze, cam: Camera, x: number, y: number): [number, number] | null => {
  const [rx, ry] = [x - g.x, y - g.y]
  const depth = rx * cam.dirX + ry * cam.dirY
  if (depth <= 0) return null
  const k = (ry * cam.dirX - rx * cam.dirY) / (depth * cam.plane)
  return [Math.floor(((k + 1) / 2) * cam.width), Math.floor((cam.halves / 2 + cam.halves / (2 * depth)) / 2)]
}

/**
 * Is there a dot on the floor where column `c` sees row `r`? Spots fixed in the
 * maze, on a grid of `DOT_GRID` a cell, some lit: one shows in the cell its
 * centre falls in, so they slide past as you walk and none beyond `DOT_FAR`.
 */
const dotAt = (g: Maze, cam: Camera, ray: readonly [number, number], c: number, r: number): number | null => {
  const below = 2 * r + 1 - cam.halves / 2
  const dist = cam.halves / (2 * below)
  if (dist > DOT_FAR) return null
  const tx = Math.floor((g.x + ray[0] * dist) * DOT_GRID)
  const ty = Math.floor((g.y + ray[1] * dist) * DOT_GRID)
  if (integerHash(tx, ty) >= DOT_SHARE) return null
  const at = project(g, cam, (tx + 0.5) / DOT_GRID, (ty + 0.5) / DOT_GRID)
  return at !== null && at[0] === c && at[1] === r ? dist : null
}

type Part = 'ceiling' | 'wall' | 'floor'

const partOf = (half: number, top: number, bottom: number): Part => (half + 0.5 < top ? 'ceiling' : half + 0.5 >= bottom ? 'floor' : 'wall')

/** The 3D view, one ray per column, two half-rows per row: walls shaded by distance over a ceiling and a dotted floor. */
export const sceneOf = (g: Maze, width: number, height: number): Span[][] => {
  const cam = cameraOf(g, width, height)
  const ceiling = Array.from({ length: height }, (_, r) => mix(CEIL_TOP, CEIL_HORIZON, Math.min(1, (2 * r) / height)))
  const floor = Array.from({ length: height }, (_, r) => mix(FLOOR_HORIZON, FLOOR_NEAR, Math.max(0, (2 * r - height) / height)))
  const columns = Array.from({ length: width }, (_, c) => {
    const ray = rayOf(cam, c)
    const hit = castRay(g.grid, g.x, g.y, ray[0], ray[1])
    const [top, bottom] = wallSpan(cam.halves, hit.dist)
    const seam = (hit.dist * cam.plane) / width
    const isSeam = hit.dist < SEAM_FAR && (hit.along < seam || hit.along > 1 - seam)
    return { ray, shade: shadeOf(hit, g.playedMs), isSeam, top, bottom }
  })
  return Array.from({ length: height }, (_, r) =>
    columns.map((col, c): Span => {
      const upper = partOf(2 * r, col.top, col.bottom)
      const lower = partOf(2 * r + 1, col.top, col.bottom)
      const solid = (p: Part) => (p === 'ceiling' ? ceiling[r]! : p === 'floor' ? floor[r]! : col.shade.edge)
      if (upper !== lower) return { text: '▀', fg: solid(upper), bg: solid(lower) }
      if (upper === 'wall') return col.isSeam ? { text: SEAM, fg: SEAM_COLOR, bg: col.shade.edge } : { text: col.shade.ch, fg: col.shade.fg, bg: col.shade.bg }
      if (upper === 'ceiling') return { text: ' ', bg: ceiling[r]! }
      const dot = dotAt(g, cam, col.ray, c, r)
      return dot === null ? { text: ' ', bg: floor[r]! } : { text: '·', fg: mix(DOT, floor[r]!, dot / DOT_FAR), bg: floor[r]! }
    }),
  )
}

const isVisited = (g: Maze, x: number, y: number) => g.visited[y * g.grid.length + x] === true

/** A minimap cell: walls and floor seen from where the player has been, the door always, the rest unknown. */
const mapColorOf = (g: Maze, x: number, y: number): string => {
  const cell = cellAt(g.grid, x, y)
  if (cell === EXIT) return PALETTE.good
  const isNear = [-1, 0, 1].some(dy => [-1, 0, 1].some(dx => isVisited(g, x + dx, y + dy)))
  if (!isNear) return MAP.unknown
  if (cell === WALL) return MAP.wall
  return isVisited(g, x, y) ? MAP.seen : MAP.open
}

export const arrowOf = (heading: number): string => ARROWS[Math.round(heading / (HEADINGS / 4)) % 4]!
export const compassOf = (heading: number): string => POINTS[(Math.round(heading / (HEADINGS / 8)) + 2) % 8]!

/** The window of the maze the minimap shows: all of it if it fits, else the part around the player. */
const windowOf = (size: number, at: number, room: number): number => Math.max(0, Math.min(size - room, Math.floor(at) - Math.floor(room / 2)))

/**
 * The minimap, north up, two maze rows per text row (`▀`, top cell in front,
 * bottom cell behind), the player an arrow in its cell.
 */
export const minimapOf = (g: Maze, width: number, height: number): Span[][] => {
  const size = g.grid.length
  const across = Math.min(size, Math.max(5, Math.floor(width * MAP_SHARE_X)))
  const down = Math.min(Math.ceil(size / 2), Math.max(3, Math.floor(height * MAP_SHARE_Y)))
  const left = windowOf(size, g.x, across)
  const top = windowOf(size, g.y, down * 2)
  const px = Math.floor(g.x)
  const py = Math.floor(g.y)
  return Array.from({ length: down }, (_, r) =>
    Array.from({ length: across }, (_, c): Span => {
      const x = left + c
      const y = top + 2 * r
      const upper = mapColorOf(g, x, y)
      const lower = y + 1 < size ? mapColorOf(g, x, y + 1) : MAP.unknown
      if (x === px && (y === py || y + 1 === py)) return { text: arrowOf(g.heading), fg: MAP.player, bg: y === py ? lower : upper, bold: true }
      return { text: '▀', fg: upper, bg: lower }
    }),
  )
}

/** `over` laid on `under` from column `at`, cell for cell. */
const overlay = (under: Span[], over: readonly Span[], at: number): Span[] => [...under.slice(0, at), ...over, ...under.slice(at + over.length)]

/** A message centred on row `r` of the view: cells of white on a band of colour. */
const banner = (row: Span[], text: string, bg: string): Span[] => {
  const chars = [...` ${text} `].slice(0, row.length)
  const at = Math.max(0, Math.floor((row.length - chars.length) / 2))
  return overlay(row, chars.map(ch => ({ text: ch, fg: PALETTE.white, bg, bold: true })), at)
}

const withMessages = (g: Maze, scene: Span[][]): Span[][] => {
  const middle = Math.floor(scene.length / 2)
  if (g.cleared !== null) {
    const lines = ['USCITA!', `+${g.cleared.points} punti`, `prossimo: livello ${g.level + 1}`]
    return scene.map((row, r) => (r >= middle - 1 && r <= middle + 1 ? banner(row, lines[r - middle + 1]!, BANNER_BG) : row))
  }
  if (g.isOver) return scene.map((row, r) => (r === middle ? banner(row, 'tempo scaduto', PALETTE.danger) : row))
  if (g.playedMs >= HINT_MS) return scene
  const width = scene[0]?.length ?? 0
  const hint = [`livello ${g.level}: trova la porta verde`, 'trova la porta verde', 'porta verde'].find(h => h.length + 2 <= width) ?? ''
  return scene.map((row, r) => (r === scene.length - 2 && hint !== '' ? banner(row, hint, HINT_BG) : row))
}

/** Neighbouring cells drawn alike merged into one span, in one pass: a view row holds a hundred cells. */
const merge = (cells: readonly Span[]): Row => {
  const out: Span[] = []
  for (const s of cells) {
    const last = out[out.length - 1]
    if (last !== undefined && last.fg === s.fg && last.bg === s.bg && last.bold === s.bold) out[out.length - 1] = { ...last, text: last.text + s.text }
    else out.push(s)
  }
  return out
}

/** The frame's colour: green at the exit, red at the end or with little time left, amber with not much. */
export const frameColorOf = (g: Maze): string => {
  const share = g.timeLeft / g.timeLimit
  if (g.cleared !== null) return PALETTE.good
  if (g.isOver || share < DANGER_SHARE) return PALETTE.danger
  return share < HURRY_SHARE ? PALETTE.hurry : PALETTE.frame
}

/** The bottom edge: the clock as a meter (or the exit's points), and the compass at the right. */
const footerOf = (g: Maze, width: number): Span[] => {
  const color = frameColorOf(g)
  const clock = color === PALETTE.frame ? PALETTE.sky : color
  const seconds = ` ${Math.ceil(g.timeLeft / 1000)} s `
  const cells = Math.max(3, Math.min(20, width - 22))
  const left: Span[] =
    g.cleared === null
      ? [{ text: ' ', fg: clock }, ...meter(g.timeLeft / g.timeLimit, cells, clock), { text: seconds, fg: clock, bold: true }]
      : [{ text: ` +${g.cleared.points} uscita! `, fg: PALETTE.good, bold: true }]
  const right: Span[] = [{ text: ` ${compassOf(g.heading)} `, fg: PALETTE.sky, bold: true }, { text: '─', fg: color }]
  const gap = Math.max(0, width - 1 - widthOf(left) - widthOf(right))
  return [...left, { text: ' '.repeat(gap) }, ...right]
}

/** The game: the 3D view in a rounded frame, the minimap in its top-right corner, the clock and compass in the bottom edge. */
export const drawMaze = (g: Maze): Row[] => {
  const width = Math.max(1, g.columns - FRAME)
  const height = Math.max(1, g.rows - FRAME)
  const scene = sceneOf(g, width, height)
  const map = g.showMap ? minimapOf(g, width, height) : []
  const mapAt = Math.max(0, width - (map[0]?.length ?? 0) - 1)
  const withMap = scene.map((row, r) => (map[r] === undefined ? row : overlay(row, map[r]!, mapAt)))
  const color = frameColorOf(g)
  return framed(withMessages(g, withMap).map(merge), width, {
    title: `livello ${g.level}`,
    color,
    titleColor: color === PALETTE.frame ? PALETTE.sky : color,
    footer: footerOf(g, width),
  })
}
