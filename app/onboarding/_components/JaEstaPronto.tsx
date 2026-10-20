import type { RetratoDaInstalacao } from "@/lib/instalacao/retrato";

/**
 * A primeira coisa que a pessoa lê no wizard: o que ela JÁ tem.
 *
 * Quem chega aqui acabou de instalar o sistema num servidor — escolheu a
 * inteligência artificial, colou a chave, subiu o WhatsApp — e era recebido por
 * um formulário em branco, como se tivesse acabado de chegar. Começar pelo que
 * já está pronto muda a pergunta de "quanto trabalho me espera?" para "o que
 * falta?".
 *
 * Cada linha é MEDIDA, nunca presumida. É o oposto do aviso que o painel de
 * provedores dá hoje ("tudo usa a chave que veio na instalação"), disparado sem
 * verificar se existe chave — a frase que tranquiliza enquanto o funcionário
 * está mudo.
 */
export function JaEstaPronto({ retrato }: { retrato: RetratoDaInstalacao }) {
  const itens: { pronto: boolean; texto: string }[] = [
    {
      pronto: true,
      texto: "Serveur en ligne et base de données installée",
    },
    {
      // Três estados, não dois: cadastrada-e-confirmada, cadastrada-e-sendo-
      // conferida, e nenhuma. A do meio existe porque a validação roda em
      // segundo plano — e dizer "falta a chave" a quem acabou de colá-la é a
      // frase que manda a pessoa cadastrar de novo o que já está lá.
      pronto: retrato.inteligencia.origemDaChave !== "nenhuma",
      texto:
        retrato.inteligencia.origemDaChave !== "nenhuma"
          ? `Intelligence souscrite : ${retrato.inteligencia.rotulo}`
          : retrato.inteligencia.chaveEmVerificacao
            ? "Clé enregistrée — vérification auprès du fournisseur d’IA"
            : "Il manque la clé de l’intelligence artificielle",
    },
    {
      pronto: retrato.whatsapp.transporteApontado,
      texto: retrato.whatsapp.transporteApontado
        ? "WhatsApp prêt à connecter votre numéro"
        : "Le WhatsApp de cette installation n’a pas encore démarré",
    },
    {
      pronto: Boolean(retrato.funil),
      texto: retrato.funil
        ? `Tableau de vente créé : ${retrato.funil.nome}`
        : "Aucun tableau de vente pour le moment",
    },
  ];

  const faltando = itens.filter((i) => !i.pronto).length;

  return (
    <section
      aria-labelledby="ja-pronto"
      className="rounded-lg border bg-background p-5"
    >
      <h3 id="ja-pronto" className="text-sm font-medium">
        Vous avez déjà installé le système. Voici ce qui est déjà en place :
      </h3>
      <ul className="mt-3 space-y-1.5 text-sm">
        {itens.map((it) => (
          <li key={it.texto} className="flex items-start gap-2">
            <span
              aria-hidden
              className={
                "mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full " +
                (it.pronto ? "bg-emerald-500" : "bg-amber-500")
              }
            />
            <span className={it.pronto ? "" : "text-muted-foreground"}>{it.texto}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-muted-foreground">
        {faltando === 0
          ? "Il reste à configurer qui va répondre à votre place."
          : "Ce qui manque, nous le réglons dans les étapes suivantes."}
      </p>
    </section>
  );
}
