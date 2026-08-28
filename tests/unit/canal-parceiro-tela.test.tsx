import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A tela de conectar um número por provedor parceiro.
 *
 * ─── O defeito que estes casos existem para impedir ─────────────────────────
 *
 * Conectar são DUAS pontas: a chave (nós falamos com o provedor) e o webhook (o
 * provedor fala conosco). Quem faz só a primeira **envia e nunca recebe** — e o
 * defeito aparece horas depois, como "o cliente respondeu e não chegou", sem
 * nada na tela dizendo por quê.
 *
 * Por isso o segundo passo é obrigatório na interface, e por isso metade dos
 * casos prova que ele APARECE com o que precisa ser copiado.
 */

const getMock = vi.fn();
const postMock = vi.fn();
vi.mock("@/lib/api/client", () => ({
  apiClient: {
    get: (...a: unknown[]) => getMock(...a),
    post: (...a: unknown[]) => postMock(...a),
  },
}));
const toastOk = vi.fn();
const toastErro = vi.fn();
vi.mock("sonner", () => ({ toast: { success: (m: string) => toastOk(m), error: (m: string) => toastErro(m) } }));
vi.mock("@/lib/clipboard", () => ({ copyToClipboard: vi.fn(async () => true) }));

import { CanalParceiroClient } from "@/components/connections/CanalParceiroClient";

const desconectado = {
  data: {
    label: "Zernio",
    connected: false,
    account_id: null,
    phone_number: null,
    display_name: null,
    status: null,
    has_api_key: false,
    webhook_url: null,
  },
};

const conectado = {
  data: {
    ...desconectado.data,
    connected: true,
    account_id: "acc_1",
    phone_number: "+19392301037",
    display_name: "MP wp",
    status: "WORKING",
    has_api_key: true,
    webhook_url: "https://crm.exemplo/api/v1/webhooks/channel/tok123",
  },
};

beforeEach(() => {
  getMock.mockReset();
  postMock.mockReset();
  toastOk.mockReset();
  toastErro.mockReset();
});

describe("estado inicial", () => {
  it("mostra a marca que veio do SERVIDOR, não uma string da tela", async () => {
    // O rótulo vem do servidor porque a tela não pode nomear provider — e para
    // que um segundo parceiro não exija mudar este componente.
    getMock.mockResolvedValue(desconectado);
    render(<CanalParceiroClient />);
    expect(await screen.findByText(/Connecter via Zernio/)).toBeInTheDocument();
  });

  it("diz que não está conectado quando não está", async () => {
    getMock.mockResolvedValue(desconectado);
    render(<CanalParceiroClient />);
    expect(await screen.findByText("Non connecté")).toBeInTheDocument();
  });

  it("mostra o número quando já está conectado", async () => {
    getMock.mockResolvedValue(conectado);
    render(<CanalParceiroClient />);
    expect(await screen.findByText("Connecté")).toBeInTheDocument();
    expect(screen.getByText(/\+19392301037/)).toBeInTheDocument();
  });

  it("com chave gravada, o campo diz que existe — nunca mostra qual é", async () => {
    getMock.mockResolvedValue(conectado);
    render(<CanalParceiroClient />);
    const campo = await screen.findByLabelText(/Clé API/);
    expect(campo).toHaveAttribute("placeholder", expect.stringMatching(/enregistrée/i));
    expect((campo as HTMLInputElement).value).toBe("");
    expect(campo).toHaveAttribute("type", "password");
  });

  it("falha ao ler o estado não trava a tela — o formulário continua servindo", async () => {
    getMock.mockRejectedValue(new Error("500"));
    render(<CanalParceiroClient />);
    expect(await screen.findByLabelText(/Clé API/)).toBeInTheDocument();
  });
});

describe("conectar", () => {
  const preencher = async () => {
    fireEvent.change(await screen.findByLabelText("Compte"), { target: { value: "acc_1" } });
    fireEvent.change(screen.getByLabelText(/Clé API/), { target: { value: "sk_live_x" } });
  };

  it("o botão fica desabilitado sem os dois campos", async () => {
    getMock.mockResolvedValue(desconectado);
    render(<CanalParceiroClient />);
    const botao = await screen.findByRole("button", { name: /connecter/i });
    expect(botao).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Compte"), { target: { value: "acc_1" } });
    expect(botao).toBeDisabled();
  });

  it("manda conta e chave para a rota", async () => {
    getMock.mockResolvedValue(desconectado);
    postMock.mockResolvedValue({
      data: { webhook_url: "https://x/w/1", webhook_secret: "s3cr3t", phone_number: null, quality_rating: null },
    });
    render(<CanalParceiroClient />);
    await preencher();
    fireEvent.click(screen.getByRole("button", { name: /connecter/i }));

    await waitFor(() =>
      expect(postMock).toHaveBeenCalledWith("/api/v1/channels/partner", {
        account_id: "acc_1",
        api_key: "sk_live_x",
      }),
    );
  });

  it("DEPOIS de conectar mostra a URL e o segredo, com o aviso de que sem isso não recebe", async () => {
    getMock.mockResolvedValue(desconectado);
    postMock.mockResolvedValue({
      data: {
        webhook_url: "https://crm.exemplo/api/v1/webhooks/channel/tok123",
        webhook_secret: "segredo-do-webhook",
        phone_number: "+19392301037",
        quality_rating: "GREEN",
      },
    });
    render(<CanalParceiroClient />);
    await preencher();
    fireEvent.click(screen.getByRole("button", { name: /connecter/i }));

    expect(await screen.findByText(/Il reste à connecter le retour/)).toBeInTheDocument();
    expect(screen.getByText("https://crm.exemplo/api/v1/webhooks/channel/tok123")).toBeInTheDocument();
    expect(screen.getByText("segredo-do-webhook")).toBeInTheDocument();
    // O aviso é o que impede o operador parar no passo 1 e achar que terminou.
    expect(screen.getByText(/envoie mais ne reçoit pas/)).toBeInTheDocument();
  });

  it("a chave sai do campo depois de gravada — não deixa uma cópia a mais do segredo", async () => {
    getMock.mockResolvedValue(desconectado);
    postMock.mockResolvedValue({ data: { webhook_url: "https://x/w/1", webhook_secret: "s" } });
    render(<CanalParceiroClient />);
    await preencher();
    fireEvent.click(screen.getByRole("button", { name: /connecter/i }));

    await waitFor(() => expect((screen.getByLabelText(/Clé API/) as HTMLInputElement).value).toBe(""));
  });

  it("credencial recusada mostra o motivo do provedor, não um erro genérico", async () => {
    getMock.mockResolvedValue(desconectado);
    postMock.mockRejectedValue(new Error("Chave recusada pelo provedor."));
    render(<CanalParceiroClient />);
    await preencher();
    fireEvent.click(screen.getByRole("button", { name: /connecter/i }));

    await waitFor(() => expect(toastErro).toHaveBeenCalledWith("Chave recusada pelo provedor."));
    // E NÃO mostra o passo 2: não há webhook a colar se a conexão falhou.
    expect(screen.queryByText(/Il reste à connecter le retour/)).not.toBeInTheDocument();
  });

  it("já conectado mostra a URL do webhook mas NÃO o segredo", async () => {
    getMock.mockResolvedValue(conectado);
    render(<CanalParceiroClient />);
    expect(await screen.findByText("https://crm.exemplo/api/v1/webhooks/channel/tok123")).toBeInTheDocument();
    expect(screen.queryByText(/Secret \(signature\)/)).not.toBeInTheDocument();
  });
});
