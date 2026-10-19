/**
 * Parcours de vente de bout en bout, PAR L'ÉCRAN, en mobile (390 × 844).
 *
 * Prérequis : pile locale (up.sh), app lancée, onboarding fait, données de
 * seed-boutique.ts. Chaque étape laisse une capture numérotée dans <dossier>.
 * Une étape qui échoue s'arrête avec la capture de l'état où elle a échoué.
 *
 *   node scripts/local-stack/parcours-ventes.mjs <dossier>
 */
import { mkdirSync } from "node:fs";
import path from "node:path";

import { chromium, expect } from "@playwright/test";

const out = process.argv[2] ?? ".superpowers/evidence/parcours";
mkdirSync(out, { recursive: true });
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const RECU = ".superpowers/local-stack/fixtures/recu-mobile-money.png";

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
// Les confirmations et invites du Central (window.confirm / prompt).
const reponsesInvites = [];
page.on("dialog", async (d) => {
  const reponse = reponsesInvites.shift();
  process.stdout.write(`   dialogue « ${d.message().slice(0, 70)} » → ${reponse ?? "OK"}\n`);
  if (d.type() === "prompt") await d.accept(reponse ?? "");
  else await d.accept();
});

let n = 0;
async function etape(titre, fn) {
  n += 1;
  const nom = `${String(n).padStart(2, "0")}-${titre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
  try {
    await fn();
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(out, `${nom}.png`), fullPage: true });
    process.stdout.write(`✓ ${n}. ${titre}\n`);
  } catch (e) {
    await page.screenshot({ path: path.join(out, `${nom}-ECHEC.png`), fullPage: true });
    process.stdout.write(`✗ ${n}. ${titre}\n   ${String(e.message).split("\n")[0]}\n`);
    await browser.close();
    process.exit(1);
  }
}

const onglet = (nom) => page.getByRole("tab", { name: new RegExp(`^${nom}`) });

await etape("Écran de connexion", async () => {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await expect(page.getByLabel(/e-?mail/i).first()).toBeVisible();
});

await etape("Connexion de la vendeuse", async () => {
  await page.getByLabel(/e-?mail/i).first().fill("awa@boutique.cm");
  await page.getByLabel(/mot de passe/i).first().fill("Vente2026!secure");
  await page.getByRole("button", { name: /connexion|se connecter/i }).first().click();
  await page.waitForURL(/\/app/, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
});

await etape("Menu de navigation mobile", async () => {
  await page.getByRole("navigation", { name: "Navigation rapide" }).getByRole("button", { name: "Ouvrir le menu" }).click();
  await expect(page.getByRole("link", { name: /ventes|central vendeur/i }).first()).toBeVisible();
});

await etape("Barre d'onglets du bas", async () => {
  await page.keyboard.press("Escape");
  const barre = page.getByRole("navigation", { name: "Navigation rapide" });
  await expect(barre).toBeVisible();
  // À portée de pouce : chaque onglet fait au moins 44 px de haut.
  for (const nom of ["Inbox", "Ventes", "Contacts", "Menu"]) {
    const cible = nom === "Menu" ? barre.getByRole("button", { name: /menu/i }) : barre.getByRole("link", { name: nom });
    const h = await cible.evaluate((el) => el.getBoundingClientRect().height);
    if (h < 44) throw new Error(`onglet « ${nom} » : ${h}px de haut`);
  }
});

await etape("Central vendeur — preuve à vérifier", async () => {
  await page.getByRole("navigation", { name: "Navigation rapide" }).getByRole("link", { name: "Ventes" }).click();
  await page.waitForURL(/\/app\/sales/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("navigation", { name: "Navigation rapide" }).getByRole("link", { name: "Ventes" })).toHaveAttribute("aria-current", "page");
  await expect(onglet("Preuves")).toHaveAttribute("aria-selected", "true");
  await expect(page.getByText("Mireille Ngo")).toBeVisible();
  // La capture du client doit vraiment s'afficher (image décodée, pas l'icône cassée).
  const img = page.getByRole("img", { name: /preuve de paiement de mireille/i });
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
});

await etape("Capture du reçu en grand", async () => {
  const [onglet2] = await Promise.all([
    context.waitForEvent("page"),
    page.getByTitle("Ouvrir la preuve en grand").first().click(),
  ]);
  await onglet2.waitForLoadState();
  await onglet2.screenshot({ path: path.join(out, `${String(n).padStart(2, "0")}-recu-ouvert.png`) });
  await onglet2.close();
});

await etape("Paiement confirmé par la vendeuse", async () => {
  await page.getByRole("button", { name: "Paiement reçu" }).click();
  // Plus aucune preuve en attente : l'écran bascule seul sur les commandes.
  await expect(onglet("Commandes")).toHaveAttribute("aria-selected", "true");
  await expect(onglet("Preuves")).not.toContainText(/\d/);
});

await etape("Commande payée dans la liste", async () => {
  const carte = page.locator("article", { hasText: "Mireille Ngo" });
  await expect(carte.getByText("Payée")).toBeVisible();
});

await etape("Préparer la livraison avec une note", async () => {
  reponsesInvites.push("Akwa, rue Joss — livreur Samuel, demain 10 h");
  const carte = page.locator("article", { hasText: "Mireille Ngo" });
  await carte.getByRole("button", { name: "Préparer la livraison" }).click();
  await expect(carte.getByText("À livrer")).toBeVisible();
  await expect(carte.getByText(/livreur Samuel/)).toBeVisible();
});

await etape("Commande marquée livrée", async () => {
  const carte = page.locator("article", { hasText: "Mireille Ngo" });
  await carte.getByRole("button", { name: "Marquer livrée" }).click();
  await page.getByRole("button", { name: "Toutes" }).click();
  await expect(page.locator("article", { hasText: "Mireille Ngo" }).getByText("Livrée")).toBeVisible();
});

await etape("Dépôt manuel d'une preuve pour Jean-Paul", async () => {
  await page.getByRole("button", { name: "Paiement attendu" }).click();
  const carte = page.locator("article", { hasText: "Jean-Paul Essomba" });
  await carte.locator('input[type="file"]').setInputFiles(RECU);
  await expect(onglet("Preuves")).toContainText("1");
});

await etape("Preuve refusée avec un motif", async () => {
  await onglet("Preuves").click();
  reponsesInvites.push("Le montant ne correspond pas : 30 000 au lieu de 22 000 FCFA");
  await page.getByRole("button", { name: "Refuser", exact: true }).click();
  // L'onglet a été choisi à la main : il reste ouvert, vide.
  await expect(page.getByText(/aucune preuve à vérifier/i)).toBeVisible();
  await onglet("Commandes").click();
  await page.getByRole("button", { name: "Paiement attendu" }).click();
  await expect(page.getByText(/Dernière preuve refusée/)).toBeVisible();
});

await etape("Catalogue", async () => {
  await onglet("Catalogue").click();
  await expect(page.getByText("Robe wax « Douala »")).toBeVisible();
});

await etape("Ajout d'un produit", async () => {
  await page.getByLabel("Nom du produit").fill("Pagne super-wax 6 yards");
  await page.getByLabel("Description").fill("Pagne hollandais, 6 yards, motifs variés.");
  await page.getByLabel("Prix").fill("18000");
  await page.getByLabel("Stock").fill("12");
  await page.getByRole("button", { name: "Ajouter au catalogue" }).click();
  await expect(page.getByText("Pagne super-wax 6 yards")).toBeVisible();
});

await etape("Modification du stock", async () => {
  const carte = page.locator("article", { hasText: "Boucles d’oreilles perles" });
  await carte.getByRole("button", { name: "Modifier" }).click();
  // En édition, le nom devient un champ : on cible le formulaire ouvert.
  const edition = page.locator("form", { has: page.getByRole("button", { name: "Enregistrer" }) });
  await expect(edition.getByLabel("Nom du produit")).toHaveValue("Boucles d’oreilles perles");
  await expect(edition.getByLabel("Prix")).toHaveValue("2500");
  await edition.getByLabel("Stock").fill("8");
  await edition.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, `${String(n).padStart(2, "0")}-formulaire-edition.png`) });
  await edition.getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.locator("article", { hasText: "Boucles d’oreilles perles" }).getByText("Stock 8")).toBeVisible();
});

await etape("Conversation WhatsApp de la cliente", async () => {
  await onglet("Commandes").click();
  await page.getByRole("button", { name: "Toutes" }).click();
  await page.locator("article", { hasText: "Mireille Ngo" }).getByRole("link", { name: "Ouvrir la conversation" }).click();
  await page.waitForURL(/\/app\/inbox/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText(/robe wax/i).first()).toBeVisible();
  // Dans une conversation, le champ de saisie prend le bas : la barre s'efface.
  await expect(page.getByRole("navigation", { name: "Navigation rapide" })).toBeHidden();
});

await etape("Contacts", async () => {
  const barre = page.getByRole("navigation", { name: "Navigation rapide" });
  await page.getByText("Conversations", { exact: true }).first().click();
  await expect(barre).toBeVisible();
  // Ouverte depuis la LISTE (l'URL ne change pas) : la barre doit s'effacer aussi.
  await page.getByText("Fatou Diallo").first().click();
  await expect(barre).toBeHidden();
  await page.getByText("Conversations", { exact: true }).first().click();
  await barre.getByRole("link", { name: "Contacts" }).click();
  await page.waitForURL(/\/app\/contacts/);
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("Fatou Diallo")).toBeVisible();
});

if (erreurs.length) process.stdout.write(`Erreurs JavaScript : ${JSON.stringify(erreurs.slice(0, 5))}\n`);
await browser.close();
