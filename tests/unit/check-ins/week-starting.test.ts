import { describe, it, expect } from 'vitest';
import { computeWeekStarting } from '@/lib/check-ins/week-starting';

describe('computeWeekStarting', () => {
  it('Monday → that Monday', () => {
    expect(computeWeekStarting('2026-04-27')).toBe('2026-04-27');
  });
  it('Tuesday → previous Monday', () => {
    expect(computeWeekStarting('2026-04-28')).toBe('2026-04-27');
  });
  it('Wednesday → previous Monday', () => {
    expect(computeWeekStarting('2026-04-29')).toBe('2026-04-27');
  });
  it('Sunday → previous Monday', () => {
    expect(computeWeekStarting('2026-05-03')).toBe('2026-04-27');
  });
  it('first Monday of next week → that Monday', () => {
    expect(computeWeekStarting('2026-05-04')).toBe('2026-05-04');
  });
});
