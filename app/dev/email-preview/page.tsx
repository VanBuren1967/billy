import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { notFound } from 'next/navigation';
import { requestReceivedEmail } from '@/lib/email/templates/request-received';

export const metadata = { title: 'Email preview (dev)' };

const SAMPLE_CONFIRMATION_URL = 'https://example.com/auth/v1/verify?token=sample';
const SAMPLE_TOKEN = '123456';
const SAMPLE_EMAIL = 'prospect@example.com';
const SAMPLE_NAME = 'Sample Athlete';

function renderTemplate(filename: string): string {
  const html = readFileSync(
    join(process.cwd(), 'supabase', 'templates', filename),
    'utf8',
  );
  return html
    .replace(/\{\{\s*\.ConfirmationURL\s*\}\}/g, SAMPLE_CONFIRMATION_URL)
    .replace(/\{\{\s*\.Token\s*\}\}/g, SAMPLE_TOKEN)
    .replace(/\{\{\s*\.Email\s*\}\}/g, SAMPLE_EMAIL)
    .replace(/\{\{\s*\.Data\.name\s*\}\}/g, SAMPLE_NAME);
}

export default function EmailPreviewPage() {
  if (process.env.NODE_ENV === 'production') {
    notFound();
  }

  const inviteHtml = renderTemplate('invite.html');
  const magicLinkHtml = renderTemplate('magic-link.html');
  const requestReceived = requestReceivedEmail(SAMPLE_NAME);

  const cards: { label: string; subject: string; html: string }[] = [
    { label: 'Invite', subject: "You're invited to Steele & Co.", html: inviteHtml },
    { label: 'Magic link', subject: 'Your Steele & Co. sign-in link', html: magicLinkHtml },
    { label: 'Request received', subject: requestReceived.subject, html: requestReceived.html },
  ];

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-16">
      <header className="flex flex-col gap-2">
        <p className="text-gold text-xs tracking-widest uppercase">Dev preview</p>
        <h1 className="text-bone font-serif text-4xl">Transactional emails</h1>
        <p className="text-bone-muted text-sm">
          Local-only preview of the three templates billy sends. Substitutes sample values for
          template variables. Not reachable in production.
        </p>
      </header>

      {cards.map((c) => (
        <section key={c.label} className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-bone font-serif text-2xl">{c.label}</h2>
            <p className="text-bone-faint font-mono text-xs">{c.subject}</p>
          </div>
          <iframe
            title={`${c.label} preview`}
            srcDoc={c.html}
            className="border-hairline-strong min-h-[640px] w-full border-2 bg-white"
          />
        </section>
      ))}
    </div>
  );
}
