import Link from 'next/link';
import type { Metadata } from 'next';
import { PublicNav } from '@/components/public-nav';

export const metadata: Metadata = {
  title: 'Pricing',
  description:
    'Application-based powerlifting coaching. Online and hybrid programs starting at the national-prep level.',
};

const TIERS = [
  {
    name: 'Online',
    rate: 'Application-based',
    summary: 'Fully remote programming for athletes anywhere in the country.',
    features: [
      'Custom periodized programming',
      'Weekly check-ins + program adjustments',
      'Video review of competition lifts',
      'Meet attempt selection',
      'Direct coach access',
    ],
    cta: 'Inquire',
  },
  {
    name: 'Hybrid',
    rate: 'Application-based',
    highlighted: true,
    summary:
      'For athletes within reach of in-person sessions. Combines online programming with periodic on-platform coaching.',
    features: [
      'Everything in Online',
      'In-person coaching sessions',
      'On-platform meet handling',
      'Equipment fitting (raw &amp; equipped)',
      'Priority response',
    ],
    cta: 'Inquire',
  },
  {
    name: 'Meet Prep',
    rate: 'Application-based',
    summary: 'Short-cycle peaking and competition-day handling for an upcoming meet.',
    features: [
      'Peaking block (4&ndash;12 weeks)',
      'Attempt strategy + opener calculation',
      'Federation-specific rules review',
      'Travel + cut planning if applicable',
    ],
    cta: 'Inquire',
  },
];

export default function PricingPage() {
  return (
    <>
      <PublicNav />

      <main className="mx-auto max-w-5xl px-6 py-20">
        <p className="text-gold text-xs tracking-widest uppercase">Pricing</p>
        <h1 className="text-bone mt-3 font-serif text-5xl leading-tight tracking-tight md:text-6xl">
          Coaching by <em className="text-gold">application</em>.
        </h1>
        <p className="text-bone-muted mt-6 max-w-2xl">
          The roster is small and selective. Each athlete is taken on personally. Pricing reflects
          the level of involvement and is shared after a brief discovery conversation.
        </p>

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {TIERS.map((tier) => (
            <article
              key={tier.name}
              className={`border-2 p-8 ${
                tier.highlighted ? 'border-gold bg-ink-900' : 'border-hairline-strong bg-ink-900/40'
              }`}
            >
              {tier.highlighted && (
                <p className="text-gold mb-4 text-xs tracking-widest uppercase">Most common</p>
              )}
              <h2 className="text-bone font-serif text-2xl tracking-tight">{tier.name}</h2>
              <p className="text-gold mt-2 text-sm">{tier.rate}</p>
              <p
                className="text-bone-muted mt-4 text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: tier.summary }}
              />

              <ul className="text-bone-muted mt-6 flex flex-col gap-2 text-sm">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="border-hairline-strong border-l-2 pl-3"
                    dangerouslySetInnerHTML={{ __html: f }}
                  />
                ))}
              </ul>

              <Link
                href="/request-to-join"
                className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold mt-8 inline-block border px-5 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {tier.cta}
              </Link>
            </article>
          ))}
        </div>

        <section className="border-hairline mt-20 border-t pt-10">
          <p className="text-gold text-xs tracking-widest uppercase">What&apos;s not included</p>
          <h2 className="text-bone mt-3 font-serif text-2xl tracking-tight">
            We don&apos;t sell templates.
          </h2>
          <p className="text-bone-muted mt-4 max-w-2xl">
            There is no PDF download tier. There is no &ldquo;basic plan&rdquo; that doesn&apos;t
            include coaching. Every athlete on the roster gets direct, ongoing programming and
            review &mdash; or they aren&apos;t on the roster.
          </p>
        </section>
      </main>

      <footer className="border-hairline border-t">
        <div className="text-bone-faint mx-auto max-w-5xl px-6 py-10 text-xs tracking-widest uppercase">
          &copy; Steele &amp; Co.
        </div>
      </footer>
    </>
  );
}
