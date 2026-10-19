"use client";
import * as React from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MagnifyingGlass, Tray } from "@/lib/ui/icons";
import {
  useLeadCaptures,
  type DesfechoDaCaptacao,
  type LeadCaptureFilters,
  type LeadCaptureRow,
} from "@/hooks/webhooks/useLeadCaptures";
import { useWebhookSources } from "@/hooks/webhooks/useWebhookSources";
import { CapturaDetail } from "./CapturaDetail";

const TODAS = "__todas__";

export const DESFECHO_LABEL: Record<DesfechoDaCaptacao, string> = {
  criado: "Virou lead",
  duplicado: "Reenvio",
  recusado: "Não entrou",
};

const DESFECHO_VARIANTE: Record<DesfechoDaCaptacao, "success" | "neutral" | "error"> = {
  criado: "success",
  duplicado: "neutral",
  recusado: "error",
};

/**
 * Data e hora ABSOLUTAS, não "há 3 horas".
 *
 * O resto da tela de Webhooks usa tempo relativo, e ali é o certo: "último
 * recebimento há 2 min" responde "está vivo?". Aqui a pergunta é outra — a
 * pessoa está conferindo se o lead que ela viu chegar às 14h07 é o mesmo que
 * está no funil, e relativo não casa com nada que ela tenha em mãos.
 */
function quando(iso: string): { data: string; hora: string } {
  const d = new Date(iso);
  return {
    data: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "2-digit" }),
    hora: d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }),
  };
}

function identidade(row: LeadCaptureRow): string {
  return row.captured_name ?? row.captured_phone ?? row.captured_email ?? "(sans identification)";
}

/** `datetime-local` devolve hora local sem fuso; o filtro é ISO. */
function paraIso(valor: string): string | undefined {
  if (!valor) return undefined;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

export function CapturasTab() {
  const [busca, setBusca] = React.useState("");
  const [buscaAplicada, setBuscaAplicada] = React.useState("");
  const [fonte, setFonte] = React.useState<string>(TODAS);
  const [desfecho, setDesfecho] = React.useState<string>(TODAS);
  const [de, setDe] = React.useState("");
  const [ate, setAte] = React.useState("");
  const [aberta, setAberta] = React.useState<LeadCaptureRow | null>(null);

  const { data: fontesRes } = useWebhookSources();
  const fontes = fontesRes?.data ?? [];

  const filtros: LeadCaptureFilters = React.useMemo(
    () => ({
      ...(fonte !== TODAS ? { source_id: fonte } : {}),
      ...(desfecho !== TODAS ? { outcome: desfecho as DesfechoDaCaptacao } : {}),
      ...(buscaAplicada ? { q: buscaAplicada } : {}),
      ...(paraIso(de) ? { from: paraIso(de) } : {}),
      ...(paraIso(ate) ? { to: paraIso(ate) } : {}),
    }),
    [fonte, desfecho, buscaAplicada, de, ate],
  );

  const { data, isLoading, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useLeadCaptures(filtros);
  const linhas = data?.pages.flatMap((p) => p.data) ?? [];
  const temFiltro = Object.keys(filtros).length > 0;

  return (
    <div className="space-y-4 pt-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="captura-busca">
              Nom, téléphone ou e-mail
            </label>
            <div className="flex gap-2">
              <Input
                id="captura-busca"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") setBuscaAplicada(busca.trim());
                }}
                placeholder="quem você procura"
              />
              <Button
                type="button"
                variant="secondary"
                size="icon"
                aria-label="Rechercher"
                onClick={() => setBuscaAplicada(busca.trim())}
              >
                <MagnifyingGlass />
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Fonte</label>
            <Select value={fonte} onValueChange={setFonte}>
              <SelectTrigger aria-label="Filtrar por fonte">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Toutes les sources</SelectItem>
                {fontes.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Resultado</label>
            <Select value={desfecho} onValueChange={setDesfecho}>
              <SelectTrigger aria-label="Filtrar por resultado">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TODAS}>Tous</SelectItem>
                <SelectItem value="criado">Virou lead</SelectItem>
                <SelectItem value="duplicado">Reenvio</SelectItem>
                <SelectItem value="recusado">Non entré</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="captura-de">
              De
            </label>
            <Input
              id="captura-de"
              type="datetime-local"
              value={de}
              onChange={(e) => setDe(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="captura-ate">
              Jusqu’au
            </label>
            <Input
              id="captura-ate"
              type="datetime-local"
              value={ate}
              onChange={(e) => setAte(e.target.value)}
            />
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : isError ? (
        // ERRO NÃO É LISTA VAZIA. A versão anterior mostrava "Ninguém preencheu
        // seus formulários ainda" quando a CONSULTA falhou — a frase mais
        // tranquilizadora possível para o estado em que a pessoa mais precisa
        // saber que algo quebrou. Ela iria conferir a landing page em vez de
        // recarregar a tela.
        <div className="flex justify-center pt-10">
          <Card className="max-w-md">
            <CardContent className="space-y-3 pt-6 text-center">
              <p className="text-sm text-text">Impossible de charger l’historique.</p>
              <p className="text-xs text-muted-foreground">
                Il s’agit d’un échec de consultation — cela ne veut pas dire que personne n’a rempli le formulaire.
              </p>
              <Button type="button" variant="secondary" onClick={() => refetch()}>
                Réessayer
              </Button>
            </CardContent>
          </Card>
        </div>
      ) : linhas.length === 0 ? (
        <div className="flex justify-center pt-10">
          <Card className="max-w-md">
            <CardContent className="space-y-3 pt-6 text-center">
              <Tray className="mx-auto h-10 w-10 text-accent" />
              <p className="text-sm text-muted-foreground">
                {temFiltro
                  ? "Aucune captation avec ces filtres. Essayez d’élargir la période."
                  : "Personne n’a encore rempli vos formulaires. Dès que le premier envoi arrivera, il apparaîtra ici — avec les données, l’heure et l’origine."}
              </p>
            </CardContent>
          </Card>
        </div>
      ) : (
        <>
          {/* A tabela rola dentro do próprio container: o corpo da página nunca
              rola na horizontal (regra de responsividade do design system). */}
          <Card className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Quem</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Fonte</TableHead>
                  <TableHead>Quand</TableHead>
                  <TableHead>Origine</TableHead>
                  <TableHead>Resultado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhas.map((row) => {
                  const t = quando(row.received_at);
                  return (
                    // A linha continua sendo `row` para quem usa leitor de tela:
                    // um `role="button"` na <tr> a TIRA da tabela, e o leitor
                    // deixa de anunciar "linha 3 de 12" e o cabeçalho de cada
                    // célula — que é justamente o que torna uma tabela legível
                    // sem enxergar. Quem carrega o papel de botão é a primeira
                    // célula, que também é o alvo de teclado.
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => setAberta(row)}>
                      <TableCell className="max-w-[220px] truncate font-medium">
                        <button
                          type="button"
                          className="text-left underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                          onClick={(e) => {
                            e.stopPropagation();
                            setAberta(row);
                          }}
                        >
                          {identidade(row)}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {row.captured_phone ?? row.captured_email ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-[160px] truncate text-sm text-muted-foreground">
                        {row.source_name}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {t.data} <span className="tabular-nums">{t.hora}</span>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-muted-foreground">
                        {row.origin ?? row.remote_ip ?? "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant={DESFECHO_VARIANTE[row.outcome]}>
                          {DESFECHO_LABEL[row.outcome]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </Card>

          {hasNextPage ? (
            <div className="flex justify-center">
              <Button
                type="button"
                variant="secondary"
                onClick={() => fetchNextPage()}
                disabled={isFetchingNextPage}
              >
                {isFetchingNextPage ? "Chargement…" : "Carregar mais"}
              </Button>
            </div>
          ) : null}
        </>
      )}

      <CapturaDetail captura={aberta} onOpenChange={(o) => !o && setAberta(null)} />
    </div>
  );
}
