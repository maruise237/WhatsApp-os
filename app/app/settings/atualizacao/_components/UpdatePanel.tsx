"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { apiClient } from "@/lib/api/client";
import { ApiError } from "@/lib/api/types";
import { copyToClipboard } from "@/lib/clipboard";
import { useT } from "@/hooks/i18n/useT";
import { useSystemVersion } from "@/hooks/system/useSystemVersion";
import { markdownParaTextoSimples } from "@/lib/system/changelog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// Sem `cd <pasta>`: o instalador não fixa o nome da pasta do clone
// (REPO_DIR é configurável, default "deskcommcrm" minúsculo) — quem tem
// acesso ao servidor já sabe entrar na pasta onde instalou.
const COMANDO_MANUAL = "bash hostgator-setup-kit/update.sh";

/** Tira o "v" das versões: a tela fala "1.1.0", não "v1.1.0". */
function semV(versao: string | undefined): string {
  return (versao ?? "").replace(/^v/i, "");
}

/**
 * O comando que RESOLVE depois de uma tentativa fracassada — e resolver aqui é
 * voltar para a versão que funcionava, não reinstalar a que acabou de quebrar.
 *
 * O código do servidor já está na versão nova (a troca acontece antes de o app
 * subir): sem `--force` o script responde "você já está na versão mais recente"
 * e não faz nada, e sem `--to` ele reinstalaria exatamente a release ruim —
 * caminho sem volta se o problema for a release, e não um azar de rede.
 *
 * Só aponta para trás quando sabe para onde: `from_version` pode ser uma marca
 * de desenvolvimento (instalação fora de release), e aí não existe imagem
 * publicada com esse nome para puxar — nesse caso, só `--force`.
 */
function comandoDeVolta(fromVersion: string | undefined): string {
  const anterior = semV(fromVersion);
  return /^\d+\.\d+\.\d+/.test(anterior)
    ? `bash hostgator-setup-kit/update.sh --to v${anterior} --force`
    : "bash hostgator-setup-kit/update.sh --force";
}

const PASSOS = [
  { chave: "backup", texto: "Sauvegarde de vos données en cours" },
  { chave: "codigo", texto: "Téléchargement de la nouvelle version" },
  { chave: "banco", texto: "Mise à jour de la base de données" },
  { chave: "app", texto: "Redémarrage du système" },
] as const;

export function UpdatePanel() {
  const t = useT();
  const { data, isError } = useSystemVersion({ refetchInterval: 5_000 });
  const queryClient = useQueryClient();
  const [erro, setErro] = useState<string | null>(null);

  const atualizar = useMutation({
    mutationFn: async () => apiClient.post("/api/v1/system/update", {}),
    onSuccess: () => {
      setErro(null);
      queryClient.invalidateQueries({ queryKey: ["system-version"] });
    },
    onError: (err) => {
      // 409 é estado de negócio ("já tem um run rodando" / "já está em dia"),
      // não falha técnica — mostra a mensagem que a API já escreveu em
      // português em vez de um genérico "tente de novo".
      const mensagem =
        err instanceof ApiError && err.status === 409
          ? err.message
          : t("Impossible de démarrer la mise à jour. Réessayez dans quelques instants.");
      setErro(mensagem);
    },
  });

  // O app reinicia no meio da atualização: a requisição falhar aqui é
  // ESPERADA, não é erro. Só é erro de verdade se nunca houve run em curso.
  const rodando = data?.run?.status === "dispatched";
  if (isError && rodando) return <Reiniciando />;
  if (!data) {
    return (
      <Layout>
        <p className="text-sm text-muted-foreground">{t("Chargement…")}</p>
      </Layout>
    );
  }

  const versao = semV(data.current_version);
  const nova = semV(data.latest_version);

  if (rodando) {
    return (
      <Layout titulo={t("Mise à jour vers la version {version}").replace("{version}", nova)}>
        <ol className="space-y-2 text-sm">
          {PASSOS.map((passo) => {
            const indice = PASSOS.findIndex((p) => p.chave === data.run?.last_step);
            const atual = PASSOS.findIndex((p) => p.chave === passo.chave);
            const feito = indice >= 0 && atual <= indice;
            return (
              <li key={passo.chave} className={feito ? "text-foreground" : "text-muted-foreground"}>
                {feito ? "✓" : "○"} {t(passo.texto)}
              </li>
            );
          })}
        </ol>
        <p className="mt-4 text-sm text-muted-foreground">
          {t(
            "Le système sera indisponible quelques instants, puis redémarrera seul. Vous pouvez laisser cette page ouverte.",
          )}
        </p>
      </Layout>
    );
  }

  // As versões de uma falha vêm do RUN, nunca de `current_version`: essa
  // última é o `git describe` do host, e a troca de código já tinha
  // acontecido quando o app quebrou — ela nomeia a versão que FALHOU. O run
  // sabe de onde saiu e para onde tentou ir.
  const alvo = semV(data.run?.to_version);
  const anterior = semV(data.run?.from_version);

  if (data.run?.status === "failed_rolled_back") {
    return (
      <Layout
        titulo={t("La mise à jour vers la version {version} a échoué").replace("{version}", alvo)}
      >
        <p className="text-sm">
          {t(
            "Le système a été restauré vers la version {version}, actuellement en service, et vos données sont intactes.",
          ).replace("{version}", anterior)}{" "}
          {t(
            "La base de données avait déjà été mise à jour et le reste — c’est sans danger, la version {version} fonctionne avec elle.",
          ).replace("{version}", anterior)}{" "}
          {t(
            "Si vous souhaitez également annuler la mise à jour de la base de données, utilisez la sauvegarde créée avant la tentative",
          )}{" "}
          (<code>bash hostgator-setup-kit/restore.sh</code>).
        </p>
        <DetalhesTecnicos texto={data.run.log_tail} />
        <Saida
          botao={false}
          mutate={() => atualizar.mutate()}
          isPending={atualizar.isPending}
          erro={erro}
          texto={t(
            "Pour restaurer entièrement le serveur vers la version {version} — y compris le code déjà remplacé —, une personne ayant accès peut exécuter :",
          ).replace("{version}", anterior)}
          comando={comandoDeVolta(data.run.from_version)}
        />
      </Layout>
    );
  }

  if (data.run?.status === "failed") {
    // Já houve aqui um texto próprio para "o host recusou antes de começar",
    // detectado por `last_step` nulo. Era sinal errado: `run_progress` não tem
    // retry e engole falha (o `run_result` insiste por ~2 min), então uma
    // atualização que mexeu em TUDO e falhou no fim chega aqui com `last_step`
    // nulo sempre que os POSTs de progresso não passaram — e a tela dizia "nada
    // mudou" e não oferecia saída nenhuma, justo quando o dono mais precisa do
    // comando de volta. A cópia alarmante erra para o lado de fazer conferir, e
    // o log logo abaixo explica em português quando foi só uma recusa.
    return (
      <Layout
        titulo={t("La mise à jour vers la version {version} a échoué").replace("{version}", alvo)}
      >
        <p className="text-sm">
          {t(
            "Je n’ai pas réussi à restaurer automatiquement la version {previous} : le système peut fonctionner avec la version {target} défectueuse ou être indisponible. Vos données sont intactes et la sauvegarde créée avant la tentative reste conservée sur le serveur.",
          )
            .replace("{previous}", anterior)
            .replace("{target}", alvo)}
        </p>
        <DetalhesTecnicos texto={data.run.log_tail} />
        <Saida
          botao={false}
          mutate={() => atualizar.mutate()}
          isPending={atualizar.isPending}
          erro={erro}
          texto={t(
            "Pour remettre le système en service avec la version {version}, une personne ayant accès au serveur doit exécuter :",
          ).replace("{version}", anterior)}
          comando={comandoDeVolta(data.run.from_version)}
        />
      </Layout>
    );
  }

  if (data.run?.status === "unknown") {
    return (
      <Layout titulo={t("Impossible de déterminer comment elle s’est terminée")}>
        <p className="text-sm">
          {t(
            "J’ai commencé la mise à jour vers la version {version}, mais j’ai perdu le contact avec le serveur avant la fin. Vérifiez que le système fonctionne normalement — si c’est le cas, la mise à jour a probablement réussi.",
          ).replace("{version}", alvo)}
        </p>
        <DetalhesTecnicos texto={data.run.log_tail} />
        <Saida
          botao={Boolean(data.update_available)}
          mutate={() => atualizar.mutate()}
          isPending={atualizar.isPending}
          erro={erro}
          texto={t("Pour vérifier depuis le serveur, une personne disposant d’un accès peut exécuter :")}
          comando={COMANDO_MANUAL}
        />
      </Layout>
    );
  }

  if (!data.agent_online) {
    return (
      <Layout titulo={t("Mise à jour automatique indisponible")}>
        <p className="text-sm">
          {t(
            "Je n’arrive pas à communiquer avec le serveur où le système est installé et je ne peux donc pas le mettre à jour automatiquement. Une personne ayant accès au serveur peut ouvrir le dossier d’installation et exécuter cette commande — s’il s’agit de la première fois, exécutez-la deux fois : la première télécharge le nouveau programme et la seconde active le bouton de cette page.",
          )}
        </p>
        <Comando comando={COMANDO_MANUAL} />
        <p className="mt-3 text-sm text-muted-foreground">
          {t("Version installée : {version}.").replace("{version}", versao)}
        </p>
      </Layout>
    );
  }

  // O host disse, com todas as letras, que não conseguiu comparar. Recusar a
  // agir é defensável; afirmar "é a mais recente" sem ter conferido não é — a
  // conta disso é o cliente nunca receber a próxima correção de segurança.
  if (data.compare_failed) {
    return (
      <Layout titulo={t("Impossible de vérifier s’il existe une nouvelle version")}>
        <p className="text-sm">
          {t(
            "Le serveur n’a pas pu comparer votre version ({version}) avec la dernière version publiée — il s’agit généralement d’une connexion instable ou d’un manque d’espace disque lors de la vérification. Cela ne signifie ni que le système est obsolète ni qu’il est à jour : cela signifie que je ne sais pas.",
          ).replace("{version}", versao)}
        </p>
        <p className="mt-3 text-sm">
          {t(
            "Je réessaierai automatiquement toutes les quelques minutes. Si le problème persiste, une personne ayant accès au serveur peut vérifier immédiatement avec :",
          )}
        </p>
        <Comando comando={COMANDO_MANUAL} />
      </Layout>
    );
  }

  if (!data.update_available && !data.off_release) {
    return (
      <Layout titulo={t("Vous utilisez la version {version}").replace("{version}", versao)}>
        <p className="text-sm text-muted-foreground">
          {t("C’est la version la plus récente. Aucune action n’est nécessaire.")}
        </p>
      </Layout>
    );
  }

  // Sem nenhuma versão nova para oferecer numa instalação que não está numa
  // versão publicada, há duas explicações bem diferentes — e afirmar a
  // errada é a frase tranquilizadora sem base que este produto proíbe:
  //
  // 1. O servidor está À FRENTE da última publicada (existe release, e o
  //    HEAD já a contém). Não é defeito — veio da forma como foi instalado.
  // 2. Este fork NUNCA teve nenhuma release publicada. Dizer "à frente da
  //    publicada" aqui afirmaria a existência de algo que não existe.
  //
  // Sem distinguir os dois, a tela de baixo renderizava "Versão  disponível",
  // com o número vazio, e um botão que a API recusa com 409.
  if (!nova) {
    if (!data.has_known_release) {
      return (
        <Layout titulo={t("Aucune version n’est encore publiée")}>
          <p className="text-sm">
            {t(
              "Ce projet ne possède encore aucune version publiée à comparer avec votre installation — c’est normal pour un nouveau fork ou un projet récemment créé depuis le code source. Aucune mise à jour n’est nécessaire pour le moment, et ce n’est pas un problème.",
            )}
          </p>
          <p className="mt-3 text-sm">
            {t(
              "Lorsque la première version publiée sera disponible, elle apparaîtra ici automatiquement. Une personne ayant accès au serveur peut vérifier à tout moment avec la commande ci-dessous — elle ne modifie rien sans avertissement :",
            )}
          </p>
          <Comando comando={COMANDO_MANUAL} />
        </Layout>
      );
    }
    return (
      <Layout titulo={t("Vous utilisez une version plus récente que la version publiée")}>
        <p className="text-sm">
          {t(
            "Votre système utilise une version plus récente que la dernière version publiée : aucune mise à jour n’est donc nécessaire. C’est normal lorsque l’installation suit le développement, et cela n’indique aucun problème — l’identifiant de votre version est {version}.",
          ).replace("{version}", versao)}
        </p>
        <p className="mt-3 text-sm">
          {t(
            "Lorsqu’une version publiée plus récente que la vôtre sera disponible, elle apparaîtra ici automatiquement. Une personne ayant accès au serveur peut vérifier à tout moment avec la commande ci-dessous — elle ne modifie rien sans avertissement :",
          )}
        </p>
        <Comando comando={COMANDO_MANUAL} />
      </Layout>
    );
  }

  return (
    <Layout titulo={t("Version {version} disponible").replace("{version}", nova)}>
      {data.off_release && (
        <p className="mb-4 rounded-md border border-warning bg-warning-bg p-3 text-sm text-warning-fg">
          {t(
            "Votre installation utilise une version de développement. La mise à jour la fera passer à la version publiée {version}.",
          ).replace("{version}", nova)}
        </p>
      )}

      {data.notes?.requires_attention && (
        <div className="mb-4 rounded-md border border-warning bg-warning-bg p-3 text-sm text-warning-fg">
          <p className="mb-1 font-medium">{t("Attention requise")}</p>
          <p className="whitespace-pre-line">
            {markdownParaTextoSimples(data.notes.requires_attention)}
          </p>
        </div>
      )}

      {data.notes?.body && (
        <div className="mb-6">
          <p className="mb-2 text-sm font-medium">{t("Ce qui change")}</p>
          <pre className="whitespace-pre-wrap font-sans text-sm text-muted-foreground">
            {markdownParaTextoSimples(data.notes.body)}
          </pre>
        </div>
      )}

      <BotaoAtualizar
        mutate={() => atualizar.mutate()}
        isPending={atualizar.isPending}
        erro={erro}
      />
    </Layout>
  );
}

function BotaoAtualizar({
  mutate,
  isPending,
  erro,
}: {
  mutate: () => void;
  isPending: boolean;
  erro: string | null;
}) {
  const t = useT();
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={mutate} disabled={isPending}>
          {isPending ? t("Démarrage…") : t("Mettre à jour maintenant")}
        </Button>
        <span className="text-sm text-muted-foreground">
          {t(
            "Le système sera indisponible pendant environ 2 minutes, puis redémarrera seul. Une sauvegarde de vos données sera effectuée avant.",
          )}
        </span>
      </div>
      {erro && <p className="mt-3 text-sm text-error-fg">{erro}</p>}
    </>
  );
}

/**
 * A saída de um estado ruim — e ela nunca é só o botão.
 *
 * Depois de uma tentativa que falhou, o código do servidor já está na versão
 * nova (o `git checkout` deu certo; quem não subiu foi o container). Um novo
 * pedido pelo botão faria o agente rodar `update.sh --to <mesma tag>`, que
 * responde "você já está na versão mais recente", sai com sucesso e reportaria
 * um desfecho BOM sem ter trocado imagem nenhuma. Por isso o botão fica
 * desligado nos estados de falha: o que resolve ali é `--force`, e é o comando
 * — sempre presente — que leva a pessoa a ele.
 */
function Saida({
  botao,
  mutate,
  isPending,
  erro,
  texto,
  comando,
}: {
  botao: boolean;
  mutate: () => void;
  isPending: boolean;
  erro: string | null;
  texto: string;
  comando: string;
}) {
  return (
    <div className="mt-6 border-t pt-4">
      {botao && (
        <div className="mb-4">
          <BotaoAtualizar mutate={mutate} isPending={isPending} erro={erro} />
        </div>
      )}
      <p className="text-sm text-muted-foreground">{texto}</p>
      <Comando comando={comando} />
    </div>
  );
}

/**
 * O log do update.sh, recolhido. Sem isto o dono de uma instalação que falhou
 * precisa de `psql`/SSH para saber o que houve — o terminal que esta tela
 * existe para eliminar.
 */
function DetalhesTecnicos({ texto }: { texto: string | undefined }) {
  const t = useT();
  if (!texto?.trim()) return null;
  return (
    <details className="mt-4 rounded-md border">
      <summary className="cursor-pointer px-3 py-2 text-sm text-muted-foreground">
        {t("Détails techniques (utile pour demander de l’aide)")}
      </summary>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap px-3 pb-3 font-mono text-xs text-muted-foreground">
        {texto}
      </pre>
    </details>
  );
}

function Layout({ titulo, children }: { titulo?: string; children: React.ReactNode }) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {titulo ?? t("Mise à jour du système")}
        </h1>
      </header>
      <Card className="p-6">{children}</Card>
    </div>
  );
}

function Reiniciando() {
  const t = useT();
  return (
    <Layout titulo={t("Redémarrage…")}>
      <p className="text-sm text-muted-foreground">
        {t("Le système redémarre. Cette page se mettra à jour automatiquement dans quelques instants.")}
      </p>
    </Layout>
  );
}

function Comando({ comando }: { comando: string }) {
  const t = useT();
  const [copiado, setCopiado] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 text-xs">
        {comando}
      </code>
      <Button
        variant="outline"
        size="sm"
        onClick={async () => {
          await copyToClipboard(comando);
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        }}
      >
        {copiado ? t("Copié") : t("Copier")}
      </Button>
    </div>
  );
}
