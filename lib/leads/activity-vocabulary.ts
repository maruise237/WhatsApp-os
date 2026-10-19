/**
 * O vocabulário da timeline — fonte ÚNICA, escrita e leitura.
 *
 * Esta é a terceira vez, nesta entrega, que duas listas de strings que
 * precisavam concordar viviam em arquivos diferentes: o LGPD dizia
 * `customer_redact` e o banco exigia `redact`; os workers filtravam pelo
 * vocabulário errado; e aqui a tela conhecia 13 rótulos com ponto
 * (`lead.stage_changed`) enquanto o banco grava 5 com underscore
 * (`stage_changed`). Interseção: ZERO. Toda linha que já existiu caiu no
 * fallback e mostrou o nome cru do tipo.
 *
 * O gate é o compilador: `ACTIVITY_LABELS` é `Record<ActivityType, string>`
 * EXAUSTIVO. Tipo novo sem rótulo não compila — não existe caminho para
 * divergir em silêncio de novo.
 *
 * Deliberadamente SEM check constraint no banco: um clone com tipo legado que
 * não conhecemos quebraria no `update.sh` (doutrina de migrations). O banco
 * aceita; quem escreve daqui é que fica preso ao vocabulário.
 */
export type ActivityType =
  // Spec 17: o lead nasceu da primeira mensagem. Sem esta linha na timeline, o
  // card aparece no kanban sem que ninguém saiba de onde veio — e "apareceu
  // sozinho" é como se perde a confiança num automatismo.
  | "lead_created"
  | "stage_changed"
  /** Um humano desfez ou redirecionou o que a IA tinha movido (spec 17 passo 5). */
  | "agent_move_corrected"
  | "note"
  | "ai_turn"
  | "send_vetoed"
  | "handoff_triggered"
  | "handoff_resolved"
  | "next_action_approved"
  | "next_action_dismissed"
  | "lead_edited"
  | "lead_cooled"
  | "lead_reactivated"
  | "reactivation_accepted"
  | "reactivation_dismissed"
  | "reactivation_expired"
  | "followup_scheduled"
  | "followup_cancelled"
  /**
   * As quatro formas de INTERVIR num follow-up em andamento, sem matá-lo.
   * Antes delas, a única saída era cancelar — e quem lesse a timeline via o
   * fluxo sumir sem saber se alguém desistiu ou se ele terminou.
   */
  | "followup_paused"
  | "followup_resumed"
  | "followup_snoozed"
  | "followup_step_skipped"
  | "demand_closed"
  | "promise_unowned"
  /**
   * O respondente disse NÃO no formulário de captação (ex.: Respondi). A
   * recusa é sinal, não ausência de sinal — sem linha na timeline, "por que
   * ninguém mandou WhatsApp pra este lead" fica sem resposta visível, e é
   * justamente esse silêncio que a automação de 1º toque precisa respeitar.
   */
  | "consent_declined"
  /**
   * A TROCA DE COMANDO ENTRE PESSOAS. A ida e a volta IA↔humano já estavam aqui
   * (`handoff_triggered`/`handoff_resolved`); assumir, transferir e liberar não
   * geravam linha nenhuma — grep nas três rotas devolvia zero. O efeito era uma
   * timeline em que o cliente saía do automático, alguém resolvia, e a conversa
   * reaparecia com outro dono sem nada explicando a passagem.
   *
   * Não vieram como tabela nova de propósito: a auditoria de atribuição
   * (`conversation_assignment_events`) existe, é append-only e serve ao
   * roteamento — mas uma SEGUNDA linha do tempo ao lado desta, no mesmo painel,
   * seria dois lugares contando a mesma história.
   */
  | "conversation_claimed"
  | "conversation_transferred"
  | "conversation_released"
  | "conversation_ai_paused";

export const ACTIVITY_LABELS: Record<ActivityType, string> = {
  lead_created: "Arrivé par WhatsApp",
  stage_changed: "A changé de colonne",
  agent_move_corrected: "Correction de ce que l’assistant avait fait",
  note: "Note",
  ai_turn: "Réponse de l’IA",
  send_vetoed: "Envoi bloqué",
  handoff_triggered: "Confié à une personne",
  // A IDA existia e a VOLTA não: a linha do tempo mostrava o cliente saindo para
  // uma pessoa e nunca voltando, como se o atendimento tivesse parado ali. Meia
  // continuidade lida como continuidade — e é justamente na volta que quem lê
  // precisa saber que o combinado com a pessoa foi repassado ao agente.
  handoff_resolved: "Rendu aux réponses automatiques",
  // A RECUSA é sinal, não ausência de sinal: "o humano viu e disse não" é o que
  // impede o agente de repropor o mesmo. Ignorar sem registro faz a IA insistir
  // no que já foi negado — por isso os dois lados geram atividade.
  next_action_approved: "Prochaine action approuvée",
  next_action_dismissed: "Prochaine action écartée",
  // Editar campo era INVISÍVEL na timeline: a IA deixava rastro e o humano não.
  // Não era "falta um emissor" — era meia continuidade vendida como
  // continuidade, e o dossiê teria mostrado só metade da vida do lead.
  lead_edited: "Infos de l’affaire modifiées",
  // O NEGÓCIO ESFRIANDO É ACONTECIMENTO, não telemetria: é o sistema dizendo
  // "ninguém falou com esta pessoa dentro do prazo deste estágio". Sem linha na
  // timeline, o card mudaria de cor e o dossiê não teria explicação — e o
  // usuário concluiria que a timeline está incompleta, não que o negócio esfriou.
  lead_cooled: "Affaire refroidie",
  lead_reactivated: "L’affaire avance à nouveau",
  // As três decisões sobre a proposta de reativação. VENCER é uma delas: a
  // ausência de decisão humana é informação sobre o negócio, e a proposta some
  // do card justamente para não simular atenção — a timeline é onde isso fica
  // dito, senão o botão sumiria sem explicação.
  reactivation_accepted: "Reprise de contact approuvée",
  reactivation_dismissed: "Reprise de contact écartée",
  reactivation_expired: "Proposition de reprise expirée sans décision",
  // O RETORNO É O ANTI-MORTE (invariante 4): marcar e desmarcar são os dois
  // acontecimentos que decidem se a demanda continua viva. Sem as duas linhas,
  // o negócio some do radar (ou volta a ele) e a timeline não sabe explicar por
  // quê — e é justamente o cancelamento que o agente precisa enxergar ao
  // retomar, para não repropor o que uma pessoa já desmarcou.
  followup_scheduled: "Relance programmée",
  followup_cancelled: "Relance annulée",
  // PAUSAR NÃO É CANCELAR, e a diferença importa para quem pega o atendimento
  // depois: cancelado é decisão fechada, pausado é o fluxo parado esperando uma
  // pessoa. Sem as duas linhas, quem lê a timeline não sabe se o silêncio do
  // agente é desistência ou espera — e, no caso do adiamento, nem que existe
  // uma data combinada.
  followup_paused: "Relance en pause",
  followup_resumed: "Relance reprise",
  followup_snoozed: "Relance reportée",
  followup_step_skipped: "Étape de relance sautée",
  // PROMESSA SEM RESPONSÁVEL. Entra na timeline pelo mesmo critério do
  // `diffCheckpoint`: só o que muda o que alguém faria a seguir. Turno em que o
  // Operador AGIU não gera linha própria — as ferramentas dele já geram as delas
  // (`stage_changed`, `followup_scheduled`), e uma segunda linha dizendo "o
  // Operador trabalhou" é o ruído que o diff existe para matar.
  //
  // O rótulo não diz "não cumprida": o sistema não apura cumprimento, apura se
  // alguém assumiu.
  promise_unowned: "Promesse sans responsable",
  // ENCERRAR É O OUTRO LADO do invariante 4: uma demanda aberta precisa de
  // próximo passo OU de desfecho registrado. Fechar como ganho ou perdido era
  // invisível na timeline — só existia em audit e event_log, que ninguém lê na
  // tela — e o dossiê de um negócio fechado terminava sem dizer que fechou.
  demand_closed: "Demande clôturée",
  consent_declined: "Accord de contact refusé dans le formulaire",
  // Rótulos com OBJETO, nunca verbo nu: "Liberou" sozinho não diz o quê, e numa
  // clínica "liberar" é o que se faz com um exame. O resto do arquivo já segue
  // essa régua ("Retorno agendado", "Demanda encerrada").
  conversation_claimed: "A pris la conversation",
  conversation_transferred: "A transféré la conversation",
  conversation_released: "A libéré la conversation",
  // "automático" e não "IA": a palavra do estado já é contrato em quatro
  // arquivos e o controle NEGATIVO de `handoff-por-orcamento.test.ts` usa
  // literalmente "Voltar para a IA" como a sabotagem que deve reprovar.
  conversation_ai_paused: "A mis l’automatique en pause",
};

/** Quando o tipo é legado/desconhecido, a linha ainda é honesta — sem jargão. */
export const ACTIVITY_LABEL_FALLBACK = "Activité enregistrée";

/**
 * Rótulo para exibir. Aceita `string` porque o banco tem histórico anterior a
 * este vocabulário — o que não se pode é ESCREVER fora dele.
 *
 * O fallback NÃO devolve o identificador cru: era exatamente isso que punha
 * "stage_changed" no rosto do usuário, e reintroduzir aqui seria trazer de
 * volta, pelo lado da leitura, o defeito que este arquivo existe para matar.
 * Nenhum teste pegaria: "stage_changed" não é uuid, então a asserção que caça
 * uuid na tela continuaria verde.
 */
export function activityLabel(type: string): string {
  return ACTIVITY_LABELS[type as ActivityType] ?? ACTIVITY_LABEL_FALLBACK;
}

/** Como o marcador do ator é desenhado (BRIEFING §5: forma, nunca cor). */
export type ActivityActorShape = "filled" | "ring" | "dashed";

/**
 * TRÊS desenhos, os mesmos do card: preenchido = gente, anel = agente,
 * tracejado = nem um nem outro.
 *
 * A forma carrega a leitura GROSSA (foi gente / foi agente / não foi nenhum dos
 * dois); a distinção fina entre "Automação" e "Autor não registrado" já está no
 * TEXTO, que fica ao lado. Um quarto desenho obrigaria o usuário a decorar um
 * alfabeto no kanban e outro na timeline, para dizer o que a palavra já diz.
 */
export function actorShape(actorKind: string | null): ActivityActorShape {
  if (actorKind === "user" || actorKind === "contact") return "filled";
  if (actorKind === "ai") return "ring";
  return "dashed";
}

/**
 * QUEM agiu, com nome quando se sabe o nome.
 *
 * "Agente" e "Você/time" respondem o TIPO de ator; numa org com três agentes e
 * cinco atendentes, isso não responde a pergunta que o humano faz olhando a
 * timeline, que é "quem fez isso?". O genérico vira último recurso — e continua
 * existindo porque nome pode faltar (agente apagado, usuário sem full_name).
 */
export function actorName(
  actorKind: string | null,
  nomes: { agente?: string | null; usuario?: string | null } = {},
): string {
  if (actorKind === "ai" && nomes.agente) return nomes.agente;
  if ((actorKind === "user" || actorKind === "contact") && nomes.usuario) return nomes.usuario;
  return actorLabel(actorKind);
}

/**
 * Quem agiu, em uma palavra — vai ao lado do rótulo na linha.
 *
 * SEMPRE devolve texto, porque `actorShape` sempre desenha: marcador sem
 * legenda é ruído que o leitor não consegue decifrar. As duas funções têm de
 * concordar, inclusive no caso desconhecido.
 */
export function actorLabel(actorKind: string | null): string {
  switch (actorKind) {
    case "user":
      return "Vous/équipe";
    case "ai":
      return "Assistant";
    case "contact":
      return "Client";
    case "rule":
      return "Automatisation";
    case "system":
      return "Système";
    default:
      return "Auteur non enregistré";
  }
}

/** Como os campos do lead se chamam para quem lê — nunca o nome da coluna. */
const NOME_DO_CAMPO: Record<string, string> = {
  title: "le titre",
  description: "la description",
  value_cents: "le montant",
  currency: "la devise",
  owner_user_id: "le responsable",
  owner_agent_id: "l’assistant responsable",
  expected_close_date: "la date de clôture prévue",
  tags: "les étiquettes",
  custom_fields: "les champs personnalisés",
  lost_reason: "la raison de la perte",
};

/**
 * "o título e o valor" — a lista de campos alterados, legível.
 *
 * ⚠️ NOMES, NUNCA VALORES. Esta função existe para dizer O QUE mudou sem dizer
 * PARA QUÊ. Acrescentar o conteúdo aqui vazaria PII para uma linha que aparece
 * na tela, em captura e em exportação — e a tentação é real, porque "mostrar o
 * valor" parece só deixar a timeline mais informativa. Quem precisa do valor
 * tem o `api_audit_log`, sob controle de acesso.
 *
 * Campo desconhecido cai no próprio nome em vez de sumir: uma coluna nova
 * apareceria na timeline como `expected_close_date`, feio mas honesto — some
 * seria pior, porque a frase diria menos do que aconteceu.
 */
export function listaLegivel(campos: string[]): string {
  const nomes = campos.map((c) => NOME_DO_CAMPO[c] ?? c);
  if (nomes.length === 0) return "nada";
  if (nomes.length === 1) return nomes[0]!;
  return `${nomes.slice(0, -1).join(", ")} e ${nomes[nomes.length - 1]!}`;
}
