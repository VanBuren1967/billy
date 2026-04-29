import Link from 'next/link';
import type { Metadata } from 'next';
import { PublicNav } from '@/components/public-nav';

export const metadata: Metadata = {
  title: 'FAQ',
  description: 'Common questions about coaching with Steele & Co.',
};

const FAQS = [
  {
    q: 'How is this different from a generic powerlifting template?',
    a: "Templates are written for an average athlete that doesn't exist. Programming here is built for your weak points, your schedule, your equipment, and your competition timeline — and it changes weekly based on what your check-ins and video say.",
  },
  {
    q: 'Do I have to compete to be coached?',
    a: "No, but the methodology is built around competition. If you're training seriously and intend to compete eventually, the work transfers directly. If your only goal is general fitness, we're probably not the right fit.",
  },
  {
    q: 'Raw or equipped?',
    a: 'Both. The team coaches raw and equipped lifters and adapts programming for the specific demands of each.',
  },
  {
    q: 'Which federations do you work with?',
    a: 'Athletes have competed in USA Powerlifting, Powerlifting America, and other sanctioned federations. We can prep for any drug-tested federation.',
  },
  {
    q: 'Do you take beginners?',
    a: "Athletes accepted are typically intermediate or advanced — they have at least a year of structured training and a clear competition trajectory. First-time competitors are welcome if they're committed.",
  },
  {
    q: 'How much access do I get to the coach?',
    a: 'Direct. Programming questions, attempt strategy, video review, check-in feedback — you talk to William, not a junior staffer.',
  },
  {
    q: 'What about injury history?',
    a: "Programming accounts for injury history and active flare-ups. We'll work around what we have to. We don't replace medical care — if you need a PT or physician, see one.",
  },
  {
    q: 'How do I get started?',
    a: "Submit an inquiry through the application form. If it looks like a fit, we'll set up a brief conversation and go from there.",
  },
];

export default function FaqPage() {
  return (
    <>
      <PublicNav />

      <main className="mx-auto max-w-3xl px-6 py-20">
        <p className="text-gold text-xs tracking-widest uppercase">FAQ</p>
        <h1 className="text-bone mt-3 font-serif text-5xl leading-tight tracking-tight md:text-6xl">
          Common <em className="text-gold">questions</em>.
        </h1>
        <p className="text-bone-muted mt-6 max-w-2xl">
          The shortest answers to what most prospective athletes ask. If yours isn&apos;t here, ask
          on the inquiry form.
        </p>

        <dl className="mt-16 flex flex-col gap-10">
          {FAQS.map((item, i) => (
            <div key={i} className="border-hairline-strong border-l-2 pl-5">
              <dt className="text-bone font-serif text-xl leading-snug">{item.q}</dt>
              <dd className="text-bone-muted mt-3 leading-relaxed">{item.a}</dd>
            </div>
          ))}
        </dl>

        <section className="border-hairline mt-20 border-t pt-10">
          <p className="text-gold text-xs tracking-widest uppercase">
            Didn&apos;t find your question?
          </p>
          <h2 className="text-bone mt-3 font-serif text-2xl tracking-tight">
            Ask in the application.
          </h2>
          <div className="mt-8">
            <Link
              href="/request-to-join"
              className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold inline-block border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Inquire
            </Link>
          </div>
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
