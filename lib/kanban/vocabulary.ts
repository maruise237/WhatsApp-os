import type { PipelineVocabulary } from "./types";

const DEFAULTS: Required<PipelineVocabulary> = {
  lead: "Client",
  deal: "Affaire",
  won: "Gagné",
  lost: "Perdu",
};

export function resolveVocabulary(
  v: PipelineVocabulary | null | undefined,
): Required<PipelineVocabulary> {
  return { ...DEFAULTS, ...(v ?? {}) };
}
