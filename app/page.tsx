import Image from 'next/image';
import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';

const STEPS = [
  {
    n: 'I',
    title: 'Apply',
    body: 'Submit a brief inquiry. Tell us about your training, your goals, and any meets on the horizon.',
  },
  {
    n: 'II',
    title: 'Discovery call',
    body: 'A short conversation to confirm fit and understand your weak points, schedule, and equipment.',
  },
  {
    n: 'III',
    title: 'Programming',
    body: 'A periodized block built for your weight class, federation, timeline, and recovery limits.',
  },
  {
    n: 'IV',
    title: 'Train &amp; review',
    body: 'Log every session. Coach reviews video and check-ins weekly. Adjust as the data demands.',
  },
];

export default function Home() {
  return (
    <>
      <PublicNav />

      <section className="mx-auto flex min-h-[80vh] max-w-3xl flex-col items-start justify-center gap-8 px-6 py-24">
        <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co.</p>
        <h1 className="text-bone font-serif text-5xl leading-tight tracking-tight md:text-6xl">
          A standard of <em className="text-gold">excellence</em>,<br />
          under the bar.
        </h1>
        <p className="text-bone-muted max-w-xl">
          Coaching for serious powerlifters. Programming, accountability, and meet preparation from
          a national-level coach.
        </p>
        <div className="flex flex-wrap gap-3 pt-2">
          <Link
            href="/request-to-join"
            className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            Inquire
          </Link>
          <Link
            href="/about"
            className="text-bone-muted hover:text-bone focus-visible:outline-gold px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            About
          </Link>
        </div>
      </section>

      <section className="border-hairline bg-ink-900 border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="text-gold text-xs tracking-widest uppercase">Proof, not promises</p>
          <h2 className="text-bone mt-3 font-serif text-3xl leading-tight tracking-tight md:text-4xl">
            On the platform at <em className="text-gold">Nationals</em>.
          </h2>
          <p className="text-bone-muted mt-4 max-w-2xl">
            William Steele coaches a team of competitive powerlifters at the national level. The
            work isn&apos;t theoretical &mdash; it&apos;s tested under the bar in front of judges.
          </p>

          <figure className="border-hairline-strong bg-ink-950 mt-10 border-2 p-3">
            <Image
              src="/images/team-jaguars-nationals.jpg"
              alt="William Steele with the Jaguars powerlifting team at Powerlifting America Nationals"
              width={1280}
              height={960}
              className="h-auto w-full"
              priority
            />
            <figcaption className="text-bone-faint mt-3 px-1 text-xs tracking-wider uppercase">
              Jaguars Powerlifting &middot; Powerlifting America Nationals
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="border-hairline border-t">
        <div className="mx-auto max-w-5xl px-6 py-20">
          <p className="text-gold text-xs tracking-widest uppercase">How it works</p>
          <h2 className="text-bone mt-3 font-serif text-3xl leading-tight tracking-tight md:text-4xl">
            From inquiry to <em className="text-gold">platform</em>, in four steps.
          </h2>

          <ol className="mt-12 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <li key={step.n} className="border-hairline-strong border-l-2 pl-5">
                <p className="text-gold font-serif text-2xl" aria-label={`Step ${step.n}`}>
                  {step.n}
                </p>
                <h3
                  className="text-bone mt-2 font-serif text-xl"
                  dangerouslySetInnerHTML={{ __html: step.title }}
                />
                <p
                  className="text-bone-muted mt-3 text-sm leading-relaxed"
                  dangerouslySetInnerHTML={{ __html: step.body }}
                />
              </li>
            ))}
          </ol>

          <div className="mt-12">
            <Link
              href="/request-to-join"
              className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Start the conversation
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-hairline border-t">
        <div className="text-bone-faint mx-auto max-w-5xl px-6 py-10 text-xs tracking-widest uppercase">
          &copy; Steele &amp; Co.
        </div>
      </footer>
    </>
  );
}
