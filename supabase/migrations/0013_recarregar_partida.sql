-- =============================================================================
-- Rangify: recarregar os dados de uma partida já jogada (Owner e Dev).
--
-- Serve para as partidas fechadas antes do Rangify Score e dos agentes (0012),
-- ou quando a API trouxe dados incompletos:
-- * numa partida real, a Edge Function recarregar-partida volta a ler o jogo na
--   Henrik Dev API e chama _recalcular com as estatísticas novas (agentes incluídos);
-- * numa partida de teste, recalcular_partida usa as estatísticas que já tem e
--   dá agentes aos jogadores que ainda não os têm.
-- Em ambos os casos o RS, o MVP e os pontos são refeitos com a fórmula de agora.
-- Cada jogador recebe só a diferença entre os pontos novos e os que a partida
-- já lhe tinha dado. O resultado e o vencedor não mudam.
--
-- Também traz a tabela do Rangify Score (ranking_rs).
--
-- Corre depois de 0001 a 0012. Pode correr outra vez sem estragar nada.
-- =============================================================================

create or replace function public._recalcular(p_match uuid, p_stats jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_delta int;
  v_perf int;
  v_dif int;
  v_off int := floor(random() * 8)::int;
  v_lista jsonb := '[]'::jsonb;
begin
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state <> 'COMPLETED' then raise exception 'Só se recarregam partidas terminadas.'; end if;

  if p_stats is not null then
    update match_players mp set
      kills = coalesce((s ->> 'kills')::int, mp.kills), deaths = coalesce((s ->> 'deaths')::int, mp.deaths),
      assists = coalesce((s ->> 'assists')::int, mp.assists), acs = coalesce((s ->> 'acs')::int, mp.acs),
      first_bloods = coalesce((s ->> 'firstBloods')::int, mp.first_bloods), trades = coalesce((s ->> 'trades')::int, mp.trades),
      hs_pct = coalesce((s ->> 'hsPct')::int, mp.hs_pct), kast_pct = coalesce((s ->> 'kastPct')::int, mp.kast_pct),
      agent = coalesce(nullif(s ->> 'agente', ''), mp.agent)
    from jsonb_array_elements(p_stats) s
    where mp.match_id = p_match and mp.profile_id = (s ->> 'perfilId')::uuid;
    update matches set has_stats = true where id = p_match;
  end if;

  -- As partidas de teste não têm API: quem não tem agente recebe um da sua função.
  if m.simulated then
    update match_players mp set agent = x.agente
    from (
      select o.profile_id,
        _agente_simulado(p.game_role, v_off + (row_number() over (partition by o.team, p.game_role order by random()))::int) as agente
      from match_players o join profiles p on p.id = o.profile_id
      where o.match_id = p_match and o.team is not null and o.agent is null
    ) x
    where mp.match_id = p_match and mp.profile_id = x.profile_id;
  end if;

  perform _rangify_scores(p_match, coalesce(m.score_a, 0) + coalesce(m.score_b, 0));
  update match_players set mvp = false where match_id = p_match;
  update match_players set mvp = true where match_id = p_match and profile_id = (
    select profile_id from match_players where match_id = p_match and rangify_score is not null
    order by rangify_score desc, acs desc limit 1
  );

  for r in
    select mp.profile_id, mp.team, mp.tier_snapshot, mp.rangify_score, mp.points_delta, mp.agent, _nome(p) as nome
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.team is not null
  loop
    v_perf := _bonus_desempenho(r.rangify_score);
    v_delta := _pontos(
      r.tier_snapshot,
      array(select tier_snapshot from match_players where match_id = p_match and team is not null and team <> r.team),
      r.team = m.winner
    ) + v_perf;
    v_dif := v_delta - coalesce(r.points_delta, 0);
    -- Só mexe no perfil se esta partida já lhe tinha dado pontos.
    if m.points_applied and v_dif <> 0 then
      update profiles set points = points + v_dif where id = r.profile_id;
    end if;
    update match_players set points_delta = v_delta,
      points_perf = case when r.rangify_score is not null then v_perf end,
      points_after = case when points_after is not null then points_after + v_dif end
    where match_id = p_match and profile_id = r.profile_id;
    v_lista := v_lista || jsonb_build_object('nome', r.nome, 'antes', r.points_delta, 'depois', v_delta,
      'rangifyScore', r.rangify_score, 'agente', (select agent from match_players where match_id = p_match and profile_id = r.profile_id));
    perform _atualizar_missoes(r.profile_id, true);
  end loop;

  update matches set updated_at = now() where id = p_match;
  return jsonb_build_object('codigo', m.code, 'jogadores', v_lista);
end $$;

/** Owner e Dev: refaz o RS, o MVP e os pontos de uma partida de teste com o que ela já tem. */
create or replace function public.recalcular_partida(p_match uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  perform _exigir_owner_dev();
  select * into m from matches where id = p_match;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if not m.simulated then raise exception 'Numa partida real, os dados vêm outra vez da Henrik Dev API: usa Recarregar dados.'; end if;
  return _recalcular(p_match, null);
end $$;

revoke all on function public._recalcular(uuid, jsonb) from public, anon, authenticated;
grant execute on function public._recalcular(uuid, jsonb) to service_role;
grant execute on function public.recalcular_partida(uuid) to authenticated;

-- ------------------------------------------------------------ Tabela do Rangify Score
-- Ordenada pela média de RS. Entra quem tem pelo menos p_minimo partidas com RS (por
-- defeito, uma). "eu" traz o próprio
-- jogador mesmo que ainda não tenha partidas suficientes.
create or replace function public.ranking_rs(p_limite int default 50, p_minimo int default 1) returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select p.id, avg(mp.rangify_score) as media, max(mp.rangify_score) as melhor, count(*) as n
    from match_players mp
    join matches m on m.id = mp.match_id
    join profiles p on p.id = mp.profile_id
    where m.state = 'COMPLETED' and mp.team is not null and mp.rangify_score is not null
      and not p.is_bot and p.riot_id is not null
    group by p.id
  ),
  ord as (
    select b.*, row_number() over (order by b.media desc, b.n desc, p.points desc, p.username) as pos
    from base b join profiles p on p.id = b.id
    where b.n >= greatest(1, p_minimo)
  )
  select jsonb_build_object(
    'minimo', greatest(1, p_minimo),
    'linhas', coalesce((
      select jsonb_agg(jsonb_build_object('posicao', o.pos, 'perfil', _perfil_json(p), 'media', round(o.media, 1), 'melhor', o.melhor, 'partidas', o.n) order by o.pos)
      from ord o join profiles p on p.id = o.id
      where o.pos <= least(100, greatest(1, p_limite))
    ), '[]'::jsonb),
    'eu', (
      select jsonb_build_object('posicao', (select o.pos from ord o where o.id = b.id), 'media', round(b.media, 1), 'melhor', b.melhor, 'partidas', b.n)
      from base b where b.id = eu()
    )
  )
$$;

grant execute on function public.ranking_rs(int, int) to authenticated;
