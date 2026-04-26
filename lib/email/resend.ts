import 'server-only';
import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL;

if (!RESEND_API_KEY) {
  throw new Error('RESEND_API_KEY is not set. Add it to .env.local and Vercel env.');
}
if (!RESEND_FROM_EMAIL) {
  throw new Error('RESEND_FROM_EMAIL is not set. Add it to .env.local and Vercel env.');
}

// TODO(prod): swap RESEND_FROM_EMAIL from `onboarding@resend.dev` to a verified
// domain sender (e.g., `noreply@mail.steele-co.com`) once DNS is configured in
// the Resend dashboard.
export const resend = new Resend(RESEND_API_KEY);
export const FROM_EMAIL = RESEND_FROM_EMAIL;

export type SendEmailArgs = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

export async function sendEmail({ to, subject, html, text }: SendEmailArgs) {
  const { data, error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html,
    text,
  });
  if (error) {
    throw new Error(`Resend send failed: ${error.message}`);
  }
  return { id: data?.id };
}
