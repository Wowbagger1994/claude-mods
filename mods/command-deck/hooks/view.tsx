import type { ElementTable, RenderSurface } from 'claude-code'

import type { DeckCommand, Todo } from '../types'

const MAX_HOTKEYS = 9

export type Actions = {
  /** Copies the text on the surface the press came from. */
  copy: (text: string, surface: RenderSurface) => unknown
  close: (todo: Todo) => unknown
  reopen: (todo: Todo) => unknown
  toggleDone: () => unknown
  clearCommands: () => unknown
}

export type DeckState = {
  open: readonly Todo[]
  closed: readonly Todo[]
  /** The answers' commands not already under a to-do. */
  commands: readonly DeckCommand[]
  isDoneShown: boolean
  /** Claude is reading the last answer for new to-dos. */
  isReading: boolean
}

/** A command with its Copia; `n` is its place among every copyable command, 1 first. */
const commandBlock = (el: ElementTable, key: string, text: string, warnings: readonly string[], n: number, act: Actions) => (
  <el.Box key={key} flexDirection="column">
    <el.Box flexDirection="row" columnGap={1}>
      <el.Button
        key={`copy:${key}`}
        label={`Copia ${n}`}
        hotkey={n <= MAX_HOTKEYS ? String(n) : undefined}
        variant={n === 1 ? 'primary' : undefined}
        onPress={press => act.copy(text, press.surface)}
      />
    </el.Box>
    <el.Code source={text} language="bash" />
    {warnings.map(w => (
      <el.Text key={`warn:${key}:${w}`} color="warning">{`⚠ ${w}`}</el.Text>
    ))}
  </el.Box>
)

const todoCard = (el: ElementTable, t: Todo, firstN: number, act: Actions) => (
  <el.Box key={`todo:${t.id}`} flexDirection="column">
    <el.Box flexDirection="row" columnGap={1}>
      <el.Text bold>{`○ ${t.title}`}</el.Text>
      <el.Button key={`close:${t.id}`} label="Fatto" plain dimColor onPress={() => act.close(t)} />
    </el.Box>
    {t.detail !== '' && <el.Text dimColor>{`  ${t.detail}`}</el.Text>}
    {t.commands.map((c, i) => commandBlock(el, `todo:${t.id}:${i}`, c.text, c.warnings, firstN + i, act))}
  </el.Box>
)

const doneList = (el: ElementTable, s: DeckState, act: Actions) =>
  s.closed.length > 0 && (
    <el.Box flexDirection="column">
      <el.Button
        key="toggle-done"
        label={`${s.isDoneShown ? '▾' : '▸'} Fatti (${s.closed.length})`}
        hotkey="f"
        plain
        dimColor
        onPress={() => act.toggleDone()}
      />
      {s.isDoneShown &&
        s.closed.map(t => (
          <el.Box key={`done:${t.id}`} flexDirection="row" columnGap={1}>
            <el.Text dimColor>{`✓ ${t.title} · ${t.closed?.by === 'claude' ? 'chiuso da Claude' : 'fatto da te'}`}</el.Text>
            <el.Button key={`reopen:${t.id}`} label="Riapri" plain dimColor onPress={() => act.reopen(t)} />
          </el.Box>
        ))}
    </el.Box>
  )

/** The deck: what is left to do, with its commands, then the answers' other commands, then what is done. */
export const deckView = (el: ElementTable, s: DeckState, act: Actions) => {
  // Copia numbers run through the to-dos' commands, then the loose ones: the hotkey is the number shown.
  const starts = s.open.reduce<number[]>((acc, t, i) => [...acc, (acc[i] ?? 1) + t.commands.length], [1])
  const looseStart = starts[s.open.length] ?? 1
  const isEmpty = s.open.length === 0 && s.commands.length === 0

  return (
    <el.Box flexDirection="column" gap={1}>
      <el.Box flexDirection="row" justifyContent="space-between">
        <el.Text bold color="claude">{`◆ Da fare (${s.open.length})`}</el.Text>
        {s.isReading && <el.Text dimColor italic>Claude rilegge l’ultima risposta…</el.Text>}
      </el.Box>
      {isEmpty && (
        <el.Text dimColor>
          Niente da fare. Qui finiscono le cose che Claude ti lascia da fare, con i loro comandi, e i comandi delle sue
          risposte: premi il numero per copiarli.
        </el.Text>
      )}
      {s.open.map((t, i) => todoCard(el, t, starts[i] ?? 1, act))}
      {s.commands.length > 0 && (
        <el.Box flexDirection="column" gap={1}>
          <el.Box flexDirection="row" justifyContent="space-between">
            <el.Text bold>Altri comandi delle risposte</el.Text>
            <el.Button key="clear" label="Svuota" hotkey="x" plain dimColor onPress={() => act.clearCommands()} />
          </el.Box>
          {s.commands.map((c, i) => (
            <el.Box key={`cmd:${c.id}`} flexDirection="column">
              {c.source === 'denied' && <el.Text color="warning">negato, da eseguire tu</el.Text>}
              {commandBlock(el, `cmd:${c.id}`, c.text, c.warnings, looseStart + i, act)}
            </el.Box>
          ))}
        </el.Box>
      )}
      {doneList(el, s, act)}
    </el.Box>
  )
}
