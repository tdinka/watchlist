"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

// A button that POSTs to an API route and refreshes the page.
export function ActionButton({
  url,
  body,
  children,
  className = "btn-quiet",
  doneLabel,
}: {
  url: string;
  body?: unknown;
  children: React.ReactNode;
  className?: string;
  doneLabel?: string;
}) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">("idle");
  return (
    <button
      className={className}
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: body ? JSON.stringify(body) : undefined,
        });
        setState(res.ok ? "done" : "error");
        router.refresh();
      }}
    >
      {state === "busy" ? "…" : state === "done" && doneLabel ? doneLabel : state === "error" ? "Didn't work, try again" : children}
    </button>
  );
}
