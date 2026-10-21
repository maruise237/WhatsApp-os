"use client";
import * as React from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
import { Robot, Plus, Trash, PencilSimple } from "@/lib/ui/icons";
import { SeloDeAutoria } from "@/components/operacao/SeloDeAutoria";
import {
  useAutomationRules,
  useUpdateAutomationRule,
  useDeleteAutomationRule,
  type AutomationRuleRow,
} from "@/hooks/webhooks/useAutomationRules";
import { TRIGGER_LABELS, type TriggerEvent } from "./labels";
import { RuleEditor } from "./RuleEditor";
import { useT } from "@/hooks/i18n/useT";

const RULES_QUERY_KEY = ["automation-rules"];

function triggerLabel(trigger: string, t: ReturnType<typeof useT>): string {
  const label = TRIGGER_LABELS[trigger as TriggerEvent] ?? trigger;
  return t(label);
}

export function RulesTab() {
  const t = useT();
  const { data, isLoading } = useAutomationRules();
  const update = useUpdateAutomationRule();
  const del = useDeleteAutomationRule();
  const qc = useQueryClient();

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AutomationRuleRow | null>(null);
  const [deleting, setDeleting] = React.useState<AutomationRuleRow | null>(null);

  const rules = data?.data ?? [];

  const toggleActive = (rule: AutomationRuleRow, checked: boolean) => {
    qc.setQueryData<{ data: AutomationRuleRow[] }>(RULES_QUERY_KEY, (old) =>
      old
        ? { data: old.data.map((r) => (r.id === rule.id ? { ...r, is_active: checked } : r)) }
        : old,
    );
    update.mutate(
      { id: rule.id, is_active: checked },
      {
        onSuccess: () => toast.success(checked ? t("Automatisation activée.") : t("Automatisation mise en pause.")),
        onError: () => qc.invalidateQueries({ queryKey: RULES_QUERY_KEY }),
      },
    );
  };

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (rule: AutomationRuleRow) => {
    setEditing(rule);
    setEditorOpen(true);
  };

  if (isLoading) {
    return (
      <div className="grid gap-3 pt-4 sm:grid-cols-2">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="flex justify-center pt-10">
        <Card className="max-w-md">
          <CardHeader className="items-center text-center">
            <Robot className="mb-2 h-10 w-10 text-accent" />
            <CardTitle>{t("Créez votre première automatisation")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              {t("Ex. : lorsqu’un nouveau contact arrive, envoyer un message de bienvenue.")}
            </p>
            <Button onClick={openCreate}>
              <Plus /> {t("Nouvelle automatisation")}
            </Button>
          </CardContent>
        </Card>
        <RuleEditor open={editorOpen} onOpenChange={setEditorOpen} rule={editing} />
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      <div className="flex sm:justify-end">
        <Button onClick={openCreate} className="w-full sm:w-auto">
          <Plus /> Nouvelle automatisation
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rules.map((r) => (
          <Card key={r.id}>
            <CardHeader className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="truncate">{r.name}</CardTitle>
                <Badge variant={r.is_active ? "success" : "neutral"}>
                  {r.is_active ? t("Active") : t("En pause")}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">{triggerLabel(r.trigger_event, t)}</p>
              <p className="text-xs text-muted-foreground">
                {r.actions.length} {r.actions.length === 1 ? t("action") : t("actions")}
              </p>
              {/* Uma regra ligada roda sozinha para sempre: quem a ligou é parte
                  do estado dela, não um detalhe de auditoria. */}
              <SeloDeAutoria kind={r.last_change_actor_kind} em={r.last_change_at} />
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-2">
              <Switch
                checked={r.is_active}
                disabled={update.isPending}
                onCheckedChange={(checked) => toggleActive(r, checked)}
                aria-label={`${r.is_active ? t("Mettre en pause") : t("Activer")} ${r.name}`}
              />
              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(r)}
                  aria-label={t("Modifier l’automatisation")}
                >
                  <PencilSimple />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleting(r)}
                  aria-label={t("Supprimer l’automatisation")}
                >
                  <Trash />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <RuleEditor open={editorOpen} onOpenChange={setEditorOpen} rule={editing} />

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("Supprimer cette automatisation ?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting?.name} {t("cessera immédiatement de fonctionner. Cette action est irréversible.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("Annuler")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleting) return;
                await del.mutateAsync(deleting.id);
                toast.success(t("Automatisation supprimée."));
                setDeleting(null);
              }}
            >
              {t("Supprimer")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
