-- Apply after db/security-hardening.sql, before deploying the user-management code.
-- Additive migration: no passwords, schedules or audit records are replaced.
begin;
lock table public.app_users in share row exclusive mode;
do $$ begin
  if (select count(*) from public.app_users where lower(btrim(email))='danielchuczman@gmail.com' and role='admin' and active) <> 1 then
    raise exception 'The existing principal administrator must be reviewed before migration';
  end if;
  if exists(select lower(btrim(email)) from public.app_users group by lower(btrim(email)) having count(*)>1) then
    raise exception 'Duplicate case-insensitive email addresses must be reviewed before migration';
  end if;
  if exists(select 1 from public.app_users where role not in ('admin','gestor','editor','consulta')) then
    raise exception 'Unknown legacy role; manual review required';
  end if;
end $$;
alter table public.app_users add column is_primary boolean not null default false;
alter table public.app_users add column version integer not null default 1 check(version>0);
alter table public.app_users drop constraint app_users_role_check;
update public.app_users set role='editor' where role='gestor';
update public.app_users set email=lower(btrim(email));
update public.app_users set is_primary=true where email='danielchuczman@gmail.com';
alter table public.app_users alter column role set default 'consulta';
alter table public.app_users add constraint app_users_role_check check(role in ('admin','editor','consulta'));
create unique index app_users_email_normalized_key on public.app_users(lower(btrim(email)));
create unique index app_users_single_primary_key on public.app_users(is_primary) where is_primary;
create function public.protect_primary_account() returns trigger language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if old.is_primary then
    if tg_op='DELETE' then raise exception 'Primary account cannot be deleted' using errcode='23514'; end if;
    if new.id is distinct from old.id or new.email is distinct from old.email or not new.is_primary or not new.active or new.role<>'admin' then
      raise exception 'Primary account identity and access are protected' using errcode='23514';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
revoke all on function public.protect_primary_account() from public,anon,authenticated;
create trigger protect_primary_account before update or delete on public.app_users for each row execute function public.protect_primary_account();
create table public.user_audit (
 id uuid primary key default gen_random_uuid(), actor_id uuid not null references public.app_users(id),
 target_id uuid not null references public.app_users(id), action text not null check(action in ('create','update','activate','deactivate','reset_password')),
 before_state jsonb, after_state jsonb not null, created_at timestamptz not null default now()
);
create index user_audit_created_at_idx on public.user_audit(created_at);
create index user_audit_target_id_idx on public.user_audit(target_id);
alter table public.user_audit enable row level security;
revoke all on public.user_audit from public,anon,authenticated;
grant select,insert on public.user_audit to eduscale_app;
create policy user_audit_server_select on public.user_audit for select to eduscale_app using(true);
create policy user_audit_server_insert on public.user_audit for insert to eduscale_app with check(true);
commit;
