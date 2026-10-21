/**
 * O WIZARD, PELA TELA, DENTRO DO CI.
 *
 * A jornada de instalação fresca é a P0 da doutrina de QA deste projeto — é o
 * produto que se vende — e é a ÚNICA spec fora do gate, porque depende de WAHA,
 * Redis, Resend e Nuvemshop. O resultado é que o onboarding pôde apodrecer sem
 * nada ficar vermelho: foi assim que oito premissas mortas chegaram até aqui.
 *
 * Esta spec cobre o que dá para cobrir sem esses serviços — que é quase tudo:
 * o wizard inteiro, do login ao "Começar a usar". Fica de fora só o ensaio com
 * resposta de verdade, que precisa de chave de IA com saldo.
 *
 * ISOLAMENTO: cria a PRÓPRIA organização, com o próprio dono. O seed do CI
 * entrega a organização compartilhada já onboardada, e zerar o estado dela para
 * testar o wizard mandaria todas as specs seguintes para dentro do onboarding.
 */
import { randomUUID } from "node:crypto";

import { test, expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const svc = createClient(
  process.env.NEON_DATA_API_URL!,
  process.env.NEON_SERVICE_ROLE_JWT!,
  { auth: { persistSession: false } },
);

const SENHA = "WizardQa!2026#Deskcomm";
const email = `wizard-${randomUUID().slice(0, 8)}@qa.local`;

let userId = "";
let orgId = "";

/**
 * O estado que o `install.sh` deixa: dono criado, organização com o nome
 * placeholder, provedor de IA escolhido no terminal, e `onboarded_at` nulo.
 */
test.beforeAll(async () => {
  const { data: criado, error: errUser } = await svc.auth.admin.createUser({
    email,
    password: SENHA,
    email_confirm: true,
  });
  if (errUser || !criado.user) throw errUser ?? new Error("sem usuário");
  userId = criado.user.id;

  const { data: org, error: errOrg } = await svc
    .from("organizations")
    .insert({
      slug: `minha-empresa-${randomUUID().slice(0, 8)}`,
      display_name: "Mon entreprise",
      legal_name: "Mon entreprise",
      status: "active",
      created_by: userId,
      settings: { llm: { provider: "anthropic" } },
    })
    .select("id")
    .single();
  if (errOrg || !org) throw errOrg ?? new Error("sem org");
  orgId = org.id as string;

  await svc.from("user_organizations").insert({
    organization_id: orgId,
    user_id: userId,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
});

test.afterAll(async () => {
  if (orgId) {
    await svc.from("ai_agent_runs").delete().eq("organization_id", orgId);
    await svc.from("ai_agent_versions").delete().eq("organization_id", orgId);
    await svc.from("ai_agents").delete().eq("organization_id", orgId);
    await svc.from("org_memory_pointers").delete().eq("organization_id", orgId);
    await svc.from("org_memory_versions").delete().eq("organization_id", orgId);
    await svc.from("crm_stages").delete().eq("organization_id", orgId);
    await svc.from("crm_pipelines").delete().eq("organization_id", orgId);
    await svc.from("user_organizations").delete().eq("organization_id", orgId);
  }
  if (userId) await svc.auth.admin.deleteUser(userId);
});

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(SENHA);
  await page.getByRole("button", { name: /se connecter/i }).click();
}

test.describe.configure({ mode: "serial", timeout: 120_000 });

test.describe("l’assistant de démarrage construit un employé", () => {
  test("s’ouvre en montrant ce que l’installation a déjà apporté, sans redemander le nom", async ({
    page,
  }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 30_000 });

    // O passo 1 começa pelo que já existe — em vez de um formulário em branco.
    await expect(page.getByText(/déjà en place/i)).toBeVisible();

    // O instalador nunca pergunta o nome do negócio: a organização nasce
    // "Minha Empresa". Mandar isso como valor inicial obrigava a pessoa a
    // apagá-lo, e quem não percebia ficava com o placeholder para sempre.
    await expect(page.locator("#display_name")).toHaveValue("");
  });

  test("l’acceptation des conditions mène à des documents qui EXISTENT", async ({ page }) => {
    // O checkbox é obrigatório e linkava duas páginas que respondiam 404.
    for (const href of ["/legal/terms", "/legal/privacy"]) {
      const res = await page.request.get(href);
      expect(res.status(), href).toBe(200);
    }
  });

  test("le nom de l’entreprise arrive dans l’en-tête de l’étape suivante", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/welcome/, { timeout: 30_000 });

    await page.locator("#display_name").fill("Clinique Bien Vivre");
    await page.locator('input[type="checkbox"]').check();
    await page.getByRole("button", { name: /^continuer$/i }).click();
    await page.waitForURL(/\/onboarding\/connect-whatsapp/, { timeout: 30_000 });

    // O layout do wizard é compartilhado entre os passos e não re-renderizava:
    // o cabeçalho seguia dizendo "Minha Empresa" o onboarding inteiro, mesmo
    // com o banco já gravado.
    // `.first()`: há dois <header> na página — o do wizard (com a marca e o
    // nome do negócio) e o do passo. O do layout é o que congelava.
    const cabecalho = page.locator("header").first();
    await expect(cabecalho).toContainText("Clinique Bien Vivre");
    await expect(cabecalho).not.toContainText("Mon entreprise");
  });

  test("l’étape du téléphone demande COMMENT se connecter avant de supposer le code", async ({
    page,
  }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/connect-whatsapp/, { timeout: 30_000 });

    // As três formas que o produto realmente suporta — as mesmas da tela de
    // Conexões. Antes, o wizard oferecia uma e nem perguntava: a sessão do
    // canal por código subia sozinha na montagem da tela.
    await expect(page.getByTestId("forma-qr")).toBeVisible();
    await expect(page.getByTestId("forma-oficial")).toBeVisible();
    await expect(page.getByTestId("forma-parceiro")).toBeVisible();

    // Nenhuma escolha feita: o código não pode estar na tela ainda.
    await expect(page.locator('img[src*="/whatsapp/qr"]')).toHaveCount(0);

    // A cópia visível fala a língua de quem vende, nunca a do transporte.
    const corpo = page.locator("body");
    await expect(corpo).not.toContainText(/provider/i);
    await expect(corpo).not.toContainText(/channel_session/i);

    // Escolher a conta oficial leva ao formulário dela, e dá para voltar —
    // escolher errado não pode ser uma porta que tranca.
    await page.getByTestId("forma-oficial").locator("input").click();
    await expect(page.getByTestId("canal-oficial-root")).toBeVisible({ timeout: 15_000 });
    await page.getByTestId("voltar-para-escolha").click();
    await expect(page.getByTestId("forma-qr")).toBeVisible();

    // NÃO avança: a spec é serial e o caso seguinte começa neste mesmo passo.
    // A escolha vive em memória e não é gravada, então voltar aqui não deixa
    // rastro — se deixasse, o passo já contaria como cumprido.
  });

  test("l’étape du téléphone n’expose ni identifiant interne ni enum", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/connect-whatsapp/, { timeout: 30_000 });

    const corpo = page.locator("body");
    // Mostrava "Sessão: org_f3d61bc0" e "Status: INIT".
    await expect(corpo).not.toContainText(/Session :/i);
    await expect(corpo).not.toContainText(/Status:\s*(INIT|STARTING|SCAN_QR_CODE|WORKING)/);
    // E nunca mais manda rodar Docker nem aponta para um menu que não existe.
    await expect(corpo).not.toContainText(/docker compose/i);
    await expect(corpo).not.toContainText(/Paramètres → Canaux/i);

    await page.getByRole("button", { name: /ignorer pour le moment/i }).click();
    await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 30_000 });
  });

  test("former ne demande ni clé ni fournisseur, et ne nomme aucun modèle", async ({ page }) => {
    // A IA é da plataforma: quem instala não escolhe provedor, não cola chave e
    // não vê nome de modelo. O passo antigo virava formulário de chave quando
    // faltava uma — hoje esse bloco não pode mais aparecer, em nenhum mundo
    // (com ou sem DEEPSEEK_API_KEY no servidor sob teste).
    await login(page);
    await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 30_000 });
    await expect(page.getByRole("heading", { name: /formez votre assistant/i })).toBeVisible();

    await expect(page.locator("#api_key_da_ia")).toHaveCount(0);
    await expect(page.locator("#provedor_da_ia")).toHaveCount(0);

    const texto = await page.locator("main, body").first().innerText();
    expect(
      texto,
      "o passo de treinar não pode nomear provedor nem modelo de IA",
    ).not.toMatch(/\b(anthropic|openai|openrouter|deepseek|claude|gpt-?\d|sonnet|haiku)\b/i);
  });

  test("former : demande les règles de la maison et montre ce qu’il sait déjà faire", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/setup-ai/, { timeout: 30_000 });

    await expect(page.getByRole("heading", { name: /formez votre assistant/i })).toBeVisible();
    // As duas listas que não pedem configuração nenhuma.
    await expect(page.getByText(/ce qu’il sait déjà faire/i)).toBeVisible();
    await expect(page.getByText(/ce qu’il ne fera jamais/i)).toBeVisible();

    await page.locator("#name").fill("Bia");
    await page.locator("#regras_da_casa").fill("Horaires : 8h à 18h. Ne promettez jamais de remise.");
    await page.getByRole("button", { name: /créer et continuer/i }).click();

    // ⚠️ DOIS DESFECHOS LEGÍTIMOS, e o teste tem de aceitar os dois — foi aqui
    // que ele reprovou no CI depois de passar em toda máquina com chave.
    //
    // COM chave (a máquina de quem desenvolve, onde `next start` carrega o
    // `.env.local`): o agente é publicado e o wizard avança para o quadro. O
    // passo novo não pode ser pulado no caminho de sucesso — era o que o destino
    // fixo da action fazia, e é o que esta asserção guarda.
    //
    // SEM chave (o CI, e toda instalação que ainda não configurou provedor): o
    // atendente é criado como RASCUNHO e o wizard PARA para dizer isso. Avançar
    // calado deixaria a pessoa achar que o funcionário está no ar. O que se
    // cobra aqui é que a tela explique E ofereça saída — sem o botão, o passo
    // vira um beco, que foi o defeito que esta reprovação revelou.
    const avancou = await page
      .waitForURL(/\/onboarding\/funil/, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);

    if (!avancou) {
      // O que se cobra NÃO é qual causa impediu a publicação — são três (sem
      // canal, sem modelo no catálogo, sem chave) e a instalação decide qual
      // aparece. O que vale para todas: o passo não avança calado, diz que o
      // atendente ficou RASCUNHO, e oferece seguir. Amarrar a asserção a uma
      // frase de causa faria o teste reprovar quando a instalação tivesse a
      // outra — sobre uma tela igualmente correta.
      await expect(page.getByRole("alert").first()).toContainText(/brouillon/i);
      await page.getByRole("button", { name: /continuer sans publier/i }).click();
      await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });
    }
  });

  test("le tableau arrive monté, qu’il vienne de l’IA ou d’un modèle prêt à l’emploi", async ({ page }) => {
    // ⚠️ ESTE CASO VALE NOS DOIS MUNDOS, DE PROPÓSITO. No CI não há chave de
    // provedor nenhum e a sugestão cai no quadro pronto; na máquina de quem
    // desenvolve, `next start` carrega o `.env.local` sozinho e a chave real
    // chega ao servidor sob teste — então a MESMA spec via a IA responder aqui e
    // o pacote no CI. Fixar uma das duas origens faria o gate vermelhar conforme
    // a máquina, que é o pior tipo de teste: o que ensina a ignorá-lo.
    //
    // O que NÃO varia é o que este passo promete: a pessoa nunca fica sem
    // quadro, e a tela diz de onde ele veio.
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });

    const corpo = page.locator("body");
    await expect(
      corpo,
      "a tela precisa dizer se a sugestão veio da IA ou de um modelo pronto",
    ).toContainText(/a construit ce tableau|impossible de demander une suggestion/i);

    // O quadro está lá, montado, com o destino de cada coluna visível — que é a
    // metade invisível do defeito: medido, 312 etapas no banco e 4 com destino,
    // o que deixa o assistente incapaz de mover um card.
    const colunas = page.locator('input[aria-label^="Nom de la colonne"]');
    expect(await colunas.count()).toBeGreaterThanOrEqual(4);
    await expect(corpo).toContainText(/Le client arrive ici quand l’affaire est conclue/i);
    await expect(corpo).toContainText(/Le client arrive ici quand l’affaire n’a pas abouti/i);

    // As colunas de desfecho não podem ser removidas: sem elas o banco recusa o
    // quadro inteiro, e descobrir isso no clique de salvar seria pior.
    await expect(page.getByText("obligatoire").first()).toBeVisible();

    // E o que a instalação trouxe fica à vista, para a troca não parecer mágica.
    await expect(corpo).toContainText(/Panier abandonné/);
  });

  test("on peut passer à un modèle prêt à l’emploi sans dépendre d’aucune IA", async ({ page }) => {
    // O caminho determinístico do plano B, que não depende de haver chave: é o
    // que sobra para quem instalou e ainda não configurou provedor — e para
    // quem simplesmente não gostou da sugestão.
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });

    await page.getByRole("button", { name: /modèle prêt à l’emploi/i }).click();
    await page.getByRole("button", { name: /clinique, cabinet ou salon/i }).click();

    await expect(page.locator("#nome_do_quadro")).toHaveValue("Rendez-vous");
    await expect(page.locator('input[aria-label="Nom de la colonne 1"]')).toHaveValue("Nouveau contact");
  });

  test("une colonne sans nom bloque l’enregistrement, au lieu de disparaître en silence", async ({ page }) => {
    // `normalizarProposta` DESCARTA nome vazio. Sem esta trava, a pessoa
    // acrescenta uma coluna, esquece de nomeá-la, salva, avança — e a coluna
    // simplesmente não existe.
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });

    // Abre espaço primeiro. O teto de colunas é real e o botão desabilita nele:
    // localmente a sugestão da IA às vezes já chega com as 8, e um teste que
    // assumisse espaço livre vermelharia conforme a resposta do modelo. Remover
    // antes de acrescentar também é o que o dono faz — tira o que não serve e
    // põe o que falta.
    await page.getByRole("button", { name: /^supprimer la colonne/i }).last().click();
    await page.getByRole("button", { name: /ajouter une colonne/i }).click();
    await expect(page.getByText(/donnez un nom à la colonne vide/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /utiliser ce tableau/i })).toBeDisabled();

    // Nomeada, o caminho destrava.
    await page.locator('input[aria-label^="Nom de la colonne"]').last().fill("Confirmation de la veille");
  });

  test("enregistrer remplace le tableau e-commerce et ENSEIGNE la destination de chaque colonne", async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/funil/, { timeout: 30_000 });
    await page.getByRole("button", { name: /utiliser ce tableau/i }).click();
    await page.waitForURL(/\/onboarding\/testar/, { timeout: 30_000 });

    const { data: funil } = await svc
      .from("crm_pipelines")
      .select("id, name")
      .eq("organization_id", orgId)
      .eq("is_default", true)
      .maybeSingle();

    const { data: etapas } = await svc
      .from("crm_stages")
      .select("name, agent_stage_hint, is_won, is_lost")
      .eq("pipeline_id", funil!.id)
      .order("position");

    const nomes = (etapas ?? []).map((e) => String(e.name));
    // O quadro que o gatilho semeia em TODA organização, num produto que se
    // vende como multi-nicho: a clínica abria o quadro dela e lia isto.
    expect(nomes).not.toContain("Panier abandonné");
    expect(nomes).not.toContain("En préparation");
    expect(String(funil!.name)).not.toBe("Commandes");

    // A metade invisível: sem destino, o funcionário tem o funil no escopo e
    // não sabe o que significa nenhuma coluna.
    const comDestino = (etapas ?? []).filter((e) => e.agent_stage_hint !== null);
    expect(comDestino.length).toBeGreaterThanOrEqual(5);
    // Uma de ganho e uma de perda, e o destino delas COERENTE com a marcação —
    // é o que o CHECK `crm_stages_hint_coerente_com_won_lost` cobra.
    expect((etapas ?? []).filter((e) => e.is_won)).toHaveLength(1);
    expect((etapas ?? []).filter((e) => e.is_lost)).toHaveLength(1);
    for (const e of etapas ?? []) {
      expect(e.is_won, String(e.name)).toBe(e.agent_stage_hint === "won");
      expect(e.is_lost, String(e.name)).toBe(e.agent_stage_hint === "lost");
    }
  });

  test("les règles de la maison deviennent la mémoire de l’organisation, pas le prompt de l’agent", async () => {
    const { data: mem } = await svc
      .from("org_memory_versions")
      .select("content")
      .eq("organization_id", orgId)
      .limit(1)
      .maybeSingle();
    // A MEMÓRIA É GRAVADA EM QUALQUER DESFECHO, e é o ponto principal: ela vale
    // para a organização, não para este agente, então nasce mesmo quando a
    // publicação não acontece. Se dependesse da chave, quem instalou sem
    // provedor perderia o que escreveu.
    expect(mem?.content).toContain("Ne promettez jamais de remise");

    // O agente EXISTE sempre; o que depende da chave é a VERSÃO publicada.
    const { data: agente } = await svc
      .from("ai_agents")
      .select("kind, system_prompt")
      .eq("organization_id", orgId)
      .limit(1)
      .maybeSingle();
    expect(agente?.kind, "nasce no formato atual, não no rag_bot legado").toBe("mcp_agent");
    // As regras não entram no prompt DELE: a segunda contratação nasceria sem elas.
    expect(agente?.system_prompt).not.toContain("Ne promettez jamais de remise");

    const { data: versao } = await svc
      .from("ai_agent_versions")
      .select("system_prompt, provider, tool_ids, pipeline_ids")
      .eq("organization_id", orgId)
      .limit(1)
      .maybeSingle();

    if (!versao) {
      // Sem chave de IA (o caso do CI e de toda instalação que ainda não
      // configurou provedor) a versão NÃO é criada de propósito: publicar
      // apontando para uma chave inexistente entregaria um funcionário "no ar"
      // que erra em toda mensagem. Ausência aqui é a decisão certa, não falha.
      return;
    }

    expect(versao.system_prompt).not.toContain("Ne promettez jamais de remise");
    // Publicou: então nasceu podendo mexer no CRM, com o provedor da plataforma
    // (DeepSeek quando o servidor tem a chave; senão o da instalação).
    expect(versao.provider).toMatch(/^(deepseek|anthropic)$/);
    expect((versao.tool_ids as string[])?.length ?? 0).toBeGreaterThan(0);
  });

  test("l’assistant de démarrage se termine en présentant le système, et le résumé ne signale pas d’étape inexistante", async ({
    page,
  }) => {
    await login(page);
    await page.waitForURL(/\/onboarding\/testar/, { timeout: 30_000 });
    await page.getByRole("button", { name: /^continuer$/i }).click();

    await page.waitForURL(/\/onboarding\/invite-team/, { timeout: 30_000 });
    await page.getByRole("button", { name: /ignorer pour le moment/i }).click();
    await page.waitForURL(/\/onboarding\/done/, { timeout: 30_000 });

    // O tour: as peças apresentadas pelo que fazem.
    await expect(page.getByText(/que trouve-t-on d’autre ici/i)).toBeVisible();
    await expect(page.getByText(/relancer ceux qui ont disparu/i)).toBeVisible();

    // A integração de loja vem desligada: o passo não existe nesta instalação,
    // e o resumo listava "Loja Nuvemshop (pulado)" — acusando a pessoa de não
    // fazer o que ninguém lhe ofereceu.
    await expect(page.locator("body")).not.toContainText(/Nuvemshop/i);

    await page.getByRole("button", { name: /commencer à utiliser/i }).click();
    await page.waitForURL(/\/app\//, { timeout: 30_000 });

    const { data: org } = await svc
      .from("organizations")
      .select("onboarded_at, display_name")
      .eq("id", orgId)
      .maybeSingle();
    expect(org?.onboarded_at).toBeTruthy();
    expect(org?.display_name).toBe("Clinique Bien Vivre");
  });
});
