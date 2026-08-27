import { createNeonAuth } from "@neondatabase/auth/next/server";
import { createClient as createNeonDataClient } from "@neondatabase/neon-js";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
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

type AuthResult = {
  data?: {
    user?: Record<string, unknown> | null;
    session?: Record<string, unknown> | null;
    access_token?: string;
    expires_at?: number;
    expires_in?: number;
    token_type?: string;
  } | null;
  error?: { name?: string; code?: string; status?: number; message?: string } | null;
};

function mapUser(user: Record<string, unknown> | null | undefined) {
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
    created_at: user.createdAt ?? user.created_at ?? new Date().toISOString(),
    updated_at: user.updatedAt ?? user.updated_at ?? new Date().toISOString(),
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
  const session = rawSession
    ? {
        ...rawSession,
        access_token: typeof token === "string" ? token : "",
        refresh_token: String(rawSession.refresh_token ?? ""),
        expires_at: rawSession.expires_at ?? rawSession.expiresAt ?? null,
        expires_in: rawSession.expires_in ?? rawSession.expiresIn ?? null,
        token_type: rawSession.token_type ?? "bearer",
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
          message: typeof (raw.error as Record<string, unknown>).message === "string" ? (raw.error as Record<string, unknown>).message as string : undefined,
        }
      : null,
  };
}

async function getAccessToken(): Promise<string | null> {
  const result = await (neonAuth as unknown as { getAccessToken?: () => Promise<unknown> }).getAccessToken?.();
  const raw = (result ?? {}) as Record<string, unknown>;
  const data = (raw.data ?? raw) as Record<string, unknown>;
  const token = data.access_token ?? data.accessToken ?? data.token;
  return typeof token === "string" && token.length > 0 ? token : null;
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
    async signOut() {
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
      return { data: null, error: { name: "NeonAuthUnsupportedError", code: "neon_auth_otp_shape_unsupported", message: "Neon Auth requires an email OTP flow." } };
    },
    async exchangeCodeForSession() {
      return mapAuthResult(await neonAuth.getSession());
    },
    async getClaims() {
      const result = mapAuthResult(await neonAuth.getSession());
      return { data: result.data?.user ? { claims: result.data.user } : null, error: result.error ?? null };
    },
    mfa: {
      async getAuthenticatorAssuranceLevel() {
        return { data: { currentLevel: "aal1", nextLevel: "aal1", currentAuthenticationMethods: [] }, error: null };
      },
      async listFactors() {
        return { data: { all: [], totp: [] }, error: null };
      },
      async enroll() {
        return { data: null, error: { name: "NeonAuthUnsupportedError", code: "neon_auth_mfa_not_supported", message: "Configure MFA in Neon Auth before enabling this flow." } };
      },
      async challenge() {
        return { data: null, error: { name: "NeonAuthUnsupportedError", code: "neon_auth_mfa_not_supported", message: "Configure MFA in Neon Auth before enabling this flow." } };
      },
      async verify() {
        return { data: null, error: { name: "NeonAuthUnsupportedError", code: "neon_auth_mfa_not_supported", message: "Configure MFA in Neon Auth before enabling this flow." } };
      },
      async unenroll() {
        return { data: null, error: { name: "NeonAuthUnsupportedError", code: "neon_auth_mfa_not_supported", message: "Configure MFA in Neon Auth before enabling this flow." } };
      },
    },
  };
}

export async function createClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  const dataClient = createNeonDataClient({
    dataApi: {
      url: env.NEON_DATA_API_URL,
      getToken: getAccessToken,
    },
  });

  return new Proxy(dataClient as object, {
    get(target, property, receiver) {
      if (property === "auth") return authCompat();
      if (property === "__neonCookies") return cookieStore;
      return Reflect.get(target, property, receiver);
    },
  }) as unknown as SupabaseClient;
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
