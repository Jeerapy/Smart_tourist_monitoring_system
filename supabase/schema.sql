-- Smart Tourist Monitoring System (MVP) - Supabase schema + RLS
-- Notes:
-- - Auth handled by Supabase Auth; backend verifies JWT and uses DB via PostgREST.
-- - Role-based access is enforced via RLS using `profiles.role`.
-- - MVP supports: geofence alerts, SOS alerts, zones (circle + polygon), location pings, last-location cache.

begin;

-- Enable useful extensions (safe to run repeatedly)
create extension if not exists pgcrypto;

-- =========================
-- Profiles (role + user info)
-- =========================
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null check (role in ('user', 'authority')),
  full_name text,
  dob date,
  place text,
  -- Tourist digital ID (registration fields)
  citizenship text, -- expected values: 'INDIAN' | 'FOREIGN'
  aadhaar_number text,
  passport_number text,
  phone_number text,
  alternative_phone_number text,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relation text,
  consent_location_tracking boolean not null default false,
  consent_blockchain_storage boolean not null default false,
  consent_at timestamptz,
  is_verified boolean not null default false,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- =========================
-- Danger zones (circle + polygon)
-- =========================
create table if not exists public.danger_zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  risk_level int not null default 1,
  shape_type text not null check (shape_type in ('CIRCLE', 'POLYGON')),

  -- circle fields
  circle_center_lat double precision,
  circle_center_lng double precision,
  circle_radius_m double precision,

  -- polygon fields (GeoJSON polygon; stored as jsonb)
  polygon_geojson jsonb,

  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists danger_zones_shape_type_idx on public.danger_zones(shape_type);
create index if not exists danger_zones_created_at_idx on public.danger_zones(created_at desc);

alter table public.danger_zones enable row level security;

-- =========================
-- Location pings (history)
-- =========================
create table if not exists public.user_location_pings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null,

  -- optional fields useful for AI model inputs later
  accuracy_m double precision,
  heading_deg double precision,
  altitude_m double precision,
  speed_mps double precision,

  created_at timestamptz not null default now()
);

create index if not exists user_location_pings_user_time_idx
  on public.user_location_pings(user_id, recorded_at desc);

alter table public.user_location_pings enable row level security;

-- =========================
-- Last location cache (1 row per user)
-- =========================
create table if not exists public.user_last_location (
  user_id uuid primary key references public.profiles(id) on delete cascade,

  lat double precision not null,
  lng double precision not null,
  recorded_at timestamptz not null,

  accuracy_m double precision,
  heading_deg double precision,
  altitude_m double precision,
  speed_mps double precision,

  updated_at timestamptz not null default now()
);

create index if not exists user_last_location_recorded_at_idx
  on public.user_last_location(recorded_at desc);

alter table public.user_last_location enable row level security;

-- =========================
-- User documents (OCR + verification results)
-- =========================
create table if not exists public.user_documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  doc_type text default 'OTHER',
  file_name text,
  mime_type text,

  ocr_text text not null,
  extracted_name text,
  extracted_dob date,
  extraction_confidence double precision,
  verification_result text not null,

  created_at timestamptz not null default now()
);

alter table public.user_documents
  add column if not exists ipfs_cid text,
  add column if not exists ipfs_uri text,
  add column if not exists ipfs_provider text,
  add column if not exists encrypted boolean not null default false,
  add column if not exists enc_alg text,
  add column if not exists enc_nonce text,
  add column if not exists onchain_tx_hash text,
  add column if not exists onchain_chain text,
  add column if not exists onchain_contract_address text,
  add column if not exists onchain_status text,
  add column if not exists cid_hash text;

create index if not exists user_documents_user_created_idx
  on public.user_documents(user_id, created_at desc);

alter table public.user_documents enable row level security;

-- =========================
-- Digital ID registry
-- =========================
create table if not exists public.digital_id_registry (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  digital_id text unique not null,
  latest_document_id uuid references public.user_documents(id) on delete set null,
  latest_ipfs_cid text,
  latest_tx_hash text,
  verified boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists digital_id_registry_digital_id_idx on public.digital_id_registry(digital_id);

alter table public.digital_id_registry enable row level security;

-- =========================
-- Document access logs
-- =========================
create table if not exists public.document_access_logs (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.user_documents(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  viewer_id uuid not null references public.profiles(id) on delete cascade,
  viewer_role text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists document_access_logs_user_created_idx
  on public.document_access_logs(user_id, created_at desc);

alter table public.document_access_logs enable row level security;

-- =========================
-- Alerts
-- =========================
create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,

  type text not null check (type in ('GEOFENCE', 'SOS')),
  -- Extendable enum by convention (text), MVP uses OPEN/ACKED/RESOLVED
  status text not null default 'OPEN',
  severity int not null default 1,
  source text not null default 'rule_engine',
  risk_level int not null default 1,
  summary text not null,

  triggered_by_zone_id uuid references public.danger_zones(id),
  trigger_lat double precision,
  trigger_lng double precision,

  created_at timestamptz not null default now(),
  acked_by uuid references public.profiles(id),
  acked_at timestamptz,
  resolved_by uuid references public.profiles(id),
  resolved_at timestamptz
);

create index if not exists alerts_user_created_idx on public.alerts(user_id, created_at desc);
create index if not exists alerts_status_created_idx on public.alerts(status, created_at desc);
create index if not exists alerts_type_created_idx on public.alerts(type, created_at desc);

alter table public.alerts enable row level security;

-- =========================
-- Helper: check if caller is authority
-- =========================
create or replace function public.is_authority(uid uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = uid and p.role = 'authority'
  );
$$;

-- =========================
-- RLS Policies
-- =========================

-- profiles
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
to authenticated
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

-- danger_zones
drop policy if exists "zones_select_all_authed" on public.danger_zones;
create policy "zones_select_all_authed"
on public.danger_zones for select
to authenticated
using (true);

drop policy if exists "zones_insert_authority" on public.danger_zones;
create policy "zones_insert_authority"
on public.danger_zones for insert
to authenticated
with check (public.is_authority(auth.uid()) and created_by = auth.uid());

drop policy if exists "zones_update_authority" on public.danger_zones;
create policy "zones_update_authority"
on public.danger_zones for update
to authenticated
using (public.is_authority(auth.uid()))
with check (public.is_authority(auth.uid()));

drop policy if exists "zones_delete_authority" on public.danger_zones;
create policy "zones_delete_authority"
on public.danger_zones for delete
to authenticated
using (public.is_authority(auth.uid()));

-- user_location_pings (users only for their own pings)
drop policy if exists "pings_insert_own" on public.user_location_pings;
create policy "pings_insert_own"
on public.user_location_pings for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "pings_select_own" on public.user_location_pings;
create policy "pings_select_own"
on public.user_location_pings for select
to authenticated
using (user_id = auth.uid());

-- user_last_location (users can upsert/read their own)
drop policy if exists "lastloc_select_own" on public.user_last_location;
create policy "lastloc_select_own"
on public.user_last_location for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "lastloc_insert_own" on public.user_last_location;
create policy "lastloc_insert_own"
on public.user_last_location for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "lastloc_update_own" on public.user_last_location;
create policy "lastloc_update_own"
on public.user_last_location for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- user_documents
drop policy if exists "docs_select_own" on public.user_documents;
create policy "docs_select_own"
on public.user_documents for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "docs_select_authority" on public.user_documents;
create policy "docs_select_authority"
on public.user_documents for select
to authenticated
using (public.is_authority(auth.uid()));

drop policy if exists "docs_insert_own" on public.user_documents;
create policy "docs_insert_own"
on public.user_documents for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "docs_update_own_or_authority" on public.user_documents;
create policy "docs_update_own_or_authority"
on public.user_documents for update
to authenticated
using (user_id = auth.uid() or public.is_authority(auth.uid()))
with check (user_id = auth.uid() or public.is_authority(auth.uid()));

-- digital_id_registry
drop policy if exists "did_select_own_or_authority" on public.digital_id_registry;
create policy "did_select_own_or_authority"
on public.digital_id_registry for select
to authenticated
using (user_id = auth.uid() or public.is_authority(auth.uid()));

drop policy if exists "did_insert_own_or_authority" on public.digital_id_registry;
create policy "did_insert_own_or_authority"
on public.digital_id_registry for insert
to authenticated
with check (user_id = auth.uid() or public.is_authority(auth.uid()));

drop policy if exists "did_update_own_or_authority" on public.digital_id_registry;
create policy "did_update_own_or_authority"
on public.digital_id_registry for update
to authenticated
using (user_id = auth.uid() or public.is_authority(auth.uid()))
with check (user_id = auth.uid() or public.is_authority(auth.uid()));

-- document_access_logs
drop policy if exists "doc_logs_insert_viewer" on public.document_access_logs;
create policy "doc_logs_insert_viewer"
on public.document_access_logs for insert
to authenticated
with check (
  viewer_id = auth.uid()
  and (
    viewer_id = user_id
    or public.is_authority(auth.uid())
  )
);

drop policy if exists "doc_logs_select_own_or_authority" on public.document_access_logs;
create policy "doc_logs_select_own_or_authority"
on public.document_access_logs for select
to authenticated
using (
  viewer_id = auth.uid()
  or user_id = auth.uid()
  or public.is_authority(auth.uid())
);

-- alerts
drop policy if exists "alerts_select_own" on public.alerts;
create policy "alerts_select_own"
on public.alerts for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "alerts_insert_own" on public.alerts;
create policy "alerts_insert_own"
on public.alerts for insert
to authenticated
with check (user_id = auth.uid());

commit;

