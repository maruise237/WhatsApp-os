/**
 * L'IA fournie par la plateforme.
 *
 * Le produit est vendu en SaaS : la vendeuse ne crée pas de compte chez un
 * fournisseur d'IA, ne colle aucune clé et ne choisit aucun modèle. Une seule
 * clé, posée par l'exploitant dans les variables d'environnement (Dokploy),
 * sert toutes les organisations.
 *
 * Quand `DEEPSEEK_API_KEY` est présente, elle GAGNE sur tout le reste — clé
 * BYOK d'une organisation, panneau des fournisseurs, modèle choisi dans une
 * version d'agent. Ces anciens réglages restent en base (clones existants) mais
 * ne décident plus rien : deux sources de vérité, c'est la vendeuse qui croit
 * avoir choisi un modèle que la plateforme ignore.
 *
 * Le modèle par défaut lit les images (capture de paiement, photo de produit) :
 * `deepseek-flash` est multimodal depuis V4.1-Flash (10/09/2026).
 */
import { createDeepSeek } from "@ai-sdk/deepseek";
import { defaultSettingsMiddleware, wrapLanguageModel, type LanguageModel } from "ai";

/** Nom interne du fournisseur, tel qu'il est écrit dans `llm_calls.provider`. */
export const FOURNISSEUR_PLATEFORME = "deepseek";
export const URL_PLATEFORME_PAR_DEFAUT = "https://api.deepseek.com";
export const MODELE_PLATEFORME_PAR_DEFAUT = "deepseek-flash";

/**
 * Intensité de réflexion. DeepSeek V4+ réfléchit par défaut, et la réflexion
 * est facturée comme de la sortie. `low` par défaut : mesuré sur une vraie
 * conversation de vente, la réflexion pesait 130 des 170 tokens de sortie.
 * `off` coupe tout (le moins cher, le moins fiable sur les outils).
 */
export type Reflexion = "off" | "low" | "high" | "max";

export interface IaDeLaPlateforme {
  apiKey: string;
  baseUrl: string;
  model: string;
  reflexion: Reflexion;
}

export interface EnvIaPlateforme {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
  DEEPSEEK_REFLEXION?: string;
}

function lireReflexion(valeur: string | undefined): Reflexion {
  const v = valeur?.trim().toLowerCase();
  return v === "off" || v === "high" || v === "max" ? v : "low";
}

/** `null` = l'exploitant n'a pas fourni de clé ; les anciens chemins s'appliquent. */
export function iaDeLaPlateforme(env: EnvIaPlateforme): IaDeLaPlateforme | null {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL?.trim() || URL_PLATEFORME_PAR_DEFAUT,
    model: env.DEEPSEEK_MODEL?.trim() || MODELE_PLATEFORME_PAR_DEFAUT,
    reflexion: lireReflexion(env.DEEPSEEK_REFLEXION),
  };
}

/**
 * Lecture directe de `process.env`, pour le code côté app qui n'a pas d'objet
 * d'env sous la main. Le worker, lui, passe par `llmEdgeConfigFromEnv`, parce
 * que son `loadEnv` ne garde que ce que son schéma déclare.
 */
export function iaDeLaPlateformeDepuisProcessEnv(): IaDeLaPlateforme | null {
  return iaDeLaPlateforme({
    DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
    DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
    DEEPSEEK_REFLEXION: process.env.DEEPSEEK_REFLEXION,
  });
}

/**
 * La base de connaissances se cherche-t-elle par mots (plein texte) plutôt que
 * par vecteurs ? Oui avec l'IA de la plateforme — DeepSeek n'a pas d'API
 * d'embeddings, et payer un second fournisseur pour ranger une FAQ de boutique
 * n'a pas de sens — et oui aussi quand aucun fournisseur d'embeddings n'est
 * configuré : avant, l'indexeur sautait tout et la FAQ restait invisible.
 */
export function connaissancesEnTexte(): boolean {
  if (iaDeLaPlateformeDepuisProcessEnv()) return true;
  return !process.env.OPENAI_API_KEY?.trim() && !process.env.AI_GATEWAY_API_KEY?.trim();
}

/**
 * Plafonds de ce que la base de connaissances envoie au modèle à chaque
 * recherche. C'est ici que le coût se tient : un extrait de trop, c'est des
 * tokens payés à CHAQUE message de chaque client.
 */
export const PLAFONDS_CONNAISSANCES = {
  /** Extraits rendus au plus, quel que soit le top-K configuré. */
  extraits: 4,
  /** Un extrait plus long est coupé (≈ 250 tokens). */
  caracteresParExtrait: 1000,
  /** Total rendu par recherche (≈ 750 tokens). */
  caracteresAuTotal: 3000,
} as const;

/** Applique les plafonds, dans l'ordre du classement. */
export function plafonnerExtraits<T extends { content: string }>(extraits: T[]): T[] {
  const sortie: T[] = [];
  let total = 0;
  for (const e of extraits.slice(0, PLAFONDS_CONNAISSANCES.extraits)) {
    const reste = PLAFONDS_CONNAISSANCES.caracteresAuTotal - total;
    if (reste <= 0) break;
    const limite = Math.min(PLAFONDS_CONNAISSANCES.caracteresParExtrait, reste);
    const content = e.content.length > limite ? `${e.content.slice(0, limite).trimEnd()}…` : e.content;
    sortie.push({ ...e, content });
    total += content.length;
  }
  return sortie;
}

type ModeleDeepSeek = ReturnType<ReturnType<typeof createDeepSeek>>;

/** Les options DeepSeek qui portent l'intensité de réflexion. */
export function optionsDeReflexion(reflexion: Reflexion): Record<string, unknown> {
  return reflexion === "off" ? { thinking: { type: "disabled" } } : { reasoningEffort: reflexion };
}

/**
 * Pose l'intensité de réflexion sur un modèle DeepSeek, une fois pour toutes :
 * chaque appel (agent, essai, workers) en hérite sans qu'aucun appelant ait à
 * s'en souvenir. Un appel qui passe ses propres `providerOptions.deepseek` gagne.
 */
export function avecReflexion(model: ModeleDeepSeek, reflexion: Reflexion): LanguageModel {
  return wrapLanguageModel({
    model,
    middleware: defaultSettingsMiddleware({
      settings: { providerOptions: { deepseek: optionsDeReflexion(reflexion) } as never },
    }),
  });
}

/** Le modèle prêt pour `generateText`/`generateObject`. */
export function modeleDeLaPlateforme(
  ia: IaDeLaPlateforme,
  opts: { modelId?: string; fetch?: typeof fetch } = {},
): LanguageModel {
  const brut = createDeepSeek({
    apiKey: ia.apiKey,
    baseURL: ia.baseUrl,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  })(opts.modelId ?? ia.model);
  return avecReflexion(brut, ia.reflexion);
}
