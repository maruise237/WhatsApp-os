"use client";
import Link from "next/link";
import { Info } from "@/lib/ui/icons";

export function DBAOnlyNotice() {
  return (
    <div
      role="note"
      className="flex gap-3 rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900"
    >
      <Info size={20} className="mt-0.5 shrink-0 text-blue-600" aria-hidden />
      <div className="space-y-1">
        <p className="text-sm font-semibold">
          La gestion des administrateurs de la plateforme est réservée au DBA
        </p>
        <p className="text-sm leading-relaxed text-blue-800">
          Conformément à la Spec 01 §3.4 T-04 : l’ajout, la suppression ou la modification de{" "}
          <code className="rounded bg-blue-100 px-1 font-mono text-xs">
            platform_admins
          </code>{" "}
          se fait exclusivement en SQL par le DBA, avec une note explicative dans{" "}
          <code className="rounded bg-blue-100 px-1 font-mono text-xs">
            api_audit_log
          </code>
          . Cette page est informative et en lecture seule — aucun bouton de modification n’est disponible, par conception.
        </p>
        <p className="pt-1">
          <Link
            href="/runbook/platform-admin-management.md"
            className="text-xs font-medium text-blue-700 underline underline-offset-2 hover:text-blue-900"
          >
            Voir le runbook →
          </Link>
        </p>
      </div>
    </div>
  );
}
