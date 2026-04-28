import { describe, it, expect } from 'vitest';
import { computeCurrentWeek, computeTodayDay } from '@/lib/athletes/program-time';

describe('computeCurrentWeek', () => {
  it('returns 1 on the start date', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-04', 4)).toBe(1);
  });

  it('returns 1 on day 6 of week 1', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-09', 4)).toBe(1);
  });

  it('returns 2 on day 8 (start of week 2)', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-11', 4)).toBe(2);
  });

  it('returns 3 on day 15', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-18', 4)).toBe(3);
  });

  it('caps at totalWeeks', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-06-30', 4)).toBe(4);
  });

  it('returns 1 when startDate is null', () => {
    expect(computeCurrentWeek(null, '2026-05-04', 4)).toBe(1);
  });

  it('returns 1 when today is before startDate', () => {
    expect(computeCurrentWeek('2026-05-04', '2026-05-01', 4)).toBe(1);
  });
});

describe('computeTodayDay', () => {
  it('Monday → Day 1', () => {
    expect(computeTodayDay('2026-05-04')).toBe(1);
  });

  it('Tuesday → Day 2', () => {
    expect(computeTodayDay('2026-05-05')).toBe(2);
  });

  it('Sunday → Day 7', () => {
    expect(computeTodayDay('2026-05-10')).toBe(7);
  });
});
