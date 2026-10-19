"use client";
import * as React from "react";
import Link from "next/link";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { EvolutionGaps } from "@/components/ai/EvolutionGaps";
import { EvolutionTimeline } from "@/components/ai/EvolutionTimeline";
import { useEvolution } from "@/hooks/ai/useEvolution";
import type { EvolutionPayload } from "@/lib/ai/evolution/aggregate";

/**
 * O painel responde UMA pergunta do dono do negócio: "o que meu agente aprendeu
 * este mês, e o que melhorou?". Por isso a tela é uma narrativa em quatro
 * blocos, nesta ordem — aprendeu → fez → mudou o resultado → o que ainda trava —
 * e não uma grade de indicadores.
 *
 * Regra de escrita: TODO número leva uma frase dizendo o que ele significa.
 * Quem construiu o sistema entende "handoff rate"; o dono da clínica entende
 * "casos que precisaram de uma pessoa". A tela é escrita para o segundo.
 */

// DÓLAR: `outcome.cost_cents` vem de `llm_calls`, que `pricing.ts` grava em centavo de USD.
const usd = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "USD" });

/**
 * O bloco se chama "o que MUDOU", mas o payload traz um período só — não há
 * comparação embutida. Em vez de prometer uma variação que a tela não calcula,
 * a descrição diz como o dono do negócio consegue a comparação com as próprias
 * mãos. Prometer a mais é o defeito que esta fase passou o dia consertando.
 */
const DESCRICAO_RESULTADO =
  "Ce qui s’est passé dans vos affaires sur cette période. Pour savoir si c’est mieux, changez les dates ci-dessus et comparez avec le mois précédent.";

/**
 * Os três primeiros números deste bloco vêm de `lead_state_transitions`, e o
 * ÚNICO escritor dessa tabela no repo é a máquina de estados do agente
 * (`lib/agent-engine/agent/lead-state.ts`). Atendente arrastando cartão no
 * Kanban não gera linha nenhuma ali. Sem esta ressalva, um mês em que a equipe
 * fechou doze negócios na mão apareceria como "0" num bloco chamado "o que
 * mudou no resultado" — e o dono do negócio concluiria que o mês foi zero.
 *
 * O vocabulário também é deliberado: o bloco 4 usa "funil"/"etapa" para
 * `crm_pipelines`/`crm_stages` e "passo do atendimento" para o estado do agente.
 * Chamar isto de "avanço no funil" faria a mesma tela dizer que os cartões
 * andaram e que os cartões não andam.
 */
const SIGNIFICA_GANHOS =
  "Clients que l’agent a marqués comme conclus. Une affaire que votre équipe a conclue à la main, en déplaçant la carte dans le tableau, n’est pas comptée ici.";
const SIGNIFICA_PERDIDOS =
  "Clients que l’agent a marqués comme perdus — un contrepoint nécessaire, car des gains sans les pertes à côté sont trompeurs. Ce que votre équipe a marqué à la main n’est pas compté non plus.";
/**
 * "Avanço" prometeria DIREÇÃO, e o dado não tem: `stage_transitions` é o total
 * de transições, e o grafo do funil do agente permite `qualquer → lost`. Num mês
 * de 1 ganho e 5 perdas, 6 das transições seriam justamente os desfechos — e 5
 * delas, perdas contadas como avanço. A redação neutra é a única fiel.
 */
const SIGNIFICA_MUDANCAS =
  "Nombre de fois où l’agent a enregistré qu’un client a changé d’étape dans le suivi — le signe que la conversation a avancé, et pas seulement qu’elle a eu lieu. Inclut les passages à conclu et à perdu, donc ne le lisez pas comme du pur progrès. Une carte déplacée à la main dans le tableau n’est pas comptée ici.";

/**
 * O numerador soma DUAS fontes com garantias diferentes: o runtime atual
 * deduplica por episódio aberto; o antigo só ignora repetição dentro de 5s com a
 * mesma razão. "Conta uma vez só" seria verdade para metade do número, e "modo
 * antigo do sistema" seria jargão que o dono da clínica não sabe se o afeta — a
 * frase entrega a CONSEQUÊNCIA (leia como estimativa) e para por aí.
 */
const SIGNIFICA_AJUDA =
  "Conversations que l’agent a transférées à un humain, pour 100 messages reçus. À lire comme une estimation : en général un même cas ne compte qu’une fois, même si le client demande de l’aide plusieurs fois, mais dans une partie des échanges il peut compter plus d’une fois.";

/**
 * Uma ajuda em 5.000 mensagens é 0,02 a cada 100 — com uma casa decimal isso
 * vira "0", que lê como "nunca precisou de gente". É o mesmo zero lisonjeiro
 * dos outros números do bloco, só que produzido pelo formatador. Exportada por
 * ser o único jeito de alcançar o ramo `< 0,1`: a org de prova não o produz.
 */
export function taxaDeAjuda(rate: number): string {
  if (rate <= 0) return "0";
  const porCem = rate * 100;
  if (porCem < 0.1) return "moins de 0,1 pour 100";
  return `${porCem.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} pour 100`;
}

/**
 * Sem atendimento nenhum no período, "0 casos precisaram de uma pessoa" LÊ como
 * "sua IA deu conta de tudo" — a mentira mais lisonjeira que este bloco poderia
 * contar, e a mais fácil de acreditar. O zero continua lá (é o valor certo); o
 * que muda é a frase que diz do que ele é feito.
 */
const DESCRICAO_RESULTADO_SEM_ATIVIDADE =
  "Il n’y a eu aucun échange sur cette période, donc les zéros ci-dessous signifient « rien ne s’est passé », et non « ça s’est mal passé ». Changez les dates ci-dessus pour une période avec de l’activité.";

/**
 * A escolha da descrição olha SÓ `messages_received`, e recebe o `outcome`
 * inteiro de propósito: é o que torna sabotável — se alguém voltar a somar
 * `cost_cents` aqui, o teste fica vermelho.
 *
 * O guarda anterior usava custo como SUBSTITUTO de "houve atendimento", e
 * substituto não é evidência: `llm_calls` inclui `connection_test` (script de
 * ops) e as chamadas do flywheel, cujo cron julga turnos PASSADOS e carimba o
 * custo no dia em que rodou. Num período sem atendimento nenhum, o custo do cron
 * apagaria justamente a ressalva que existe para impedir a leitura lisonjeira.
 * O fato exato já era calculado na rota; só faltava chegar ao payload.
 */
export function descricaoResultado(outcome: EvolutionPayload["outcome"]): string {
  return outcome.messages_received > 0 ? DESCRICAO_RESULTADO : DESCRICAO_RESULTADO_SEM_ATIVIDADE;
}

function num(n: number): string {
  return n.toLocaleString("fr-FR");
}

function diaCurto(s: string): string {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
}

function Bloco({
  titulo,
  descricao,
  children,
  testId,
}: {
  titulo: string;
  descricao: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <section className="flex flex-col gap-3" data-testid={testId}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{titulo}</h2>
        <p className="text-sm text-text-muted">{descricao}</p>
      </div>
      {children}
    </section>
  );
}

function StatCard({
  rotulo,
  valor,
  significa,
}: {
  rotulo: string;
  valor: string;
  /** O que o número quer dizer. Nunca opcional: número sozinho não informa. */
  significa: string;
}) {
  return (
    <Card className="flex flex-col p-4">
      <p className="text-xs text-text-muted">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight">{valor}</p>
      <p className="mt-2 text-xs leading-relaxed text-text-muted">{significa}</p>
    </Card>
  );
}

/**
 * Estado vazio que ENSINA. Um traço mudo aqui seria falha de produto: num tenant
 * recém-instalado o vazio é a REGRA, não a exceção, e é a primeira coisa que o
 * dono do negócio vê. Então o vazio diz o que é aquilo, por que está vazio, e
 * qual é a tela onde ele deixa de estar.
 */
function Vazio({
  texto,
  acoes,
}: {
  texto: string;
  acoes?: Array<{ href: string; label: string }>;
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-1">
      <p className="text-sm leading-relaxed text-text-muted">{texto}</p>
      {acoes && acoes.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {acoes.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="inline-block py-2 text-sm font-medium text-accent underline underline-offset-4"
            >
              {a.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function GraficoDiario({
  titulo,
  significa,
  dados,
  cor,
  vazio,
}: {
  titulo: string;
  significa: string;
  dados: Array<{ day: string; value: number }>;
  cor: string;
  vazio: React.ReactNode;
}) {
  const temDado = dados.some((p) => p.value > 0);
  const total = dados.reduce((acc, p) => acc + p.value, 0);
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">{significa}</p>
      {!temDado ? (
        <div className="mt-4">{vazio}</div>
      ) : (
        <>
          <p className="mt-3 text-2xl font-semibold tracking-tight">
            {num(total)}{" "}
            <span className="text-xs font-normal text-text-muted">sur la période</span>
          </p>
          <div className="mt-2">
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={dados} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" />
                <XAxis
                  dataKey="day"
                  tickFormatter={diaCurto}
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  width={36}
                />
                <Tooltip
                  formatter={(v) => [num(Number(v)), "no dia"]}
                  labelFormatter={(l) => diaCurto(String(l))}
                  contentStyle={{
                    borderRadius: "8px",
                    fontSize: "12px",
                    border: "1px solid hsl(var(--border))",
                    background: "hsl(var(--popover))",
                  }}
                />
                <Line type="monotone" dataKey="value" stroke={cor} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </>
      )}
    </Card>
  );
}

function Ranking({
  titulo,
  significa,
  contagem,
  vazio,
}: {
  titulo: string;
  significa: string;
  contagem: Record<string, number>;
  vazio: React.ReactNode;
}) {
  const linhas = Object.entries(contagem)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  const maior = linhas[0]?.[1] ?? 0;
  return (
    <Card className="p-4">
      <h3 className="text-sm font-medium">{titulo}</h3>
      <p className="mt-1 text-xs leading-relaxed text-text-muted">{significa}</p>
      {linhas.length === 0 ? (
        <div className="mt-4">{vazio}</div>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {linhas.map(([nome, qtd]) => (
            <li key={nome} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3">
                <span className="truncate text-sm" title={nome}>
                  {nome}
                </span>
                <span className="shrink-0 text-sm tabular-nums text-text-muted">
                  {num(qtd)}
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-surface-elevated">
                <div
                  className="h-1.5 rounded-full bg-accent"
                  style={{ width: `${maior > 0 ? Math.max(4, (qtd / maior) * 100) : 0}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Carregando() {
  return (
    <div className="flex flex-col gap-4" data-testid="evolution-carregando">
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="mt-2 h-8 w-16" />
            <Skeleton className="mt-3 h-3 w-full" />
          </Card>
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function EvolutionClient({ defaultRange }: { defaultRange: { from: string; to: string } }) {
  const [from, setFrom] = React.useState(defaultRange.from);
  const [to, setTo] = React.useState(defaultRange.to);
  const q = useEvolution({ from, to });

  return (
    <div className="flex flex-col gap-8">
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-end sm:gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium">Période analysée</p>
          <p className="text-xs text-text-muted">
            Tous les chiffres de cette page concernent uniquement cet intervalle. Changez les dates pour comparer un mois à un autre.
          </p>
        </div>
        <div className="flex gap-3">
          <div className="space-y-1">
            <Label htmlFor="evolution-de" className="text-xs text-text-muted">
              De
            </Label>
            <Input
              id="evolution-de"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="evolution-ate" className="text-xs text-text-muted">
              Jusqu’au
            </Label>
            <Input
              id="evolution-ate"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {q.error ? (
        <Card className="p-6 text-sm" data-testid="evolution-erro">
          Impossible de charger les chiffres pour le moment. Rechargez la page dans quelques instants — si cela continue, prévenez la personne qui gère votre installation.
        </Card>
      ) : !q.data ? (
        <Carregando />
      ) : (
        <Conteudo payload={q.data} />
      )}
    </div>
  );
}

function Conteudo({ payload }: { payload: NonNullable<ReturnType<typeof useEvolution>["data"]> }) {
  const { learned, activity, outcome, gaps } = payload;

  const soma = (s: Array<{ value: number }>) => s.reduce((a, p) => a + p.value, 0);
  // Contagens SEPARADAS, não um booleano só: cada frase de "nada travando" é uma
  // afirmação sobre uma fonte diferente, e um guarda único as autorizaria todas
  // com a evidência de uma. Ver o comentário em EvolutionGaps.
  const buscas = soma(activity.series.knowledge_searches);
  const decisoes = soma(activity.series.router_decisions);

  return (
    <>
      <Bloco
        testId="bloco-aprendeu"
        titulo="Ce que votre agent a appris"
        descricao="Tout ce qu’il a assimilé sur cette période, et d’où cela vient."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard
            rotulo="Règles que vous avez enseignées"
            valor={num(learned.memory_entries)}
            significa="Instructions publiées dans la Mémoire de l’IA. Elles s’appliquent à toutes les conversations, de tous les agents."
          />
          <StatCard
            rotulo="Améliorations que vous avez approuvées"
            valor={num(learned.proposals_applied)}
            significa="Suggestions que le système a tirées de ses propres échanges et que vous avez relues et acceptées."
          />
          <StatCard
            rotulo="Habilidades instaladas"
            valor={num(learned.skills_installed)}
            significa="Compétences que l’agent charge quand la conversation le demande — par exemple, confirmer un rendez-vous."
          />
        </div>
        <Card className="p-4">
          <h3 className="text-sm font-medium">Chronologie de l’apprentissage</h3>
          <p className="mt-1 text-xs text-text-muted">
            Chaque ligne est une nouvelle chose que l’agent a apprise, dans l’ordre où c’est arrivé.
          </p>
          <div className="mt-3">
            {learned.timeline.length === 0 ? (
              // Um só texto, e não dois: a linha do tempo é montada das MESMAS três
              // fontes dos três contadores acima, então `timeline.length === 0` é
              // equivalente a "os três contadores são zero". O ramo "aprendeu algo
              // mas não tem data" era inalcançável.
              <Vazio
                texto="Votre agent n’a encore rien appris sur cette période. Il apprend de trois façons : vous publiez une règle dans la Mémoire de l’IA, vous approuvez une suggestion d’amélioration dans l’onglet Propositions de l’agent, ou vous installez une compétence dans Compétences de l’IA."
                acoes={[
                  { href: "/app/ai/memory", label: "Publier une règle" },
                  { href: "/app/ai/agents", label: "Voir les suggestions d’amélioration" },
                  { href: "/app/ai/skills", label: "Installer une compétence" },
                ]}
              />
            ) : (
              <EvolutionTimeline items={learned.timeline} />
            )}
          </div>
        </Card>
      </Bloco>

      <Bloco
        testId="bloco-fez"
        titulo="Ce qu’il a fait"
        descricao="Le travail au quotidien : combien de fois il a utilisé chaque ressource que vous lui avez donnée."
      >
        <div className="grid gap-3 lg:grid-cols-3">
          <GraficoDiario
            titulo="Habilidades usadas"
            significa="Nombre de fois où l’agent a fait appel à une compétence spécialisée pour mener la conversation."
            dados={activity.series.skill_activations}
            cor="hsl(262 83% 58%)"
            vazio={
              <Vazio
                texto="Aucune compétence n’a été utilisée. Soit l’agent n’en a encore aucune installée, soit les conversations de la période n’en ont demandé aucune."
                acoes={[{ href: "/app/ai/skills", label: "Voir les compétences disponibles" }]}
              />
            }
          />
          <GraficoDiario
            titulo="Conversations orientées"
            significa="Nombre de fois où le système a compris ce que voulait le client et a choisi quel service devait répondre."
            dados={activity.series.router_decisions}
            cor="hsl(199 89% 48%)"
            vazio={
              <Vazio
                texto="Aucune conversation n’a été orientée. Cela n’arrive que sur les numéros qui ont un routeur configuré — sans lui, tout va au service par défaut."
                acoes={[{ href: "/app/ai/routers", label: "Configurer un routeur" }]}
              />
            }
          />
          <GraficoDiario
            titulo="Consultations de vos documents"
            significa="Nombre de fois où l’agent est allé chercher la réponse dans ce que vous avez écrit, au lieu d’improviser."
            dados={activity.series.knowledge_searches}
            cor="hsl(142 76% 36%)"
            vazio={
              <Vazio
                texto="L’agent n’a pas consulté vos documents. Soit rien n’est publié dans la base de connaissances, soit les conversations n’en ont pas eu besoin."
                acoes={[{ href: "/app/ai/knowledge/sources", label: "Publier un document" }]}
              />
            }
          />
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <Ranking
            titulo="Compétences les plus utilisées"
            significa="Là où l’agent a eu le plus besoin de connaissances spécialisées."
            contagem={activity.by_skill}
            vazio={
              <Vazio
                texto="Aucune compétence n’a été utilisée sur cette période, il n’y a donc rien à classer."
                acoes={[{ href: "/app/ai/skills", label: "Voir les compétences disponibles" }]}
              />
            }
          />
          <Ranking
            titulo="Sujets les plus demandés"
            significa="Ce que les clients ont le plus demandé, selon ce que le routeur a compris de chaque conversation."
            contagem={activity.by_intent}
            vazio={
              <Vazio
                texto="Aucune conversation n’a été classée par sujet. Les sujets sont ceux que vous enregistrez dans le routeur de votre numéro."
                acoes={[{ href: "/app/ai/routers", label: "Ajouter des sujets" }]}
              />
            }
          />
        </div>
      </Bloco>

      <Bloco
        testId="bloco-resultado"
        titulo="Ce qui a changé dans les résultats"
        descricao={descricaoResultado(outcome)}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            rotulo="Affaires conclues par l’agent"
            valor={num(outcome.won)}
            significa={SIGNIFICA_GANHOS}
          />
          <StatCard
            rotulo="Affaires perdues par l’agent"
            valor={num(outcome.lost)}
            significa={SIGNIFICA_PERDIDOS}
          />
          <StatCard
            rotulo="Changements d’étape dans le suivi"
            valor={num(outcome.stage_transitions)}
            significa={SIGNIFICA_MUDANCAS}
          />
          <StatCard
            rotulo="Cas qui ont nécessité une personne"
            valor={taxaDeAjuda(outcome.handoff_rate)}
            significa={SIGNIFICA_AJUDA}
          />
          <StatCard
            rotulo="Coût de l’IA sur la période"
            valor={usd.format(outcome.cost_cents / 100)}
            significa="Ce que vous avez payé aux fournisseurs d’IA pour que tout cela se produise."
          />
        </div>
      </Bloco>

      <Bloco
        testId="bloco-travando"
        titulo="Ce qui bloque"
        descricao="Chaque ligne ici est un élément qui limite votre agent, et ce qu’il faut faire — parfois par vous-même, parfois par la personne qui gère votre installation."
      >
        <EvolutionGaps gaps={gaps} buscas={buscas} decisoes={decisoes} />
      </Bloco>
    </>
  );
}
