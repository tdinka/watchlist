import { currentUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { AlertList } from "@/components/AlertList";
import { ActionButton } from "@/components/ActionButton";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const user = await currentUser();
  const alerts = await db.alert.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" }, take: 60 });
  const unread = alerts.filter((a) => !a.readAt).length;

  return (
    <div className="max-w-3xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-bold">Alerts</h1>
        {unread > 0 && (
          <ActionButton url="/api/alerts" className="text-sm text-paper-muted hover:text-paper">
            Mark all as seen
          </ActionButton>
        )}
      </div>
      <p className="mt-1 text-sm text-paper-muted">
        Too much about one show? Open it and choose &ldquo;New seasons only&rdquo; or &ldquo;Off&rdquo; under Alerts.
      </p>
      <div className="mt-6">
        {alerts.length === 0 ? <p className="text-paper-muted">No alerts yet.</p> : <AlertList alerts={alerts} />}
      </div>
    </div>
  );
}
