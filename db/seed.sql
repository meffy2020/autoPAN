create extension if not exists pgcrypto;

insert into system_settings (
  announcement_mode,
  ready_grace_minutes,
  ending_soon_minutes,
  operating_window_minutes,
  staff_roster
)
select
  'name',
  3,
  10,
  600,
  '["김선생","이선생","박선생"]'::jsonb
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
select 'pc', '30분 이용', 30, 1000, false, 1
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'pc'
    and label = '30분 이용'
    and minutes = 30
    and amount = 1000
    and is_extension = false
    and sort_order = 1
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'pc', '60분 이용', 60, 2000, false, 2
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'pc'
    and label = '60분 이용'
    and minutes = 60
    and amount = 2000
    and is_extension = false
    and sort_order = 2
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'pc', '30분 연장', 30, 1000, true, 3
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'pc'
    and label = '30분 연장'
    and minutes = 30
    and amount = 1000
    and is_extension = true
    and sort_order = 3
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'nintendo', '30분 이용', 30, 2000, false, 4
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'nintendo'
    and label = '30분 이용'
    and minutes = 30
    and amount = 2000
    and is_extension = false
    and sort_order = 4
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'nintendo', '60분 이용', 60, 3500, false, 5
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'nintendo'
    and label = '60분 이용'
    and minutes = 60
    and amount = 3500
    and is_extension = false
    and sort_order = 5
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'nintendo', '30분 연장', 30, 1800, true, 6
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'nintendo'
    and label = '30분 연장'
    and minutes = 30
    and amount = 1800
    and is_extension = true
    and sort_order = 6
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'playstation', '30분 이용', 30, 2500, false, 7
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'playstation'
    and label = '30분 이용'
    and minutes = 30
    and amount = 2500
    and is_extension = false
    and sort_order = 7
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'playstation', '60분 이용', 60, 4500, false, 8
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'playstation'
    and label = '60분 이용'
    and minutes = 60
    and amount = 4500
    and is_extension = false
    and sort_order = 8
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select 'playstation', '30분 연장', 30, 2200, true, 9
where not exists (
  select 1
  from pricing_rules
  where resource_type = 'playstation'
    and label = '30분 연장'
    and minutes = 30
    and amount = 2200
    and is_extension = true
    and sort_order = 9
);

insert into pricing_rules (resource_type, label, minutes, amount, is_extension, sort_order)
select resource_type, label, minutes, amount, true, sort_order
from (
  values
    ('pc'::resource_type, '1시간 연장', 60, 2000, 10),
    ('pc'::resource_type, '1시간 30분 연장', 90, 3000, 11),
    ('nintendo'::resource_type, '1시간 연장', 60, 3500, 12),
    ('nintendo'::resource_type, '1시간 30분 연장', 90, 5000, 13),
    ('playstation'::resource_type, '1시간 연장', 60, 4500, 14),
    ('playstation'::resource_type, '1시간 30분 연장', 90, 6700, 15)
) as rules(resource_type, label, minutes, amount, sort_order)
where not exists (
  select 1
  from pricing_rules
  where pricing_rules.resource_type = rules.resource_type
    and pricing_rules.minutes = rules.minutes
    and pricing_rules.is_extension = true
);
