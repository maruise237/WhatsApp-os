/**
 * Capacidades de RETENÇÃO — o pacote "Não perder o cliente".
 *
 * Este é o pacote do invariante 4 da doutrina (`docs/doctrine/sistema-vivo.md`):
 * nenhuma demanda aberta pode ficar sem próximo passo definido e visível. Até
 * esta wave ele estava VAZIO — a máquina de retorno existia, rodava e era
 * invisível para o agente que o dono da clínica configura na tela. Um agente que
 * não consegue marcar um retorno não consegue cumprir a missão do sistema.
 *
 * As duas saídas do invariante estão aqui: marcar o próximo passo (agendar,
 * cancelar, listar retorno) e registrar o desfecho (encerrar a demanda). Sem a
 * segunda, o anti-morte fica pela metade e o radar enche de negócio que já acabou.
 *
 * ESTE ARQUIVO FALA COM O HUMANO que configura o agente — `rotulo`,
 * `explicacao` e `oQueToca`. O texto que vai ao MODELO é a `description` do
 * HANDLER (`lib/mcp/tools/<dominio>.ts`), e ela NÃO tem cópia aqui: até
 * 2026-08-07 tinha, ninguém lia essa cópia, e 48 das 51 divergiam do que o
 * modelo realmente recebia. O campo foi removido em vez de sincronizado —
 * duplicata que ninguém lê não é documentação, é armadilha: um script de
 * medição de vazamento chegou a montar o prompt com o texto errado, sob um
 * comentário dizendo "a ferramenta como o modelo a vê".
 * Ver `docs/handoffs/BRIEFING-ia-360.md` §4.
 *
 * ⚠️ "FOLLOW-UP" NÃO APARECE NO TEXTO DO HUMANO. Para o dono da clínica isso se
 * chama RETORNO ou acompanhamento — o gate mecânico
 * (`tests/unit/catalogo-tools-leigo-friendly.test.ts`) reprova o jargão, e a
 * palavra continua existindo só no `name`, que é contrato de wire.
 */
import { declararTools } from "./tipos";

export const TOOLS_RETENCAO = declararTools([
  {
    name: "crm_schedule_followup",
    category: "write",
    rotulo: "Programmer une relance du client",
    explicacao:
      "Fixe un moment où l’assistant recontactera le client, pour que la conversation ne reste pas sans suite.",
    oQueToca: "Relances et suivi",
    // `atencao` e não `critico`: agendar não fala com ninguém agora. O envio no
    // horário combinado passa pelos mesmos portões de sempre, e o humano vê o
    // retorno na fila e no Radar, com botão de cancelar. É reversível pela tela —
    // que é exatamente a definição deste nível.
    risco: "atencao",
    pacotes: ["reter"],
  },
  {
    name: "crm_cancel_followup",
    category: "write",
    rotulo: "Annuler une relance programmée",
    explicacao:
      "Annule une relance pas encore faite, pour que l’assistant n’insiste pas auprès de quelqu’un qui a déjà répondu.",
    oQueToca: "Relances et suivi",
    risco: "atencao",
    pacotes: ["reter"],
  },
  {
    name: "crm_list_followups",
    category: "read",
    rotulo: "Voir les relances d’un client",
    explicacao:
      "Montre les relances prévues avec le client : ce qui est programmé, ce qui a déjà eu lieu et ce qui a été annulé.",
    oQueToca: "Relances et suivi",
    risco: "seguro",
    pacotes: ["reter"],
  },
  {
    name: "crm_list_at_risk_leads",
    category: "read",
    rotulo: "Voir qui s’est refroidi et qui n’a pas de suite prévue",
    explicacao:
      "Liste les affaires ouvertes restées sans mouvement trop longtemps, des plus critiques aux moins " +
      "urgentes — et, avec elles, les personnes qui attendent sans que rien ne soit prévu.",
    oQueToca: "Radar des risques",
    risco: "seguro",
    pacotes: ["reter"],
  },
  {
    name: "crm_close_demand",
    category: "write",
    rotulo: "Clôturer l’affaire comme gagnée ou perdue",
    explicacao:
      "Clôture l’affaire en indiquant si elle est gagnée ou perdue et pourquoi, pour ne plus relancer ce qui est terminé.",
    oQueToca: "Tableau des ventes",
    // `critico` porque encerrar é o desfecho: o negócio sai do quadro, some do
    // radar e das cobranças, e voltar atrás é trabalho manual. Nunca entra ligado
    // por pacote — exige marcação explícita de quem configura.
    risco: "critico",
    pacotes: ["reter"],
  },
  {
    name: "crm_propose_reactivation",
    category: "write",
    rotulo: "Proposer de recontacter un client disparu",
    explicacao:
      "Crée une proposition pour recontacter un client refroidi, qu’une personne approuve avant tout envoi.",
    oQueToca: "Radar des risques",
    // Escreve uma SUGESTÃO que uma pessoa decide — nada sai para o cliente por
    // conta dela. É `atencao`, e o `critico` mora na aprovação humana.
    risco: "atencao",
    pacotes: ["reter"],
  },
]);
