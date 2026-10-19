-- Research is additive: properties remains the existing listing read model.
-- Legacy source data must not silently acquire verified/real provenance.
alter table public.properties alter column listing_date drop not null;
alter table public.properties add column if not exists data_mode text not null default 'unknown'
  check (data_mode in ('real', 'demo', 'mock', 'unknown'));
alter table public.properties add column if not exists listing_date_definition text not null default 'unknown'
  check (listing_date_definition in ('source_reported', 'unknown'));
alter table public.properties add column if not exists first_seen_at timestamptz;
alter table public.properties add column if not exists current_episode_key text;
alter table public.enrichments add column if not exists source_status jsonb not null default '{}';

create table public.buying_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users(id) on delete cascade,
  name text not null default 'Mit boligprojekt',
  total_budget numeric not null check (total_budget > 0),
  min_residential_area numeric not null check (min_residential_area >= 0),
  min_bedrooms integer not null check (min_bedrooms >= 0),
  accepted_property_types text[] not null default '{}',
  primary_areas text[] not null default '{}',
  secondary_areas text[] not null default '{}',
  excluded_addresses text[] not null default '{}',
  excluded_roads text[] not null default '{}',
  excluded_areas text[] not null default '{}',
  preferences text[] not null default '{}',
  purchase_tracks text[] not null default '{move_in_ready,renovation}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Private working state is JSON because its versioned form follows the UI domain;
-- prices, transactions, periods, and observations below are normalized columns.
create table public.property_assessments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  assessment jsonb not null check (jsonb_typeof(assessment) = 'object'),
  revision integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(owner_id, property_id)
);
create table public.assessment_revisions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  assessment_id uuid not null references public.property_assessments(id) on delete cascade,
  revision integer not null,
  assessment jsonb not null,
  project_snapshot jsonb,
  property_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique(assessment_id, revision)
);
create or replace function public.record_assessment_revision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.assessment_revisions(owner_id,property_id,assessment_id,revision,assessment,project_snapshot,property_snapshot)
    values(new.owner_id,new.property_id,new.id,new.revision,new.assessment,
      (select to_jsonb(p) from public.buying_projects p where p.owner_id = new.owner_id),
      (select jsonb_build_object('id',p.id,'address',p.address,'price',p.price,'status',p.status,'sqm',p.sqm,
        'propertyType',p.property_type,'updatedAt',p.updated_at,'dataMode',p.data_mode)
       from public.properties p where p.id = new.property_id));
  return new;
end; $$;
create or replace function public.prepare_assessment_revision() returns trigger
language plpgsql set search_path = public as $$
begin
  new.revision := case when tg_op = 'UPDATE' then old.revision + 1 else 1 end;
  new.updated_at := now();
  return new;
end; $$;
create trigger assessment_revision_number before insert or update on public.property_assessments
  for each row execute function public.prepare_assessment_revision();
-- AFTER avoids creating an orphan revision from the speculative INSERT in UPSERT.
create trigger assessment_revision after insert or update on public.property_assessments
  for each row execute function public.record_assessment_revision();
revoke execute on function public.record_assessment_revision() from public, anon, authenticated;
revoke execute on function public.prepare_assessment_revision() from public, anon, authenticated;

create table public.listing_campaigns (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  ingest_key text unique,
  link_reason text not null,
  source text not null,
  source_url text,
  observed_at timestamptz not null default now()
);
create table public.listing_episodes (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  campaign_id uuid references public.listing_campaigns(id) on delete set null,
  owner_id uuid references auth.users(id) on delete cascade,
  ingest_key text unique,
  source text not null,
  source_listing_id text,
  source_url text,
  start_date date,
  end_date date,
  date_precision text not null default 'unknown' check (date_precision in ('day','month','interval','unknown')),
  status text not null default 'unknown' check (status in ('active','paused','removed','sold','unknown')),
  agent_name text,
  observed_at timestamptz not null default now(),
  data_mode text not null default 'unknown' check (data_mode in ('real','mock','demo','unknown')),
  check (end_date is null or start_date is null or end_date >= start_date)
);
create table public.listing_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  campaign_id uuid references public.listing_campaigns(id) on delete set null,
  episode_id uuid references public.listing_episodes(id) on delete set null,
  owner_id uuid references auth.users(id) on delete cascade,
  ingest_key text unique,
  event_type text not null check (event_type in ('first_listing','price_change','paused','relisted','removed','sold','observation')),
  event_date date,
  event_date_end date,
  date_precision text not null default 'unknown' check (date_precision in ('day','month','interval','unknown')),
  price numeric check (price > 0),
  source text not null,
  source_url text,
  observed_at timestamptz not null default now(),
  data_mode text not null default 'unknown' check (data_mode in ('real','mock','demo','unknown'))
);
create table public.sale_transactions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  campaign_id uuid references public.listing_campaigns(id) on delete set null,
  owner_id uuid references auth.users(id) on delete cascade,
  ingest_key text unique,
  registration_id text,
  sold_date date,
  sold_date_end date,
  date_precision text not null default 'unknown' check (date_precision in ('day','month','interval','unknown')),
  sale_price numeric not null check (sale_price > 0),
  sale_type text not null default 'unknown' check (sale_type in ('normal','family','auction','other','unknown')),
  first_asking_price numeric check (first_asking_price > 0),
  last_asking_price numeric check (last_asking_price > 0),
  residential_area numeric check (residential_area > 0),
  area_definition text not null default 'unknown' check (area_definition in ('residential','weighted','unknown')),
  area_as_of date,
  latest_episode_days integer check (latest_episode_days >= 0),
  documented_active_days integer check (documented_active_days >= 0),
  calendar_days integer check (calendar_days >= 0),
  source text not null,
  source_url text,
  observed_at timestamptz not null default now(),
  data_mode text not null default 'unknown' check (data_mode in ('real','mock','demo','unknown')),
  check (sold_date_end is null or sold_date is null or sold_date_end >= sold_date),
  check (sold_date is null or sold_date <= observed_at::date)
);
-- Do not merge units based on address proximity. A registration identifier is
-- source-qualified; an explicitly matched property/date/price is the fallback.
create unique index sale_transactions_registration on public.sale_transactions
  (coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid),source,registration_id) where registration_id is not null;
create unique index sale_transactions_fallback on public.sale_transactions
  (coalesce(owner_id,'00000000-0000-0000-0000-000000000000'::uuid),property_id,sold_date,date_precision,sale_price,sale_type);
create table public.source_observations (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  ingest_key text unique,
  transaction_id uuid references public.sale_transactions(id) on delete set null,
  episode_id uuid references public.listing_episodes(id) on delete set null,
  field_name text not null,
  value jsonb not null,
  source text not null,
  source_url text,
  effective_date date,
  date_precision text not null default 'unknown' check (date_precision in ('day','month','interval','unknown')),
  observed_at timestamptz not null default now(),
  method text not null,
  verification_status text not null default 'unverified' check (verification_status in ('unverified','verified','conflict','not_found','unavailable')),
  data_mode text not null default 'unknown' check (data_mode in ('real','mock','demo','unknown')),
  source_file text,
  source_sheet text,
  source_row integer,
  source_version text,
  conflict_group text
);
create table public.condition_evidence (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete cascade,
  episode_id uuid references public.listing_episodes(id) on delete set null,
  transaction_id uuid references public.sale_transactions(id) on delete set null,
  excerpt text not null,
  signals text[] not null default '{}',
  source text not null,
  source_url text,
  effective_date date,
  observed_at timestamptz not null default now(),
  method text not null,
  method_version text not null,
  human_approved boolean not null default false,
  data_mode text not null default 'unknown' check (data_mode in ('real','mock','demo','unknown'))
);
create table public.research_import_batches (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  source_file text not null,
  source_sheet text not null,
  source_version text not null,
  collected_at timestamptz not null,
  data_mode text not null default 'unknown' check (data_mode in ('real','mock','demo','unknown')),
  mapping jsonb not null,
  status text not null default 'preview' check (status in ('preview','committed')),
  created_at timestamptz not null default now(),
  committed_at timestamptz
);
create table public.research_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.research_import_batches(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  row_number integer not null,
  status text not null check (status in ('accepted','rejected','duplicate','quarantined','imported')),
  reasons text[] not null default '{}',
  raw_values jsonb not null,
  normalized jsonb,
  transaction_id uuid references public.sale_transactions(id) on delete set null,
  unique(batch_id,row_number)
);

-- Neither connected advisors nor agents inherit access to the buyer's project,
-- ceiling, reserve, documents, notes, import staging, or decision history.
do $$ declare t text; begin
  foreach t in array array['buying_projects','property_assessments','research_import_batches','research_import_rows'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy owner_select on public.%I for select to authenticated using (owner_id = auth.uid())',t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check (owner_id = auth.uid())',t);
    execute format('create policy owner_update on public.%I for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using (owner_id = auth.uid())',t);
  end loop;
  foreach t in array array['listing_campaigns','listing_episodes','listing_events','sale_transactions','source_observations','condition_evidence'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('create policy research_read on public.%I for select to authenticated using (owner_id is null or owner_id = auth.uid())',t);
    -- Ingestion uses service role. User imports commit through the constrained RPC.
    execute format('create index %I on public.%I(property_id)',t || '_property_idx',t);
  end loop;
end $$;
alter table public.assessment_revisions enable row level security;
create policy revision_owner_read on public.assessment_revisions for select to authenticated using (owner_id = auth.uid());

-- Commit a previously validated, private preview atomically. The server stages
-- previews with service role; callers cannot forge staged normalized values.
drop policy owner_insert on public.research_import_batches;
drop policy owner_update on public.research_import_batches;
drop policy owner_delete on public.research_import_batches;
drop policy owner_insert on public.research_import_rows;
drop policy owner_update on public.research_import_rows;
drop policy owner_delete on public.research_import_rows;
create or replace function public.commit_research_import(p_batch_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.research_import_batches; r public.research_import_rows; n jsonb; tid uuid; imported int := 0; duplicates int := 0; field text;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select * into b from public.research_import_batches where id = p_batch_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Import not found'; end if;
  if b.status = 'committed' then return jsonb_build_object('alreadyCommitted',true,'batchId',b.id); end if;
  for r in select * from public.research_import_rows where batch_id=b.id and owner_id=auth.uid() and status='accepted' order by row_number loop
    n := r.normalized; tid := null;
    select id into tid from public.sale_transactions where property_id=(n->>'propertyId')::uuid
      and sold_date=(n->>'soldDate')::date and sale_price=(n->>'salePrice')::numeric
      and date_precision=n->>'datePrecision'
      and sale_type=n->>'saleType' and (owner_id is null or owner_id=auth.uid()) limit 1;
    if tid is not null then
      update public.research_import_rows set status='duplicate',transaction_id=tid,reasons=array['Handlen findes allerede; observationen er bevaret i importloggen.'] where id=r.id;
      duplicates := duplicates + 1; continue;
    end if;
    insert into public.sale_transactions(property_id,owner_id,ingest_key,sold_date,sold_date_end,date_precision,sale_price,sale_type,
      first_asking_price,last_asking_price,residential_area,area_definition,area_as_of,latest_episode_days,documented_active_days,calendar_days,source,source_url,observed_at,data_mode)
    values((n->>'propertyId')::uuid,auth.uid(),'import:'||b.id||':'||r.row_number,(n->>'soldDate')::date,(n->>'soldDateEnd')::date,n->>'datePrecision',
      (n->>'salePrice')::numeric,n->>'saleType',(n->>'firstAskingPrice')::numeric,(n->>'lastAskingPrice')::numeric,(n->>'residentialArea')::numeric,
      n->>'areaDefinition',(n->>'areaAsOf')::date,(n->>'latestEpisodeDays')::int,(n->>'documentedActiveDays')::int,(n->>'calendarDays')::int,
      'user_import',n->>'sourceUrl',b.collected_at,b.data_mode) on conflict do nothing returning id into tid;
    if tid is null then
      update public.research_import_rows set status='duplicate',reasons=array['Dublet opdaget under atomisk import.'] where id=r.id;
      duplicates := duplicates + 1; continue;
    end if;
    foreach field in array array['salePrice','soldDate','firstAskingPrice','lastAskingPrice','residentialArea','latestEpisodeDays','documentedActiveDays','calendarDays'] loop
      if n->field is not null and n->field <> 'null'::jsonb then
        insert into public.source_observations(property_id,owner_id,transaction_id,field_name,value,source,source_url,effective_date,date_precision,
          observed_at,method,verification_status,data_mode,source_file,source_sheet,source_row,source_version)
        values((n->>'propertyId')::uuid,auth.uid(),tid,field,n->field,'user_import',n->>'sourceUrl',(n->>'soldDate')::date,n->>'datePrecision',
          b.collected_at,'explicit_column_mapping','unverified',b.data_mode,b.source_file,b.source_sheet,r.row_number,b.source_version);
      end if;
    end loop;
    if coalesce(n->>'conditionText','') <> '' then
      insert into public.condition_evidence(property_id,owner_id,transaction_id,excerpt,source,source_url,effective_date,observed_at,method,method_version,data_mode)
      values((n->>'propertyId')::uuid,auth.uid(),tid,n->>'conditionText','user_import',n->>'sourceUrl',(n->>'conditionAsOf')::date,b.collected_at,'manual_import','1',b.data_mode);
    end if;
    update public.research_import_rows set status='imported',transaction_id=tid where id=r.id;
    imported := imported + 1;
  end loop;
  update public.research_import_batches set status='committed',committed_at=now() where id=b.id;
  return jsonb_build_object('batchId',b.id,'imported',imported,'duplicates',duplicates,'alreadyCommitted',false);
end; $$;
revoke execute on function public.commit_research_import(uuid) from public, anon;
grant execute on function public.commit_research_import(uuid) to authenticated;

create table public.register_lookup_budgets (
  owner_id uuid not null references auth.users(id) on delete cascade,
  hour_start timestamptz not null,
  request_count integer not null,
  primary key(owner_id,hour_start)
);
alter table public.register_lookup_budgets enable row level security;
create or replace function public.consume_register_lookup_budget() returns boolean
language plpgsql security definer set search_path = public as $$
declare used integer; begin
  if auth.uid() is null then return false; end if;
  insert into public.register_lookup_budgets(owner_id,hour_start,request_count)
    values(auth.uid(),date_trunc('hour',now()),1)
    on conflict(owner_id,hour_start) do update set request_count=register_lookup_budgets.request_count+1
    returning request_count into used;
  return used <= 30;
end; $$;
revoke execute on function public.consume_register_lookup_budget() from public, anon;
grant execute on function public.consume_register_lookup_budget() to authenticated;
