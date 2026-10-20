/**
 * Capacidades de COMÉRCIO e PRIVACIDADE — o que o cliente comprou, o que existe
 * à venda, e quem pediu para sair.
 *
 * Ver `docs/handoffs/BRIEFING-ia-360.md` §4 para o contrato dos campos.
 */
import { declararTools } from "./tipos";

export const TOOLS_COMERCIO = declararTools([
  {
    name: "crm_list_contact_orders",
    category: "read",
    rotulo: "Voir les achats du client",
    explicacao:
      "Montre ce que ce client a déjà acheté, combien il a payé et où en est la livraison, pour que l’assistant ne promette pas un délai au hasard ni ne répète une offre déjà acceptée.",
    oQueToca: "Achats du client",
    risco: "seguro",
    pacotes: ["vender", "atender"],
  },
  {
    name: "crm_search_products",
    category: "read",
    rotulo: "Rechercher un produit dans la boutique",
    explicacao:
      "Cherche un produit par son nom et donne son prix et la quantité en stock, pour que l’assistant réponde avec les infos de la boutique au lieu de deviner.",
    oQueToca: "Catalogue de la boutique",
    risco: "seguro",
    pacotes: ["vender", "atender"],
  },
  {
    name: "crm_list_privacy_requests",
    category: "read",
    rotulo: "Voir les demandes de confidentialité",
    explicacao:
      "Montre qui a demandé à exporter ou supprimer ses données et dans quel délai, pour que l’assistant arrête de relancer ceux qui ont demandé à partir.",
    oQueToca: "Confidentialité et données du client",
    risco: "seguro",
    pacotes: ["organizar", "atender"],
  },
]);
