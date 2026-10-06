'use strict';
// Sends email through Resend (https://resend.com) when RESEND_API_KEY is set.
// Without it, messages are written to the server log so an operator can relay them.

async function sendMail({ to, subject, text }) {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM || 'My Little Pomodoro <onboarding@resend.dev>';
  if (!key) {
    console.log(`[mail] RESEND_API_KEY not set — would send to ${to}: ${subject}\n${text}`);
    return false;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to, subject, text })
  });
  if (!res.ok) console.error('[mail] send failed', res.status, await res.text().catch(() => ''));
  return res.ok;
}

module.exports = { sendMail };
