-- Base de connaissances sans embeddings : recherche plein texte en français (0184)
--
-- L'IA est fournie par la plateforme (DeepSeek), et DeepSeek n'a pas d'API
-- d'embeddings. Avant cette migration, sans clé OpenAI, l'indexeur sautait
-- tout (`openai_key_missing`) : la vendeuse ajoutait sa FAQ et l'assistant ne
-- la voyait jamais, sans aucun message.
--
-- Ce qui change :
-- 1. `ai_chunks.embedding` devient facultatif : un extrait existe sans vecteur.
-- 2. `ai_chunks.contenu_recherche` : tsvector français calculé par la base,
--    accents retirés (les clients écrivent « delai », « reduction »), indexé GIN.
-- 3. `rechercher_chunks_texte` : la recherche que le tour de l'assistant appelle.
--    OU entre les mots (une question de client a des mots en trop, un ET ne
--    trouverait rien), classement ts_rank_cd normalisé dans [0,1), et au plus
--    8 extraits quoi que demande l'appelant — le contexte envoyé au modèle ne
--    peut pas gonfler par un paramètre.
-- 4. Le modèle de la plateforme entre au catalogue `ai_models` avec son prix,
--    pour que le coût des essais (`ai_agent_runs`) ne soit pas compté à zéro.
--
-- Idempotente ; aucune donnée existante n'est modifiée (la colonne générée se
-- calcule pour les lignes déjà là).

alter table public.ai_chunks alter column embedding drop not null;

alter table public.ai_chunks
  add column if not exists contenu_recherche tsvector
  generated always as (
    to_tsvector(
      'french'::regconfig,
      translate(lower(content), 'àâäáãéèêëíîïìóôöõòúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
    )
  ) stored;

create index if not exists ai_chunks_contenu_recherche_idx
  on public.ai_chunks using gin (contenu_recherche);

create or replace function public.rechercher_chunks_texte(
  p_organization_id uuid,
  p_kb_version_id uuid,
  p_requete text,
  p_k integer default 4
) returns table (
  chunk_id uuid,
  knowledge_source_id uuid,
  content text,
  similarity real,
  metadata jsonb
)
language sql stable security definer
set search_path = public, pg_temp
as $$
  with q as (
    -- Les racines de la question, en OU, sans mots vides ni racines d'une ou
    -- deux lettres (« à » sans accent devient « a », et « a » est partout).
    select nullif(
      array_to_string(array(
        select quote_literal(l)
          from unnest(tsvector_to_array(to_tsvector(
                 'french'::regconfig,
                 translate(lower(coalesce(p_requete, '')), 'àâäáãéèêëíîïìóôöõòúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn')
               ))) as l
         where length(l) >= 3
      ), ' | '),
      ''
    )::tsquery as tsq
  )
  select c.id,
         c.knowledge_source_id,
         c.content,
         ts_rank_cd(c.contenu_recherche, q.tsq, 32)::real as similarity,
         c.metadata
    from public.ai_chunks c, q
   where c.organization_id = p_organization_id
     and c.kb_version_id = p_kb_version_id
     and q.tsq is not null
     and c.contenu_recherche @@ q.tsq
   order by similarity desc, c.position asc
   limit least(greatest(coalesce(p_k, 4), 0), 8);
$$;

comment on function public.rechercher_chunks_texte(uuid, uuid, text, integer) is
  'Recherche plein texte (français, sans accents) dans ai_chunks. SECURITY DEFINER + filtre org programmatique : l''appelant valide que p_organization_id est le tenant authentifié. Au plus 8 extraits.';

revoke execute on function public.rechercher_chunks_texte(uuid, uuid, text, integer) from public, anon;
grant  execute on function public.rechercher_chunks_texte(uuid, uuid, text, integer) to authenticated, service_role;

insert into public.ai_models
  (provider, model_id, display_name, context_window,
   input_price_per_million_cents, output_price_per_million_cents,
   supports_tools, is_default_for_provider)
values
  ('deepseek', 'deepseek-flash', 'Assistant', 1000000, 30, 120, true, true)
on conflict (provider, model_id) do update
  set input_price_per_million_cents  = excluded.input_price_per_million_cents,
      output_price_per_million_cents = excluded.output_price_per_million_cents,
      supports_tools                 = excluded.supports_tools;
