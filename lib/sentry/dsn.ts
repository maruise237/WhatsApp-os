/**
 * DSN Sentry, réglé à l'exécution (sans reconstruire l'image).
 *
 *   SENTRY_DSN=<votre-dsn>   → les erreurs partent vers VOTRE Sentry
 *   SENTRY_DSN= / off        → aucune télémétrie (défaut)
 *
 * Aucun envoi vers un tiers par défaut : les traces d'erreur peuvent contenir
 * des données de vos clients.
 */
export function resolveSentryDsn(value: string | undefined | null): string | undefined {
  const v = (value ?? "").trim();
  if (!v || ["off", "false", "0"].includes(v.toLowerCase())) return undefined;
  return v;
}

/** Integração default do SDK que emite as sessões de release health do browser. */
export const INTEGRACAO_DE_SESSAO = "BrowserSession";

/**
 * Quais integrações do browser valem para o DSN em uso.
 *
 * A política de `isCommunityDsn` estava DECLARADA e não estava em vigor. As duas
 * amostragens foram a zero (`tracesSampleRate`, `replaysSessionSampleRate`) e o
 * fluxo de SESSÃO ficou de fora da conta: `browserSessionIntegration` entra por
 * default no `@sentry/browser` e o `lifecycle` dela é `"route"`, então cada troca
 * de rota fecha uma sessão e abre outra — duas por navegação, `errors: 0`.
 *
 * Sessão não é stack trace: ela não explica bug de ninguém, e é exatamente o que o
 * comentário do `isCommunityDsn` diz não querer ("não 100% das transações nem 10%
 * das sessões de um CRM que não é nosso"). O custo era invisível porque o dado ia
 * embora sozinho.
 *
 * Medido em 2026-08-10 sobre `dc2f9f96`, um percurso de 7 telas: 17 respostas do
 * ingest, TODAS `429`, com `x-sentry-rate-limits: 60::organization:suspended` —
 * lista de categorias vazia, isto é, todas as categorias. A organização estava
 * suspensa por cota, então nem o erro real de instalação real entrava; e cada
 * tentativa barrada virava erro de console no browser de quem hospeda.
 *
 * Quem aponta para o PRÓPRIO Sentry continua recebendo tudo, sessão inclusive: lá
 * o dado não sai da infraestrutura de quem é dono dele, e release health é
 * legítimo. A assimetria é a mesma das amostragens.
 */
export function integracoesDoCliente<T extends { name: string }>(
  padraoDoSdk: readonly T[],
  paraAComunidade: boolean,
): T[] {
  if (!paraAComunidade) return [...padraoDoSdk];
  return padraoDoSdk.filter((i) => i.name !== INTEGRACAO_DE_SESSAO);
}
