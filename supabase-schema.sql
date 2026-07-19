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
  codigo_publico text unique,              -- código corto para la URL del NFC
  fecha         timestamptz default now()
);

-- Si la tabla ya existía, agregar la columna
alter table public.cuentas add column if not exists codigo_publico text unique;

-- Hasta 3 patentes por cuenta (el vehículo 1 se mantiene también en `patente`
-- para compatibilidad con lo ya existente). patentes[1]=vehículo 1, etc.
alter table public.cuentas add column if not exists patentes text[] default '{}';

-- Datos bancarios del comerciante (para recibir transferencias al escanear NFC).
-- Se muestran públicamente sólo cuando el visitante toca "Mostrar datos para transferir".
alter table public.cuentas add column if not exists banco                text;
alter table public.cuentas add column if not exists titular_cuenta       text;
alter table public.cuentas add column if not exists tipo_cuenta          text;   -- 'Cuenta Vista' | 'Cuenta Corriente' | 'Cuenta RUT' | 'Cuenta Ahorro'
alter table public.cuentas add column if not exists numero_cuenta        text;
alter table public.cuentas add column if not exists email_transferencia  text;

-- Perfil que se abre primero al escanear el NFC. Uno de:
--   'comerciante' | 'conductor' | 'guardia' | 'empresa'
-- Si es NULL o el perfil elegido no está activo, cae al orden por defecto.
alter table public.cuentas add column if not exists perfil_principal    text;

-- Trigger: auto-generar codigo_publico en cada insert si viene NULL
create or replace function public.generar_codigo_publico() returns trigger
  language plpgsql as $$
declare c text;
begin
  if new.codigo_publico is null then
    loop
      c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      exit when not exists (select 1 from public.cuentas where codigo_publico = c);
    end loop;
    new.codigo_publico := c;
  end if;
  return new;
end;
$$;
drop trigger if exists tg_generar_codigo on public.cuentas;
create trigger tg_generar_codigo before insert on public.cuentas
  for each row execute function public.generar_codigo_publico();

-- Rellenar codigo_publico en filas que ya existen sin él
update public.cuentas
   set codigo_publico = upper(substr(md5(random()::text || id::text), 1, 8))
 where codigo_publico is null;

-- (La función pública `verificar_publico` se define más abajo, DESPUÉS
--  de que la tabla `documentos` y todos sus `alter table add column`
--  se hayan ejecutado — así no falla en ejecuciones limpias.)

-- Hacer PÚBLICO el bucket documentos para que las URLs funcionen sin token
update storage.buckets set public = true where id = 'documentos';

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

-- Migración: fecha de vencimiento del documento (para avisos por correo)
alter table public.documentos add column if not exists vence date;

-- Migración: último "hito" de aviso enviado (30, 15, 7, 1, 0, -1=vencido).
-- Se usa para no volver a mandar el mismo correo dos veces.
alter table public.documentos add column if not exists notif_hito integer;

-- Migración: posición manual del documento dentro de su perfil (particular,
-- comerciante, empresa). Menor = arriba. NULL = mantener orden por defecto.
alter table public.documentos add column if not exists orden integer;

create index if not exists documentos_cuenta_idx on public.documentos (cuenta_id);
create index if not exists documentos_vence_idx  on public.documentos (vence)
  where vence is not null;

-- Función pública: leer datos verificables por codigo_publico SIN autenticación.
-- Se define AQUÍ (no arriba con `cuentas`) porque referencia columnas de
-- `documentos` — entre ellas `d.orden`, que se agrega mediante `alter table
-- add column if not exists` justo arriba. Postgres valida las columnas al
-- momento de CREATE FUNCTION, así que la definimos después.
create or replace function public.verificar_publico(codigo text)
returns json language sql stable security definer set search_path = public as $$
  select json_build_object(
    'nombre',    c.nombre,
    'rut',       c.rut,
    'perfiles',  c.perfiles,
    'tema',      c.tema,
    'patente',   c.patente,
    'patentes',  c.patentes,
    'estado',    c.estado,
    'codigo',    c.codigo_publico,
    'banco',               c.banco,
    'titular_cuenta',      c.titular_cuenta,
    'tipo_cuenta',         c.tipo_cuenta,
    'numero_cuenta',       c.numero_cuenta,
    'email_transferencia', c.email_transferencia,
    'perfil_principal',    c.perfil_principal,
    'documentos', coalesce(
      (select json_agg(json_build_object(
         'tipo',   d.tipo,
         'titulo', d.titulo,
         'nombre', d.nombre,
         'path',   d.path,
         'vence',  d.vence,
         'orden',  d.orden
       ) order by d.orden nulls last, d.tipo)
       from public.documentos d
       where d.cuenta_id = c.id and d.path <> ''), '[]'::json)
  )
  from public.cuentas c
  where c.codigo_publico = codigo
  limit 1;
$$;
grant execute on function public.verificar_publico(text) to anon, authenticated;

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
  for insert with check (auth.uid() = id or public.es_admin_actual());

drop policy if exists "cuentas_update_propia" on public.cuentas;
create policy "cuentas_update_propia" on public.cuentas
  for update using (auth.uid() = id or public.es_admin_actual());

drop policy if exists "cuentas_delete_admin" on public.cuentas;
create policy "cuentas_delete_admin" on public.cuentas
  for delete using (public.es_admin_actual());

-- Documentos: el usuario ve/edita los suyos; admin puede editar/borrar todo
drop policy if exists "documentos_select_propia" on public.documentos;
create policy "documentos_select_propia" on public.documentos
  for select using (auth.uid() = cuenta_id);

drop policy if exists "documentos_insert_propia" on public.documentos;
create policy "documentos_insert_propia" on public.documentos
  for insert with check (auth.uid() = cuenta_id or public.es_admin_actual());

drop policy if exists "documentos_update_propia" on public.documentos;
create policy "documentos_update_propia" on public.documentos
  for update using (auth.uid() = cuenta_id or public.es_admin_actual());

drop policy if exists "documentos_delete_propia" on public.documentos;
create policy "documentos_delete_propia" on public.documentos
  for delete using (auth.uid() = cuenta_id or public.es_admin_actual());

-- ------------------------------------------------------------
-- 3b) Tabla PUSH_SUBSCRIPTIONS
--     Guarda las suscripciones Web Push del usuario (una por
--     navegador/dispositivo). notificar-vencimientos.js las lee
--     con la service_role key para enviar avisos al celular.
-- ------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  cuenta_id  uuid not null references public.cuentas(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  fecha      timestamptz default now()
);

create index if not exists push_subs_cuenta_idx on public.push_subscriptions (cuenta_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "push_select_propia" on public.push_subscriptions;
create policy "push_select_propia" on public.push_subscriptions
  for select using (auth.uid() = cuenta_id or public.es_admin_actual());

drop policy if exists "push_insert_propia" on public.push_subscriptions;
create policy "push_insert_propia" on public.push_subscriptions
  for insert with check (auth.uid() = cuenta_id);

drop policy if exists "push_delete_propia" on public.push_subscriptions;
create policy "push_delete_propia" on public.push_subscriptions
  for delete using (auth.uid() = cuenta_id or public.es_admin_actual());

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
    and (auth.uid()::text = (storage.foldername(name))[1] or public.es_admin_actual())
  );

drop policy if exists "docs_insert_propio" on storage.objects;
create policy "docs_insert_propio" on storage.objects
  for insert with check (
    bucket_id = 'documentos'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.es_admin_actual())
  );

drop policy if exists "docs_update_propio" on storage.objects;
create policy "docs_update_propio" on storage.objects
  for update using (
    bucket_id = 'documentos'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.es_admin_actual())
  );

drop policy if exists "docs_delete_propio" on storage.objects;
create policy "docs_delete_propio" on storage.objects
  for delete using (
    bucket_id = 'documentos'
    and (auth.uid()::text = (storage.foldername(name))[1] or public.es_admin_actual())
  );

-- ------------------------------------------------------------
-- 5) Tabla CHAT_MENSAJES
--    Guarda los mensajes enviados desde el widget de chat del sitio.
-- ------------------------------------------------------------
create table if not exists public.chat_mensajes (
  id        uuid primary key default gen_random_uuid(),
  nombre    text,
  telefono  text,
  email     text,
  mensaje   text not null,
  respuesta text,
  leido     boolean default false,
  fecha     timestamptz default now()
);
-- Si la tabla ya existía sin la columna, agregarla:
alter table public.chat_mensajes add column if not exists telefono text;

create index if not exists chat_mensajes_fecha_idx on public.chat_mensajes (fecha desc);

-- Solo el admin puede ver los mensajes de chat (nadie más los necesita)
alter table public.chat_mensajes enable row level security;

drop policy if exists "chat_select_admin" on public.chat_mensajes;
create policy "chat_select_admin" on public.chat_mensajes
  for select using (public.es_admin_actual());

drop policy if exists "chat_insert_anon" on public.chat_mensajes;
create policy "chat_insert_anon" on public.chat_mensajes
  for insert with check (true);  -- cualquiera puede insertar (visitantes)
