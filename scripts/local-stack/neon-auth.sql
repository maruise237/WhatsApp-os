-- Pile locale : ce que Neon fournit en hébergé, recréé pour un Postgres nu.
--
-- 1. Les tables Better Auth dans `neon_auth` (Neon Auth EST Better Auth). Elles
--    sont créées AVANT le baseline, qui n'en référence que `neon_auth."user"(id)`.
-- 2. Le rôle `authenticator` de PostgREST (la Data API de Neon est un PostgREST).
--
-- Les stubs Supabase (rôles anon/authenticated, auth.uid(), extensions) viennent
-- du prélude de scripts/test-db.sh — up.sh l'extrait tel quel, pour qu'il n'y ait
-- qu'une seule définition de « banco do produto ».

create schema if not exists neon_auth;

create table if not exists neon_auth."user" (
  id uuid primary key,
  name text not null default '',
  email text not null unique,
  "emailVerified" boolean not null default false,
  image text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists neon_auth.session (
  id uuid primary key,
  "expiresAt" timestamptz not null,
  token text not null unique,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now(),
  "ipAddress" text,
  "userAgent" text,
  "userId" uuid not null references neon_auth."user"(id) on delete cascade
);

create table if not exists neon_auth.account (
  id uuid primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" uuid not null references neon_auth."user"(id) on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" timestamptz,
  "refreshTokenExpiresAt" timestamptz,
  scope text,
  password text,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists neon_auth.verification (
  id uuid primary key,
  identifier text not null,
  value text not null,
  "expiresAt" timestamptz not null,
  "createdAt" timestamptz not null default now(),
  "updatedAt" timestamptz not null default now()
);

create table if not exists neon_auth.jwks (
  id uuid primary key,
  "publicKey" text not null,
  "privateKey" text not null,
  "createdAt" timestamptz not null default now(),
  "expiresAt" timestamptz
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end
$$;
-- `grant anon, authenticated, service_role to authenticator` vient après le
-- prélude (up.sh) : ces rôles n'existent pas encore ici.
