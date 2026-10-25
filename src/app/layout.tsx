import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Inter } from "next/font/google";
import { getServerSession } from "next-auth";
import "./globals.css";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

const display = Bricolage_Grotesque({ subsets: ["latin"], variable: "--font-display", weight: ["600", "700"] });
const body = Inter({ subsets: ["latin"], variable: "--font-body" });

export const metadata: Metadata = {
  title: "Watchlist",
  description: "Everything on your streaming services in one place.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Watchlist", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#101218",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);
  const unread = session?.user?.id
    ? await db.alert.count({ where: { userId: session.user.id, readAt: null } }).catch(() => 0)
    : 0;

  return (
    <html lang="en" className={`${display.variable} ${body.variable}`}>
      <body>
        <Providers>
          {session && <Nav unread={unread} />}
          <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 md:pb-16">{children}</main>
          <footer className="mx-auto max-w-6xl px-4 pb-28 text-xs text-paper-faint sm:px-6 md:pb-8">
            Title data from{" "}
            <a className="underline" href="https://www.themoviedb.org" target="_blank" rel="noreferrer">
              TMDB
            </a>
            ; where-to-watch data from{" "}
            <a className="underline" href="https://www.justwatch.com" target="_blank" rel="noreferrer">
              JustWatch
            </a>
            . This product uses the TMDB API but is not endorsed or certified by TMDB.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
