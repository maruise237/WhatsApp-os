/**
 * Login de admin — UMA cópia, compartilhada pelas jornadas (`canais-baseline`,
 * `templates-screen`, `canal-oficial`). Copiar um helper duplica o defeito e
 * divide o conserto.
 */
import * as fs from "node:fs";
import * as path from "node:path";

import type { Page } from "@playwright/test";

export interface E2eCreds {
  /** A org semeada por `scripts/seed-e2e-credentials.ts` — as jornadas filtram por ela. */
  org_id: string;
  password: string;
  users: Record<string, { email: string } | undefined>;
}

export function lerCreds(): E2eCreds {
  return JSON.parse(
    fs.readFileSync(path.join(process.cwd(), ".e2e-creds.json"), "utf8"),
  ) as E2eCreds;
}

const JA_LOGADO = /\/(app|onboarding)\//;

export async function loginAdmin(page: Page): Promise<void> {
  const creds = lerCreds();

  await page.goto("/login");
  await page.locator("#email").fill(creds.users.admin!.email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  // 30 s : folga para a carga, não para o produto.
  await page.waitForURL(JA_LOGADO, { timeout: 30_000 });
}
