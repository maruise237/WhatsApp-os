/**
 * E2E — jornada completa de recuperação de senha (usuário real, browser real):
 *
 * 1. conta existente (seed via GoTrue admin API + provisionamento direto)
 * 2. /login → "Esqueci minha senha" → pede o link
 * 3. abre o e-mail (Mailpit) e clica no link → /login/reset
 * 4. define a senha nova → volta ao login com banner de sucesso
 * 5. prova: senha ANTIGA falha, senha NOVA entra
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

import {
  waitForEmail,
  extractAuthConfirmLink,
  uniqueEmail,
  loadEnvLocal,
} from "./helpers/auth";

const email = uniqueEmail("recovery");
const oldPassword = "SenhaAntiga!123";
const newPassword = "SenhaNova!456";

test.beforeAll(async () => {
  const envLocal = loadEnvLocal();
  const url = process.env.NEON_DATA_API_URL ?? envLocal.NEON_DATA_API_URL;
  const serviceKey =
    process.env.NEON_SERVICE_ROLE_JWT ?? envLocal.NEON_SERVICE_ROLE_JWT;
  if (!url || !serviceKey) throw new Error("NEON_DATA_API_URL/SERVICE_ROLE_KEY ausentes (.env.local)");

  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: oldPassword,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`seed createUser: ${error?.message}`);

  const slug = `e2e-recovery-${Date.now()}`;
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .insert({
      slug,
      display_name: "Boutique E2E Recovery",
      legal_name: "Boutique E2E Recovery",
      status: "active",
      created_by: data.user.id,
    })
    .select("id")
    .single();
  if (orgError || !org) throw new Error(`seed org: ${orgError?.message}`);

  const { error: memberError } = await admin.from("user_organizations").insert({
    user_id: data.user.id,
    organization_id: org.id,
    role: "admin",
    accepted_at: new Date().toISOString(),
  });
  if (memberError) throw new Error(`seed membership: ${memberError.message}`);
});

test("récupérer le mot de passe : forgot → e-mail → nouveau mot de passe → connexion avec le nouveau", async ({
  page,
  baseURL,
}) => {
  test.setTimeout(120_000);

  // 2. Login → link "Esqueci minha senha"
  await page.goto("/login");
  await page.getByRole("link", { name: "Mot de passe oublié" }).click();
  await expect(page).toHaveURL(/\/login\/forgot$/);
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Envoyer le lien de réinitialisation" }).click();
  await expect(page.getByText("Vérifiez votre e-mail")).toBeVisible();

  // 3. Abre o e-mail real e segue o link de recovery
  const html = await waitForEmail(email, "Redefinir senha");
  const link = extractAuthConfirmLink(html, baseURL!);
  await page.goto(link);
  await expect(page).toHaveURL(/\/login\/reset/);

  // 4. Define a senha nova
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirmer le nouveau mot de passe").fill(newPassword);
  await page.getByRole("button", { name: "Définir le nouveau mot de passe" }).click();
  await expect(page).toHaveURL(/\/login\?reset=success/);
  await expect(page.getByText("Mot de passe réinitialisé avec succès")).toBeVisible();

  // 5a. Senha ANTIGA tem que falhar
  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Mot de passe").fill(oldPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();

  // 5b. Senha NOVA entra
  await page.getByLabel("Mot de passe").fill(newPassword);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL(/\/(app|onboarding)\//, { timeout: 30_000 });
  await expect(page).not.toHaveURL(/\/login/);
});
