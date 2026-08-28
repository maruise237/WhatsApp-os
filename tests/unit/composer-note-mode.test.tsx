import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const createNoteMock = vi.fn();

vi.mock("@/hooks/inbox/useSendMessage", () => ({
  useSendMessage: () => ({ mutate: sendMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useCreateNote", () => ({
  useCreateNote: () => ({ mutate: createNoteMock, isPending: false }),
}));
vi.mock("@/hooks/inbox/useUploadMedia", () => ({
  useUploadMedia: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/inbox/useMessageTemplates", () => ({
  useMessageTemplates: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/inbox/useDraftReply", () => ({
  useDraftReply: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { Composer } from "@/components/inbox/Composer";

function renderComposer() {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <Composer conversationId="conv-1" />
    </QueryClientProvider>,
  );
}

describe("Composer + modo nota interna", () => {
  beforeEach(() => {
    sendMock.mockClear();
    createNoteMock.mockClear();
  });

  it("modo reply (default): envia normal via useSendMessage", () => {
    renderComposer();
    fireEvent.change(screen.getByLabelText(/message/i), { target: { value: "oi cliente" } });
    fireEvent.click(screen.getByRole("button", { name: /^envoyer$/i }));

    expect(sendMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-1", body: "oi cliente", type: "text" }),
      expect.anything(),
    );
    expect(createNoteMock).not.toHaveBeenCalled();
  });

  it("limpa o input na hora do envio, sem esperar onSuccess da API", () => {
    sendMock.mockImplementation(() => {
      /* simula request lento — onSuccess não é chamado */
    });
    renderComposer();
    const input = screen.getByLabelText(/message/i);
    fireEvent.change(input, { target: { value: "oi cliente" } });
    fireEvent.click(screen.getByRole("button", { name: /^envoyer$/i }));

    expect(input).toHaveValue("");
  });

  it("alterna pra modo nota interna: some anexo/rascunho/áudio, muda placeholder", () => {
    renderComposer();
    expect(screen.getByRole("button", { name: /joindre/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /suggérer une réponse/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /note interne/i }));

    expect(screen.queryByRole("button", { name: /joindre/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /suggérer une réponse/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /enregistrer un audio/i })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/note interne/i)).toBeInTheDocument();
  });

  it("modo nota interna: enviar chama useCreateNote e NÃO useSendMessage", () => {
    renderComposer();
    fireEvent.click(screen.getByRole("button", { name: /note interne/i }));

    fireEvent.change(screen.getByPlaceholderText(/note interne/i), { target: { value: "cliente ligou reclamando" } });
    fireEvent.click(screen.getByRole("button", { name: /^envoyer$/i }));

    expect(createNoteMock).toHaveBeenCalledWith(
      expect.objectContaining({ conversation_id: "conv-1", body: "cliente ligou reclamando" }),
      expect.anything(),
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});
