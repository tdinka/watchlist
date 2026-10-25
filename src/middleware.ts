export { default } from "next-auth/middleware";

export const config = {
  // Everything needs sign-in except the sign-in pages themselves, the auth
  // API, the daily check (it has its own secret), and static files.
  matcher: ["/((?!api/auth|api/cron|login|register|_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest).*)"],
};
