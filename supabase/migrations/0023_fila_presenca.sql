-- Fechar o separador ou o browser tira a pessoa da fila.
--
-- O site avisa o servidor quando o separador fecha (pedido "keepalive" ao sair), mas há
-- casos em que esse aviso não chega: o browser rebenta, o portátil adormece, a ligação cai.
-- Por isso, quem está na fila também dá sinal de vida de 30 em 30 segundos (fila_batimento)
-- e quem passa 3 minutos sem dar sinal é tirado da fila. Isto também impede de formar uma
-- partida com alguém que já saiu há muito tempo.
--
-- O sinal de vida vive numa tabela à parte (fila_presenca), fora do Realtime, para os batimentos
-- não acordarem toda a gente a cada 30 segundos.
--
-- Corre depois de 0001 a 0022. Pode correr outra vez sem estragar nada.

create table if not exists public.fila_presenca (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  visto timestamptz not null default now()
);
alter table public.fila_presenca enable row level security;

-- Quem já está na fila quando isto corre começa a contar a partir de agora.
insert into public.fila_presenca (profile_id)
select profile_id from public.queue_entries
on conflict (profile_id) do nothing;

-- Entrar na fila (por qualquer caminho) começa o relógio; sair apaga-o.
create or replace function public._tg_fila_presenca() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    delete from fila_presenca where profile_id = old.profile_id;
  else
    insert into fila_presenca (profile_id, visto) values (new.profile_id, now())
    on conflict (profile_id) do update set visto = excluded.visto;
  end if;
  return null;
end $$;

drop trigger if exists fila_presenca on public.queue_entries;
create trigger fila_presenca after insert or delete on public.queue_entries
for each row execute function public._tg_fila_presenca();

/** Tira da fila quem está há mais de 3 minutos sem dar sinal (os bots de teste não dão, ficam). */
create or replace function public._limpar_fila() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  with apagados as (
    delete from queue_entries q
    using fila_presenca f
    where f.profile_id = q.profile_id
      and f.visto < now() - interval '3 minutes'
      and not exists (select 1 from profiles p where p.id = q.profile_id and p.is_bot)
    returning 1
  )
  select count(*)::int into n from apagados;
  return n;
end $$;

/** O site chama isto de 30 em 30 segundos enquanto a pessoa está na fila. */
create or replace function public.fila_batimento() returns void
language plpgsql security definer set search_path = public as $$
declare me profiles := _eu();
begin
  update fila_presenca set visto = now() where profile_id = me.id;
  perform _limpar_fila();
end $$;

-- Antes de formar uma partida, quem já saiu não conta.
create or replace function public._emparelhar(p_region text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  perform pg_advisory_xact_lock(hashtext('rangify:fila:' || p_region));
  perform _limpar_fila();
  select array_agg(profile_id) into v_ids from (
    select profile_id from queue_entries where region = p_region order by joined_at limit 10
  ) q;
  if coalesce(array_length(v_ids, 1), 0) < 10 then return null; end if;
  return _criar_partida(v_ids, p_region, false, false, null);
end $$;

-- A cada minuto, mesmo que ninguém esteja a dar sinal (o contador do Discord fica certo).
-- Precisa da extensão pg_cron; se o projeto não a tiver, o resto funciona na mesma.
do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('rangify-limpar-fila', '* * * * *', 'select public._limpar_fila()');
exception when others then
  raise notice 'pg_cron indisponível: a fila só é limpa quando alguém dá sinal ou entra.';
end $$;

revoke all on function public._tg_fila_presenca(), public._limpar_fila(), public._emparelhar(text) from public, anon, authenticated;
grant execute on function public._tg_fila_presenca(), public._limpar_fila(), public._emparelhar(text) to service_role;
grant execute on function public.fila_batimento() to authenticated;
