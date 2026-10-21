"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import type { ChannelDeletionImpact } from "@/app/api/v1/channel-sessions/[id]/route";
import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import {
  channelLabel,
  useChannelSessions,
  type ChannelSession,
} from "@/hooks/channels/useChannelSessions";
import { usePacingKnobs } from "@/hooks/channels/usePacingKnobs";
import { AntiBanSheet } from "./AntiBanSheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowsClockwise,
  CheckCircle,
  CircleNotch,
  Phone,
  Plus,
  ShieldCheck,
  Trash,
  Warning,
} from "@/lib/ui/icons";
import { lerEstadoDoCanal } from "@/lib/channels/estado";
import { useT } from "@/hooks/i18n/useT";

type Variant = "success" | "warning" | "error" | "neutral";

/**
 * O vocabulário saiu daqui para `lib/channels/estado.ts`, sem mudar uma palavra:
 * esta era a tradução mais completa do produto (cobre os cinco valores do CHECK)
 * e virou a fonte única. O que MUDOU foi o fallback — ele devolvia
 * `{ label: status }`, ou seja, o enum cru na tela no dia em que aparecesse um
 * estado fora da lista.
 */
function statusInfo(
  status: string,
  t: (texto: string) => string,
): { label: string; variant: Variant } {
  const l = lerEstadoDoCanal(status);
  return { label: t(l.rotulo), variant: l.tom };
}

function errMsg(err: unknown, fallback: string): string {
  return err instanceof ApiError && err.message ? err.message : fallback;
}

/**
 * "Este canal VIVE no serviço de WhatsApp?" — perguntado pelo nome da sessão,
 * que é o que as rotas de sessão de fato param, deslogam e apagam; a tela não
 * precisa conhecer provider nenhum.
 *
 * Duas perguntas da tela se respondem por aqui, e as duas na mesma direção:
 * excluir precisa do serviço no ar (a rota desloga o aparelho antes) e
 * RECONECTAR só existe para quem tem sessão a reiniciar. O canal oficial não tem
 * nenhuma das duas — a rota de reconectar o recusa com 422 —, então oferecer o
 * botão seria prometer uma ação que a API já sabe que não vai fazer.
 *
 * O lado que importa é garantido pelo schema: `channel_sessions_provider_ref_check`
 * exige nome de sessão em toda linha pareada por QR, então nenhuma delas escapa
 * da guarda. O canal oficial nasce sem esse nome (nada no código o grava nele) e
 * é revogado por credencial, sem tocar no transporte. Se algum dia uma linha
 * oficial guardar nome de sessão, o efeito é o botão exigir o serviço à toa:
 * restringe demais, nunca promete de menos.
 */
function dependeDoTransporte(c: ChannelSession): boolean {
  return Boolean(c.waha_session_name);
}

/** "3 conversas" / "1 conversa" — ou nada, quando não há o que contar. */
function contar(n: number, singular: string, plural: string): string | null {
  if (n <= 0) return null;
  return `${n} ${n === 1 ? singular : plural}`;
}

/** Junta os pedaços que sobraram numa enumeração legível ("a, b e c"). */
function enumerar(partes: (string | null)[]): string {
  const uteis = partes.filter((p): p is string => p !== null);
  const ultimo = uteis.pop() ?? "";
  return uteis.length > 0 ? `${uteis.join(", ")} et ${ultimo}` : ultimo;
}

export function ConnectionsClient({ wahaConfigured }: { wahaConfigured: boolean }) {
  const t = useT();
  const qc = useQueryClient();
  const {
    data: sessions,
    isLoading,
    isError,
    schemaOutdated,
  } = useChannelSessions({ refetchInterval: 10_000 });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [checking, setChecking] = useState(false);
  const [qr, setQr] = useState<{ sessionId: string; title: string } | null>(null);
  const [antiBanId, setAntiBanId] = useState<string | null>(null);
  const [toDelete, setToDelete] = useState<ChannelSession | null>(null);
  const pacingItems = usePacingKnobs().data?.items ?? [];

  const invalidate = useCallback(
    () => qc.invalidateQueries({ queryKey: ["channel-sessions"] }),
    [qc],
  );

  // Health check ao vivo de todos os canais — consulta o WAHA e grava
  // last_health_check_at. É a verificação de saúde de verdade (o status do DB
  // pode estar velho se o WAHA caiu sem emitir evento).
  const runHealthCheck = useCallback(
    async (list: ChannelSession[]) => {
      if (!wahaConfigured || list.length === 0) return;
      setChecking(true);
      try {
        await Promise.allSettled(
          list.map((c) => apiClient.get(`/api/v1/channel-sessions/${c.id}`)),
        );
        invalidate();
      } finally {
        setChecking(false);
      }
    },
    [wahaConfigured, invalidate],
  );

  const didInitialCheck = useRef(false);
  useEffect(() => {
    if (didInitialCheck.current || !sessions || sessions.length === 0) return;
    didInitialCheck.current = true;
    void runHealthCheck(sessions);
  }, [sessions, runHealthCheck]);

  const handleConnectNew = useCallback(async () => {
    setCreating(true);
    try {
      const res = await apiClient.post<{ data: ChannelSession }>("/api/v1/channel-sessions", {});
      invalidate();
      setQr({ sessionId: res.data.id, title: t("Connecter un nouveau WhatsApp") });
    } catch (err) {
      toast.error(errMsg(err, t("Impossible de démarrer la connexion.")));
    } finally {
      setCreating(false);
    }
  }, [invalidate]);

  // Reconexão suave: a maioria das quedas é passageira (rede, container
  // reiniciado) e a credencial pareada continua boa, então o número volta sem
  // ninguém pegar o celular. O modo que DESCARTA a credencial custa um
  // reescaneamento e por isso não é oferecido aqui — ele mora em `forcePair`, na
  // tela do QR, que só aparece depois que o modo suave falhou.
  const handleReconnect = useCallback(
    async (c: ChannelSession) => {
      setBusyId(c.id);
      try {
        await apiClient.post(`/api/v1/channel-sessions/${c.id}/reconnect`, {});
        invalidate();
        setQr({ sessionId: c.id, title: `${t("Reconnecter")} ${t(channelLabel(c))}` });
      } catch (err) {
        toast.error(errMsg(err, t("Impossible de reconnecter.")));
      } finally {
        setBusyId(null);
      }
    },
    [invalidate],
  );

  const forcePair = useCallback(
    async (sessionId: string) => {
      await apiClient.post(`/api/v1/channel-sessions/${sessionId}/reconnect`, { force: true });
      invalidate();
    },
    [invalidate],
  );

  const handleDeleted = useCallback(() => {
    setToDelete(null);
    invalidate();
  }, [invalidate]);

  const handleConnected = useCallback(() => {
    toast.success(t("WhatsApp connecté !"));
    setQr(null);
    invalidate();
  }, [invalidate]);

  const list = sessions ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {isError
            ? t("Impossible de charger vos numéros.")
            : list.length === 0
              ? t("Aucun numéro n’est encore connecté.")
              : `${list.length} ${t(list.length === 1 ? "numéro connecté" : "numéros connectés")}.`}
        </p>
        <div className="flex gap-2">
          {list.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={checking || !wahaConfigured}
              onClick={() => void runHealthCheck(list)}
            >
              <ArrowsClockwise
                size={14}
                className={checking ? "animate-spin" : undefined}
                aria-hidden
              />
              {t("Actualiser l’état")}
            </Button>
          )}
          <Button size="sm" disabled={creating || !wahaConfigured} onClick={handleConnectNew}>
            {creating ? (
              <CircleNotch size={14} className="animate-spin" aria-hidden />
            ) : (
              <Plus size={14} aria-hidden />
            )}
            {t("Connecter un nouveau WhatsApp")}
          </Button>
        </div>
      </div>

      {!wahaConfigured && (
        <div className="rounded-md border border-warning bg-warning-bg p-4 text-sm text-warning-fg">
          <p className="font-medium">{t("Le service WhatsApp n’est pas configuré.")}</p>
          <p className="mt-1">
            L’adresse et la clé du service (<code>WAHA_API_BASE_URL</code> et{" "}
            <code>WAHA_API_KEY</code>) manquent dans les variables d’environnement de cette
            installation. En attendant, il est impossible de connecter, reconnecter ou supprimer les
            numéros appairés par QR : supprimer un numéro le déconnecte aussi du téléphone, ce qui
            nécessite le service.
          </p>
          <p className="mt-1">
            Si tout fonctionne sur la même machine, démarrez le conteneur avec{" "}
            <code>docker compose up -d waha</code>. Il peut aussi arriver que le conteneur
            fonctionne alors que l’adresse configurée pointe vers un emplacement inexistant :
            redémarrer le conteneur ne corrigera pas cette configuration.
          </p>
        </div>
      )}

      {schemaOutdated && (
        <div className="rounded-md border border-warning bg-warning-bg p-4 text-sm text-warning-fg">
          <p className="font-medium">{t("Cette installation utilise une base de données obsolète.")}</p>
          <p className="mt-1">
            {t(
              "La migration qui enregistre les canaux supprimés doit encore être appliquée. D’ici là, un numéro supprimé continuera d’apparaître dans cette liste.",
            )}
          </p>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">{t("Chargement des connexions…")}</p>
      ) : isError ? (
        // Lista vazia por falha de carregamento renderizava a tela de primeira
        // instalação ("conecte seu primeiro número") para quem já tem número no
        // ar — o convite exato para parear de novo um aparelho que já está
        // conectado. Erro tem que aparecer como erro.
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Warning size={28} className="text-error-fg" aria-hidden />
          <p className="text-sm text-error-fg">
            {t(
              "Impossible de charger vos numéros : cette liste ne reflète peut-être pas les numéros existants.",
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {t(
              "Ne connectez pas un nouveau numéro pour l’instant : rechargez la page. Si le problème persiste, le serveur de l’installation est peut-être indisponible.",
            )}
          </p>
        </Card>
      ) : list.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-8 text-center">
          <Phone size={28} className="text-muted-foreground" aria-hidden />
          <p className="text-sm text-muted-foreground">
            {t("Connectez votre premier numéro WhatsApp pour commencer à répondre aux clients.")}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {list.map((c) => {
            const info = statusInfo(c.status, t);
            // Sem o serviço no ar a rota de exclusão falha fechado (503) para
            // quem depende dele: oferecer o botão seria prometer uma ação que
            // não acontece. O canal oficial não passa pelo transporte e continua
            // podendo ser excluído.
            const vivaNoTransporte = dependeDoTransporte(c);
            const podeExcluir = wahaConfigured || !vivaNoTransporte;
            return (
              <Card key={c.id} className="flex flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Phone size={16} className="text-muted-foreground" aria-hidden />
                      <span className="truncate text-sm font-medium">{channelLabel(c)}</span>
                    </div>
                    {c.phone_number && c.display_name && (
                      <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                        {c.phone_number}
                      </p>
                    )}
                  </div>
                  <Badge variant={info.variant}>{info.label}</Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {c.last_health_check_at
                    ? `Vérifié ${new Date(c.last_health_check_at).toLocaleString("fr-FR")}`
                    : t("Pas encore vérifié")}
                </p>
                <div className="mt-auto flex gap-2">
                  {/* Some no canal oficial em vez de aparecer desabilitado: não é
                      indisponibilidade passageira (como o Excluir sem o serviço no
                      ar), é uma ação que não existe para esse canal — e o clique
                      ainda abriria o diálogo de QR, que ele nunca vai ter. */}
                  {vivaNoTransporte && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busyId === c.id || !wahaConfigured}
                      onClick={() => handleReconnect(c)}
                    >
                      {busyId === c.id ? (
                        <CircleNotch size={14} className="animate-spin" aria-hidden />
                      ) : (
                        <ArrowsClockwise size={14} aria-hidden />
                      )}
                      {t("Reconnecter")}
                    </Button>
                  )}
                  <Button variant="outline" size="sm" onClick={() => setAntiBanId(c.id)}>
                    <ShieldCheck size={14} aria-hidden />
                    {t("Protection des envois")}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!podeExcluir}
                    aria-label={
                      podeExcluir
                        ? `${t("Supprimer")} ${t(channelLabel(c))}`
                        : `${t("Supprimer")} ${t(channelLabel(c))} — ${t("indisponible tant que le service WhatsApp n’est pas actif")}`
                    }
                    onClick={() => setToDelete(c)}
                  >
                    <Trash size={14} aria-hidden />
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AntiBanSheet
        item={pacingItems.find((i) => i.channel_session.id === antiBanId) ?? null}
        canWrite
        onClose={() => setAntiBanId(null)}
      />

      {toDelete && (
        <ExcluirCanalDialog
          canal={toDelete}
          onCancel={() => setToDelete(null)}
          onDeleted={handleDeleted}
        />
      )}

      {qr && (
        <QrDialog
          sessionId={qr.sessionId}
          title={qr.title}
          wahaConfigured={wahaConfigured}
          onClose={() => setQr(null)}
          onConnected={handleConnected}
          onForcePair={forcePair}
        />
      )}
    </div>
  );
}

/**
 * O que a exclusão faz com o que está pendurado no canal, em frases que o
 * operador reconhece.
 *
 * Exportada para teste porque é a parte que MENTE quando erra: a régua real de
 * apagar-ou-arquivar mora no servidor (`loadDeletionImpact`), e o diálogo só
 * traduz o preflight dela. Contagem zero não vira frase — "0 conversas" ocupa
 * espaço e não informa nada.
 */
export function frasesDoImpacto(
  impact: ChannelDeletionImpact,
  translate: (texto: string) => string = (texto) => texto,
): string[] {
  if (impact.outcome === "delete") {
    return [translate("Ce numéro n’a aucune conversation, aucun message ni aucune configuration associée.")];
  }

  const noInbox = enumerar([
    contar(impact.history.conversations, translate("conversa"), translate("conversas")),
    contar(impact.history.messages, translate("mensagem"), translate("mensagens")),
  ]);
  const semNumero = enumerar([
    contar(
      impact.history.agent_versions,
      translate("version d’agent"),
      translate("versions d’agent"),
    ),
    contar(
      impact.configuration.ai_routers,
      translate("roteador de IA"),
      translate("roteadores de IA"),
    ),
    contar(
      impact.configuration.channel_knobs,
      translate("réglage de protection des envois"),
      translate("réglages de protection des envois"),
    ),
  ]);

  const frases: string[] = [];
  if (noInbox) frases.push(`${translate("Continua no inbox:")} ${noInbox}.`);
  if (semNumero)
    frases.push(`${translate("Reste enregistré, mais sans numéro — il cesse de répondre :")} ${semNumero}.`);
  // Sobra o caso em que só há registro interno (auditoria de envio): nada a
  // listar, mas o canal continua sendo arquivado, e prometer "não tem nada
  // ligado" seria falso.
  if (frases.length === 0) {
    frases.push(
      translate("Ce canal contient des enregistrements internes ; il est donc archivé au lieu d’être supprimé."),
    );
  }
  return frases;
}

/**
 * Confirmação de exclusão que só promete o que o servidor vai fazer.
 *
 * O texto anterior era fixo, e texto fixo não descreve dois desfechos: ele
 * narrava o ramo que ARQUIVA ("as conversas continuam no inbox — só o canal é
 * removido") mesmo quando a linha vai ser apagada, e mandava "escanear o QR de
 * novo", que não existe no canal oficial. E calava justamente sobre o que o
 * operador teme perder — roteador de IA, versões de agente, ajuste de envio —,
 * que agora chega no preflight. O desfecho vem da MESMA função que o DELETE usa
 * para decidir, antes do clique.
 */
function ExcluirCanalDialog({
  canal,
  onCancel,
  onDeleted,
}: {
  canal: ChannelSession;
  onCancel: () => void;
  onDeleted: () => void;
}) {
  const t = useT();
  const [excluindo, setExcluindo] = useState(false);
  const {
    data: impact,
    isPending,
    isError,
  } = useQuery({
    queryKey: ["channel-deletion-impact", canal.id],
    queryFn: async () => {
      const res = await apiClient.get<{ data: { deletion_impact?: ChannelDeletionImpact } }>(
        `/api/v1/channel-sessions/${canal.id}?impact=1`,
      );
      return res.data.deletion_impact ?? null;
    },
    retry: false,
    staleTime: 0,
    gcTime: 0,
  });

  const excluir = async () => {
    setExcluindo(true);
    try {
      const res = await apiClient.delete<{
        data: { id: string; archived: boolean; impact: ChannelDeletionImpact };
      }>(`/api/v1/channel-sessions/${canal.id}`);
      const conversas = res.data.impact.history.conversations;
      toast.success(
        !res.data.archived
          ? t("Canal supprimé.")
          : conversas > 0
            ? `${t("Canal retiré.")} ${contar(conversas, t("conversation continue"), t("conversations continuent"))} ${t("dans l’Inbox.")}`
            : `${t("Canal retiré.")} ${t("Les éléments qui lui étaient liés restent enregistrés.")}`,
      );
      onDeleted();
    } catch (err) {
      toast.error(errMsg(err, t("Impossible de supprimer le canal.")));
    } finally {
      setExcluindo(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !excluindo && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t("Supprimer")} {t(channelLabel(canal))} ?
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2">
              <p>{t("Le numéro sera déconnecté de WhatsApp et retiré de cette liste.")}</p>
              {isPending ? (
                <p>{t("Vérification des éléments liés à ce numéro…")}</p>
              ) : isError || !impact ? (
                <p>
                  {t(
                    "Impossible de vérifier les éléments liés à ce numéro. La suppression reste possible : le serveur décide de supprimer ou d’archiver et préserve l’historique lorsqu’il existe.",
                  )}
                </p>
              ) : (
                <ul className="list-disc space-y-1 pl-5">
                  {frasesDoImpacto(impact, t).map((frase) => (
                    <li key={frase}>{frase}</li>
                  ))}
                </ul>
              )}
              <p>{t("Pour utiliser à nouveau ce numéro, vous devrez le reconnecter.")}</p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" disabled={excluindo} onClick={onCancel}>
            {t("Annuler")}
          </Button>
          {/* Enquanto o preflight não volta, confirmar seria confirmar no escuro:
              o diálogo ainda não sabe o que vai acontecer, então não pode pedir
              a decisão. */}
          <Button variant="destructive" disabled={excluindo || isPending} onClick={excluir}>
            {excluindo ? (
              <CircleNotch size={14} className="animate-spin" aria-hidden />
            ) : (
              <Trash size={14} aria-hidden />
            )}
            {t("Supprimer")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function QrDialog({
  sessionId,
  title,
  wahaConfigured,
  onClose,
  onConnected,
  onForcePair,
}: {
  sessionId: string;
  title: string;
  wahaConfigured: boolean;
  onClose: () => void;
  onConnected: () => void;
  onForcePair: (sessionId: string) => Promise<void>;
}) {
  const [status, setStatus] = useState<string>("STARTING");
  const [tick, setTick] = useState(0);
  const [pairing, setPairing] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (!wahaConfigured) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await apiClient.get<{ data: { status: string } }>(
          `/api/v1/channel-sessions/${sessionId}`,
        );
        if (cancelled) return;
        const s = res.data.status;
        setStatus(s);
        if (s === "WORKING" && !done.current) {
          done.current = true;
          onConnected();
        }
      } catch {
        // erro transitório de rede — o próximo tick tenta de novo
      }
    };
    void poll();
    const iv = setInterval(poll, 3000);
    return () => {
      cancelled = true;
      clearInterval(iv);
    };
  }, [sessionId, wahaConfigured, onConnected]);

  // O QR do WhatsApp EXPIRA — medido no WAHA, a imagem muda a cada ~20s. Carregar
  // uma vez só (o que esta tela fazia) deixava um código morto na tela: quem
  // demorasse a pegar o celular escaneava algo que o WhatsApp já tinha
  // invalidado. Recarregamos a cada 15s enquanto estivermos em SCAN_QR_CODE,
  // com folga sobre a expiração.
  // A primeira imagem não precisa de tick novo: o <img> só é montado quando o
  // status vira SCAN_QR_CODE, e essa montagem já busca o QR do momento. O
  // intervalo cuida só das renovações seguintes.
  useEffect(() => {
    if (status !== "SCAN_QR_CODE") return;
    const iv = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(iv);
  }, [status]);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Sur le téléphone : WhatsApp → Appareils connectés → Connecter un appareil → scannez le code.
          </DialogDescription>
        </DialogHeader>
        <div className="flex min-h-[16rem] flex-col items-center justify-center gap-3 py-2">
          {status === "SCAN_QR_CODE" ? (
            // Sem `key={tick}`: trocar só o src reaproveita o mesmo <img>, e o
            // browser segura o frame anterior até decodificar o novo. Remontar o
            // elemento a cada refresh é o que causaria o flash branco.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`/api/v1/channel-sessions/${sessionId}/qr?t=${tick}`}
              alt="QR code pour connecter WhatsApp"
              className="h-64 w-64 rounded-md border bg-white p-2"
            />
          ) : status === "WORKING" ? (
            <div className="flex flex-col items-center gap-2 text-sm font-medium text-success-fg">
              <CheckCircle size={28} weight="fill" aria-hidden />
              Connecté !
            </div>
          ) : status === "FAILED" || status === "STOPPED" ? (
            // Chegar aqui quase sempre significa credencial revogada: o número
            // foi desvinculado pelo celular e o engine não tem como voltar
            // sozinho. Antes esta tela era um beco sem saída ("tente
            // Reconectar" levava de volta ao mesmo FAILED); agora ela oferece a
            // única ação que de fato resolve.
            <div className="flex flex-col items-center gap-3 text-center">
              <p className="text-sm text-error-fg">
                Ce numéro a été dissocié de WhatsApp. Pour l’utiliser à nouveau, il faut l’appairer une nouvelle fois.
              </p>
              <Button
                size="sm"
                disabled={pairing}
                onClick={async () => {
                  setPairing(true);
                  try {
                    await onForcePair(sessionId);
                    setStatus("STARTING");
                  } catch (err) {
                    toast.error(errMsg(err, "Impossible de générer un nouveau QR code."));
                  } finally {
                    setPairing(false);
                  }
                }}
              >
                {pairing ? (
                  <CircleNotch size={14} className="animate-spin" aria-hidden />
                ) : (
                  <ArrowsClockwise size={14} aria-hidden />
                )}
                Générer un nouveau QR
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-sm text-muted-foreground">
              <CircleNotch size={28} className="animate-spin" aria-hidden />
              Préparation du code…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
