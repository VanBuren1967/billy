import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { PublicNav } from '@/components/public-nav';

export const metadata: Metadata = {
  title: 'About — Steele & Co.',
  description:
    'William Steele is a national-level powerlifting coach building a team of disciplined, competition-ready athletes.',
};

export default function AboutPage() {
  return (
    <>
      <PublicNav />

      <main className="mx-auto max-w-3xl px-6 py-20">
        <p className="text-gold text-xs tracking-widest uppercase">About</p>
        <h1 className="text-bone mt-3 font-serif text-5xl leading-tight tracking-tight md:text-6xl">
          Built on the <em className="text-gold">platform</em>.
        </h1>

        <div className="text-bone-muted mt-10 flex flex-col gap-6 text-base leading-relaxed">
          <p>
            Steele &amp; Co. is the coaching practice of{' '}
            <span className="text-bone">William Steele</span>, a national-level powerlifter and
            coach. The work is built on a simple premise: programming should be specific,
            periodized, and answerable to the only test that matters &mdash; what happens on the
            platform.
          </p>
          <p>
            Athletes coached here compete at sanctioned meets. They train on plans written for their
            weak points, their schedule, and their competition timeline &mdash; not a template
            pulled off a shelf. Every block is reviewed. Every meet is debriefed.
          </p>
          <p>
            This is coaching for athletes who are serious about the sport. If that&apos;s you, the
            door is open.
          </p>
        </div>

        <figure className="border-hairline-strong bg-ink-900 mt-16 border-2 p-3">
          <Image
            src="/images/hs-nationals-2026.jpg"
            alt="USA Powerlifting High School Nationals — Nebraska 2026"
            width={1280}
            height={720}
            className="h-auto w-full"
          />
          <figcaption className="text-bone-faint mt-3 px-1 text-xs tracking-wider uppercase">
            USA Powerlifting &middot; High School Nationals &middot; Nebraska 2026
          </figcaption>
        </figure>

        <section className="border-hairline mt-16 border-t pt-10">
          <p className="text-gold text-xs tracking-widest uppercase">Where we compete</p>
          <h2 className="text-bone mt-3 font-serif text-2xl tracking-tight">
            USA Powerlifting &middot; sanctioned meets &middot; raw &amp; equipped.
          </h2>
          <p className="text-bone-muted mt-4 max-w-xl">
            Athletes prep for federation-sanctioned competition. The team has competed at
            Powerlifting America Nationals and continues to develop lifters for the national stage.
          </p>
        </section>

        <section className="border-hairline mt-16 border-t pt-10">
          <p className="text-gold text-xs tracking-widest uppercase">Ready to train?</p>
          <h2 className="text-bone mt-3 font-serif text-2xl tracking-tight">
            The roster is intentionally small.
          </h2>
          <p className="text-bone-muted mt-4 max-w-xl">
            New athletes are accepted on application. If you&apos;re a competitive lifter or
            planning your first meet, start by submitting a brief inquiry.
          </p>
          <div className="mt-8 flex gap-3">
            <Link
              href="/request-to-join"
              className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              Inquire
            </Link>
            <Link
              href="/pricing"
              className="text-bone-muted hover:text-bone focus-visible:outline-gold px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              See pricing
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
