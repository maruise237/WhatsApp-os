import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * QUEM AUTENTICA O REALTIME — e por que este teste existe.
 *
 * ─── O defeito, relatado olhando a tela ─────────────────────────────────────
 *
 * "Recebemos mensagem e só reflete no inbox se atualizarmos a página."
 *
 * ─── A era Supabase (o que este arquivo vigiava antes) ───────────────────────
 *
 * O cookie de sessão era httpOnly, o supabase-js do browser não enxergava a
 * sessão, e a callback `accessToken` PADRÃO terminava em `?? this.supabaseKey`:
 * o socket assinava com a ANON KEY. Canal anônimo responde SUBSCRIBED e a RLS
 * filtra do outro lado — ele nunca entrega nada, em silêncio. O conserto foi
 * instalar uma callback `accessToken` própria (nunca setAuth, que o
 * realtime-js 2.112.x passou a vencer com a callback padrão).
 *
 * ─── O cutover Neon mudou o mecanismo ────────────────────────────────────────
 *
 * Hoje o browser NÃO assina socket nenhum: `lib/neon/browser-client.ts` abre um
 * `EventSource` para a rota do próprio app (`/api/v1/realtime/stream`), e a
 * autenticação acontece no SERVIDOR — `createClient()` de
 * `lib/neon/server-client.ts` resolve o JWT RLS a partir do cookie de sessão
 * (nunca a anon key) e a rota só expõe uma lista fechada de tabelas.
 *
 * A garantia que este arquivo cobra continua a MESMA — o realtime nunca usa a
 * anon key e nunca autentica no cliente — mas o lugar onde ela mora mudou. Os
 * testes abaixo medem o contrato novo: token nenhum no cliente, fonte única no
 * servidor.
 */

/**
 * ⚠️ SEM COMENTÁRIOS, e não é capricho: a primeira versão deste teste procurava
 * `.setAuth(` no arquivo inteiro e casava com a PROSA que explica por que o
 * `setAuth` saiu. Um teste que não distingue código de comentário mede a coisa
 * errada — e aqui mediria ao contrário.
 */
function soCodigo(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

const BROWSER = soCodigo(readFileSync(join(process.cwd(), "lib/neon/browser-client.ts"), "utf8"));
const HOOK = soCodigo(readFileSync(join(process.cwd(), "hooks/realtime/useRealtimeChannel.ts"), "utf8"));
const ROTA = soCodigo(
  readFileSync(join(process.cwd(), "app/api/v1/realtime/stream/route.ts"), "utf8"),
);

describe("a autenticação do realtime depois do cutover Neon", () => {
  it("o canal do browser assina via EventSource na rota do próprio app — sem token no cliente", () => {
    // O EventSource é same-origin: o cookie de sessão httpOnly viaja sozinho e
    // a rota resolve o token no servidor. Um token no cliente (URL, header,
    // callback) seria a anon key de novo — exatamente o defeito histórico.
    expect(BROWSER, "o EventSource para /api/v1/realtime/stream sumiu do client").toMatch(
      /EventSource\(\s*`\/api\/v1\/realtime\/stream\?/,
    );
    expect(BROWSER, "voltou a instalar callback accessToken no cliente").not.toMatch(/accessToken/);
    expect(BROWSER, "voltou a chamar setAuth no cliente").not.toMatch(/setAuth\(/);
  });

  it("o hook do canal NÃO autentica por conta própria — fonte única", () => {
    // Duas fontes de token foi exatamente o defeito. O hook só abre o canal; a
    // autenticação mora na rota do servidor.
    expect(HOOK, "o hook voltou a chamar setAuth").not.toMatch(/\.setAuth\(/);
    expect(HOOK, "o hook voltou a buscar token por conta própria").not.toMatch(/realtime-token/);
    expect(HOOK, "o hook voltou a depender de accessToken").not.toMatch(/accessToken/);
  });

  it("a rota do stream autentica no SERVIDOR via createClient (cookie → RLS JWT), nunca anon", () => {
    // O coração do defeito antigo: quem assinava era o browser, com a anon key.
    // Hoje quem consulta é o servidor, com a sessão; a rota não pode ter
    // caminho anônimo nem expor tabela fora da allowlist.
    expect(ROTA, "a rota deixou de usar createClient (fonte única de sessão)").toMatch(/createClient/);
    expect(
      ROTA,
      "a rota deixou de vir de lib/neon/server-client (cookie → JWT RLS)",
    ).toMatch(/neon\/server-client/);
    expect(ROTA, "a rota devolve anon para o realtime").not.toMatch(/\banon\b/i);
    expect(ROTA, "a allowlist de tabelas sumiu da rota").toMatch(/ALLOWED_TABLES/);
  });
});
