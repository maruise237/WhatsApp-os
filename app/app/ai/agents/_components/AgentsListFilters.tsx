"use client";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AgentStatus } from "./AgentStatusBadge";
import { useT } from "@/hooks/i18n/useT";

export type StatusFilter = AgentStatus | "all";

interface Props {
  status: StatusFilter;
  onStatusChange: (s: StatusFilter) => void;
  query: string;
  onQueryChange: (q: string) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
}

export function AgentsListFilters({
  status,
  onStatusChange,
  query,
  onQueryChange,
  showArchived,
  onShowArchivedChange,
}: Props) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder={t("Rechercher par nom…")}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        className="w-full sm:w-64"
        aria-label={t("Rechercher des agents")}
      />
      <Select value={status} onValueChange={(v) => onStatusChange(v as StatusFilter)}>
        <SelectTrigger className="w-44" aria-label={t("Filtrer par statut")}>
          <SelectValue placeholder={t("Statut")} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{t("Tous")}</SelectItem>
          <SelectItem value="published">{t("Publié")}</SelectItem>
          <SelectItem value="paused">{t("En pause")}</SelectItem>
          <SelectItem value="archived">{t("Archivé")}</SelectItem>
        </SelectContent>
      </Select>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(e) => onShowArchivedChange(e.target.checked)}
          className="size-4"
        />
        {t("Inclure les agents archivés")}
      </label>
    </div>
  );
}
