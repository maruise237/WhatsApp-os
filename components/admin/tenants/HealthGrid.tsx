"use client";

import { HealthCard } from "./HealthCard";
import {
  WifiHigh,
  Storefront,
  Brain,
  ClipboardText,
} from "@/lib/ui/icons";
import type { TenantHealthResponse } from "@/app/api/v1/admin/tenants/[id]/health/route";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function formatLag(seconds: number | null): string {
  if (seconds === null) return "—";
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}min`;
  return `${Math.round(seconds / 3600)}h`;
}

/**
 * DÓLAR. `llm_calls.cost_cents` é centavo de USD — `pricing.ts` calcula em
 * dólares e multiplica por 100. Formatar em BRL fazia o operador ler um gasto
 * ~5x menor do que o que a fatura do provedor vai cobrar.
 */
function formatCents(cents: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "USD",
  }).format(cents / 100);
}

/** O teto vincula esta organização? É o que separa "100%" de "100% e parou". */
const MODO_LABEL: Record<TenantHealthResponse["ai"]["enforcement_mode"], string> = {
  off: "Non appliqué",
  avisar: "Avertit seulement",
  bloquear: "Arrête l’IA au plafond",
};

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface HealthGridProps {
  health: TenantHealthResponse;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HealthGrid({ health }: HealthGridProps) {
  const { waha, nuvemshop, ai, audit } = health;

  // WAHA card
  // Vocabulário real de channel_sessions.status: STARTING/SCAN_QR_CODE/WORKING/
  // STOPPED/FAILED. "CONNECTED" nunca chegava aqui — o CHECK do schema o proíbe.
  const wahaConnected = waha.sessions.filter((s) => s.status === "WORKING").length;
  const wahaPrimary =
    waha.sessions.length === 0
      ? "Aucune session"
      : `${wahaConnected}/${waha.sessions.length} conectada${waha.sessions.length !== 1 ? "s" : ""}`;

  const wahaDetails = waha.sessions.slice(0, 4).map((s) => ({
    label: s.waha_session_name ?? s.id.slice(0, 8),
    value: s.status ?? "—",
  }));

  // Nuvemshop card
  const nuPrimary = nuvemshop.connected ? "Connecté" : "Non connecté";
  const nuDetails = [
    { label: "Dernière synchro", value: formatDate(nuvemshop.last_synced_at) },
    ...(nuvemshop.days_until_expiry !== null
      ? [{ label: "Expire le", value: `${nuvemshop.days_until_expiry}d` }]
      : []),
    ...(nuvemshop.expires_at
      ? [{ label: "Le jeton expire", value: formatDate(nuvemshop.expires_at) }]
      : []),
  ];

  // AI budget card
  const aiPrimary =
    ai.percent_used !== null ? `${ai.percent_used}% utilisés` : "Sans budget";
  const aiDetails = [
    { label: "Consommé", value: formatCents(ai.consumed_cents) },
    {
      label: "Budget",
      value: ai.budget_cents ? formatCents(ai.budget_cents) : "Illimité",
    },
    { label: "Limite", value: MODO_LABEL[ai.enforcement_mode] },
  ];

  // Audit lag card
  const auditPrimary = formatLag(audit.lag_seconds);
  const auditDetails = [
    { label: "Dernier événement", value: formatDate(audit.last_at) },
    {
      label: "Lag",
      value: audit.lag_seconds !== null ? formatLag(audit.lag_seconds) : "—",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
      <HealthCard
        title="WAHA"
        status={waha.overall_status}
        icon={<WifiHigh size={18} aria-hidden />}
        primaryValue={wahaPrimary}
        details={wahaDetails}
      />

      <HealthCard
        title="Nuvemshop"
        status={nuvemshop.status}
        icon={<Storefront size={18} aria-hidden />}
        primaryValue={nuPrimary}
        details={nuDetails}
      />

      <HealthCard
        title="Budget IA"
        status={ai.status}
        icon={<Brain size={18} aria-hidden />}
        primaryValue={aiPrimary}
        details={aiDetails}
      />

      <HealthCard
        title="Audit Lag"
        status={audit.status}
        icon={<ClipboardText size={18} aria-hidden />}
        primaryValue={auditPrimary}
        details={auditDetails}
      />
    </div>
  );
}
