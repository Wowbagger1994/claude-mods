import type { CheckCommand, CheckSource } from '../types'

/** Workflows that ship things, not check them: never run locally. */
const SHIPPING = /deploy|release|publish/i
/** What a fast local check starts with. */
const RUNNERS = new Set(['python3', 'python', 'pytest', 'go', 'npm', 'npx', 'bun', 'node', 'cargo', 'make', 'ruff', 'mypy'])
/** Words that mean a step needs more than the checkout: services, installs, the network, a deploy. */
const HEAVY = /\b(?:docker|compose|install|npm\s+ci|deploy|ssh|scp|curl|wget|sudo|apt|brew|push|publish|login|secrets?|audit|build|smoke)\b/i
/** A step allowed to fail is no check. */
const ALLOWED_TO_FAIL = /\|\|\s*true\s*$/

const STEP_START = /^(\s*)-\s+/
const NAME = /^\s*(?:-\s+)?name:\s*(.+?)\s*$/
const RUN = /^\s*(?:-\s+)?run:\s*(.+?)\s*$/

const unquote = (text: string) => text.replace(/^(['"])(.*)\1$/, '$2')

/** A step's command that a laptop runs in seconds: a known runner, nothing heavy. */
export const isFastCommand = (command: string): boolean => {
  const first = command.trim().split(/\s+/)[0] ?? ''
  return RUNNERS.has(first) && !HEAVY.test(command) && !ALLOWED_TO_FAIL.test(command)
}

/** The Mac has no bare `python`: the CI's `python` is its `python3` here. */
export const forThisMac = (command: string): string => command.replace(/^python(\s)/, 'python3$1')

/**
 * The fast steps of a workflow: those whose `run:` is one line a laptop runs as is.
 * A many-line `run: |` (a script, a service) is left to the CI: `|` is no runner.
 */
export const ciCommands = (workflow: string): CheckCommand[] => {
  const found: CheckCommand[] = []
  let name: string | null = null
  for (const line of workflow.split('\n')) {
    if (STEP_START.test(line)) name = null
    const named = NAME.exec(line)
    if (named !== null) name = unquote(named[1]!)
    const run = RUN.exec(line)
    if (run === null) continue
    const command = unquote(run[1]!)
    if (isFastCommand(command)) found.push({ label: name ?? command, command: forThisMac(command) })
  }
  return found
}

/** Workflow files worth reading for checks, by name. */
export const isCheckWorkflow = (fileName: string, text: string): boolean =>
  /\.ya?ml$/.test(fileName) && !SHIPPING.test(fileName) && !SHIPPING.test(/^name:\s*(.+)$/m.exec(text)?.[1] ?? '')

/** `.claude/checks.json`: `{ "checks": [{ "label": "…", "command": "…" }] }`; null when malformed. */
export const parseOverride = (text: string): CheckCommand[] | null => {
  try {
    const raw = JSON.parse(text) as { checks?: unknown }
    if (!Array.isArray(raw.checks)) return null
    const checks = raw.checks.filter(
      (c): c is CheckCommand => typeof c === 'object' && c !== null && typeof (c as CheckCommand).label === 'string' && typeof (c as CheckCommand).command === 'string',
    )
    return checks.length === raw.checks.length ? checks : null
  } catch {
    return null
  }
}

/** Without a CI to copy: the usual test command of the project's kind. */
export const defaultCommands = (files: readonly string[], packageJson: string | null): { commands: CheckCommand[]; what: string } | null => {
  if (files.includes('go.mod')) return { commands: [{ label: 'go test', command: 'go test ./...' }], what: 'go.mod' }
  if (packageJson !== null) {
    try {
      const scripts = (JSON.parse(packageJson) as { scripts?: Record<string, unknown> }).scripts ?? {}
      if (typeof scripts.test === 'string' && !/no test specified/.test(scripts.test)) {
        const runner = files.includes('bun.lockb') || files.includes('bun.lock') ? 'bun run test' : 'npm test --silent'
        return { commands: [{ label: 'test', command: runner }], what: 'package.json' }
      }
    } catch {
      return null
    }
  }
  if (files.includes('pytest.ini') || files.includes('conftest.py')) return { commands: [{ label: 'pytest', command: 'python3 -m pytest -q' }], what: 'pytest' }
  if (files.includes('Cargo.toml')) return { commands: [{ label: 'cargo test', command: 'cargo test --quiet' }], what: 'Cargo.toml' }
  return null
}

export const sourceLabel = (s: CheckSource): string => {
  switch (s.kind) {
    case 'override':
      return `da ${s.path}`
    case 'ci':
      return `i passi veloci di ${s.path}`
    case 'default':
      return `dal ${s.what}`
    case 'none':
      return 'nessun test trovato'
  }
}
