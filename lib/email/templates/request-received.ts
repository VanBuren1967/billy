export function requestReceivedEmail(name: string) {
  const subject = 'We received your inquiry — Steele & Co.';
  const text = `Hi ${name},

We've received your inquiry. William will personally review every request and respond within a few days. If you're a fit, you'll receive an invite by email to join the platform.

Talk soon,
Steele & Co.`;
  const html = `
    <!doctype html>
    <html>
      <body style="margin:0;padding:32px;background:#080808;font-family:Georgia,serif;color:#f4f0e8;">
        <div style="max-width:560px;margin:0 auto;">
          <p style="font-size:11px;letter-spacing:0.2em;text-transform:uppercase;color:#c9a14c;margin:0 0 16px;">Steele &amp; Co.</p>
          <h1 style="font-size:24px;margin:0 0 24px;font-weight:normal;">Inquiry received.</h1>
          <p style="line-height:1.6;color:#a39d8a;margin:0 0 16px;">Hi ${escapeHtml(name)},</p>
          <p style="line-height:1.6;color:#a39d8a;margin:0 0 16px;">
            We've received your inquiry. William personally reviews every request and will respond within a few days.
            If you're a fit, you'll receive an invite by email to join the platform.
          </p>
          <p style="line-height:1.6;color:#a39d8a;margin:0 0 24px;">Talk soon,<br/>Steele &amp; Co.</p>
          <hr style="border:none;border-top:1px solid #1a1814;margin:32px 0;"/>
          <p style="font-size:11px;letter-spacing:0.05em;color:#6a6457;margin:0;">
            This is an automated confirmation. Replies aren't monitored.
          </p>
        </div>
      </body>
    </html>
  `;
  return { subject, text, html };
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
