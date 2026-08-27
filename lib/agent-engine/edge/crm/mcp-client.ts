/**
 * Config da borda CRM pós-fusão. O transporte MCP HTTP do Vendaval MORREU: o CRM
 * é o mesmo processo/banco agora. O que resta desta borda:
 *   - o client admin Neon que os handlers do app exigem (ex.: sendMessageHandler)
 *     — ele BYPASSA RLS, então todo uso filtra organization_id manualmente, de
 *     fonte confiável (regra dura nº 1);
 *   - CrmTransportError: o erro que o runtime trata como TRANSIENTE (Neon/WAHA
 *     indisponível) — o job re-tenta pela fila, nunca vira mensagem ao lead.
 *
 * O arquivo mantém o nome mcp-client.ts porque é o seam que todos os módulos do
 * engine já importam (CrmEdgeConfig) — o conteúdo é a versão fundida.
 */
import { createClient, type SupabaseClient } from "@/lib/neon/script-client";

export interface CrmEdgeConfig {
  /** admin client (service role) — usado só pelas bordas que chamam handlers do app. */
  supabase: SupabaseClient;
  /**
   * ai_agents.id do agente PUBLICADO deste turno (Fase 2B) — vira o actor.id do
   * envio (audit/metadata do CRM). Ausente = id genérico do engine.
   */
  agentActorId?: string;
}

/** Falha de transporte da borda (Neon/WAHA fora) — transiente, o job re-tenta. */
export class CrmTransportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CrmTransportError';
  }
}

export function crmEdgeConfigFromEnv(env: {
  NEON_DATA_API_URL: string;
  NEON_SERVICE_ROLE_JWT: string;
}): CrmEdgeConfig {
  return {
    supabase: createClient(env.NEON_DATA_API_URL, env.NEON_SERVICE_ROLE_JWT, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}
