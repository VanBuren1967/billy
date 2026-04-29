import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';

export const metadata = { title: 'Inquiry received' };

export default function ThanksPage() {
  return (
    <>
      <PublicNav />
      <section className="mx-auto max-w-2xl px-6 py-32">
        <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co.</p>
        <h1 className="text-bone mt-3 font-serif text-4xl leading-tight tracking-tight md:text-5xl">
          Inquiry <em className="text-gold">received</em>.
        </h1>
        <p className="text-bone-muted mt-6 max-w-xl">
          Check your inbox for a confirmation. William personally reviews every inquiry and will
          respond within a few days.
        </p>
        <div className="mt-12">
          <Link
            href="/"
            className="text-bone-muted hover:text-bone focus-visible:outline-gold text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            ← Back home
          </Link>
        </div>
      </section>
    </>
  );
}
