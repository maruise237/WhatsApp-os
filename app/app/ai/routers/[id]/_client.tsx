"use client";
import * as React from "react";
import Link from "next/link";
import { useRouter as useNextRouter } from "next/navigation";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { ArrowRight, CaretLeft, Info, Plus, Trash } from "@/lib/ui/icons";
import { randomId } from "@/lib/random-id";
import { usePermission } from "@/hooks/auth/AuthProvider";
import {
  useRouter as useRouterData,
  useUpdateRouter,
  useDeleteRouter,
  useSaveMembers,
  useTestRouter,
  type RouterDetailState,
  type RouterMemberInput,
} from "@/hooks/ai/useRouters";
import type { ClassifierModelOption } from "@/lib/ai/classifier-models";
import type { ChannelSessionLite } from "../../agents/[id]/_components/AgentForm";

interface AgentLite {
  id: string;
  name: string;
}

interface Props {
  routerId: string;
  initialState: RouterDetailState;
  agents: AgentLite[];
  channelSessions: ChannelSessionLite[];
  /** Só os modelos que esta organização consegue usar — ver lib/ai/classifier-models. */
  classifierModels: ClassifierModelOption[];
}

interface DraftMember extends RouterMemberInput {
  key: string;
}

const NONE = "__none__";
/** "deixa o sistema escolher" — grava null nos dois campos e volta ao padrão. */
const AUTO = "__auto__";

/**
 * A chave do seletor carrega provedor E modelo (`provider::model_id`) porque os
 * dois precisam ser gravados juntos: `resolveOrgLlmConfig` decide o provedor pela
 * config da ORGANIZAÇÃO, então um id de modelo salvo sozinho viaja para o
 * provedor errado e a classificação falha em toda mensagem.
 */
function classifierKeyFrom(config: Record<string, unknown> | null | undefined): string {
  const cfg = config ?? {};
  const model = cfg["classifier_model"];
  const provider = cfg["classifier_provider"];
  if (typeof model !== "string" || model.trim() === "") return AUTO;
  if (typeof provider !== "string" || provider.trim() === "") return AUTO;
  return `${provider}::${model}`;
}

export function RouterEditorClient({
  routerId,
  initialState,
  agents,
  channelSessions,
  classifierModels,
}: Props) {
  const nextRouter = useNextRouter();
  const canManage = usePermission("ai.routers.manage");
  const canTest = usePermission("ai.routers.view");
  const { data } = useRouterData(routerId, initialState);
  const router = data?.router ?? initialState.router;
  const members = data?.members ?? initialState.members;

  const channel = channelSessions.find((c) => c.id === router.channel_session_id);

  const [name, setName] = React.useState(router.name);
  const [isActive, setIsActive] = React.useState(router.is_active);
  const [fallbackAgentId, setFallbackAgentId] = React.useState(router.fallback_agent_id ?? "");
  // Uma chave só para os dois campos: escolher modelo sem levar o provedor junto
  // manda o id para o provedor da ORG, e a classificação falha sempre.
  const [classifier, setClassifier] = React.useState(() => classifierKeyFrom(router.config));
  const [draftMembers, setDraftMembers] = React.useState<DraftMember[]>(() =>
    members.map((m) => ({ ...m, key: m.id })),
  );
  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [testMessage, setTestMessage] = React.useState("");

  const updateRouter = useUpdateRouter(routerId);
  const deleteRouter = useDeleteRouter();
  const saveMembers = useSaveMembers(routerId);
  const testRouter = useTestRouter(routerId);

  const baseline = React.useMemo(
    () => ({
      name: router.name,
      isActive: router.is_active,
      fallbackAgentId: router.fallback_agent_id ?? "",
      classifier: classifierKeyFrom(router.config),
      members: members.map(({ agent_id, intent_name, intent_description, examples }) => ({
        agent_id,
        intent_name,
        intent_description,
        examples,
      })),
    }),
    [router, members],
  );

  const currentMembers = draftMembers.map(({ agent_id, intent_name, intent_description, examples }) => ({
    agent_id,
    intent_name,
    intent_description,
    examples,
  }));

  const dirty =
    name !== baseline.name ||
    isActive !== baseline.isActive ||
    fallbackAgentId !== baseline.fallbackAgentId ||
    classifier !== baseline.classifier ||
    JSON.stringify(currentMembers) !== JSON.stringify(baseline.members);

  const memberErrors = draftMembers.map((m) => {
    if (!m.agent_id) return "Choisissez l’agent qui prend en charge cette intention.";
    if (m.intent_name.trim().length === 0) return "Donnez un nom court à l’intention.";
    if (m.intent_description.trim().length === 0)
      return "Décrivez quand l’IA doit choisir cette intention.";
    return null;
  });
  const duplicateNames = new Set(
    draftMembers
      .map((m) => m.intent_name.trim().toLowerCase())
      .filter((n, i, arr) => n.length > 0 && arr.indexOf(n) !== i),
  );
  const isValid =
    name.trim().length > 0 &&
    memberErrors.every((e) => e === null) &&
    draftMembers.every((m) => !duplicateNames.has(m.intent_name.trim().toLowerCase()));

  const saving = updateRouter.isPending || saveMembers.isPending;

  function patchMember(key: string, patch: Partial<DraftMember>) {
    setDraftMembers((prev) => prev.map((m) => (m.key === key ? { ...m, ...patch } : m)));
  }

  function addMember() {
    setDraftMembers((prev) => [
      ...prev,
      {
        key: randomId(),
        agent_id: "",
        intent_name: "",
        intent_description: "",
        examples: [],
      },
    ]);
  }

  function removeMember(key: string) {
    setDraftMembers((prev) => prev.filter((m) => m.key !== key));
  }

  async function handleSave() {
    if (!isValid) {
      toast.error("Corrigez les champs en surbrillance avant d’enregistrer.");
      return;
    }
    try {
      if (
        name !== baseline.name ||
        isActive !== baseline.isActive ||
        fallbackAgentId !== baseline.fallbackAgentId ||
        classifier !== baseline.classifier
      ) {
        const [provider, modelId] = classifier.split("::");
        await updateRouter.mutateAsync({
          name,
          is_active: isActive,
          fallback_agent_id: fallbackAgentId || null,
          // O PATCH mescla `config` com a existente, então mandar só estes dois
          // campos preserva sticky/min_confidence.
          config:
            classifier === AUTO
              ? { classifier_model: null, classifier_provider: null }
              : { classifier_model: modelId, classifier_provider: provider },
        });
      }
      if (JSON.stringify(currentMembers) !== JSON.stringify(baseline.members)) {
        await saveMembers.mutateAsync(currentMembers);
      }
      toast.success("Roteador salvo.");
    } catch (err) {
      showApiError(err);
    }
  }

  function handleDelete() {
    deleteRouter.mutate(routerId, {
      onSuccess: () => {
        toast.success("Roteador removido.");
        nextRouter.push("/app/ai/routers");
      },
      onError: showApiError,
    });
  }

  function handleTest() {
    if (!testMessage.trim()) return;
    testRouter.mutate(testMessage, { onError: showApiError });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          <Link
            href="/app/ai/routers"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <CaretLeft size={14} aria-hidden /> Roteadores
          </Link>
          <Badge variant={router.is_active ? "success" : "neutral"} className="text-xs">
            {router.is_active ? "ativo" : "inativo"}
          </Badge>
        </div>
        {canManage && (
          <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(true)} className="text-destructive">
            <Trash /> Supprimer le routeur
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Identification</h3>
            <div className="space-y-1">
              <Label htmlFor="router-name">Nom</Label>
              <Input
                id="router-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canManage}
                maxLength={120}
              />
            </div>
            <div className="space-y-1">
              <Label>Numéro WhatsApp</Label>
              <p className="rounded-md border border-border/60 px-3 py-2 text-sm text-muted-foreground">
                {channel
                  ? `${channel.display_name}${channel.phone_number ? ` · ${channel.phone_number}` : ""}`
                  : "Numéro supprimé"}
              </p>
              <p className="text-xs text-muted-foreground">
                Le numéro ne peut pas être changé après la création — créez un autre routeur pour un autre numéro.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="router-active"
                checked={isActive}
                onCheckedChange={setIsActive}
                disabled={!canManage}
              />
              <Label htmlFor="router-active">
                {isActive ? "Actif — oriente les conversations de ce numéro" : "Inactif — n’oriente rien"}
              </Label>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Modèle qui identifie l’intention</h3>
            <div className="space-y-1">
              <Label htmlFor="router-classifier">Modèle du classificateur</Label>
              <Select
                value={classifier}
                onValueChange={setClassifier}
                disabled={!canManage || classifierModels.length === 0}
              >
                <SelectTrigger id="router-classifier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={AUTO}>Automatique — utilise le fournisseur de l’organisation</SelectItem>
                  {classifierModels.map((m) => (
                    <SelectItem key={`${m.provider}::${m.model_id}`} value={`${m.provider}::${m.model_id}`}>
                      {m.display_name} · {m.provider}
                      {m.origem === "plataforma" ? "(clé de cette installation)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {classifierModels.length === 0
                  ? "Aucune clé d’IA utilisable dans cette organisation — enregistrez-en une dans Agents IA › Identifiants pour pouvoir choisir le modèle."
                  : "Seuls les modèles des fournisseurs ayant une clé enregistrée ici apparaissent. Si le compte du fournisseur n’a plus de crédit, l’identification échoue et tout bascule vers l’agent de secours."}
              </p>
            </div>
          </Card>

          <Card className="space-y-3 p-4">
            <h3 className="text-sm font-medium">Si aucune intention ne correspond</h3>
            <div className="space-y-1">
              <Label htmlFor="router-fallback">Agent de secours</Label>
              <Select
                value={fallbackAgentId || NONE}
                onValueChange={(v) => setFallbackAgentId(v === NONE ? "" : v)}
                disabled={!canManage}
              >
                <SelectTrigger id="router-fallback">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Aucun — répond avec le service par défaut</SelectItem>
                  {agents.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Quand l’IA n’est pas sûre de ce que veut le client, elle appelle cet agent au lieu de bloquer la conversation.
              </p>
            </div>
          </Card>

          <TestPanel
            isActive={router.is_active}
            canTest={canTest}
            message={testMessage}
            onMessageChange={setTestMessage}
            onTest={handleTest}
            result={testRouter.data}
            pending={testRouter.isPending}
          />
        </div>

        <div className="space-y-4">
          <Card className="space-y-3 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="text-sm font-medium">Intentions</h3>
                <p className="text-xs text-muted-foreground">
                  Chaque intention décrit une situation et indique quel agent doit prendre la conversation quand le client veut cela.
                </p>
              </div>
              {canManage && (
                <Button variant="outline" size="sm" onClick={addMember} className="shrink-0">
                  <Plus /> Intention
                </Button>
              )}
            </div>

            {draftMembers.length === 0 ? (
              <p className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Aucune intention pour le moment. Sans intentions, toute conversation va directement à l’agent de secours (ou reste sans réponse automatique, si vous n’en choisissez pas).
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {draftMembers.map((m, i) => (
                  <li key={m.key} className="rounded-md border border-border/60 p-3">
                    <IntentRow
                      member={m}
                      agents={agents}
                      disabled={!canManage}
                      error={memberErrors[i] ?? null}
                      duplicate={duplicateNames.has(m.intent_name.trim().toLowerCase())}
                      onChange={(patch) => patchMember(m.key, patch)}
                      onRemove={() => removeMember(m.key)}
                    />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {canManage && (
            <div className="flex sm:justify-end">
              <Button onClick={handleSave} disabled={!dirty || !isValid || saving} className="w-full sm:w-auto">
                {saving ? "Salvando…" : "Enregistrer"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer &ldquo;{router.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Le numéro est de nouveau pris en charge par les déclencheurs normaux des agents (sans orientation par intention). Les intentions de ce routeur sont supprimées avec lui. Action irréversible.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Supprimer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function IntentRow({
  member,
  agents,
  disabled,
  error,
  duplicate,
  onChange,
  onRemove,
}: {
  member: DraftMember;
  agents: AgentLite[];
  disabled: boolean;
  error: string | null;
  duplicate: boolean;
  onChange: (patch: Partial<DraftMember>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <div className="flex-1 space-y-1">
          <Label>Nom de l’intention</Label>
          <Input
            value={member.intent_name}
            onChange={(e) => onChange({ intent_name: e.target.value })}
            placeholder="Ex.: quer comprar"
            disabled={disabled}
            maxLength={120}
            aria-invalid={duplicate}
          />
        </div>
        <div className="flex-1 space-y-1">
          <Label>Agent qui répond</Label>
          <Select value={member.agent_id || undefined} onValueChange={(v) => onChange({ agent_id: v })} disabled={disabled}>
            <SelectTrigger>
              <SelectValue placeholder="Sélectionnez l’agent" />
            </SelectTrigger>
            <SelectContent>
              {agents.map((a) => (
                <SelectItem key={a.id} value={a.id}>
                  {a.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {!disabled && (
          <Button
            variant="ghost"
            size="icon"
            className="mt-5 shrink-0"
            onClick={onRemove}
            aria-label="Supprimer l’intention"
          >
            <Trash />
          </Button>
        )}
      </div>
      <div className="space-y-1">
        <Label>Quand choisir cette intention</Label>
        <Textarea
          value={member.intent_description}
          onChange={(e) => onChange({ intent_description: e.target.value })}
          placeholder="Écrivez-le comme vous l’expliqueriez à un nouveau conseiller : dans quelle situation le client arrive ici."
          disabled={disabled}
          rows={2}
          maxLength={2000}
        />
      </div>
      <ExamplesInput
        value={member.examples}
        onChange={(examples) => onChange({ examples })}
        disabled={disabled}
      />
      {duplicate ? (
        <p className="text-xs text-destructive">Une autre intention porte déjà ce nom.</p>
      ) : error ? (
        <p className="text-xs text-destructive">{error}</p>
      ) : null}
    </div>
  );
}

function ExamplesInput({
  value,
  onChange,
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  function add(ex: string) {
    const trimmed = ex.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= 10) return;
    onChange([...value, trimmed]);
    setDraft("");
  }

  function remove(ex: string) {
    onChange(value.filter((x) => x !== ex));
  }

  return (
    <div className="space-y-1">
      <Label>Phrases d’exemple (facultatif)</Label>
      <div className="flex flex-wrap gap-1 rounded border border-border/60 p-2">
        {value.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => !disabled && remove(ex)}
            className="group flex items-center gap-1 rounded bg-muted px-2 py-0.5 text-xs hover:bg-destructive/15"
            disabled={disabled}
            aria-label={`Supprimer l’exemple ${ex}`}
          >
            {ex}
            <span className="text-muted-foreground group-hover:text-destructive">×</span>
          </button>
        ))}
        {value.length === 0 ? (
          <span className="text-xs text-muted-foreground">Aucune phrase d’exemple.</span>
        ) : null}
      </div>
      {!disabled && (
        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                add(draft);
              }
            }}
            placeholder="Ex.: quanto custa? (Enter)"
            disabled={value.length >= 10}
            maxLength={200}
          />
          <button
            type="button"
            className="rounded border border-border/60 px-3 text-xs hover:bg-muted"
            onClick={() => add(draft)}
            disabled={draft.trim() === ""}
          >
            Ajouter
          </button>
        </div>
      )}
    </div>
  );
}

function TestPanel({
  isActive,
  canTest,
  message,
  onMessageChange,
  onTest,
  result,
  pending,
}: {
  isActive: boolean;
  canTest: boolean;
  message: string;
  onMessageChange: (v: string) => void;
  onTest: () => void;
  result:
    | {
        intent_name: string | null;
        confidence: number;
        min_confidence: number;
        agent_id: string | null;
        agent_name: string | null;
      }
    | undefined;
  pending: boolean;
}) {
  const belowThreshold = result?.intent_name != null && result.confidence < result.min_confidence;
  return (
    <Card className="space-y-3 p-4">
      <CardHeader className="p-0">
        <CardTitle className="text-sm">Tester la classification</CardTitle>
        <CardDescription>
          Écrivez une phrase comme un client l’écrirait et voyez quelle intention et quel agent le routeur choisirait — sans affecter aucune vraie conversation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3 p-0">
        {!isActive && (
          <div className="flex items-start gap-2 rounded-md bg-accent-soft p-3 text-xs text-text-muted">
            <Info className="mt-0.5 shrink-0" aria-hidden />
            <p>Activez le routeur pour pouvoir tester la classification.</p>
          </div>
        )}
        <Textarea
          value={message}
          onChange={(e) => onMessageChange(e.target.value)}
          placeholder="Ex. : bonjour, je voudrais connaître le prix de l’offre premium"
          rows={2}
          maxLength={4000}
          disabled={!canTest || !isActive}
        />
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={!canTest || !isActive || pending || !message.trim()}
        >
          {pending ? "Testando…" : "Tester la classification"}
          {!pending && <ArrowRight />}
        </Button>
        {result && (
          <div className="rounded-md border border-border/60 p-3 text-sm">
            <p>
              Intention : <span className="font-medium">{result.intent_name ?? "aucune ne correspond"}</span>
              {result.intent_name && (
                <span className="ml-2 text-xs text-muted-foreground">
                  confiance {(result.confidence * 100).toFixed(0)}%
                </span>
              )}
            </p>
            {belowThreshold && (
              <p className="text-xs text-amber-600">
                Confiance {(result.confidence * 100).toFixed(0)}% — sous le minimum de{" "}
                {(result.min_confidence * 100).toFixed(0)}%, basculerait vers le service par défaut en production.
              </p>
            )}
            <p>
              Agent qui répondrait :{" "}
              <span className="font-medium">{result.agent_name ?? "aucun (sans agent de secours)"}</span>
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
