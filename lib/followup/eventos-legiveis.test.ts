import { describe, expect, it } from "vitest";

import {
  descreveEvento,
  duracaoLegivel,
  refDoNo,
  resumoDoNo,
  rotuloDaAresta,
  rotuloDoStatus,
  type NoDoDossie,
} from "./eventos-legiveis";
import type { FlowNode } from "./graph-schema";

const espera: FlowNode = {
  id: "wait-1",
  type: "wait",
  label: "Deixa esfriar",
  position: { x: 0, y: 0 },
  config: { mode: "fixed", duration_ms: 14_400_000 },
};

const nos: Record<string, NoDoDossie> = {
  "wait-1": resumoDoNo(espera),
  "action-1": resumoDoNo({
    id: "action-1",
    type: "action",
    label: "Primeira cutucada",
    position: { x: 0, y: 0 },
    config: { mode: "ai_message", prompt_hint: "lembre do orçamento enviado" },
  }),
};

function evento(over: Partial<Parameters<typeof descreveEvento>[0]> = {}) {
  return {
    id: "e1",
    node_id: "wait-1",
    event_type: "wait_started",
    payload: {} as Record<string, unknown>,
    created_at: "2026-08-10T12:00:00.000Z",
    ...over,
  };
}

describe("duracaoLegivel", () => {
  it("fala em minutos, horas e dias — a unidade que a pessoa usaria", () => {
    expect(duracaoLegivel(1_800_000)).toBe("30 minutes");
    expect(duracaoLegivel(3_600_000)).toBe("1 heure");
    expect(duracaoLegivel(14_400_000)).toBe("4 heures");
    expect(duracaoLegivel(172_800_000)).toBe("2 jours");
  });

  it("valor impossível não vira número esquisito na tela", () => {
    expect(duracaoLegivel(Number.NaN)).toBe("durée indéfinie");
    expect(duracaoLegivel(-1)).toBe("durée indéfinie");
  });
});

describe("resumoDoNo", () => {
  it("descreve o que o nó faz sem entregar a instrução do prompt", () => {
    const r = resumoDoNo({
      id: "a",
      type: "action",
      label: "Cutucada",
      position: { x: 0, y: 0 },
      config: { mode: "ai_message", prompt_hint: "SEGREDO DO PROMPT" },
    });
    expect(r.resumo).not.toContain("SEGREDO DO PROMPT");
    expect(r.resumo).toContain("assistant écrit");
  });

  it("a espera adaptativa mostra a faixa que o dono do fluxo configurou", () => {
    const r = resumoDoNo({
      id: "w",
      type: "wait",
      label: "Attente",
      position: { x: 0, y: 0 },
      config: { mode: "smart", min_ms: 3_600_000, max_ms: 86_400_000 },
    });
    expect(r.resumo).toBe("attente adaptée, entre 1 heure et 1 jour");
  });
});

describe("refDoNo — o alvo nunca some", () => {
  it("usa o nome que a pessoa deu ao passo", () => {
    expect(refDoNo("wait-1", nos)).toBe("Deixa esfriar");
  });

  it("passo fora do grafo pinado aparece DITO como id, não escondido", () => {
    // Registro sem o dono é indiagnosticável: "falhou" sem onde não serve para
    // nada. Feio e verdadeiro ganha de bonito e mudo.
    expect(refDoNo("wait-99", nos)).toContain("wait-99");
    expect(refDoNo("wait-99", nos)).toContain("n’existe plus");
  });

  it("evento sem nó não inventa um", () => {
    expect(refDoNo(null, nos)).toBe("aucune étape associée");
  });
});

describe("descreveEvento", () => {
  it("traduz o passo do motor e diz onde ele aconteceu", () => {
    const r = descreveEvento(
      evento({ event_type: "node_advanced", payload: { next_node_id: "action-1" } }),
      nos,
    );
    expect(r.titulo).toBe("A avancé");
    expect(r.detalhe).toBe("est passée à Primeira cutucada");
    expect(r.onde).toBe("Deixa esfriar");
    expect(r.autor).toBe("motor");
  });

  it("a falha carrega a mensagem E o passo — nunca uma sem a outra", () => {
    const r = descreveEvento(
      evento({ event_type: "node_failed", payload: { error: "flow_version_not_found" } }),
      nos,
    );
    expect(r.detalhe).toBe("flow_version_not_found");
    expect(r.onde).toBe("Deixa esfriar");
  });

  it("intervenção humana é marcada como humana — é o que separa decisão de automatismo", () => {
    expect(descreveEvento(evento({ event_type: "paused_manual" }), nos).autor).toBe("pessoa");
    expect(descreveEvento(evento({ event_type: "reactivity_replied" }), nos).autor).toBe("cliente");
  });

  it("tipo desconhecido não vira jargão disfarçado de frase, mas também não some", () => {
    const r = descreveEvento(evento({ event_type: "passo_que_ainda_nao_existe" }), nos);
    expect(r.titulo).toBe("Étape enregistrée par le moteur");
    // O código aparece porque é EXATAMENTE aqui que quem diagnostica precisa dele.
    expect(r.detalhe).toContain("passo_que_ainda_nao_existe");
  });
});

describe("rotuloDaAresta", () => {
  it("diz QUANDO o caminho é seguido, em português", () => {
    expect(rotuloDaAresta({ id: "e", source: "a", target: "b", priority: 0, condition: { type: "always" } })).toBe(
      "chemin normal",
    );
    expect(
      rotuloDaAresta({
        id: "e",
        source: "a",
        target: "b",
        priority: 0,
        condition: { type: "class_match", value: "no_reply" },
      }),
    ).toBe("quand personne ne répond");
    expect(
      rotuloDaAresta({
        id: "e",
        source: "a",
        target: "b",
        priority: 0,
        condition: { type: "cond_result", value: false },
      }),
    ).toBe("quand la condition est fausse");
    // v1 e v2 leem a MESMA classe com a MESMA frase — é o risco que centralizar
    // o dicionário mata: o mesmo fluxo lido de dois jeitos conforme a versão.
    expect(
      rotuloDaAresta({
        id: "e",
        source: "a",
        target: "b",
        priority: 0,
        condition: { type: "class_match", value: "quente" },
      }),
    ).toBe("quand l’IA classe la réponse comme « quente »");
  });
});

describe("rotuloDoStatus", () => {
  it("as duas pausas NÃO se chamam igual — decisões diferentes dependem disso", () => {
    expect(rotuloDoStatus("paused_manual")).toBe("Mis en pause par une personne");
    expect(rotuloDoStatus("paused_handoff")).toBe("En pause (reprise par une personne)");
  });
});

describe("rotuloDaAresta — o ramo nomeado do grafo v2", () => {
  const classify: FlowNode = {
    id: "ac1",
    type: "ai_classify",
    label: "Interpreta",
    position: { x: 0, y: 0 },
    config: {
      classes: ["quente", "frio"],
      branches: [
        { id: "b-quente", label: "quente" },
        { id: "b-frio", label: "frio" },
      ],
      grace_timeout_ms: 900_000,
      target: "last_reply",
    },
  };
  const aresta = (branchId: string) => ({
    id: "e",
    source: "ac1",
    target: "x",
    priority: 0,
    condition: { type: "branch" as const, branch_id: branchId },
  });

  it("usa o NOME que a pessoa deu ao ramo, que só existe no nó — e diz que quem julgou foi a IA", () => {
    expect(rotuloDaAresta(aresta("b-quente"), classify)).toBe(
      "quand l’IA classe la réponse comme « quente »",
    );
  });

  it("sem o nó de origem, NÃO ecoa o branch_id — ele é identificador interno", () => {
    // A distinguibilidade entre duas opções vem do rótulo do DESTINO, que a
    // lista de saídas do dossiê mostra ao lado da frase.
    expect(rotuloDaAresta(aresta("b-quente"))).toBe("par un chemin sans nom");
  });

  it("ramo que o nó não declara mais também não vira id na tela", () => {
    expect(rotuloDaAresta(aresta("b-sumiu"), classify)).toBe("par un chemin sans nom");
  });

  it("regra do negócio não se lê como resposta de ninguém", () => {
    const condicao: FlowNode = {
      id: "c1",
      type: "condition",
      label: "Confere o negócio",
      position: { x: 0, y: 0 },
      config: {
        branching: "per_check",
        combinator: "and",
        checks: [
          { id: "r-quente", label: "Lead quente", field: "tag", op: "eq", value: "quente" },
          { id: "r-passos", field: "steps_taken", op: "gte", value: 3 },
        ],
      },
    };
    const paraRamo = (id: string) => ({
      id: "e",
      source: "c1",
      target: "x",
      priority: 0,
      condition: { type: "branch" as const, branch_id: id },
    });

    expect(rotuloDaAresta(paraRamo("r-quente"), condicao)).toBe("quand la règle « Lead quente » s’applique");
    // Regra sem nome vira a condição POR EXTENSO — `regra-2` na tela é o que o
    // vocabulário existe para impedir.
    expect(rotuloDaAresta(paraRamo("r-passos"), condicao)).not.toContain("r-passos");
    expect(rotuloDaAresta(paraRamo("r-passos"), condicao)).toMatch(/^quand /);
  });

  it("os ramos reservados do contrato viram frase sem depender do nó", () => {
    expect(rotuloDaAresta(aresta("no_reply"))).toBe("quand personne ne répond");
    expect(rotuloDaAresta(aresta("true"))).toBe("quand la condition est vraie");
    expect(rotuloDaAresta(aresta("false"))).toBe("quand la condition est fausse");
  });
});

describe("os eventos que o plano de tempo trouxe", () => {
  it("o pedido de PLANEJAMENTO não se disfarça de pedido de mensagem", () => {
    // Os dois são `turn_enqueued`; só o `purpose` os separa. Uma linha que
    // descreve o passo errado é pior que uma genérica: não parece errada.
    const planejar = descreveEvento(
      evento({ node_id: null, event_type: "turn_enqueued", payload: { purpose: "plan_timing" } }),
      nos,
    );
    expect(planejar.titulo).toBe("A demandé à l’assistant de planifier les délais d’attente");

    const mensagem = descreveEvento(
      evento({ event_type: "turn_enqueued", payload: { purpose: "send_message" } }),
      nos,
    );
    expect(mensagem.titulo).toBe("A demandé à l’assistant d’écrire le message");
  });

  it("o plano decidido vira frase, não `código: timing_plan_decidido`", () => {
    const r = descreveEvento(
      evento({ event_type: "timing_plan_decidido", payload: { esperas: { "wait-1": {}, "wait-2": {} } } }),
      nos,
    );
    expect(r.titulo).toBe("L’assistant a décidé du délai d’attente de chaque étape");
    expect(r.detalhe).toBe("2 attentes planifiées");
  });

  it("desistir do plano é um FATO na timeline, não silêncio", () => {
    const r = descreveEvento(evento({ event_type: "timing_plan_desistido" }), nos);
    expect(r.titulo).toBe("A continué sans planning de délais");
    expect(r.detalhe).toContain("maximum configuré");
  });
});
