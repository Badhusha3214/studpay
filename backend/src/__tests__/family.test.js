import { describe, it, expect } from 'vitest';
import { surnameOf, domainOf } from '../services/family.js';

describe('surnameOf', () => {
  it('extracts last word from a name', () => {
    expect(surnameOf('John Smith')).toBe('smith');
    expect(surnameOf('Mary Jane Watson')).toBe('watson');
  });

  it('handles single-word names', () => {
    expect(surnameOf('Cher')).toBe('cher');
  });

  it('trims whitespace', () => {
    expect(surnameOf('  John Smith  ')).toBe('smith');
  });

  it('handles multiple spaces between words', () => {
    expect(surnameOf('John  Doe')).toBe('doe');
  });
});

describe('domainOf', () => {
  it('extracts domain from email', () => {
    expect(domainOf('john@example.com')).toBe('example.com');
    expect(domainOf('admin@school.edu.pk')).toBe('school.edu.pk');
  });

  it('returns undefined for emails without @', () => {
    expect(domainOf('invalidemail')).toBeUndefined();
  });

  it('lowercases the domain', () => {
    expect(domainOf('user@EXAMPLE.COM')).toBe('example.com');
  });
});
