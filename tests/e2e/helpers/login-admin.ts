/**
 * Login de admin que sobrevive ao banco compartilhado.
 *
 * As credenciais em disco podem ter sido reescritas por outra sessão
 * (`seed-e2e-credentials.ts` regrava a senha). Quando o login falha, re-semeia
 * UMA vez e tenta de novo, em vez de acusar a tela.
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { expect, type Page } from "@playwright/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");

export interface CredsE2E {
  password: string;
  users: Record<string, { email: string }>;
  /**
   * O agente que o seed de credenciais cria. **É um `rag_bot`** — a tela de
   * configuração por papéis é do `mcp_agent`, então não serve para ela.
   */
  default_agent_id?: string;
  /** `mcp_agent` + versão criados por `scripts/seed-e2e-capacidades.ts`. */
  capacidades?: { agent_id: string; version_id: string };
}

export function lerCreds(): CredsE2E {
  if (!fs.existsSync(CREDS_PATH)) semearCredenciais();
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as CredsE2E;
}

/**
 * Re-semeia as credenciais **e reconstitui a cadeia que elas derrubam**.
 *
 * `seed-e2e-credentials.ts` reescreve o `.e2e-creds.json` INTEIRO. Os blocos
 * que os outros seeds acrescentam ao mesmo arquivo (`capacidades`, a credencial
 * de IA e a sessão de canal do follow-up) vão junto — e como este helper roda
 * no MEIO de um login, o efeito aparece longe da causa: um spec que já tinha
 * semeado sua fixture vê o campo sumir e falha dizendo "rode o seed antes",
 * logo depois de um seed que imprimiu sucesso. Medido nesta sessão, duas vezes.
 *
 * `seed-e2e-followup-agent` entra aqui porque é pré-requisito declarado de
 * `seed-e2e-capacidades` (que aborta com "Rode antes: …") e escreve no mesmo
 * arquivo. O bloco `capacidades` NÃO entra: nem todo spec precisa de um
 * `mcp_agent`, e quem precisa já o semeia — e precisa semear depois do login,
 * de qualquer forma.
 */
export function semearCredenciais(): CredsE2E {
  execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  execFileSync("npx", ["tsx", "scripts/seed-e2e-followup-agent.ts"], { stdio: "inherit" });
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as CredsE2E;
}

/**
 * Loga como admin. Devolve as credenciais em vigor — que podem ter sido
 * re-semeadas no meio do caminho, e nesse caso são diferentes das que o chamador
 * tinha em mãos.
 */
export async function loginComoAdmin(page: Page, creds: CredsE2E): Promise<CredsE2E> {
  let atuais = creds;

  for (let volta = 0; volta < 2; volta++) {
    await page.goto("/login");
    await page.locator("#email").fill(atuais.users.admin!.email);
    await page.locator("#password").fill(atuais.password);
    await page.getByRole("button", { name: /se connecter/i }).click();
    try {
      await page.waitForURL(/\/app\//, { timeout: 30_000 });
      return atuais;
    } catch {
      if (volta === 0) {
        // As credenciais em disco não valem mais: outra sessão rodou o seed.
        // Re-semeia UMA vez e tenta de novo — na segunda falha o problema é outro.
        atuais = semearCredenciais();
      }
    }
  }

  expect(false, "le login admin a échoué même après avoir ré-ensemencé les identifiants").toBe(true);
  return atuais;
}
