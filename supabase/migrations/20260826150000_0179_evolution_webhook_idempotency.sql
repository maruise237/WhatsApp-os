-- AI WhatsApp Sales OS — journal Evolution Go et idempotence webhook (0179)

alter table public.webhook_events_log
  drop constraint if exists webhook_events_log_provider_check;

alter table public.webhook_events_log
  add constraint webhook_events_log_provider_check
  check (provider = any (array['waha'::text, 'nuvemshop'::text, 'generic'::text, 'evolution_go'::text]));

create unique index if not exists webhook_events_log_evolution_external_unique
  on public.webhook_events_log (provider, external_id)
  where provider = 'evolution_go'
    and external_id is not null;
