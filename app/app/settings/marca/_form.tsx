"use client";

/**
 * O formulário da marca por organização.
 *
 * ── Por que a prévia remonta a PILHA INTEIRA, e não só a cor digitada ────────
 *
 * A tela da instalação (`/admin/marca`) resolve só a camada dela, porque lá não
 * há nada acima nem abaixo que dispute. Aqui há: a organização fica no topo, a
 * instalação no meio e o arquivo de instalação embaixo, com precedência POR
 * CAMPO — quem define só a cor mantém o nome do revendedor. Uma prévia que
 * ignorasse as camadas de baixo acertaria o caso comum e erraria exatamente o
 * caso de borda, que é o que esta tela existe para mostrar.
 *
 * A mesma ordem de camadas é a que `app/app/layout.tsx` usa no render, por
 * `lib/branding/organizacao.ts`. Ela é montada aqui a partir do MESMO array
 * (`abaixo`), usado duas vezes: uma para saber o que aparece sem a organização
 * (o placeholder) e outra com a camada dela no topo. Dois arrays divergiriam.
 */

import { useMemo, useState, useTransition } from "react";
import { useT } from "@/hooks/i18n/useT";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { updateMarcaDaOrganizacao } from "@/app/actions/settings/updateMarcaDaOrganizacao";
import { CampoDeLogo } from "@/components/branding/CampoDeLogo";
import { TiraDeTons, type ItemDaLegenda } from "@/components/branding/TiraDeTons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cssDaMarca, ESCOPO_DA_ORGANIZACAO } from "@/lib/branding/css";
import {
  avisosDaMarca,
  type Aviso,
  type DistanciaAteSuaCor,
  type Tom,
} from "@/lib/branding/linguagem";
import { ehHexValido, K, normalizarHex } from "@/lib/branding/rampa";
import { REGUA_DO_PRODUTO } from "@/lib/branding/regua-do-produto";
import {
  camadaDaInstalacao,
  camadaDaOrganizacao,
  camadaDoAmbiente,
  resolverMarca,
  type LinhaDaInstalacao,
} from "@/lib/branding/resolve";
import { marcaDaOrganizacaoSchema } from "@/lib/schemas/settings";

interface Props {
  /**
   * O que está gravado em `settings.branding` desta organização.
   *
   * `logo_path` entra aqui porque a PRÉVIA precisa saber se o logo é desta
   * camada ou herdado — e as duas frases que a tela escreve são diferentes. Ele
   * NÃO entra no `Salvar`: o arquivo tem rota própria e escritor próprio no
   * banco (`fn_definir_logo_da_organizacao`), justamente porque a função da
   * marca substitui o objeto `branding` inteiro.
   */
  readonly gravada: {
    readonly app_name: string | null;
    readonly accent_hex: string | null;
    readonly logo_path: string | null;
  };
  /** A linha da marca da INSTALAÇÃO — a camada logo abaixo desta. */
  readonly instalacao: LinhaDaInstalacao;
  /** O arquivo de instalação do servidor — o fundo da pilha. */
  readonly ambiente: {
    readonly APP_NAME?: string;
    readonly APP_LOGO_URL?: string;
    readonly APP_ACCENT_HEX?: string;
  };
}

/** Mensagem por código de recusa da server action. */
const ERRO_EM_PORTUGUES: Record<string, string> = {
  validation_failed: "Un champ n’est pas dans le format attendu.",
  unauthenticated: "Votre session a expiré. Reconnectez-vous pour enregistrer.",
  forbidden_tenant: "Impossible d’identifier votre entreprise. Rechargez la page.",
  forbidden_role: "Seul l’administrateur de cette entreprise peut modifier la marque.",
  // NUNCA "salvo com uma ressalva": este código existe justamente porque a
  // gravação não casou nenhuma linha, e a tela dizer "salvo" quando nada foi
  // gravado é a forma exata do defeito que a função SQL veio fechar.
  nao_gravou: "La modification n’a pas atteint la base de données — rien n’a changé. Réessayez.",
};

const CLASSE_DO_TOM: Record<Tom, string> = {
  informativo: "text-text-muted",
  atencao: "text-warning-fg",
  problema: "text-error-fg",
};

/** Cinza médio para o seletor visual quando o campo ainda não tem cor válida. */
const COR_NEUTRA_DO_SELETOR = "#808080";

/**
 * De onde veio o campo, na língua de quem administra UMA empresa.
 *
 * Três estados e não dois: para este leitor, "quem instalou o sistema escolheu"
 * e "ninguém escolheu, é o padrão" levam a ações diferentes — no primeiro caso
 * ele pede ao fornecedor, no segundo ele mesmo resolve aqui. A distinção interna
 * entre a tabela da instalação e o arquivo do servidor, essa sim, não muda nada
 * para ele e some.
 */
function origemEmPortugues(origem: string): string {
  if (origem === "organizacao") return "vous l’avez défini ici";
  if (origem === "padrao") return "c’est la valeur par défaut du système";
  return "provient de la personne qui a installé le système";
}

function LinhaDeOrigem({ campo, valor }: { campo: string; valor: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border py-2 last:border-b-0">
      <span className="text-sm text-text">{campo}</span>
      <span className="text-sm text-text-muted">{valor}</span>
    </div>
  );
}

export function FormularioDaMarcaDaOrganizacao({ gravada, instalacao, ambiente }: Props) {
  const t = useT();
  const router = useRouter();
  const [nome, setNome] = useState(gravada.app_name ?? "");
  const [hex, setHex] = useState(gravada.accent_hex ?? "");
  const [erroTecnico, setErroTecnico] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const nomeLimpo = nome.trim();
  const hexLimpo = hex.trim();
  const hexValido = hexLimpo.length === 0 || ehHexValido(hexLimpo);

  // As duas camadas de baixo, montadas uma vez. `abaixo` sozinho responde "o que
  // aparece se eu não definir nada"; com a camada da organização na frente,
  // responde "o que vai aparecer se eu salvar isto".
  const abaixo = useMemo(
    () => [camadaDaInstalacao(instalacao), camadaDoAmbiente(ambiente)],
    [instalacao, ambiente],
  );

  /** O que a empresa mostraria com os campos vazios — vira placeholder, nunca texto fixo. */
  const semAOrganizacao = useMemo(() => resolverMarca(abaixo, REGUA_DO_PRODUTO), [abaixo]);

  const resolvida = useMemo(
    () =>
      resolverMarca(
        [
          camadaDaOrganizacao({
            app_name: nomeLimpo.length > 0 ? nomeLimpo : null,
            accent_hex: hexLimpo.length > 0 ? hexLimpo : null,
            // GRAVADO, não digitado: o logo não é campo deste formulário — ele
            // já está no banco quando esta tela renderiza. Entra na prévia para
            // que o bloco "de onde vem cada coisa" possa responder sobre ele.
            logo_path: gravada.logo_path,
          }),
          ...abaixo,
        ],
        REGUA_DO_PRODUTO,
      ),
    [nomeLimpo, hexLimpo, gravada.logo_path, abaixo],
  );

  // A MESMA serialização, com o MESMO escopo, que o layout de `/app` roda no
  // servidor — inclusive o seletor. É o que permite a tela dizer "esta cor não
  // seria aplicada" ANTES de salvar, em vez de a pessoa descobrir pela tela
  // continuar igual depois.
  const serializacao = useMemo(
    () => cssDaMarca(resolvida.cor, ESCOPO_DA_ORGANIZACAO),
    [resolvida.cor],
  );

  const derivada = resolvida.cor?.derivada ?? null;

  /**
   * Em que degrau da escada cada papel pousou. O clamp não é zelo: com
   * deslocamento grande o índice aritmético sai do array, e o motor prende nas
   * pontas (`stop()`). A tira tem de marcar o degrau que de fato pinta.
   */
  const degraus = useMemo(() => {
    if (!derivada) return null;
    const preso = (indice: number) => Math.max(0, Math.min(10, indice));
    return {
      suaCor: derivada.origemDaRampa === "semente" ? K : null,
      claro: preso(REGUA_DO_PRODUTO.claro.indices.accent + derivada.claro.deslocamento),
      escuro: preso(REGUA_DO_PRODUTO.escuro.indices.accent + derivada.escuro.deslocamento),
    };
  }, [derivada]);

  // A distância é medida a partir da COR DA PESSOA, que é a referência de quem
  // lê. Ver `DistanciaAteSuaCor` em `lib/branding/linguagem.ts`.
  const distancia = useMemo<DistanciaAteSuaCor>(() => {
    if (!degraus || degraus.suaCor === null) return { claro: null, escuro: null };
    const suaCor = degraus.suaCor;
    return { claro: degraus.claro - suaCor, escuro: degraus.escuro - suaCor };
  }, [degraus]);

  const avisos = useMemo<Aviso[]>(
    () => avisosDaMarca([...resolvida.motivos, ...serializacao.motivos], distancia),
    [resolvida.motivos, serializacao.motivos, distancia],
  );

  const legenda = useMemo<ItemDaLegenda[]>(() => {
    if (!derivada || !degraus) return [];
    return [
      {
        rotulo: t("Votre couleur"),
        hex: derivada.marca,
        indice: degraus.suaCor,
        nota: degraus.suaCor === null ? t("hors échelle — utilisée uniquement sur le logo") : undefined,
      },
      { rotulo: t("Boutons en mode clair"), hex: derivada.claro.accent, indice: degraus.claro },
      { rotulo: t("Boutons en mode sombre"), hex: derivada.escuro.accent, indice: degraus.escuro },
    ];
  }, [derivada, degraus]);

  function handleSubmit(evento: React.FormEvent) {
    evento.preventDefault();
    setErroTecnico(null);

    // Os dois campos vazios = "volte ao que vem do sistema". A action traduz esse
    // par de `null` em apagar a chave inteira, e não em gravar um envelope vazio.
    const lido = marcaDaOrganizacaoSchema.safeParse({
      app_name: nomeLimpo.length > 0 ? nomeLimpo : null,
      accent_hex: hexLimpo.length > 0 ? hexLimpo : null,
    });
    if (!lido.success) {
      toast.error(t("Vérifiez les champs : une valeur n’est pas dans le format attendu."));
      return;
    }

    startTransition(async () => {
      const resultado = await updateMarcaDaOrganizacao(lido.data);
      if (resultado.ok) {
        toast.success(t("Marque enregistrée."));
        // O bloco de cor e o nome no menu são emitidos pelo LAYOUT de `/app`, e a
        // action já revalidou `/app` como layout. O refresh é o que traz esse
        // render novo para esta aba — sem ele a pessoa salvaria, veria "ok" e
        // continuaria navegando com a cor velha até recarregar na mão.
        router.refresh();
        return;
      }
      const mensagemConhecida = ERRO_EM_PORTUGUES[resultado.error];
      toast.error(
        mensagemConhecida ? t(mensagemConhecida) : t("Impossible d’enregistrer la marque pour le moment."),
      );
      // Recusa que esta tela não sabe nomear não pode virar só um toast genérico:
      // o texto cru é o que torna o problema diagnosticável para quem tem acesso
      // ao servidor. Falhar fechado na ação, aberto na informação.
      if (!ERRO_EM_PORTUGUES[resultado.error]) setErroTecnico(resultado.error);
    });
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold tracking-tight text-text">
          {t("Apparence de votre entreprise")}
        </h2>

        <div className="space-y-2">
          <Label htmlFor="org_app_name">{t("Nom de votre entreprise")}</Label>
          <Input
            id="org_app_name"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            // O placeholder é o nome EM VIGOR sem esta camada, e não um texto
            // fixo: é assim que o campo vazio responde "e se eu não preencher?".
            placeholder={semAOrganizacao.name}
            maxLength={120}
            autoComplete="off"
          />
          <p className="text-xs text-text-muted">
            {t(
              "S’affiche dans la barre latérale pour les membres de cette entreprise. Laissez vide pour utiliser {name}.",
            ).replace("{name}", semAOrganizacao.name)}
          </p>
        </div>

        <div className="space-y-2">
          <Label htmlFor="org_accent_hex">{t("Couleur de votre marque")}</Label>
          <div className="flex items-center gap-3">
            {/* Atalho, nunca o controle principal: o seletor do navegador escolhe
                UM pixel e não mostra o que o sistema faz com ele. Quem ensina é a
                escala abaixo. */}
            <label
              className="relative h-10 w-10 shrink-0 cursor-pointer overflow-hidden rounded-sm border border-border"
              style={{
                backgroundColor: ehHexValido(hexLimpo)
                  ? normalizarHex(hexLimpo)
                  : COR_NEUTRA_DO_SELETOR,
              }}
            >
              <span className="sr-only">{t("Choisir la couleur visuellement")}</span>
              <input
                type="color"
                value={ehHexValido(hexLimpo) ? normalizarHex(hexLimpo) : COR_NEUTRA_DO_SELETOR}
                onChange={(e) => setHex(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
            <Input
              id="org_accent_hex"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              placeholder="#7a5cd6"
              spellCheck={false}
              autoComplete="off"
              aria-invalid={!hexValido}
              aria-describedby="ajuda-da-cor-da-organizacao"
              className="w-36 font-mono"
            />
            {hexLimpo.length > 0 && !hexValido ? (
              <span className="text-sm text-error-fg">
                {t("Utilisez un code couleur comme #7a5cd6.")}
              </span>
            ) : null}
          </div>
          <p id="ajuda-da-cor-da-organizacao" className="text-xs text-text-muted">
            {t("Laissez vide pour revenir à la couleur déjà utilisée par le système.")}
          </p>
        </div>

        {derivada ? (
          <div className="space-y-2">
            <p className="text-sm text-text-muted">
              {t(
                "À partir de votre couleur, le système construit cette échelle et choisit le ton utilisé pour les boutons :",
              )}
            </p>
            <TiraDeTons tons={derivada.rampa} legenda={legenda} />
            {/* Fato de desenho do produto, não diagnóstico desta cor: o modo
                escuro parte de um tom mais claro da escala por construção. Sem
                esta linha, ver dois tons marcados na escala parece incoerência. */}
            <p className="text-xs text-text-muted">
              {t(
                "En mode sombre, le système utilise naturellement un ton plus clair de l’échelle afin que la couleur reste visible sur le fond sombre.",
              )}
            </p>
          </div>
        ) : null}

        {/*
          O logo fica na MESMA prancheta que o nome e a cor porque, para quem
          administra a empresa, é a mesma pergunta ("como minha empresa
          aparece"). O que o separa é o mecanismo — ele sobe na hora, sem passar
          pelo Salvar —, e isso a própria caixa explica.
        */}
        <CampoDeLogo
          escopo="organizacao"
          // Literal, nunca memoizado: a identidade deste objeto é o que diz ao
          // campo que houve render NOVO do servidor. Ver os Props de CampoDeLogo.
          logoDaCamada={{
            url: resolvida.origens.logoUrl === "organizacao" ? resolvida.logoUrl : null,
          }}
          logoHerdado={semAOrganizacao.logoUrl}
          origemDoHerdado={t("de la personne qui a installé le système")}
          nomeEmVigor={resolvida.name}
        />
      </Card>

      {/*
        O LAÇO DE RETORNO desta feature (invariante 7 do Sistema Vivo).

        Sem este bloco, a pessoa que colasse um amarelo e visse outro tom nos
        botões concluiria que o produto está quebrado — e a única resposta
        disponível seria abrir um chamado. Aqui o sistema conta o que fez com a
        cor dela, e de onde vem cada campo, com os motivos que o próprio motor
        emitiu (nunca uma conclusão que a tela tirou por conta).
      */}
      <Card className="space-y-3 p-6">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-text">
            {t("Origine de chaque élément")}
          </h2>
          <p className="text-sm text-text-muted">
            {t("D’après les valeurs des champs ci-dessus.")}
          </p>
        </div>

        <div>
          <LinhaDeOrigem campo={t("Nom")} valor={t(origemEmPortugues(resolvida.origens.nome))} />
          <LinhaDeOrigem campo={t("Couleur")} valor={t(origemEmPortugues(resolvida.origens.cor))} />
          <LinhaDeOrigem
            campo={t("Logo")}
            valor={t(origemEmPortugues(resolvida.origens.logoUrl))}
          />
        </div>

        {avisos.length > 0 ? (
          <ul className="space-y-1.5">
            {avisos.map((aviso) => (
              <li key={aviso.texto} className={`text-sm ${CLASSE_DO_TOM[aviso.tom]}`}>
                {t(aviso.texto)}
              </li>
            ))}
          </ul>
        ) : null}

        {!serializacao.css && resolvida.cor ? (
          <p className="text-sm text-error-fg">
            {t(
              "En l’état, cette couleur n’atteindrait pas l’interface : le système conserverait la couleur déjà utilisée.",
            )}
          </p>
        ) : null}
      </Card>

      {/*
        O bloco honesto. Sem ele, a pessoa troca a cor, encontra o nome antigo em
        algum canto do produto e conclui que não funcionou — e "não funcionou" é
        o que ela vai repetir para o fornecedor dela.
      */}
      <Card className="space-y-2 p-6">
        <h2 className="text-base font-semibold tracking-tight text-text">
          {t("Ce que cela ne change pas encore")}
        </h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-text-muted">
          <li>
            {t(
              "Le titre de l’onglet du navigateur conserve le nom du système, et non celui de votre entreprise.",
            )}
          </li>
          <li>
            {t(
              "L’écran de connexion reste toujours celui du système : lorsqu’une personne saisit son mot de passe, il est encore impossible de savoir de quelle entreprise elle dépend.",
            )}
          </li>
          {/*
            Este item dizia "os e-mails, o PDF de LGPD e o autenticador também
            usam o nome do sistema", e a Fase 4 tornou as duas primeiras partes
            falsas: `marcaDaSaida(organizationId)` resolve a organização
            primeiro, e o relatório de LGPD passou a nomear o CONTROLADOR
            (razão social) de propósito — nomear a marca ali inverteria os
            papéis num documento com peso legal.
          */}
          <li>
            {t(
              "Les e-mails envoyés par ce système (invitations d’équipe, demandes liées aux données personnelles) utilisent déjà le nom de votre entreprise.",
            )}
          </li>
          <li>
            {t(
              "Le rapport de données personnelles remis au client contient la RAISON SOCIALE de votre entreprise, et non le nom affiché ci-dessus — c’est elle qui assume la responsabilité légale des données. Vérifiez le champ « Raison sociale » dans Paramètres → Organisation.",
            )}
          </li>
          <li>
            {t(
              "L’application d’authentification à deux facteurs continue d’enregistrer le nom du système : l’inscription intervient avant qu’il soit possible de savoir de quelle entreprise dépend la personne.",
            )}
          </li>
          {/*
            Esta linha dizia "o logo continua sendo o de quem instalou o
            sistema". Deixou de ser verdade no instante em que o campo de logo
            acima passou a existir — e frase honesta que envelheceu é pior que
            frase ausente, porque quem a lê para de procurar o campo.
          */}
          <li>
            {t(
              "Le logo que vous téléversez ici apparaît dans la barre latérale pour les membres de cette entreprise. L’écran de connexion conserve le logo de l’installation du système : il est encore impossible d’y savoir de quelle entreprise dépend la personne.",
            )}
          </li>
        </ul>
      </Card>

      <div className="flex items-center justify-end gap-3">
        {erroTecnico ? (
          <span className="font-mono text-xs text-text-muted">{erroTecnico}</span>
        ) : null}
        <Button type="submit" disabled={isPending || !hexValido}>
          {isPending ? t("Enregistrement…") : t("Enregistrer")}
        </Button>
      </div>
    </form>
  );
}
