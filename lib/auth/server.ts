/**
 * Server-side auth helpers — load AuthUser, resolve active org, gate routes.
 *
 * Uses the service-role admin client to read tenant-scoped tables
 * (`user_organizations`, `platform_admins`, `organizations`) — RLS bypass is
 * intentional here because we resolve the user from the validated JWT first
 * and then filter by `user_id` (a trusted source).
 */
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/db/server";
import type { AuthUser, Role, UserOrgMembership, ActiveOrg } from "./types";

const ACTIVE_ORG_COOKIE = "active_org";

interface RawMembershipRow {
  organization_id: string;
  role: string;
  organizations: { display_name: string } | { display_name: string }[] | null;
}

/**
 * Loads the AuthUser for the current request. Returns null if unauthenticated.
 * Use only in Server Components / Route Handlers / Server Actions.
 *
 * Uses the user-scoped server client (cookie session). RLS policies allow:
 * - user_organizations: user_id = auth.uid() (user_orgs_select)
 * - organizations: id IN fn_user_org_ids()  (orgs_select)
 * - platform_admins: only platform admins read (so non-admins get null — correct)
 */
/**
 * "Não havia sessão nenhuma" — o estado NORMAL, não um incidente.
 *
 * `getUser()` não devolve `error: null` para quem não está logado. Sem cookie de
 * sessão, `GoTrueClient._getUser` corta antes de falar com o GoTrue e devolve
 * `{ data: { user: null }, error: new AuthSessionMissingError() }` (status 400).
 * Medido em `@supabase/auth-js` 2.112.1, com um cookie store vazio:
 *
 *     user  = null
 *     error = AuthSessionMissingError: Auth session missing! (status=400)
 *
 * Isso importa porque **não há `middleware.ts` neste projeto**: o gate de
 * `/app/*` é o próprio `app/app/layout.tsx`, que chama `loadAuthUser()` e só
 * então redireciona. Ou seja, todo visitante deslogado — e todo crawler — passa
 * por aqui sem sessão. Logar esse caso como erro reintroduziria, do lado do log,
 * exatamente a ambiguidade que o bloco acima existe para desfazer: o estado
 * normal e a falha transitória voltariam a ser a mesma linha, agora afogadas em
 * volume de tráfego anônimo.
 *
 * Compara por `name` e não por `instanceof`: há DUAS cópias de `@supabase/auth-js`
 * na árvore (2.111.0 e 2.112.1 em `node_modules/.pnpm`), e `instanceof` só acerta
 * quando o erro vem da mesma cópia que o teste importou.
 */
export function ehSessaoAusente(error: { name?: string } | null | undefined): boolean {
  return error?.name === "AuthSessionMissingError";
}

export async function loadAuthUser(): Promise<AuthUser | null> {
  const db = await createClient();
  const {
    data: { user },
    error,
  } = await db.auth.getUser();
  // ⚠️ O `error` era DESCARTADO — nem chegava a ser desestruturado —, e aqui
  // `user: null` é tão ambíguo quanto o `data: null` que a query logo abaixo
  // trata com todo o cuidado: significa "não está logado" (estado normal) E
  // "não deu para perguntar" (rede, GoTrue fora do ar, token ilegível).
  //
  // A ação não muda, e isso é deliberado: sem usuário confirmado, devolver
  // `null` — e portanto redirecionar para o login — é o desfecho seguro.
  // Falhar FECHADO na ação continua certo. O que estava errado era falhar
  // fechado também na INFORMAÇÃO: quem investigasse depois via só uma pessoa
  // "deslogada", sem nada distinguindo isso de uma falha transitória.
  //
  // Custou caro uma vez: um vermelho de e2e em que a barra lateral "perdeu o
  // logo" foi, por eliminação, uma casca de app que não era a casca do app —
  // e a hipótese nº 1 é justamente um redirect nascido aqui. Com este log, a
  // próxima ocorrência se explica sozinha em vez de custar uma investigação.
  //
  // ⚠️ MAS NEM TODO `error` AQUI É INCIDENTE — e é por isso que `ehSessaoAusente`
  // existe. Ver o comentário dela: sem esse filtro, este log dispara em todo
  // visitante deslogado e refaz, do lado do log, a mesma fusão que este bloco
  // existe para desfazer.
  if (error && !ehSessaoAusente(error)) {
    // As chaves são as MESMAS do outro `logger.error` desta função (linha ~134):
    // `code` e `message`. Dois nomes para o mesmo conceito, dentro da mesma
    // função, obrigariam quem consulta o agregador a escrever duas buscas — num
    // conserto cujo objeto é diagnóstico.
    //
    // `name` viaja junto porque é o que separa as CLASSES: `AuthRetryableFetchError`
    // (rede, GoTrue fora do ar) de `AuthApiError` (token ilegível). Ambas podem
    // chegar com o mesmo `status`, e a mensagem vem em inglês do upstream — sem o
    // nome, distinguir as duas viraria regex sobre texto que muda entre versões.
    logger.error("[auth] échec de getUser — traité comme non authentifié", {
      name: error.name,
      code: error.code ?? null,
      status: error.status ?? null,
      message: error.message,
    });
  }
  if (!user) return null;

  // Platform admin? (active = no revoked_at). RLS returns null for non-admins.
  //
  // ⚠️ O erro é capturado de propósito: aqui `data: null` é AMBÍGUO — significa tanto
  // "não é platform admin" (RLS filtrou, estado normal) quanto "a query falhou".
  // Sem separar os dois, um banco instável rebaixa silenciosamente um super-admin.
  const { data: paRow, error: paErro } = await db
    .from("platform_admins")
    .select("user_id, revoked_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  // Org memberships (only active = not revoked, accepted)
  const { data: rawMemberships, error: membErro } = await db
    .from("user_organizations")
    .select("organization_id, role, organizations(display_name)")
    .eq("user_id", user.id)
    .is("revoked_at", null);

  /**
   * FALHA ALTO, não baixo.
   *
   * Antes, o erro destas duas queries era descartado e `rawMemberships` nulo virava
   * `[]` — ou seja, "usuário sem organização". O resultado é que uma instabilidade do
   * banco chega ao operador como **"você não pertence a nenhuma organização"**: as
   * telas de admin somem, as rotas devolvem 403, e nada indica que a causa é
   * infraestrutura.
   *
   * Medido em 2026-07-30: com o PostgREST devolvendo `name resolution failed` depois
   * de um restart do Docker, TODOS os cards de admin sumiram do hub de configurações.
   * Custou seis diagnósticos errados — build velho, processo velho, cache, filtro de
   * papel — antes de alguém olhar a causa real.
   *
   * Degradar permissão em silêncio é o pior desfecho possível num caminho de auth:
   * parece uma decisão de autorização e é um defeito de infra. Melhor estourar e
   * mostrar erro do que renderizar uma UI mentirosa.
   */
  if (paErro || membErro) {
    const detalhe = (paErro ?? membErro)!;
    logger.error("[auth] impossible de résoudre les permissions de l’utilisateur", {
      user_id: user.id,
      onde: paErro ? "platform_admins" : "user_organizations",
      code: detalhe.code,
      message: detalhe.message,
    });
    throw new Error(
      `auth_permissions_unavailable: ${detalhe.message} — les permissions n’ont pas pu être ` +
        `résolues ; la session n’a PAS été rétrogradée par décision d’autorisation.`,
    );
  }

  const rows = (rawMemberships ?? []) as RawMembershipRow[];
  const memberships: UserOrgMembership[] = rows.map((row) => {
    const orgs = row.organizations;
    const name = Array.isArray(orgs) ? (orgs[0]?.display_name ?? "—") : (orgs?.display_name ?? "—");
    return {
      organization_id: row.organization_id,
      organization_name: name,
      role: row.role as Role,
    };
  });

  const fullName = (user.user_metadata?.full_name as string | undefined) ?? null;
  const avatarUrl = (user.user_metadata?.avatar_url as string | undefined) ?? null;
  const locale = (user.user_metadata?.locale as string | undefined) ?? null;

  return {
    id: user.id,
    email: user.email ?? "",
    full_name: fullName,
    avatar_url: avatarUrl,
    is_platform_admin: !!paRow,
    locale,
    organizations: memberships,
  };
}

/**
 * Resolves the active organization for the current request.
 * Priority: cookie `active_org` (if member of) → first membership.
 * Returns null if user has zero memberships.
 */
export async function resolveActiveOrg(authUser: AuthUser): Promise<ActiveOrg | null> {
  if (authUser.organizations.length === 0) return null;
  const store = await cookies();
  const cookieOrg = store.get(ACTIVE_ORG_COOKIE)?.value;
  if (cookieOrg) {
    const found = authUser.organizations.find((o) => o.organization_id === cookieOrg);
    if (found) {
      return { orgId: found.organization_id, name: found.organization_name, role: found.role };
    }
  }
  const first = authUser.organizations[0];
  if (!first) return null;
  return { orgId: first.organization_id, name: first.organization_name, role: first.role };
}

/**
 * For Server Components / Server Actions in /app/(app)/* routes — guarantees
 * an authenticated user. Redirects to /login if not.
 */
export async function requireAuth(): Promise<AuthUser> {
  const user = await loadAuthUser();
  if (!user) redirect("/login");
  return user;
}
