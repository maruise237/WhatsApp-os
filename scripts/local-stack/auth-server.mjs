/**
 * Neon Auth en local : un serveur Better Auth configuré comme celui de Neon.
 *
 * Ce que le SDK `@neondatabase/auth` attend de l'amont, et qui est reproduit ici :
 * - cookies `__Secure-neon-auth.*` (préfixe `neon-auth` + cookies sécurisés) ;
 * - un JWT de session dans l'en-tête `set-auth-jwt` de `/get-session` (plugin
 *   jwt), signé RS256 et publié sur `/jwks` pour que PostgREST le vérifie ;
 * - des ids uuid (les FK du schéma public pointent vers `neon_auth."user"(id) uuid`).
 *
 * Variables : LOCAL_AUTH_DATABASE_URL, LOCAL_AUTH_PORT (3100), LOCAL_APP_ORIGIN.
 * Usage : node scripts/local-stack/auth-server.mjs (lancé par up.sh).
 */
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

import pg from "pg";

// better-auth n'est pas une dépendance directe : c'est celle que `@neondatabase/auth`
// embarque (même version que le SDK attend). pnpm la range à côté de lui.
const neonAuthDir = realpathSync(path.resolve("node_modules/@neondatabase/auth"));
const betterAuthDir = path.resolve(neonAuthDir, "../../better-auth");
const load = (sub) => import(pathToFileURL(path.join(betterAuthDir, "dist", sub)).href);
const { betterAuth } = await load("index.mjs");
const { toNodeHandler } = await load("integrations/node.mjs");
const { jwt } = await load("plugins/jwt/index.mjs");

const port = Number(process.env.LOCAL_AUTH_PORT ?? 3100);
const appOrigin = process.env.LOCAL_APP_ORIGIN ?? "http://localhost:3000";

const auth = betterAuth({
  baseURL: `http://127.0.0.1:${port}`,
  basePath: "/api/auth",
  secret: process.env.LOCAL_AUTH_SECRET ?? "local-stack-better-auth-secret-0123456789",
  database: new pg.Pool({
    connectionString: process.env.LOCAL_AUTH_DATABASE_URL,
    options: "-c search_path=neon_auth",
  }),
  trustedOrigins: [appOrigin, "http://127.0.0.1:3000"],
  emailAndPassword: { enabled: true, requireEmailVerification: false, autoSignIn: true },
  advanced: {
    cookiePrefix: "neon-auth",
    useSecureCookies: true,
    database: { generateId: () => randomUUID() },
  },
  plugins: [
    jwt({
      jwks: { keyPairConfig: { alg: "RS256" } },
      jwt: {
        expirationTime: "1h",
        definePayload: ({ user }) => ({ sub: user.id, email: user.email, role: "authenticated" }),
      },
    }),
  ],
});

const handler = toNodeHandler(auth);
createServer((req, res) => {
  // Le Neon Auth hébergé répond au navigateur pour les origines de confiance ;
  // Better Auth seul n'envoie pas d'en-têtes CORS.
  const origin = req.headers.origin;
  if (origin === appOrigin || origin === "http://127.0.0.1:3000") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] ?? "content-type, authorization",
    );
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Expose-Headers", "set-auth-jwt, set-auth-token");
  }
  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }
  if (req.url === "/healthz") {
    res.writeHead(200).end("ok");
    return;
  }
  void handler(req, res);
}).listen(port, "0.0.0.0", () => {
  process.stdout.write(`local neon-auth on :${port}\n`);
});
