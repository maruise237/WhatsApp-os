"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CaretDown } from "@/lib/ui/icons";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createDefaultAgent, skipAi } from "@/app/actions/onboarding/createDefaultAgent";
import type { PromptTemplate } from "@/lib/schemas/onboarding";
import { cn } from "@/lib/utils";
import { useT } from "@/hooks/i18n/useT";

/**
 * O jeito de falar, não o "estilo de prompt".
 *
 * Os rótulos anteriores eram "Amigável (e-commerce)", "Profissional" e "Suporte
 * minimalista" — dois deles amarrados a loja virtual, num produto cuja maioria
 * de adopters roda em clínica, imobiliária e infoproduto. Os identificadores
 * continuam os mesmos porque já existem gravados; só a fala mudou.
 */
const JEITOS: { id: PromptTemplate; titulo: string; desc: string }[] = [
  {
    id: "ecommerce_friendly",
    titulo: "Proche et chaleureux",
    desc: "Parle comme une vraie personne, engage la conversation, rassure. Idéal pour la vente au quotidien.",
  },
  {
    id: "ecommerce_professional",
    titulo: "Direct et cordial",
    desc: "Va droit au but sans être sec, et indique toujours la prochaine étape.",
  },
  {
    id: "support_minimal",
    titulo: "Court et pratique",
    desc: "Phrases courtes, ne demande que l’essentiel et appelle une personne tôt.",
  },
];

interface Props {
  /** O que ele já sabe fazer, em linguagem de dono de negócio. */
  capacidades: string[];
  /** O que ele nunca faz — as conferências antes de cada mensagem sair. */
  conferencias: string[];
}

export function SetupAiForm({ capacidades, conferencias }: Props) {
  const t = useT();
  const [name, setName] = useState(t("Atendente IA"));
  const [jeito, setJeito] = useState<PromptTemplate>("ecommerce_friendly");
  const [regras, setRegras] = useState("");
  const [naoPublicado, setNaoPublicado] = useState<string | null>(null);
  const [causa, setCausa] = useState<"canal" | "modelo" | "chave" | null>(null);
  const [regrasNaoSalvas, setRegrasNaoSalvas] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-6"
      action={(formData) => {
        startTransition(async () => {
          setNaoPublicado(null);
          setCausa(null);
          setRegrasNaoSalvas(null);
          const res = await createDefaultAgent(formData);
          if (res && !res.ok) {
            toast.error(`${t("Falha ao criar agente:")} ${res.error}`);
            return;
          }
          if (res?.regras_nao_salvas) setRegrasNaoSalvas(res.regras_nao_salvas);
          // Sem chave utilizável não há o que publicar — e o conselho é outro:
          // não é esperar o catálogo nem trocar de provedor, é cadastrar a chave.
          if (res?.publish_blocked_by === "chave") {
            setCausa("chave");
            toast.warning(t("Atendente criado, mas ainda não está no ar."));
            return;
          }
          if (res?.publish_blocked_by === "modelo") {
            setCausa("modelo");
            toast.warning(t("Atendente criado, mas ainda não está no ar."));
            return;
          }
          if (res?.publish_error) {
            setNaoPublicado(res.publish_error);
            setCausa("canal");
            toast.warning(t("Agente criado, mas ainda não publicado."));
          }
        });
      }}
    >
      <div className="space-y-5 rounded-lg border bg-background p-6">
        <div className="space-y-2">
          <Label htmlFor="name">{t("Como ele vai se chamar")}</Label>
          <Input
            id="name"
            name="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            minLength={2}
            maxLength={80}
            required
          />
          <p className="text-xs text-muted-foreground">
            {t("É o nome que aparece para o seu time. O cliente vê só a conversa.")}
          </p>
        </div>

        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{t("O jeito dele falar")}</legend>
          <div className="grid gap-2">
            {JEITOS.map((j) => (
              <label
                key={j.id}
                className={cn(
                  "flex cursor-pointer items-start gap-3 rounded-md border p-3 transition-colors",
                  jeito === j.id ? "bg-primary/5 border-primary" : "hover:bg-muted/40",
                )}
              >
                <input
                  type="radio"
                  name="prompt_template"
                  value={j.id}
                  checked={jeito === j.id}
                  onChange={() => setJeito(j.id)}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium">{t(j.titulo)}</span>
                  <span className="block text-xs text-muted-foreground">{t(j.desc)}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="space-y-2">
          <Label htmlFor="regras_da_casa">{t("As regras da casa (opcional)")}</Label>
          <Textarea
            id="regras_da_casa"
            name="regras_da_casa"
            value={regras}
            onChange={(e) => setRegras(e.target.value)}
            rows={5}
            maxLength={20000}
            placeholder={t(
              "Nunca prometa desconto sem confirmar com uma pessoa.\nHorário de atendimento: 9h às 18h, de segunda a sexta.\nSempre chame o cliente pelo primeiro nome.",
            )}
          />
          <p className="text-xs text-muted-foreground">
            {t(
              "O que vale para qualquer atendimento aqui. Pode deixar em branco agora e escrever depois — ele aprende com você ao longo do tempo.",
            )}
          </p>
        </div>
      </div>

      {/*
        Nada aqui pede configuração: é o que ele JÁ vem sabendo. O passo
        anterior entregava um funcionário sem dizer uma linha sobre o que ele
        é capaz de fazer — e a primeira pergunta de quem contrata alguém é
        exatamente essa.
      */}
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Repliées : 24 lignes dépliées doublaient la page sur téléphone (4 300 px). */}
        <details className="group rounded-lg border bg-background">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-medium">
            <span>
              {t("Ele já vem sabendo")} <span className="font-normal text-muted-foreground">({capacidades.length})</span>
            </span>
            <CaretDown size={16} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="space-y-1 px-4 pb-4 text-xs text-muted-foreground">
            {capacidades.map((c) => (
              <li key={c}>· {t(c)}</li>
            ))}
          </ul>
        </details>
        <details className="group rounded-lg border bg-background">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2 text-sm font-medium">
            <span>
              {t("E nunca vai fazer")} <span className="font-normal text-muted-foreground">({conferencias.length})</span>
            </span>
            <CaretDown size={16} aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <ul className="space-y-1 px-4 text-xs text-muted-foreground">
            {conferencias.map((c) => (
              <li key={c}>· {t(c)}</li>
            ))}
          </ul>
          <p className="px-4 pb-4 pt-2 text-xs text-muted-foreground">
            {t("Essas conferências acontecem antes de cada mensagem sair, e não têm interruptor.")}
          </p>
        </details>
      </div>

      {regrasNaoSalvas && (
        <div
          role="alert"
          className="space-y-2 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            L’assistant a été créé, mais les <strong>règles internes</strong> n’ont pas été
            enregistrées. Copiez votre texte avant de quitter, puis enregistrez-le à nouveau via{" "}
            <strong>IA › Mémoire</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Erro do banco de dados:")} <code className="break-all">{regrasNaoSalvas}</code>
          </p>
        </div>
      )}

      {causa === "chave" && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            Votre assistant a été créé, mais il est resté en <strong>{t("rascunho")}</strong> : il
            n’est pas encore relié à l’intelligence de la plateforme.
          </p>
          <p className="text-sm">
            L’intelligence de l’assistant n’est pas encore activée sur cette installation.
            Continuez la configuration : il se mettra en ligne dès qu’elle le sera.
          </p>
          {/*
            ⚠️ SEM ESTA SAÍDA O PASSO É UM BECO. O aviso irmão (o de modelo) já
            oferecia seguir, e este nasceu sem — quem instala sem chave nenhuma
            (o caminho que o CI exercita) ficava preso na tela de treinar, com um
            diagnóstico correto e nenhum botão. O atendente EXISTE como rascunho;
            o que falta é o cérebro, e isso se resolve depois sem travar o resto
            do wizard.
          */}
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      {causa === "modelo" && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            Votre assistant a été créé, mais il est resté en <strong>{t("rascunho")}</strong> : un
            brouillon ne répond pas aux messages.
          </p>
          {/*
            As duas causas pedem conselhos OPOSTOS, e dar o errado custa caro:
            mandar esperar a sincronização diária quem já tem o catálogo
            completo é mandar esperar para sempre. Foi o que a tela fazia, e só
            apareceu percorrendo o wizard num ambiente com 400 modelos baixados.
          */}
          <p className="text-sm">
            L’intelligence de l’assistant n’est pas encore prête sur cette installation. Continuez
            la configuration, puis publiez-le plus tard via <strong>IA › Agents</strong>.
          </p>
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      {naoPublicado && (
        <div
          role="alert"
          className="space-y-3 rounded-md border border-amber-300/60 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20"
        >
          <p className="text-sm font-medium">
            Votre agent a été créé, mais il est resté en <strong>{t("rascunho")}</strong> :
            impossible de lire les numéros WhatsApp de cette installation, donc le numéro de réponse
            ne peut pas être déterminé. Un brouillon ne répond pas aux messages.
          </p>
          <p className="text-xs text-muted-foreground">
            {t("Erro do banco de dados:")} <code className="break-all">{naoPublicado}</code>
          </p>
          <p className="text-sm">
            Réessayez avec le bouton ci-dessous (un nouveau clic ne crée pas de second agent) ou
            continuez maintenant et publiez-le plus tard via <strong>IA › Agents</strong>.
          </p>
          <div className="flex sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                window.location.href = "/onboarding";
              }}
              className="w-full sm:w-auto"
            >
              {t("Continuar sem publicar")}
            </Button>
          </div>
        </div>
      )}

      <div className="onb-acoes flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(() => void skipAi())}
        >
          {t("Pular")}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? t("Criando...") : t("Criar e continuar")}
        </Button>
      </div>
    </form>
  );
}
