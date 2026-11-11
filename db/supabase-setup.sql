-- Server-only database access. Existing application authentication stays in Netlify.
create table public.schedules (
  id uuid primary key,
  data jsonb not null
);

create table public.auth_sessions (
  token_hash text primary key,
  credential_hash text not null,
  expires_at timestamptz not null
);
create index auth_sessions_expires_at_idx on public.auth_sessions (expires_at);

alter table public.schedules enable row level security;
alter table public.auth_sessions enable row level security;
revoke all on public.schedules, public.auth_sessions from public, anon, authenticated;

-- Enable login and set a unique password privately before configuring Netlify.
create role eduscale_app nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
grant usage on schema public to eduscale_app;
grant select, insert, update on public.schedules to eduscale_app;
grant select, insert, delete on public.auth_sessions to eduscale_app;

-- This role is used only by the authenticated server, never by browser clients.
create policy schedules_server_select on public.schedules for select to eduscale_app using (true);
create policy schedules_server_insert on public.schedules for insert to eduscale_app with check (true);
create policy schedules_server_update on public.schedules for update to eduscale_app using (true) with check (true);
create policy sessions_server_select on public.auth_sessions for select to eduscale_app using (true);
create policy sessions_server_insert on public.auth_sessions for insert to eduscale_app with check (true);
create policy sessions_server_delete on public.auth_sessions for delete to eduscale_app using (true);
