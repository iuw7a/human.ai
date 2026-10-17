import { Resend } from "resend";

/**
 * Server-side email sender (Resend). Key stays in RESEND_API_KEY (server-only).
 * For bulk/production sending verify a domain in Resend and set EMAIL_FROM
 * to it — the shared onboarding address only delivers to your own account email.
 */

let client: Resend | null = null;

function resend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY is not configured on the server.");
  if (!client) client = new Resend(key);
  return client;
}

export function emailFrom(): string {
  return process.env.EMAIL_FROM ?? "Human AI <onboarding@resend.dev>";
}

export async function sendHtml(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ id: string }> {
  const { data, error } = await resend().emails.send({
    from: emailFrom(),
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  if (error || !data) {
    throw new Error(error?.message ?? "Email provider rejected the send.");
  }
  return { id: data.id };
}
