"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAtritoMetrics, useSalvarReguaAbandono } from "@/hooks/metrics/useAtritoMetrics";
import { formatarMedida, type Medida, type Par } from "@/lib/metrics/atrito";

/**
 * Índice de Atrito (spec 17) — a medida do PROPÓSITO.
 *
 * Desenho imposto pela doutrina §3.3: eficiência e dano ficam no MESMO cartão,
 * lado a lado. Não é preferência estética — separados (abas, seções, telas), a
 * métrica de eficiência vence sempre, porque é a que sobe e a que alguém pede
 * para ver. O tipo `Par` torna impossível renderizar uma eficiência sozinha.
 *
 * Fica ACIMA do funil e da performance por atendente de propósito (§3.6): é o
 * número que pertence ao sistema inteiro, e ao qual as métricas de área se
 * subordinam. Embaixo, viraria rodapé.
 */

function MedidaLinha({ m }: { m: Medida }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <div className="min-w-0">
        <p className="truncate text-sm">{m.rotulo}</p>
        {m.nota ? <p className="mt-0.5 text-xs text-muted-foreground">{m.nota}</p> : null}
      </div>
      <span className="shrink-0 text-sm font-medium tabular-nums">{formatarMedida(m)}</span>
    </div>
  );
}

function ParCard({ par }: { par: Par }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-normal text-muted-foreground">{par.titulo}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 sm:flex-row">
        {/* Eficiência — o que o sistema é empurrado a maximizar. */}
        <div className="sm:w-48 sm:shrink-0">
          <p className="text-2xl font-semibold tabular-nums">{formatarMedida(par.eficiencia)}</p>
          <p className="mt-1 text-sm text-muted-foreground">{par.eficiencia.rotulo}</p>
          {par.eficiencia.nota ? (
            <p className="mt-1 text-xs text-muted-foreground">{par.eficiencia.nota}</p>
          ) : null}
        </div>

        {/* O custo disso. Mesmo cartão, sempre. */}
        <div className="min-w-0 flex-1 border-t pt-3 sm:border-l sm:border-t-0 sm:pl-6 sm:pt-0">
          <p className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">
            Ce que cela a coûté
          </p>
          {par.danos.map((d) => (
            <MedidaLinha key={d.chave} m={d} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * A régua do abandono, VISÍVEL e editável ao lado do número que ela governa
 * (invariante 6: ver + mudar + falha visível; e cap. 3.4 regra 4: a régua viaja
 * com o número). Só manager+ edita — redefinir o que conta como perda é decisão
 * de quem responde pelo resultado, não de quem opera.
 */
function ReguaAbandono({ horas, padrao, podeEditar }: { horas: number; padrao: number; podeEditar: boolean }) {
  const [valor, setValor] = useState(String(horas));
  const salvar = useSalvarReguaAbandono();
  const n = Number(valor);
  const valido = Number.isInteger(n) && n >= 1 && n <= 24 * 90;
  const sujo = String(horas) !== valor.trim();

  if (!podeEditar) {
    return (
      <p className="text-xs text-muted-foreground">
        Une conversation est considérée comme perdue après un silence de <strong>{horas}h</strong> sans réponse
        {horas === padrao ? "(valeur par défaut du système)" : ""}.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Considérer comme perdue après un silence de</span>
      <Input
        className="h-7 w-20 text-xs"
        value={valor}
        inputMode="numeric"
        aria-label="Heures de silence avant de considérer la conversation comme perdue"
        onChange={(e) => setValor(e.target.value)}
      />
      <span>heures sans réponse.</span>
      {sujo ? (
        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={!valido || salvar.isPending}
          onClick={() => salvar.mutate(n)}
        >
          {salvar.isPending ? "Enregistrement…" : "Enregistrer"}
        </Button>
      ) : null}
      {sujo && !valido ? (
        <span className="text-destructive">Utilisez un nombre entier entre 1 et 2160.</span>
      ) : null}
      {/* Falha VISÍVEL: sem isto, um erro de escrita deixaria a tela mostrando o
          valor digitado como se tivesse sido salvo. */}
      {salvar.isError ? (
        <span className="text-destructive">Impossible d’enregistrer. Réessayez.</span>
      ) : null}
      {horas === padrao && !sujo ? <span>(valeur par défaut du système)</span> : null}
    </div>
  );
}

export function AtritoPanel({ podeEditarRegua }: { podeEditarRegua: boolean }) {
  const { data, isLoading, isError } = useAtritoMetrics();

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Chargement de l’indice de friction…</p>;
  }
  // Falha aberta na informação: dizer que não carregou é melhor que sumir com a
  // seção — seção ausente lê-se como "não há atrito" (doutrina cap. 4.5).
  if (isError || !data) {
    return <p className="text-sm text-destructive">Erreur lors du chargement de l’indice de friction.</p>;
  }

  const { escopo, pares, regua } = data.data;
  const temMedidaAusente = pares.some(
    (p) => p.eficiencia.valor === null || p.danos.some((d) => d.valor === null),
  );

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-base font-medium">Friction</h2>
        <p className="text-sm text-muted-foreground">
          Ce que le résultat a coûté aux deux parties.{" "}
          {escopo.demandas === 0 ? (
            <>Aucune demande clôturée sur la période — les chiffres ci-dessous n’ont pas encore de base.</>
          ) : (
            <>
              Base: {escopo.demandas}{" "}
              {escopo.demandas === 1 ? "demande clôturée" : "demandes clôturées"} sur les 30 derniers jours, et {escopo.demandas_abertas} encore ouvertes.
            </>
          )}
        </p>
        {/* A régua fica AQUI, no cabeçalho, e não no rodapé da seção: o rótulo
            do dano interpola as horas ("após 72h") e quem lê o número precisa
            enxergar de onde ele veio sem rolar a tela (cap. 3.4, regra 4). */}
        <div className="mt-2">
          <ReguaAbandono
            horas={regua.abandono_horas}
            padrao={regua.default}
            podeEditar={podeEditarRegua}
          />
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {pares.map((p) => (
          <ParCard key={p.chave} par={p} />
        ))}
      </div>

      {/* A legenda só existe se houver o que legendar. Explicar um símbolo que
          não está na tela é ruído, e ruído compete com o que importava. */}
      {temMedidaAusente ? (
        <p className="text-xs text-muted-foreground">
          &quot;—&quot; signifie qu’il n’y a pas eu assez de données pour mesurer, et non que la valeur est nulle.
        </p>
      ) : null}
    </section>
  );
}
