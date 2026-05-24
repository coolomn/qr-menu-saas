-- Baseline core tables for a fresh staging Supabase project.
-- This file is additive/idempotent: it creates missing tables and adds missing columns
-- without dropping or rewriting existing production data.

create table if not exists public.restaurants (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  logo_url text,
  theme_color text,
  primary_color text default '#2563eb',
  secondary_color text,
  slider_images text[] not null default '{}'::text[],
  welcome_bg_url text,
  instagram text,
  owner_id uuid,
  created_at timestamptz not null default now()
);

alter table public.restaurants
  add column if not exists slug text,
  add column if not exists name text,
  add column if not exists logo_url text,
  add column if not exists theme_color text,
  add column if not exists primary_color text default '#2563eb',
  add column if not exists secondary_color text,
  add column if not exists slider_images text[] not null default '{}'::text[],
  add column if not exists welcome_bg_url text,
  add column if not exists instagram text,
  add column if not exists owner_id uuid,
  add column if not exists created_at timestamptz not null default now();

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  restaurant_id uuid not null,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  name_en text,
  name_ru text,
  main_group text default 'DİĞER',
  main_group_en text,
  main_group_ru text,
  is_active boolean not null default true
);

alter table public.categories
  add column if not exists restaurant_id uuid,
  add column if not exists name text,
  add column if not exists sort_order integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists name_en text,
  add column if not exists name_ru text,
  add column if not exists main_group text default 'DİĞER',
  add column if not exists main_group_en text,
  add column if not exists main_group_ru text,
  add column if not exists is_active boolean not null default true;

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null,
  restaurant_id uuid not null,
  name text not null,
  description text default '',
  price text not null default '',
  image_url text default '',
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  name_en text,
  description_en text,
  name_ru text,
  description_ru text,
  allergens text[] not null default '{}'::text[]
);

alter table public.products
  add column if not exists category_id uuid,
  add column if not exists restaurant_id uuid,
  add column if not exists name text,
  add column if not exists description text default '',
  add column if not exists price text default '',
  add column if not exists image_url text default '',
  add column if not exists is_active boolean not null default true,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists name_en text,
  add column if not exists description_en text,
  add column if not exists name_ru text,
  add column if not exists description_ru text,
  add column if not exists allergens text[] not null default '{}'::text[];
