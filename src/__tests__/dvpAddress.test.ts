import { describe, it, expect } from 'vitest'
import {
  validateDvpAddress,
  lastValidOctalBefore,
  firstValidOctalAfter,
} from '@/lib/validators/dvpAddress'

describe('validateDvpAddress', () => {
  it.each([
    'X0',
    'X1',
    'X7',
    'X10',
    'X17',
    'X20',
    'X77',
    'X100',
    'Y0',
    'Y7',
    'M0',
    'M100',
    'M777',
    'D1234',
    'T17',
    'C20',
    'S0',
  ])('accepts valid octal address %s', (addr) => {
    expect(validateDvpAddress(addr)).toBeNull()
  })

  it.each(['X8', 'X9', 'X18', 'X19', 'Y8', 'Y9', 'X28', 'X38'])(
    'rejects invalid octal address %s with an Arabic message',
    (addr) => {
      const result = validateDvpAddress(addr)
      expect(result).not.toBeNull()
      expect(result).toMatch(/غير صالح/)
      expect(result).toMatch(/Delta DVP/)
    },
  )

  it('returns the exact required error template for X8', () => {
    // The task spec mandates this exact message text.
    expect(validateDvpAddress('X8')).toBe(
      'X8 غير صالح — Delta DVP تستخدم النظام الثماني. العنوان التالي بعد X7 هو X10',
    )
  })

  it('embeds the right neighbour addresses for higher invalid numbers', () => {
    expect(validateDvpAddress('X18')).toBe(
      'X18 غير صالح — Delta DVP تستخدم النظام الثماني. العنوان التالي بعد X17 هو X20',
    )
    expect(validateDvpAddress('X80')).toBe(
      'X80 غير صالح — Delta DVP تستخدم النظام الثماني. العنوان التالي بعد X77 هو X100',
    )
    expect(validateDvpAddress('Y9')).toBe(
      'Y9 غير صالح — Delta DVP تستخدم النظام الثماني. العنوان التالي بعد Y7 هو Y10',
    )
  })

  it('rejects an empty string', () => {
    expect(validateDvpAddress('')).toMatch(/مطلوب/)
    expect(validateDvpAddress('   ')).toMatch(/مطلوب/)
  })

  it('rejects malformed inputs with the format error message', () => {
    expect(validateDvpAddress('hello')).toMatch(/غير صالحة/)
    expect(validateDvpAddress('Z10')).toMatch(/غير صالحة/)
    expect(validateDvpAddress('X')).toMatch(/غير صالحة/)
    expect(validateDvpAddress('X1A')).toMatch(/غير صالحة/)
  })

  it('accepts lowercase prefixes (normalized to uppercase)', () => {
    expect(validateDvpAddress('x0')).toBeNull()
    expect(validateDvpAddress('y17')).toBeNull()
    expect(validateDvpAddress('m100')).toBeNull()
  })

  // Decimal-numbered device classes (M/S/T/C/D relays, timers,
  // counters, data registers) legally use digits 8 and 9 — only
  // physical I/O X/Y is octal-numbered on Delta DVP hardware.
  it.each([
    'M8',
    'M9',
    'M80',
    'M91',
    'S8',
    'S9',
    'S88',
    'T8',
    'T9',
    'T99',
    'C8',
    'C9',
    'C108',
    'D8',
    'D9',
    'D91',
  ])('accepts decimal digits 8/9 for non-IO prefix address %s', (addr) => {
    expect(validateDvpAddress(addr)).toBeNull()
  })

  it('trims surrounding whitespace before validating', () => {
    expect(validateDvpAddress('  X10  ')).toBeNull()
    // After trim+upper, "X8" is still invalid octal.
    expect(validateDvpAddress('  x8  ')).toMatch(/غير صالح/)
  })
})

describe('lastValidOctalBefore', () => {
  it('returns the previous octal-only value', () => {
    expect(lastValidOctalBefore(8)).toBe(7)
    expect(lastValidOctalBefore(9)).toBe(7)
    expect(lastValidOctalBefore(10)).toBe(7)
    expect(lastValidOctalBefore(18)).toBe(17)
    expect(lastValidOctalBefore(80)).toBe(77)
    expect(lastValidOctalBefore(91)).toBe(77)
    expect(lastValidOctalBefore(100)).toBe(77)
    expect(lastValidOctalBefore(108)).toBe(107)
  })

  it('clamps to zero when there is no smaller valid value', () => {
    expect(lastValidOctalBefore(0)).toBe(0)
    expect(lastValidOctalBefore(1)).toBe(0)
  })
})

describe('firstValidOctalAfter', () => {
  it('returns the next octal-only value', () => {
    expect(firstValidOctalAfter(7)).toBe(10)
    expect(firstValidOctalAfter(8)).toBe(10)
    expect(firstValidOctalAfter(9)).toBe(10)
    expect(firstValidOctalAfter(17)).toBe(20)
    expect(firstValidOctalAfter(77)).toBe(100)
    expect(firstValidOctalAfter(80)).toBe(100)
    expect(firstValidOctalAfter(99)).toBe(100)
    expect(firstValidOctalAfter(107)).toBe(110)
  })
})
