import "server-only";

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { assertEmailAccepted, getEmailTransport } from "./transporter";
import type { RenderedEmail } from "./templates";

/**
 * Development without SMTP: write the message to `.data/mail/` so sign-in
 * links and invitations can be followed locally and in end-to-end tests.
 * Production never takes this path (the transport is required there).
 */
async function writeDevelopmentMail(to: string, email: RenderedEmail) {
  const directory = path.resolve(process.cwd(), ".data/mail");
  await mkdir(directory, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.txt`;
  await writeFile(path.join(directory, name), `To: ${to}\nSubject: ${email.subject}\n\n${email.text}\n`, { mode: 0o600 });
}

/** Send one rendered email. Without SMTP in development it is written to .data/mail instead. */
export async function sendRenderedEmail(to: string, email: RenderedEmail, messageId?: string) {
  const { transporter, from } = await getEmailTransport();
  if (!transporter) {
    if (process.env.NODE_ENV === "production") throw new Error("SMTP is not configured.");
    await writeDevelopmentMail(to, email);
    return;
  }
  const result = await transporter.sendMail({ messageId, from, to, subject: email.subject, text: email.text, html: email.html });
  assertEmailAccepted(result);
}
