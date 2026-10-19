import { describe, expect, it } from "vitest";

import { listaLegivel, ACTIVITY_LABELS, activityLabel } from "@/lib/leads/activity-vocabulary";

/**
 * Editar um campo deixa rastro — e o rastro diz O QUÊ mudou.
 *
 * Antes da wave 6, `updateLeadHandler` não emitia atividade nenhuma: a IA
 * deixava rastro e o humano não. Não era "falta um emissor" — era meia
 * continuidade vendida como continuidade, e o dossiê mostraria metade da vida
 * do lead como se fosse a vida inteira.
 */
describe("a edição humana na timeline", () => {
  it("o tipo tem rótulo em português, e não o nome de máquina", () => {
    expect(ACTIVITY_LABELS.lead_edited).toBe("Infos de l’affaire modifiées");
    expect(activityLabel("lead_edited")).not.toBe("lead_edited");
  });

  it("a razão diz QUAIS campos mudaram", () => {
    // "dados alterados" sozinho não muda o que ninguém faz a seguir: saber que
    // mudou o VALOR é diferente de saber que mudou a descrição.
    expect(listaLegivel(["value_cents"])).toBe("le montant");
    expect(listaLegivel(["title", "value_cents"])).toBe("le titre et le montant");
    expect(listaLegivel(["title", "tags", "owner_user_id"])).toBe(
      "le titre, les étiquettes et le responsable",
    );
  });

  it("campo desconhecido aparece pelo nome cru em vez de sumir", () => {
    // Coluna nova apareceria como `expected_close_date_v2` — feio e honesto.
    // Sumir seria pior: a frase diria menos do que de fato aconteceu, e quem
    // lesse concluiria que aquele campo não foi tocado.
    expect(listaLegivel(["campo_novo"])).toBe("campo_novo");
    expect(listaLegivel(["title", "campo_novo"])).toBe("le titre et campo_novo");
  });

  it("lista vazia não vira frase quebrada", () => {
    expect(listaLegivel([])).toBe("nada");
  });

  it("nenhum nome legível é igual ao nome da coluna", () => {
    // O ponto do mapa: se um nome escapar sem tradução, a timeline mostra
    // vocabulário de banco na cara do usuário — o mesmo defeito que o
    // ACTIVITY_LABELS existe para matar, um nível abaixo.
    for (const coluna of [
      "title",
      "description",
      "value_cents",
      "owner_user_id",
      "expected_close_date",
      "tags",
    ]) {
      expect(listaLegivel([coluna])).not.toBe(coluna);
    }
  });
});
