/**
 * Atualização self-service pela UI (doutrina de QA visual, DoD 12) — prova
 * pela TELA, como o dono da instalação faria. O agente do host (`agent.sh`,
 * task 8) é simulado por requisições `POST /api/v1/system/agent` assinadas
 * com o mesmo segredo que ele usaria de verdade: o que se prova aqui é a
 * experiência na tela (rodapé → aviso → clique → progresso → desfecho), não
 * o bash em si — esse é provado na VPS (ver o brief da task).
 *
 * ═══ QUEM É O DONO AQUI, E POR QUE NÃO É O `e2e-admin` ═══
 *
 * O dono do servidor desta spec é `e2e-dono@deskcomm.test`, um usuário
 * DEDICADO. Antes ele era o `e2e-admin`, que 10 outras specs usam como *admin
 * de tenant* — e como nenhum seed revogava a promoção e as duas partes do job
 * `e2e` compartilham banco sem reset, a parte 2 inteira herdava um admin com
 * escape de plataforma. O escape abre justamente a tela que ESTA spec mede
 * (`app/app/settings/atualizacao/page.tsx:16` faz `notFound()` sem a flag) e o
 * `/admin/*` inteiro; a medição do que muda e do que NÃO muda está em
 * `tests/e2e/utils/precondicao.ts`.
 *
 * Trocar de usuário remove a CAUSA. Limpar depois não serviria: `afterAll` não
 * roda quando a spec estoura.
 *
 * Pré-requisitos:
 * - `.e2e-creds.json` (o spec roda `seed-e2e-credentials.ts` sozinho se
 *   ausente/incompleto, como `rbac-roles.spec.ts`) + `seed-e2e-system-update.ts`
 *   (promove o usuário `dono` do seed a dono do servidor via `platform_admins`
 *   — é uma superfície diferente do role de organização —, REVOGA a promoção do
 *   `admin` e limpa `system_version`/`system_update_runs` pra não colidir com o
 *   índice único de run em andamento).
 * - `INTERNAL_SECRET` no ambiente do Playwright (o segredo que autentica o
 *   agente do host em `/api/v1/system/agent`). Sem ele, o heartbeat simulado
 *   nem autenticaria — o arquivo INTEIRO pula em vez de falhar por motivo
 *   errado (ausência de ambiente ≠ defeito).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

import { generateTotp, msUntilNextTotpWindow } from "./utils/totp";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const SECRET = process.env.INTERNAL_SECRET ?? "";

test.skip(
  !SECRET,
  "INTERNAL_SECRET ausente no ambiente do Playwright — o heartbeat simulado do agente do host não teria como autenticar.",
);

interface E2ECreds {
  password: string;
  users: Record<string, { id: string; email: string; role: string }>;
  admin_totp?: { factor_id: string; secret: string };
  dono_totp?: { factor_id: string; secret: string };
}

function loadCreds(): E2ECreds {
  const needsSeed = (): boolean => {
    if (!fs.existsSync(CREDS_PATH)) return true;
    const c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
    // `dono` entra na condição junto com `agent`: um `.e2e-creds.json` gerado
    // antes do quinto usuário existir passaria no teste antigo e faria o seed
    // seguinte estourar com "creds.users.dono ausente".
    return !c.users?.agent || !c.users?.dono || !c.admin_totp?.secret || !c.dono_totp?.secret;
  };
  if (needsSeed()) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  // Dono do servidor (platform_admins) + system_version/system_update_runs
  // limpos — idempotente, roda sempre pra deixar o teste repetível.
  execFileSync("npx", ["tsx", "scripts/seed-e2e-system-update.ts"], { stdio: "inherit" });
  return JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as E2ECreds;
}

// Só carrega/seeda de verdade quando o teste vai rodar — sem SECRET, o arquivo
// inteiro já pulou acima, e chamar isto seria trabalho (e risco de falha de
// banco) para um teste que nunca vai executar.
const creds: E2ECreds = SECRET ? loadCreds() : ({ password: "", users: {} } as E2ECreds);

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/app\//);
}

async function loginWithTotp(page: Page, email: string, secret: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /se connecter/i }).click();
  await page.waitForURL(/\/login\/mfa/);

  // Até 2 tentativas: um código pode expirar na borda da janela de 30s.
  for (let attempt = 0; attempt < 2; attempt++) {
    if (msUntilNextTotpWindow() < 3_000) {
      await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    }
    const code = generateTotp(secret);
    const firstDigit = page.locator('input[aria-label="Chiffre 1"]');
    await firstDigit.click();
    await page.keyboard.type(code, { delay: 40 });
    try {
      await page.waitForURL(/\/app\//, { timeout: 8_000 });
      return;
    } catch {
      // código rejeitado — espera a próxima janela e tenta de novo
      await page.waitForTimeout(msUntilNextTotpWindow() + 200);
    }
  }
  throw new Error("MFA challenge failed after 2 TOTP attempts");
}

interface HeartbeatResponse {
  data: { update_requested: boolean; run_id: string | null };
}

/** Simula um ciclo do `agent.sh` real: mesmo endpoint, mesmo bearer. */
async function heartbeat(
  request: APIRequestContext,
  opts: {
    latest_version: string;
    current_version?: string;
    changelog?: string;
    off_release?: boolean;
    compare_failed?: boolean;
    has_known_release?: boolean;
  },
): Promise<HeartbeatResponse> {
  const res = await request.post("/api/v1/system/agent", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: {
      kind: "heartbeat",
      current_version: opts.current_version ?? "1.0.0",
      current_sha: "abc1234",
      off_release: opts.off_release ?? false,
      latest_version: opts.latest_version,
      compare_failed: opts.compare_failed ?? false,
      has_known_release: opts.has_known_release ?? true,
      changelog: opts.changelog ?? "",
    },
  });
  expect(res.status()).toBe(200);
  return res.json();
}

/** Desfecho reportado pelo agente, como o `agent.sh` faz ao fim do update.sh. */
async function runResult(
  request: APIRequestContext,
  runId: string,
  status: "success" | "failed" | "failed_rolled_back",
  logTail = "",
): Promise<void> {
  const res = await request.post("/api/v1/system/agent", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { kind: "run_result", run_id: runId, status, log_tail: logTail },
  });
  expect(res.status()).toBe(200);
}

/** Passo concluído, como o `report()` do update.sh faz enquanto o app está de pé. */
async function runProgress(
  request: APIRequestContext,
  runId: string,
  step: "backup" | "codigo" | "banco",
): Promise<void> {
  const res = await request.post("/api/v1/system/agent", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { kind: "run_progress", run_id: runId, step },
  });
  expect(res.status()).toBe(200);
}

/** Volta o estado da instalação ao zero (sem run nenhum), como um seed. */
function resetEstado(): void {
  execFileSync("npx", ["tsx", "scripts/seed-e2e-system-update.ts"], { stdio: "inherit" });
}

test("le propriétaire voit la nouvelle version dans la barre latérale et met à jour depuis l’écran", async ({ page, request }) => {
  const changelog =
    "## [1.1.0] — 2026-08-02\n\n**⚠️ Requer atenção**\n\nReconecte o número depois.\n\n### Adicionado\n\n- Botão de atualizar pela tela.\n";

  await loginWithTotp(page, creds.users.dono!.email, creds.dono_totp!.secret);
  await heartbeat(request, { latest_version: "1.1.0", changelog });
  await page.goto("/app/inbox");

  const aviso = page.getByRole("link", { name: /nouvelle version/i });
  await expect(aviso).toBeVisible();
  await aviso.click();
  await page.waitForURL(/\/app\/settings\/atualizacao/);

  await expect(page.getByRole("heading", { name: /version 1\.1\.0 disponible/i })).toBeVisible();
  await expect(page.getByText(/Reconecte o número depois/)).toBeVisible();
  await expect(page.getByText(/Botão de atualizar pela tela/)).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/task9-1-tem-novidade.png" });

  // O bloco de atenção precisa vir ANTES do botão na ordem visual — medido
  // por ferramenta (boundingBox), nunca a olho: quem precisa agir à mão (ex.:
  // reconectar o número) tem que ver isso ANTES de clicar, não descobrir depois.
  const atencao = await page.getByText(/Reconecte o número depois/).boundingBox();
  const botao = await page.getByRole("button", { name: /mettre à jour maintenant/i }).boundingBox();
  expect(atencao).not.toBeNull();
  expect(botao).not.toBeNull();
  expect(atencao!.y).toBeLessThan(botao!.y);

  await page.getByRole("button", { name: /mettre à jour maintenant/i }).click();
  await expect(page.getByRole("heading", { name: /mise à jour vers la version 1\.1\.0/i })).toBeVisible();
  await expect(page.getByText(/Sauvegarde de vos données/)).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/task9-2-atualizando.png" });

  // O agente do host detecta o pedido no próximo heartbeat...
  const { data } = await heartbeat(request, { latest_version: "1.1.0" });
  expect(data.update_requested).toBe(true);
  expect(data.run_id).not.toBeNull();

  // ...executa (fora deste teste — é o `agent.sh`/`update.sh` reais, provados
  // na task 8) e reporta o desfecho.
  const runResult = await request.post("/api/v1/system/agent", {
    headers: { Authorization: `Bearer ${SECRET}` },
    data: { kind: "run_result", run_id: data.run_id, status: "success", log_tail: "ok" },
  });
  expect(runResult.status()).toBe(200);

  // Depois do sucesso, o agente reinicia e o próximo heartbeat já anuncia a
  // versão nova como a instalada — é o que a tela usa pra sair do estado
  // "atualizando" e mostrar "você está em dia".
  await heartbeat(request, { current_version: "1.1.0", latest_version: "1.1.0" });
  await page.reload();
  await expect(page.getByRole("heading", { name: /vous utilisez la version 1\.1\.0/i })).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/task9-3-em-dia.png" });
});

test("quand la mise à jour échoue, l’écran nomme la bonne version, montre le journal et propose une issue", async ({
  page,
  request,
}) => {
  // Duas falhas encadeadas num só percurso — é o mesmo dono, na mesma sessão,
  // vendo o pior dia da instalação dele.
  test.setTimeout(120_000);
  resetEstado();
  await heartbeat(request, { current_version: "1.0.0", latest_version: "1.1.0" });
  await loginWithTotp(page, creds.users.dono!.email, creds.dono_totp!.secret);
  await page.goto("/app/settings/atualizacao");
  await page.getByRole("button", { name: /mettre à jour maintenant/i }).click();
  await expect(page.getByRole("heading", { name: /mise à jour vers la version 1\.1\.0/i })).toBeVisible();

  // ── Falha COM rollback ─────────────────────────────────────────────────────
  const primeiro = await heartbeat(request, { latest_version: "1.1.0" });
  await runProgress(request, primeiro.data.run_id!, "banco");
  await runResult(
    request,
    primeiro.data.run_id!,
    "failed_rolled_back",
    "▶ Vérification du retour en ligne de l’app\n⚠ Mise à jour faite, mais l’app n’a pas répondu 'ok'.",
  );
  // O host reporta o `git describe` DEPOIS do checkout: para ele, a versão
  // instalada é a 1.1.0 — a que acabou de quebrar. É esta mentira que a tela
  // repetia ("Voltei para a versão anterior (1.1.0)") e que o run desfaz.
  await heartbeat(request, { current_version: "1.1.0", latest_version: "1.1.0" });
  await page.reload();

  await expect(
    page.getByRole("heading", { name: /la mise à jour vers la version 1\.1\.0 a échoué/i }),
  ).toBeVisible();
  await expect(page.getByText(/Le système a été restauré vers la version 1\.0\.0/)).toBeVisible();

  // O log só existe se der pra ler: recolhido, mas presente e abrível.
  const detalhes = page.getByText(/Détails techniques/);
  await expect(detalhes).toBeVisible();
  await expect(page.getByText(/l’app n’a pas répondu 'ok'/)).toBeHidden();
  await detalhes.click();
  await expect(page.getByText(/l’app n’a pas répondu 'ok'/)).toBeVisible();

  // O aviso da sidebar só acende porque o app sabe que está rodando a 1.0.0 —
  // se ele tivesse acreditado no "1.1.0" que o host reportou, `update_available`
  // seria falso e o rodapé mostraria "versão 1.1.0" como instalada, que é
  // justamente a versão que quebrou.
  await expect(page.getByRole("link", { name: /nouvelle version/i })).toBeVisible();

  // Saída garantida: o botão NÃO aparece (um novo pedido faria o servidor
  // responder "já estou na 1.1.0" e reportar sucesso sem trocar imagem
  // nenhuma) — quem resolve ali é o comando com --force, sempre presente.
  await expect(page.getByRole("button", { name: /mettre à jour maintenant/i })).toHaveCount(0);
  // E o comando leva de volta para a versão que FUNCIONAVA — reinstalar a 1.1.0,
  // que acabou de quebrar, não é saída nenhuma se o problema for a release.
  await expect(
    page.getByText("bash hostgator-setup-kit/update.sh --to v1.0.0 --force"),
  ).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/final-1-falha-com-rollback.png" });

  // ── Falha SEM rollback: a tela não pode prometer que voltou ────────────────
  resetEstado();
  await heartbeat(request, { current_version: "1.1.0", latest_version: "1.2.0" });
  await page.reload();
  await page.getByRole("button", { name: /mettre à jour maintenant/i }).click();
  await expect(page.getByRole("heading", { name: /mise à jour vers la version 1\.2\.0/i })).toBeVisible();

  const segundo = await heartbeat(request, { current_version: "1.1.0", latest_version: "1.2.0" });
  expect(segundo.data.update_requested).toBe(true);
  await runProgress(request, segundo.data.run_id!, "banco");
  await runResult(request, segundo.data.run_id!, "failed", "✖ le retour arrière n’a pas été possible");
  await heartbeat(request, { current_version: "1.2.0", latest_version: "1.2.0" });
  await page.reload();

  await expect(
    page.getByRole("heading", { name: /la mise à jour vers la version 1\.2\.0 a échoué/i }),
  ).toBeVisible();
  await expect(page.getByText(/je n’ai pas réussi/i)).toBeVisible();
  await expect(page.getByText(/Le système a été restauré vers la version/)).toHaveCount(0);
  await expect(
    page.getByText("bash hostgator-setup-kit/update.sh --to v1.1.0 --force"),
  ).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/final-2-falha-sem-rollback.png" });

  // ── Sem nenhum passo reportado, a saída NÃO pode sumir ────────────────────
  // `run_progress` não tem retry e engole falha; `run_result` insiste por ~2
  // min. Uma atualização que mexeu em tudo e quebrou no fim chega aqui com
  // `last_step` nulo sempre que os POSTs de progresso não passaram — foi por
  // ler esse nulo como "o host recusou, nada mudou" que a tela ficou sem
  // comando nenhum justamente no pior estado possível.
  resetEstado();
  await heartbeat(request, { current_version: "1.1.0", latest_version: "1.2.0" });
  await page.reload();
  await page.getByRole("button", { name: /mettre à jour maintenant/i }).click();
  // Espera a tela confirmar o pedido antes de bater o heartbeat: sem isso, o
  // agente simulado corre com o POST do clique e não acha run nenhum.
  await expect(page.getByRole("heading", { name: /mise à jour vers la version 1\.2\.0/i })).toBeVisible();
  const terceiro = await heartbeat(request, { current_version: "1.1.0", latest_version: "1.2.0" });
  await runResult(
    request,
    terceiro.data.run_id!,
    "failed",
    "✖ La version v1.2.0 est ANTÉRIEURE à celle déjà installée sur ce serveur.",
  );
  await page.reload();

  await expect(
    page.getByRole("heading", { name: /la mise à jour vers la version 1\.2\.0 a échoué/i }),
  ).toBeVisible();
  await expect(
    page.getByText("bash hostgator-setup-kit/update.sh --to v1.1.0 --force"),
  ).toBeVisible();
  await page.getByText(/Détails techniques/).click();
  await expect(page.getByText(/est ANTÉRIEURE à celle déjà installée/)).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/final-4-sem-passo-reportado.png" });
});

test("quand l’hôte n’a pas pu comparer, l’écran ne dit pas que tout est à jour", async ({
  page,
  request,
}) => {
  // Instalação numa tag (off_release falso) cujo host não conseguiu completar a
  // história para comparar. Sem o sinal explícito, `latest_version` vazio virava
  // "Você está na versão 0.9.0 — É a mais recente", e uma instalação atrasada
  // ficaria para sempre sem saber que existe correção de segurança esperando.
  resetEstado();
  await heartbeat(request, {
    current_version: "0.9.0",
    latest_version: "",
    off_release: false,
    compare_failed: true,
  });
  await loginWithTotp(page, creds.users.dono!.email, creds.dono_totp!.secret);
  await page.goto("/app/settings/atualizacao");

  await expect(page.getByRole("heading", { name: /impossible de vérifier s’il existe une nouvelle version/i })).toBeVisible();
  await expect(page.getByText(/la version la plus récente/i)).toHaveCount(0);
  await expect(page.getByText(/cela signifie que je ne sais pas/i)).toBeVisible();
  await expect(page.getByText("bash hostgator-setup-kit/update.sh")).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/final-5-nao-consegui-checar.png" });
});

test("une installation en avance sur la version publiée ne donne ni écran cassé ni alarme", async ({
  page,
  request,
}) => {
  // `off_release` com `latest_version` vazio: o agente não anuncia uma tag que
  // já está contida no HEAD (instalá-la seria retroceder) nem uma que ele não
  // consegue comparar. Não é defeito — e a tela não pode tratar como se fosse.
  resetEstado();
  await heartbeat(request, { current_version: "abc1234", latest_version: "", off_release: true });
  await loginWithTotp(page, creds.users.dono!.email, creds.dono_totp!.secret);

  await page.goto("/app/inbox");
  await expect(page.getByRole("link", { name: /nouvelle version/i })).toHaveCount(0);
  await expect(page.getByText("version abc1234")).toBeVisible();

  await page.goto("/app/settings/atualizacao");
  await expect(
    page.getByRole("heading", { name: /vous utilisez une version plus récente que la version publiée/i }),
  ).toBeVisible();
  await expect(page.getByText(/aucune mise à jour n’est donc nécessaire/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /mettre à jour maintenant/i })).toHaveCount(0);
  await expect(page.getByText("bash hostgator-setup-kit/update.sh")).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/final-3-a-frente-da-publicada.png" });
});

test("un fork sans aucune release publiée n’affirme pas « en avance » sans base", async ({ page, request }) => {
  // Mesma combinação bruta do teste anterior (off_release=true, latest_version
  // vazio, compare_failed=false) — a diferença é `has_known_release: false`:
  // o agente NUNCA viu nenhuma tag `v*` neste repositório (fork sem releases),
  // então "à frente da publicada" seria afirmar a existência de algo que não
  // existe. Achado real da revisão: a tela dizia isso mesmo sem base nenhuma.
  resetEstado();
  await heartbeat(request, {
    current_version: "abc1234",
    latest_version: "",
    off_release: true,
    has_known_release: false,
  });
  await loginWithTotp(page, creds.users.dono!.email, creds.dono_totp!.secret);

  await page.goto("/app/settings/atualizacao");
  await expect(
    page.getByRole("heading", { name: /aucune version n’est encore publiée/i }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /plus récente que la version publiée/i })).toHaveCount(0);
  await expect(page.getByText(/aucune mise à jour n’est nécessaire pour le moment/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /mettre à jour maintenant/i })).toHaveCount(0);
  await expect(page.getByText("bash hostgator-setup-kit/update.sh")).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/minors-1-sem-release-publicada.png" });
});

test("qui n’est pas propriétaire du serveur ne voit pas le bouton", async ({ page, request }) => {
  // Update disponível de verdade nesse instante — a ausência do aviso tem que
  // vir da falta de is_platform_admin, não de coincidentemente já estar em dia.
  await heartbeat(request, { current_version: "1.0.0", latest_version: "1.1.0" });

  await login(page, creds.users.agent!.email);
  await page.goto("/app/inbox");
  await expect(page.getByRole("link", { name: /nouvelle version/i })).toHaveCount(0);

  await page.goto("/app/settings/atualizacao");
  await expect(page.getByText(/404 — Page introuvable/i)).toBeVisible();
  await page.screenshot({ path: ".superpowers/evidence/task9-4-nao-dono-404.png" });
});
