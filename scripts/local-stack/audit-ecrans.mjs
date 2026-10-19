/**
 * Audit visuel de toutes les pages, en MOBILE (390 × 844, comme un iPhone 13/14).
 *
 * Pour chaque route : capture pleine page, débordement horizontal (la page est
 * plus large que l'écran → on peut la faire glisser de côté, défaut n° 1 du
 * responsive), cibles tactiles trop petites, texte portugais encore visible,
 * erreurs JavaScript et statut HTTP.
 *
 *   node scripts/local-stack/audit-ecrans.mjs <dossier-captures> <routes...>
 *   (session lue dans .superpowers/local-stack/state.json, écrite par step.mjs)
 *
 * Sortie : <dossier>/rapport.json + une capture par route.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { chromium } from "@playwright/test";

const [, , outDir, ...routes] = process.argv;
const BASE = process.env.APP_URL ?? "http://localhost:3000";
const STATE = ".superpowers/local-stack/state.json";
mkdirSync(outDir, { recursive: true });

// Mots qui n'existent pas en français : un seul suffit à signaler la ligne.
const MOTS_PT = [
  "não", "você", "vocês", "está", "estão", "ainda", "também", "nenhum", "nenhuma", "agora", "aqui", "isso",
  "esse", "essa", "já", "então", "uma", "seu", "sua", "seus", "suas", "com", "para", "pra", "em", "do", "da",
  "dos", "das", "no", "na", "nos", "nas", "ao", "aos", "pelo", "pela", "até", "sem", "como", "quando", "mês",
  "hoje", "novo", "nova", "salvar", "excluir", "editar", "criar", "usar", "ver", "funil", "conversa", "conversas",
  "contato", "contatos", "atendimento", "atendente", "configurações", "pontos", "quadro", "etapa", "negócio",
];
// Limites de mot sensibles aux lettres accentuées (\b de JS ne voit pas « é » comme une lettre).
const PORTUGAIS = new RegExp(
  `(?<![\\p{L}])(${MOTS_PT.join("|")})(?![\\p{L}])|\\p{L}(ção|ções|ões|ão)(?![\\p{L}])`,
  "iu",
);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: "fr-FR",
  ...(existsSync(STATE) ? { storageState: STATE } : {}),
});

const rapport = [];
for (const route of routes) {
  const page = await context.newPage();
  const erreurs = [];
  page.on("pageerror", (e) => erreurs.push(e.message.slice(0, 200)));
  page.on("console", (m) => m.type() === "error" && erreurs.push(`console: ${m.text().slice(0, 200)}`));
  let status = null;
  try {
    const res = await page.goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 45_000 });
    status = res?.status() ?? null;
  } catch (e) {
    erreurs.push(`navigation: ${e.message.slice(0, 160)}`);
  }
  await page.waitForTimeout(1500);
  const mesures = await page.evaluate((re) => {
    const regex = new RegExp(re.source, re.flags);
    const largeur = document.documentElement.clientWidth;
    const debordants = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > largeur + 2) {
        // Un ancêtre qui défile horizontalement (onglets, tableau) contient le débordement : pas un défaut.
        let p = el.parentElement;
        let contenu = false;
        while (p && p !== document.body) {
          const ox = getComputedStyle(p).overflowX;
          if (ox === "auto" || ox === "scroll" || ox === "hidden" || ox === "clip") {
            contenu = true;
            break;
          }
          p = p.parentElement;
        }
        if (!contenu) {
          const label = `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").slice(0, 3).join(".") : ""}`;
          debordants.push(`${label} (droite ${Math.round(r.right)}px) « ${(el.textContent ?? "").trim().slice(0, 50)} »`);
        }
      }
    }
    // Cibles tactiles : < 24 px échoue WCAG 2.5.8 (AA) ; < 44 px est sous le confort d'un doigt.
    const cibles = { sous24: [], sous44: 0 };
    for (const el of document.querySelectorAll("a[href], button, input:not([type=hidden]), select, textarea, [role=tab], [role=button], [role=switch]")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden") continue;
      const petit = Math.min(r.width, r.height);
      if (petit < 44) cibles.sous44 += 1;
      if (petit < 24) {
        const nom = (el.getAttribute("aria-label") || el.textContent || el.getAttribute("name") || el.tagName).trim().slice(0, 40);
        cibles.sous24.push(`${el.tagName.toLowerCase()} ${Math.round(r.width)}×${Math.round(r.height)} « ${nom} »`);
      }
    }
    const lignes = (document.body.innerText ?? "")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 1 && regex.test(l));
    return {
      titre: document.title,
      urlFinale: location.pathname + location.search,
      scrollWidth: document.documentElement.scrollWidth,
      largeur,
      debordants: [...new Set(debordants)].slice(0, 8),
      portugais: [...new Set(lignes)].slice(0, 40),
      ciblesSous24: [...new Set(cibles.sous24)].slice(0, 12),
      ciblesSous44: cibles.sous44,
    };
  }, { source: PORTUGAIS.source, flags: PORTUGAIS.flags });
  const fichier = `${route.replace(/^\//, "").replace(/[/?=&]/g, "_") || "racine"}.png`;
  await page.screenshot({ path: path.join(outDir, fichier), fullPage: true });
  rapport.push({ route, status, capture: fichier, erreurs: [...new Set(erreurs)].slice(0, 6), ...mesures });
  const flags = [
    mesures.scrollWidth > mesures.largeur + 2 ? `DÉBORDE(${mesures.scrollWidth}px)` : "",
    mesures.portugais.length ? `PT×${mesures.portugais.length}` : "",
    erreurs.length ? `ERR×${erreurs.length}` : "",
    mesures.ciblesSous24.length ? `CIBLES<24×${mesures.ciblesSous24.length}` : "",
  ].filter(Boolean);
  process.stdout.write(`${route} → ${mesures.urlFinale} [${status}] ${flags.join(" ") || "ok"}\n`);
  await page.close();
}
writeFileSync(path.join(outDir, "rapport.json"), JSON.stringify(rapport, null, 2));
await browser.close();
