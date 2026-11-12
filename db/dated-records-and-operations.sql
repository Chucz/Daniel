begin;
-- Finish any old write before copying, then fence obsolete clients from writing the archived JSON.
lock table public.schedules in share mode;
revoke insert,update,delete on public.schedules from eduscale_app;
create table public.school_records (
 id text primary key, kind text not null check(kind in ('teacher','lesson','occurrence','legacy')),
 data jsonb not null check(jsonb_typeof(data)='object'), version integer not null default 1 check(version>0),
 deleted boolean not null default false, updated_at timestamptz not null default now()
);
create index school_records_kind_idx on public.school_records(kind) where not deleted;
create index school_records_occurrence_date_idx on public.school_records((data->>'date')) where kind='occurrence' and not deleted;
create unique index school_records_teacher_name_idx on public.school_records((data->>'type'),lower(btrim(data->>'name'))) where kind='teacher' and not deleted;
insert into public.school_records(id,kind,data)
 select 'teacher:'||gen_random_uuid(),'teacher',jsonb_build_object('type','titular','name',name,'phone','') from (
 select distinct on(lower(btrim(value #>> '{}'))) btrim(value #>> '{}') as name from public.schedules s cross join lateral jsonb_array_elements(s.data->'teachers'->'titulares') t(value) where btrim(value #>> '{}')<>''
 ) names;
insert into public.school_records(id,kind,data)
 select 'teacher:'||gen_random_uuid(),'teacher',jsonb_build_object('type','substituto','name',name,'phone',phone) from (
 select distinct on(lower(btrim(value->>'name'))) btrim(value->>'name') as name,coalesce(value->>'phone','') as phone from public.schedules s cross join lateral jsonb_array_elements(s.data->'teachers'->'substitutos') t(value) where btrim(value->>'name')<>'' order by lower(btrim(value->>'name'))
 ) names;
insert into public.school_records(id,kind,data)
 select 'lesson:'||k,'lesson',v-'status'-'substituteTeacher'-'substituteSelectedBy'-'substitutionRecordedBy'-'substitutionRecordedAt' from public.schedules s cross join lateral jsonb_each(s.data->'slots') p(k,v);
insert into public.school_records(id,kind,data)
 select 'legacy:'||k,'legacy',jsonb_build_object('slot',v,'reviewedDate',null,'classification','test_legacy') from public.schedules s cross join lateral jsonb_each(s.data->'slots') p(k,v) where v->>'status' in ('falta','substituido');
create table public.record_audit (
 id uuid primary key default gen_random_uuid(), record_id text not null, actor_id uuid not null references public.app_users(id),
 action text not null, before_data jsonb, after_data jsonb not null, created_at timestamptz not null default now()
);
create index record_audit_record_idx on public.record_audit(record_id,created_at);
create table public.recovery_codes (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.app_users(id), code_hash text not null unique,
 used_at timestamptz, created_at timestamptz not null default now()
);
create index recovery_codes_user_idx on public.recovery_codes(user_id);
alter table public.auth_sessions add column reauthenticated_at timestamptz;
create table public.operational_events (
 id uuid primary key default gen_random_uuid(), code text not null, area text not null,
 status integer, request_id uuid, created_at timestamptz not null default now()
);
create index operational_events_created_idx on public.operational_events(created_at);
do $$ declare name text; begin
 foreach name in array array['school_records','record_audit','recovery_codes','operational_events'] loop
 execute format('alter table public.%I enable row level security',name);
 execute format('revoke all on public.%I from public,anon,authenticated',name);
 execute format('grant select,insert on public.%I to eduscale_app',name);
 execute format('create policy server_select on public.%I for select to eduscale_app using(true)',name);
 execute format('create policy server_insert on public.%I for insert to eduscale_app with check(true)',name);
 end loop;
end $$;
grant update on public.school_records,public.recovery_codes,public.auth_sessions to eduscale_app;
create policy server_update on public.school_records for update to eduscale_app using(true) with check(true);
create policy server_update on public.recovery_codes for update to eduscale_app using(true) with check(true);
create policy server_update on public.auth_sessions for update to eduscale_app using(true) with check(true);
grant delete on public.recovery_codes to eduscale_app;
create policy server_delete on public.recovery_codes for delete to eduscale_app using(true);
commit;
