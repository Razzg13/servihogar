-- ============================================================
-- ServiHogar — esquema de base de datos para Supabase (Postgres)
-- Cómo usarlo: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- → pegar todo este archivo → Run.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------------- PROFILES (1:1 con auth.users) ----------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('cliente','trabajador','admin')),
  nombre text not null,
  correo text not null,
  estado text not null default 'activo' check (estado in ('activo','bloqueado')),
  favoritos uuid[] not null default '{}',
  categoria text,
  tarifa integer,
  experiencia integer,
  zona text,
  servicios text[] not null default '{}',
  verificado boolean not null default false,
  verificacion_pendiente boolean not null default false,
  disponibilidad jsonb,
  created_at timestamptz not null default now()
);

-- ---------------- RESENAS ----------------
create table public.resenas (
  id bigint generated always as identity primary key,
  worker_id uuid not null references public.profiles(id) on delete cascade,
  cliente_nombre text not null,
  estrellas smallint not null check (estrellas between 1 and 5),
  comentario text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------- CITAS ----------------
create table public.citas (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.profiles(id) on delete cascade,
  trabajador_id uuid not null references public.profiles(id) on delete cascade,
  fecha text not null,
  hora text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','aceptada','rechazada','completada')),
  pago text not null default 'pendiente' check (pago in ('pendiente','pagado')),
  calificacion jsonb,
  created_at timestamptz not null default now()
);

-- ---------------- MENSAJES (chat por cita) ----------------
create table public.mensajes (
  id bigint generated always as identity primary key,
  cita_id uuid not null references public.citas(id) on delete cascade,
  de uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  created_at timestamptz not null default now()
);

-- ---------------- REPORTES ----------------
create table public.reportes (
  id bigint generated always as identity primary key,
  cita_id uuid not null references public.citas(id) on delete cascade,
  de_nombre text not null,
  motivo text not null,
  estado text not null default 'abierto' check (estado in ('abierto','resuelto')),
  created_at timestamptz not null default now()
);

-- ---------------- NOTIFICACIONES ----------------
create table public.notificaciones (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  texto text not null,
  leida boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Helper: ¿el usuario autenticado es admin?
-- ============================================================
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and tipo = 'admin'
  );
$$;

-- ============================================================
-- Row Level Security
-- ============================================================
alter table public.profiles enable row level security;
alter table public.resenas enable row level security;
alter table public.citas enable row level security;
alter table public.mensajes enable row level security;
alter table public.reportes enable row level security;
alter table public.notificaciones enable row level security;

-- PROFILES: lectura pública (el directorio de trabajadores debe verse sin
-- iniciar sesión), edición solo del dueño o admin, alta solo por el propio
-- usuario al registrarse.
create policy "profiles_select_public" on public.profiles
  for select using (true);
create policy "profiles_insert_self" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_self_or_admin" on public.profiles
  for update using (auth.uid() = id or public.is_admin());

-- RESENAS: lectura pública, inserción por cualquier usuario autenticado
create policy "resenas_select_public" on public.resenas
  for select using (true);
create policy "resenas_insert_auth" on public.resenas
  for insert with check (auth.uid() is not null);

-- CITAS: solo el cliente/trabajador involucrados, o el admin
create policy "citas_select_involucrados" on public.citas
  for select using (auth.uid() = cliente_id or auth.uid() = trabajador_id or public.is_admin());
create policy "citas_insert_cliente" on public.citas
  for insert with check (auth.uid() = cliente_id);
create policy "citas_update_involucrados" on public.citas
  for update using (auth.uid() = cliente_id or auth.uid() = trabajador_id or public.is_admin());
create policy "citas_delete_cliente" on public.citas
  for delete using (auth.uid() = cliente_id);

-- MENSAJES: solo cliente/trabajador de la cita relacionada
create policy "mensajes_select_involucrados" on public.mensajes
  for select using (
    exists (select 1 from public.citas c where c.id = cita_id
      and (c.cliente_id = auth.uid() or c.trabajador_id = auth.uid()))
  );
create policy "mensajes_insert_involucrados" on public.mensajes
  for insert with check (
    de = auth.uid() and exists (select 1 from public.citas c where c.id = cita_id
      and (c.cliente_id = auth.uid() or c.trabajador_id = auth.uid()))
  );

-- REPORTES: el cliente de la cita crea y ve los propios; el admin ve/resuelve todos
create policy "reportes_select_propio_o_admin" on public.reportes
  for select using (
    public.is_admin() or exists (select 1 from public.citas c where c.id = cita_id and c.cliente_id = auth.uid())
  );
create policy "reportes_insert_cliente" on public.reportes
  for insert with check (
    exists (select 1 from public.citas c where c.id = cita_id and c.cliente_id = auth.uid())
  );
create policy "reportes_update_admin" on public.reportes
  for update using (public.is_admin());

-- NOTIFICACIONES: solo el dueño lee/marca como leídas; cualquier usuario
-- autenticado puede crear una notificación para otro (así funciona hoy:
-- quien actúa notifica a la otra persona involucrada).
create policy "notificaciones_select_propio" on public.notificaciones
  for select using (auth.uid() = user_id);
create policy "notificaciones_insert_auth" on public.notificaciones
  for insert with check (auth.uid() is not null);
create policy "notificaciones_update_propio" on public.notificaciones
  for update using (auth.uid() = user_id);
