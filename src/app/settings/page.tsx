import Link from "next/link";
import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { emailConfigured } from "@/lib/email";
import { getCatalog } from "@/lib/services";
import { hasTmdbKey } from "@/lib/tmdb";
import { TmdbProblem } from "@/components/Notice";
import { CheckNowButton, EmailToggle, HouseholdName, ServicesPicker, SignOutButton } from "./SettingsControls";

export const dynamic = "force-dynamic";

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-lg font-bold">{title}</h2>
      {hint && <p className="mb-4 mt-0.5 text-sm text-paper-muted">{hint}</p>}
      <div className={hint ? "" : "mt-3"}>{children}</div>
    </section>
  );
}

export default async function SettingsPage({ searchParams }: { searchParams: { welcome?: string } }) {
  const user = await currentUser();
  const [me, household] = await Promise.all([
    db.user.findUniqueOrThrow({ where: { id: user.id } }),
    db.household.findUniqueOrThrow({ where: { id: user.householdId }, include: { users: { select: { id: true, name: true } } } }),
  ]);
  const catalog = hasTmdbKey() ? await getCatalog() : [];

  return (
    <div className="space-y-5">
      <h1 className="text-3xl font-bold">{searchParams.welcome ? "Welcome! First, your services" : "Settings"}</h1>
      {searchParams.welcome && (
        <div className="card flex flex-wrap items-center justify-between gap-3 border-marquee/50 p-4">
          <p className="text-sm">Tick the services you have below, then tell us what you like.</p>
          <Link href="/welcome" className="btn-primary">
            Next: pick shows you love →
          </Link>
        </div>
      )}

      <Section
        title="Our streaming services"
        hint="Tick everything your household subscribes to. Browse, search and recommendations use these. Changes save straight away."
      >
        {catalog.length ? <ServicesPicker catalog={catalog} selected={household.services} /> : <TmdbProblem />}
      </Section>

      <Section title="Add favorites in bulk" hint="Bring in what you already watch so alerts and recommendations work straight away.">
        <div className="flex flex-wrap gap-2">
          <Link href="/import" className="btn-quiet">
            Import Netflix history or a list
          </Link>
          <Link href="/welcome" className="btn-quiet">
            Pick from popular titles
          </Link>
        </div>
      </Section>

      <Section title="Alerts">
        <div className="space-y-5">
          <EmailToggle initial={me.emailAlerts} configured={emailConfigured()} />
          <div>
            <p className="mb-2 text-sm text-paper-muted">The app checks your favorites once a day. You can also check now:</p>
            <CheckNowButton />
          </div>
        </div>
      </Section>

      <Section title="Household" hint="Everyone in the household shares the services list. Favorites and alerts are each person's own.">
        <HouseholdName initial={household.name} />
        <p className="mt-4 text-sm text-paper-muted">
          Invite someone: they choose &ldquo;Join with a code&rdquo; when creating an account and enter{" "}
          <span className="rounded bg-night-raised px-2 py-0.5 font-mono text-base tracking-widest text-paper">{household.inviteCode}</span>
        </p>
        <p className="mt-3 text-sm text-paper-muted">Members: {household.users.map((u) => u.name).join(", ")}</p>
      </Section>

      <Section title="Account">
        <p className="mb-3 text-sm text-paper-muted">Signed in as {me.email}</p>
        <SignOutButton />
      </Section>
    </div>
  );
}
