import { describe, it, expect } from 'vitest';
import { joinRequestSchema } from '@/lib/validation/join-request';

describe('joinRequestSchema', () => {
  it('accepts a minimal valid input', () => {
    const r = joinRequestSchema.parse({ name: 'Alice Smith', email: 'alice@example.com' });
    expect(r.name).toBe('Alice Smith');
    expect(r.email).toBe('alice@example.com');
  });

  it('lowercases and trims email', () => {
    const r = joinRequestSchema.parse({ name: 'Bob', email: '  BOB@EXAMPLE.COM  ' });
    expect(r.email).toBe('bob@example.com');
  });

  it('rejects short names', () => {
    expect(() => joinRequestSchema.parse({ name: 'A', email: 'a@b.com' })).toThrow();
  });

  it('rejects invalid emails', () => {
    expect(() => joinRequestSchema.parse({ name: 'Cara', email: 'not-an-email' })).toThrow();
  });

  it('treats empty message as ok', () => {
    const r = joinRequestSchema.parse({ name: 'Dan', email: 'd@e.com', message: '' });
    expect(r.message).toBe('');
  });

  it('rejects message > 2000 chars', () => {
    expect(() =>
      joinRequestSchema.parse({ name: 'Eve', email: 'e@e.com', message: 'x'.repeat(2001) }),
    ).toThrow();
  });
});
