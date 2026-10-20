/**
 * Confere e regrava o selo das traduções.
 *
 * Uso:
 *   `pnpm exec tsx scripts/selar-traducao.ts`           — só confere; sai ≠0 se algo defasou
 *   `pnpm exec tsx scripts/selar-traducao.ts --todas`   — regrava o selo de todas
 *
 * ⚠️ `--todas` NÃO traduz nada: ele apenas afirma que a tradução já acompanha o
 * original. Rodá-lo sem ter traduzido é o único jeito conhecido de o gate
 * morrer — o selo passa a dizer "em dia" sobre um texto que envelheceu. Por
 * isso o modo de conferência é o padrão, e o de escrita precisa ser pedido.
 *
 * O manifesto e o hash moram em `selar-traducao.selo.ts`: este arquivo lê o
 * disco e chama `process.exit`, e importá-lo de um teste rodaria a escrita.
 * Mesmo motivo de `inventario-de-telas.leitura.ts` e `lint-channels.pattern.ts`.
 */
import { readFileSync, writeFileSync } from "node:fs";

import {
  COMANDO_DE_RESELO,
  TRADUCOES,
  conferirVacuidade,
  hashDoOriginal,
  lerSelo,
  linhaDoSelo,
} from "./selar-traducao.selo";

const escrever = process.argv.includes("--todas");
const desconhecidos = process.argv.slice(2).filter((a) => a !== "--todas");
if (desconhecidos.length > 0) {
  console.error(`Argument inconnu : ${desconhecidos.join(", ")}. Utilisez --todas ou rien.`);
  process.exit(2);
}

try {
  conferirVacuidade(TRADUCOES);
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
}

const defasadas: string[] = [];

for (const par of TRADUCOES) {
  const esperado = hashDoOriginal(readFileSync(par.original, "utf8"));
  const conteudo = readFileSync(par.traducao, "utf8");
  const selo = lerSelo(conteudo);

  if (selo && selo.original === par.original && selo.hash === esperado) {
    console.info(`  à jour   ${par.traducao} (${par.original}@${esperado})`);
    continue;
  }

  if (!escrever) {
    defasadas.push(
      selo === null
        ? `${par.traducao} — pas de sceau en ligne 1`
        : `${par.traducao} — le sceau dit ${selo.original}@${selo.hash}, l'original est à ${par.original}@${esperado}`,
    );
    continue;
  }

  // Sem selo ainda: a linha nasce no topo. Com selo: a linha 1 é substituída —
  // nunca acumula duas, que passariam pela regex e mentiriam sobre qual vale.
  const corpo = selo === null ? `${linhaDoSelo(par.original, esperado)}\n\n${conteudo}` : conteudo;
  const linhas = corpo.split("\n");
  linhas[0] = linhaDoSelo(par.original, esperado);
  writeFileSync(par.traducao, linhas.join("\n"));
  console.info(`  scellée  ${par.traducao} (${par.original}@${esperado})`);
}

if (defasadas.length > 0) {
  console.error(
    `\nTraduction en retard :\n    ${defasadas.join("\n    ")}\n\n` +
      `  Traduisez le changement de l'original puis lancez : ${COMANDO_DE_RESELO}`,
  );
  process.exit(1);
}

console.info("\nselar-traducao: ok");
