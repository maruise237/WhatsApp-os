/**
 * OS PONTOS DO SISTEMA QUE USAM IA — a lista única.
 *
 * ## Por que este arquivo existe
 *
 * O DeskcommCRM chama modelo de linguagem em 23 lugares. Até aqui, QUAL modelo
 * cada um usava estava espalhado por três pilhas que não se falavam
 * (`runModelCall` com BYOK por org, `lib/ai/gateway.ts` por variável de
 * ambiente, `lib/ai/runtime/agent.ts` com um terceiro `switch`) e por sete
 * variáveis de ambiente. Não havia lugar nenhum onde a pergunta "quem usa IA
 * aqui, e com qual chave?" tivesse resposta.
 *
 * A consequência não era teórica. Três casos medidos neste repo:
 *
 *  - Um tenant com Anthropic como padrão e um agente publicado em OpenAI
 *    mandava `gpt-5-mini` para o endpoint da Anthropic; o turno inteiro morria
 *    antes de o agente responder, e a tela não mostrava nada
 *    (`lib/agent-engine/agent/aux-model-args.ts`).
 *  - A transcrição de áudio recebia a chave da Anthropic — o Whisper é da
 *    OpenAI — e recusava toda tentativa, com a chave certa no `.env`
 *    (`workers/media-derive-worker.ts`).
 *  - A descrição de imagem usa o modelo de conversa da organização; se ele não
 *    enxerga imagem, a descrição volta vazia e ninguém é avisado
 *    (`workers/media-derive-worker.ts`).
 *
 * Os três têm a mesma forma: uma escolha de modelo feita longe de quem sofre a
 * consequência, sem superfície para configurar e sem rastro para diagnosticar.
 *
 * ## O que este registro é (e o que não é)
 *
 * É a fonte de verdade de QUAIS pontos existem, o que cada um faz em português
 * de gente, e QUE CAPACIDADE o modelo escolhido precisa ter. Não é onde a
 * escolha mora: a escolha é por organização e vive no banco
 * (`ai_purpose_bindings`). Este arquivo é o catálogo contra o qual essa escolha
 * é validada.
 *
 * Ele alimenta três consumidores: a tela de provedores (`/app/ai/providers`), a
 * tela de execuções (`/app/ai/runs`) e a validação de compatibilidade que
 * impede escolher um modelo sem ferramentas para o ponto que precisa delas.
 *
 * ## A regra que o mantém honesto
 *
 * `tests/unit/pontos-de-ia-completude.test.ts` varre o código e reprova nos
 * dois sentidos: ponto que o código chama e não está aqui (ponto oculto, o
 * problema original), e ponto que está aqui e nenhum código chama (botão que
 * não controla nada, que é pior — gasta a confiança do operador numa tela que
 * mente). Ao adicionar uma chamada de modelo nova, este arquivo entra no mesmo
 * commit.
 *
 * ## Granularidade: por que um ponto por chamada, e não por grupo
 *
 * A tela agrupa por papel para não assustar quem não é engenheiro, mas o
 * registro — e o binding no banco — é por PONTO. Isso não é rigor gratuito: o
 * roteiro do produto prevê modelos locais, e um modelo local pequeno só é
 * confiável quando é especialista em uma tarefa só. Agrupar no armazenamento
 * fecharia essa porta; agrupar só na exibição a mantém aberta.
 */

/** O papel que o ponto cumpre — é como a tela agrupa, para quem não é engenheiro. */
export type PapelDeIa =
  | "atender"
  | "entender"
  | "proteger"
  | "lembrar"
  | "perceber"
  | "melhorar";

export const PAPEIS: Record<PapelDeIa, { rotulo: string; explicacao: string }> = {
  atender: {
    rotulo: "Répondre au client",
    explicacao: "Écrire ce que lit le client et faire avancer le tableau pendant la conversation.",
  },
  entender: {
    rotulo: "Comprendre la conversation",
    explicacao: "Lire ce qui arrive et décider ce que cela signifie pour l’activité.",
  },
  proteger: {
    rotulo: "Protéger l’activité",
    explicacao: "Bloquer les manipulations et les promesses que l’entreprise ne peut pas tenir.",
  },
  lembrar: {
    rotulo: "Se souvenir et chercher",
    explicacao: "Garder l’essentiel de la conversation et trouver le bon document de votre activité.",
  },
  perceber: {
    rotulo: "Voir et écouter",
    explicacao: "Transformer l’audio, les images et les vidéos du client en texte que l’assistant comprend.",
  },
  melhorar: {
    rotulo: "Améliorer et tester",
    explicacao: "Évaluer ses propres résultats et vérifier que les réglages fonctionnent.",
  },
};

/**
 * O que o modelo escolhido precisa saber fazer. Campo ausente = não exige.
 *
 * É o que transforma o painel de "lista de nomes bonitos" em guarda real: o
 * catálogo da OpenRouter declara `tools` em `supported_parameters` e as
 * modalidades em `architecture.input_modalities`, então a compatibilidade é
 * checada com dado do provedor, não com uma tabela nossa que envelhece.
 */
export interface CapacidadeExigida {
  /** Chamar ferramentas. Sem isso o ponto não cria lead nem move o funil. */
  tools?: boolean;
  /** Ler imagem. */
  imagem?: boolean;
  /** Transcrever áudio. */
  audio?: boolean;
  /** É embedding, e o vetor precisa ter exatamente esta dimensão. */
  embeddingDims?: number;
}

/**
 * Onde o ponto grava telemetria hoje. `nenhum` é dívida — ver Frente 2.
 *
 * `ai_invocations` NÃO está aqui de propósito: a migration 0130 a depreciou e
 * `lib/ai/log-invocation.ts` passou a gravar em `llm_calls`. Enquanto o valor
 * existia no tipo, três pontos continuaram declarando-o e o registro — o
 * artefato que existe para responder "quem usa IA aqui, e onde isso fica
 * registrado" — apontava para uma tabela que ninguém mais escreve. Tirá-lo do
 * union é o que faz o `tsc` reprovar a volta, em vez de depender de alguém
 * reparar.
 */
export type DestinoDeTelemetria =
  | "llm_calls"
  | "ai_agent_runs"
  | "nenhum";

export interface PontoDeIa {
  /** Casa com o `purpose` passado ao seam, ou com o id do ponto fora dele. */
  id: string;
  /** Nome curto na tela. */
  rotulo: string;
  /** O que faz, para quem não é engenheiro. */
  oQueFaz: string;
  papel: PapelDeIa;
  exige: CapacidadeExigida;
  /** Arquivo que emite a chamada — auditável pelo teste de completude. */
  emissor: string;
  /**
   * O que o USUÁRIO vê quando este ponto falha. É a coluna que faz a tela de
   * execuções responder "por que falhou" a quem não lê mensagem de erro —
   * escrita em consequência de negócio, nunca em jargão.
   */
  sintomaDeFalha: string;
  /**
   * Ponto que NÃO aceita troca de modelo, com a razão por escrito. A tela
   * mostra o cadeado junto da razão: sem ela, o operador conclui que o produto
   * é limitado, em vez de entender que a troca quebraria algo em silêncio.
   */
  fixo?: { razao: string };
  registraEm: DestinoDeTelemetria;
}

export const PONTOS_DE_IA: readonly PontoDeIa[] = [
  // ─────────────────────────── Atender o cliente ───────────────────────────
  {
    id: "agent_turn",
    rotulo: "Répondre au client",
    oQueFaz:
      "Écrit la réponse que le client lit sur WhatsApp, en consultant vos documents et en utilisant les outils du CRM.",
    papel: "atender",
    exige: { tools: true, imagem: true },
    emissor: "lib/agent-engine/agent/inbound-turn.ts",
    sintomaDeFalha:
      "Le client écrit et personne ne répond. La conversation reste bloquée dans la boîte de réception sans alerte.",
    registraEm: "llm_calls",
  },
  {
    id: "operator_turn",
    rotulo: "Faire avancer le tableau",
    oQueFaz:
      "Crée la fiche client, la change de colonne et note ce qui a été convenu, pendant la conversation.",
    papel: "atender",
    exige: { tools: true },
    emissor: "lib/agent-engine/agent/operator-turn.ts",
    sintomaDeFalha:
      "Le client est servi normalement, mais rien n’apparaît dans le tableau — aucune fiche créée, aucune colonne changée.",
    registraEm: "llm_calls",
  },
  {
    id: "automation_ai_message",
    rotulo: "Contacter ceux qui ont rempli le formulaire",
    oQueFaz:
      "Écrit le premier message à la personne qui vient de remplir un formulaire, à partir de ses réponses et des consignes que vous avez données dans l’automatisation.",
    papel: "atender",
    // Sem tools: o texto vem e quem envia é a automação, com janela de horário
    // e opt-out. Dar `send_message` ao modelo faria dele o remetente.
    exige: {},
    emissor: "lib/agent-engine/agent/abordagem-de-formulario.ts",
    sintomaDeFalha:
      "Le client arrive par le formulaire, l’automatisation se lance, mais le premier message n’est jamais écrit — le contact reste dans le tableau sans que personne ne lui parle.",
    registraEm: "llm_calls",
  },
  {
    id: "draft_suggestion",
    rotulo: "Suggérer une réponse à l’équipe",
    oQueFaz:
      "Écrit un brouillon de réponse que la personne de l’équipe relit avant de l’envoyer.",
    papel: "atender",
    exige: {},
    emissor: "lib/agent-engine/agent/draft-reply.ts",
    sintomaDeFalha:
      "Le bouton de suggestion ne propose rien, et la personne écrit tout elle-même sans savoir pourquoi.",
    registraEm: "llm_calls",
  },
  {
    id: "bot_respond",
    rotulo: "Répondre (ancien moteur)",
    oQueFaz:
      "Ancienne façon de répondre, avant le moteur d’assistants actuel, gardée pour les installations qui l’utilisent encore.",
    papel: "atender",
    exige: {},
    emissor: "workers/ai-response-worker.ts",
    sintomaDeFalha:
      "Dans les installations qui en dépendent encore, le client reste sans réponse et la conversation n’avance pas.",
    registraEm: "llm_calls",
  },

  // ────────────────────────── Entender a conversa ──────────────────────────
  {
    id: "intent_router",
    rotulo: "Choisir quel assistant répond",
    oQueFaz:
      "Lit le message reçu et décide lequel de vos assistants doit prendre cette conversation.",
    papel: "entender",
    exige: {},
    emissor: "lib/agent-engine/agent/intent-classifier.ts",
    sintomaDeFalha:
      "La conversation arrive toujours au même assistant, ou à aucun — comme si vos règles d’aiguillage n’existaient pas.",
    registraEm: "llm_calls",
  },
  {
    id: "stage_classifier",
    rotulo: "Trouver la colonne du client",
    oQueFaz:
      "Lit la conversation et propose la colonne du tableau où se trouve vraiment ce client.",
    papel: "entender",
    exige: {},
    emissor: "lib/agent-engine/agent/stage-classifier.ts",
    sintomaDeFalha:
      "Les clients n’avancent plus tout seuls dans le tableau et restent tous dans leur colonne d’arrivée.",
    registraEm: "llm_calls",
  },
  {
    id: "sentiment_classify",
    rotulo: "Mesurer l’humeur de la conversation",
    oQueFaz:
      "Évalue si le client est satisfait ou agacé, pour passer la main à une personne avant de perdre la vente.",
    papel: "entender",
    exige: {},
    emissor: "workers/ai-sentiment-worker.ts",
    sintomaDeFalha:
      "Un client agacé n’est plus passé à une personne, et le mécontentement n’apparaît que quand il est déjà parti.",
    registraEm: "llm_calls",
  },
  {
    id: "followup_classify",
    rotulo: "Lire la réponse à la relance",
    oQueFaz:
      "Comprend si le client a accepté, refusé ou demandé à reparler plus tard, et oriente la séquence en conséquence.",
    papel: "entender",
    exige: {},
    emissor: "lib/agent-engine/agent/followup-flow-classify.ts",
    sintomaDeFalha:
      "La relance bloque à la même étape : le client a répondu, mais la séquence ne va nulle part.",
    registraEm: "llm_calls",
  },
  {
    id: "followup_decide_timing",
    rotulo: "Choisir l’heure de la relance",
    oQueFaz: "Choisit le meilleur moment pour relancer une conversation refroidie.",
    papel: "entender",
    exige: {},
    emissor: "lib/agent-engine/agent/followup-flow-classify.ts",
    sintomaDeFalha:
      "Les relances partent toutes à la même heure fixe, sans respecter le rythme de chaque client.",
    registraEm: "llm_calls",
  },

  // ────────────────────────── Proteger a operação ──────────────────────────
  {
    id: "jailbreak_detect",
    rotulo: "Bloquer les tentatives de manipulation",
    oQueFaz:
      "Repère quand quelqu’un essaie de tromper l’assistant pour lui faire contourner vos règles.",
    papel: "proteger",
    exige: {},
    emissor: "lib/agent-engine/guardrails/jailbreak/classifier.ts",
    sintomaDeFalha:
      "L’assistant accepte les consignes d’inconnus et peut dire au nom de l’entreprise des choses que vous n’avez jamais autorisées.",
    registraEm: "llm_calls",
  },
  {
    id: "promise_semantic",
    rotulo: "Empêcher les promesses intenables",
    oQueFaz:
      "Vérifie si la réponse promet un délai, une remise ou une condition que l’entreprise ne peut pas tenir.",
    papel: "proteger",
    exige: {},
    emissor: "lib/agent-engine/guardrails/promise/semantic.ts",
    sintomaDeFalha:
      "L’assistant promet au client des choses que l’entreprise ne livre pas, et les réclamations arrivent ensuite.",
    registraEm: "llm_calls",
  },

  // ─────────────────────────── Lembrar e buscar ────────────────────────────
  {
    id: "compaction",
    rotulo: "Résumer une longue conversation",
    oQueFaz:
      "Réduit une longue conversation à l’essentiel, pour que l’assistant ne perde pas le fil et que chaque réponse ne coûte pas plus cher.",
    papel: "lembrar",
    exige: {},
    emissor: "lib/agent-engine/agent/compaction.ts",
    sintomaDeFalha:
      "Dans les longues conversations, l’assistant oublie ce qui a été convenu et repose les mêmes questions.",
    registraEm: "llm_calls",
  },
  {
    id: "flush",
    rotulo: "Garder ce qui a été convenu",
    oQueFaz:
      "Relève dans la conversation les engagements, objections et infos du client avant de la clôturer.",
    papel: "lembrar",
    exige: {},
    emissor: "lib/agent-engine/agent/compaction.ts",
    sintomaDeFalha:
      "Ce qui a été convenu avec le client n’est pas noté, et la conversation suivante repart de zéro.",
    registraEm: "llm_calls",
  },
  {
    id: "checkpoint",
    rotulo: "Clôturer la conversation",
    oQueFaz:
      "Écrit le résumé de fin d’échange, que la conversation suivante lit en démarrant.",
    papel: "lembrar",
    exige: {},
    emissor: "lib/agent-engine/agent/inbound-turn.ts",
    sintomaDeFalha:
      "Chaque reprise de conversation semble être la première : l’assistant ne sait pas ce qui s’est passé avant.",
    registraEm: "llm_calls",
  },
  {
    id: "embedding_indexar",
    rotulo: "Indexer vos documents",
    oQueFaz:
      "Prépare les documents de votre activité pour que l’assistant puisse les retrouver au moment de répondre.",
    papel: "lembrar",
    exige: { embeddingDims: 1536 },
    emissor: "lib/ai/embed.ts",
    fixo: {
      razao:
        "L’indexation et la recherche doivent utiliser exactement le même modèle — ce sont les coordonnées d’une même carte. En changer un seul ne provoque pas d’erreur : l’assistant ne trouve simplement plus votre contenu, sans prévenir. Pour changer de modèle ici, il faut tout réindexer d’un coup.",
    },
    sintomaDeFalha:
      "Vous ajoutez un document et il n’est jamais prêt ; l’assistant répond sans connaître vos documents.",
    // `nenhum`, e não `llm_calls`: `lib/ai/embed.ts` não chama `logInvocation`
    // nem passa pelo seam — não há uma linha de telemetria para este ponto em
    // lugar nenhum. Declarar a tabela certa seria mentir sobre uma cobertura
    // que não existe; a dívida fica visível com o nome dela.
    registraEm: "nenhum",
  },
  {
    id: "embedding_consultar",
    rotulo: "Chercher dans vos documents",
    oQueFaz:
      "Trouve, dans vos documents, les passages qui répondent à la question du client.",
    papel: "lembrar",
    exige: { embeddingDims: 1536 },
    emissor: "lib/agent-engine/edge/llm/embed.ts",
    fixo: {
      razao:
        "Doit utiliser le même modèle que celui de l’indexation. S’ils diffèrent, la recherche marche toujours mais renvoie de mauvais résultats — une panne silencieuse, c’est pourquoi le changement se fait avec la réindexation, pas ici.",
    },
    sintomaDeFalha:
      "L’assistant répond de façon générale, sans tenir compte de ce qui est écrit dans vos documents.",
    registraEm: "nenhum",
  },

  // ───────────────────────────── Ver e ouvir ───────────────────────────────
  {
    id: "transcricao_de_audio",
    rotulo: "Écouter l’audio du client",
    oQueFaz: "Transforme l’audio envoyé par le client en texte que l’assistant lit.",
    papel: "perceber",
    exige: { audio: true },
    emissor: "lib/messaging/media/transcription.ts",
    fixo: {
      razao:
        "Utilise le format de transcription d’OpenAI, repris par les services du marché. Peut pointer vers un autre service compatible — même installé sur votre propre machine — mais demande une clé de ce service, distincte de la clé du modèle de conversation.",
    },
    sintomaDeFalha:
      "Le client envoie un audio et l’assistant répond comme s’il n’avait rien reçu.",
    registraEm: "nenhum",
  },
  {
    id: "visao_de_imagem",
    rotulo: "Voir l’image du client",
    oQueFaz:
      "Décrit la photo, la capture d’écran ou le justificatif envoyé par le client, pour que l’assistant sache de quoi il s’agit.",
    papel: "perceber",
    exige: { imagem: true },
    emissor: "workers/media-derive-worker.ts",
    sintomaDeFalha:
      "Le client envoie une photo du produit ou un justificatif et l’assistant fait comme si l’image n’existait pas.",
    registraEm: "nenhum",
  },

  // ────────────────────────── Melhorar e testar ────────────────────────────
  {
    id: "flywheel_judge",
    rotulo: "Évaluer ses propres conversations",
    oQueFaz:
      "Relit les conversations terminées et juge lesquelles étaient bonnes, pour que l’assistant en tire des leçons.",
    papel: "melhorar",
    exige: {},
    emissor: "lib/agent-engine/flywheel/live.ts",
    sintomaDeFalha:
      "L’écran Propositions ne suggère plus d’améliorations, et l’assistant stagne à son niveau actuel.",
    registraEm: "llm_calls",
  },
  {
    id: "flywheel_distiller",
    rotulo: "Tirer la leçon",
    oQueFaz:
      "Transforme les bonnes conversations en consignes pratiques que l’assistant applique ensuite.",
    papel: "melhorar",
    exige: {},
    emissor: "lib/agent-engine/flywheel/live.ts",
    sintomaDeFalha:
      "Les améliorations repérées ne deviennent pas des consignes, et la même bonne pratique doit être redécouverte à chaque fois.",
    registraEm: "llm_calls",
  },
  {
    id: "connection_test",
    rotulo: "Tester la connexion au fournisseur",
    oQueFaz:
      "Fait un vrai appel au fournisseur pour confirmer que la clé et le modèle choisis fonctionnent.",
    papel: "melhorar",
    exige: {},
    emissor: "lib/agent-engine/edge/llm/test-model.ts",
    sintomaDeFalha:
      "Le bouton de test n’aboutit pas, et vous ne savez pas si les réglages fonctionnent avant la mise en ligne.",
    registraEm: "llm_calls",
  },
  {
    id: "teste_de_agente",
    rotulo: "Essayer l’assistant avant de publier",
    oQueFaz:
      "Fait tourner l’assistant sur une conversation fictive, pour voir comment il répondrait sans parler à un vrai client.",
    papel: "melhorar",
    exige: { tools: true },
    emissor: "lib/ai/runtime/agent.ts",
    fixo: {
      razao:
        "Utilise le modèle de la version de l’assistant que vous essayez — c’est justement ce qui rend l’essai utile. " +
        "Si cet usage avait son propre modèle, vous testeriez un réglage différent de celui que vous allez publier, et l’" +
        "essai ne prédirait plus le vrai comportement. Pour changer de modèle, changez-le dans la version de l’assistant.",
    },
    sintomaDeFalha:
      "L’essai de l’assistant ne renvoie pas de réponse, et vous devez publier à l’aveugle pour savoir si c’est bien.",
    registraEm: "ai_agent_runs",
  },
  {
    id: "contagem_de_tokens",
    rotulo: "Mesurer la taille du contexte",
    oQueFaz:
      "Calcule quelle part de la limite du modèle la conversation occupe déjà, pour savoir quand résumer.",
    papel: "melhorar",
    exige: {},
    emissor: "lib/agent-engine/edge/llm/count-tokens.ts",
    fixo: {
      razao:
        "Chaque famille de modèles mesure la longueur du texte à sa façon, donc la mesure doit venir du même fournisseur que le modèle utilisé — ce n’est pas un choix séparé.",
    },
    sintomaDeFalha:
      "L’application se trompe de moment pour résumer : trop tôt et elle perd le contexte, trop tard et la réponse est refusée.",
    registraEm: "nenhum",
  },
] as const;

/** Índice por id, para quem resolve um binding. */
export const PONTO_POR_ID: ReadonlyMap<string, PontoDeIa> = new Map(
  PONTOS_DE_IA.map((p) => [p.id, p]),
);

/**
 * Os pontos agrupados como a tela mostra. A ordem dentro de cada papel é a de
 * declaração, que já está escrita na ordem em que o operador pensa (o que o
 * cliente vê primeiro, depois o que sustenta aquilo).
 */
export function pontosPorPapel(): Record<PapelDeIa, PontoDeIa[]> {
  const vazio = Object.fromEntries(
    Object.keys(PAPEIS).map((k) => [k, [] as PontoDeIa[]]),
  ) as Record<PapelDeIa, PontoDeIa[]>;

  for (const ponto of PONTOS_DE_IA) vazio[ponto.papel].push(ponto);
  return vazio;
}

/** Os pontos que aceitam troca de modelo — os únicos que a tela deixa editar. */
export function pontosConfiguraveis(): PontoDeIa[] {
  return PONTOS_DE_IA.filter((p) => p.fixo === undefined);
}
