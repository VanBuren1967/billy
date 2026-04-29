import Link from 'next/link';
import { getCurrentAthlete } from '@/lib/athletes/get-current-athlete';
import { getOwnPublicProfile } from '@/lib/public-profiles/get-own';
import { ProfileForm } from './profile-form';

export const metadata = { title: 'Public profile' };

export default async function PublicProfilePage() {
  const athlete = await getCurrentAthlete();
  const { profile, suggestedSlug } = await getOwnPublicProfile();

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-12">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">{athlete.name}</p>
        <h1 className="text-bone font-serif text-3xl">Public profile</h1>
        {profile?.isPublished ? (
          <p className="text-gold mt-2 text-xs tracking-widest uppercase">
            ✓ Published — <Link href={`/team/${profile.slug}`} className="underline">/team/{profile.slug}</Link>
          </p>
        ) : profile ? (
          <p className="text-bone-muted mt-2 text-sm">Pending coach approval. Slug will be <span className="text-gold">/team/{profile.slug}</span> once published.</p>
        ) : (
          <p className="text-bone-muted mt-2 text-sm">Tell people who you are. Coach reviews before publishing. Slug will be <span className="text-gold">/team/{suggestedSlug}</span>.</p>
        )}
      </header>
      <ProfileForm initial={profile} />
    </main>
  );
}
