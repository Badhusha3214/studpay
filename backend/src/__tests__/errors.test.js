import { describe, it, expect } from 'vitest';
import { HttpError } from '../utils/errors.js';

describe('HttpError', () => {
  it('creates error with string body', () => {
    const err = new HttpError(404, 'Not found');
    expect(err.status).toBe(404);
    expect(err.body).toEqual({ error: 'Not found' });
    expect(err.message).toBe('Not found');
  });

  it('creates error with object body', () => {
    const err = new HttpError(400, { error: 'Bad request', details: 'missing field' });
    expect(err.status).toBe(400);
    expect(err.body).toEqual({ error: 'Bad request', details: 'missing field' });
    expect(err.message).toBe('Bad request');
  });

  it('creates error with numeric status', () => {
    const err = new HttpError(500, 'Server error');
    expect(err.status).toBe(500);
  });

  it('is an instance of Error', () => {
    const err = new HttpError(400, 'test');
    expect(err).toBeInstanceOf(Error);
  });
});
