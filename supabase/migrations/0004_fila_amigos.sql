-- =============================================================================
-- Rangify: testar a fila com amigos. Um Owner ou Dev na fila carrega em
-- "Completar fila com bots": entra numa partida com os amigos dele que também
-- estão na fila (mesma região) e o resto dos 10 lugares é preenchido com bots.
-- Estranhos que estejam na fila nunca entram, e a partida fica marcada como
-- simulada, por isso não mexe nos pontos de ninguém.
-- =============================================================================

create function public.dev_completar_fila(p_ser_capitao boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  v_ids uuid[];
  v_faltam int;
begin
  me := _exigir_dev();
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  perform pg_advisory_xact_lock(hashtext('rangify:fila:' || me.region));

  -- Tu e, por ordem de chegada, os teus amigos que estão na fila da mesma região (no máximo 9).
  select array_agg(id order by ordem) into v_ids from (
    select me.id as id, 0 as ordem
    union all
    select * from (
      select q.profile_id, row_number() over (order by q.joined_at)
      from queue_entries q
      join friends f on f.status = 'accepted'
        and ((f.requester = me.id and f.addressee = q.profile_id) or (f.addressee = me.id and f.requester = q.profile_id))
      join profiles p on p.id = q.profile_id
      where q.region = me.region and q.profile_id <> me.id and not p.is_bot and _partida_ativa(q.profile_id) is null
      order by q.joined_at
      limit 9
    ) amigos
  ) t;

  v_faltam := 10 - coalesce(array_length(v_ids, 1), 0);
  if v_faltam > 0 then v_ids := v_ids || _bots_livres(v_faltam, me.region); end if;

  perform _criar_partida(v_ids, me.region, true, false, case when p_ser_capitao then me.id end);
end $$;
