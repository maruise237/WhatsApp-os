/* eslint-disable no-console */
/**
 * Wave 8 (EPIC-13) QA — Endpoint /api/internal/agents/run (ToolLoopAgent runtime).
 * Backend-only feature (no UI). Tests endpoint reachability + auth surface +
 * Zod validation + meta.requestId emission.
 *
 * Run: npx tsx scripts/qa-wave-13-08.ts
 */
import * as fs from "fs";
import * as path from "path";
import { carregarEnvLocal } from "../scripts/lib/env-de-teste";

// `process.env` vence o `.env.local` (scripts/lib/env-de-teste.ts).
carregarEnvLocal();

const BASE_URL = process.env.QA_BASE_URL ?? "http://localhost:3001";
const RUN_PATH = "/api/internal/agents/run";
const SECRET = process.env.INTERNAL_SECRET ?? "";

type Result = { ac: string; pass: boolean; evidence: string };
const results: Result[] = [];
const record = (ac: string, pass: boolean, evidence: string) => {
  results.push({ ac, pass, evidence });
  console.log(`[${pass ? "PASS" : "FAIL"}] ${ac} — ${evidence}`);
};

async function main() {
  // TC-01: missing secret should reach handler and return 401 unauthenticated
  // with the handler's message ("Internal secret missing or invalid.").
  // If middleware intercepts first, response code is identical (401) but
  // message will be the middleware default "Authentication required".
  {
    const res = await fetch(`${BASE_URL}${RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "00000000-0000-0000-0000-000000000000" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    const handlerReached = body.error?.message === "Internal secret missing or invalid.";
    record(
      "TC-01 endpoint joignable sans secret renvoie 401 du HANDLER (pas du middleware)",
      res.status === 401 && handlerReached,
      `status=${res.status} code=${body.error?.code} message="${body.error?.message}"`,
    );
  }

  // TC-02: invalid secret → 401 from handler
  {
    const res = await fetch(`${BASE_URL}${RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": "wrong-secret-xxx" },
      body: JSON.stringify({ run_id: "00000000-0000-0000-0000-000000000000" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    const handlerReached = body.error?.message === "Internal secret missing or invalid.";
    record(
      "TC-02 l'endpoint rejette un x-internal-secret invalide avec 401 du handler",
      res.status === 401 && handlerReached,
      `status=${res.status} message="${body.error?.message}"`,
    );
  }

  // TC-03: valid INTERNAL_SECRET via x-internal-secret header → handler reached
  // (run_id missing/invalid will fail downstream, but auth must pass)
  {
    const res = await fetch(`${BASE_URL}${RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify({ run_id: "00000000-0000-0000-0000-000000000000" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    const code = body.error?.code;
    // Handler reached implies auth passed; downstream behaviour can be 500 internal_error
    // (run row not found) — the key signal is "not 401 unauthenticated".
    const authPassed = res.status !== 401;
    record(
      "TC-03 un x-internal-secret valide contourne l'auth (handler atteint)",
      authPassed,
      `status=${res.status} code=${code}`,
    );
  }

  // TC-04: valid INTERNAL_SECRET via Authorization Bearer → handler reached
  {
    const res = await fetch(`${BASE_URL}${RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${SECRET}` },
      body: JSON.stringify({ run_id: "00000000-0000-0000-0000-000000000000" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
    const authPassed = res.status !== 401;
    record(
      "TC-04 Authorization Bearer <secret> accepté aussi (compat héritée)",
      authPassed,
      `status=${res.status} code=${body.error?.code}`,
    );
  }

  // TC-05: invalid run_id (not uuid) → 422 validation_failed
  {
    const res = await fetch(`${BASE_URL}${RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
      body: JSON.stringify({ run_id: "not-a-uuid" }),
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    record(
      "TC-05 run_id invalide (non-uuid) renvoie 422 validation_failed",
      res.status === 422 && body.error?.code === "validation_failed",
      `status=${res.status} code=${body.error?.code}`,
    );
  }

  // TC-06: malformed JSON body → 400 invalid_request
  {
    const res = await fetch(`${BASE_URL}${RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-internal-secret": SECRET },
      body: "{not-json",
    });
    const body = (await res.json().catch(() => ({}))) as { error?: { code?: string } };
    record(
      "TC-06 corps JSON malformé renvoie 400 invalid_request",
      res.status === 400 && body.error?.code === "invalid_request",
      `status=${res.status} code=${body.error?.code}`,
    );
  }

  // TC-07: response includes meta.requestId (UUID) for audit correlation
  {
    const res = await fetch(`${BASE_URL}${RUN_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ run_id: "00000000-0000-0000-0000-000000000000" }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      meta?: { requestId?: string };
      error?: { details?: { meta?: { requestId?: string } } };
    };
    const rid =
      body.meta?.requestId ??
      // fail() helper may put requestId nested under error.details depending on wrapper version
      body.error?.details?.meta?.requestId ??
      undefined;
    record(
      "TC-07 la réponse inclut meta.requestId (UUID) pour la corrélation avec le journal d'audit",
      typeof rid === "string" && /^[0-9a-f-]{36}$/i.test(rid),
      `requestId=${rid ?? "missing"}`,
    );
  }

  // TC-08: maxDuration=300 declared in vercel.ts (file-level check; cannot probe at runtime)
  {
    const vercelTs = fs.readFileSync(path.resolve(process.cwd(), "vercel.ts"), "utf8");
    const hasMaxDuration = /app\/api\/internal\/agents\/run\/route\.ts['"]\s*:\s*\{\s*maxDuration:\s*300\s*\}/.test(
      vercelTs,
    );
    record(
      "TC-08 vercel.ts déclare maxDuration=300 pour l'endpoint",
      hasMaxDuration,
      `vercel.ts ${hasMaxDuration ? "contains" : "missing"} maxDuration:300 entry`,
    );
  }

  const failed = results.filter((r) => !r.pass);
  console.log(`\n=== SUMMARY: ${results.length - failed.length}/${results.length} passed ===`);
  if (failed.length > 0) {
    console.log("FAILS:");
    for (const f of failed) console.log(`  - ${f.ac}: ${f.evidence}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("FATAL", err);
  process.exit(1);
});
