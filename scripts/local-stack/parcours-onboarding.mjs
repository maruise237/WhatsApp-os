/**
 * Onboarding d'une NOUVELLE vendeuse, PAR L'ÉCRAN, en mobile (390 × 844).
 *
 * Prérequis : pile locale (up.sh), app lancée, un compte dont l'organisation
 * n'a pas encore fait l'onboarding (voir README). Une capture par écran.
 *
 *   node scripts/local-stack/parcours-onboarding.mjs <dossier> [email]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const out = process.argv[2] ?? ".superpowers/evidence/onboarding";
const EMAIL = process.argv[3] ?? "fatou@pagne-dakar.sn";
mkdirSync(out, { recursive: true });
const BASE = process.env.APP_URL ?? "http://localhost:3000";

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fr-FR",
});
const page = await context.newPage();
const erreurs = [];
page.on("pageerror", (e) => erreurs.push(e.message));
page.on("dialog", (d) => d.accept());

let n = 0;
async function capture(titre) {
  n += 1;
  const nom = `${String(n).padStart(2, "0")}-${titre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(out, `${nom}.png`), fullPage: true });
  // Ce que le téléphone montre vraiment (en-tête et barre d'actions collés compris).
  await page.screenshot({ path: path.join(out, `${nom}-ecran.png`) });
  process.stdout.write(`✓ ${n}. ${titre}  (${new URL(page.url()).pathname})\n`);
}
async function etat() {
  return page.evaluate(() => ({
    h: [...document.querySelectorAll("h1,h2")].map((e) => e.textContent.trim()).slice(0, 4),
    boutons: [...document.querySelectorAll("button,a[href]")].map((e) => (e.textContent || e.getAttribute("aria-label") || "").trim()).filter(Boolean).slice(0, 25),
  }));
}

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.getByLabel(/e-?mail/i).first().fill(EMAIL);
await page.getByLabel(/mot de passe/i).first().fill("Vente2026!secure");
await page.getByRole("button", { name: /connexion|se connecter/i }).first().click();
await page.waitForURL(/\/onboarding\/\w+/, { timeout: 30_000 });
await page.waitForLoadState("networkidle");

const etapes = process.env.ETAPES ? Number(process.env.ETAPES) : 20;
for (let i = 0; i < etapes; i += 1) {
  const seg = new URL(page.url()).pathname.split("/")[2] ?? "";
  process.stdout.write(`--- ${seg} ${JSON.stringify(await etat())}\n`);
  if (page.url().includes("/app/")) {
    await capture("Arrivee dans l'application");
    break;
  }
  if (seg === "done") {
    await capture("Onboarding termine — recapitulatif");
    const entrer = page.getByRole("link", { name: /inbox|application|commencer|accéder|ouvrir/i }).or(page.getByRole("button", { name: /commencer|accéder|terminer|ouvrir/i })).first();
    if (!(await entrer.count())) break;
    const avantFin = page.url();
    await entrer.click();
    await page.waitForURL((u) => u.toString() !== avantFin, { timeout: 30_000 });
    await page.waitForLoadState("networkidle");
    continue;
  }
  const avant = page.url();
  if (seg === "welcome") {
    await capture("Bienvenue — votre activite (vide)");
    await page.locator('input[name="o_que_faz"]').fill("Vente de pagnes et tissus wax via WhatsApp");
    await capture("Bienvenue — activite remplie");
    for (const c of await page.getByRole("checkbox").all()) if (!(await c.isChecked())) await c.check();
    await page.getByRole("button", { name: /^continuer$/i }).click();
  } else if (seg === "connect-whatsapp") {
    await capture("Numero WhatsApp — trois facons de connecter");
    await page.getByText("Je scanne un code avec mon téléphone").click();
    await capture("Numero WhatsApp — scanner un code");
    // Pile locale sans WhatsApp : la débutante peut passer et revenir plus tard.
    await page.getByRole("button", { name: /ignorer pour le moment/i }).click();
  } else if (seg === "setup-ai") {
    await capture("Former l'assistant — ton, regles, garde-fous");
    await page.getByRole("button", { name: /créer et continuer/i }).click();
  } else if (seg === "funil") {
    await capture("Son tableau — colonnes proposees");
    await page.getByRole("button", { name: /utiliser ce tableau/i }).click();
  } else if (seg === "testar") {
    await capture("Le voir repondre");
    await page.getByRole("button", { name: /^continuer$/i }).click();
  } else if (seg === "invite-team") {
    await capture("Votre equipe — inviter");
    await page.getByRole("button", { name: /ignorer pour le moment/i }).click();
  } else {
    await capture(`Ecran inattendu ${seg}`);
    break;
  }
  // `/onboarding` tout court redirige vers l'étape suivante : attendre qu'elle soit posée.
  await page.waitForURL((u) => u.toString() !== avant && /\/(onboarding\/[a-z-]+|app\/)/.test(u.pathname), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
}
if (erreurs.length) process.stdout.write(`Erreurs JavaScript : ${JSON.stringify(erreurs.slice(0, 5))}\n`);
await browser.close();
