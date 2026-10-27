-- PRASHANT LATTA BOOKS — Supabase setup
-- Run this in Supabase SQL Editor AFTER creating a Supabase project.
-- Never put the service_role key in the browser.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null default 'Prashant Latta',
  category text not null default 'General',
  language text not null default 'English',
  description text not null default '',
  cover_url text,
  content text not null default '',
  published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_library_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_library_admin() from public;
grant execute on function public.is_library_admin() to anon, authenticated;

alter table public.admin_users enable row level security;
alter table public.books enable row level security;

-- No public read access to the admin list.
drop policy if exists "Admins can read own admin status" on public.admin_users;
create policy "Admins can read own admin status" on public.admin_users
for select to authenticated
using (user_id = (select auth.uid()));

-- Published books can be read by anyone. Drafts are private.
drop policy if exists "Anyone can read published books" on public.books;
create policy "Anyone can read published books" on public.books
for select to anon, authenticated
using (published = true or public.is_library_admin());

-- Only explicitly enrolled admins can insert, update, or delete books.
drop policy if exists "Admins can insert books" on public.books;
create policy "Admins can insert books" on public.books
for insert to authenticated
with check (public.is_library_admin());

drop policy if exists "Admins can update books" on public.books;
create policy "Admins can update books" on public.books
for update to authenticated
using (public.is_library_admin())
with check (public.is_library_admin());

drop policy if exists "Admins can delete books" on public.books;
create policy "Admins can delete books" on public.books
for delete to authenticated
using (public.is_library_admin());

grant select on public.books to anon, authenticated;
grant insert, update, delete on public.books to authenticated;
grant select on public.admin_users to authenticated;

-- FIRST ADMIN SETUP:
-- 1) In Supabase Dashboard > Authentication > Users, create the owner user
--    using your own email and a strong password.
-- 2) Copy that user's UUID.
-- 3) Replace YOUR_AUTH_USER_UUID below and run the INSERT separately.
-- Never expose or share the password.
-- insert into public.admin_users (user_id) values ('YOUR_AUTH_USER_UUID');
