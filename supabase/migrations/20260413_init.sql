create extension if not exists pgcrypto;

create table if not exists system_settings (
  id uuid primary key default gen_random_uuid(),
  announcement_mode text not null default 'name',
  ready_grace_minutes integer not null default 3,
  ending_soon_minutes integer not null default 10,
  operating_window_minutes integer not null default 600,
  staff_roster jsonb not null default '["김선생","이선생","박선생"]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  grade_or_age text not null,
  guardian_phone text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_visited_at timestamptz
);

create table if not exists resources (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  resource_type text not null check (resource_type in ('pc', 'nintendo', 'playstation')),
  label text not null,
  display_order integer not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists pricing_rules (
  id uuid primary key default gen_random_uuid(),
  resource_type text not null check (resource_type in ('pc', 'nintendo', 'playstation')),
  label text not null,
  minutes integer not null,
  amount integer not null,
  is_extension boolean not null default false,
  sort_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists visits (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members(id),
  ticket_number text not null unique,
  resource_type text not null check (resource_type in ('pc', 'nintendo', 'playstation')),
  pricing_rule_id uuid not null references pricing_rules(id),
  status text not null check (status in ('queued', 'in_session', 'completed', 'canceled', 'no_show')),
  note text,
  created_at timestamptz not null default now()
);

create table if not exists queue_entries (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id),
  resource_type text not null check (resource_type in ('pc', 'nintendo', 'playstation')),
  status text not null check (status in ('waiting', 'ready', 'seated', 'no_show', 'canceled')),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  ready_at timestamptz,
  called_at timestamptz,
  no_show_at timestamptz
);

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id),
  resource_id uuid not null references resources(id),
  resource_type text not null check (resource_type in ('pc', 'nintendo', 'playstation')),
  pricing_rule_id uuid not null references pricing_rules(id),
  planned_minutes integer not null,
  extension_minutes integer not null default 0,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  ended_at timestamptz,
  status text not null check (status in ('active', 'ended')),
  warned_at timestamptz,
  time_over_alert_at timestamptz
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id),
  amount integer not null,
  method text not null check (method in ('cash', 'card')),
  phase text not null check (phase in ('initial', 'extension', 'adjustment')),
  recorded_by text not null,
  recorded_at timestamptz not null default now()
);

create table if not exists tts_events (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references visits(id),
  category text not null check (category in ('queue_ready', 'ending_soon', 'time_over')),
  message text not null,
  audience_label text not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);

create table if not exists staff_activity_logs (
  id uuid primary key default gen_random_uuid(),
  staff_name text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

insert into system_settings (announcement_mode, ready_grace_minutes, ending_soon_minutes, operating_window_minutes)
select 'name', 3, 10, 600
where not exists (select 1 from system_settings);

insert into resources (code, resource_type, label, display_order)
values
  ('pc-01', 'pc', 'PC-01', 1),
  ('pc-02', 'pc', 'PC-02', 2),
  ('pc-03', 'pc', 'PC-03', 3),
  ('pc-04', 'pc', 'PC-04', 4),
  ('pc-05', 'pc', 'PC-05', 5),
  ('pc-06', 'pc', 'PC-06', 6),
  ('nin-01', 'nintendo', 'NIN-01', 7),
  ('nin-02', 'nintendo', 'NIN-02', 8),
  ('nin-03', 'nintendo', 'NIN-03', 9),
  ('nin-04', 'nintendo', 'NIN-04', 10),
  ('ps-01', 'playstation', 'PS-01', 11),
  ('ps-02', 'playstation', 'PS-02', 12)
on conflict (code) do nothing;

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
values
  ('pc', '30분 이용', 30, 1000, false, 1),
  ('pc', '60분 이용', 60, 2000, false, 2),
  ('pc', '30분 연장', 30, 1000, true, 3),
  ('nintendo', '30분 이용', 30, 2000, false, 4),
  ('nintendo', '60분 이용', 60, 3500, false, 5),
  ('nintendo', '30분 연장', 30, 1800, true, 6),
  ('playstation', '30분 이용', 30, 2500, false, 7),
  ('playstation', '60분 이용', 60, 4500, false, 8),
  ('playstation', '30분 연장', 30, 2200, true, 9)
on conflict do nothing;
