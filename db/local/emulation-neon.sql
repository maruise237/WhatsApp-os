-- Émulation locale de ce que Neon fournit avant nos migrations.
-- NE PAS appliquer sur Neon : là-bas, Neon Auth crée `neon_auth` et
-- l'extension pg_session_jwt (activée avec la Data API) crée `auth.uid()`.
-- Utilisé par `scripts/test-db.sh` et `scripts/local-stack/up.sh`.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticator') then
    create role authenticator login password 'authenticator' noinherit;
  end if;
end
$$;
grant anon, authenticated, service_role to authenticator;

-- Comme pg_session_jwt : l'identité vient du claim `sub` du JWT.
create schema if not exists auth;
create or replace function auth.jwt() returns jsonb
  language sql stable
  as $fn$ select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $fn$;
create or replace function auth.user_id() returns text
  language sql stable
  as $fn$ select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), auth.jwt() ->> 'sub') $fn$;
create or replace function auth.uid() returns uuid
  language sql stable
  as $fn$ select case when auth.user_id() ~* '^[0-9a-f-]{36}$' then auth.user_id()::uuid end $fn$;
grant usage on schema auth to anon, authenticated, service_role;

-- Tables de Neon Auth (Better Auth).
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

