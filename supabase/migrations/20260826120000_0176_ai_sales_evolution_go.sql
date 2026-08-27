-- AI WhatsApp Sales OS — Evolution Go comme provider de canal (migration 0176)
--
-- `channel_sessions` est déjà le registre tenant-scoped des numéros connectés.
-- On l'étend plutôt que de créer une table miroir. Les lignes WAHA existantes
-- restent valides et l'adaptateur historique peut continuer à fonctionner pendant
-- la migration progressive.

alter table public.channel_sessions
  add column if not exists evolution_instance_name text;

comment on column public.channel_sessions.evolution_instance_name is
  'Nom d’instance Evolution Go, unique parmi les sessions actives. Source de vérité du mapping instance → organization_id pour whatsapp-gateway.';

-- Les anciennes lignes n'ont pas de valeur Evolution Go et ne violent donc pas
-- le nouveau vocabulaire. La contrainte est reconstruite avec la liste complète.
alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_check
  check (provider = any (array['waha'::text, 'meta_cloud'::text, 'zernio'::text, 'evolution_go'::text]));

alter table public.channel_sessions
  drop constraint if exists channel_sessions_provider_ref_check;

alter table public.channel_sessions
  add constraint channel_sessions_provider_ref_check check (
    (provider = 'waha'        and waha_session_name is not null) or
    (provider = 'meta_cloud'  and meta_phone_number_id is not null) or
    (provider = 'zernio'      and zernio_account_id is not null) or
    (provider = 'evolution_go' and evolution_instance_name is not null)
  );

-- Mise à jour auto-curative pour un clone qui aurait déjà reçu des valeurs
-- partielles. On conserve toutes les lignes et on rend les doublons explicites
-- afin que l'index ne puisse pas échouer silencieusement pendant update.sh.
with actifs as (
  select id,
         row_number() over (
           partition by evolution_instance_name
           order by created_at desc nulls last, id desc
         ) as position
    from public.channel_sessions
   where archived_at is null
     and provider = 'evolution_go'
     and evolution_instance_name is not null
)
update public.channel_sessions s
   set evolution_instance_name = s.evolution_instance_name || '-conflit-' || s.id::text
  from actifs a
 where a.id = s.id
   and a.position > 1;

create unique index if not exists channel_sessions_evolution_instance_name_active_unique
  on public.channel_sessions (evolution_instance_name)
  where archived_at is null
    and provider = 'evolution_go'
    and evolution_instance_name is not null;
