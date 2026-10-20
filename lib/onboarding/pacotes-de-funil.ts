/**
 * OS QUADROS PRONTOS, POR TIPO DE NEGÓCIO.
 *
 * Existem por duas razões, e a segunda é a que importa mais:
 *
 * 1. São o PLANO B. Quando a chave de IA não está no lugar, não tem saldo, ou o
 *    provedor devolve algo que não vira funil, o passo continua entregando um
 *    quadro que faz sentido — em vez de devolver a pessoa ao funil de
 *    e-commerce que o gatilho semeou. Falhar fechado na ação, aberto na
 *    informação: a tela diz que a sugestão não veio e mostra os prontos.
 *
 * 2. São a RÉGUA. É contra estes exemplos que a sugestão da IA é pedida e
 *    comparada. Sem um alvo concreto, "sugira um funil" devolve cinco colunas
 *    com nomes de manual de vendas ("Prospecção", "MQL", "Fundo de funil") que
 *    não são o que o dono de uma clínica chama as coisas.
 *
 * ⚠️ TODA ETAPA CARREGA O PASSO. Um pacote que só desse os nomes trocaria um
 * quadro errado por um quadro certo e igualmente parado — ver o cabeçalho de
 * `proposta-de-funil.ts` para a medição.
 */
import type { PropostaDeFunil } from "@/lib/onboarding/proposta-de-funil";

export interface PacoteDeFunil {
  id: string;
  /**
   * Como o dono reconhece o próprio negócio nesta lista. Não é o nome do nicho
   * no material de marketing ("vertical de saúde") — é o que ele responderia se
   * alguém perguntasse o que ele faz.
   */
  comoSeApresenta: string;
  proposta: PropostaDeFunil;
}

export const PACOTES: readonly PacoteDeFunil[] = [
  {
    id: "clinica",
    comoSeApresenta: "Clinique, cabinet ou salon",
    proposta: {
      nome: "Rendez-vous",
      etapas: [
        { nome: "Nouveau contact", passo: "new" },
        { nome: "Déjà répondu", passo: "contacted" },
        { nome: "Comprend le besoin", passo: "qualifying" },
        { nome: "Veut un rendez-vous", passo: "qualified" },
        { nome: "Choisit le créneau", passo: "negotiating" },
        { nome: "Rendez-vous pris", passo: "won" },
        { nome: "Ne prendra pas rendez-vous", passo: "lost" },
      ],
    },
  },
  {
    id: "imobiliaria",
    comoSeApresenta: "Agence immobilière ou agent",
    proposta: {
      nome: "Intéressés",
      etapas: [
        { nome: "Nouvel intéressé", passo: "new" },
        { nome: "Déjà répondu", passo: "contacted" },
        { nome: "Comprend ce qu’il cherche", passo: "qualifying" },
        { nome: "Sait quoi proposer", passo: "qualified" },
        { nome: "Visites en cours", passo: "negotiating" },
        { nome: "Affaire conclue", passo: "won" },
        { nome: "A abandonné", passo: "lost" },
      ],
    },
  },
  {
    id: "servicos",
    comoSeApresenta: "Services, agence ou chantier",
    proposta: {
      nome: "Devis",
      etapas: [
        { nome: "Nouvelle demande", passo: "new" },
        { nome: "Déjà répondu", passo: "contacted" },
        { nome: "Comprend le projet", passo: "qualifying" },
        { nome: "Devis envoyé", passo: "qualified" },
        { nome: "En négociation", passo: "negotiating" },
        { nome: "Conclu", passo: "won" },
        { nome: "Non conclu", passo: "lost" },
      ],
    },
  },
  {
    id: "curso",
    comoSeApresenta: "Formation, coaching ou produit numérique",
    proposta: {
      nome: "Inscriptions",
      etapas: [
        { nome: "Nouvel intéressé", passo: "new" },
        { nome: "Déjà répondu", passo: "contacted" },
        { nome: "Répond aux questions", passo: "qualifying" },
        { nome: "Veut s’inscrire", passo: "qualified" },
        { nome: "Finalise les conditions", passo: "negotiating" },
        { nome: "Inscrit", passo: "won" },
        { nome: "A abandonné", passo: "lost" },
      ],
    },
  },
  {
    id: "loja",
    comoSeApresenta: "Boutique — en ligne ou physique",
    proposta: {
      nome: "Ventes",
      etapas: [
        { nome: "Nouveau contact", passo: "new" },
        { nome: "Déjà répondu", passo: "contacted" },
        { nome: "Choisit le produit", passo: "qualifying" },
        { nome: "Va acheter", passo: "qualified" },
        { nome: "Paiement attendu", passo: "negotiating" },
        { nome: "Commande payée", passo: "won" },
        { nome: "N’a pas acheté", passo: "lost" },
      ],
    },
  },
  {
    id: "generico",
    // Último de propósito: quem não se reconhece em nenhum dos outros já leu
    // todos antes de chegar aqui.
    comoSeApresenta: "Autre type d’activité",
    proposta: {
      nome: "Clients",
      etapas: [
        { nome: "Nouveau contact", passo: "new" },
        { nome: "Déjà répondu", passo: "contacted" },
        { nome: "Comprend le besoin", passo: "qualifying" },
        { nome: "Proposition envoyée", passo: "qualified" },
        { nome: "En négociation", passo: "negotiating" },
        { nome: "Conclu", passo: "won" },
        { nome: "Non conclu", passo: "lost" },
      ],
    },
  },
] as const;

/**
 * O pacote de último recurso.
 *
 * Existe como CONSTANTE e não como `PACOTES[0]` porque quem chama precisa de uma
 * garantia de que sempre há um: um índice fixo numa lista editável é a promessa
 * que se quebra na primeira reordenação, e o desfecho seria uma tela de
 * onboarding com `undefined` no lugar do quadro.
 */
export const PACOTE_PADRAO: PacoteDeFunil =
  PACOTES.find((p) => p.id === "generico") ??
  (() => {
    throw new Error("PACOTES sem o pacote genérico — ele é o último recurso do passo do funil");
  })();
