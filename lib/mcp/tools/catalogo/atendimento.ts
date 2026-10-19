/**
 * Capacidades de ATENDIMENTO — cliente, conversa, mensagem.
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
 */
import { declararTools } from "./tipos";

export const TOOLS_ATENDIMENTO = declararTools([
  {
    name: "crm_search_contacts",
    category: "read",
    rotulo: "Rechercher un client",
    explicacao:
      "Retrouve un client par son nom, son téléphone ou son e-mail, pour que l’assistant sache à qui il parle avant de répondre.",
    oQueToca: "Fichier clients",
    risco: "seguro",
    pacotes: ["atender", "vender"],
  },
  {
    name: "crm_get_contact",
    category: "read",
    rotulo: "Voir la fiche du client",
    explicacao:
      "Ouvre la fiche complète d’un client : coordonnées, historique et la façon dont il a connu l’entreprise.",
    oQueToca: "Fichier clients",
    risco: "seguro",
    pacotes: ["atender", "vender"],
  },
  {
    name: "crm_propose_contact_field",
    category: "write",
    // SEM `description` aqui, e não por esquecimento: o catálogo perdeu esse
    // campo no `02d9acea` (eram 51 cópias que ninguém lia). Quem serve a
    // descrição ao cliente MCP é `catalogo-servido.ts:58`, e ele lê
    // `handler.description` — a de `lib/mcp/tools/contacts.ts:135`, que existe e
    // continua valendo. O catálogo responde outra pergunta: o que o HUMANO lê na
    // tela (`rotulo`, `explicacao`, `oQueToca`).
    //
    // Esta linha é o encontro de dois trabalhos que não se viram: a remoção do
    // campo veio pela branch do Índice de Atrito e a ferramenta veio pelo #194.
    // Nenhum dos dois gerou conflito de texto — o `tsc` é que reprovou no merge.
    rotulo: "Noter une info donnée par le client",
    explicacao:
      "Quand le client donne son e-mail, son nom ou son téléphone dans la conversation, garde cette info pour qu’une personne la vérifie avant de l’ajouter à la fiche.",
    oQueToca: "Fichier clients",
    // `atencao`, não `critico`: nada sai para o cliente e nada entra na ficha
    // por conta dela — o peso mora na confirmação, que é humana. Marcar
    // `critico` aqui faria a tela pedir cerimônia para uma anotação.
    risco: "atencao",
    // ⚠️ FORA de "atender", e a razão é o TETO — não o valor da capacidade.
    //
    // O pacote "Atender" já exigia 18 vagas e, com as 3 que um agente novo
    // costuma ter, chega a 21 num teto de 20: ligá-lo já era impossível sem
    // desligar algo antes (o e2e `capacidades-do-agente` mede exatamente isso).
    // Acrescentar esta capacidade ali levaria a 22 — pioraria um defeito
    // conhecido em troca de nada, porque o pacote continuaria não cabendo.
    //
    // Fica em "vender", que tem folga, e continua alcançável em qualquer jornada
    // pelo modo avançado. Quando o teto ou o tamanho do pacote for revisto, esta
    // linha é candidata natural a voltar.
    pacotes: ["vender"],
  },
  {
    name: "crm_list_conversations",
    category: "read",
    rotulo: "Lister les conversations",
    explicacao:
      "Affiche les conversations en cours, qui s’occupe de chacune et la place de chaque client dans la file d’attente.",
    oQueToca: "Service client",
    risco: "seguro",
    pacotes: ["atender", "escalar"],
  },
  {
    name: "crm_get_conversation",
    category: "read",
    rotulo: "Voir une conversation",
    explicacao:
      "Ouvre le détail d’une conversation : qui s’en occupe, les étiquettes posées et depuis combien de temps le client attend.",
    oQueToca: "Service client",
    risco: "seguro",
    pacotes: ["atender", "escalar"],
  },
  {
    name: "crm_get_conversation_history",
    category: "read",
    rotulo: "Lire l’historique de la conversation",
    explicacao:
      "Lit les messages déjà échangés avec le client, pour que l’assistant réponde sans lui faire répéter ce qu’il a déjà dit.",
    oQueToca: "Service client",
    risco: "seguro",
    pacotes: ["atender"],
  },
  {
    name: "crm_send_whatsapp_message",
    category: "write",
    rotulo: "Envoyer un message WhatsApp",
    explicacao:
      "Envoie un message WhatsApp au client. Il le reçoit vraiment sur son téléphone, et on ne peut pas l’annuler.",
    oQueToca: "Service client",
    risco: "critico",
    pacotes: ["atender"],
  },
]);
