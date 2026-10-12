import { expect, test } from 'claude-code/testing'

import { ciCommands, defaultCommands, forThisMac, isCheckWorkflow, isFastCommand, isInstallingJob, jobsOf, parseOverride } from './detect'

const WORKFLOW = `name: CI
on: [push]
jobs: # every check
  lint:
    steps:
      - uses: actions/checkout@v4
      # Nothing to pip install here: the standard library is enough.
      - name: Lint modules
        run: python3 tools/ci/lint_modules.py
      - name: "Contract tests"
        run: python -m unittest discover -s tools/ci/tests -v
      - run: go test ./...
      - name: Smoke the model
        run: python scripts/_smoke_claude.py || true
      - name: Audit
        run: npm audit --omit=dev
  unit:
    steps:
      - name: Install
        run: pip install -r requirements.txt
      - name: Import the worker
        run: python -c "import worker.main"
  web:
    steps:
      - run: npm ci
      - run: npm test
  deps-in-a-script:
    steps:
      - name: Dependencies
        run: |
          python -m pip install --upgrade pip
      - name: Unit
        run: python -m unittest -v
  smoke:
    steps:
      - name: Install and test in Docker
        run: |
          docker compose up -d
          python3 -m pytest
      - name: Bring up
        run: docker compose up -d db
`

test('a workflow’s fast steps: one-line runs of a known runner, named by their step; scripts, Docker and allowed failures left to the CI', () => {
  expect(ciCommands(WORKFLOW, false)).toEqual([
    { label: 'Lint modules', command: 'python3 tools/ci/lint_modules.py' },
    { label: 'Contract tests', command: 'python3 -m unittest discover -s tools/ci/tests -v' },
    { label: 'go test ./...', command: 'go test ./...' },
  ])
})

test('a job that installs dependencies this repository lacks is left to the CI whole: its steps would fail for that', () => {
  const jobs = jobsOf(WORKFLOW)
  expect(jobs.map(j => j[0]!.trim())).toEqual(['lint:', 'unit:', 'web:', 'deps-in-a-script:', 'smoke:'])
  expect(jobs.map(j => isInstallingJob(j, false))).toEqual([false, true, true, true, false])
  // With node_modules here, what `npm ci` installs is already in place: the job's steps count.
  expect(jobs.map(j => isInstallingJob(j, true))).toEqual([false, true, false, true, false])
  expect(ciCommands(WORKFLOW, true).map(c => c.command)).toEqual(['python3 tools/ci/lint_modules.py', 'python3 -m unittest discover -s tools/ci/tests -v', 'go test ./...', 'npm test'])
  const step = (cmd: string) => [`      - run: ${cmd}`]
  const always = ['pip3 install x', 'uv sync', 'uv pip install -e .', 'poetry install', 'pipenv sync', 'conda env create -f e.yml', 'bundle install', 'composer install', 'sudo apt-get install -y xvfb', 'brew install jq']
  expect(always.filter(cmd => !isInstallingJob(step(cmd), true))).toEqual([])
  const javascript = ['npm install', 'npm i', 'yarn install', 'pnpm i', 'bun install']
  expect(javascript.filter(cmd => !isInstallingJob(step(cmd), false))).toEqual([])
  expect(javascript.filter(cmd => isInstallingJob(step(cmd), true))).toEqual([])
  expect(['npm init', 'npm test', 'go mod download', 'python3 -m pip list'].filter(cmd => isInstallingJob(step(cmd), false))).toEqual([])
})

test('jobs end where the next top-level key begins', () => {
  expect(jobsOf('jobs:\n  a:\n    steps: []\nenv:\n  X: 1\n')).toEqual([['  a:', '    steps: []']])
  expect(jobsOf('name: no jobs\non: push\n')).toEqual([])
})

test('fast means a known runner and nothing heavy', () => {
  expect(isFastCommand('make test')).toBe(true)
  expect(isFastCommand('npm run lint')).toBe(true)
  expect(isFastCommand('npm ci')).toBe(false)
  expect(isFastCommand('npm run build')).toBe(false)
  expect(isFastCommand('./deploy.sh')).toBe(false)
  expect(isFastCommand('./run-all.sh')).toBe(false)
  expect(isFastCommand('echo ok')).toBe(false)
  expect(isFastCommand('python3 tools/ci/lint.py')).toBe(true)
  expect(isFastCommand('python3 run.py || true')).toBe(false)
  expect(forThisMac('python -m x')).toBe('python3 -m x')
  expect(forThisMac('python3 -m x')).toBe('python3 -m x')
})

test('deploy and release workflows are never copied, by file name or by name', () => {
  expect(isCheckWorkflow('ci.yml', 'name: CI')).toBe(true)
  expect(isCheckWorkflow('deploy-prod.yml', 'name: CI')).toBe(false)
  expect(isCheckWorkflow('main.yaml', 'name: Release to npm')).toBe(false)
  expect(isCheckWorkflow('README.md', 'name: CI')).toBe(false)
})

test('the repository’s own list wins, when it is well formed', () => {
  expect(parseOverride('{"checks":[{"label":"unit","command":"make unit"}]}')).toEqual([{ label: 'unit', command: 'make unit' }])
  expect(parseOverride('{"checks":[{"label":"unit"}]}')).toBeNull()
  expect(parseOverride('{"tests":[]}')).toBeNull()
  expect(parseOverride('nope')).toBeNull()
})

test('with no CI, the usual test of the project’s kind', () => {
  expect(defaultCommands(['go.mod'], null)?.commands[0]?.command).toBe('go test ./...')
  expect(defaultCommands(['package.json', 'bun.lock'], '{"scripts":{"test":"bun test"}}')?.commands[0]?.command).toBe('bun run test')
  expect(defaultCommands(['package.json'], '{"scripts":{"test":"vitest"}}')?.commands[0]?.command).toBe('npm test --silent')
  expect(defaultCommands(['package.json'], '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}')).toBeNull()
  expect(defaultCommands(['conftest.py'], null)?.what).toBe('pytest')
  expect(defaultCommands(['README.md'], null)).toBeNull()
})
