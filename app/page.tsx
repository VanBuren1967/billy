export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-start justify-center gap-8 px-6 py-24">
      <p className="text-gold text-xs tracking-widest uppercase">Steele &amp; Co.</p>
      <h1 className="text-bone font-serif text-5xl leading-tight tracking-tight md:text-6xl">
        A standard of <em className="text-gold">excellence</em>,<br />
        under the bar.
      </h1>
      <p className="text-bone-muted max-w-xl">
        Coaching for serious powerlifters. Programming, accountability, and meet preparation from a
        national-level coach.
      </p>
      <div className="flex gap-3 pt-2">
        <a
          href="/request-to-join"
          className="border-gold text-gold hover:bg-gold hover:text-ink-950 focus-visible:outline-gold border px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Inquire
        </a>
        <a
          href="/login"
          className="text-bone-muted hover:text-bone focus-visible:outline-gold px-6 py-3 text-xs tracking-widest uppercase transition focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign in
        </a>
      </div>
    </main>
  );
}
