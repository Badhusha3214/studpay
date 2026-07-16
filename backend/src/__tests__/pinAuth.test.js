import { describe, it, expect } from 'vitest';
import { isLocked, lockedResponse, MAX_ATTEMPTS, LOCKOUT_MS } from '../services/pinAuth.js';

describe('isLocked', () => {
  it('returns true when pin_locked_until is in the future', () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isLocked({ pin_locked_until: future })).toBe(true);
  });

  it('returns false when pin_locked_until is in the past', () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isLocked({ pin_locked_until: past })).toBe(false);
  });

  it('returns false when pin_locked_until is null', () => {
    expect(isLocked({ pin_locked_until: null })).toBe(false);
    expect(isLocked({ pin_locked_until: undefined })).toBe(false);
  });
});

describe('lockedResponse', () => {
  it('returns 423 status with retryAfterSeconds', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const result = lockedResponse({ pin_locked_until: future });
    expect(result.status).toBe(423);
    expect(result.body.error).toMatch(/Too many failed PIN attempts/);
    expect(result.body.retryAfterSeconds).toBeGreaterThan(0);
    expect(result.body.retryAfterSeconds).toBeLessThanOrEqual(300);
  });
});

describe('constants', () => {
  it('MAX_ATTEMPTS is 5', () => {
    expect(MAX_ATTEMPTS).toBe(5);
  });

  it('LOCKOUT_MS is 15 minutes', () => {
    expect(LOCKOUT_MS).toBe(15 * 60 * 1000);
  });
});
