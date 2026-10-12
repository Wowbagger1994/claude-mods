import type { Commit, Ref } from '../types'
import { shortRef } from './labels'

/** A git command the person confirms before it runs: what it does, in words. */
export type GitAction = { label: string; args: string[]; explain: string }

const short = (sha: string) => sha.slice(0, 7)

/**
 * Where the person can go from a commit: each local branch on it but the one
 * checked out, each GitHub branch with no local one of its name (made, then
 * entered), else the commit itself with no branch.
 */
export const switchActions = (commit: Commit, localNames: ReadonlySet<string>, headSha: string | null, isDetached: boolean): GitAction[] => {
  // A name with a leading dash would reach git as an option: git never makes one, a hand-made ref could.
  const isPlain = (name: string) => !name.startsWith('-')
  const locals = commit.refs.filter(r => r.kind === 'local' && isPlain(r.name)).map(r => r.name)
  const remotes = commit.refs
    .filter((r): r is Ref & { kind: 'remote' } => r.kind === 'remote' && r.name.includes('/'))
    .map(r => ({ remote: r.name, name: r.name.slice(r.name.indexOf('/') + 1) }))
    .filter(r => isPlain(r.name) && !localNames.has(r.name))
  // Leaving a detached HEAD strands the commits made there that no branch holds.
  const leaving = isDetached ? ` Ora sei su una HEAD staccata: i commit fatti lì e non su un ramo resteranno solo nel reflog (git reflog).` : ''
  const actions: GitAction[] = [
    ...locals.map(name => ({ label: `⇄ passa a ${shortRef(name)}`, args: ['switch', name], explain: `Passi al ramo ${name}.${leaving}` })),
    ...remotes.map(r => ({
      label: `⇄ passa a ${shortRef(r.name)}`,
      args: ['switch', '--create', r.name, '--track', r.remote],
      explain: `Crei il ramo locale ${r.name}, collegato a ${r.remote} su GitHub, e ci passi.${leaving}`,
    })),
  ]
  if (actions.length > 0 || commit.sha === headSha) return actions
  return [
    {
      label: '⇄ passa a questo commit',
      args: ['switch', '--detach', commit.sha],
      explain: `Passi al commit ${short(commit.sha)} senza un ramo (HEAD staccata). Per tenere i commit che farai lì, crea poi un ramo.${leaving}`,
    },
  ]
}

/** Why a branch name cannot be used, before git is asked; null when it may. */
export const branchNameProblem = (name: string, localNames: ReadonlySet<string>): string | null => {
  if (name === '') return 'Scrivi un nome.'
  // A leading dash would reach git as an option.
  if (name.startsWith('-')) return 'Il nome non può cominciare con «-».'
  if (/\s/.test(name)) return 'Il nome non può contenere spazi.'
  if (localNames.has(name)) return `Il ramo ${name} esiste già.`
  return null
}

export const branchAction = (name: string, commit: Commit): GitAction => ({
  label: `⑂ ${name}`,
  args: ['branch', name, commit.sha],
  explain: `Crei il ramo ${name} sul commit ${short(commit.sha)}. Resti dove sei.`,
})

export const FETCH: GitAction = {
  label: '↓ Scarica da GitHub',
  args: ['fetch', '--all'],
  explain: 'Scarichi da GitHub i rami e i commit nuovi. Non cambia i tuoi file né i tuoi rami locali.',
}

/**
 * The prompt that asks Claude to explain a commit: its hash and the repository
 * only. The message is the repository's text, anyone's: Claude reads it as data, with git show.
 */
export const explainPrompt = (commit: Commit, root: string) =>
  `Spiegami il commit ${short(commit.sha)} del repository ${root}: che cosa cambia e perché. Leggilo con git show. Non fare commit né push e non cambiare ramo.`
