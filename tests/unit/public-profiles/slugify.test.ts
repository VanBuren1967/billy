import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/public-profiles/slugify';

describe('slugify', () => {
  it('"Alex Reyes" → "alex-reyes"', () => {
    expect(slugify('Alex Reyes')).toBe('alex-reyes');
  });
  it('"Morgan O\'Brien" → "morgan-obrien" (drops apostrophe)', () => {
    expect(slugify("Morgan O'Brien")).toBe('morgan-obrien');
  });
  it('"  spaces   matter " → "spaces-matter"', () => {
    expect(slugify('  spaces   matter ')).toBe('spaces-matter');
  });
  it('"weird---dashes" → "weird-dashes"', () => {
    expect(slugify('weird---dashes')).toBe('weird-dashes');
  });
});
