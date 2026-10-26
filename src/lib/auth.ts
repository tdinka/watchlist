import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { checkCode, normalizeEmail, type Signup } from "@/lib/login-codes";

function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alike characters
  let code = "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

// Creates the account described when the code was asked for. The details
// were checked then, but the household or email may have changed since.
async function createAccount(email: string, signup: Signup) {
  if (signup.mode === "join") {
    const household = await db.household.findUnique({ where: { inviteCode: (signup.inviteCode ?? "").toUpperCase().trim() } });
    if (!household) return null;
    return db.user.create({ data: { name: signup.name, email, householdId: household.id } });
  }
  let code = generateInviteCode();
  for (let i = 0; i < 5 && (await db.household.findUnique({ where: { inviteCode: code } })); i++) {
    code = generateInviteCode();
  }
  const household = await db.household.create({
    data: { name: signup.householdName || `${signup.name}'s household`, inviteCode: code, users: { create: { name: signup.name, email } } },
    include: { users: true },
  });
  return household.users[0];
}

export const authOptions: NextAuthOptions = {
  // Passed explicitly rather than relying on NextAuth's automatic env-var
  // detection, which can be unreliable in some hosting environments.
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email code",
      credentials: {
        email: { label: "Email", type: "email" },
        code: { label: "Code", type: "text" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.code) return null;
        const email = normalizeEmail(credentials.email);
        const row = await checkCode(email, credentials.code);
        if (!row) return null;

        const user =
          (await db.user.findUnique({ where: { email } })) ??
          (row.signup ? await createAccount(email, row.signup as unknown as Signup) : null);
        if (!user) return null;
        return { id: user.id, email: user.email, name: user.name, householdId: user.householdId };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.householdId = (user as any).householdId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.householdId = token.householdId as string;
      }
      return session;
    },
  },
};

// For API routes: the session, or null (the route should answer 401).
export async function requireSession() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.householdId) return null;
  return session;
}

// For pages: the signed-in user, or a trip to the login page.
export async function currentUser() {
  const session = await requireSession();
  if (!session) redirect("/login");
  return session.user;
}
