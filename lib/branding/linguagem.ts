/**
 * O diagnóstico da marca traduzido para a língua de quem usa o sistema.
 *
 * ── Por que vive em `lib/branding/`, e não dentro de uma das telas ────────────
 *
 * Nasceu em `app/admin/(protected)/marca/_linguagem.ts`, para a tela da marca da
 * INSTALAÇÃO. Com a marca por ORGANIZAÇÃO passaram a existir duas telas que
 * traduzem os mesmos códigos do mesmo motor, e a alternativa — a tela do tenant
 * importar de dentro de `app/admin/` — seria o começo de duas linguagens
 * divergentes: a primeira frase acrescentada de um lado não chegaria ao outro, e
 * o mesmo estado do sistema passaria a ter duas explicações.
 *
 * ── Por que um módulo, e não frases soltas no JSX ─────────────────────────────
 *
 * O motor da marca (`lib/branding/`) fala em código: `accent_deslocado`,
 * `valor_fora_da_allowlist`, `marca_acromatica`. Quem lê estas telas é o dono de
 * uma VPS ou o admin de uma empresa — para eles "o accent foi deslocado" não é
 * informação, é ruído. A tradução mora aqui por duas razões que um `switch`
 * dentro do JSX não daria:
 *
 *  1. `TRADUCOES` é `Record<CodigoDaMarca, Traducao>`, e `CodigoDaMarca` é a
 *     UNIÃO dos três tipos de código que o motor emite. Código novo lá em cima
 *     REPROVA O TYPECHECK aqui — a tela não pode ficar muda sobre um estado que
 *     o motor passou a distinguir, que é exatamente como um alarme morre.
 *  2. o vocabulário proibido (rampa, stop, OKLCH, ΔE, token, WCAG) vira asserção
 *     de teste sobre um objeto — `tests/unit/marca-linguagem.test.ts` —, em vez
 *     de disciplina de quem escreve JSX às pressas. Uma guarda sobre um módulo
 *     cobre as duas telas; a mesma guarda por tela precisaria ser lembrada a
 *     cada tela nova.
 *
 * ── Por que `silencio` e `com_contexto` carregam um `porque` escrito ──────────
 *
 * Mesma regra da `MARCA_CONGELADA` de `tests/unit/branding.test.ts`: uma decisão
 * de NÃO mostrar algo precisa estar escrita, senão é indistinguível de
 * esquecimento — e a próxima pessoa "conserta" acrescentando ruído.
 */

import type { CodigoDeMotivo, Tema } from "@/lib/branding/contraste";
import type { CodigoDoCss } from "@/lib/branding/css";
import type { CodigoDaResolucao } from "@/lib/branding/resolve";

/** Todo código que o motor da marca sabe emitir, nas três camadas. */
export type CodigoDaMarca = CodigoDaResolucao | CodigoDeMotivo | CodigoDoCss;

export type Tom = "informativo" | "atencao" | "problema";

/** Uma linha pronta para a tela. Nunca carrega código, nunca carrega jargão. */
export type Aviso = { readonly tom: Tom; readonly texto: string };

export type Traducao =
  | { readonly modo: "frase"; readonly tom: Tom; readonly texto: string }
  /** A frase depende de contexto (tema, sentido, agrupamento) e é montada em `avisosDaMarca`. */
  | { readonly modo: "com_contexto"; readonly porque: string }
  /** Deliberadamente mudo — outra frase já cobre o mesmo fato. */
  | { readonly modo: "silencio"; readonly porque: string };

/** A mesma frase serve aos três códigos da serialização: para quem lê, o fato é um só. */
const BARRADO_NA_SEGURANCA =
  "La vérification de sécurité a bloqué le résultat avant l’affichage, " +
  "et la marque n’a pas été appliquée.";

export const TRADUCOES: Record<CodigoDaMarca, Traducao> = {
  // ── resolução: o que a camada de configuração achou do que estava gravado ──
  cor_ausente: {
    modo: "silencio",
    porque:
      "ce n’est ni un ajustement ni un refus — cela signifie que cette source ne déclare pas de couleur. L’écran affiche déjà « aucune couleur définie » au bon endroit, et le répéter en avertissement apprend à ignorer les avertissements",
  },
  envelope_malformado: {
    modo: "frase",
    tom: "problema",
    texto: "La valeur enregistrée pour la couleur n’est pas dans un format compris par l’application.",
  },
  semente_invalida: {
    modo: "frase",
    tom: "problema",
    texto: "La couleur enregistrée n’est pas un code couleur valide.",
  },
  formato_desconhecido: {
    modo: "frase",
    tom: "problema",
    texto: "La couleur a été enregistrée par une version plus récente de l’application, et celle-ci ne sait pas la lire.",
  },
  algoritmo_desconhecido: {
    modo: "frase",
    tom: "informativo",
    texto:
      "La couleur a été enregistrée par une autre version de l’application. Elle reste valable — cette version " +
      "recalcule les nuances à partir d’elle.",
  },
  papel_desconhecido: {
    modo: "frase",
    tom: "problema",
    texto:
      "Cette version de l’application ne sait pas où appliquer la couleur enregistrée, elle ne colore donc pas l’interface.",
  },
  papel_nao_pinta: {
    modo: "frase",
    tom: "informativo",
    texto: "La couleur est gardée seulement comme identité : elle apparaît dans le logo, mais ne colore pas les boutons.",
  },
  derivacao_falhou: {
    modo: "frase",
    tom: "problema",
    texto: "Le calcul des nuances à partir de cette couleur n’a pas abouti.",
  },

  // ── derivação: o que o sistema fez com a cor para ela caber na interface ──
  marca_acromatica: {
    modo: "frase",
    tom: "atencao",
    texto:
      "Votre couleur est neutre (gris, noir ou blanc), et une telle couleur ne fait rien ressortir " +
      "à l’écran. Les boutons gardent la couleur par défaut, et la vôtre est réservée au logo.",
  },
  accent_deslocado: {
    modo: "com_contexto",
    porque:
      "la phrase change selon le mode (clair ou sombre) et le sens de l’ajustement — « une nuance plus foncée » et « une nuance plus claire » sont les deux bonnes réponses, dans des situations opposées",
  },
  accent_sem_contraste_possivel: {
    modo: "frase",
    tom: "problema",
    texto:
      "Aucune nuance de cette couleur ne rend tous les éléments lisibles. Certains détails — " +
      "comme le contour du champ sélectionné — sont difficiles à voir.",
  },
  semantica_deslocada: {
    modo: "com_contexto",
    porque:
      "les couleurs d’alerte concernées tiennent en une seule phrase ; une ligne par couleur et par mode donnerait jusqu’à huit avertissements disant la même chose",
  },
  redundancia_nao_cromatica_necessaria: {
    modo: "com_contexto",
    porque:
      "c’est le cas extrême du précédent (aucun écart possible) et il entre dans la même phrase groupée",
  },

  // ── serialização: a última porta antes de a cor virar pixel ──
  nome_de_token_invalido: { modo: "frase", tom: "problema", texto: BARRADO_NA_SEGURANCA },
  valor_fora_da_allowlist: { modo: "frase", tom: "problema", texto: BARRADO_NA_SEGURANCA },
  saida_suspeita: { modo: "frase", tom: "problema", texto: BARRADO_NA_SEGURANCA },
  token_nao_serializado: {
    modo: "silencio",
    porque:
      "c’est l’autre face de l’avertissement sur les couleurs d’alerte, déjà affiché groupé ; dire deux fois la même chose ne fait qu’allonger la liste jusqu’à ce que personne ne la lise",
  },
};

/** Como o dono da instalação chama cada cor de estado do sistema. */
const NOME_DA_COR_DE_ALERTA: Record<string, string> = {
  success: "succès",
  warning: "attention",
  error: "erreur",
  info: "information",
};

function ehCodigoConhecido(codigo: string): codigo is CodigoDaMarca {
  return Object.hasOwn(TRADUCOES, codigo);
}

/** "a" · "a e b" · "a, b e c" */
function listar(itens: readonly string[]): string {
  if (itens.length <= 1) return itens[0] ?? "";
  return `${itens.slice(0, -1).join(", ")} et ${itens[itens.length - 1] ?? ""}`;
}

/**
 * Dedup por TEXTO, não por código: três códigos distintos da serialização dizem
 * a mesma frase de propósito, e `accent_sem_contraste_possivel` sai uma vez por
 * tema. Repetir a linha idêntica faria a lista parecer pior do que o problema é.
 */
function semRepetir(avisos: readonly Aviso[]): Aviso[] {
  const vistos = new Set<string>();
  return avisos.filter((a) => {
    if (vistos.has(a.texto)) return false;
    vistos.add(a.texto);
    return true;
  });
}

/** A forma mínima que as três camadas de motivo compartilham. */
export type MotivoLido = {
  readonly codigo: CodigoDaMarca;
  readonly tema?: Tema | null;
  readonly alvo?: string | null;
};

/**
 * Onde o tom dos botões caiu em relação à COR DA PESSOA, por modo.
 *
 * Positivo = mais escuro que a cor dela; negativo = mais claro; zero = é a cor
 * dela. `null` = a cor não está na escala mostrada — o caso da marca neutra, em
 * que a escala é a do produto e comparar com "a sua cor" não faria sentido.
 *
 * ── Por que NÃO é o deslocamento que o motor devolve ──────────────────────────
 *
 * `TokensDoTema.deslocamento` conta a partir do tom PADRÃO DAQUELE MODO, não da
 * cor da pessoa — e os dois modos partem de tons diferentes de propósito (o
 * escuro parte de um mais claro, para a cor não sumir no fundo). Usá-lo direto
 * produziu uma frase falsa, medida com `#f5c518`: o modo escuro anda +2 e a
 * frase dizia "um tom mais escuro da sua cor", quando o botão pousa EXATAMENTE
 * na cor dela. Quem lê a tela compara com a própria cor; a referência da frase
 * tem de ser a mesma que a do leitor.
 */
export type DistanciaAteSuaCor = {
  readonly claro: number | null;
  readonly escuro: number | null;
};

/**
 * A lista de frases que a tela mostra sob "o que o sistema fez com esta cor".
 *
 * Recebe os motivos JÁ EMITIDOS pelo motor, e não a cor: assim a tela nunca
 * conclui coisa diferente do que o sistema decidiu. A distância entra separada
 * porque o motivo carrega o TEMA, não o sentido — e sem o sentido a frase diria
 * "um tom diferente", que não explica nada.
 */
export function avisosDaMarca(
  motivos: readonly MotivoLido[],
  distancia: DistanciaAteSuaCor,
): Aviso[] {
  const avisos: Aviso[] = [];
  const coresDeAlerta = new Set<string>();
  let saiuDaSuaCor = false;

  /**
   * `null` nos dois modos significa que a cor da pessoa NÃO está na escala em
   * uso — a interface segue com a do produto. Toda frase que começa com "sua
   * cor" fica falsa aí, e a razão é a mesma nos dois casos que dependem disto:
   * MEDIDO com `#808080` e `#ffffff`, a derivação emite `semantica_deslocada`
   * porque o verde do PRODUTO colide com o verde de sucesso do PRODUTO — uma
   * propriedade da nossa paleta, que existia antes de a pessoa colar cor
   * nenhuma. Dizer "sua cor ficou parecida com sucesso" ali culpa quem não fez
   * nada, e manda procurar problema no lugar errado.
   */
  const suaCorPinta = distancia.claro !== null || distancia.escuro !== null;

  for (const motivo of motivos) {
    const traducao = TRADUCOES[motivo.codigo];
    if (traducao.modo === "silencio") continue;
    if (traducao.modo === "frase") {
      avisos.push({ tom: traducao.tom, texto: traducao.texto });
      continue;
    }

    if (motivo.codigo === "accent_deslocado") {
      const noEscuro = motivo.tema === "escuro";
      const degraus = noEscuro ? distancia.escuro : distancia.claro;
      // Ver `suaCorPinta`: comparar com "a sua cor" apontaria para uma cor que
      // não está em degrau nenhum da escala mostrada.
      if (degraus === null) continue;
      const modo = noEscuro ? "sombre" : "clair";
      if (degraus === 0) {
        // O sistema mexeu na escala, mas o botão pousou na cor dela. Dizer que
        // houve ajuste aqui assustaria sem motivo — e calar deixaria o modo sem
        // nenhuma frase, como se a tela não soubesse responder por ele.
        avisos.push({
          tom: "informativo",
          texto:
            `En mode ${modo}, les boutons utilisent exactement votre couleur — l’application a vérifié que le ` +
            `texte posé dessus reste lisible.`,
        });
        continue;
      }
      saiuDaSuaCor = true;
      avisos.push({
        tom: "informativo",
        texto:
          `En mode ${modo}, les boutons utilisent une nuance ${degraus > 0 ? "plus foncée" : "plus claire"} ` +
          `que votre couleur — c’est ce qui garde le texte posé dessus lisible.`,
      });
      continue;
    }

    const nome = NOME_DA_COR_DE_ALERTA[motivo.alvo ?? ""];
    if (nome && suaCorPinta) coresDeAlerta.add(nome);
  }

  // Só quando o botão de fato NÃO é a cor dela: senão a frase consolaria de uma
  // perda que não houve, e frase de consolo desnecessária é o que faz alguém
  // procurar um problema que não existe.
  if (saiuDaSuaCor) {
    avisos.push({
      tom: "informativo",
      texto: "Votre couleur d’origine reste dans le logo et les éléments mis en avant.",
    });
  }
  if (coresDeAlerta.size > 0) {
    avisos.push({
      tom: "atencao",
      texto:
        `Votre couleur ressemble à celle que l’application utilise pour indiquer ` +
        `${listar([...coresDeAlerta].sort())}. Cette version ne sépare pas encore ces nuances ` +
        `toute seule — vérifiez que les alertes restent faciles à distinguer.`,
    });
  }

  return semRepetir(avisos);
}

/**
 * Traduz `platform_branding.fallback_reason` — a coluna que diz por que a marca
 * PAROU de ser aplicada.
 *
 * O formato é o que `motivoDoFallback` grava: códigos separados por vírgula,
 * cada um podendo trazer `@alvo` colado. O alvo é nome de coisa interna
 * (`--color-accent`) e é descartado aqui de propósito: para quem lê, ele não
 * acrescenta nada e desfaz o resto da frase.
 *
 * Código desconhecido NÃO vira silêncio. O alarme está aceso — se esta versão
 * não sabe explicá-lo, ela diz isso, em vez de mostrar um bloco de alerta vazio
 * que parece defeito da tela.
 */
export function motivosDoFallback(motivo: string | null): Aviso[] {
  const avisos: Aviso[] = [];
  for (const parte of (motivo ?? "").split(",")) {
    const codigo = (parte.split("@")[0] ?? "").trim();
    if (codigo.length === 0) continue;
    const traducao = ehCodigoConhecido(codigo) ? TRADUCOES[codigo] : null;
    avisos.push(
      traducao?.modo === "frase"
        ? { tom: "problema", texto: traducao.texto }
        : {
            tom: "problema",
            texto:
              "L’application a refusé la couleur enregistrée pour une raison que cette version ne sait pas expliquer.",
          },
    );
  }
  return semRepetir(avisos);
}
