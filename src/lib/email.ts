// Emails go out through Resend (resend.com). Without RESEND_API_KEY the app
// still works; it just doesn't send email.

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY);
}

export function appUrl(path = "") {
  return (process.env.NEXTAUTH_URL || "http://localhost:3000").replace(/\/$/, "") + path;
}

export function escapeHtml(text: string) {
  return text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

export async function sendEmail(to: string, subject: string, html: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not set");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      // onboarding@resend.dev works without setting up a domain, but Resend
      // then only delivers to the email address the Resend account was made with.
      from: process.env.EMAIL_FROM || "Watchlist <onboarding@resend.dev>",
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) throw new Error(`Resend answered ${res.status}: ${await res.text()}`);
}

export function emailLayout(heading: string, bodyHtml: string, alertsFooter = true) {
  return `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#16181d">
  <h1 style="font-size:20px;margin:0 0 16px">${escapeHtml(heading)}</h1>
  ${bodyHtml}
  ${
    alertsFooter
      ? `<p style="font-size:12px;color:#6b7080;margin-top:28px">You're getting this because email alerts are on in
  <a href="${appUrl("/settings")}" style="color:#6b7080">Watchlist settings</a>.</p>`
      : ""
  }
</div>`;
}
