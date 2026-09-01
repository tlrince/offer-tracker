-- 秋招投递记录：Supabase 数据表与 RLS
-- 使用方法：在 Supabase 项目的 SQL Editor 中完整执行本文件。

create table if not exists public.applications (
  id text not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  company text not null,
  company_group text,
  position text not null,
  status text not null,
  channel text,
  apply_date date,
  interview_time timestamptz,
  link text,
  referrer text,
  referral_code text,
  location text,
  salary text,
  priority text,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists applications_user_apply_date_idx
  on public.applications (user_id, apply_date desc);

create index if not exists applications_user_status_idx
  on public.applications (user_id, status);

alter table public.applications enable row level security;

-- 重复执行脚本时先移除同名策略。
drop policy if exists "applications_select_own" on public.applications;
drop policy if exists "applications_insert_own" on public.applications;
drop policy if exists "applications_update_own" on public.applications;
drop policy if exists "applications_delete_own" on public.applications;

create policy "applications_select_own"
on public.applications for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "applications_insert_own"
on public.applications for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "applications_update_own"
on public.applications for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "applications_delete_own"
on public.applications for delete
to authenticated
using ((select auth.uid()) = user_id);

grant select, insert, update, delete on public.applications to authenticated;
revoke all on public.applications from anon;
