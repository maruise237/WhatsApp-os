"use client";
import * as React from "react";
import { toast } from "sonner";
import { formatDistanceToNowStrict } from "date-fns";
import { fr } from "date-fns/locale";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Check,
  X,
  SkipForward,
  ArrowsClockwise,
  PaperPlaneTilt,
  ClockCountdown,
} from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import {
  useAutomationRuns,
  useResendAutomationRun,
  type AutomationRuleRunRow,
  type AutomationRuleRunActionResult,
} from "@/hooks/webhooks/useAutomationRules";
import { ACTION_LABELS, type ActionType } from "./labels";

function actionLabel(type: string): string {
  return ACTION_LABELS[type as ActionType] ?? type;
}

function relativeCreatedAt(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true, locale: fr });
}

function statusBadgeVariant(
  status: AutomationRuleRunRow["status"],
): "success" | "error" | "warning" | "info" {
  if (status === "success") return "success";
  if (status === "failed") return "error";
  if (status === "adiado") return "info";
  return "warning";
}

function statusBadgeLabel(status: AutomationRuleRunRow["status"]): string {
  if (status === "success") return "Succès";
  if (status === "failed") return "Échec";
  // "Aguardando envio", e não "Aguardando horário": desde que o agregador passou
  // a marcar `adiado` também quando a mensagem ficou na fila do canal (número
  // desconectado, transporte não configurado), o rótulo antigo afirmava uma
  // causa — o relógio — que muitas vezes não é a certa. A causa exata aparece
  // na linha da ação, logo abaixo, onde ela pode ser específica.
  if (status === "adiado") return "En attente d’envoi";
  return "Partiel";
}

/**
 * POR QUE a ação não aconteceu, em português.
 *
 * Os motivos técnicos vinham no `detail.reason` e NUNCA chegavam à tela: o ícone
 * de "pulou" aparecia sozinho, e quem montou a automação ficava sem saber se o
 * contato estava bloqueado, sem telefone, ou se a regra simplesmente não tinha
 * a quem escrever. `explicacao` é a frase que o backend já monta quando conhece
 * o caso (ver lib/automation/desfecho-do-envio.ts); este mapa cobre os motivos
 * que nascem no próprio executor.
 */
const MOTIVO_DA_PARADA: Record<string, string> = {
  no_contact: "Ce lead est arrivé sans contact associé : il n’y avait personne à qui écrire.",
  contact_blocked: "Le contact a demandé à ne plus recevoir de messages (désinscription).",
  no_phone: "Le contact n’a pas de numéro de téléphone enregistré.",
  missing_config: "Un réglage de cette action n’est pas rempli — ouvrez l’automatisation et vérifiez-la.",
  fora_da_janela_de_envio:
    "Hors de la plage d’envoi configurée pour ce numéro. Le message partira automatiquement à sa réouverture.",
  aguardando_o_canal: "Le message est en file d’attente et partira dès que le canal l’acceptera.",
  sem_agente_publicado:
    "L’agent choisi n’a pas de version publiée. Publiez-le dans Agents IA pour que l’automatisation puisse l’utiliser.",
  ia_indisponivel:
    "L’IA n’est pas configurée sur cette installation — enregistrez une clé dans Fournisseurs d’IA.",
  texto_vazio: "L’IA n’a renvoyé aucun texte. Revoyez le contexte que vous lui avez fourni.",
};

function explicacaoDe(action: AutomationRuleRunActionResult): string | null {
  const detail = action.detail ?? {};
  if (typeof detail.explicacao === "string") return detail.explicacao;
  const reason = typeof detail.reason === "string" ? detail.reason : null;
  if (reason && MOTIVO_DA_PARADA[reason]) return MOTIVO_DA_PARADA[reason];
  return reason;
}

function horarioDeRetorno(action: AutomationRuleRunActionResult): string | null {
  const retryAt = action.detail?.retry_at;
  if (typeof retryAt !== "string") return null;
  const quando = new Date(retryAt);
  if (Number.isNaN(quando.getTime())) return null;
  return quando.toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" });
}

function ActionLine({ action, run }: { action: AutomationRuleRunActionResult; run: AutomationRuleRunRow }) {
  const resend = useResendAutomationRun();

  const icon =
    action.status === "success" ? (
      <Check className="h-4 w-4 shrink-0 text-success" />
    ) : action.status === "failed" ? (
      <X className="h-4 w-4 shrink-0 text-error" />
    ) : action.status === "postponed" ? (
      <ClockCountdown className="h-4 w-4 shrink-0 text-muted-foreground" />
    ) : (
      <SkipForward className="h-4 w-4 shrink-0 text-muted-foreground" />
    );

  // A explicação vale TAMBÉM em `failed` — era aqui que os motivos da ação de
  // IA (`sem_agente_publicado`, `ia_indisponivel`, `texto_vazio`) morriam: eles
  // chegam em `action.error` como CÓDIGO, o ramo de falha imprime `error` cru, e
  // o mapa de frases logo acima nunca era consultado. Escrever as frases e não
  // ligá-las é o mesmo que não tê-las.
  const explicacao = explicacaoDe(action);
  const retorno = horarioDeRetorno(action);

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span>{actionLabel(action.type)}</span>
      </div>
      {action.status === "failed" ? (
        // `action.error` é texto de fora (resposta do webhook externo) — sem
        // tamanho garantido. `flex-wrap` + `break-words` impedem que um erro
        // comprido empurre o botão "Reenviar" pra fora da tela.
        <div className="ml-6 flex flex-wrap items-center justify-between gap-2 rounded-sm bg-muted px-2 py-1.5">
          <p className="min-w-0 break-words text-xs text-muted-foreground">
            {/* A frase ANTES do código cru. `action.error` já é texto de gente
                nas falhas de envio (desfechoDoEnvio traduz), mas nas falhas da
                IA ele é o código (`sem_agente_publicado`) — e é para esses que
                `explicacao` existe. O `??` mantém o erro do webhook externo,
                que não tem tradução possível e é a única pista real. */}
            {explicacao ?? action.error ?? "Cette action n’a pas fonctionné."}
          </p>
          {action.type === "call_webhook" ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="shrink-0"
              disabled={resend.isPending}
              onClick={() =>
                resend.mutate(run.id, {
                  onSuccess: () => toast.success("Renvoyé."),
                })
              }
            >
              <PaperPlaneTilt /> Renvoyer
            </Button>
          ) : null}
        </div>
      ) : explicacao ? (
        // Pular e adiar também precisam de razão visível: o ícone sozinho fazia
        // "não fiz nada" parecer "fiz e deu certo, só sem alarde".
        <div className="ml-6 rounded-sm bg-muted px-2 py-1.5">
          <p className="break-words text-xs text-muted-foreground">
            {explicacao}
            {retorno ? ` Nouvelle tentative ${retorno}.` : null}
          </p>
        </div>
      ) : null}
    </div>
  );
}

export function ActivityTab() {
  const { data, isLoading, refetch, isRefetching } = useAutomationRuns();
  const runs = data?.data ?? [];

  return (
    <div className="space-y-4 pt-4">
      <div className="flex sm:justify-end">
        <Button
          type="button"
          variant="secondary"
          onClick={() => refetch()}
          disabled={isRefetching}
          className="w-full sm:w-auto"
        >
          <ArrowsClockwise className={cn(isRefetching && "animate-spin")} /> Actualiser
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : runs.length === 0 ? (
        <div className="flex justify-center pt-10">
          <Card className="max-w-md">
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              Aucune automatisation n’a encore été exécutée. Dès qu’une règle activée se déclenchera, l’historique apparaîtra ici.
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="space-y-3">
          {runs.map((run) => (
            <Card key={run.id}>
              <CardHeader className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="truncate text-sm">
                    {run.automation_rules?.name ?? "Automatisation supprimée"}
                  </CardTitle>
                  <Badge variant={statusBadgeVariant(run.status)}>{statusBadgeLabel(run.status)}</Badge>
                </div>
                <p className="text-xs text-muted-foreground">{relativeCreatedAt(run.created_at)}</p>
              </CardHeader>
              <CardContent className="space-y-2">
                {run.actions_result.map((action, idx) => (
                  <ActionLine key={idx} action={action} run={run} />
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
