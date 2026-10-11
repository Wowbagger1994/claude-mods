import { describe as group, expect, test } from 'claude-code/testing'

import { describe, entropy, hasMask, maskDeep, maskText } from './detect'

const ALNUM = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
const URLSAFE = `${ALNUM}_-`

/** A fake secret body of `n` characters from a seeded generator: no real value ever lives in this file. */
const random = (n: number, alphabet = ALNUM, seed = 7): string => {
  let s = seed
  return Array.from({ length: n }, () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return alphabet[(s >>> 8) % alphabet.length]
  }).join('')
}
const join = (...parts: string[]) => parts.join('')

const kindsOf = (text: string) => maskText(text).found.map(f => f.kind)

group('known token shapes', () => {
  const cases: [string, string, string][] = [
    ['google-refresh', join('1', '//', '0g', random(60, URLSAFE)), 'token di aggiornamento Google 1//'],
    ['google-access', join('ya', '29.', random(80, URLSAFE)), 'token Google ya29.'],
    ['user-token', join('nt', 'ok_', random(24)), 'token ntok_'],
    ['user-token', join('ni', 'ns_', random(24)), 'token nins_'],
    ['user-token', join('ng', 'at_', random(24)), 'token ngat_'],
    ['anthropic', join('sk-', 'ant-api03-', random(40, URLSAFE)), 'chiave Anthropic sk-ant-'],
    ['openai', join('sk-', 'proj-', random(40)), 'chiave OpenAI sk-'],
    ['github', join('gh', 'p_', random(36)), 'token GitHub ghp_'],
    ['github', join('github', '_pat_', random(40)), 'token GitHub github_pat_'],
    ['gitlab', join('gl', 'pat-', random(20)), 'token GitLab glpat-'],
    ['slack', join('xo', 'xb-', random(12, '0123456789'), '-', random(24)), 'token Slack xoxb-'],
    ['aws', join('AK', 'IA', random(16, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567')), 'chiave AWS AKIA'],
    ['google-api', join('AI', 'za', random(35, URLSAFE)), 'chiave API Google AIza'],
    ['stripe', join('sk', '_live_', random(24)), 'chiave Stripe sk_live_'],
    ['npm', join('np', 'm_', random(36)), 'token npm npm_'],
    ['jwt', join('ey', 'J', random(20, URLSAFE), '.ey', 'J', random(30, URLSAFE), '.', random(40, URLSAFE)), 'token JWT'],
  ]

  for (const [kind, secret, label] of cases) {
    test(`${label}: blotted out, nothing of its body left`, () => {
      const m = maskText(`prima ${secret} dopo`)

      expect(m.found.map(f => f.kind)).toEqual([kind])
      expect(m.text).toBe(`prima [segreto oscurato: ${label}] dopo`)
      expect(m.text).not.toContain(secret.slice(-12))
    })
  }

  test('a private key block, all its lines', () => {
    const block = ['-----BEGIN', ' OPENSSH PRIVATE KEY-----', '\n', random(64), '\n', random(64), '\n-----END', ' OPENSSH PRIVATE KEY-----'].join('')
    const m = maskText(`chiave:\n${block}\nfine`)

    expect(m.text).toBe('chiave:\n[segreto oscurato: chiave privata]\nfine')
  })
})

group('.env lines', () => {
  test('blots out the value and keeps the name', () => {
    const value = random(20)
    const m = maskText(`DB_HOST=localhost\nexport DB_PASSWORD="${value}"\nGOOGLE_CLIENT_SECRET=${random(24, URLSAFE, 3)}`)

    expect(m.text).toBe(
      'DB_HOST=localhost\nexport DB_PASSWORD=[segreto oscurato: valore di DB_PASSWORD]\nGOOGLE_CLIENT_SECRET=[segreto oscurato: valore di GOOGLE_CLIENT_SECRET]',
    )
  })

  test('leaves references, placeholders and short values alone', () => {
    const text = ['API_TOKEN=$API_TOKEN', 'DB_PASSWORD=${DB_PASSWORD}', 'SECRET_KEY=changeme', 'AUTH_TOKEN=<il tuo token>', 'API_KEY=your-api-key', 'PASSWORD=abc'].join('\n')

    expect(maskText(text)).toEqual({ text, found: [] })
  })
})

group('long random strings', () => {
  test('a random string of 40 characters is blotted out', () => {
    expect(kindsOf(`chiave: ${random(40, `${ALNUM}+/`)}`)).toEqual(['random'])
  })

  test('a random key that holds slashes, as an AWS secret does, is no path', () => {
    const key = join(random(13, ALNUM, 3), '/', random(7, ALNUM, 5), '/', random(20, ALNUM, 9))

    expect(kindsOf(`aws_secret_access_key = ${key}`)).toEqual(['random'])
  })

  test('what only looks long is left alone', () => {
    const text = [
      'commit 3f5a9c2e8b1d4f7a6c0e9b2d5f8a1c4e7b0d3f6a', // git sha (hex)
      'sha256:9b74c9897bac770ffc029102a200c5de9b74c9897bac770ffc029102a200c5de', // docker digest (hex)
      '"integrity": "sha512-' + random(86, `${ALNUM}+/`) + '=="', // npm lockfile
      'id 123e4567-e89b-12d3-a456-426614174000', // UUID
      '/Users/me/Repos/acme/_docs/rami-deploy/branch-structure.drawio',
      'src/components/checkout/PaymentMethodSelector/usePaymentMethodValidation.ts',
      'getUserAuthenticationTokenFromRequestHeaders parseV2ResponseForAccountSettings2',
      // Identifiers random enough on their own (3 classes, ≥ 4.3 bits): only their shape saves them.
      'handleOAuth2CallbackWithPKCEVerifierAndState validateJWT2FactorTokenExchangeRequestQuickly',
      // Three classes and long, but repetitive: entropy alone says it is no secret.
      'xy-12-XY-'.repeat(5),
      'const token: string = await getToken()',
      'const apiKey = process.env.API_KEY',
      // Public npm URLs from a real lockfile: segments with digits right after letters, and a file name.
      '"resolved": "https://registry.npmjs.org/@esbuild/win32-arm64/-/win32-arm64-0.28.1.tgz"',
      'il piano sta in `iso27001/Piano_di_gruppo/allegati/2026-09-DIARIO_iso.md`',
      // Word segments with digits and no file name: only their shape says path.
      'targets win32arm64/linux64gnu8/armv7hf/darwin12arm64/x86linux/musl1x',
      // Segments that look random, but a file name at the end: only the extension says path.
      'export Xk92Jd7Lq0/Bz7Qw3Lp9Rt/Mn4Vb8Cx2Zq.pdf',
      // An environment assignment: the name, the sign and a host are three things, not one random string.
      'PUBLIC_RADAR_URL=radar.acmetest.it \\',
    ].join('\n')

    expect(maskText(text)).toEqual({ text, found: [] })
  })

  test('entropy: a repeated letter has none, a uniform alphabet of 64 has 6 bits', () => {
    expect(entropy('aaaaaaaa')).toBe(0)
    expect(Math.abs(entropy(ALNUM + '+/') - 6)).toBeLessThan(1e-9)
  })
})

group('maskDeep', () => {
  test('masks every string of a copy and leaves image data, paths and the original alone', () => {
    const token = join('ya', '29.', random(40, URLSAFE))
    const original = {
      type: 'text',
      file: { filePath: '/r/.env', content: `TOKEN=${token}`, numLines: 1 },
      image: { base64: random(80, `${ALNUM}+/`) },
      lines: ['ok', token],
    }
    const frozen = JSON.parse(JSON.stringify(original))
    const m = maskDeep(original)

    expect(m.found).toHaveLength(2)
    expect(m.value).toEqual({
      type: 'text',
      file: { filePath: '/r/.env', content: 'TOKEN=[segreto oscurato: token Google ya29.]', numLines: 1 },
      image: original.image,
      lines: ['ok', '[segreto oscurato: token Google ya29.]'],
    })
    expect(original).toEqual(frozen)
  })

  test('a value with nothing to hide comes back equal and finds nothing', () => {
    const value = { stdout: 'tutto bene', stderr: '', interrupted: false }

    expect(maskDeep(value)).toEqual({ value, found: [] })
  })
})

test('describe counts each label once; hasMask spots a blotted-out value', () => {
  const found = [
    { kind: 'random', label: 'stringa casuale' },
    { kind: 'google-access', label: 'token Google ya29.' },
    { kind: 'random', label: 'stringa casuale' },
  ]

  expect(describe(found)).toBe('stringa casuale ×2, token Google ya29.')
  expect(hasMask('x = "[segreto oscurato: token Google ya29.]"')).toBe(true)
  expect(hasMask('nessun segreto')).toBe(false)
})
