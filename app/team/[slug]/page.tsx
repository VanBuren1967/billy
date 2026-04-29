import { notFound } from 'next/navigation';
import { getPublicProfileBySlug } from '@/lib/public-profiles/get-by-slug';

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicProfileBySlug(slug);
  if (!p) return { title: 'Not found · Steele & Co.' };
  return { title: `${p.athleteName} · Steele & Co.` };
}

export default async function TeamMemberPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = await getPublicProfileBySlug(slug);
  if (!p) notFound();
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co. — Team</p>
        <h1 className="text-bone font-serif text-5xl">{p.athleteName}</h1>
        <p className="text-bone-muted text-lg">{p.headline}</p>
      </header>
      {p.photoUrl && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={p.photoUrl} alt="" className="border-hairline-strong border-2 grayscale" />
      )}
      <div className="text-bone whitespace-pre-line text-base leading-relaxed">{p.bio}</div>
      {p.recentMeetResults && p.recentMeetResults.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="text-bone-muted text-xs tracking-widest uppercase">Recent meets</h2>
          <table className="text-bone tabular-nums">
            <thead><tr className="text-bone-faint border-b border-[#1f1d18] text-left text-xs uppercase">
              <th className="py-2 pr-6 font-normal">Date</th>
              <th className="py-2 pr-6 font-normal">Meet</th>
              <th className="py-2 pr-6 font-normal">Total</th>
              <th className="py-2 pr-6 font-normal">Place</th>
            </tr></thead>
            <tbody>
              {p.recentMeetResults.map((m, i) => (
                <tr key={i} className="border-b border-[#1a1814]/40">
                  <td className="py-2 pr-6">{m.date}</td>
                  <td className="py-2 pr-6">{m.meet}</td>
                  <td className="py-2 pr-6">{m.total_lbs} lb</td>
                  <td className="py-2 pr-6">{m.placement ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}
