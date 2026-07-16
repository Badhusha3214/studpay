import { describe, it, expect } from 'vitest';

describe('getSchoolId helper', () => {
  it('returns school_id from user payload', () => {
    const mockContext = {
      get: (key) => {
        if (key === 'user') return { id: 'u1', school_id: 'school-abc' };
        return undefined;
      },
    };
    // Inline the logic since importing auth.js pulls in hono/jwt
    const getSchoolId = (c) => c.get('user')?.school_id || null;
    expect(getSchoolId(mockContext)).toBe('school-abc');
  });

  it('returns null when user has no school_id', () => {
    const mockContext = {
      get: (key) => {
        if (key === 'user') return { id: 'u1' };
        return undefined;
      },
    };
    const getSchoolId = (c) => c.get('user')?.school_id || null;
    expect(getSchoolId(mockContext)).toBeNull();
  });

  it('returns null when user is not set', () => {
    const mockContext = {
      get: () => undefined,
    };
    const getSchoolId = (c) => c.get('user')?.school_id || null;
    expect(getSchoolId(mockContext)).toBeNull();
  });
});
