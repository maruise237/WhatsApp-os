-- AI WhatsApp Sales OS — création atomique de commande (0178)
--
-- Le total et la disponibilité ne viennent jamais du client. La fonction verrouille
-- chaque produit, réserve le stock et écrit les lignes-snapshot dans une transaction.

alter table public.sales_orders
  add column if not exists idempotency_key text;

create unique index if not exists idx_sales_orders_org_idempotency
  on public.sales_orders (organization_id, idempotency_key)
  where idempotency_key is not null;

create or replace function public.fn_create_sales_order(
  p_organization_id uuid,
  p_conversation_id uuid,
  p_contact_id uuid,
  p_items jsonb,
  p_currency text,
  p_created_by uuid,
  p_idempotency_key text default null
) returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders%rowtype;
  v_product public.products%rowtype;
  v_item jsonb;
  v_product_id uuid;
  v_quantity integer;
  v_total bigint := 0;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_created_by then
    raise exception 'sales_order_creator_mismatch';
  end if;

  if p_idempotency_key is not null then
    select * into v_order
      from public.sales_orders
     where organization_id = p_organization_id
       and idempotency_key = p_idempotency_key
     for update;
    if found then
      return v_order;
    end if;
  end if;

  if not exists (
    select 1
      from public.conversations c
     where c.id = p_conversation_id
       and c.organization_id = p_organization_id
       and c.contact_id = p_contact_id
  ) then
    raise exception 'forbidden_cross_tenant'
      using hint = 'conversation and contact must belong to the same organization';
  end if;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1 then
    raise exception 'invalid_order_items';
  end if;

  insert into public.sales_orders
    (organization_id, conversation_id, contact_id, status, total_cents, currency, created_by_user_id, idempotency_key)
  values
    (p_organization_id, p_conversation_id, p_contact_id, 'en_cours', 0, p_currency, p_created_by, p_idempotency_key)
  returning * into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    v_product_id := (v_item ->> 'product_id')::uuid;
    v_quantity := (v_item ->> 'quantity')::integer;

    if v_quantity is null or v_quantity <= 0 then
      raise exception 'invalid_order_quantity';
    end if;

    select * into v_product
      from public.products
     where id = v_product_id
       and organization_id = p_organization_id
       and is_active = true
     for update;

    if not found then
      raise exception 'product_not_found';
    end if;
    if v_product.currency <> p_currency then
      raise exception 'currency_mismatch';
    end if;
    if v_product.stock < v_quantity then
      raise exception 'out_of_stock';
    end if;

    update public.products
       set stock = stock - v_quantity,
           updated_at = now()
     where id = v_product.id
       and organization_id = p_organization_id;

    insert into public.sales_order_items
      (organization_id, order_id, product_id, product_title, quantity, unit_price_cents, currency)
    values
      (p_organization_id, v_order.id, v_product.id, v_product.title, v_quantity, v_product.price_cents, v_product.currency);

    v_total := v_total + (v_product.price_cents * v_quantity);
  end loop;

  update public.sales_orders
     set total_cents = v_total,
         updated_at = now()
   where id = v_order.id
  returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.fn_create_sales_order(uuid, uuid, uuid, jsonb, text, uuid, text) from public, anon;
grant execute on function public.fn_create_sales_order(uuid, uuid, uuid, jsonb, text, uuid, text) to authenticated, service_role;
