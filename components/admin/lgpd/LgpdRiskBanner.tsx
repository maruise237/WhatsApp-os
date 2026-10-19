"use client";
import Link from "next/link";
import { Warning } from "@/lib/ui/icons";
import type { AdminLgpdRequest } from "@/hooks/useAdminLGPDRequests";

interface LgpdRiskBannerProps {
  requests: AdminLgpdRequest[];
}

const TERMINAL_STATUSES = new Set(["completed", "failed"]);

export function LgpdRiskBanner({ requests }: LgpdRiskBannerProps) {
  const active = requests.filter((r) => !TERMINAL_STATUSES.has(r.status));
  const critical = active.filter(
    (r) => r.risk_level === "expired" || r.risk_level === "at_risk",
  );

  if (critical.length === 0) return null;

  const count = critical.length;

  return (
    <div
      role="alert"
      className="sticky top-0 z-10 flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300"
    >
      <div className="flex items-center gap-3">
        <Warning
          size={18}
          weight="fill"
          className="shrink-0 text-red-600 dark:text-red-400"
          aria-hidden
        />
        <span>
          <strong>{count}</strong>{" "}
          {count === 1 ? "demande arrivant à échéance" : "demandes arrivant à échéance"} dans moins de 24 h ou déjà échue{count !== 1 ? "s" : ""} — action immédiate requise.
        </span>
      </div>
      <Link
        href="/admin/lgpd?risk_level=expired"
        className="shrink-0 text-xs font-medium underline underline-offset-2 hover:opacity-80"
      >
        Voir les détails
      </Link>
    </div>
  );
}
