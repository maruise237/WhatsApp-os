/**
 * Detector determinístico de PROMESSA-DE-HUMANO (spec 15 §10.2; Wave 4) — o
 * complemento anti-alucinação do guardrail de casos: dispara quando a candidata
 * a envio promete envolver a retaguarda humana (encaminhar/acionar/consultar a
 * equipe/setor/responsável, ou afirmar que "o time vai resolver/retornar"). É o
 * gatilho do `casePromiseGate` (before-send): se a IA prometeu humano e NÃO há
 * caso aberto, a mensagem é vetada até um caso existir (a invariante sagrada).
 *
 * Sem LLM (mesma disciplina de guardrails/promise/engine.ts): regex PT-BR
 * CONSERVADORA, calibrada para baixo falso-positivo. As duas armadilhas
 * (spec §10.2, congeladas em tests/invariants/case-promise-detector.test.ts):
 *   - "verificar seu pedido NO SISTEMA" ≠ acionar humano → NÃO dispara (o
 *     verbo de consulta exige um ALVO humano via "com <equipe/setor/...>");
 *   - "nossa equipe está sempre à disposição" é institucional, não promessa de
 *     ação → NÃO dispara (o alvo humano sozinho não basta; exige verbo de
 *     encaminhamento/consulta, OU "<time> vai <resolver/retornar>").
 * Trade-off documentado (spec §10.2): na dúvida entre falso-negativo em promessa
 * CLARA de humano e falso-positivo, o detector prioriza pegar a promessa clara —
 * o fail-safe do gate (auto-abre caso na 2ª insistência) cobre o excesso, mas
 * NUNCA deixa a promessa passar sem caso.
 */

/** Alvo humano/retaguarda (já sem acento — o texto é normalizado antes de casar). */
const TARGET =
  "(?:equipe|time|setor|responsavel|responsaveis|pessoal|especialista|especialistas|" +
  "atendente|atendentes|gerente|supervisor|departamento)";

/**
 * Lacuna curta que NÃO cruza fim de frase (sem .!?\n): impede casar um verbo de
 * uma oração com um alvo humano de outra (evita falso-positivo entre sentenças).
 */
const gap = (n: number): string => `[^.!?\\n]{0,${n}}?`;

/**
 * Alvo humano em FRANCÊS (produto francófono). "personne" sozinha NÃO entra —
 * "personne ne vous a oublié" é negação, não promessa —, só "une (vraie) personne".
 */
const TARGET_FR =
  "(?:equipe|equipes|service|conseiller|conseillers|conseillere|conseilleres|responsable|responsables|" +
  "collegue|collegues|specialiste|specialistes|agent|agents|humain|humains|superviseur|manager|" +
  "gerant|gerante|technicien|techniciens|departement|une\\s+(?:vraie\\s+)?personne)";

/** Pronome objeto francês opcional antes do verbo de ação ("vous", "te", "t'"). */
const OBJ_FR = "(?:\\b(?:vous|te|t['’]|nous)\\s*)?";

const PATTERNS: readonly RegExp[] = [
  // (1a) encaminhar/passar/acionar/... → alvo humano: "encaminhar pro setor", "acionar o responsavel".
  new RegExp(`\\b(?:encaminh|repass|transfer|acion|escal|direcion|pass|cham)\\w*${gap(20)}\\b${TARGET}\\b`),
  // (1a-bis) mesmo verbo de encaminhamento, mas o ALVO é retomado por PRONOME (eles/elas)
  // em vez do substantivo — achado na prova E2E da Wave 7 real: "já passo o pedido pra
  // eles resolverem" escapava (1a) porque "eles" não é TARGET). Exige um verbo de
  // RESOLUÇÃO depois do pronome (não só "passar pra eles" — precisa prometer AÇÃO deles).
  new RegExp(
    `\\b(?:encaminh|repass|transfer|acion|escal|direcion|pass|cham)\\w*${gap(30)}` +
      `\\b(?:pra|para|pro|com)\\b${gap(8)}\\b(?:eles|elas)\\b${gap(25)}` +
      `\\b(?:resolv|retorn|respond|liber|analis|verific|cuid|assum|atend|aprov|confirm|contat|ajud)\\w*`,
  ),
  // (1b) verbo de CONSULTA + "com" + alvo humano: "verificar com a equipe", "falar com o pessoal".
  //      Exige "com <humano>": "verificar seu pedido no sistema" (sem "com equipe") NÃO casa.
  new RegExp(`\\b(?:verific|fal|confer|confirm|consult|alinh|valid|chec)\\w*${gap(15)}\\bcom\\b${gap(15)}\\b${TARGET}\\b`),
  // (1c) pedir/solicitar pra/ao alvo humano: "vou pedir pra equipe liberar".
  new RegExp(`\\b(?:ped|solicit)\\w*${gap(12)}\\b(?:pra|para|pro|ao|aos|a|as|com)\\b${gap(10)}\\b${TARGET}\\b`),
  // (2) "<alvo humano> vai/pode <resolver/retornar/...>": "nosso time vai resolver", "um responsavel vai te retornar".
  //     "nossa equipe ESTA a disposicao" NÃO casa ("esta" fora do grupo vai/vao/pode).
  new RegExp(
    `\\b${TARGET}\\b${gap(20)}\\b(?:vai|vao|ira|irao|pode|podem|poderao)\\b${gap(10)}` +
      `(?:\\b(?:te|lhe|se|nos)\\b\\s*)?(?:resolv|retorn|respond|liber|analis|verific|cuid|assum|atend|entr|aprov|confirm|contat|ajud)\\w*`,
  ),
  // (2b) "quem resolve/cuida ... e o nosso time": "isso quem resolve e o nosso time".
  new RegExp(
    `\\bquem\\b${gap(15)}\\b(?:resolv|cuid|respond|decid|aprov|liber|atend)\\w*${gap(20)}` +
      `(?:\\b(?:nosso|nossa|nossos|nossas|o|a|os|as)\\b\\s*)?${TARGET}\\b`,
  ),
  // (3) deferir a TERCEIROS via subjuntivo 3ª pessoa do plural: "assim que liberarem eu te aviso".
  new RegExp(
    `\\b(?:assim que|assim q|quando|depois que|logo que|apos)\\b${gap(12)}` +
      `\\b(?:liber|aprov|autoriz|respond|retorn|verific|analis|resolv|confirm)(?:ar|er)em\\b`,
  ),
  // ── français ─────────────────────────────────────────────────────────────
  // Mesma disciplina das regras portuguesas: o alvo humano sozinho NÃO basta
  // ("notre équipe est toujours à votre disposition" é institucional).
  //
  // (FR1a) transmettre/transférer/escalader → alvo humano: "je transmets votre demande au service client".
  new RegExp(`\\b(?:transfer|transmet|transmis|redirig|escalad|remont)\\w*${gap(25)}\\b${TARGET_FR}\\b`),
  // (FR1a-bis) "passer" é genérico ("je vous passe le lien"): só vale com o alvo logo depois.
  //            "je vais vous passer un conseiller", "je vous passe à l'équipe".
  new RegExp(
    `\\bpass\\w*\\s+(?:a\\s+|au\\s+|aux\\s+)?(?:un|une|le|la|l['’]|les|notre|nos|votre|mon|ma|mes)\\s*${TARGET_FR}\\b`,
  ),
  // (FR1a-ter) "je vous mets en relation avec …" já é, por definição, entregar a alguém.
  /\b(?:mets|met|mettre|mettons|mettrai)\s+en\s+(?:relation|contact)\s+avec\b/,
  // (FR1b) verbo de CONSULTA + "avec/auprès de" + alvo: "je vais vérifier avec l'équipe".
  //        "vérifier votre commande dans le système" (sem alvo humano) NÃO casa.
  new RegExp(
    `\\b(?:verifi|voi|voir|confirm|consult|valid|renseign|parl|demand)\\w*${gap(15)}\\b(?:avec|aupres)\\b${gap(15)}\\b${TARGET_FR}\\b`,
  ),
  // (FR1c) demander/solliciter à l'alvo: "je vais demander à mon responsable".
  new RegExp(`\\b(?:demand|sollicit)\\w*${gap(12)}\\b(?:a|au|aux)\\b${gap(10)}\\b${TARGET_FR}\\b`),
  // (FR2) "<alvo> va/vont/pourra <répondre/rappeler/…>": "un humain va vous répondre".
  new RegExp(
    `\\b${TARGET_FR}\\b${gap(20)}\\b(?:va|vont|pourra|pourront|devrait|devraient)\\b${gap(10)}${OBJ_FR}` +
      `(?:repond|rappel|recontact|contact|resoud|regl|trait|verifi|analys|valid|confirm|aid|occup|prendr|reven|ecrir)\\w*`,
  ),
  // (FR2b) futuro simples: "un conseiller vous rappellera", "l'équipe prendra le relais".
  new RegExp(
    `\\b${TARGET_FR}\\b${gap(20)}${OBJ_FR}` +
      `\\b(?:repondra|repondront|rappellera|rappelleront|recontactera|recontacteront|contactera|contacteront|` +
      `reviendra|reviendront|ecrira|ecriront|prendra\\s+le\\s+relais|prendront\\s+le\\s+relais)\\b`,
  ),
  // (FR3) deferir a TERCEIROS: "dès qu'ils auront validé, je vous préviens".
  new RegExp(
    `\\b(?:des\\s+qu|lorsqu|quand|apres\\s+qu|une\\s+fois\\s+qu)['’e]?\\s*${gap(6)}\\b(?:ils|elles)\\s+(?:auront|ont)\\s+` +
      `(?:valide|verifie|confirme|repondu|traite|regle|autorise|approuve)\\b`,
  ),
];

/** Minúsculas + remove diacríticos (NFD) — casa acento/caixa uniformemente. */
function normalize(body: string): string {
  return body
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * True se a candidata promete envolver um humano/retaguarda. Determinístico,
 * conservador (spec §10.2). Vazio/whitespace = false.
 */
export function detectHumanPromise(body: string): boolean {
  if (body.trim() === "") return false;
  const text = normalize(body);
  return PATTERNS.some((re) => re.test(text));
}
