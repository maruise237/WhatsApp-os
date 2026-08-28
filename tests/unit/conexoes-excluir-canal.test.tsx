/**
 * Central de Conexões — o que a tela PROMETE antes de uma ação irreversível.
 *
 * Três enganos moravam aqui, todos do tipo que só aparece operando de verdade:
 *  1. listagem que falha renderizava a tela de primeira instalação ("conecte seu
 *     primeiro número") para quem já tem número no ar — convite a parear de novo
 *     um aparelho já conectado;
 *  2. o botão Excluir era clicável sem o serviço de WhatsApp ativo, e a rota
 *     falha fechado (503): o clique prometia uma desconexão que não acontecia;
 *  3. o diálogo jurava "só o canal é removido" e "escaneie o QR de novo" — texto
 *     fixo, escrito antes de o servidor saber decidir entre apagar e arquivar.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { IdiomaProvider } from "@/lib/i18n/IdiomaProvider";

import type { ChannelDeletionImpact } from "@/app/api/v1/channel-sessions/[id]/route";
import type * as CanaisModule from "@/hooks/channels/useChannelSessions";
import type { ChannelSession } from "@/hooks/channels/useChannelSessions";

const getMock = vi.fn();
const deleteMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...a: unknown[]) => getMock(...a),
    post: vi.fn(),
    delete: (...a: unknown[]) => deleteMock(...a),
  },
}));

const toastSuccess = vi.fn();
vi.mock("sonner", () => ({
  toast: { success: (m: string) => toastSuccess(m), error: vi.fn() },
}));

vi.mock("@/hooks/channels/usePacingKnobs", () => ({
  usePacingKnobs: () => ({ data: { items: [] } }),
}));

vi.mock("@/components/connections/AntiBanSheet", () => ({ AntiBanSheet: () => null }));

const listagem: {
  data: ChannelSession[] | undefined;
  isLoading: boolean;
  isError: boolean;
  schemaOutdated: boolean;
} = { data: [], isLoading: false, isError: false, schemaOutdated: false };

// Só a listagem é dublada: `channelLabel` e `deriveOverallHealth` do módulo real
// são o que está sob teste na bolinha e no rótulo dos botões.
vi.mock("@/hooks/channels/useChannelSessions", async (original) => {
  const real = await original<typeof CanaisModule>();
  return { ...real, useChannelSessions: () => listagem };
});

import { ConnectionsClient, frasesDoImpacto } from "@/components/connections/ConnectionsClient";
import { ConnectionHealthDot } from "@/components/connections/ConnectionHealthDot";

function canal(over: Partial<ChannelSession> = {}): ChannelSession {
  return {
    id: "canal-1",
    waha_session_name: "org_1111_aaa",
    display_name: "Vendas",
    phone_number: "5511999999999",
    status: "WORKING",
    status_reason: null,
    last_health_check_at: null,
    last_status_change_at: null,
    daily_message_limit: 250,
    is_warmup_complete: null,
    created_at: "2026-08-01T00:00:00Z",
    ...over,
  };
}

const IMPACTO_ARQUIVA: ChannelDeletionImpact = {
  outcome: "archive",
  history: { conversations: 12, messages: 340, agent_versions: 0 },
  configuration: { ai_routers: 1, channel_knobs: 0, before_send_traces: 7 },
};

function wrap(ui: React.ReactNode) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <IdiomaProvider locale="pt-BR">
      <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
    </IdiomaProvider>
  );
}

beforeEach(() => {
  getMock.mockReset();
  deleteMock.mockReset();
  toastSuccess.mockReset();
  listagem.data = [canal()];
  listagem.isLoading = false;
  listagem.isError = false;
  listagem.schemaOutdated = false;
});
afterEach(cleanup);

describe("listagem que falhou não vira 'primeira instalação'", () => {
  it("erro de carregamento aparece como erro, e não como zero número", () => {
    listagem.data = undefined;
    listagem.isError = true;

    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.getByText(/Impossible de charger vos numéros :/)).toBeInTheDocument();
    expect(screen.getByText(/cette liste ne reflète/)).toBeInTheDocument();
    expect(screen.queryByText(/Connectez votre premier numéro/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Aucun numéro n’est encore connecté/)).not.toBeInTheDocument();
  });

  it("org realmente sem número continua vendo o convite de primeira conexão", () => {
    listagem.data = [];

    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.getByText(/Connectez votre premier numéro/)).toBeInTheDocument();
  });

  it("banco sem a migration: avisa que canal excluído volta à lista", () => {
    listagem.schemaOutdated = true;

    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.getByText(/continuera d’apparaître dans cette liste/)).toBeInTheDocument();
  });

  it("bolinha da sidebar não diz 'Nenhuma conexão' quando a lista falhou", () => {
    listagem.data = undefined;
    listagem.isError = true;

    render(wrap(<ConnectionHealthDot />));

    expect(screen.getByLabelText("Não foi possível verificar as conexões")).toBeInTheDocument();
  });
});

describe("Excluir sem o serviço de WhatsApp ativo", () => {
  it("fica desabilitado para o número pareado por QR, dizendo por quê", () => {
    render(wrap(<ConnectionsClient wahaConfigured={false} />));

    const botao = screen.getByRole("button", { name: /^Supprimer Vendas — indisponible/ });
    expect(botao).toBeDisabled();
  });

  it("continua disponível para o canal que não depende do transporte", () => {
    listagem.data = [canal({ waha_session_name: null, display_name: "Oficial" })];

    render(wrap(<ConnectionsClient wahaConfigured={false} />));

    expect(screen.getByRole("button", { name: "Supprimer Oficial" })).toBeEnabled();
  });
});

/**
 * Mesma classe do Excluir, três linhas acima na mesma tela: o botão prometia uma
 * ação que a API recusa (422 `channel_without_session`). O canal oficial não tem
 * sessão no transporte para reiniciar — e o clique ainda abria o diálogo de QR,
 * que ele nunca vai ter, deixando o operador esperando um código que não vem.
 */
describe("Reconectar não é oferecido a quem não vive no transporte", () => {
  it("canal oficial não recebe o botão", () => {
    listagem.data = [canal({ waha_session_name: null, display_name: "Oficial" })];

    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.queryByRole("button", { name: /Reconnecter/ })).not.toBeInTheDocument();
    // Não-vacuidade: o card É o do canal oficial, e as ações dele continuam lá.
    expect(screen.getByRole("button", { name: "Supprimer Oficial" })).toBeInTheDocument();
  });

  it("número pareado por QR continua recebendo o botão", () => {
    render(wrap(<ConnectionsClient wahaConfigured />));

    expect(screen.getByRole("button", { name: /Reconnecter/ })).toBeEnabled();
  });
});

describe("diálogo de exclusão diz a verdade antes do clique", () => {
  it("consome o preflight e lista o que fica guardado e o que para de atender", async () => {
    getMock.mockResolvedValue({ data: { deletion_impact: IMPACTO_ARQUIVA } });

    render(wrap(<ConnectionsClient wahaConfigured />));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Vendas" }));

    await waitFor(() =>
      expect(getMock).toHaveBeenCalledWith("/api/v1/channel-sessions/canal-1?impact=1"),
    );
    expect(
      await screen.findByText("Reste dans l’Inbox : 12 conversations e 340 messages."),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Reste enregistré, mais sans numéro — il cesse de répondre : 1 routeur IA."),
    ).toBeInTheDocument();
    // A promessa antiga: valia só para o número pareado por QR, e mesmo nele
    // dizia que "só o canal é removido".
    expect(screen.queryByText(/escanear o QR de novo/)).not.toBeInTheDocument();
    expect(screen.queryByText(/só o canal é removido/)).not.toBeInTheDocument();
  });

  it("não deixa confirmar enquanto não sabe o que vai acontecer", async () => {
    getMock.mockReturnValue(new Promise(() => {}));

    render(wrap(<ConnectionsClient wahaConfigured />));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Vendas" }));

    const confirmar = await screen.findByRole("button", { name: "Supprimer" });
    expect(confirmar).toBeDisabled();
    expect(screen.getByText(/Vérification des éléments liés/)).toBeInTheDocument();
  });

  it("preflight que falhou não vira promessa: admite que não sabe", async () => {
    getMock.mockRejectedValue(new Error("500"));

    render(wrap(<ConnectionsClient wahaConfigured />));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Vendas" }));

    expect(
      await screen.findByText(/Impossible de vérifier les éléments liés/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Supprimer" })).toBeEnabled();
  });

  it("confirmar usa o impacto que o DELETE devolve para contar a conversa preservada", async () => {
    getMock.mockResolvedValue({ data: { deletion_impact: IMPACTO_ARQUIVA } });
    deleteMock.mockResolvedValue({
      data: { id: "canal-1", archived: true, impact: IMPACTO_ARQUIVA },
    });

    render(wrap(<ConnectionsClient wahaConfigured />));
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Vendas" }));
    fireEvent.click(await screen.findByRole("button", { name: "Supprimer" }));

    await waitFor(() =>
      expect(deleteMock).toHaveBeenCalledWith("/api/v1/channel-sessions/canal-1"),
    );
    await waitFor(() =>
      expect(toastSuccess).toHaveBeenCalledWith(
        "Canal retiré. 12 conversations continuent dans l’Inbox.",
      ),
    );
  });
});

describe("frasesDoImpacto", () => {
  it("canal virgem: diz que não há nada ligado — é o único caso em que a linha some", () => {
    expect(
      frasesDoImpacto({
        outcome: "delete",
        history: { conversations: 0, messages: 0, agent_versions: 0 },
        configuration: { ai_routers: 0, channel_knobs: 0, before_send_traces: 0 },
      }),
    ).toEqual(["Este número não tem conversa, mensagem nem configuração ligada a ele."]);
  });

  it("contagem zero não vira frase", () => {
    const frases = frasesDoImpacto({
      outcome: "archive",
      history: { conversations: 0, messages: 0, agent_versions: 2 },
      configuration: { ai_routers: 0, channel_knobs: 0, before_send_traces: 0 },
    });
    expect(frases).toEqual(["Fica salvo, mas sem número — para de atender: 2 versões de agente."]);
  });

  it("só auditoria pendurada: explica o arquivamento em vez de prometer que não há nada", () => {
    const frases = frasesDoImpacto({
      outcome: "archive",
      history: { conversations: 0, messages: 0, agent_versions: 0 },
      configuration: { ai_routers: 0, channel_knobs: 0, before_send_traces: 4 },
    });
    expect(frases).toEqual([
      "Este canal tem registros internos, por isso ele é arquivado em vez de apagado.",
    ]);
  });
});
