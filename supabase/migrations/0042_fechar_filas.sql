-- Fechar a fila aberta ou a ranked: um interruptor de emergência para Owner e Dev.
--
-- Com uma fila fechada:
--   * ninguém entra nela (entrar_fila recusa, com o motivo se houver);
--   * quem estava à espera nela sai (as partidas já formadas continuam e acabam normalmente);
--   * não se formam partidas novas nessa fila, e quem aceitou uma partida que caiu não volta a uma fila fechada.
-- O estado das filas (estado_fila) passa a dizer se cada uma está fechada, para o site mostrar o aviso.
-- As ferramentas de teste (dev_encher_fila, que cria partidas com bots) continuam a funcionar.
--
-- Corre depois de 0001 a 0041. Pode correr outra vez sem estragar nada.

alter table public.config add column if not exists fila_aberta_fechada boolean not null default false;
alter table public.config add column if not exists fila_ranked_fechada boolean not null default false;
alter table public.config add column if not exists filas_fechadas_motivo text;

/** Esta fila está fechada? */
create or replace function public._fila_fechada(p_fila text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select case when p_fila = 'ranked' then fila_ranked_fechada else fila_aberta_fechada end from config where id), false)
$$;

/** Fecha ou abre uma fila (só Owner e Dev). Ao fechar, tira quem estava à espera nela. */
create or replace function public.definir_fila_fechada(p_fila text, p_fechada boolean, p_motivo text default null) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  me profiles := _exigir_owner_dev();
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  perform _fila_valida(p_fila);
  if length(v_motivo) > 140 then raise exception 'O motivo tem no máximo 140 caracteres.'; end if;
  if coalesce(p_fechada, false) then
    update config set
      fila_aberta_fechada = fila_aberta_fechada or p_fila = 'aberta',
      fila_ranked_fechada = fila_ranked_fechada or p_fila = 'ranked',
      filas_fechadas_motivo = coalesce(v_motivo, filas_fechadas_motivo),
      updated_at = now(), updated_by = me.id
    where id;
    delete from queue_entries where fila = p_fila;
  else
    update config set
      fila_aberta_fechada = fila_aberta_fechada and p_fila <> 'aberta',
      fila_ranked_fechada = fila_ranked_fechada and p_fila <> 'ranked',
      updated_at = now(), updated_by = me.id
    where id;
    -- Com as duas abertas, o motivo já não faz sentido.
    update config set filas_fechadas_motivo = null where id and not fila_aberta_fechada and not fila_ranked_fechada;
  end if;
  return (select jsonb_build_object('aberta', fila_aberta_fechada, 'ranked', fila_ranked_fechada, 'motivo', filas_fechadas_motivo) from config where id);
end $$;

-- ---------------------------------------------------------------- estado da fila

create or replace function public.estado_fila() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles;
  q queue_entries;
  v_fila text;
begin
  me := _eu();
  select * into q from queue_entries where profile_id = me.id;
  v_fila := coalesce(q.fila, 'aberta');
  return jsonb_build_object(
    'naFila', q.profile_id is not null,
    'fila', case when q.profile_id is not null then q.fila end,
    'desde', q.joined_at,
    'contagem', (select count(*) from queue_entries where region = me.region and fila = v_fila),
    'contagemAberta', (select count(*) from queue_entries where region = me.region and fila = 'aberta'),
    'contagemRanked', (select count(*) from queue_entries where region = me.region and fila = 'ranked'),
    'rankedPermitido', _pode_ranked(me),
    'regiao', me.region,
    'cooldownAte', case when me.cooldown_until > now() then me.cooldown_until end,
    'agora', now(),
    'ban', _ban_json(me),
    'filasFechadas', (select jsonb_build_object('aberta', c.fila_aberta_fechada, 'ranked', c.fila_ranked_fechada, 'motivo', c.filas_fechadas_motivo) from config c where c.id)
  );
end $$;

-- ---------------------------------------------------------------- entrar e formar partidas

create or replace function public.entrar_fila(p_fila text default 'aberta') returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  q queue_entries;
begin
  me := _eu();
  perform _fila_valida(p_fila);
  if _fila_fechada(p_fila) then
    raise exception 'A fila % está fechada de momento.%', case when p_fila = 'ranked' then 'ranked' else 'aberta' end,
      coalesce(' ' || (select filas_fechadas_motivo from config where id), '');
  end if;
  if _ban_ativo(me) then
    raise exception 'Estás banido da fila %. Motivo: %',
      case when me.queue_banned_until is null then 'para sempre'
           else 'até ' || to_char(me.queue_banned_until at time zone 'Europe/Lisbon', 'DD/MM/YYYY HH24:MI') end,
      coalesce((select a.message from staff_avisos a where a.target_id = me.id and a.kind = 'ban' and a.revoked_at is null order by a.created_at desc limit 1), '—');
  end if;
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if me.cooldown_until > now() then raise exception 'Ainda estás de castigo por não aceitares uma partida.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  if coalesce((select discord_required from config where id), false)
     and not (coalesce(me.discord_member, false) and me.discord_checked_at > now() - interval '30 minutes') then
    raise exception 'Entra no servidor de Discord do Rangify para poderes entrar na fila.';
  end if;
  if p_fila = 'ranked' and not _pode_ranked(me) then
    raise exception 'A fila ranked é só para Ascendente 1 ou mais.';
  end if;
  -- Uma fila de cada vez: quem já está noutra tem de sair primeiro.
  select * into q from queue_entries where profile_id = me.id;
  if found then
    if q.fila = p_fila then perform _emparelhar(me.region, p_fila); return; end if;
    raise exception 'Já estás na fila %. Sai dela para entrares na outra.', case when q.fila = 'ranked' then 'ranked' else 'aberta' end;
  end if;
  insert into queue_entries (profile_id, region, fila) values (me.id, me.region, p_fila) on conflict do nothing;
  perform _emparelhar(me.region, p_fila);
end $$;

create or replace function public._emparelhar(p_region text, p_fila text default 'aberta') returns uuid
language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  -- Fila fechada: não se formam partidas novas.
  if _fila_fechada(p_fila) then return null; end if;
  perform pg_advisory_xact_lock(hashtext('rangify:fila:' || p_region || ':' || p_fila));
  perform _limpar_fila();
  select array_agg(profile_id) into v_ids from (
    select profile_id from queue_entries where region = p_region and fila = p_fila order by joined_at limit 10
  ) q;
  if coalesce(array_length(v_ids, 1), 0) < 10 then return null; end if;
  return _criar_partida(v_ids, p_region, false, false, null, p_fila);
end $$;

create or replace function public._falhou_confirmacao(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  update profiles set cooldown_until = now() + interval '5 minutes'
  where not is_bot and id in (select profile_id from match_players where match_id = p_match and not accepted);
  -- Quem aceitou volta à fila da partida (aberta ou ranked) com o lugar que tinha, se ela ainda estiver aberta
  -- (as simulações não voltam).
  if not m.simulated and not _fila_fechada(m.fila) then
    insert into queue_entries (profile_id, region, joined_at, fila)
    select mp.profile_id, m.region, coalesce(mp.queued_since, now()), m.fila
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.accepted and not p.is_bot
    on conflict do nothing;
  end if;
  update matches set state = 'CANCELLED', finished_at = now(), phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
  if not m.simulated then perform _emparelhar(m.region, m.fila); end if;
end $$;

revoke all on function public._fila_fechada(text) from public, anon, authenticated;
grant execute on function public._fila_fechada(text) to service_role;
revoke all on function public.definir_fila_fechada(text, boolean, text) from public, anon;
grant execute on function public.definir_fila_fechada(text, boolean, text) to authenticated, service_role;
