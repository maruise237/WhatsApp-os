"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aplicarQuadro, pularQuadro, type QuadroAtual } from "@/app/actions/onboarding/montarQuadro";
import { explicacaoDoPasso } from "@/lib/leads/agent-mapping";
import { MAX_ETAPAS, MIN_ETAPAS, type PropostaDeFunil } from "@/lib/onboarding/proposta-de-funil";
import { PACOTES } from "@/lib/onboarding/pacotes-de-funil";
import type { Sugestao } from "@/lib/onboarding/sugerir-funil";

/**
 * O quadro proposto, editável antes de existir.
 *
 * ⚠️ O QUE SE GRAVA É O QUE ESTÁ NA TELA. A proposta viaja de volta no envio, em
 * vez de ser regerada no servidor: um modelo com temperatura devolve um quadro
 * diferente a cada chamada, e a pessoa aprovaria um texto e receberia outro.
 */
export function QuadroClient({
  atual,
  sugestao,
}: {
  atual: QuadroAtual | null;
  sugestao: Sugestao;
}) {
  const inicial: PropostaDeFunil =
    sugestao.origem === "ia" ? sugestao.proposta : sugestao.pacote.proposta;

  const [quadro, setQuadro] = useState<PropostaDeFunil>(inicial);
  const [origem, setOrigem] = useState<"ia" | "pacote">(sugestao.origem);
  const [trocando, setTrocando] = useState(false);
  const [pending, startTransition] = useTransition();

  // Coluna sem nome é DESCARTADA por `normalizarProposta` — e descartar em
  // silêncio o que a pessoa acabou de acrescentar seria a falha calada clássica:
  // ela clica em salvar, avança, e a coluna simplesmente não existe. Barrar aqui
  // é o preço de ter o botão "Adicionar coluna".
  const semNome = quadro.etapas.some((e) => !e.nome.trim());

  function renomear(i: number, nome: string) {
    setQuadro((q) => ({ ...q, etapas: q.etapas.map((e, j) => (j === i ? { ...e, nome } : e)) }));
  }

  function remover(i: number) {
    setQuadro((q) => ({ ...q, etapas: q.etapas.filter((_, j) => j !== i) }));
  }

  /**
   * A coluna nova entra ANTES da primeira coluna de desfecho, não no fim.
   *
   * Percorrendo o wizard como dono: a IA propôs sete colunas para uma clínica e
   * esqueceu "Confirmação da véspera" — que é etapa de trabalho, e no fim da
   * lista ficaria depois de "Marcou consulta" e "Sumiu ou desistiu". Um quadro
   * cuja última coluna vem depois do fechamento não é lido como funil.
   */
  function adicionar() {
    setQuadro((q) => {
      const corte = q.etapas.findIndex((e) => e.passo === "won" || e.passo === "lost");
      const onde = corte === -1 ? q.etapas.length : corte;
      const etapas = [...q.etapas];
      etapas.splice(onde, 0, { nome: "", passo: null });
      return { ...q, etapas };
    });
  }

  function usarPacote(id: string) {
    const p = PACOTES.find((x) => x.id === id);
    if (!p) return;
    setQuadro(p.proposta);
    // A origem acompanha: o resumo do onboarding registra de onde o quadro veio,
    // e manter "ia" depois de a pessoa escolher outro seria registrar mentira.
    setOrigem("pacote");
    setTrocando(false);
  }

  return (
    <div className="space-y-6">
      {/*
        De onde veio o quadro. Quando a IA não respondeu, a pessoa PRECISA saber:
        ela acabou de configurar uma chave, e o silêncio aqui é a primeira pista
        de que ela não está funcionando — descoberta que, calada, só chegaria com
        o primeiro cliente real.
      */}
      {sugestao.origem === "ia" ? (
        <p className="rounded-md border border-emerald-500/30 bg-emerald-500/5 p-3 text-sm">
          Votre assistant a construit ce tableau d’après ce que vous m’avez dit de votre activité. Ajustez ce que vous voulez.
        </p>
      ) : (
        <div className="space-y-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-sm">
          <p>
            Impossible de demander une suggestion à votre assistant pour le moment
            {sugestao.porque ? <> — {sugestao.porque}</> : null}. J’ai commencé avec un tableau prêt à l’emploi de <strong>{sugestao.pacote.comoSeApresenta}</strong>.
          </p>
          <p className="text-xs text-muted-foreground">
            Cela ne bloque rien : choisissez un autre modèle ci-dessous ou ajustez les colonnes à la main. Vous pourrez tout modifier plus tard, quand vous voudrez.
          </p>
        </div>
      )}

      <div className="space-y-3 rounded-lg border bg-background p-6">
        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="nome_do_quadro">
            Nom du tableau
          </label>
          <Input
            id="nome_do_quadro"
            value={quadro.nome}
            onChange={(e) => setQuadro((q) => ({ ...q, nome: e.target.value }))}
            maxLength={80}
          />
        </div>

        <ol className="space-y-2">
          {quadro.etapas.map((etapa, i) => {
            const explicacao = etapa.passo ? explicacaoDoPasso(etapa.passo) : null;
            return (
              <li key={i} className="flex items-start gap-2 rounded-md border p-3">
                <span
                  aria-hidden
                  className="mt-2 w-5 shrink-0 text-center text-xs text-muted-foreground"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <Input
                    aria-label={`Nom de la colonne ${i + 1}`}
                    value={etapa.nome}
                    onChange={(e) => renomear(i, e.target.value)}
                    maxLength={60}
                  />
                  <p className="text-xs text-muted-foreground">
                    {explicacao
                      ? `Il déplace le client ici quand ${explicacao}.`
                      : "Colonne que vous seuls déplacez — il n’y touche pas."}
                  </p>
                </div>
                {/*
                  As colunas de fechou/não fechou não são removíveis: sem elas o
                  banco recusa o quadro inteiro, e descobrir isso no clique de
                  salvar seria pior do que não oferecer o botão.
                */}
                {etapa.passo === "won" || etapa.passo === "lost" ? (
                  <span className="mt-2 shrink-0 text-xs text-muted-foreground">obligatoire</span>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="mt-1 shrink-0"
                    onClick={() => remover(i)}
                    disabled={quadro.etapas.length <= MIN_ETAPAS}
                  >
                    Supprimer
                  </Button>
                )}
              </li>
            );
          })}
        </ol>

        <div className="flex items-center justify-between pt-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={adicionar}
            disabled={quadro.etapas.length >= MAX_ETAPAS}
          >
            Ajouter une colonne
          </Button>
          {quadro.etapas.length >= MAX_ETAPAS ? (
            <span className="text-xs text-muted-foreground">
              {MAX_ETAPAS} colonnes au maximum — au-delà, cela ne tient pas sur l’écran du téléphone.
            </span>
          ) : null}
        </div>
      </div>

      {/* O que a instalação trouxe, para a troca não parecer mágica. */}
      {atual && atual.colunas.length > 0 ? (
        <details className="rounded-md border p-3 text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Ce qui est venu avec l’installation ({atual.nome})
          </summary>
          <p className="mt-2 text-xs text-muted-foreground">
            {atual.colunas.join(" → ")}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            C’est le tableau par défaut, conçu pour une boutique en ligne. Si vous continuez, il sera remplacé par celui du dessus.
          </p>
        </details>
      ) : null}

      <div className="space-y-3">
        {trocando ? (
          <div className="grid gap-2 sm:grid-cols-2">
            {PACOTES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => usarPacote(p.id)}
                className="rounded-md border p-3 text-left text-sm hover:bg-muted"
              >
                <span className="font-medium">{p.comoSeApresenta}</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {p.proposta.etapas.map((e) => e.nome).join(" → ")}
                </span>
              </button>
            ))}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setTrocando(true)}
            className="text-sm text-muted-foreground underline underline-offset-2"
          >
            Je préfère partir d’un modèle prêt à l’emploi
          </button>
        )}
      </div>

      {/* `flex-wrap`: com o aviso "Dê um nome..." mais os dois botões, a linha
          passava de 320-375px sem margem nenhuma — este é o rodapé de
          navegação do wizard, o botão que a pessoa mais precisa achar. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => startTransition(async () => void (await pularQuadro()))}
        >
          Passer pour l’instant
        </Button>

        <div className="flex flex-wrap items-center gap-3">
          {semNome ? (
            <span className="text-xs text-amber-700 dark:text-amber-500">
              Donnez un nom à la colonne vide.
            </span>
          ) : null}
        <Button
          type="button"
          disabled={pending || semNome}
          onClick={() =>
            startTransition(async () => {
              const fd = new FormData();
              fd.set("quadro", JSON.stringify(quadro));
              fd.set("origem", origem);
              const res = await aplicarQuadro(fd);
              // Sucesso redireciona no servidor; só o desfecho ruim volta.
              if (res && !res.ok) toast.error(res.erro);
            })
          }
        >
          {pending ? "Enregistrement…" : "Utiliser ce tableau"}
        </Button>
        </div>
      </div>
    </div>
  );
}
