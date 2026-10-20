-- As estatísticas e a forma do perfil, por fila.
--
-- O perfil ganha um filtro "Todas | Aberta | Ranked": as estatísticas (KDA, K/D, ACS, Rangify Score, agentes, mapas,
-- sequências...) e o gráfico de forma passam a poder ser só das partidas de uma fila. Sem o argumento, continuam a
-- juntar as duas filas, como antes.
--
-- Corre depois de 0001 a 0037. Pode correr outra vez sem estragar nada.

drop function if exists public.estatisticas_perfil(uuid);
drop function if exists public.forma_perfil(uuid, int);

create or replace function public.estatisticas_perfil(p_perfil uuid, p_fila text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  with minhas as (
    select mp.*, m.winner, m.map, m.finished_at, mp.team = m.winner as ganhou
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null and (p_fila is null or m.fila = p_fila)
  ),
  com as (select * from minhas where acs is not null),
  grupos as (
    select ganhou, sum(case when ganhou then 0 else 1 end) over (order by finished_at) as grupo from minhas
  ),
  ultima as (select ganhou from minhas order by finished_at desc limit 1)
  select jsonb_build_object(
    'partidas', (select count(*) from minhas),
    'vitorias', (select count(*) from minhas where ganhou),
    'kda', (select (sum(kills) + sum(assists))::numeric / greatest(1, sum(deaths)) from com),
    'kd', (select sum(kills)::numeric / greatest(1, sum(deaths)) from com),
    'acs', (select avg(acs) from com),
    'rangifyScore', (select avg(rangify_score) from minhas where rangify_score is not null),
    'melhorRs', (select max(rangify_score) from minhas),
    'killsMedia', (select avg(kills) from com),
    'mortesMedia', (select avg(deaths) from com),
    'assistMedia', (select avg(assists) from com),
    'hsPct', (select avg(hs_pct) from minhas where hs_pct is not null),
    'kastPct', (select avg(kast_pct) from minhas where kast_pct is not null),
    'tradesMedia', (select avg(trades) from minhas where trades is not null),
    'fbMedia', (select avg(first_bloods) from com),
    'mvps', (select count(*) from minhas where mvp),
    'firstBloods', (select coalesce(sum(first_bloods), 0) from minhas),
    'melhorAcs', (select max(acs) from com),
    'maisKills', (select max(kills) from com),
    'melhorSequencia', (select coalesce(max(c), 0) from (select count(*) as c from grupos where ganhou group by grupo) t),
    -- Positivo: vitórias seguidas desde a última derrota; negativo: derrotas desde a última vitória.
    'sequenciaAtual', coalesce((
      select case when u.ganhou
        then (select count(*) from minhas where ganhou and finished_at > coalesce((select max(finished_at) from minhas where not ganhou), '-infinity'))
        else -(select count(*) from minhas where not ganhou and finished_at > coalesce((select max(finished_at) from minhas where ganhou), '-infinity'))
      end from ultima u), 0),
    'capitao', jsonb_build_object(
      'partidas', (select count(*) from minhas where is_captain),
      'vitorias', (select count(*) from minhas where is_captain and ganhou)
    ),
    'porMapa', coalesce((
      select jsonb_agg(jsonb_build_object('mapa', map, 'partidas', n, 'vitorias', v, 'acs', a, 'rs', rs) order by n desc, map)
      from (select map, count(*) as n, count(*) filter (where ganhou) as v, avg(acs) as a, avg(rangify_score) as rs from minhas group by map) x
    ), '[]'::jsonb),
    'porAgente', coalesce((
      select jsonb_agg(jsonb_build_object('agente', agent, 'partidas', n, 'vitorias', v, 'acs', a, 'rs', rs) order by n desc, agent)
      from (select agent, count(*) as n, count(*) filter (where ganhou) as v, avg(acs) as a, avg(rangify_score) as rs
            from minhas where agent is not null group by agent) x
    ), '[]'::jsonb),
    'posicao', posicao(p_perfil),
    'totalJogadores', total_tabela('aberta'),
    'posicaoRanked', posicao(p_perfil, 'ranked'),
    'totalRanked', total_tabela('ranked')
  )
$$;

create or replace function public.forma_perfil(p_perfil uuid, p_n int default 20, p_fila text default null) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.fin), '[]'::jsonb) from (
    select m.finished_at as fin, jsonb_build_object(
      'partidaId', m.id, 'data', m.finished_at, 'mapa', m.map, 'fila', m.fila,
      'adversario', 'Equipa ' || (select _nome(p) from profiles p where p.id = case when mp.team = 'A' then m.captain_b else m.captain_a end),
      'venceu', mp.team = m.winner,
      'resultado', case when mp.team = 'A' then m.score_a || '-' || m.score_b else m.score_b || '-' || m.score_a end,
      'pontos', mp.points_after, 'delta', mp.points_delta,
      'kda', case when mp.kills is not null then (mp.kills + mp.assists)::numeric / greatest(1, mp.deaths) end,
      'acs', mp.acs,
      'rs', mp.rangify_score,
      'mvp', mp.mvp
    ) as j
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null and (p_fila is null or m.fila = p_fila)
    order by m.finished_at desc limit least(50, greatest(1, p_n))
  ) x
$$;

grant execute on function public.estatisticas_perfil(uuid, text), public.forma_perfil(uuid, int, text) to authenticated;
