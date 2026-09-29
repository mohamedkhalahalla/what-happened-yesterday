/**
 * The seed is an identity, not a quantity.
 *
 * That distinction is the whole of this file. A date range can be clamped to
 * something sensible when it is wrong; a seed cannot, because every seed is
 * equally valid and none of them is *near* another. `1e9`, `0x2a` and `42.0`
 * all have obvious numeric readings and no obvious seed reading, so they are
 * refused rather than coerced into showing a quarter nobody asked for.
 */

import { describe, expect, it } from 'vitest'

import { SEED } from '../data/config'
import { isDefaultSeed, parseSeed, randomSeed, searchWithSeed, serializeSeed } from './seed'

describe('parseSeed', () => {
  it('reads a plain unsigned integer', () => {
    expect(parseSeed('?seed=42')).toEqual({ seed: 42, invalid: false })
    expect(parseSeed('?seed=0')).toEqual({ seed: 0, invalid: false })
    expect(parseSeed('?seed=4294967295')).toEqual({ seed: 4294967295, invalid: false })
  })

  it('defaults quietly when there is no seed', () => {
    for (const search of ['', '?from=2026-09-20&to=2026-09-26', '?seed=', '?seed=%20']) {
      expect(parseSeed(search), search).toEqual({ seed: SEED, invalid: false })
    }
  })

  it.each([
    ['a negative number', '-1'],
    ['a decimal', '42.0'],
    ['exponent notation', '1e9'],
    ['hexadecimal', '0x2a'],
    ['above 32 bits', '4294967296'],
    ['padded with spaces', ' 42 '],
    ['words', 'random'],
    ['a list', '1,2'],
  ])('refuses %s rather than guessing', (_name, value) => {
    const result = parseSeed(`?seed=${encodeURIComponent(value)}`)

    expect(result.seed).toBe(SEED)
    expect(result.invalid).toBe(true)
  })

  it('never throws, whatever it is handed', () => {
    for (const search of ['?seed=%%%', '?seed=%E0%A4%A', '?', '???', '?seed=1&seed=2']) {
      expect(() => parseSeed(search), search).not.toThrow()
    }
  })
})

describe('serializeSeed', () => {
  it('says nothing about the default quarter', () => {
    // The everyday link has no seed in it, so a link that *has* one is a link
    // that genuinely says something.
    expect(serializeSeed(SEED)).toBeNull()
    expect(isDefaultSeed(SEED)).toBe(true)
  })

  it('writes any other seed as digits', () => {
    expect(serializeSeed(42)).toBe('42')
    expect(serializeSeed(4294967295)).toBe('4294967295')
    expect(isDefaultSeed(42)).toBe(false)
  })

  it('round-trips every seed it writes', () => {
    for (const seed of [0, 1, 42, 77777, 2147483647, 4294967295]) {
      const search = searchWithSeed('', seed)
      expect(parseSeed(search), search).toEqual({ seed, invalid: false })
    }
  })
})

describe('searchWithSeed', () => {
  it('leaves the rest of the URL alone', () => {
    const search = searchWithSeed('?from=2026-09-20&to=2026-09-26&drill=all', 42)

    expect(search).toContain('from=2026-09-20')
    expect(search).toContain('to=2026-09-26')
    expect(search).toContain('drill=all')
    expect(search).toContain('seed=42')
  })

  it('removes the parameter when resetting to the default', () => {
    const withSeed = searchWithSeed('?from=2026-09-20&to=2026-09-26', 42)
    const back = searchWithSeed(withSeed, SEED)

    expect(back).not.toContain('seed')
    expect(back).toContain('from=2026-09-20')
  })

  it('replaces rather than appends', () => {
    const once = searchWithSeed('?seed=1', 2)
    expect(once).toBe('?seed=2')
  })

  it('produces an empty string rather than a bare question mark', () => {
    expect(searchWithSeed('', SEED)).toBe('')
  })
})

describe('randomSeed', () => {
  it('returns seeds the parser accepts', () => {
    for (let i = 0; i < 100; i++) {
      const seed = randomSeed()

      expect(Number.isInteger(seed)).toBe(true)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThanOrEqual(4294967295)
      expect(parseSeed(searchWithSeed('', seed)).invalid).toBe(false)
    }
  })

  it('does not keep handing back the same quarter', () => {
    const seeds = new Set(Array.from({ length: 50 }, () => randomSeed()))
    expect(seeds.size).toBeGreaterThan(40)
  })
})
