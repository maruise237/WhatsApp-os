"use client";
/**
 * Multi-select de fluxos de follow-up PUBLICADOS (status='active') pra
 * vincular ao agente (Task 7.2). Mesmo padrão de `ToolPicker.tsx` (fieldset +
 * checkboxes), trocando o catálogo MCP pela lista de `useFollowupFlows`
 * filtrada client-side — a rota `GET /api/v1/ai/followup-flows` não expõe
 * `?status=` ainda (checado; escopo mínimo não pediu mudança de rota).
 */
import * as React from "react";
import Link from "next/link";

import { useFollowupFlows } from "@/hooks/followup/useFollowupFlows";
import { useT } from "@/hooks/i18n/useT";

interface Props {
  value: string[];
  onChange: (ids: string[]) => void;
  disabled?: boolean;
}

export function FollowupFlowPicker({ value, onChange, disabled }: Props) {
  const t = useT();
  const query = useFollowupFlows();

  const publishedFlows = React.useMemo(
    () => (query.data ?? []).filter((f) => f.status === "active"),
    [query.data],
  );

  function toggle(id: string) {
    if (value.includes(id)) onChange(value.filter((x) => x !== id));
    else onChange([...value, id]);
  }

  if (query.isLoading) {
    return <p className="text-sm text-muted-foreground">{t("Chargement des flows publiés…")}</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-destructive">{t("Erreur lors du chargement des flows.")}</p>;
  }
  if (publishedFlows.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t("Aucun flow publié pour le moment.")}{" "}
        <Link
          href="/app/ai/followups"
          className="underline underline-offset-2 hover:text-foreground"
        >
          {t("Publiez un flow de follow-up")}
        </Link>{" "}
        {t("pour le rattacher.")}
      </p>
    );
  }

  return (
    <fieldset className="border-border/60 space-y-2 rounded-md border p-3">
      <legend className="px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t("Flows publiés")}
      </legend>
      {publishedFlows.map((f) => {
        const checked = value.includes(f.id);
        return (
          <label
            key={f.id}
            className="hover:bg-muted/40 flex cursor-pointer items-start gap-2 rounded p-1"
          >
            <input
              type="checkbox"
              className="mt-1 h-4 w-4 rounded border-border accent-primary"
              checked={checked}
              onChange={() => toggle(f.id)}
              disabled={disabled}
              aria-label={f.name}
            />
            <span className="flex-1 text-sm">{f.name}</span>
          </label>
        );
      })}
      {value.length > 20 ? (
        <p className="text-xs text-destructive">{t("Maximum de 20 flows par agent.")}</p>
      ) : null}
    </fieldset>
  );
}
