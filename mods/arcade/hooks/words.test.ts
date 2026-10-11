import { describe, expect, test } from 'claude-code/testing'

import { MAX_WORDS, addWords, isSecretFile, wordsFrom } from './words'

describe('wordsFrom', () => {
  test('keeps identifiers of 4 to 14 characters once, leaving out constants in capitals', () => {
    const code = 'const cartTotal = applyDiscount(items, MAX_ITEMS); for (const item of items) total += item.price; veryLongIdentifierName'

    expect(wordsFrom(code)).toEqual(['const', 'cartTotal', 'applyDiscount', 'items', 'item', 'total', 'price'])
  })
})

describe('addWords', () => {
  test('puts the new words first, each once, and keeps at most MAX_WORDS', () => {
    const pool = Array.from({ length: MAX_WORDS }, (_, i) => `word${i}`)
    const next = addWords(pool, ['fresh', 'word3'])

    expect(next.slice(0, 3)).toEqual(['fresh', 'word3', 'word0'])
    expect(next).toHaveLength(MAX_WORDS)
    expect(next.filter(w => w === 'word3')).toHaveLength(1)
  })
})

test('files that may hold secrets give no words: .env, keys, credentials', () => {
  for (const path of ['/r/.env', '/r/.env.local', '/r/config/secrets.yml', '/r/aws_credentials', '/r/certs/server.key', '/r/id.pem', '/r/db_password.txt']) expect(isSecretFile(path)).toBe(true)
  for (const path of ['/r/src/app.ts', '/r/environment.ts', '/r/keyboard.ts', '/r/README.md']) expect(isSecretFile(path)).toBe(false)
})
