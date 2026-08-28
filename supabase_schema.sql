-- SHASHA MOTORS POS — FIXED SUPABASE SETUP
-- Run this whole file in Supabase SQL Editor.
-- Existing products/sales are NOT deleted.

create table if not exists public.products(
 id bigint generated always as identity primary key,
 barcode text unique not null,
 name text not null,
 part_no text,
 buy numeric(12,2) not null default 0,
 sell numeric(12,2) not null default 0,
 stock integer not null default 0,
 min_stock integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);

create table if not exists public.sales(
 id bigint generated always as identity primary key,
 invoice text unique not null,
 sale_time timestamptz not null default now(),
 subtotal numeric(12,2) not null default 0,
 discount numeric(12,2) not null default 0,
 total numeric(12,2) not null default 0,
 profit numeric(12,2) not null default 0,
 payment text not null default 'CASH',
 cash numeric(12,2) not null default 0,
 balance numeric(12,2) not null default 0,
 customer text,
 phone text
);

create table if not exists public.sale_items(
 id bigint generated always as identity primary key,
 sale_id bigint not null references public.sales(id) on delete cascade,
 product_id bigint not null references public.products(id),
 barcode text not null,
 name text not null,
 qty integer not null check(qty>0),
 unit_price numeric(12,2) not null default 0,
 buy_price numeric(12,2) not null default 0,
 total numeric(12,2) not null default 0,
 profit numeric(12,2) not null default 0
);

create table if not exists public.stock_movements(
 id bigint generated always as identity primary key,
 product_id bigint not null references public.products(id),
 barcode text not null,
 movement_type text not null check(movement_type in ('IN','OUT','ADJUSTMENT')),
 qty integer not null,
 note text,
 created_at timestamptz not null default now()
);

alter table public.sales add column if not exists phone text;

alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

drop policy if exists "POS products select" on public.products;
drop policy if exists "POS products insert" on public.products;
drop policy if exists "POS products update" on public.products;
drop policy if exists "POS products delete" on public.products;
drop policy if exists "POS sales select" on public.sales;
drop policy if exists "POS sales insert" on public.sales;
drop policy if exists "POS sale_items select" on public.sale_items;
drop policy if exists "POS sale_items insert" on public.sale_items;
drop policy if exists "POS stock_movements select" on public.stock_movements;
drop policy if exists "POS stock_movements insert" on public.stock_movements;

create policy "POS products select" on public.products for select to anon using(true);
create policy "POS products insert" on public.products for insert to anon with check(true);
create policy "POS products update" on public.products for update to anon using(true) with check(true);
create policy "POS products delete" on public.products for delete to anon using(true);

create policy "POS sales select" on public.sales for select to anon using(true);
create policy "POS sales insert" on public.sales for insert to anon with check(true);

create policy "POS sale_items select" on public.sale_items for select to anon using(true);
create policy "POS sale_items insert" on public.sale_items for insert to anon with check(true);

create policy "POS stock_movements select" on public.stock_movements for select to anon using(true);
create policy "POS stock_movements insert" on public.stock_movements for insert to anon with check(true);

grant usage on schema public to anon;
grant select,insert,update,delete on public.products to anon;
grant select,insert on public.sales to anon;
grant select,insert on public.sale_items to anon;
grant select,insert on public.stock_movements to anon;

-- Atomic sale transaction used by the fixed app.
create or replace function public.pos_complete_sale(p_sale jsonb)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sale_id bigint;
  v_item jsonb;
  v_product_id bigint;
  v_old_stock integer;
  v_qty integer;
  v_barcode text;
  v_invoice text;
begin
  v_invoice := p_sale->>'invoice';

  select id into v_sale_id from public.sales where invoice=v_invoice;
  if v_sale_id is not null then
    return v_sale_id;
  end if;

  insert into public.sales(invoice,sale_time,subtotal,discount,total,profit,payment,cash,balance,customer,phone)
  values(
    v_invoice,
    coalesce((p_sale->>'sale_time')::timestamptz,now()),
    coalesce((p_sale->>'subtotal')::numeric,0),
    coalesce((p_sale->>'discount')::numeric,0),
    coalesce((p_sale->>'total')::numeric,0),
    coalesce((p_sale->>'profit')::numeric,0),
    coalesce(p_sale->>'payment','CASH'),
    coalesce((p_sale->>'cash')::numeric,0),
    coalesce((p_sale->>'balance')::numeric,0),
    nullif(p_sale->>'customer',''),
    nullif(p_sale->>'phone','')
  ) returning id into v_sale_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_sale->'items','[]'::jsonb))
  loop
    v_barcode := v_item->>'barcode';
    v_qty := greatest(1,coalesce((v_item->>'qty')::integer,1));

    select id,stock into v_product_id,v_old_stock
    from public.products
    where barcode=v_barcode
    for update;

    if v_product_id is null then
      raise exception 'Product not found: %',v_barcode;
    end if;

    if v_old_stock < v_qty then
      raise exception 'Not enough cloud stock for % (available %, requested %)',v_barcode,v_old_stock,v_qty;
    end if;

    insert into public.sale_items(sale_id,product_id,barcode,name,qty,unit_price,buy_price,total,profit)
    values(
      v_sale_id,v_product_id,v_barcode,
      coalesce(v_item->>'name',''),
      v_qty,
      coalesce((v_item->>'unit_price')::numeric,0),
      coalesce((v_item->>'buy_price')::numeric,0),
      coalesce((v_item->>'total')::numeric,0),
      coalesce((v_item->>'profit')::numeric,0)
    );

    update public.products
    set stock=stock-v_qty,updated_at=now()
    where id=v_product_id;

    insert into public.stock_movements(product_id,barcode,movement_type,qty,note)
    values(v_product_id,v_barcode,'OUT',v_qty,'Sale '||v_invoice);
  end loop;

  return v_sale_id;
end;
$$;

revoke all on function public.pos_complete_sale(jsonb) from public;
grant execute on function public.pos_complete_sale(jsonb) to anon;
