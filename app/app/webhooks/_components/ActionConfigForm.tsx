"use client";
import * as React from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePipelines, usePipelineStages } from "@/hooks/webhooks/useWebhookSources";
import { useAgentsList } from "@/hooks/ai/useAgents";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";

export type ActionItem =
  | { type: "create_or_move_lead"; config: { pipeline_id: string; stage_id: string } }
  | { type: "send_whatsapp_message"; config: { channel_session_id: string; template: string } }
  | {
      type: "send_ai_message";
      config: { agent_id: string; channel_session_id: string; instruction: string };
    }
  | { type: "add_tag"; config: { tags: string[] } }
  | { type: "assign_owner"; config: { user_id: string } }
  | { type: "call_webhook"; config: { url: string; secret?: string; secret_enc?: string } };

export function defaultActionConfig(type: ActionItem["type"]): ActionItem {
  switch (type) {
    case "create_or_move_lead":
      return { type, config: { pipeline_id: "", stage_id: "" } };
    case "send_whatsapp_message":
      return { type, config: { channel_session_id: "", template: "" } };
    case "send_ai_message":
      return { type, config: { agent_id: "", channel_session_id: "", instruction: "" } };
    case "add_tag":
      return { type, config: { tags: [] } };
    case "assign_owner":
      return { type, config: { user_id: "" } };
    case "call_webhook":
      return { type, config: { url: "" } };
  }
}

interface FormProps<T> {
  config: T;
  onChange: (config: T) => void;
}

function CreateOrMoveLeadForm({
  config,
  onChange,
}: FormProps<{ pipeline_id: string; stage_id: string }>) {
  const { data: pipelinesRes, isLoading: pipelinesLoading } = usePipelines();
  const { data: boardRes, isLoading: stagesLoading } = usePipelineStages(
    config.pipeline_id || null,
  );
  const pipelines = pipelinesRes?.data ?? [];
  const stages = boardRes?.data?.stages ?? [];

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      <div className="space-y-1">
        <Label>Tableau</Label>
        <Select
          value={config.pipeline_id}
          onValueChange={(v) => onChange({ pipeline_id: v, stage_id: "" })}
          disabled={pipelinesLoading}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisissez le tableau" />
          </SelectTrigger>
          <SelectContent>
            {pipelines.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <Label>Étape</Label>
        <Select
          value={config.stage_id}
          onValueChange={(v) => onChange({ ...config, stage_id: v })}
          disabled={!config.pipeline_id || stagesLoading}
        >
          <SelectTrigger>
            <SelectValue
              placeholder={config.pipeline_id ? "Choisissez l’étape" : "Choisissez d’abord le tableau"}
            />
          </SelectTrigger>
          <SelectContent>
            {stages.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}

const TEMPLATE_VARS = [
  { token: "{{nome}}", label: "Nom" },
  { token: "{{telefone}}", label: "Téléphone" },
  { token: "{{lead.title}}", label: "Titre du lead" },
];

function SendWhatsappForm({
  config,
  onChange,
}: FormProps<{ channel_session_id: string; template: string }>) {
  const { data: sessions } = useChannelSessions();
  const textareaRef = React.useRef<HTMLTextAreaElement>(null);

  const insertVar = (token: string) => {
    const el = textareaRef.current;
    const current = config.template;
    const start = el?.selectionStart ?? current.length;
    const end = el?.selectionEnd ?? current.length;
    const next = current.slice(0, start) + token + current.slice(end);
    onChange({ ...config, template: next });
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + token.length, start + token.length);
    });
  };

  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>Numéro WhatsApp</Label>
        <Select
          value={config.channel_session_id}
          onValueChange={(v) => onChange({ ...config, channel_session_id: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisissez le numéro" />
          </SelectTrigger>
          <SelectContent>
            {(sessions ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id} disabled={s.status !== "WORKING"}>
                {channelLabel(s) + (s.status !== "WORKING" ? " — desconectado" : "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(sessions ?? []).some((s) => s.status !== "WORKING") ? (
          <p className="text-xs text-muted-foreground">
            Les numéros déconnectés apparaissent désactivés — reconnectez-les dans Connexions avant de les utiliser.
          </p>
        ) : null}
      </div>
      <div className="space-y-1">
        <Label>Message</Label>
        <div className="flex flex-wrap gap-1">
          {TEMPLATE_VARS.map((v) => (
            <Button
              key={v.token}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => insertVar(v.token)}
            >
              {v.label}
            </Button>
          ))}
        </div>
        <Textarea
          ref={textareaRef}
          rows={4}
          value={config.template}
          onChange={(e) => onChange({ ...config, template: e.target.value })}
          placeholder="Bonjour {{nome}}, comment allez-vous ?"
        />
        <p className="text-xs text-muted-foreground">
          {/* NÃO cravar "7h e 22h": a janela passou a vir dos ajustes DO NÚMERO
              (Conexões), no fuso da sua organização, e quem a mudou lá veria a
              tela continuar prometendo outro horário. Rótulo visível é contrato. */}
          Nous respectons la plage d’envoi et la limite quotidienne configurées pour ce numéro dans Connexions — hors de la plage, le message attend la suivante.
        </p>
      </div>
    </div>
  );
}

/**
 * "Mensagem escrita pela IA" — o agente publicado lê o formulário e escreve.
 *
 * Três campos e uma ordem deliberada: QUEM escreve (o agente, que carrega o
 * tom e o conhecimento do negócio), POR ONDE sai (o número), e — o campo que
 * faz a diferença — O QUE FAZER com o que a pessoa preencheu.
 *
 * Esse terceiro campo é o mesmo desenho do "Instrução para a IA" de um passo de
 * follow-up. Sem ele o agente receberia um punhado de dados e nenhuma tarefa, e
 * escreveria o genérico que qualquer IA escreve. Os exemplos abaixo do campo
 * não são enfeite: eles mostram o NÍVEL de instrução que funciona, que é a
 * dúvida real de quem nunca escreveu prompt.
 */
function SendAiMessageForm({
  config,
  onChange,
}: FormProps<{ agent_id: string; channel_session_id: string; instruction: string }>) {
  const { data: agentes } = useAgentsList();
  const { data: sessions } = useChannelSessions();
  const publicados = (agentes ?? []).filter((a) => Boolean(a.published_version_id));
  const semPublicado = (agentes ?? []).length > 0 && publicados.length === 0;

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Quel agent écrit</Label>
        <Select
          value={config.agent_id}
          onValueChange={(v) => onChange({ ...config, agent_id: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisissez l’agent" />
          </SelectTrigger>
          <SelectContent>
            {(agentes ?? []).map((a) => (
              <SelectItem key={a.id} value={a.id} disabled={!a.published_version_id}>
                {a.name + (a.published_version_id ? "" : "— non publié")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          {semPublicado
            ? "Aucun agent n’est publié. Publiez-en un dans Agents IA pour pouvoir l’utiliser ici."
            : "Il écrit avec le même ton et les mêmes connaissances que pendant les échanges."}
        </p>
      </div>

      <div className="space-y-1">
        <Label>Numéro WhatsApp</Label>
        <Select
          value={config.channel_session_id}
          onValueChange={(v) => onChange({ ...config, channel_session_id: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder="Choisissez le numéro" />
          </SelectTrigger>
          <SelectContent>
            {(sessions ?? []).map((s) => (
              <SelectItem key={s.id} value={s.id} disabled={s.status !== "WORKING"}>
                {channelLabel(s) + (s.status !== "WORKING" ? " — desconectado" : "")}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1">
        <Label htmlFor="ai-instruction">Ce que l’IA doit faire des données</Label>
        <Textarea
          id="ai-instruction"
          rows={4}
          maxLength={1000}
          value={config.instruction}
          onChange={(e) => onChange({ ...config, instruction: e.target.value })}
          placeholder={
            "Ex.: Agradeça o interesse citando o segmento que a pessoa informou, mostre em uma frase " +
            "como a gente resolve a dificuldade que ela descreveu, e pergunte qual o melhor horário para conversar."
          }
        />
        <p className="text-xs text-muted-foreground">
          L’agent sait déjà qu’il s’agit du PREMIER message, juste après que la personne a rempli le formulaire, et il reçoit tous les champs qu’elle a renseignés. Ici, vous indiquez quoi en faire — plus c’est concret, meilleur sera le message.
        </p>
      </div>
    </div>
  );
}

function AddTagForm({ config, onChange }: FormProps<{ tags: string[] }>) {
  const [text, setText] = React.useState(config.tags.join(", "));
  return (
    <div className="space-y-1">
      <Label>Tags (séparés par des virgules)</Label>
      <Input
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const tags = e.target.value
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean);
          onChange({ tags });
        }}
        placeholder="bienvenue, nouveau-lead"
      />
    </div>
  );
}

function AssignOwnerForm({ config, onChange }: FormProps<{ user_id: string }>) {
  const { data: members } = useAssignableMembers(true);
  return (
    <div className="space-y-1">
      <Label>Conseiller</Label>
      <Select value={config.user_id} onValueChange={(v) => onChange({ user_id: v })}>
        <SelectTrigger>
          <SelectValue placeholder="Choisissez le conseiller" />
        </SelectTrigger>
        <SelectContent>
          {(members ?? []).map((m) => (
            <SelectItem key={m.user_id} value={m.user_id}>
              {m.full_name ?? m.user_id.slice(0, 8)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function CallWebhookForm({
  config,
  onChange,
}: FormProps<{ url: string; secret?: string; secret_enc?: string }>) {
  // O segredo é write-only: o servidor guarda cifrado (secret_enc) e nunca
  // devolve o valor. Digitar aqui envia `secret` novo; deixar em branco
  // preserva o secret_enc existente no round-trip do editor.
  const hasStoredSecret = Boolean(config.secret_enc) && !config.secret;
  return (
    <div className="space-y-2">
      <div className="space-y-1">
        <Label>Adresse (URL)</Label>
        <Input
          type="url"
          value={config.url}
          onChange={(e) => onChange({ ...config, url: e.target.value })}
          placeholder="https://monsysteme.com/webhook"
        />
      </div>
      <div className="space-y-1">
        <Label>Secret (facultatif)</Label>
        <Input
          type="password"
          value={config.secret ?? ""}
          onChange={(e) => {
            const next = e.target.value;
            // Digitou algo novo → substitui; limpou → remove o guardado também.
            const { secret_enc: _enc, ...rest } = config;
            onChange(next ? { ...rest, secret: next } : { ...rest, secret: undefined });
          }}
          placeholder={hasStoredSecret ? "•••••••• (défini — saisissez pour remplacer)" : "un mot de passe rien qu’à vous"}
        />
        <p className="text-xs text-muted-foreground">
          {hasStoredSecret
            ? "Un secret est déjà stocké en sécurité. Saisir ici le remplace ; vider le supprime."
            : "Si vous le renseignez, nous enverrons une signature pour que l’autre système vérifie que c’est bien nous."}
        </p>
      </div>
    </div>
  );
}

export function ActionConfigForm({
  action,
  onChange,
}: {
  action: ActionItem;
  onChange: (next: ActionItem) => void;
}) {
  switch (action.type) {
    case "create_or_move_lead":
      return (
        <CreateOrMoveLeadForm
          config={action.config}
          onChange={(config) => onChange({ type: action.type, config })}
        />
      );
    case "send_whatsapp_message":
      return (
        <SendWhatsappForm
          config={action.config}
          onChange={(config) => onChange({ type: action.type, config })}
        />
      );
    case "send_ai_message":
      return (
        <SendAiMessageForm
          config={action.config}
          onChange={(config) => onChange({ type: action.type, config })}
        />
      );
    case "add_tag":
      return (
        <AddTagForm
          config={action.config}
          onChange={(config) => onChange({ type: action.type, config })}
        />
      );
    case "assign_owner":
      return (
        <AssignOwnerForm
          config={action.config}
          onChange={(config) => onChange({ type: action.type, config })}
        />
      );
    case "call_webhook":
      return (
        <CallWebhookForm
          config={action.config}
          onChange={(config) => onChange({ type: action.type, config })}
        />
      );
  }
}
