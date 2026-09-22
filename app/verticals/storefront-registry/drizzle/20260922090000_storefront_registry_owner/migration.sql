create schema if not exists storefront_registry;

create table storefront_registry.storefront_applications (
  storefront_application_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  storefront_app_id text not null,
  current_revision integer not null,
  created_at timestamptz not null default clock_timestamp(),
  constraint storefront_registry_applications_scope_id_uk unique (tenant_id, storefront_application_id),
  constraint storefront_registry_applications_app_id_uk unique (tenant_id, storefront_app_id),
  constraint storefront_registry_applications_revision_ck check (current_revision > 0),
  constraint storefront_registry_applications_app_id_ck check (storefront_app_id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$')
);

create table storefront_registry.storefront_application_revisions (
  storefront_application_revision_id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  storefront_application_id uuid not null,
  revision_number integer not null,
  allowed_channels jsonb not null,
  lifecycle text not null,
  effective_from timestamptz not null,
  effective_to timestamptz,
  reason text not null,
  action_invocation_id uuid not null,
  acting_principal_id uuid not null,
  recorded_at timestamptz not null default clock_timestamp(),
  constraint storefront_registry_revisions_scope_id_uk unique (tenant_id, storefront_application_revision_id),
  constraint storefront_registry_revisions_number_uk unique (tenant_id, storefront_application_id, revision_number),
  constraint storefront_registry_revisions_invocation_uk unique (tenant_id, action_invocation_id),
  constraint storefront_registry_revisions_application_fk foreign key (tenant_id, storefront_application_id)
    references storefront_registry.storefront_applications (tenant_id, storefront_application_id) on delete restrict,
  constraint storefront_registry_revisions_number_ck check (revision_number > 0),
  constraint storefront_registry_revisions_lifecycle_ck check (lifecycle in ('DRAFT', 'ACTIVE', 'SUSPENDED', 'RETIRED')),
  constraint storefront_registry_revisions_period_ck check (effective_to is null or effective_to > effective_from),
  constraint storefront_registry_revisions_channels_ck check (
    jsonb_typeof(allowed_channels) = 'array' and jsonb_array_length(allowed_channels) > 0
  ),
  constraint storefront_registry_revisions_reason_ck check (
    reason = btrim(reason) and length(reason) between 1 and 500
  )
);

create index storefront_registry_revisions_effective_idx
  on storefront_registry.storefront_application_revisions (tenant_id, storefront_application_id, effective_from);

create table storefront_registry.storefront_registry_generations (
  tenant_id uuid primary key,
  generation integer not null default 0,
  last_action_invocation_id uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  constraint storefront_registry_generations_generation_ck check (generation >= 0)
);

alter table storefront_registry.storefront_applications enable row level security;
alter table storefront_registry.storefront_applications force row level security;
alter table storefront_registry.storefront_application_revisions enable row level security;
alter table storefront_registry.storefront_application_revisions force row level security;
alter table storefront_registry.storefront_registry_generations enable row level security;
alter table storefront_registry.storefront_registry_generations force row level security;

create policy storefront_registry_applications_tenant_select on storefront_registry.storefront_applications
  for select to ontos_runtime using (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_applications_tenant_insert on storefront_registry.storefront_applications
  for insert to ontos_runtime with check (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_applications_tenant_update on storefront_registry.storefront_applications
  for update to ontos_runtime using (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_applications_tenant_delete on storefront_registry.storefront_applications
  for delete to ontos_runtime using (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);

create policy storefront_registry_revisions_tenant_select on storefront_registry.storefront_application_revisions
  for select to ontos_runtime using (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_revisions_tenant_insert on storefront_registry.storefront_application_revisions
  for insert to ontos_runtime with check (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_revisions_tenant_update on storefront_registry.storefront_application_revisions
  for update to ontos_runtime using (false) with check (false);
create policy storefront_registry_revisions_tenant_delete on storefront_registry.storefront_application_revisions
  for delete to ontos_runtime using (false);

create policy storefront_registry_generations_tenant_select on storefront_registry.storefront_registry_generations
  for select to ontos_runtime using (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_generations_tenant_insert on storefront_registry.storefront_registry_generations
  for insert to ontos_runtime with check (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_generations_tenant_update on storefront_registry.storefront_registry_generations
  for update to ontos_runtime using (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid)
  with check (tenant_id = nullif(current_setting('ontos.tenant_id', true), '')::uuid);
create policy storefront_registry_generations_tenant_delete on storefront_registry.storefront_registry_generations
  for delete to ontos_runtime using (false);

create or replace function storefront_registry.reject_revision_mutation()
returns trigger language plpgsql as $$
begin
  raise exception 'Storefront application revision history is append-only';
end;
$$;

create trigger storefront_registry_revisions_append_only
before update or delete on storefront_registry.storefront_application_revisions
for each row execute function storefront_registry.reject_revision_mutation();

create or replace function storefront_registry.read_current_storefront_application(
  p_tenant_id uuid,
  p_payload jsonb
) returns table (payload jsonb)
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_application storefront_registry.storefront_applications%rowtype;
  v_revision storefront_registry.storefront_application_revisions%rowtype;
  v_generation integer;
  v_observed_at timestamptz := clock_timestamp();
begin
  if p_tenant_id is distinct from nullif(current_setting('ontos.tenant_id', true), '')::uuid then
    raise exception 'Tenant scope mismatch';
  end if;

  select * into v_application
  from storefront_registry.storefront_applications
  where tenant_id = p_tenant_id and storefront_app_id = p_payload->>'storefrontAppId';

  select coalesce(generation, 0) into v_generation
  from storefront_registry.storefront_registry_generations where tenant_id = p_tenant_id;

  if not found or v_application.storefront_application_id is null then
    return query select jsonb_build_object(
      '_tag', 'not_found', 'generation', coalesce(v_generation, 0), 'observedAt', v_observed_at
    );
    return;
  end if;

  select * into strict v_revision
  from storefront_registry.storefront_application_revisions
  where tenant_id = p_tenant_id
    and storefront_application_id = v_application.storefront_application_id
    and revision_number = v_application.current_revision;

  return query select jsonb_build_object(
    '_tag', 'found',
    'current', jsonb_build_object(
      'allowedChannels', v_revision.allowed_channels,
      'effectiveFrom', v_revision.effective_from,
      'effectiveTo', v_revision.effective_to,
      'generation', coalesce(v_generation, 0),
      'lifecycle', v_revision.lifecycle,
      'observedAt', least(v_observed_at, (p_payload->>'effectiveAt')::timestamptz),
      'revision', v_revision.revision_number
    )
  );
end;
$$;

revoke all on all tables in schema storefront_registry from ontos_runtime;
revoke all on function storefront_registry.read_current_storefront_application(uuid, jsonb) from public;
grant execute on function storefront_registry.read_current_storefront_application(uuid, jsonb) to ontos_runtime;
