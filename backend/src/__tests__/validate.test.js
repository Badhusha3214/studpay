import { describe, it, expect } from 'vitest';
import { parseAmount, parseBalance, MAX_AMOUNT, EMAIL_RE, PIN_RE } from '../utils/validate.js';

describe('parseAmount', () => {
  it('returns a number for valid amounts', () => {
    expect(parseAmount('10')).toBe(10);
    expect(parseAmount(5.5)).toBe(5.5);
    expect(parseAmount('0.01')).toBe(0.01);
  });

  it('returns null for zero', () => {
    expect(parseAmount(0)).toBeNull();
    expect(parseAmount('0')).toBeNull();
  });

  it('returns null for negative values', () => {
    expect(parseAmount(-1)).toBeNull();
    expect(parseAmount('-5')).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseAmount('abc')).toBeNull();
    expect(parseAmount('')).toBeNull();
  });

  it('returns null for Infinity', () => {
    expect(parseAmount(Infinity)).toBeNull();
    expect(parseAmount(-Infinity)).toBeNull();
  });

  it('returns null for NaN', () => {
    expect(parseAmount(NaN)).toBeNull();
    expect(parseAmount('NaN')).toBeNull();
  });

  it('caps at MAX_AMOUNT', () => {
    expect(parseAmount(MAX_AMOUNT)).toBe(MAX_AMOUNT);
    expect(parseAmount(MAX_AMOUNT + 1)).toBeNull();
  });

  it('respects custom max', () => {
    expect(parseAmount(100, { max: 50 })).toBeNull();
    expect(parseAmount(50, { max: 50 })).toBe(50);
  });
});

describe('parseBalance', () => {
  it('returns 0 for undefined/null/empty', () => {
    expect(parseBalance(undefined)).toBe(0);
    expect(parseBalance(null)).toBe(0);
    expect(parseBalance('')).toBe(0);
  });

  it('returns a number for valid balances', () => {
    expect(parseBalance('100')).toBe(100);
    expect(parseBalance(0)).toBe(0);
    expect(parseBalance('0')).toBe(0);
  });

  it('returns null for negative values', () => {
    expect(parseBalance(-1)).toBeNull();
  });

  it('returns null for non-numeric strings', () => {
    expect(parseBalance('abc')).toBeNull();
  });

  it('caps at MAX_AMOUNT', () => {
    expect(parseBalance(MAX_AMOUNT + 1)).toBeNull();
  });
});

describe('EMAIL_RE', () => {
  it('matches valid emails', () => {
    expect(EMAIL_RE.test('user@example.com')).toBe(true);
    expect(EMAIL_RE.test('a.b@c.co')).toBe(true);
  });

  it('rejects invalid emails', () => {
    expect(EMAIL_RE.test('')).toBe(false);
    expect(EMAIL_RE.test('noatsign.com')).toBe(false);
    expect(EMAIL_RE.test('@no-local.com')).toBe(false);
  });
});

describe('PIN_RE', () => {
  it('matches 4-6 digit PINs', () => {
    expect(PIN_RE.test('1234')).toBe(true);
    expect(PIN_RE.test('123456')).toBe(true);
  });

  it('rejects invalid PINs', () => {
    expect(PIN_RE.test('123')).toBe(false);
    expect(PIN_RE.test('1234567')).toBe(false);
    expect(PIN_RE.test('abcd')).toBe(false);
  });
});
