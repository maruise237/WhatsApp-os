/**
 * Navegação agrupada — prova pela TELA (DoD item 12).
 *
 * Os testes unitários provam que o registro e os componentes fazem o que
 * dizem. Isto prova o que o usuário reclamou: que dá para *achar* as coisas.
 * O caso que originou a mudança é o primeiro — chegar em Funis sem saber que
 * ele morava em Configurações.
 *
 * Pré-requisito: `.e2e-creds.json` (gerado por scripts/seed-e2e-credentials.ts).
 */
import { mkdirSync } from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

import { lerCreds, loginComoAdmin } from "./helpers/login-admin";
import { afirmarAdminDeTenantPuro } from "./utils/precondicao";

let creds = lerCreds();
const EVIDENCE = path.join(process.cwd(), ".superpowers", "evidence");

mkdirSync(EVIDENCE, { recursive: true });

// ── Precondição de identidade ────────────────────────────────────────────────
// O menu é `sidebarGroups(isPlatformAdmin, role)` (`registry.ts:510-519`), então
// a suspeita natural é que promover o `e2e-admin` a dono do servidor inflasse o
// sidebar que esta spec mede item a item.
//
// ⚠️ MEDIDO, e a suspeita não se confirma: `canSee` (`registry.ts:503-507`) é
// `isPlatformAdmin || ROLE_RANK[role] >= ROLE_RANK[minRole]`; `ROLE_RANK.admin`
// é 5, o TETO, e o maior `minRole` do registro é `"admin"`. Para um admin de
// tenant o menu é IDÊNTICO promovido ou não — as asserções de `toHaveText`
// abaixo não mudariam. Guardar a identidade aqui continua valendo (é a spec de
// navegação; qualquer destino futuro exclusivo do dono apareceria primeiro
// nela), mas registrar a diferença entre "muda" e "poderia mudar" é o ponto.
test.beforeAll(async () => {
  await afirmarAdminDeTenantPuro(creds.users.admin!.email);
});

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/app\//);
}

async function loginAdmin(page: Page): Promise<void> {
  creds = await loginComoAdmin(page, creds);
}

const sidebar = (page: Page) => page.getByRole("navigation", { name: "Navigation principale" });

async function expectSemOverflowHorizontal(page: Page, contexto: string): Promise<void> {
  const m = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));

  expect(
    m.scrollWidth,
    `${contexto}: documentElement.scrollWidth (${m.scrollWidth}) não pode passar do clientWidth (${m.clientWidth})`,
  ).toBeLessThanOrEqual(m.clientWidth + 1);
}

// `loginComoAdmin` espera a virada da janela TOTP entre logins consecutivos
// (o servidor recusa código repetido), e essa espera sozinha pode consumir os
// 30 s do teto global do playwright.config.ts. Toda spec da casa que usa o
// helper sobe o teto — 240 s em `agente-novo-e-uso`, `agente-papeis-operador`,
// `escopo-de-funil-do-agente` e `capacidades-do-agente`; 90 s em
// `prova-painel-provedores`. Esta era a única que faltava, e por isso dois
// testes que já estavam verdes passaram a estourar 30 s.
test.describe.configure({ timeout: 120_000 });

test.describe("navigation groupée", () => {
  test("la barre latérale a une hiérarchie : groupes dans l’ordre d’usage", async ({ page }) => {
    await loginAdmin(page);

    // Organização não aparece como título aqui: seu hub (Configurações) vive no
    // rodapé fixo — ver o teste de dobra abaixo.
    const titulos = sidebar(page).getByRole("heading");
    await expect(titulos).toHaveText([
      "Assistance",
      "CRM",
      "Agent IA",
      "Canaux",
      "Analyse",
    ]);

    await page.screenshot({
      path: path.join(EVIDENCE, "nav-sidebar-agrupado.png"),
      fullPage: true,
    });
  });

  test("on arrive aux Étapes du tableau par le CRM, sans passer par Paramètres", async ({ page }) => {
    await loginAdmin(page);

    // O caso que originou tudo: o usuário não sabia que esta tela existia.
    //
    // ⚠️ O ITEM MUDOU DE NOME, e o nome antigo ("Funis") passou para o VIZINHO —
    // a lista de funis, em /app/kanban. Um teste que continuasse clicando em
    // "Funis" seguiria verde medindo a outra tela; por isso a asserção de URL
    // abaixo é específica (`settings/tenant/pipelines`) e não o antigo
    // /pipelines/, que casa com as duas.
    await sidebar(page).getByRole("link", { name: "Étapes du tableau" }).click();
    await page.waitForURL(/settings\/tenant\/pipelines/);
    await expect(page.getByRole("heading", { name: "Étapes du tableau", level: 1 })).toBeVisible();
  });

  test("et la liste des tableaux est l’élément voisin, avec son propre nom", async ({ page }) => {
    await loginAdmin(page);
    await sidebar(page).getByRole("link", { name: "Tableaux", exact: true }).click();
    await page.waitForURL(/\/app\/kanban/);
    await expect(page.getByRole("heading", { name: "Tableaux", level: 1 })).toBeVisible();
  });

  test("on arrive aux Connaissances, qui n’existaient que derrière les onglets IA", async ({ page }) => {
    await loginAdmin(page);

    await sidebar(page).getByRole("link", { name: "Voir tout en IA" }).click();
    await page.waitForURL(/\/app\/ai$/);

    // O hub organiza por jornada, não numa grade solta.
    await expect(page.getByRole("heading", { name: "Configurer l’agent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Former l’agent" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Suivre l’agent" })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-hub-ia.png"), fullPage: true });

    await page.getByRole("link", { name: /Connaissances/ }).click();
    await page.waitForURL(/knowledge\/sources/);
  });

  /**
   * O canal oficial saiu de Configurações no PR #105 e virou aba de Conexões.
   * A porta, portanto, é Conexões — que agora vive no grupo CANAIS do sidebar,
   * e não mais como um card perdido em Configurações.
   */
  test("on arrive au canal officiel par le groupe Canaux, pas par Paramètres", async ({ page }) => {
    await loginAdmin(page);

    await sidebar(page).getByRole("link", { name: "Connexions" }).click();
    await page.waitForURL(/\/app\/connections/);
    await expect(page.getByRole("tab", { name: /officielle/i })).toBeVisible();
  });

  test("le ⌘K trouve le canal officiel par son nom, même sans écran dédié", async ({ page }) => {
    await loginAdmin(page);

    // Ninguém procura por "Conexões" quando quer o número oficial da Meta —
    // procura por "oficial". A busca varre a descrição além do rótulo.
    await page.keyboard.press("ControlOrMeta+k");
    await page.getByRole("combobox").fill("officiel");
    await expect(page.getByRole("option", { name: /Connexions/ })).toBeVisible();
  });

  test("⌘K ouvre, filtre et navigue", async ({ page }) => {
    await loginAdmin(page);

    await page.keyboard.press("ControlOrMeta+k");
    const busca = page.getByRole("combobox");
    await expect(busca).toBeVisible();

    await busca.fill("connais");
    await expect(page.getByRole("option", { name: /Connaissances/ })).toBeVisible();

    await page.screenshot({ path: path.join(EVIDENCE, "nav-command-palette.png") });

    await page.keyboard.press("Enter");
    await page.waitForURL(/knowledge\/sources/);
  });

  /**
   * Agrupar cria um risco que a lista plana não tinha: o menu cresce e passa a
   * exigir scroll. Na primeira versão desta mudança, medido em 1280×768, o
   * conteúdo dava 1019px contra 663px visíveis — SETE links e os grupos Análise
   * e Organização ficavam fora da dobra. Trocar "17 itens sem hierarquia" por
   * "20 itens que não cabem" seria recriar o problema em outra forma.
   *
   * Medido por ferramenta, nunca a olho.
   */
  test("aucun groupe ne reste sous la ligne de flottaison, et à 900px le menu ne défile pas", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await loginAdmin(page);

    const m = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navigation principale"]')!;
      const r = nav.getBoundingClientRect();
      return {
        rola: nav.scrollHeight > Math.round(r.height) + 1,
        titulosFora: [...nav.querySelectorAll("h2")].filter(
          (h) => h.getBoundingClientRect().bottom > r.bottom,
        ).length,
      };
    });

    expect(m.titulosFora, "grupo inteiro invisível é o problema que viemos resolver").toBe(0);
    expect(m.rola, "em 900px o menu inteiro tem de caber sem scroll").toBe(false);
  });

  test.describe("mobile", () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test("à 390px, la barre latérale devient un tiroir et ne crée pas de débordement horizontal", async ({ page }) => {
      await loginAdmin(page);

      await expect(sidebar(page), "o sidebar desktop fica fora da árvore acessível no mobile").toHaveCount(0);
      await expectSemOverflowHorizontal(page, "shell mobile após login");

      await page.getByRole("button", { name: "Ouvrir la navigation" }).click();
      await expect(sidebar(page)).toBeVisible();
      await expectSemOverflowHorizontal(page, "shell mobile com drawer aberto");
      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-drawer-aberta.png"),
        fullPage: true,
      });

      await sidebar(page).getByRole("link", { name: "Tableaux", exact: true }).click();
      await page.waitForURL(/\/app\/kanban/);
      await expect(page.getByRole("dialog")).toHaveCount(0);
      await expectSemOverflowHorizontal(page, "shell mobile após navegar pelo drawer");

      await page.screenshot({
        path: path.join(EVIDENCE, "nav-mobile-390-sem-overflow.png"),
        fullPage: true,
      });
    });
  });

  test("Paramètres reste fixé en pied, hors de la zone qui défile", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 768 });
    await loginAdmin(page);

    const config = page.getByRole("link", { name: "Paramètres" });
    await expect(config).toBeVisible();

    const dentroDaNav = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navigation principale"]')!;
      const link = [...document.querySelectorAll("a")].find(
        (a) => a.textContent?.trim() === "Paramètres",
      );
      return nav.contains(link!);
    });
    expect(dentroDaNav, "Configurações não pode depender de scroll para aparecer").toBe(false);
  });

  test("un agent ne voit pas l’en-tête d’un groupe que la permission a vidé", async ({ page }) => {
    await login(page, creds.users.agent!.email);

    // CANAIS é todo manager+/admin: o título não pode sobrar sozinho.
    await expect(sidebar(page).getByRole("heading", { name: "Canaux" })).toHaveCount(0);
    await expect(sidebar(page).getByRole("heading", { name: "Assistance" })).toBeVisible();
  });
});
