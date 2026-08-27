/**
 * Public runtime configuration injected by <PublicEnvScript/>. Only Neon public
 * endpoint URLs and non-sensitive branding cross into the browser; database
 * credentials, admin JWTs and cookie secrets remain server-side.
 */
interface PublicEnv {
  NEON_AUTH_BASE_URL?: string;
  NEON_DATA_API_URL?: string;
  NEXT_PUBLIC_APP_URL?: string;
  SENTRY_DSN?: string;
  /**
   * Marca da instalação (white-label), já RESOLVIDA — banco acima, arquivo de
   * instalação embaixo. Os nomes das chaves são os do `.env` por herança, mas o
   * valor não vem mais dele direto: quem monta é `app/layout.tsx`. Ver
   * `lib/branding.ts` e o cabeçalho de `app/public-env-script.tsx`.
   *
   * `APP_LOGO_URL` vazio significa "não há logo" — é a forma que
   * `resolveBranding` entende, e a mesma que o `.env` entregava.
   */
  APP_NAME?: string;
  APP_LOGO_URL?: string;
}

interface Window {
  __PUBLIC_ENV__?: PublicEnv;
}
