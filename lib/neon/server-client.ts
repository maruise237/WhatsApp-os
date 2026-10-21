import { createNeonAuth } from "@neondatabase/auth/next/server";
import { createClient as createNeonDataClient } from "@neondatabase/neon-js";
import type { NextRequest } from "next/server";
import type { DbClient } from "@/lib/db/client";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

const neonAuth = createNeonAuth({
  baseUrl: env.NEON_AUTH_BASE_URL,
  cookies: {
    secret: env.NEON_AUTH_COOKIE_SECRET,
    sessionDataTtl: 300,
    sameSite: "strict",
  },
  logLevel: "silent",
});

/* eslint-disable @typescript-eslint/no-explicit-any -- métadonnées libres, comme le format attendu par les appelants */
export type UtilisateurAuth = {
  id: string;
  email: string | null;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
  aud: string;
  role: string;
  created_at: string;
  updated_at: string;
  last_sign_in_at?: string | null;
  [champ: string]: unknown;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

export type SessionAuthNeon = {
  access_token: string;
  refresh_token: string;
  expires_at: unknown;
  expires_in: unknown;
  token_type: string;
  user: UtilisateurAuth | null;
  [champ: string]: unknown;
};

export type ErreurAuth = { name?: string; code?: string; status?: number; message: string };

type AuthResult = {
  data: {
    user: UtilisateurAuth | null;
    session: SessionAuthNeon | null;
    access_token?: string;
    expires_at?: number;
    expires_in?: number;
    token_type?: string;
  };
  error: ErreurAuth | null;
};

function mapUser(user: Record<string, unknown> | null | undefined): UtilisateurAuth | null {
  if (!user) return null;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  return {
    ...user,
    id: String(user.id ?? ""),
    email: typeof user.email === "string" ? user.email : null,
    user_metadata: {
      ...metadata,
      full_name: metadata.full_name ?? user.name ?? null,
      avatar_url: metadata.avatar_url ?? user.image ?? null,
    },
    app_metadata: (user.app_metadata ?? {}) as Record<string, unknown>,
    aud: typeof user.aud === "string" ? user.aud : "authenticated",
    role: typeof user.role === "string" ? user.role : "authenticated",
    created_at: String(user.createdAt ?? user.created_at ?? new Date().toISOString()),
    updated_at: String(user.updatedAt ?? user.updated_at ?? new Date().toISOString()),
  };
}

function mapAuthResult(result: unknown): AuthResult {
  const raw = (result ?? {}) as Record<string, unknown>;
  const rawData = (raw.data ?? raw) as Record<string, unknown>;
  const rawSession = (rawData.session ?? null) as Record<string, unknown> | null;
  const rawUser = (rawData.user ?? rawSession?.user ?? null) as Record<string, unknown> | null;
  const token =
    rawData.access_token ??
    rawData.accessToken ??
    rawSession?.access_token ??
    rawSession?.accessToken ??
    rawSession?.token;
  const session: SessionAuthNeon | null = rawSession
    ? {
        ...rawSession,
        access_token: typeof token === "string" ? token : "",
        refresh_token: String(rawSession.refresh_token ?? ""),
        expires_at: rawSession.expires_at ?? rawSession.expiresAt ?? null,
        expires_in: rawSession.expires_in ?? rawSession.expiresIn ?? null,
        token_type: String(rawSession.token_type ?? "bearer"),
        user: mapUser(rawUser),
      }
    : null;
  return {
    data: {
      user: mapUser(rawUser),
      session,
      access_token: typeof token === "string" ? token : undefined,
      expires_at: typeof rawData.expires_at === "number" ? rawData.expires_at : undefined,
      expires_in: typeof rawData.expires_in === "number" ? rawData.expires_in : undefined,
      token_type: "bearer",
    },
    error: raw.error
      ? {
          name: typeof (raw.error as Record<string, unknown>).name === "string" ? (raw.error as Record<string, unknown>).name as string : undefined,
          code: typeof (raw.error as Record<string, unknown>).code === "string" ? (raw.error as Record<string, unknown>).code as string : undefined,
          status: typeof (raw.error as Record<string, unknown>).status === "number" ? (raw.error as Record<string, unknown>).status as number : undefined,
          message: typeof (raw.error as Record<string, unknown>).message === "string" ? (raw.error as Record<string, unknown>).message as string : "erreur d’authentification",
        }
      : null,
  };
}

type NeonAuthCookieStore = Awaited<ReturnType<typeof cookies>>;

function neonAuthCookieHeader(cookieStore: NeonAuthCookieStore): string {
  return cookieStore
    .getAll()
    .filter(({ name }) => name.startsWith("__Secure-neon-auth"))
    .map(({ name, value }) => `${name}=${value}`)
    .join("; ");
}

async function getAccessToken(cookieStore: NeonAuthCookieStore): Promise<string | null> {
  // Neon documents the RLS JWT in the `set-auth-jwt` response header from
  // `/get-session`. Fetch it with the current Neon Auth cookies so the Data API
  // receives a real bearer token instead of an unauthenticated request.
  const cookieHeader = neonAuthCookieHeader(cookieStore);
  if (!cookieHeader) return null;

  try {
    const response = await fetch(
      `${env.NEON_AUTH_BASE_URL.replace(/\/+$/, "")}/get-session`,
      {
        headers: { Accept: "application/json", Cookie: cookieHeader },
        cache: "no-store",
      },
    );
    const jwt = response.headers.get("set-auth-jwt")?.trim();
    if (jwt) return jwt;

    if (!response.ok) return null;
    const body = (await response.json().catch(() => null)) as
      | { token?: unknown; data?: { token?: unknown } }
      | null;
    const token = body?.data?.token ?? body?.token;
    return typeof token === "string" && token.length > 0 ? token : null;
  } catch {
    return null;
  }
}

function authCompat() {
  return {
    async getSession() {
      return mapAuthResult(await neonAuth.getSession());
    },
    async getUser() {
      const result = mapAuthResult(await neonAuth.getSession());
      return { data: { user: result.data?.user ?? null }, error: result.error ?? null };
    },
    async signInWithPassword(input: { email: string; password: string }) {
      return mapAuthResult(await neonAuth.signIn.email(input));
    },
    async signUp(input: { email: string; password: string; options?: { data?: Record<string, unknown>; emailRedirectTo?: string } }) {
      return mapAuthResult(
        await neonAuth.signUp.email({
          email: input.email,
          password: input.password,
          name: typeof input.options?.data?.full_name === "string" ? input.options.data.full_name : input.email,
          callbackURL: input.options?.emailRedirectTo,
        }),
      );
    },
    async signOut(options?: { scope?: "global" | "local" | "others" }) {
      // « Partout » : révoque toutes les sessions Better Auth avant de fermer celle-ci.
      if (options?.scope === "global" || options?.scope === "others") {
        const api = neonAuth as unknown as { revokeSessions?: () => Promise<unknown> };
        await api.revokeSessions?.().catch(() => undefined);
        if (options.scope === "others") return { error: null };
      }
      return neonAuth.signOut();
    },
    async updateUser(input: { data?: Record<string, unknown>; password?: string }) {
      return mapAuthResult(
        await neonAuth.updateUser({
          name: typeof input.data?.full_name === "string" ? input.data.full_name : undefined,
          image: typeof input.data?.avatar_url === "string" ? input.data.avatar_url : undefined,
          password: input.password,
        } as never),
      );
    },
    async resetPasswordForEmail(email: string, options?: { redirectTo?: string }) {
      return neonAuth.requestPasswordReset({ email, redirectTo: options?.redirectTo });
    },
    async verifyOtp(input: { email?: string; token_hash?: string; token?: string; type?: string }) {
      if (input.email && (input.token_hash ?? input.token)) {
        return mapAuthResult(
          await neonAuth.signIn.emailOtp({ email: input.email, otp: input.token_hash ?? input.token ?? "" }),
        );
      }
      const refus: AuthResult = {
        data: { user: null, session: null },
        error: { name: "NeonAuthUnsupportedError", code: "neon_auth_otp_shape_unsupported", message: "Neon Auth exige un code à usage unique envoyé par e-mail." },
      };
      return refus;
    },
    async exchangeCodeForSession(_code?: string) {
      return mapAuthResult(await neonAuth.getSession());
    },
    async getClaims() {
      const result = mapAuthResult(await neonAuth.getSession());
      return { data: result.data?.user ? { claims: result.data.user } : null, error: result.error ?? null };
    },
  };
}

export type AuthSession = ReturnType<typeof authCompat>;

export async function createClient(): Promise<DbClient> {
  const cookieStore = await cookies();
  const dataClient = createNeonDataClient({
    dataApi: {
      url: env.NEON_DATA_API_URL,
      getToken: () => getAccessToken(cookieStore),
    },
  });

  return new Proxy(dataClient as object, {
    get(target, property, receiver) {
      if (property === "auth") return authCompat();
      if (property === "__neonCookies") return cookieStore;
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as DbClient;
}

export function createNeonAuthForNextRequest() {
  return neonAuth;
}

export function getNeonAuthHandler() {
  return neonAuth.handler();
}

export function getNeonAuthMiddleware() {
  return neonAuth.middleware({ loginUrl: "/login" });
}

export type { NextRequest };
