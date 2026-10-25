import { type NextAuthOptions, getServerSession } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";

export const authOptions: NextAuthOptions = {
  // Passed explicitly rather than relying on NextAuth's automatic env-var
  // detection, which can be unreliable in some hosting environments.
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({ where: { email: credentials.email.toLowerCase().trim() } });
        if (!user) return null;
        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;
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
