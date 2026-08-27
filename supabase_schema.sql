-- SHASHA MOTORS POS - SUPABASE SCHEMA
create table if not exists public.products (
 id bigint generated always as identity primary key,
 barcode text unique not null, name text not null, part_no text,
 buy numeric(12,2) not null default 0, sell numeric(12,2) not null default 0,
 stock integer not null default 0, min_stock integer not null default 0,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.sales (
 id bigint generated always as identity primary key, invoice text unique not null,
 sale_time timestamptz not null default now(), subtotal numeric(12,2) not null default 0,
 discount numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
 profit numeric(12,2) not null default 0, payment text not null default 'CASH',
 cash numeric(12,2) not null default 0, balance numeric(12,2) not null default 0, customer text
);
create table if not exists public.sale_items (
 id bigint generated always as identity primary key, sale_id bigint not null references public.sales(id) on delete cascade,
 product_id bigint not null references public.products(id), barcode text not null, name text not null,
 qty integer not null check(qty>0), unit_price numeric(12,2) not null default 0,
 buy_price numeric(12,2) not null default 0, total numeric(12,2) not null default 0, profit numeric(12,2) not null default 0
);
create table if not exists public.stock_movements (
 id bigint generated always as identity primary key, product_id bigint not null references public.products(id),
 barcode text not null, movement_type text not null check(movement_type in ('IN','OUT','ADJUSTMENT')),
 qty integer not null, note text, created_at timestamptz not null default now()
);
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;
alter table public.stock_movements enable row level security;

-- FIX: app.js stores customer phone in public.sales.
alter table public.sales
add column if not exists phone text;
