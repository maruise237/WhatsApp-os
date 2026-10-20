-- Mots-clés de passage à un humain en français (0183)
--
-- Le défaut de `ai_agent_versions.handoff_keywords` était portugais
-- ('falar com humano', 'atendente', 'pessoa real'). Pour une cliente
-- francophone, la sentinelle de relais (lib/ai/runtime/agent.ts) ne se
-- déclenchait donc jamais par mot-clé. Constat par l'écran (pile locale,
-- 2026-10-19) : formulaire « Nouvel agent » prérempli en portugais.
--
-- Seul le DÉFAUT change : les versions existantes gardent les mots que leur
-- auteur a choisis (une version publiée ne se réécrit pas en silence).
alter table public.ai_agent_versions
  alter column handoff_keywords
  set default array['parler à un humain', 'conseiller', 'vraie personne']::text[];
