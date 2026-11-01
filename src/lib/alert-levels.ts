// How much someone hears about a show. Kept free of database code so the
// title page's setting buttons can use it too.
export type AlertLevel = "episodes" | "seasons" | "off";

export const ALERT_LEVELS: { value: AlertLevel; label: string }[] = [
  { value: "episodes", label: "Every episode" },
  { value: "seasons", label: "New seasons only" },
  { value: "off", label: "Off" },
];

export function isAlertLevel(value: unknown): value is AlertLevel {
  return value === "episodes" || value === "seasons" || value === "off";
}

// Talk and news shows air almost every day, so by default they only alert
// for a new season. `type` is TMDB's, e.g. "Scripted", "Talk Show", "News".
export function automaticLevel(type: string | null | undefined): AlertLevel {
  return type === "Talk Show" || type === "News" ? "seasons" : "episodes";
}
