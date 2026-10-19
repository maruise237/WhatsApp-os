-- Remet la boutique de démo à zéro avant un nouveau seed-boutique.ts.
-- Usage : docker exec -i wos-local-db psql -U postgres -v org=<uuid> < scripts/local-stack/reset-boutique.sql
delete from payment_proofs     where organization_id = :'org';
delete from sales_order_items  where organization_id = :'org';
delete from sales_orders       where organization_id = :'org';
delete from agent_inbox_items  where organization_id = :'org';
delete from messages           where organization_id = :'org';
delete from conversations      where organization_id = :'org';
delete from crm_leads          where organization_id = :'org';
delete from contacts           where organization_id = :'org';
delete from products           where organization_id = :'org';
delete from channel_sessions   where organization_id = :'org';
