import http from "node:http";
import { randomUUID } from "node:crypto";

const PORT = Number(process.env.GATEWAY_PORT || 8788);
const GATEWAY_TOKEN = process.env.WHATSAPP_GATEWAY_TOKEN || "";
const EVOLUTION_BASE_URL = (process.env.EVOLUTION_GO_BASE_URL || "http://evolution-go:8080").replace(/\/$/, "");
const EVOLUTION_API_KEY = process.env.EVOLUTION_GO_API_KEY || "";
const NEON_DATA_API_URL = (process.env.NEON_DATA_API_URL || "").replace(/\/$/, "");
const NEON_SERVICE_ROLE_JWT = process.env.NEON_SERVICE_ROLE_JWT || "";
const EVOLUTION_WEBHOOK_SECRET = process.env.EVOLUTION_GO_WEBHOOK_SECRET || "";

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 5_000_000) reject(new Error("payload_too_large"));
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    req.on("error", reject);
  });
}

function bearer(req) {
  return (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
}

function requireInternal(req) {
  return Boolean(GATEWAY_TOKEN) && bearer(req) === GATEWAY_TOKEN;
}

function safeInstance(value) {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(value);
}

function instancePath(instance, suffix = "") {
  return `/instance/${encodeURIComponent(instance)}${suffix}`;
}

async function evolutionRequest(path, init = {}) {
  const response = await fetch(`${EVOLUTION_BASE_URL}${path}`, {
    ...init,
    headers: {
      apikey: EVOLUTION_API_KEY,
      accept: "application/json",
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text.slice(0, 400) };
  }
  if (!response.ok) {
    const error = new Error(`evolution_go_${response.status}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }
  return body;
}

function neonHeaders(extra = {}) {
  return {
    authorization: `Bearer ${NEON_SERVICE_ROLE_JWT}`,
    "content-type": "application/json",
    ...extra,
  };
}

async function neonQuery(table, params) {
  const url = new URL(`${NEON_DATA_API_URL}/rest/v1/${table}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { headers: neonHeaders() });
  if (!response.ok) throw new Error(`neon_${table}_${response.status}`);
  return response.json();
}

async function neonInsert(table, row, prefer = "return=minimal") {
  const response = await fetch(`${NEON_DATA_API_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: neonHeaders({ Prefer: prefer }),
    body: JSON.stringify(row),
  });
  if (!response.ok && response.status !== 409) {
    const detail = (await response.text()).slice(0, 400);
    throw new Error(`neon_${table}_${response.status}:${detail}`);
  }
  return response.status;
}

async function resolveInstance(instance, expectedOrganizationId = null) {
  if (!NEON_DATA_API_URL || !NEON_SERVICE_ROLE_JWT) throw new Error("gateway_database_not_configured");
  const rows = await neonQuery("channel_sessions", {
    select: "id,organization_id,evolution_instance_name",
    provider: "eq.evolution_go",
    evolution_instance_name: `eq.${instance}`,
    archived_at: "is.null",
  });
  const session = rows[0];
  if (!session) {
    const error = new Error("channel_instance_not_found");
    error.status = 404;
    throw error;
  }
  if (expectedOrganizationId && session.organization_id !== expectedOrganizationId) {
    const error = new Error("forbidden_cross_tenant");
    error.status = 403;
    throw error;
  }
  return session;
}

function numberFromRecipient(recipient) {
  return String(recipient || "").replace(/@(?:c\.us|s\.whatsapp\.net|lid)$/i, "").replace(/\D/g, "");
}

function extractExternalId(body) {
  return body?.key?.id || body?.message?.key?.id || body?.data?.key?.id || body?.data?.message?.key?.id || null;
}

function eventTypeFor(event) {
  if (event === "MESSAGES_UPSERT") return "whatsapp.message_received";
  if (event === "CONNECTION_UPDATE") return "whatsapp.connection_updated";
  if (event === "QRCODE_UPDATED") return "whatsapp.qr_updated";
  return "whatsapp.provider_event";
}

async function recordWebhook(payload, headers) {
  const instance = payload?.instance;
  if (!safeInstance(instance)) throw Object.assign(new Error("invalid_instance"), { status: 400 });
  const session = await resolveInstance(instance);
  const externalId = extractExternalId(payload?.data) || null;
  const rawBody = JSON.stringify(payload);
  const eventType = String(payload?.event || "UNKNOWN").toUpperCase();
  const status = await neonInsert("webhook_events_log", {
    organization_id: session.organization_id,
    channel_session_id: session.id,
    provider: "evolution_go",
    raw_body: rawBody,
    payload_parsed: payload,
    headers,
    event_type: eventType,
    external_id: externalId,
    valid_signature: true,
  });
  if (status === 409) return { duplicate: true, organizationId: session.organization_id };

  await supabaseInsert("event_log", {
    organization_id: session.organization_id,
    event_type: eventTypeFor(eventType),
    entity_kind: "whatsapp_webhook",
    payload: { instance, provider_event: payload },
    metadata: { provider: "evolution_go", external_id: externalId },
  });
  return { duplicate: false, organizationId: session.organization_id };
}

async function handleWebhook(req, res) {
  const auth = bearer(req);
  if (!EVOLUTION_WEBHOOK_SECRET || auth !== EVOLUTION_WEBHOOK_SECRET) return json(res, 401, { error: "invalid_webhook_secret" });
  try {
    const payload = await readJson(req);
    const headers = {
      user_agent: req.headers["user-agent"] || null,
      x_request_id: req.headers["x-request-id"] || null,
    };
    const result = await recordWebhook(payload, headers);
    return json(res, 200, { ok: true, ...result });
  } catch (error) {
    const status = error.status || (error.message === "invalid_json" ? 400 : 500);
    return json(res, status, { error: status === 500 ? "gateway_webhook_failed" : error.message });
  }
}

async function handleInternal(req, res, url) {
  if (!requireInternal(req)) return json(res, 401, { error: "unauthorized" });
  const parts = url.pathname.split("/").filter(Boolean);
  const operation = parts[2];
  const instance = parts[3];
  if (operation === "instances" && req.method === "POST") {
    const input = await readJson(req);
    if (!safeInstance(input.instance) || !input.organization_id) return json(res, 422, { error: "invalid_instance" });
    await resolveInstance(input.instance, input.organization_id);
    const result = await evolutionRequest("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName: input.instance,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        webhook: {
          enabled: true,
          url: "http://whatsapp-gateway:8788/webhooks/evolution-go",
          byEvents: false,
          base64: false,
          headers: { Authorization: `Bearer ${EVOLUTION_WEBHOOK_SECRET}` },
          events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
        },
        settings: {
          groupsIgnore: true,
          readMessages: false,
          readStatus: false,
        },
      }),
    });
    return json(res, 201, { instance: input.instance, provider_response: result });
  }
  if (operation === "send" && req.method === "POST") {
    const input = await readJson(req);
    const session = await resolveInstance(input.instance, input.organization_id);
    const number = numberFromRecipient(input.to);
    if (!number) return json(res, 422, { error: "invalid_recipient" });
    const path = input.media ? `/message/sendMedia/${encodeURIComponent(session.evolution_instance_name)}` : `/message/sendText/${encodeURIComponent(session.evolution_instance_name)}`;
    const body = input.media
      ? {
          number,
          mediatype: String(input.kind || "document"),
          media: input.media.url,
          caption: input.media.caption || undefined,
          fileName: input.media.filename || undefined,
        }
      : { number, text: input.body || "" };
    const result = await evolutionRequest(path, { method: "POST", body: JSON.stringify(body) });
    return json(res, 200, { external_id: extractExternalId(result), provider_response: result });
  }
  if (operation === "instances" && safeInstance(instance) && parts[4] === "reconnect" && req.method === "POST") {
    const input = await readJson(req);
    const organizationId = req.headers["x-organization-id"] || input.organization_id || null;
    const session = await resolveInstance(instance, organizationId);
    if (input.force === true) {
      await evolutionRequest(`/instance/logout/${encodeURIComponent(session.evolution_instance_name)}`, { method: "DELETE" });
    }
    const result = await evolutionRequest(`/instance/restart/${encodeURIComponent(session.evolution_instance_name)}`, { method: "PUT" });
    return json(res, 200, { status: result?.state || result?.status || "connecting" });
  }
  if (operation === "instances" && safeInstance(instance) && parts.length === 4 && req.method === "DELETE") {
    const organizationId = req.headers["x-organization-id"] || null;
    const session = await resolveInstance(instance, organizationId);
    await evolutionRequest(`/instance/${encodeURIComponent(session.evolution_instance_name)}`, { method: "DELETE" });
    return json(res, 200, { deleted: true });
  }
  if (operation === "instances" && safeInstance(instance) && parts[4] === "qrcode" && req.method === "GET") {
    const organizationId = req.headers["x-organization-id"] || null;
    const session = await resolveInstance(instance, organizationId);
    const result = await evolutionRequest(`/instance/${encodeURIComponent(session.evolution_instance_name)}/qrcode`);
    const base64 = result?.qrcode?.base64 || result?.base64 || result?.data?.qrcode?.base64 || result?.data?.base64;
    if (typeof base64 !== "string" || !base64) return json(res, 404, { error: "qr_not_ready" });
    const match = base64.match(/^data:([^;]+);base64,(.+)$/);
    const bytes = Buffer.from(match ? match[2] : base64, "base64");
    return json(res, 200, { bytes_base64: bytes.toString("base64"), content_type: match?.[1] || "image/png" });
  }
  if (operation === "media" && instance === "fetch" && req.method === "POST") {
    const input = await readJson(req);
    await resolveInstance(input.instance, input.organization_id);
    const response = await fetch(input.url);
    if (!response.ok) return json(res, 502, { error: "media_fetch_failed" });
    const arrayBuffer = await response.arrayBuffer();
    return json(res, 200, { bytes_base64: Buffer.from(arrayBuffer).toString("base64"), mime: response.headers.get("content-type") || input.hint_mime || "application/octet-stream" });
  }
  if (operation === "instances" && safeInstance(instance) && parts[4] === "status" && req.method === "GET") {
    const inputOrganizationId = req.headers["x-organization-id"] || null;
    const session = await resolveInstance(instance, inputOrganizationId);
    const result = await evolutionRequest(instancePath(session.evolution_instance_name, "/status"));
    return json(res, 200, { status: result.state || result.status || result.connectionStatus || null, detail: null });
  }
  return json(res, 404, { error: "gateway_route_not_found" });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
  try {
    if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { ok: true, service: "whatsapp-gateway" });
    if (req.method === "POST" && url.pathname === "/webhooks/evolution-go") return await handleWebhook(req, res);
    if (url.pathname.startsWith("/internal/v1/")) return await handleInternal(req, res, url);
    return json(res, 404, { error: "not_found" });
  } catch (error) {
    const status = error.status || 500;
    json(res, status, { error: status === 500 ? "gateway_internal_error" : error.message, request_id: randomUUID() });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.info(`[whatsapp-gateway] listening on ${PORT}`);
});
