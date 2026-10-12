-- ============================================================
-- Hogandia — migración 027: pedir cotización a varios trabajadores a la vez
-- Ejecutar en: Supabase Dashboard → tu proyecto → SQL Editor → New query
-- ============================================================
--
-- Hasta ahora, para comparar precios el cliente tenía que entrar perfil por
-- perfil y escribirle a cada trabajador (o usar el comparador, que solo sirve
-- si ya eligió a quiénes comparar). Esto agrega el flujo inverso, al estilo
-- Thumbtack: el cliente describe el trabajo UNA vez y los trabajadores de esa
-- categoría pueden responder con su precio, sin que el cliente tenga que
-- buscarlos uno por uno.
--
-- Las cotizaciones de cada trabajador son privadas entre ese trabajador y el
-- cliente (no se ven entre trabajadores competidores) — mismo criterio que
-- usan las plataformas de referencia.
--
-- Idempotente: se puede correr varias veces sin problema.

create table if not exists public.solicitudes_cotizacion (
  id uuid primary key default gen_random_uuid(),
  cliente_id uuid not null references public.profiles(id) on delete cascade,
  categoria text not null,
  descripcion text not null,
  zona text,
  urgencia text not null default 'flexible' check (urgencia in ('hoy','esta_semana','flexible')),
  estado text not null default 'abierta' check (estado in ('abierta','cerrada')),
  created_at timestamptz not null default now()
);

create table if not exists public.cotizaciones (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.solicitudes_cotizacion(id) on delete cascade,
  trabajador_id uuid not null references public.profiles(id) on delete cascade,
  mensaje text,
  precio_estimado numeric,
  created_at timestamptz not null default now(),
  unique (solicitud_id, trabajador_id)
);

create index if not exists solicitudes_cotizacion_categoria_idx on public.solicitudes_cotizacion (categoria) where estado = 'abierta';
create index if not exists solicitudes_cotizacion_cliente_idx on public.solicitudes_cotizacion (cliente_id);
create index if not exists cotizaciones_solicitud_idx on public.cotizaciones (solicitud_id);
create index if not exists cotizaciones_trabajador_idx on public.cotizaciones (trabajador_id);

alter table public.solicitudes_cotizacion enable row level security;
alter table public.cotizaciones enable row level security;

-- SOLICITUDES: el dueño ve la propia (en cualquier estado); cualquier otro
-- usuario logueado puede ver las que están abiertas (así los trabajadores las
-- descubren sin tener que ser de la misma categoría a nivel de política —
-- el filtro por categoría lo hace el front, igual que ya hace con Buscar).
drop policy if exists "solicitudes_select_propia_o_abierta" on public.solicitudes_cotizacion;
create policy "solicitudes_select_propia_o_abierta" on public.solicitudes_cotizacion
  for select using (auth.uid() = cliente_id or estado = 'abierta' or public.is_admin());
drop policy if exists "solicitudes_insert_cliente" on public.solicitudes_cotizacion;
create policy "solicitudes_insert_cliente" on public.solicitudes_cotizacion
  for insert with check (auth.uid() = cliente_id);
drop policy if exists "solicitudes_update_propia" on public.solicitudes_cotizacion;
create policy "solicitudes_update_propia" on public.solicitudes_cotizacion
  for update using (auth.uid() = cliente_id or public.is_admin());

-- COTIZACIONES: el trabajador ve las suyas; el cliente ve todas las de su
-- propia solicitud (para compararlas); nadie ve las cotizaciones de otro
-- trabajador en la misma solicitud.
drop policy if exists "cotizaciones_select_propia" on public.cotizaciones;
create policy "cotizaciones_select_propia" on public.cotizaciones
  for select using (
    auth.uid() = trabajador_id
    or exists (select 1 from public.solicitudes_cotizacion sc where sc.id = solicitud_id and sc.cliente_id = auth.uid())
    or public.is_admin()
  );
drop policy if exists "cotizaciones_insert_trabajador" on public.cotizaciones;
create policy "cotizaciones_insert_trabajador" on public.cotizaciones
  for insert with check (
    auth.uid() = trabajador_id
    and exists (select 1 from public.solicitudes_cotizacion sc where sc.id = solicitud_id and sc.estado = 'abierta')
  );

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cotizaciones'
  ) then
    alter publication supabase_realtime add table public.cotizaciones;
  end if;
end $$;
