import Link from 'next/link';
import { PublicNav } from '@/components/public-nav';
import { RequestToJoinForm } from './form';

export const metadata = { title: 'Inquire' };

export default function RequestToJoinPage() {
  return (
    <>
      <PublicNav />
      <section className="mx-auto max-w-2xl px-6 py-20">
        <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co.</p>
        <h1 className="text-bone mt-3 font-serif text-4xl leading-tight tracking-tight md:text-5xl">
          Inquire about <em className="text-gold">coaching</em>.
        </h1>
        <p className="text-bone-muted mt-6 max-w-xl">
          Tell us about your training and your goals. William personally reviews every inquiry and
          will respond within a few days.
        </p>
        <div className="mt-12">
          <RequestToJoinForm />
        </div>
        <p className="text-bone-faint mt-12 text-xs tracking-wider uppercase">
          Already a member?{' '}
          <Link href="/login" className="text-gold underline">
            Sign in
          </Link>
        </p>
      </section>
    </>
  );
}
