create table public.app_users (
 id uuid primary key default gen_random_uuid(), email text not null unique,
 name text not null, password_hash text not null,
 role text not null default 'gestor' check (role in ('admin','gestor')),
 active boolean not null default true, must_change_password boolean not null default true,
 created_at timestamptz not null default now()
);
alter table public.app_users enable row level security;
revoke all on public.app_users from public, anon, authenticated;
grant select, insert, update on public.app_users to eduscale_app;
create policy app_users_server_select on public.app_users for select to eduscale_app using (true);
create policy app_users_server_insert on public.app_users for insert to eduscale_app with check (true);
create policy app_users_server_update on public.app_users for update to eduscale_app using (true) with check (true);
alter table public.auth_sessions add column user_id uuid references public.app_users(id);
create index auth_sessions_user_id_idx on public.auth_sessions(user_id);
create table public.schedule_audit (
 id uuid primary key default gen_random_uuid(), schedule_id uuid not null,
 actor_id uuid not null references public.app_users(id), actor_email text not null,
 before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now()
);
create index schedule_audit_created_at_idx on public.schedule_audit(created_at);
alter table public.schedule_audit enable row level security;
revoke all on public.schedule_audit from public, anon, authenticated;
grant select, insert on public.schedule_audit to eduscale_app;
create policy schedule_audit_server_select on public.schedule_audit for select to eduscale_app using (true);
create policy schedule_audit_server_insert on public.schedule_audit for insert to eduscale_app with check (true);
