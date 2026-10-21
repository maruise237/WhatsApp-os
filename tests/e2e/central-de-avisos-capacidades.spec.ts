/**
 * O AVISO DE CAPACIDADES AUSENTES APARECE NA CENTRAL — PELA TELA (ACH-04).
 *
 * O conserto do ACH-04 tem duas metades. A primeira (a colisão do prefixo do
 * token efêmero) e a segunda (o aviso nascer em vez de virar log) já têm catraca
 * contra Postgres real em `tests/invariants/capacidades-ausentes.test.ts`.
 *
 * Falta a que importa para o dono do negócio: **ele consegue ver?** O defeito
 * original era exatamente esse — o código afirmava "o humano vê o log", e o log
 * sai no stdout de um contêiner de VPS que ninguém abre. Provar o INSERT e parar
 * ali seria repetir o erro numa camada acima: registro que existe no banco e não
 * chega à tela é a mesma falha-em-verde com outra roupa.
 *
 * ⚠️ O QUE ESTE SPEC NÃO EXERCITA, dito antes que alguém precise perguntar: o
 * GATILHO. A falha do mint era garantida em toda retentativa e foi consertada;
 * reproduzi-la aqui exigiria desfazer o conserto. O item é criado pelo EMISSOR
 * REAL (`avisarCapacidadesAusentes`, a mesma função que o `catch` do turno
 * chama) via `scripts/seed-e2e-capacidades-ausentes.ts` — não por INSERT à mão.
 * O que fica coberto aqui é emissor → banco → tela.
 *
 * Pré-requisitos:
 *   pnpm exec tsx scripts/seed-e2e-credentials.ts
 *   pnpm exec tsx --env-file=.env.local scripts/seed-e2e-capacidades-ausentes.ts
 *   pnpm build && E2E_PORT=3021 pnpm exec playwright test tests/e2e/central-de-avisos-capacidades.spec.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test, type Page } from "@playwright/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), ".superpowers/evidence/ia-360-w3");

interface Creds {
  password: string;
  org_id: string;
  users: Record<string, { email: string }>;
}

let creds: Creds;

async function login(page: Page, email: string, senha: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(senha);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/app/, { timeout: 60_000 });
}

test.describe("Centre d’alertes — l’échange qui s’est fait sans les outils", () => {
  test.describe.configure({ timeout: 120_000 });

  test.beforeAll(() => {
    creds = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  });

  test("l’alerte apparaît, en français compréhensible, avec le motif technique à côté", async ({ page }) => {
    await login(page, creds.users.agent!.email, creds.password);
    await page.goto("/app/ai/inbox");

    await expect(page.getByRole("heading", { name: "Centre d’alertes" })).toBeVisible({
      timeout: 30_000,
    });

    // (1) O RÓTULO. Diz o que aconteceu com o CLIENTE, não o que quebrou por
    // dentro — `kindLabel` cai em "Aviso do assistente" para kind desconhecido,
    // então este texto também prova que o kind chegou ao mapa de tradução.
    const aviso = page.getByText("Une conversation s’est faite sans les outils que vous avez activés").first();
    await expect(
      aviso,
      "kind sem rótulo cairia no genérico 'Aviso do assistente' — o item existiria e não diria nada",
    ).toBeVisible({ timeout: 30_000 });

    // (2) A SEVERIDADE. Atender sem as capacidades configuradas não é recado
    // informativo: o cliente foi atendido a menos e ninguém decidiu isso.
    const cartao = page
      .getByTestId("inbox-item")
      .filter({ hasText: "Une conversation s’est faite sans les outils" })
      .first();
    await expect(cartao.getByText("critique", { exact: false }).first()).toBeVisible();

    // (3) O MOTIVO TÉCNICO no corpo — quem for investigar precisa dele, e ele
    // não pode estar no lugar do rótulo.
    await expect(
      page.getByText(/ephemeral_token_insert_failed/).first(),
      "sem o motivo técnico o aviso avisa e não ajuda a consertar",
    ).toBeVisible();

    // (4) E a frase que explica ao dono do negócio o que NÃO aconteceu: a
    // conversa do cliente não foi interrompida.
    await expect(page.getByText(/La conversation n’a pas été interrompue/).first()).toBeVisible();

    fs.mkdirSync(EVIDENCIA, { recursive: true });
    await page.screenshot({
      path: path.join(EVIDENCIA, "06-central-de-avisos-capacidades.png"),
      fullPage: true,
    });
  });

  test("l’alerte est actionnable : on peut la résoudre et elle sort de la liste des ouvertes", async ({ page }) => {
    // Aviso que não some depois de tratado vira ruído permanente, e ruído
    // permanente é a forma mais rápida de a Central deixar de ser lida.
    await login(page, creds.users.agent!.email, creds.password);
    await page.goto("/app/ai/inbox");

    const aviso = page.getByText("Une conversation s’est faite sans les outils que vous avez activés").first();
    await expect(aviso).toBeVisible({ timeout: 30_000 });

    const cartao = page
      .getByTestId("inbox-item")
      .filter({ hasText: "Une conversation s’est faite sans les outils" })
      .first();
    // O rótulo é lido da tela, não inventado: se ele mudar, o teste reprova —
    // é a palavra que o atendente vê.
    await cartao.getByRole("button", { name: /Marquer comme résolu/i }).click();

    await expect(
      page.getByText("Une conversation s’est faite sans les outils que vous avez activés"),
    ).toHaveCount(0, { timeout: 30_000 });

    await page.screenshot({
      path: path.join(EVIDENCIA, "07-central-aviso-resolvido.png"),
      fullPage: true,
    });
  });
});
