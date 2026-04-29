import Link from 'next/link';
import { listPublicTeam } from '@/lib/public-profiles/list-team';

export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const profiles = await listPublicTeam();
  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-16">
      <header>
        <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co.</p>
        <h1 className="text-bone font-serif text-4xl">The Team</h1>
      </header>
      {profiles.length === 0 ? (
        <p className="text-bone-muted">No athletes have published profiles yet.</p>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {profiles.map((p) => (
            <li key={p.id} className="border-hairline-strong border bg-[#16140f] p-6">
              {p.photoUrl && (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={p.photoUrl}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="mb-4 aspect-square w-full object-cover grayscale"
                />
              )}
              <h2 className="text-bone font-serif text-2xl">
                <Link href={`/team/${p.slug}`}>{p.athleteName}</Link>
              </h2>
              <p className="text-bone-muted mt-2 text-sm">{p.headline}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
