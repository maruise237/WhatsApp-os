"use client";
/**
 * O painel do papel OPERADOR (spec 16 §3.2 e §6).
 *
 * A tela precisa fazer três coisas que a versão anterior não fazia, e as três
 * saíram da medição, não de gosto:
 *
 *   1. **Dizer onde cada configuração ATUA.** O defeito de 30% de vazamento
 *      nasceu de um único contexto servindo dois destinatários; a tela que
 *      configura isso não pode repetir a confusão apresentando tudo junto.
 *   2. **Dizer a CONSEQUÊNCIA de desligar**, não o nome do que se desliga.
 *      "Desabilitar agente operador" não informa nada a um dono de clínica.
 *   3. **Não mentir sobre o alcance.** O que está aqui é o que ESTE papel usa —
 *      lista própria (`operator_tool_ids`), nunca a do Conversador.
 */
import * as React from "react";

import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

import { useOperatorMetrics } from "@/hooks/ai/useOperatorMetrics";

import { ToolPicker } from "./ToolPicker";

interface Props {
  enabled: boolean;
  onEnabledChange: (v: boolean) => void;
  toolIds: string[];
  onToolIdsChange: (ids: string[]) => void;
  disabled?: boolean;
}

/**
 * O PAPEL FUNCIONANDO — as três medidas que a spec 16 §7 prometeu.
 *
 * O painel era 100% formulário: dizia o que o papel FARIA e nada sobre o que ele
 * fez. Um mecanismo que age no CRM a cada conversa e não tem nenhum retorno
 * visível é o invariante 7 aberto — "quando o sistema erra, o que muda nele?"
 * ficava sem resposta, e "se ele parar de agir, alguém vê" era falso.
 *
 * Cada número aqui responde "e daí?": a taxa de ação diz se o papel está
 * trabalhando; as promessas sem dono são a lista do que pode morrer; e
 * "quis agir e não pôde" é o único que aponta uma ação de configuração — por isso
 * vem com o caminho, não só com a contagem.
 */
function ComoOPapelEstaIndo() {
  const t = useT();
  const m = useOperatorMetrics(true);
  if (m.data === undefined) return null;
  const { turnos, agiu, promessas, quisAgirENaoPode, dias } = m.data;

  if (turnos === 0) {
    // Zero não é "0" cru: num papel recém-ligado isso é o estado esperado, e um
    // número solto pareceria falha.
    return (
      <Card className="p-4" data-testid="operador-como-esta-indo">
        <p className="text-xs text-muted-foreground">
          {t(
            "Nenhuma conversa passou por aqui nos últimos {days} dias. Assim que o assistente atender alguém, o que ele organizar aparece nesta área.",
          ).replace("{days}", String(dias))}
        </p>
      </Card>
    );
  }

  return (
    <Card className="space-y-2 p-4" data-testid="operador-como-esta-indo">
      <h4 className="text-sm font-medium">
        {t("Comment cela se passe (les {days} derniers jours)").replace("{days}", String(dias))}
      </h4>
      <p className="text-xs text-muted-foreground" data-testid="operador-metrica-acao">
        {t("Le système a été organisé dans {agiu} conversation(s) sur {turnos}.")
          .replace("{agiu}", String(agiu))
          .replace("{turnos}", String(turnos))}
      </p>
      <p className="text-xs text-muted-foreground" data-testid="operador-metrica-promessas">
        {t(
          "De {declaradas} promessas feitas ao cliente, {assumidas} ficaram com um responsável — e {semDono} não. Elas aparecem na Central de avisos, uma por conversa.",
        )
          .replace("{declaradas}", String(promessas.declaradas))
          .replace("{assumidas}", String(promessas.assumidas))
          .replace("{semDono}", String(promessas.semDono))}
      </p>
      {quisAgirENaoPode > 0 ? (
        <p className="text-xs text-muted-foreground" data-testid="operador-metrica-sem-mao">
          {t(
            "Em {quisAgirENaoPode} delas o assistente tinha algo a registrar e nenhuma capacidade marcada para isso — o que resolve é marcar abaixo o que ele pode fazer.",
          ).replace("{quisAgirENaoPode}", String(quisAgirENaoPode))}
        </p>
      ) : null}
    </Card>
  );
}

export function PainelDoOperador(props: Props) {
  const t = useT();
  const desabilitado = props.disabled ?? false;

  return (
    <div className="space-y-4">
      {props.enabled ? <ComoOPapelEstaIndo /> : null}
      <Card className="space-y-3 p-4">
        <div className="flex items-start gap-3">
          <Switch
            id="operator_enabled"
            data-testid="operador-liga"
            checked={props.enabled}
            onCheckedChange={props.onEnabledChange}
            disabled={desabilitado}
          />
          <div className="space-y-1">
            <Label htmlFor="operator_enabled" className="text-sm font-medium">
              {t("Laisser l’agent organiser le système après chaque conversation")}
            </Label>
            <p className="text-xs text-muted-foreground">
              {t(
                "Quem conversa com o cliente é uma coisa; quem mantém o sistema em dia é outra. Separar os dois evita que o assistente comente com o cliente o que está fazendo por dentro — e é o que faz ele realmente registrar, em vez de só responder bem.",
              )}
            </p>
          </div>
        </div>

        {/*
          A consequência de DESLIGAR, dita antes de a pessoa desligar. Um switch
          que só diz o nome da feature transfere ao usuário a tarefa de adivinhar
          o que perde — e essa é a decisão que a spec 16 §2.1 fechou: desligar
          NÃO desliga o registro básico, desliga o julgamento.
        */}
        {!props.enabled ? (
          <div
            data-testid="operador-consequencia"
            className="rounded-md border border-dashed p-3 text-xs text-muted-foreground"
          >
            <p className="font-medium text-foreground">{t("Lorsque cette option est désactivée :")}</p>
            <p className="mt-1">
              {t(
                "o assistente continua atendendo e o básico continua sendo registrado sozinho — a etapa do cliente, o retorno que ele prometeu e o histórico da conversa.",
              )}
            </p>
            <p className="mt-1">
              {t(
                "O que ele deixa de fazer é decidir sobre a operação: abrir chamados, distribuir para a pessoa certa, organizar marcadores e etapas. Isso passa a ser trabalho de alguém do time.",
              )}
            </p>
          </div>
        ) : null}
      </Card>

      {props.enabled ? (
        <>
          {/* Plus de choix de modèle ici : l'IA est fournie par la plateforme
              (lib/ai/plateforme.ts), le même modèle organise et converse. */}
          <Card className="space-y-2 p-4">
            <h3 className="text-sm font-medium">{t("Ce qu’il peut modifier dans le système")}</h3>
            <p className="text-xs text-muted-foreground">
              {t(
                "Esta lista é só deste papel — nada aqui é usado enquanto ele conversa com o cliente. Ligue por jornada de trabalho.",
              )}
            </p>
            <div data-testid="operador-capacidades">
              <ToolPicker
                value={props.toolIds}
                onChange={props.onToolIdsChange}
                disabled={desabilitado}
              />
            </div>
            {props.toolIds.length === 0 ? (
              // Estado legítimo, mas que precisa ser explicado: sem isto o
              // usuário liga o papel, não escolhe nada, e conclui que quebrou.
              <p data-testid="operador-sem-capacidade" className="text-xs text-muted-foreground">
                {t(
                  "Sem nada marcado, ele ainda avisa você quando o assistente prometer algo a um cliente e ninguém cumprir — mas não consegue resolver sozinho.",
                )}
              </p>
            ) : null}
          </Card>
        </>
      ) : null}
    </div>
  );
}
