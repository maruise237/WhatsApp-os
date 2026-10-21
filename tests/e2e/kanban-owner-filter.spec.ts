/**
 * G3-03 — filtro por responsável no board (deep-linkável via query param).
 *
 * Verifica: os dois leads seed aparecem (um com responsável, um "Sem
 * responsável"); ao filtrar por "Sem responsável" a URL ganha ?owner=unassigned
 * e o card com dono some. Login como manager (sem MFA; vê todos os leads da org).
 *
 * Pré-requisito: seed de credenciais + seed de kanban (rodados aqui se faltarem).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

interface Creds {
  password: string;
  users: Record<string, { email: string }>;
  kanban?: { pipeline_id: string };
}

function loadCreds(): Creds {
  const needsBase = (): boolean => {
    if (!fs.existsSync(CREDS_PATH)) return true;
    const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
    return !c.users?.manager;
  };
  if (needsBase()) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  let c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  if (!c.kanban?.pipeline_id) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-kanban.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  return c;
}

const creds = loadCreds();

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/app\//);
}

test("le filtre par responsable se reflète dans l’URL et masque les leads avec propriétaire", async ({ page }) => {
  await login(page, creds.users.manager!.email);
  await page.goto(`/app/pipelines/${creds.kanban!.pipeline_id}`);

  const owned = page.getByRole("heading", { name: "Commande E2E avec responsable" });
  const unowned = page.getByRole("heading", { name: "Commande E2E sans responsable" });
  await expect(owned).toBeVisible();
  await expect(unowned).toBeVisible();
  // A badge de ausência de dono está presente em ao menos um card.
  await expect(page.getByText("Aucun responsable").first()).toBeVisible();

  // Abre o filtro de responsável e escolhe "Sem responsável".
  await page.getByRole("button", { name: /^Responsable :/ }).click();
  await page.getByRole("menuitem", { name: "Aucun responsable" }).click();

  await expect(page).toHaveURL(/owner=unassigned/);
  await expect(unowned).toBeVisible();
  await expect(owned).toHaveCount(0);
});
