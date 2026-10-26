import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { CodeError, issueCode, normalizeEmail } from "@/lib/login-codes";

const schema = z.object({
  email: z.string().email("That doesn't look like an email address."),
  // Present when creating an account; absent when signing in.
  signup: z
    .object({
      name: z.string().trim().min(1, "Name is required").max(80),
      mode: z.enum(["create", "join"]),
      householdName: z.string().trim().max(80).optional(),
      inviteCode: z.string().trim().max(20).optional(),
    })
    .optional(),
});

// Step one of signing in or signing up: email a 6-digit code.
export async function POST(req: Request) {
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const email = normalizeEmail(parsed.data.email);
  const signup = parsed.data.signup;
  const existing = await db.user.findUnique({ where: { email } });

  if (signup) {
    if (existing) {
      return NextResponse.json({ error: "There's already an account with that email. Sign in instead." }, { status: 409 });
    }
    if (signup.mode === "create" && !signup.householdName) {
      return NextResponse.json({ error: "Household name is required." }, { status: 400 });
    }
    if (signup.mode === "join") {
      const household = signup.inviteCode
        ? await db.household.findUnique({ where: { inviteCode: signup.inviteCode.toUpperCase() } })
        : null;
      if (!household) return NextResponse.json({ error: "That invite code wasn't found." }, { status: 404 });
    }
  } else if (!existing) {
    return NextResponse.json({ error: "There's no account with that email. Create one first." }, { status: 404 });
  }

  try {
    await issueCode(email, signup);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof CodeError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("Sending a sign-in code failed:", err);
    return NextResponse.json({ error: "The code couldn't be sent. Try again in a minute." }, { status: 502 });
  }
}
