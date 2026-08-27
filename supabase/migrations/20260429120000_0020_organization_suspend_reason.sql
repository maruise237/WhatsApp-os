-- EPIC-11 wave 8 (S-11.08): organizations.suspended_reason + suspended_by
-- Adds the two columns required for the suspend/reactivate tenant API.
-- suspended_by references neon_auth.user so we can attribute the action.

alter table public.organizations
  add column if not exists suspended_reason text,
  add column if not exists suspended_by uuid references neon_auth.user(id);
