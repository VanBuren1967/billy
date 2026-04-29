import { describe, it, expect } from 'vitest';
import { savePublicProfileSchema } from '@/lib/public-profiles/schemas';

describe('savePublicProfileSchema', () => {
  it('accepts valid full payload', () => {
    const r = savePublicProfileSchema.safeParse({
      headline: 'Powerlifter from Houston',
      bio: 'I started lifting in 2019 and have competed in three meets.',
      photoUrl: 'https://example.com/me.jpg',
      recentMeetResults: [
        { meet: 'USAPL Texas State', date: '2026-03-15', total_lbs: 1500, placement: '1st' },
      ],
    });
    expect(r.success).toBe(true);
  });

  it('rejects empty headline', () => {
    const r = savePublicProfileSchema.safeParse({
      headline: '',
      bio: 'A bio that is non-empty.',
      recentMeetResults: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects http:// photo URLs (https only)', () => {
    const r = savePublicProfileSchema.safeParse({
      headline: 'h',
      bio: 'b',
      photoUrl: 'http://example.com/me.jpg',
      recentMeetResults: [],
    });
    expect(r.success).toBe(false);
  });

  it('rejects data: photo URLs', () => {
    const r = savePublicProfileSchema.safeParse({
      headline: 'h',
      bio: 'b',
      photoUrl: 'data:image/png;base64,iVBORw0KGgo=',
      recentMeetResults: [],
    });
    expect(r.success).toBe(false);
  });

  it('accepts up to 10 meet results', () => {
    const meets = Array.from({ length: 10 }, (_, i) => ({
      meet: `Meet ${i + 1}`,
      date: '2026-01-01',
      total_lbs: 1200 + i,
      placement: null,
    }));
    const r = savePublicProfileSchema.safeParse({
      headline: 'h',
      bio: 'b',
      recentMeetResults: meets,
    });
    expect(r.success).toBe(true);
  });
});
