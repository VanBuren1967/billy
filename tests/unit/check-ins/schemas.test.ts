import { describe, it, expect } from 'vitest';
import { saveCheckInSchema } from '@/lib/check-ins/schemas';

describe('saveCheckInSchema', () => {
  it('accepts valid full payload', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 198, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
      meetReadiness: 6, painNotes: 'mild left knee', comments: 'felt strong',
    });
    expect(r.success).toBe(true);
  });
  it('rejects bodyweight below 50 lb', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 30, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(r.success).toBe(false);
  });
  it('rejects fatigue=11', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 200, fatigue: 11, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(r.success).toBe(false);
  });
  it('accepts minimal required', () => {
    const r = saveCheckInSchema.safeParse({
      bodyweightLbs: 200, fatigue: 5, soreness: 4, confidence: 7, motivation: 8,
    });
    expect(r.success).toBe(true);
  });
});
