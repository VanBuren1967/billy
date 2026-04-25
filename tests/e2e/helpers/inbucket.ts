const INBUCKET = 'http://localhost:54324';

export async function getMagicLinkFor(email: string): Promise<string> {
  const mailbox = email.split('@')[0]!;
  // Poll for up to 10s.
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}`);
    if (res.ok) {
      const messages = (await res.json()) as Array<{ id: string }>;
      if (messages.length > 0) {
        const last = messages[messages.length - 1]!;
        const detail = await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}/${last.id}`);
        const message = (await detail.json()) as { body: { text: string; html: string } };
        const text = message.body?.text ?? message.body?.html ?? '';
        // Supabase magic-link emails contain the /auth/v1/verify URL; following
        // it issues a 303 redirect to the configured /auth/callback?code=... URL,
        // which Playwright will follow automatically on page.goto().
        const match =
          text.match(/(http:\/\/127\.0\.0\.1:54321\/auth\/v1\/verify\?[^\s"<]+)/) ??
          text.match(/(http:\/\/localhost:54321\/auth\/v1\/verify\?[^\s"<]+)/) ??
          text.match(/(http:\/\/localhost:3000\/auth\/callback\?code=[^\s"<]+)/);
        if (match) return match[1]!;
      }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No magic link for ${email}`);
}

export async function clearInbucket(email: string) {
  const mailbox = email.split('@')[0]!;
  await fetch(`${INBUCKET}/api/v1/mailbox/${mailbox}`, { method: 'DELETE' });
}
