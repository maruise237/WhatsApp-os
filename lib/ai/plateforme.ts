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
import type { LanguageModel } from "ai";

/** Nom interne du fournisseur, tel qu'il est écrit dans `llm_calls.provider`. */
export const FOURNISSEUR_PLATEFORME = "deepseek";
export const URL_PLATEFORME_PAR_DEFAUT = "https://api.deepseek.com";
export const MODELE_PLATEFORME_PAR_DEFAUT = "deepseek-flash";

export interface IaDeLaPlateforme {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface EnvIaPlateforme {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
}

/** `null` = l'exploitant n'a pas fourni de clé ; les anciens chemins s'appliquent. */
export function iaDeLaPlateforme(env: EnvIaPlateforme): IaDeLaPlateforme | null {
  const apiKey = env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: env.DEEPSEEK_BASE_URL?.trim() || URL_PLATEFORME_PAR_DEFAUT,
    model: env.DEEPSEEK_MODEL?.trim() || MODELE_PLATEFORME_PAR_DEFAUT,
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
  });
}

/** Le modèle prêt pour `generateText`/`generateObject`. */
export function modeleDeLaPlateforme(
  ia: IaDeLaPlateforme,
  opts: { modelId?: string; fetch?: typeof fetch } = {},
): LanguageModel {
  return createDeepSeek({
    apiKey: ia.apiKey,
    baseURL: ia.baseUrl,
    ...(opts.fetch ? { fetch: opts.fetch } : {}),
  })(opts.modelId ?? ia.model);
}
