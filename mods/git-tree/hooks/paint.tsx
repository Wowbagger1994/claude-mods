import type { Color, ElementTable } from 'claude-code'

import type { GraphRow } from './graph'

/** The branches' colours: the one you are on first, then the others in the order the panorama shows them. */
export const LANE_COLORS: readonly Color[] = ['claude', 'suggestion', 'success', 'merged', 'warning', 'planMode', 'ide', 'remember', 'autoAccept', 'permission']
/** The graph takes at most this share of the pane; wider, its right end is cut. */
const GRAPH_SHARE = 0.4
const MIN_GRAPH = 7

export const laneColor = (color: number): Color | undefined => (color < 0 ? undefined : LANE_COLORS[color % LANE_COLORS.length])

/** The graph's room: all of it, or its share of the pane with the rest cut. */
export const graphRoom = (width: number, columns: number) => Math.min(width, Math.max(MIN_GRAPH, Math.floor(columns * GRAPH_SHARE)))

/** The graph's characters, each in its lane's colour, padded or cut to `width`: a cut one ends in `…`. */
export const graphCells = (el: ElementTable, all: GraphRow['cells'], width: number, key: string) => [
  ...(all.length <= width ? all : [...all.slice(0, width - 1), { ch: '…', color: -1 }]).map((c, i) => (
    <el.Text key={`${key}:${i}`} color={laneColor(c.color)} bold>
      {c.ch}
    </el.Text>
  )),
  <el.Text key={`${key}:pad`}>{' '.repeat(Math.max(0, width - all.length))}</el.Text>,
]

/** A text cut to `room` characters, `…` at the cut; nothing when there is no room. */
export const cut = (text: string, room: number) => (room <= 1 ? '' : text.length <= room ? text : `${text.slice(0, room - 1)}…`)

/** A text padded or cut to exactly `width` characters. */
export const fit = (text: string, width: number) => cut(text, width).padEnd(width)
