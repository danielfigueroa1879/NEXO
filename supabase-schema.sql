-- ============================================================
--  NEXO — Esquema de base de datos para Supabase
--  Ejecuta este archivo completo en:
--     Supabase → SQL Editor → New query → pegar → RUN
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tabla CUENTAS
--    Un registro por usuario. auth.users se crea automáticamente
--    al hacer signUp; esta tabla guarda los datos del formulario
--    de solicitar.html + login.html.
-- ------------------------------------------------------------
create table if not exists public.cuentas (
  id            uuid primary key references auth.users(id) on delete cascade,
  rut           text unique not null,
  nombre        text not null,
  email         text,
  telefono      text,
  direccion     text,
  patente       text,
  tipo          text,                 -- guardia | conductor | empresa | comercio
  empresa       text,
  perfiles      text[] default '{}',  -- ['guardia','vehiculo','comerciante']
  tema          text default 'negro',
  pago          text,
  estado        text default 'pendiente', -- pendiente | activa | rechazada
  es_admin      boolean default false,     -- true = ve todas las cuentas en admin.html
  fecha         timestamptz default now()
);

-- Índices útiles para admin
create index if not exists cuentas_rut_idx    on public.cuentas (rut);
create index if not exists cuentas_estado_idx on public.cuentas (estado);
create index if not exists cuentas_fecha_idx  on public.cuentas (fecha desc);

-- ------------------------------------------------------------
-- 2) Tabla DOCUMENTOS
--    Un registro por archivo subido (cédula, licencia, etc.).
--    El archivo real vive en Storage; aquí guardamos la ruta.
-- ------------------------------------------------------------
create table if not exists public.documentos (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  tipo       text not null,      -- cedula | foto | curso | credencial |
                                  -- contrato | examen | licencia | permiso | soap |
                                  -- antecedentes | revision | padron |
                                  -- patente_alcoholes | patente_comercial |
                                  -- directiva | contratos_empresa | seguro_empresa |
                                  -- extra1..N | com_extra1..N | emp_extra1..N
  nombre     text not null,      -- nombre original del archivo
  titulo     text,               -- nombre personalizado (para slots renombrables)
  path       text not null,      -- ruta dentro del bucket 'documentos'
  tamano     integer,            -- bytes
  fecha      timestamptz default now(),
  unique (cuenta_id, tipo)       -- un solo documento por tipo por cuenta
);

-- Migración: si la tabla ya existe sin la columna titulo, la agrega
alter table public.documentos add column if not exists titulo text;

create index if not exists documentos_cuenta_idx on public.documentos (cuenta_id);

-- ------------------------------------------------------------
-- 3) ROW LEVEL SECURITY
--    Cada usuario solo puede ver / editar sus propios datos.
--    El admin se maneja con el rol service_role (clave secreta,
--    NO se usa desde el navegador).
-- ------------------------------------------------------------
alter table public.cuentas    enable row level security;
alter table public.documentos enable row level security;

-- Función helper: ¿el usuario actual es admin?
create or replace function public.es_admin_actual() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((select es_admin from public.cuentas where id = auth.uid()), false);
$$;

-- Cuentas: el usuario ve/edita su propia fila; admins ven todas
drop policy if exists "cuentas_select_propia" on public.cuentas;
create policy "cuentas_select_propia" on public.cuentas
  for select using (auth.uid() = id or public.es_admin_actual());

drop policy if exists "documentos_select_admin" on public.documentos;
create policy "documentos_select_admin" on public.documentos
  for select using (auth.uid() = cuenta_id or public.es_admin_actual());

drop policy if exists "cuentas_insert_propia" on public.cuentas;
create policy "cuentas_insert_propia" on public.cuentas
  for insert with check (auth.uid() = id);

drop policy if exists "cuentas_update_propia" on public.cuentas;
create policy "cuentas_update_propia" on public.cuentas
  for update using (auth.uid() = id);

-- Documentos: el usuario ve/edita los suyos
drop policy if exists "documentos_select_propia" on public.documentos;
create policy "documentos_select_propia" on public.documentos
  for select using (auth.uid() = cuenta_id);

drop policy if exists "documentos_insert_propia" on public.documentos;
create policy "documentos_insert_propia" on public.documentos
  for insert with check (auth.uid() = cuenta_id);

drop policy if exists "documentos_update_propia" on public.documentos;
create policy "documentos_update_propia" on public.documentos
  for update using (auth.uid() = cuenta_id);

drop policy if exists "documentos_delete_propia" on public.documentos;
create policy "documentos_delete_propia" on public.documentos
  for delete using (auth.uid() = cuenta_id);

-- ------------------------------------------------------------
-- 4) STORAGE — bucket 'documentos'
--    Crea el bucket privado y las políticas de acceso.
--    Cada archivo se guarda en:  documentos/{cuenta_id}/{tipo}.{ext}
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
  values ('documentos', 'documentos', false)
  on conflict (id) do nothing;

drop policy if exists "docs_select_propio" on storage.objects;
create policy "docs_select_propio" on storage.objects
  for select using (
    bucket_id = 'documentos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "docs_insert_propio" on storage.objects;
create policy "docs_insert_propio" on storage.objects
  for insert with check (
    bucket_id = 'documentos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "docs_update_propio" on storage.objects;
create policy "docs_update_propio" on storage.objects
  for update using (
    bucket_id = 'documentos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "docs_delete_propio" on storage.objects;
create policy "docs_delete_propio" on storage.objects
  for delete using (
    bucket_id = 'documentos'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
