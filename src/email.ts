// License-key delivery email. Optional: if RESEND_API_KEY is unset, delivery
// is skipped (the /thanks page still shows the buyer their key).
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
      subject: 'Your tldr lifetime license key',
      html:
        `<p>Thanks for buying tldr! Your lifetime license key:</p>` +
        `<p><code style="font-size:18px;word-break:break-all">${licenseKey}</code></p>` +
        `<p>Paste it into the tldr extension settings to unlock it. ` +
        `Keep this email somewhere safe.</p>`,
    }),
  });
  if (!res.ok) {
    console.error('license email failed:', res.status, await res.text().catch(() => ''));
  }
};
