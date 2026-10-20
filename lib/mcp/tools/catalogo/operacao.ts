/**
 * Capacidades de ORGANIZAR A OPERAÇÃO — a casa onde o atendimento acontece:
 * etapas do funil, marcadores, respostas prontas, entradas automáticas de
 * contatos, regras automáticas e time.
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
 * ⚠️ SOBRE O RISCO `critico` DESTE ARQUIVO. O gate mecânico
 * (`tests/unit/catalogo-tools-leigo-friendly.test.ts`) só sabe conferir que uma
 * tool de leitura não se anuncia perigosa e que uma de escrita não se anuncia
 * inofensiva — ele **não** distingue `atencao` de `critico`. A régua usada aqui é
 * uma pergunta só: **o efeito acontece quando ninguém está olhando?**
 *   - Renomear ou reordenar etapa muda o que o usuário vê na hora e ele desfaz
 *     na tela → `atencao`.
 *   - Ligar/desligar regra automática e ligar/desligar entrada automática mudam
 *     o COMPORTAMENTO DO SISTEMA para todos os eventos futuros, sem ninguém
 *     assistindo, e o efeito sai da empresa (mensagem ao cliente, dado para
 *     fora) → `critico`.
 *   - Arquivar etapa mexe em onde os negócios estão parados → `critico`.
 * Errar para baixo aqui dá ao agente poder que o humano não sabe que concedeu,
 * porque `critico` é exatamente o que `entraPorPacote()` recusa ligar sozinho.
 *
 * ⚠️ AS SEIS ESCRITAS DESTE ARQUIVO SÃO `apenasHumano`, E ISSO É PARIDADE, NÃO
 * TIMIDEZ. A régua do épico para o papel de uma capacidade é o que a ROTA HTTP
 * equivalente exige (ver `tests/unit/capacidade-alcancavel-pelo-agente.test.ts`).
 * As três rotas que estas tools espelham — `pipelines/[id]/stages`,
 * `webhook-sources` e `automation-rules` — exigem `manager`, todas: **nem um
 * atendente humano configura a operação pela tela**. Onde a rota pede `agent` e
 * a tool pedia `manager` havia divergência e ela foi corrigida (`bddeeb6`); aqui
 * não há divergência nenhuma, e baixar para `agent` daria à IA um poder que o
 * produto não dá a uma pessoa com o mesmo papel.
 *
 * A consequência é honesta e tem que ser dita na tela, que é para isso que o
 * campo serve: no pacote "Organizar a operação", o agente **lê tudo e muda
 * nada**. As dez leituras são o que ele de fato ganhou — explicar a operação,
 * diagnosticar a entrada que parou de receber, mostrar a automação que falhou,
 * parar de inventar marcador. As escritas ficam com quem já as tinha.
 *
 * ⚠️ SEM JARGÃO, e a lista proibida do gate inclui "webhook", "pipeline",
 * "stage", "tag" e "lead". Os nomes escolhidos: **funil**, **etapa**,
 * **marcador**, **oportunidade** e **entrada automática de contatos** — este
 * último em lugar de "aviso automático" porque a peça não avisa ninguém, ela
 * RECEBE gente de fora, e um rótulo que descreve errado confunde mais que um
 * termo técnico.
 */
import { declararTools } from "./tipos";

export const TOOLS_OPERACAO = declararTools([
  // ---- funil e etapas ----
  {
    name: "crm_list_stages",
    category: "read",
    rotulo: "Voir les colonnes d’un tableau",
    explicacao:
      "Montre les colonnes d’un tableau dans leur ordre d’affichage, pour que l’assistant sache où placer chaque affaire.",
    oQueToca: "Tableau des ventes",
    risco: "seguro",
    pacotes: ["organizar", "vender"],
  },
  {
    name: "crm_create_stage",
    category: "write",
    rotulo: "Créer une colonne dans le tableau",
    explicacao:
      "Ajoute une nouvelle colonne à la fin du tableau, quand votre façon de travailler a une étape qui n’y figure pas encore.",
    oQueToca: "Tableau des ventes",
    risco: "atencao",
    pacotes: ["organizar"],
    apenasHumano: true,
  },
  {
    name: "crm_update_stage",
    category: "write",
    rotulo: "Renommer ou déplacer une colonne",
    explicacao:
      "Change le nom d’une colonne du tableau, sa place dans l’ordre, ou indique dans quelle colonne une affaire est considérée gagnée ou perdue.",
    oQueToca: "Tableau des ventes",
    risco: "atencao",
    pacotes: ["organizar"],
    apenasHumano: true,
  },
  {
    name: "crm_archive_stage",
    category: "write",
    rotulo: "Archiver une colonne du tableau",
    explicacao:
      "Retire une colonne du tableau et déplace ses affaires vers une autre colonne de votre choix. L’historique reste conservé.",
    oQueToca: "Tableau des ventes",
    risco: "critico",
    pacotes: ["organizar"],
    apenasHumano: true,
  },

  // ---- marcadores ----
  {
    name: "crm_list_tags",
    category: "read",
    rotulo: "Voir les étiquettes utilisées",
    explicacao:
      "Montre les étiquettes déjà utilisées et sur combien de conversations, pour que l’assistant les réutilise au lieu d’en inventer une semblable.",
    oQueToca: "Organisation du travail",
    risco: "seguro",
    pacotes: ["organizar", "atender"],
  },

  // ---- respostas prontas ----
  {
    name: "crm_list_message_templates",
    category: "read",
    rotulo: "Voir les réponses toutes prêtes",
    explicacao:
      "Liste les textes déjà écrits pour répondre aux situations habituelles, avec le raccourci de chacun.",
    oQueToca: "Réponses toutes prêtes",
    risco: "seguro",
    pacotes: ["atender", "organizar"],
  },
  {
    name: "crm_render_message_template",
    category: "read",
    rotulo: "Compléter une réponse toute prête",
    explicacao:
      "Prend une réponse toute prête et remplit les trous avec les infos du client, en signalant s’il en reste un vide. N’envoie rien.",
    oQueToca: "Réponses toutes prêtes",
    risco: "seguro",
    pacotes: ["atender", "organizar"],
  },

  // ---- entradas automáticas de contatos ----
  {
    name: "crm_list_webhook_sources",
    category: "read",
    rotulo: "Voir les arrivées automatiques de contacts",
    explicacao:
      "Montre par où arrivent automatiquement les contacts venus du site ou d’un autre outil, si chaque arrivée est active et quand elle a reçu pour la dernière fois.",
    oQueToca: "Arrivée automatique de contacts",
    risco: "seguro",
    pacotes: ["organizar"],
  },
  {
    name: "crm_list_webhook_source_events",
    category: "read",
    rotulo: "Voir ce qui est arrivé par une source",
    explicacao:
      "Montre les derniers contacts arrivés par une source et les infos reçues, pour comprendre pourquoi quelque chose n’est pas arrivé comme prévu.",
    oQueToca: "Arrivée automatique de contacts",
    risco: "seguro",
    pacotes: ["organizar"],
  },
  {
    name: "crm_create_webhook_source",
    category: "write",
    rotulo: "Créer une arrivée automatique de contacts",
    explicacao:
      "Crée une nouvelle adresse pour que le site de l’entreprise envoie des contacts directement dans un tableau. Dès lors, il reçoit des personnes de l’extérieur tout seul.",
    oQueToca: "Arrivée automatique de contacts",
    risco: "critico",
    pacotes: ["organizar"],
    apenasHumano: true,
  },
  {
    name: "crm_set_webhook_source_active",
    category: "write",
    rotulo: "Activer ou couper une arrivée de contacts",
    explicacao:
      "Fait qu’une source recommence à recevoir des contacts, ou s’arrête. Coupée, le formulaire de votre site reste en ligne et personne n’est prévenu.",
    oQueToca: "Arrivée automatique de contacts",
    risco: "critico",
    pacotes: ["organizar"],
    apenasHumano: true,
  },

  // ---- regras automáticas ----
  {
    name: "crm_list_automation_rules",
    category: "read",
    rotulo: "Voir les règles automatiques",
    explicacao:
      "Montre ce que l’entreprise a réglé pour se faire tout seul, ce qui déclenche chaque règle et si elle est active.",
    oQueToca: "Règles automatiques",
    risco: "seguro",
    pacotes: ["organizar"],
  },
  {
    name: "crm_list_automation_runs",
    category: "read",
    rotulo: "Voir ce que les règles ont déclenché",
    explicacao:
      "Montre ce qui s’est fait tout seul récemment et ce qui a échoué, pour repérer ce qui a cessé de marcher sans que personne ne le remarque.",
    oQueToca: "Règles automatiques",
    risco: "seguro",
    pacotes: ["organizar"],
  },
  {
    name: "crm_set_automation_rule_active",
    category: "write",
    rotulo: "Activer ou couper une règle automatique",
    explicacao:
      "Fait qu’une règle se lance toute seule à chaque déclencheur, ou s’arrête. Active, elle peut écrire à de vrais clients.",
    oQueToca: "Règles automatiques",
    risco: "critico",
    pacotes: ["organizar"],
    apenasHumano: true,
  },

  // ---- time ----
  {
    name: "crm_list_team_members",
    category: "read",
    rotulo: "Voir qui travaille dans l’entreprise",
    explicacao:
      "Liste les membres de l’équipe et ce que chacun peut faire ici, pour que l’assistant sache à qui confier une conversation.",
    oQueToca: "Équipe du service client",
    risco: "seguro",
    pacotes: ["organizar", "escalar"],
  },
]);
