import { EMAIL_BUTTON_STYLE, EMAIL_COLORS, emailLayout } from "./brand";

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

function paragraph(text: string) {
  return `<p style="font-size:16px;line-height:1.5;color:${EMAIL_COLORS.inkMuted};margin:0 0 16px">${text}</p>`;
}

function heading(text: string) {
  return `<h2 style="margin-top:0;color:${EMAIL_COLORS.ink};font-size:20px;font-weight:600">${text}</h2>`;
}

function actionButton(url: string, label: string) {
  const safe = escapeHtml(url);
  return `<p style="text-align:center;margin:32px 0"><a href="${safe}" style="${EMAIL_BUTTON_STYLE}">${escapeHtml(label)}</a></p>
<p style="font-size:13px;color:${EMAIL_COLORS.inkMuted};overflow-wrap:anywhere">Or open this link: <a href="${safe}" style="color:${EMAIL_COLORS.teal}">${safe}</a></p>`;
}

const ROLE_WORDS: Record<string, string> = { MANAGER: "an inventory manager", STAFF: "staff", MEMBER: "a member", TECHNICIAN: "a technician" };

export function renderInviteEmail(input: { spaceName: string; inviterName?: string | null; role: string; inviteUrl: string; expiresAt: Date }): RenderedEmail {
  const who = input.inviterName?.trim() ? escapeHtml(input.inviterName.trim()) : "Someone";
  const space = escapeHtml(input.spaceName);
  const role = ROLE_WORDS[input.role] ?? "a member";
  const days = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 86_400_000));
  const subject = `You're invited to ${input.spaceName} on Space Works`;
  const html = emailLayout(subject, [
    heading(`Join ${space}`),
    paragraph(`${who} invited you to join <strong>${space}</strong> as ${role}. It's where the space keeps its tools, parts and loans in order.`),
    actionButton(input.inviteUrl, "Accept invitation"),
    paragraph(`This invitation expires in ${days} ${days === 1 ? "day" : "days"}. If you weren't expecting it, you can ignore this email.`),
  ].join(""));
  const text = `${input.inviterName?.trim() || "Someone"} invited you to join ${input.spaceName} on Space Works as ${role}.\n\nAccept the invitation: ${input.inviteUrl}\n\nThis link expires in ${days} ${days === 1 ? "day" : "days"}. If you weren't expecting it, ignore this email.`;
  return { subject, html, text };
}

export function renderPasswordResetEmail(input: { resetUrl: string }): RenderedEmail {
  const subject = "Reset your Space Works password";
  const html = emailLayout(subject, [
    heading("Reset your password"),
    paragraph("We received a request to reset the password for your Space Works account. The link below works once and expires in 1 hour."),
    actionButton(input.resetUrl, "Choose a new password"),
    paragraph("If you didn't ask for this, you can ignore this email. Your password stays the same."),
  ].join(""));
  const text = `Reset your Space Works password\n\nOpen this link to choose a new password (expires in 1 hour):\n${input.resetUrl}\n\nIf you didn't ask for this, ignore this email.`;
  return { subject, html, text };
}

export function renderMagicLinkEmail(input: { signInUrl: string }): RenderedEmail {
  const subject = "Your Space Works Inventory sign-in link";
  const html = emailLayout(subject, [
    heading("Sign in to Space Works Inventory"),
    paragraph("Use the button below to sign in. The link works once and expires in 15 minutes."),
    actionButton(input.signInUrl, "Sign in"),
    paragraph("If you didn't ask for this, you can ignore this email. Nobody can sign in without the link."),
  ].join(""));
  const text = `Sign in to Space Works Inventory\n\nOpen this link to sign in (works once, expires in 15 minutes):\n${input.signInUrl}\n\nIf you didn't ask for this, ignore this email.`;
  return { subject, html, text };
}

export function renderEmailVerificationEmail(input: { verificationUrl: string }): RenderedEmail {
  const subject = "Confirm your email for Space Works";
  const html = emailLayout(subject, [
    heading("Confirm your email"),
    paragraph("Confirm that this address belongs to you. The link expires in 1 hour."),
    actionButton(input.verificationUrl, "Confirm email"),
    paragraph("If you didn't change your email on Space Works, you can ignore this email."),
  ].join(""));
  const text = `Confirm your email for Space Works\n\n${input.verificationUrl}\n\nThe link expires in 1 hour.`;
  return { subject, html, text };
}

/** Generic notification email for later features (digests, mentions). `bodyHtml` must already be escaped. */
export function renderNotificationEmail(input: { title: string; bodyHtml: string; actionUrl?: string; actionLabel?: string }): RenderedEmail {
  const subject = input.title;
  const html = emailLayout(escapeHtml(subject), [
    heading(escapeHtml(input.title)),
    `<div style="font-size:16px;line-height:1.5;color:${EMAIL_COLORS.inkMuted}">${input.bodyHtml}</div>`,
    input.actionUrl ? actionButton(input.actionUrl, input.actionLabel ?? "Open Space Works") : "",
  ].join(""));
  const text = `${input.title}\n\n${input.bodyHtml.replace(/<[^>]+>/g, "")}${input.actionUrl ? `\n\n${input.actionUrl}` : ""}`;
  return { subject, html, text };
}

/** A repair request to an external technician: their own link, nothing else from the space. */
export function renderRepairRequestEmail(input: { spaceName: string; reference: string; itemName: string; title: string; severity: string; linkUrl: string; expiresAt: Date; assigned?: boolean }): RenderedEmail {
  const space = escapeHtml(input.spaceName);
  const days = Math.max(1, Math.round((input.expiresAt.getTime() - Date.now()) / 86_400_000));
  const subject = input.assigned ? `Repair ${input.reference} from ${input.spaceName} is yours` : `Repair request ${input.reference} from ${input.spaceName}`;
  const next = input.assigned
    ? "Open the link to see the details and record your fix notes, photos and the amount you ask."
    : "Open the link to see the details, accept or decline. Other technicians may have been asked too; the first to accept gets the job.";
  const html = emailLayout(escapeHtml(subject), [
    heading(input.assigned ? `${space} assigned you a repair` : `Can you repair this for ${space}?`),
    paragraph(`<strong>${escapeHtml(input.itemName)}</strong>: ${escapeHtml(input.title)} (${escapeHtml(input.severity.toLowerCase())} priority).`),
    paragraph(next),
    actionButton(input.linkUrl, "Open the repair request"),
    paragraph(`The link is only for you and expires in ${days} ${days === 1 ? "day" : "days"}.`),
  ].join(""));
  const text = `${subject}\n\n${input.itemName}: ${input.title} (${input.severity.toLowerCase()} priority).\n\n${next}\n${input.linkUrl}\n\nThe link is only for you and expires in ${days} ${days === 1 ? "day" : "days"}.`;
  return { subject, html, text };
}
