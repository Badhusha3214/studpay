import { describe, it, expect } from 'vitest';
import { gradeOf, needsJunkApproval, APPROVAL_GRADE_THRESHOLD } from '../services/approval.js';

describe('gradeOf', () => {
  it('extracts grade number from class string', () => {
    expect(gradeOf('5-A')).toBe(5);
    expect(gradeOf('10-B')).toBe(10);
    expect(gradeOf('1')).toBe(1);
  });

  it('returns null for non-numeric classes', () => {
    expect(gradeOf('Staff')).toBeNull();
    expect(gradeOf('Parent')).toBeNull();
    expect(gradeOf('')).toBeNull();
    expect(gradeOf(null)).toBeNull();
    expect(gradeOf(undefined)).toBeNull();
  });

  it('handles grade with no section', () => {
    expect(gradeOf('5')).toBe(5);
  });
});

describe('needsJunkApproval', () => {
  it('returns true for grade <= threshold buying junk', () => {
    expect(needsJunkApproval('5-A', ['junk'])).toBe(true);
    expect(needsJunkApproval('1-A', ['junk'])).toBe(true);
    expect(needsJunkApproval('3', ['junk'])).toBe(true);
  });

  it('returns false for grade > threshold', () => {
    expect(needsJunkApproval('6-A', ['junk'])).toBe(false);
    expect(needsJunkApproval('10-B', ['junk'])).toBe(false);
  });

  it('returns false for non-junk categories', () => {
    expect(needsJunkApproval('5-A', ['meal'])).toBe(false);
    expect(needsJunkApproval('5-A', ['drink'])).toBe(false);
  });

  it('returns false when junk is mixed with other categories', () => {
    expect(needsJunkApproval('5-A', ['meal', 'junk'])).toBe(true);
  });

  it('returns false for Staff class', () => {
    expect(needsJunkApproval('Staff', ['junk'])).toBe(false);
  });

  it('is sensitive to APPROVAL_GRADE_THRESHOLD', () => {
    expect(APPROVAL_GRADE_THRESHOLD).toBe(5);
    expect(needsJunkApproval('5-A', ['junk'])).toBe(true);
    expect(needsJunkApproval('6-A', ['junk'])).toBe(false);
  });
});
