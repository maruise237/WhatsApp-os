/**
 * Regex + heuristics used by the handoff orchestrator (EPIC-06 wave 3).
 *
 * G1 — pedido humano explícito (PT-BR + français).
 * G4 — menção a termos jurídicos / regulatórios.
 * UNCERTAINTY — frases que sinalizam que o bot não tem confiança na resposta.
 *
 * Estes são heurísticos puros (regex / string matching). Mudanças aqui
 * impactam diretamente a taxa de handoff — toque com testes.
 */

export const G1_REGEX =
  /\b(quero|preciso|posso)\s+(falar|conversar|atendimento|atendente|humano|pessoa|gente|alguem|alguém|operador|gerente)\b|\b(humano|atendente|operador)\s+por\s+favor\b|\bsai\s+do\s+bot\b|\bnão\s+(quero|gosto)\s+(de\s+)?(robô|bot|automatic\w*)\b|\b(parler|discuter)\s+(a|à|avec)\s+(une?\s+)?(vraie?\s+)?(conseiller|conseill[eè]re|humain|personne|agent|responsable|op[ée]rateur|op[ée]ratrice|quelqu['’]un)\b|\b(un\s+)?(humain|conseiller|agent)\s+(svp|s['’]il\s+(vous|te)\s+pla[iî]t)\b|\bpassez[\s-]moi\s+(une?\s+)?(conseiller|conseill[eè]re|humain|responsable|personne|agent)\b|\bje\s+ne\s+veux\s+pas\s+(parler\s+)?((à|a|avec)\s+)?(un\s+)?(robot|bot)\b/i;

export const G4_LEGAL_REGEX =
  /\b(procon|advogad\w*|processar|processo\s+judicial|justiça|juiz\w*|reclame\s*aqui|denuncia\w*|denúncia\w*|acionar\s+a\s+justiça|órgão\s+regulador|defensoria|ministério\s+público|avocat\w*|porter\s+plainte|plainte|tribunal|tribunaux|poursuites?\s+judiciaires?|poursuivre\s+en\s+justice|en\s+justice|huissier|mise\s+en\s+demeure|association\s+de\s+(défense\s+des\s+)?consommateurs)\b/i;

export const UNCERTAINTY_MARKERS: readonly string[] = [
  "não tenho certeza",
  "não sei",
  "não posso confirmar",
  "não tenho essa informação",
  "preciso verificar",
  "talvez",
  "acho que",
  // français
  "je ne suis pas sûr",
  "je ne suis pas sure",
  "je ne suis pas sûre",
  "je ne sais pas",
  "je ne peux pas confirmer",
  "je n'ai pas cette information",
  "je n’ai pas cette information",
  "je dois vérifier",
  "peut-être",
  "je pense que",
];

export function containsUncertaintyMarkers(text: string): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  for (const m of UNCERTAINTY_MARKERS) {
    if (lower.includes(m)) return true;
  }
  return false;
}
