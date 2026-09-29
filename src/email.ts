// License-key delivery email. Optional: if RESEND_API_KEY is unset, delivery
// is skipped (the /thanks page then points the buyer at support instead).
export const sendLicenseEmail = async (
  to: string,
  licenseKey: string,
): Promise<void> => {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.FROM_EMAIL || 'tldr <noreply@example.com>';
  if (!apiKey) {
    console.log('RESEND_API_KEY unset; skipping license email');
    return;
  }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from,
      to,
      subject: 'Your tldr Pro license key',
      html:
        `<p>Thanks for going Pro! Your license key:</p>` +
        `<p><code style="font-size:18px">${licenseKey}</code></p>` +
        `<p>Paste it into the tldr extension settings to activate unlimited summaries.</p>`,
    }),
  });
  if (!res.ok) {
    console.error('license email failed:', res.status, await res.text().catch(() => ''));
  }
};
