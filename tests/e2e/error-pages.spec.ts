import { test, expect } from "@playwright/test";

test.describe("error pages", () => {
  test("/404 affiche le texte en français", async ({ page }) => {
    const res = await page.goto("/404");
    // Next renders the not-found.tsx component; status may be 404 or 200 depending on routing.
    expect([200, 404]).toContain(res?.status() ?? 0);
    await expect(page.getByText(/page introuvable/i)).toBeVisible();
  });

  test("/403 affiche accès refusé", async ({ page }) => {
    await page.goto("/403");
    await expect(page.getByText(/accès refusé/i)).toBeVisible();
  });

  test("/500 affiche erreur interne", async ({ page }) => {
    await page.goto("/500");
    await expect(page.getByText(/erreur interne/i)).toBeVisible();
  });

  test("/503 affiche maintenance", async ({ page }) => {
    await page.goto("/503");
    await expect(page.getByText(/en maintenance/i)).toBeVisible();
  });
});

/**
 * Os documentos legais moram aqui, e não numa spec nova, por dois motivos: esta
 * já navega deslogada (que é a condição sob teste) e já está declarada no
 * workflow — spec nova sem entrada em `.github/workflows/e2e.yml` reprova
 * `tests/unit/e2e-cobertura-completa.test.ts` no check obrigatório.
 *
 * O que se prova: o checkbox de aceite da PRIMEIRA tela do produto linka estes
 * dois endereços, e eles respondiam 404. Um aceite obrigatório apontando para o
 * vazio é o pior defeito de confiança que uma instalação nova pode ter.
 */
test.describe("documents légaux", () => {
  test("/legal/terms s’ouvre SANS session — c’est le lien de l’acceptation de l’onboarding", async ({ page }) => {
    const res = await page.goto("/legal/terms");
    expect(res?.status()).toBe(200);
    // E não é o login disfarçado: o proxy manda anônimo para /login?next=...
    expect(new URL(page.url()).pathname).toBe("/legal/terms");
    await expect(page.getByRole("heading", { name: /conditions d’utilisation/i })).toBeVisible();
  });

  test("/legal/privacy s’ouvre SANS session et nomme le responsable", async ({ page }) => {
    const res = await page.goto("/legal/privacy");
    expect(res?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe("/legal/privacy");
    await expect(page.getByRole("heading", { name: /politique de confidentialité/i })).toBeVisible();
    // Sem sessão não dá para saber a razão social, mas o documento não pode
    // fingir que quem responde pelos dados é o projeto de software.
    await expect(page.getByText(/exploitant de cette installation/i).first()).toBeVisible();
  });

  test("le voisin de /legal reste fermé — l’ouverture vaut pour les deux, pas pour le préfixe", async ({
    page,
  }) => {
    await page.goto("/legal/qualquer-outra");
    await expect(page).toHaveURL(/\/login/);
  });
});
