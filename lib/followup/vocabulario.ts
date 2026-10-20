/**
 * O follow-up falando português — tradução de TODO valor de wire que o
 * construtor de fluxo mostra a quem não programa.
 *
 * Módulo puro: sem React, sem import de UI. Quem renderiza escolhe o
 * componente; aqui mora só a palavra.
 *
 * ## Por que o operador não tem tradução própria
 *
 * "é igual a" solto não ajuda ninguém, e para `tag` ele MENTE: o motor guarda
 * etiqueta como lista (`LeadFacts.tags`) e trata `eq`/`contains` como "está
 * entre as tags" (`node-handlers.ts` → `evaluateCheck`). Um seletor que
 * mostrasse "é igual a" prometeria comparação de igualdade onde o motor faz
 * pertinência. Por isso a unidade de tradução aqui é o PAR (campo, operador) —
 * `comparador()` —, nunca dois dicionários independentes.
 *
 * ## O que este módulo NÃO possui (fonte da verdade declarada)
 *
 * - Rótulo de aresta (`Sempre` / `Sim` / `Não` / `Sem resposta`) e nome de
 *   classe da IA: `edge-condition-options.ts`. Classes são vocabulário ABERTO
 *   (o usuário escreve as suas), então não há mapa fechado a manter aqui.
 * - Rótulo e ícone de TIPO de nó (`Gatilho`, `Aguardar`, …): `nodeVisuals.ts`.
 *
 * O que este módulo possui são os VALORES de configuração — o que está dentro
 * de cada nó, mais os estados que o acompanhamento assume depois de rodar.
 *
 * ## O que MUDA na tela quando a Wave 2 aplicar isto
 *
 * A maior parte destes rótulos ainda não está em uso — só o nó final consome o
 * dicionário hoje, e com as mesmas palavras de antes. Quando os outros
 * formulários passarem a ler daqui, estes textos mudam de propósito:
 * `E (todas)` → "Todas as condições"; `Adaptativo (min–max)` → "A IA escolhe a
 * hora"; `Template fixo` → "Modelo de mensagem pronto"; `Pausado (handoff)` →
 * "Pausado — um humano assumiu"; `Morto` → "Parou por falha". Os que estão sob
 * contrato de e2e (Convertido, Esgotado, Manual, Silêncio) ficam ao pé da letra.
 *
 * Cobertura vigiada por `vocabulario.test.ts`, que deriva a lista de valores do
 * próprio schema (Zod) e dos tipos de `node-handlers.ts` — nenhuma cópia à mão.
 */
import type { z } from "zod";

import type { TriggerConfig } from "./api-schemas";
import { conditionLabel } from "./edge-condition-options";
import {
  CONDITION_FALSE_BRANCH_ID,
  CONDITION_TRUE_BRANCH_ID,
  FALLBACK_BRANCH_ID,
  NO_REPLY_BRANCH_ID,
  type RESERVED_BRANCH_IDS,
  type actionConfigSchema,
  type aiClassifyConfigSchema,
  type conditionConfigSchema,
  type endConfigSchema,
  type waitConfigSchema,
} from "./graph-schema";
import type { EnrollmentOutcome, EnrollmentStatus } from "./node-handlers";

type ConditionConfig = z.infer<typeof conditionConfigSchema>;
type Check = ConditionConfig["checks"][number];

export type CampoDaCondicao = Check["field"];
export type OperadorDaCondicao = Check["op"];
export type Combinador = ConditionConfig["combinator"];
export type ModoDeRamificacao = NonNullable<ConditionConfig["branching"]>;
export type RamoReservado = (typeof RESERVED_BRANCH_IDS)[number];
export type AlvoDaClassificacao = z.infer<typeof aiClassifyConfigSchema>["target"];
export type ResultadoDoFim = z.infer<typeof endConfigSchema>["outcome"];
export type ModoDeEspera = z.infer<typeof waitConfigSchema>["mode"];
export type ModoDaAcao = z.infer<typeof actionConfigSchema>["mode"];
export type TipoDeGatilho = TriggerConfig["kind"];

/** `{ valor, rotulo }` na ordem de declaração do mapa — pronto para um `<Select>`. */
export function opcoes<K extends string>(mapa: Record<K, string>): ReadonlyArray<{ valor: K; rotulo: string }> {
  return (Object.keys(mapa) as K[]).map((valor) => ({ valor, rotulo: mapa[valor] }));
}

// ─── condição: campo ─────────────────────────────────────────────────────

/**
 * Que tipo de valor o campo compara — o que a tela precisa saber para escolher
 * o controle certo. `etapa` é o caso que hoje sangra: o motor compara contra o
 * `stage_id` (um UUID, veja `engine.ts` → `loadLeadFacts`), então um campo de
 * texto livre pede ao dono da clínica que digite um identificador interno.
 */
export type TipoDeValor = "etapa" | "etiqueta" | "numero" | "texto";

export interface CampoDeCondicao {
  rotulo: string;
  tipoDeValor: TipoDeValor;
}

export const CAMPOS_DA_CONDICAO: Record<CampoDaCondicao, CampoDeCondicao> = {
  lead_stage: { rotulo: "Colonne du tableau", tipoDeValor: "etapa" },
  tag: { rotulo: "Étiquette du contact", tipoDeValor: "etiqueta" },
  steps_taken: { rotulo: "Étapes déjà faites dans la séquence", tipoDeValor: "numero" },
  last_outcome: { rotulo: "Issue de l’étape précédente", tipoDeValor: "texto" },
};

// ─── condição: o par (campo, operador) ───────────────────────────────────

export interface Comparador {
  /** Item do seletor de operador — já escrito para ser lido junto com o campo. */
  rotulo: string;
  /** A checagem inteira em uma frase, com o valor no lugar. */
  frase: (valor: string | number) => string;
  /**
   * Entra no seletor deste campo? `false` quando o motor entende o par mas
   * oferecê-lo confunde: ou repete um operador que já está na lista, ou nunca
   * dá certo. Um par fora do seletor continua descritível — fluxo salvo antes
   * desta regra precisa ser lido, não escondido.
   */
  oferecido: boolean;
  /** Presente quando o motor NUNCA satisfaz o par: a tela deve avisar em vez de fingir. */
  aviso?: string;
}

const AVISO_SO_NUMERO =
  "Comparer plus grand/plus petit ne marche qu’avec un nombre. En l’état, cette condition n’est jamais vraie.";
const AVISO_SO_TEXTO = "« Contient » ne marche qu’avec du texte. Avec un nombre, cette condition n’est jamais vraie.";

const aspas = (valor: string | number): string => `« ${valor} »`;

function passos(valor: string | number): string {
  const n = Number(valor);
  return Number.isFinite(n) && Math.abs(n) === 1 ? `${valor} étape` : `${valor} étapes`;
}

/**
 * A frase de cada par. Ordem das chaves = ordem no seletor (o mais usado
 * primeiro), então mexer na ordem aqui mexe na tela.
 */
const COMPARADORES: Record<CampoDaCondicao, Record<OperadorDaCondicao, Comparador>> = {
  lead_stage: {
    eq: {
      rotulo: "est dans la colonne",
      frase: (v) => `Le client est dans la colonne ${aspas(v)}`,
      oferecido: true,
    },
    neq: {
      rotulo: "n’est pas dans la colonne",
      frase: (v) => `Le client n’est pas dans la colonne ${aspas(v)}`,
      oferecido: true,
    },
    contains: {
      rotulo: "contient",
      frase: (v) => `L’identifiant de la colonne du client contient ${aspas(v)}`,
      oferecido: false,
      aviso:
        "La colonne est comparée par son identifiant interne, pas par son nom — choisissez la colonne au lieu d’en taper un morceau.",
    },
    gte: {
      rotulo: "est au moins",
      frase: (v) => `La colonne du client est au moins ${aspas(v)}`,
      oferecido: false,
      aviso: AVISO_SO_NUMERO,
    },
    lte: {
      rotulo: "est au plus",
      frase: (v) => `La colonne du client est au plus ${aspas(v)}`,
      oferecido: false,
      aviso: AVISO_SO_NUMERO,
    },
  },
  tag: {
    // O par que dá nome à regra deste módulo: no motor, `tag` é lista.
    eq: {
      rotulo: "a l’étiquette",
      frase: (v) => `Le contact a l’étiquette ${aspas(v)}`,
      oferecido: true,
    },
    neq: {
      rotulo: "n’a pas l’étiquette",
      frase: (v) => `Le contact n’a pas l’étiquette ${aspas(v)}`,
      oferecido: true,
    },
    contains: {
      // Mesmo resultado que `eq` (o motor testa pertinência nos dois): descreve
      // o que está salvo, mas não repete a opção no seletor.
      rotulo: "a l’étiquette",
      frase: (v) => `Le contact a l’étiquette ${aspas(v)}`,
      oferecido: false,
    },
    gte: {
      rotulo: "est au moins",
      frase: (v) => `L’étiquette du contact est au moins ${aspas(v)}`,
      oferecido: false,
      aviso: AVISO_SO_NUMERO,
    },
    lte: {
      rotulo: "est au plus",
      frase: (v) => `L’étiquette du contact est au plus ${aspas(v)}`,
      oferecido: false,
      aviso: AVISO_SO_NUMERO,
    },
  },
  steps_taken: {
    gte: {
      rotulo: "est au moins",
      frase: (v) => `La séquence a déjà fait au moins ${passos(v)}`,
      oferecido: true,
    },
    lte: {
      rotulo: "est au plus",
      frase: (v) => `La séquence a déjà fait au plus ${passos(v)}`,
      oferecido: true,
    },
    eq: {
      rotulo: "est exactement",
      frase: (v) => `La séquence a déjà fait exactement ${passos(v)}`,
      oferecido: true,
    },
    neq: {
      rotulo: "n’est pas",
      frase: (v) => `La séquence n’a pas fait exactement ${passos(v)}`,
      oferecido: true,
    },
    contains: {
      rotulo: "contient",
      frase: (v) => `Le nombre d’étapes contient ${aspas(v)}`,
      oferecido: false,
      aviso: AVISO_SO_TEXTO,
    },
  },
  last_outcome: {
    eq: {
      rotulo: "a été",
      frase: (v) => `L’issue de l’étape précédente a été ${aspas(v)}`,
      oferecido: true,
    },
    neq: {
      rotulo: "n’a pas été",
      frase: (v) => `L’issue de l’étape précédente n’a pas été ${aspas(v)}`,
      oferecido: true,
    },
    contains: {
      rotulo: "contient",
      frase: (v) => `L’issue de l’étape précédente contient ${aspas(v)}`,
      oferecido: true,
    },
    gte: {
      rotulo: "est au moins",
      frase: (v) => `L’issue de l’étape précédente est au moins ${aspas(v)}`,
      oferecido: false,
      aviso: AVISO_SO_NUMERO,
    },
    lte: {
      rotulo: "est au plus",
      frase: (v) => `L’issue de l’étape précédente est au plus ${aspas(v)}`,
      oferecido: false,
      aviso: AVISO_SO_NUMERO,
    },
  },
};

/** Como se lê o par (campo, operador). Total: todo par salvo tem descrição, mesmo o que não se oferece mais. */
export function comparador(campo: CampoDaCondicao, op: OperadorDaCondicao): Comparador {
  return COMPARADORES[campo][op];
}

/** Só os operadores que fazem sentido para este campo — a lista do `<Select>`. */
export function comparadoresDoCampo(
  campo: CampoDaCondicao,
): ReadonlyArray<{ op: OperadorDaCondicao; rotulo: string }> {
  return (Object.keys(COMPARADORES[campo]) as OperadorDaCondicao[])
    .filter((op) => COMPARADORES[campo][op].oferecido)
    .map((op) => ({ op, rotulo: COMPARADORES[campo][op].rotulo }));
}

/** A checagem inteira em uma frase — para resumo do nó, `aria-label` e revisão antes de publicar. */
export function fraseDaCondicao(
  campo: CampoDaCondicao,
  op: OperadorDaCondicao,
  valor: string | number,
): string {
  return comparador(campo, op).frase(valor);
}

export const COMBINADORES: Record<Combinador, string> = {
  and: "Toutes les conditions",
  or: "Au moins une des conditions",
};

/**
 * Grafo v2: como o nó de condição abre as saídas dele. `combined` avalia tudo
 * junto e sai por Sim/Não; `per_check` dá uma saída por regra, endereçada pelo
 * id estável do ramo.
 */
export const MODOS_DE_RAMIFICACAO: Record<ModoDeRamificacao, string> = {
  combined: "Une seule sortie pour toutes les règles",
  per_check: "Une sortie par règle",
};

/**
 * Os ramos que o contrato reserva. Não redeclaramos o texto: ele vem de
 * `conditionLabel`, que já é a fonte da verdade do rótulo que a aresta mostra
 * no canvas — assim o painel e o desenho não podem divergir.
 */
/**
 * Os mesmos ramos, em frase — o registro do DOSSIÊ, não o da etiqueta.
 *
 * Dois registros de propósito. "Sem resposta" cabe num chip ao lado de uma
 * aresta, onde o contexto está no desenho; "quand personne ne répond" cabe numa
 * linha de histórico, onde a frase precisa se sustentar sozinha. Achatar os
 * dois num só empobrece as duas telas.
 *
 * As três primeiras frases são as que `eventos-legiveis.ts` já escrevia à mão
 * para o dialeto v1. Centralizá-las aqui é o que impede o risco real do v2: o
 * mesmo fluxo lido de dois jeitos conforme o ramo chegue como `class_match`
 * (v1) ou como `branch_id` (v2). Um dicionário, duas portas, um texto.
 */
export const RAMOS_RESERVADOS_EM_FRASE: Record<RamoReservado, string> = {
  [FALLBACK_BRANCH_ID]: "chemin normal",
  [NO_REPLY_BRANCH_ID]: "quand personne ne répond",
  [CONDITION_TRUE_BRANCH_ID]: "quand la condition est vraie",
  [CONDITION_FALSE_BRANCH_ID]: "quand la condition est fausse",
};

/**
 * A frase de um ramo qualquer, reservado ou declarado pelo usuário.
 *
 * `rotuloDeclarado` vem do NÓ (`branches[].label` no classificar,
 * `checks[].label` no condicional), porque no contrato v2 é lá que a identidade
 * do ramo mora. Sem ele, o melhor honesto é dizer que é um caminho sem nome —
 * nunca ecoar o `branch_id`, que é identificador interno.
 */
export function fraseDoRamo(branchId: string): string | null {
  return RAMOS_RESERVADOS_EM_FRASE[branchId as RamoReservado] ?? null;
}

/**
 * Uma frase deste módulo encaixada depois de "quando".
 *
 * As frases nascem como oração completa e maiúscula ("O contato tem a etiqueta
 * …") porque também são lidas sozinhas, no resumo do nó. Emendar a maiúscula no
 * meio de outra frase é o tipo de detalhe que ninguém revisa e todo mundo lê.
 */
function encaixa(frase: string): string {
  return frase.charAt(0).toLocaleLowerCase("fr-FR") + frase.slice(1);
}

/**
 * Ramo de uma CLASSE da IA. Nomeia a IA como quem julgou, de propósito: quem lê
 * o histórico precisa saber que um modelo decidiu, não uma regra fixa.
 */
export function fraseDaClasse(nomeDaClasse: string): string {
  return `quand l’IA classe la réponse comme « ${nomeDaClasse} »`;
}

/** Ramo de uma REGRA que o usuário batizou. Regra do negócio não é resposta de ninguém. */
export function fraseDaRegraNomeada(rotulo: string): string {
  return `quand la règle « ${rotulo} » s’applique`;
}

/**
 * Ramo de uma regra SEM nome: em vez do id, a própria condição por extenso.
 * `regra-2` na tela do operador é o defeito que este módulo existe para impedir.
 */
export function fraseDaRegraSemNome(
  campo: CampoDaCondicao,
  op: OperadorDaCondicao,
  valor: string | number,
): string {
  return `quand ${encaixa(fraseDaCondicao(campo, op, valor))}`;
}

export const RAMOS_RESERVADOS: Record<RamoReservado, string> = {
  [FALLBACK_BRANCH_ID]: conditionLabel({ type: "always" }),
  [NO_REPLY_BRANCH_ID]: conditionLabel({ type: "class_match", value: NO_REPLY_BRANCH_ID }),
  [CONDITION_TRUE_BRANCH_ID]: conditionLabel({ type: "cond_result", value: true }),
  [CONDITION_FALSE_BRANCH_ID]: conditionLabel({ type: "cond_result", value: false }),
};

// ─── classificação pela IA ───────────────────────────────────────────────

const MINIMO_MINUTOS_DE_ESPERA = 15;

/**
 * O antigo "Grace (minutos, mín. 15)" — que não é palavra nenhuma para o dono
 * de uma loja. O rótulo agora diz o que acontece, e a ajuda nomeia o caminho
 * exato que o fluxo pega, com o MESMO texto que a aresta mostra no canvas
 * (`edge-condition-options.ts`) — se aquele rótulo mudar, esta frase acompanha.
 *
 * Semântica real (`engine.ts` → `applyResult`, caso `enqueue_turn`): ao entrar
 * no nó, o acompanhamento vai para `waiting_reply` e volta a ser avaliado em
 * `grace_timeout_ms`. Vencido o prazo sem classificação concluída, o nó segue
 * pela aresta `no_reply` sem chamar o modelo.
 */
export const ESPERA_PELA_RESPOSTA = {
  rotulo: "Attendre la réponse pendant (minutes)",
  ajuda:
    `Si le contact ne répond pas dans ce délai, la séquence continue toute seule par le chemin ` +
    `« ${conditionLabel({ type: "class_match", value: "no_reply" })} ». ` +
    `Minimum ${MINIMO_MINUTOS_DE_ESPERA} minutes.`,
  minimoMinutos: MINIMO_MINUTOS_DE_ESPERA,
} as const;

export const ALVOS_DA_CLASSIFICACAO: Record<AlvoDaClassificacao, string> = {
  last_reply: "Dernière réponse",
  summary: "Résumé",
};

// ─── espera e ação ───────────────────────────────────────────────────────

export const MODOS_DE_ESPERA: Record<ModoDeEspera, string> = {
  fixed: "Délai fixe",
  smart: "L’IA choisit le moment",
};

export const MODOS_DA_ACAO: Record<ModoDaAcao, string> = {
  ai_message: "Message écrit par l’IA",
  template: "Modèle de message tout prêt",
};

// ─── nó final ────────────────────────────────────────────────────────────

/**
 * Rótulo VISÍVEL e sob contrato: `tests/e2e/followup-journey.spec.ts` escolhe a
 * opção "Convertido" pelo nome e confere "Esgotado" no card. Mudar a palavra
 * aqui quebra aquele spec — o que é o ponto: a mudança passa a ser deliberada.
 */
export const RESULTADOS_DO_FIM: Record<ResultadoDoFim, string> = {
  converted: "Converti",
  exhausted: "Tentatives épuisées",
  custom: "Personnalisé",
};

// ─── o acompanhamento depois de rodar ────────────────────────────────────

/**
 * Situação de um `followup_enrollment`. Duas divergem do que a Fila mostra
 * hoje (`QueueTab.tsx`), de propósito, e a Wave 2 unifica: "Pausado (handoff)"
 * usa jargão que ninguém de fora entende, e "Morto" descreve o sistema em vez
 * do que a pessoa precisa fazer — `dead` é o estado que abre aviso na Central.
 */
export const SITUACOES_DO_ACOMPANHAMENTO: Record<EnrollmentStatus, string> = {
  active: "En cours",
  waiting_reply: "En attente de réponse",
  paused_handoff: "En pause — une personne a pris le relais",
  completed: "Terminé",
  cancelled: "Annulé",
  dead: "Arrêté sur un échec",
};

/** Como o acompanhamento terminou. Sem tradução em lugar nenhum do produto até aqui. */
export const DESFECHOS: Record<EnrollmentOutcome, string> = {
  converted: "Converti",
  replied: "Le contact a répondu",
  exhausted: "Tentatives épuisées",
  opted_out: "A demandé d’arrêter",
  handoff: "Confié à une personne",
};

// ─── gatilho do fluxo ────────────────────────────────────────────────────

/**
 * "Manual" e "Silêncio" são o texto que `TriggerConfigControl.tsx` já mostra e
 * que `followup-builder.spec.ts` seleciona pelo nome — mantidos ao pé da letra.
 */
export const GATILHOS: Record<TipoDeGatilho, string> = {
  manual: "Manual",
  silence: "Silence",
  stage_change: "Changement de colonne dans le tableau",
  // "Caso" é a palavra que a tela de escalação já usa. O rótulo diz o FATO que
  // dispara ("o agente pediu ajuda"), não o nome da tabela — quem lê é dono de
  // clínica, não quem escreveu o schema.
  case_opened: "Quand l’assistant demande l’aide d’une personne",
  conversation_end: "Fin de la conversation",
};
