/**
 * A SUGESTÃO DO QUADRO — o que se pergunta à IA e o que se faz com a resposta.
 *
 * Sem rede e sem banco: quem chama injeta a geração. É o que permite exercitar
 * aqui os desfechos que só apareceriam em produção — o modelo devolvendo prosa,
 * cercando o JSON em crase, inventando um passo, ou não respondendo.
 *
 * ⚠️ A SUGESTÃO SAI DO MESMO CÉREBRO QUE VAI ATENDER. Quem chama passa o
 * provedor, o modelo e a chave da versão publicada do funcionário — não uma
 * configuração própria deste passo. Duas razões: o dono pediu para a sugestão vir
 * "da chave que ele escolheu", e uma sugestão que funciona com OUTRO modelo
 * esconderia justamente o defeito que ele precisa descobrir agora, no wizard, em
 * vez de no primeiro cliente.
 *
 * ⚠️ FALHA NUNCA DEVOLVE QUADRO VAZIO. Todo desfecho ruim cai num pacote pronto
 * do ramo, e o MOTIVO viaja junto para a tela dizer o que houve. O oposto —
 * devolver erro e deixar o passo sem quadro — largaria a pessoa com o funil de
 * e-commerce que o gatilho semeou, que é exatamente o defeito que este passo
 * existe para consertar.
 */
import {
  normalizarProposta,
  validarProposta,
  type PropostaDeFunil,
} from "@/lib/onboarding/proposta-de-funil";
import { PACOTES, PACOTE_PADRAO, type PacoteDeFunil } from "@/lib/onboarding/pacotes-de-funil";

/** O que se sabe do negócio quando a sugestão é pedida. */
export interface ContextoDoNegocio {
  /** O nome que o dono deu no primeiro passo. */
  nome: string;
  /** O que ele respondeu quando perguntamos o que o negócio faz. */
  oQueFaz: string;
}

/**
 * Palavras que o próprio dono usaria — não nomes de vertical de mercado.
 *
 * Serve a dois fins: escolher o pacote quando a IA não responde, e escolher o
 * EXEMPLO que vai no pedido. Sem exemplo, "sugira um funil" volta com
 * "Prospecção", "Nutrição" e "Fundo de funil" — nomes de manual, não os que
 * estão na cabeça de quem atende no WhatsApp.
 */
// Vocabulaire portugais d'origine + français (le marché du produit). Sans le
// français, « Vente de pagnes et tissus wax via WhatsApp » tombait dans le
// tableau générique : constaté par l'écran à l'onboarding (pile locale, 2026-10-19).
const PISTAS: Record<string, RegExp> = {
  clinica:
    /\b(cl[ií]nic|consult[óo]ri|dentist|dentair|odonto|m[ée]dic|terapeut|th[ée]rapeut|psic[óo]log|psycholog|fisioterap|kin[ée]|est[ée]tic|esth[ée]ti|sal[ãa]o|salon|coiff|barbear|barbier|onglerie|petshop|veterin[áa]ri|v[ée]t[ée]rinai|nutricion|nutritionn|pharmac)/i,
  imobiliaria:
    /\b(imobili[áa]ri|immobili|corret|im[óo]ve|apartament|appartement|alugu[ée]|logement|loteament|terren|terrain)/i,
  servicos:
    /\b(ag[êe]nci|agence|consultori|conseil|advocac|advogad|avocat|contabil|comptab|arquitet|architect|engenhar|ing[ée]nier|reform|r[ée]novation|obra|chantier|marcenar|menuis|servi[çc]o|service|manuten[çc]|maintenance|instala[çc]|installation|plomb|[ée]lectricit|nettoyage)/i,
  curso:
    /\b(curso|cours|formation|mentori|mentorat|infoprodut|aula|treinament|workshop|atelier|escola|[ée]cole|ensino|enseignement|coach|soutien scolaire)/i,
  loja:
    /\b(loja|magasin|e-?commerce|commerce|revend|distribuidor|distribut|atacad|grossiste|varej|d[ée]tail|vend[oa] produt|vente|vend|boutique|moda|mode|pagne|wax|tissu|v[êe]tement|habit|chaussure|sac|bijou|cosm[ée]ti|perruque|m[èe]che|[ée]picerie|alimentation)/i,
};

/**
 * O pacote cujo vocabulário mais se parece com o do negócio.
 *
 * Empate resolve pela ordem de `PISTAS`, que é estável — não por sorteio nem
 * por ordem de chave de objeto sobre entrada do usuário.
 */
export function escolherPacotePorTexto(texto: string): PacoteDeFunil {
  for (const [id, pista] of Object.entries(PISTAS)) {
    if (pista.test(texto)) {
      const p = PACOTES.find((x) => x.id === id);
      if (p) return p;
    }
  }
  return PACOTE_PADRAO;
}

/**
 * O pedido, em duas partes.
 *
 * O exemplo vai INTEIRO no pedido de propósito: descrever o formato em prosa
 * ("um array de objetos com nome e passo") produz JSON válido com conteúdo
 * genérico. Um exemplo concreto do ramo produz nomes que o dono reconhece.
 */
export function pedidoDeSugestao(
  ctx: ContextoDoNegocio,
  exemplo: PacoteDeFunil,
): { system: string; prompt: string } {
  const passos = [
    '"new" — vient d’écrire, personne n’a encore répondu',
    '"contacted" — a déjà reçu une réponse',
    '"qualifying" — on comprend ce dont la personne a besoin',
    '"qualified" — on sait déjà quoi proposer',
    '"negotiating" — on fixe le prix, l’horaire ou les conditions',
    '"won" — vente conclue (exactement UNE colonne)',
    '"lost" — vente perdue (exactement UNE colonne)',
    "null — colonne que seule une personne déplace, sans équivalent dans la conversation",
  ].join("\n- ");

  return {
    system:
      "Tu construis le tableau des clients d’une petite entreprise d’Afrique francophone qui vend par WhatsApp. " +
      "Écris comme parle le PATRON, pas comme un manuel de vente : pas de " +
      '"prospection", "MQL", "nurturing" ni "fond de tunnel". Écris en français. ' +
      "Chaque colonne est un moment concret de sa relation avec le client. " +
      "Réponds UNIQUEMENT avec le JSON, sans commentaire et sans backticks.",
    prompt: [
      `Entreprise : ${ctx.nome}`,
      `Activité : ${ctx.oQueFaz}`,
      "",
      "Crée de 5 à 7 colonnes, dans l’ordre où le client les traverse.",
      'Chaque colonne a un "nome" (ce qui s’affiche en haut) et un "passo", qui indique quand l’assistant y déplace le client :',
      `- ${passos}`,
      "",
      `Exemple de format (d’une autre entreprise — ne copie pas les noms, adapte-les à "${ctx.nome}") :`,
      JSON.stringify({ nome: exemplo.proposta.nome, etapas: exemplo.proposta.etapas }, null, 2),
    ].join("\n"),
  };
}

/**
 * Acha o JSON no que o modelo devolveu.
 *
 * Instrução de formato não é garantia de formato: modelos cercam o objeto em
 * ```json, abrem com "Claro! Aqui está:" e fecham com uma explicação. Recortar
 * do primeiro `{` ao último `}` atravessa os três casos sem depender de o
 * provedor suportar saída estruturada — e a OpenRouter serve 400 modelos com
 * suportes diferentes.
 */
export function extrairJson(texto: string): unknown {
  const inicio = texto.indexOf("{");
  const fim = texto.lastIndexOf("}");
  if (inicio === -1 || fim <= inicio) return null;
  try {
    return JSON.parse(texto.slice(inicio, fim + 1));
  } catch {
    return null;
  }
}

/** De onde veio o quadro que a tela vai mostrar. A tela DIZ isto à pessoa. */
export type Sugestao =
  | { origem: "ia"; proposta: PropostaDeFunil }
  | {
      origem: "pacote";
      pacote: PacoteDeFunil;
      /**
       * Por que não veio da IA. Vai para a tela em português — a pessoa acabou
       * de configurar uma chave e precisa saber se ela está funcionando.
       */
      porque: string;
    };

/** A geração, injetável — é o único ponto que toca a rede. */
export type Gerar = (entrada: { system: string; prompt: string }) => Promise<string>;

/**
 * Pede o quadro à IA e devolve algo aproveitável em TODOS os desfechos.
 *
 * O caminho de erro não distingue "modelo devolveu prosa" de "modelo devolveu
 * um funil sem coluna de fechamento": os dois viram a mesma frase na tela,
 * porque para quem instalou o sistema a diferença não muda nada — o que muda é
 * ter um quadro pronto na frente. O detalhe técnico fica no `porque` para quem
 * for investigar.
 */
export async function sugerirFunil(ctx: ContextoDoNegocio, gerar: Gerar): Promise<Sugestao> {
  const exemplo = escolherPacotePorTexto(`${ctx.nome} ${ctx.oQueFaz}`);

  let texto: string;
  try {
    texto = await gerar(pedidoDeSugestao(ctx, exemplo));
  } catch (err) {
    return {
      origem: "pacote",
      pacote: exemplo,
      porque: err instanceof Error ? err.message : String(err),
    };
  }

  const bruta = extrairJson(texto);
  if (!bruta || typeof bruta !== "object") {
    return { origem: "pacote", pacote: exemplo, porque: "la réponse n’était pas au format attendu" };
  }

  const proposta = normalizarProposta(bruta as { nome?: unknown; etapas?: unknown });
  const veredito = validarProposta(proposta);
  if (!veredito.ok) {
    return { origem: "pacote", pacote: exemplo, porque: veredito.erros.join(" ") };
  }

  return { origem: "ia", proposta: veredito.proposta };
}
