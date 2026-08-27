-- AI WhatsApp Sales OS — catalogue, commandes locales et preuves de paiement (0177)
--
-- Les tables `orders` et `nuvemshop_products` représentent des synchronisations
-- e-commerce externes. Ce modèle local est séparé pour porter la machine de vente
-- privée et la règle P3 : seule une action humaine approuve le paiement.

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 240),
  description text,
  price_cents bigint not null check (price_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  stock integer not null default 0 check (stock >= 0),
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id)
);

create index if not exists idx_sales_products_org_active
  on public.products (organization_id, is_active, created_at desc);

create table if not exists public.product_media (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  product_id uuid not null,
  storage_key text not null,
  mime_type text not null,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  extraction jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, storage_key),
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete cascade
);

create index if not exists idx_sales_product_media_product
  on public.product_media (organization_id, product_id, created_at desc);

create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete restrict,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  status text not null default 'en_cours'
    check (status in ('en_cours', 'en_attente_paiement', 'payée', 'a_livrer', 'livree', 'refusee', 'annulee')),
  total_cents bigint not null check (total_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  created_by_user_id uuid references auth.users(id) on delete set null,
  paid_at timestamptz,
  paid_by_user_id uuid references auth.users(id) on delete set null,
  fulfillment_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, id),
  check ((status = 'payée') = (paid_at is not null and paid_by_user_id is not null)),
  check (status <> 'payée' or paid_at is not null)
);

create index if not exists idx_sales_orders_org_status
  on public.sales_orders (organization_id, status, updated_at desc);
create index if not exists idx_sales_orders_conversation
  on public.sales_orders (organization_id, conversation_id, created_at desc);

create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  product_id uuid not null,
  product_title text not null,
  quantity integer not null check (quantity > 0),
  unit_price_cents bigint not null check (unit_price_cents >= 0),
  currency text not null default 'BRL' check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  foreign key (order_id, organization_id)
    references public.sales_orders(id, organization_id) on delete cascade,
  foreign key (product_id, organization_id)
    references public.products(id, organization_id) on delete restrict
);

create index if not exists idx_sales_order_items_order
  on public.sales_order_items (organization_id, order_id);

create table if not exists public.payment_proofs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  order_id uuid not null,
  message_id uuid references public.messages(id) on delete set null,
  storage_key text not null,
  mime_type text not null,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'approved', 'rejected')),
  amount_cents bigint check (amount_cents is null or amount_cents >= 0),
  reference text,
  operator text,
  confidence numeric(5, 4) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  extraction jsonb not null default '{}'::jsonb,
  reviewed_by_user_id uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (order_id, organization_id)
    references public.sales_orders(id, organization_id) on delete cascade,
  check ((review_status = 'pending') = (reviewed_at is null and reviewed_by_user_id is null)),
  check (review_status <> 'approved' or (reviewed_at is not null and reviewed_by_user_id is not null))
);

create index if not exists idx_payment_proofs_org_review
  on public.payment_proofs (organization_id, review_status, created_at desc);
create index if not exists idx_payment_proofs_order
  on public.payment_proofs (organization_id, order_id, created_at desc);

-- Mise à jour uniforme des timestamps, si le helper canonique existe déjà dans
-- le baseline. Les triggers sont recréés de façon idempotente.
drop trigger if exists trg_sales_products_updated_at on public.products;
create trigger trg_sales_products_updated_at
  before update on public.products
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_sales_orders_updated_at on public.sales_orders;
create trigger trg_sales_orders_updated_at
  before update on public.sales_orders
  for each row execute function public.fn_set_updated_at();

drop trigger if exists trg_payment_proofs_updated_at on public.payment_proofs;
create trigger trg_payment_proofs_updated_at
  before update on public.payment_proofs
  for each row execute function public.fn_set_updated_at();

-- RLS : lecture agent+ ; catalogue modifiable manager+ ; commandes/preuves
-- modifiables par agent+ afin que le vendeur puisse confirmer et organiser.

alter table public.products enable row level security;
drop policy if exists sales_products_select on public.products;
create policy sales_products_select on public.products for select using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);
drop policy if exists sales_products_insert on public.products;
create policy sales_products_insert on public.products for insert with check (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'manager')
);
drop policy if exists sales_products_update on public.products;
create policy sales_products_update on public.products for update using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'manager')
) with check (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'manager')
);
drop policy if exists sales_products_delete on public.products;
create policy sales_products_delete on public.products for delete using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'manager')
);

alter table public.product_media enable row level security;
drop policy if exists sales_product_media_select on public.product_media;
create policy sales_product_media_select on public.product_media for select using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);
drop policy if exists sales_product_media_write on public.product_media;
create policy sales_product_media_write on public.product_media for all using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'manager')
) with check (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'manager')
);

alter table public.sales_orders enable row level security;
drop policy if exists sales_orders_select on public.sales_orders;
create policy sales_orders_select on public.sales_orders for select using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);
drop policy if exists sales_orders_write on public.sales_orders;
create policy sales_orders_write on public.sales_orders for all using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
) with check (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);

alter table public.sales_order_items enable row level security;
drop policy if exists sales_order_items_select on public.sales_order_items;
create policy sales_order_items_select on public.sales_order_items for select using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);
drop policy if exists sales_order_items_write on public.sales_order_items;
create policy sales_order_items_write on public.sales_order_items for all using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
) with check (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);

alter table public.payment_proofs enable row level security;
drop policy if exists payment_proofs_select on public.payment_proofs;
create policy payment_proofs_select on public.payment_proofs for select using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);
drop policy if exists payment_proofs_write on public.payment_proofs;
create policy payment_proofs_write on public.payment_proofs for all using (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
) with check (
  public.fn_is_platform_admin()
  or public.fn_role_at_least(organization_id, 'agent')
);

revoke all on public.products, public.product_media, public.sales_orders,
  public.sales_order_items, public.payment_proofs from anon;

-- Approbation humaine atomique. Le reviewer est une identité vérifiée par son
-- rôle dans l’organisation ; l’agent IA ne reçoit aucune capacité équivalente.
create or replace function public.fn_approve_sales_payment(
  p_organization_id uuid,
  p_order_id uuid,
  p_proof_id uuid,
  p_reviewer_id uuid
) returns public.sales_orders
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.sales_orders%rowtype;
begin
  if auth.uid() is not null and auth.uid() is distinct from p_reviewer_id then
    raise exception 'payment_reviewer_mismatch';
  end if;

  if coalesce(public.fn_member_role_in_org(p_reviewer_id, p_organization_id), 'none')
       not in ('agent', 'manager', 'admin')
     and not public.fn_is_platform_admin() then
    raise exception 'payment_reviewer_not_authorized';
  end if;

  select * into v_order
    from public.sales_orders
   where id = p_order_id
     and organization_id = p_organization_id
   for update;

  if not found then
    raise exception 'sales_order_not_found';
  end if;

  if v_order.status <> 'en_attente_paiement' then
    raise exception 'invalid_order_transition'
      using hint = 'only an order awaiting payment can be approved';
  end if;

  if not exists (
    select 1
      from public.payment_proofs
     where id = p_proof_id
       and order_id = p_order_id
       and organization_id = p_organization_id
       and review_status = 'pending'
  ) then
    raise exception 'payment_proof_not_pending';
  end if;

  update public.payment_proofs
     set review_status = 'approved',
         reviewed_by_user_id = p_reviewer_id,
         reviewed_at = now()
   where id = p_proof_id
     and organization_id = p_organization_id;

  update public.sales_orders
     set status = 'payée',
         paid_at = now(),
         paid_by_user_id = p_reviewer_id,
         updated_at = now()
   where id = p_order_id
     and organization_id = p_organization_id
   returning * into v_order;

  return v_order;
end;
$$;

revoke all on function public.fn_approve_sales_payment(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.fn_approve_sales_payment(uuid, uuid, uuid, uuid) to authenticated, service_role;
