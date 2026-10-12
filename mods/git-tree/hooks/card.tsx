import type { ElementTable, RenderChildren, RenderSurface } from 'claude-code'

import type { Commit, FileChange } from '../types'
import type { GitAction } from './commands'
import { switchActions } from './commands'
import type { GraphRow } from './graph'
import { fullDate, wrapText } from './labels'
import type { Actions, TreeView } from './view'
import { graphCells, laneColor } from './paint'

const FILES_SHOWN = 8
const BODY_LINES = 12
/** The card's frame and padding, left and right. */
const FRAME = 4
const MIN_INNER = 10
/** What a Button may draw besides its label: a hotkey's mark, its gap. */
const BUTTON_EXTRA = 3
const BUTTON_GAP = 2

type Line = { key: string; el: RenderChildren }
type CardButton = { key: string; label: string; hotkey?: string; onPress: (press: { surface: RenderSurface }) => unknown }

/** A path cut from the left, so the file name stays. */
const tailCut = (path: string, room: number) => (path.length <= room ? path : `…${path.slice(path.length - room + 1)}`)

/** The message after its first line, without the blank lines around it. */
export const bodyOf = (message: string) => message.split('\n').slice(1).join('\n').trim()

/** Buttons in rows that fit `width`, by their labels' length. */
export const packRows = <T extends { label: string }>(buttons: readonly T[], width: number): T[][] =>
  buttons.reduce<{ rows: T[][]; used: number }>(
    (acc, b) => {
      const size = b.label.length + BUTTON_EXTRA
      const last = acc.rows[acc.rows.length - 1]
      if (last !== undefined && acc.used + BUTTON_GAP + size <= width) return { rows: [...acc.rows.slice(0, -1), [...last, b]], used: acc.used + BUTTON_GAP + size }
      return { rows: [...acc.rows, [b]], used: size }
    },
    { rows: [], used: 0 },
  ).rows

const count = (n: number | null) => (n === null ? 'bin' : String(n))

const fileLines = (el: ElementTable, files: readonly FileChange[], inner: number): Line[] => {
  const added = files.reduce((n, f) => n + (f.added ?? 0), 0)
  const removed = files.reduce((n, f) => n + (f.removed ?? 0), 0)
  const summary: Line = {
    key: 'files',
    el: (
      <el.Text key="files">
        <el.Text bold>{`${files.length} file · `}</el.Text>
        <el.Text color="success">{`+${added} `}</el.Text>
        <el.Text color="error">{`−${removed}`}</el.Text>
      </el.Text>
    ),
  }
  const shown = files.slice(0, FILES_SHOWN).map((f, i) => {
    const plus = `+${count(f.added)}`.padStart(6)
    const minus = `−${count(f.removed)}`.padEnd(6)
    return {
      key: `file:${i}`,
      el: (
        <el.Text key={`file:${i}`}>
          <el.Text color="success">{plus}</el.Text>
          <el.Text color="error">{` ${minus} `}</el.Text>
          <el.Text>{tailCut(f.path, inner - plus.length - minus.length - 2)}</el.Text>
        </el.Text>
      ),
    }
  })
  const rest = files.length - FILES_SHOWN
  return [summary, ...shown, ...(rest > 0 ? [{ key: 'more-files', el: <el.Text key="more-files" dimColor>{rest === 1 ? '… e un altro file' : `… e altri ${rest} file`}</el.Text> }] : [])]
}

const buttonRow = (el: ElementTable, key: string, buttons: readonly CardButton[]): Line => ({
  key,
  el: (
    <el.Box key={key} flexDirection="row" columnGap={BUTTON_GAP}>
      {buttons.map(b => (
        <el.Button key={b.key} label={b.label} hotkey={b.hotkey} plain onPress={b.onPress} />
      ))}
    </el.Box>
  ),
})

/** What can be done from the commit: go there, branch there, copy, ask. */
const actionLines = (el: ElementTable, s: TreeView, c: Commit, inner: number, act: Actions): Line[] => {
  if (s.pending !== null && s.pending.args[0] !== 'fetch') {
    const command = `$ git ${s.pending.args.join(' ')}`
    return [
      ...wrapText(s.pending.explain, inner).map((t, i) => ({ key: `explain:${i}`, el: <el.Text key={`explain:${i}`} color="warning">{t}</el.Text> })),
      { key: 'command', el: <el.Text key="command" dimColor>{command.length <= inner ? command : `${command.slice(0, inner - 1)}…`}</el.Text> },
      {
        key: 'answer',
        el: (
          <el.Box key="answer" flexDirection="row" columnGap={BUTTON_GAP}>
            <el.Button key="confirm" label="Sì, esegui" hotkey="s" variant="primary" onPress={() => act.confirm()} />
            <el.Button key="cancel" label="Annulla" hotkey="n" plain dimColor onPress={() => act.cancel()} />
          </el.Box>
        ),
      },
    ]
  }
  if (s.isNaming) {
    return [
      ...wrapText(`Nome del nuovo ramo, da ${c.sha.slice(0, 7)} (Invio per crearlo):`, inner).map((t, i) => ({
        key: `name-label:${i}`,
        el: <el.Text key={`name-label:${i}`} bold>{t}</el.Text>,
      })),
      {
        key: 'name',
        el:
          'Input' in el ? (
            <el.Input key="branch-name" placeholder="feature/…" submitLabel="Crea" autoFocus onSubmit={(value: string) => act.submitBranch(value.trim())} />
          ) : (
            <el.Text key="branch-name" dimColor>{`Qui non si può scrivere: git branch <nome> ${c.sha.slice(0, 7)}`}</el.Text>
          ),
      },
      ...wrapText(s.nameProblem ?? ' ', inner).map((t, i) => ({
        key: `name-problem:${i}`,
        el: <el.Text key={`name-problem:${i}`} color="error">{t === '' ? ' ' : t}</el.Text>,
      })),
      buttonRow(el, 'name-cancel', [{ key: 'cancel-name', label: 'Annulla', onPress: () => act.cancel() }]),
    ]
  }
  const switches: GitAction[] = switchActions(c, s.localNames, s.headSha, s.head.branch === null)
  const goLines: Line[] =
    switches.length > 0 && s.head.changed > 0
      ? wrapText(`Per cambiare ramo, prima committa o metti da parte (git stash) ${s.head.changed === 1 ? 'il file modificato' : `i ${s.head.changed} file modificati`}.`, inner).map((t, i) => ({
          key: `dirty:${i}`,
          el: <el.Text key={`dirty:${i}`} color="warning">{t}</el.Text>,
        }))
      : packRows<CardButton>(
          switches.map((a, i) => ({ key: `switch:${i}`, label: a.label, hotkey: i === 0 ? 'p' : undefined, onPress: () => act.ask(a) })),
          inner,
        ).map((r, i) => buttonRow(el, `switches:${i}`, r))
  const tools = packRows<CardButton>(
    [
      { key: 'branch', label: '⑂ nuovo ramo qui', hotkey: 'b', onPress: () => act.startBranch() },
      { key: 'copy', label: '⧉ copia hash', hotkey: 'y', onPress: press => act.copy(c.sha, press.surface) },
      { key: 'explain', label: '✦ chiedi a Claude', hotkey: 'c', onPress: () => act.explain(c) },
    ],
    inner,
  ).map((r, i) => buttonRow(el, `tools:${i}`, r))
  return [...goLines, ...tools]
}

/** Every line of the card, each one row high, so the lanes beside it can match. */
export const cardLines = (el: ElementTable, s: TreeView, c: Commit, inner: number, act: Actions): Line[] => {
  const blank = (key: string): Line => ({ key, el: <el.Text key={key}> </el.Text> })
  const meta = `${c.sha} · ${c.author} · ${fullDate(c.at)}`
  const body = s.detail?.sha === c.sha ? wrapText(bodyOf(s.detail.body), inner) : []
  const isBodyLong = body.length > BODY_LINES
  return [
    { key: 'meta', el: <el.Text key="meta" dimColor>{meta.length <= inner ? meta : `${meta.slice(0, inner - 1)}…`}</el.Text> },
    blank('gap1'),
    ...wrapText(c.subject, inner).map((t, i) => ({ key: `subject:${i}`, el: <el.Text key={`subject:${i}`} bold>{t === '' ? ' ' : t}</el.Text> })),
    ...body.slice(0, BODY_LINES).map((t, i) => ({ key: `body:${i}`, el: <el.Text key={`body:${i}`}>{t === '' ? ' ' : t}</el.Text> })),
    ...(isBodyLong ? [{ key: 'body-more', el: <el.Text key="body-more" dimColor>…</el.Text> }] : []),
    blank('gap2'),
    ...(s.detail?.sha === c.sha
      ? fileLines(el, s.detail.files, inner)
      : wrapText(s.isDetailFailed ? 'Non riesco a leggere il commit: r per riprovare.' : 'leggo il commit…', inner).map((t, i) => ({
          key: `loading:${i}`,
          el: <el.Text key={`loading:${i}`} color={s.isDetailFailed ? 'error' : undefined} dimColor={!s.isDetailFailed} italic>{t}</el.Text>,
        }))),
    blank('gap3'),
    ...actionLines(el, s, c, inner, act),
  ]
}

/**
 * The selected commit opened under its row, framed in its lane's colour; the
 * lanes going on below it are drawn beside the card, as tall as it is.
 */
export const card = (el: ElementTable, s: TreeView, c: Commit, row: GraphRow, width: number, act: Actions) => {
  // `width` is the graph's as drawn: already within its share of the pane.
  const besideWidth = 2 + width + 2
  const inner = Math.max(MIN_INNER, s.columns - besideWidth - FRAME)
  const lines = cardLines(el, s, c, inner, act)
  const height = lines.length + 2
  return (
    <el.Box key="card" flexDirection="row">
      <el.Box flexDirection="column" width={besideWidth}>
        {Array.from({ length: height }, (_, i) => (
          <el.Text key={`beside:${i}`}>
            <el.Text>{'  '}</el.Text>
            {graphCells(el, row.below, width, `beside:${i}`)}
          </el.Text>
        ))}
      </el.Box>
      <el.Box flexDirection="column" borderStyle="round" borderColor={laneColor(row.color)} paddingX={1} width={inner + FRAME}>
        {lines.map(l => l.el)}
      </el.Box>
    </el.Box>
  )
}
