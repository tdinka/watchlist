import { createHash, randomInt, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { emailConfigured, emailLayout, escapeHtml, sendEmail } from "@/lib/email";

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5; // wrong guesses allowed per code
const RESEND_AFTER_SECONDS = 30;
const MAX_PER_HOUR = 5;

export type Signup = { name: string; mode: "create" | "join"; householdName?: string; inviteCode?: string };

export class CodeError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function normalizeEmail(email: string) {
  return email.toLowerCase().trim();
}

function hashCode(email: string, code: string) {
  return createHash("sha256").update(`${process.env.NEXTAUTH_SECRET}:${email}:${code}`).digest("hex");
}

// Makes a fresh 6-digit code for `email`, replaces any older ones, and emails it.
export async function issueCode(email: string, signup?: Signup) {
  const recent = await db.loginCode.findMany({
    where: { email, createdAt: { gte: new Date(Date.now() - 3600 * 1000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent[0] && Date.now() - recent[0].createdAt.getTime() < RESEND_AFTER_SECONDS * 1000) {
    throw new CodeError("A code was just sent. Wait a few seconds before asking for another.", 429);
  }
  if (recent.length >= MAX_PER_HOUR) {
    throw new CodeError("Too many codes asked for this hour. Try again later.", 429);
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  // Older codes stop working once a new one is sent (rows are kept for the hourly limit).
  await db.loginCode.updateMany({ where: { email, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
  await db.loginCode.create({
    data: {
      email,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
      signup: (signup ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  });

  if (!emailConfigured()) {
    // Lets the app be tried on a computer before email is set up. Never in production.
    if (process.env.NODE_ENV !== "production") {
      console.log(`[dev] Sign-in code for ${email}: ${code}`);
      return;
    }
    throw new CodeError("Email isn't set up for this app yet, so codes can't be sent.", 503);
  }
  await sendEmail(
    email,
    `${code} is your Watchlist code`,
    emailLayout(
      "Your sign-in code",
      `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:8px 0 16px">${escapeHtml(code)}</p>
       <p>Enter it in Watchlist to sign in. It works for ${CODE_MINUTES} minutes.</p>
       <p style="color:#6b7080">If you didn't ask for this, you can ignore this email.</p>`,
      false,
    ),
  );
}

// Checks a code. Returns the code's row (with any sign-up details) when it's
// right, and uses it up; otherwise counts a wrong guess and returns null.
export async function checkCode(email: string, code: string) {
  const row = await db.loginCode.findFirst({
    where: { email, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row || row.attempts >= MAX_ATTEMPTS) return null;

  const given = Buffer.from(hashCode(email, code.replace(/\D/g, "")));
  const stored = Buffer.from(row.codeHash);
  if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
    await db.loginCode.update({ where: { id: row.id }, data: { attempts: { increment: 1 } } });
    return null;
  }
  await db.loginCode.updateMany({ where: { email, expiresAt: { gt: new Date() } }, data: { expiresAt: new Date() } });
  return row;
}
