"use client";
import * as React from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useT } from "@/hooks/i18n/useT";
import type { AgentVersionRow } from "@/hooks/ai/useAgentVersions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  draft: AgentVersionRow;
  published: AgentVersionRow | null;
  onConfirm: () => void;
  isPending: boolean;
}

function diffArr(prev: string[], next: string[]) {
  const added = next.filter((x) => !prev.includes(x));
  const removed = prev.filter((x) => !next.includes(x));
  return { added, removed };
}

export function PublishConfirmDialog({
  open,
  onOpenChange,
  draft,
  published,
  onConfirm,
  isPending,
}: Props) {
  const t = useT();
  const toolsDiff = diffArr(published?.tool_ids ?? [], draft.tool_ids);
  const promptDeltaChars = draft.system_prompt.length - (published?.system_prompt.length ?? 0);

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t("Publier la v{version} ?").replace("{version}", String(draft.version_number))}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              "Esta versão se tornará a ativa no atendimento. A versão atual ({current}) será marcada como superseded.",
            ).replace("{current}", published ? `v${published.version_number}` : t("aucune"))}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="border-border/60 space-y-2 rounded-md border p-3 text-xs">
          {toolsDiff.added.length > 0 ? (
            <p>
              <strong>{t("Capacités ajoutées :")}</strong> {toolsDiff.added.join(", ")}
            </p>
          ) : null}
          {toolsDiff.removed.length > 0 ? (
            <p>
              <strong>{t("Capacités supprimées :")}</strong> {toolsDiff.removed.join(", ")}
            </p>
          ) : null}
          <p>
            <strong>{t("Prompt :")}</strong>{" "}
            {promptDeltaChars > 0
              ? t("+{count} caractères").replace("{count}", String(promptDeltaChars))
              : promptDeltaChars < 0
                ? t("{count} caractères").replace("{count}", String(promptDeltaChars))
                : t("aucun changement")}
          </p>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{t("Annuler")}</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isPending}>
            {isPending
              ? t("Publication…")
              : t("Publier la v{version}").replace("{version}", String(draft.version_number))}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
