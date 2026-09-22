insert into public.admin_equipment_types (name, description, created_by)
values
  ('Laptop', 'Portable computers and mobile workstations', 'system:migration'),
  ('Desktop computer', 'Fixed workstations and desktop systems', 'system:migration'),
  ('Monitor', 'Displays and external screens', 'system:migration'),
  ('Mobile phone', 'Company-owned smartphones and mobile devices', 'system:migration'),
  ('Tablet', 'Tablets and pen-enabled mobile devices', 'system:migration'),
  ('Camera', 'Photography and video production cameras', 'system:migration'),
  ('Storage device', 'External drives, NAS units and backup devices', 'system:migration'),
  ('Networking equipment', 'Routers, switches, access points and related systems', 'system:migration')
on conflict (lower(trim(name))) do nothing;

