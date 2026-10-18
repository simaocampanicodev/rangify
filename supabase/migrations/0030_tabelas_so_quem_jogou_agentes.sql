-- As tabelas só mostram quem já jogou, e há uma tabela do melhor jogador de cada agente.
--
--   * Quem criou a conta mas ainda não jogou nenhuma partida não aparece nas tabelas (pontos, nível,
--     amigos), nem conta para "#posição de N jogadores". Entra assim que acaba a primeira partida.
--     Quem ainda não jogou tem posição 0. A tabela do Rangify Score já só tinha quem tem partidas.
--   * ranking_agentes: para cada agente, os melhores jogadores pela média de Rangify Score com esse
--     agente (com um mínimo de partidas à escolha). Só contam partidas acabadas com estatísticas.
--
-- Corre depois de 0001 a 0029. Pode correr outra vez sem estragar nada.

/** Já jogou pelo menos uma partida (as que dão pontos): é o que põe alguém nas tabelas. Bots e contas sem Riot ID nunca entram. */
create or replace function public._na_tabela(p public.profiles) returns boolean
language sql stable as $$
  select not p.is_bot and p.riot_id is not null and p.wins + p.losses > 0
$$;

create or replace function public.ranking(p_offset int default 0, p_limite int default 50, p_so_amigos boolean default false, p_pesquisa text default '')
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me uuid := eu();
  v_q text := replace(replace(lower(coalesce(trim(p_pesquisa), '')), '%', '\%'), '_', '\_');
begin
  return (
    with base as (
      select p.id, row_number() over (order by p.points desc, p.wins desc, p.username) as pos
      from profiles p where _na_tabela(p)
    ),
    filtrado as (
      select b.* from base b join profiles p on p.id = b.id
      where (not p_so_amigos or b.id = me or exists (
          select 1 from friends f where f.status = 'accepted'
            and ((f.requester = me and f.addressee = b.id) or (f.addressee = me and f.requester = b.id))))
        and (v_q = '' or lower(p.riot_id) like '%' || v_q || '%' or p.username like '%' || v_q || '%')
    )
    select jsonb_build_object(
      'total', (select count(*) from filtrado),
      'linhas', coalesce((
        select jsonb_agg(jsonb_build_object('posicao', f.pos, 'perfil', _perfil_json_id(f.id), 'forma', _forma_curta(f.id)) order by f.pos)
        from (select * from filtrado order by pos offset greatest(0, p_offset) limit least(100, greatest(1, p_limite))) f
      ), '[]'::jsonb)
    )
  );
end $$;

/** A posição na tabela de pontos; 0 enquanto o jogador não tiver jogado. */
create or replace function public.posicao(p_perfil uuid) returns int
language sql stable security definer set search_path = public as $$
  select coalesce((
    select pos::int from (
      select p.id, row_number() over (order by p.points desc, p.wins desc, p.username) as pos
      from profiles p where _na_tabela(p)
    ) x where id = p_perfil
  ), 0)
$$;

create or replace function public.estatisticas_perfil(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with minhas as (
    select mp.*, m.winner, m.map, m.finished_at, mp.team = m.winner as ganhou
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null
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
    'totalJogadores', (select count(*) from profiles p where _na_tabela(p))
  )
$$;

/** XP, nível e lugar no ranking de nível (o próprio, ou de outro jogador); lugar 0 enquanto não tiver jogado. */
create or replace function public.experiencia(p_perfil uuid default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_id uuid := coalesce(p_perfil, eu());
  v_xp int := _xp(v_id);
  v_joga boolean;
begin
  if v_id is null then raise exception 'Entra na tua conta primeiro.'; end if;
  select coalesce(_na_tabela(p), false) into v_joga from profiles p where p.id = v_id;
  return _nivel(v_xp) || jsonb_build_object(
    'xp', v_xp,
    'xpSemana', (select coalesce(sum(xp), 0) from quest_completions where profile_id = v_id and completed_at >= _inicio_periodo('weekly')),
    'posicao', case when coalesce(v_joga, false)
      then 1 + (select count(*) from profiles p where _na_tabela(p) and p.id <> v_id and _xp(p.id) > v_xp)
      else 0 end,
    'total', (select count(*) from profiles p where _na_tabela(p))
  );
end $$;

create or replace function public.ranking_nivel(p_limite int default 50) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('posicao', x.pos, 'perfil', _perfil_json(x.p), 'xp', x.xp) || _nivel(x.xp) order by x.pos), '[]'::jsonb)
  from (
    select p, t.xp, row_number() over (order by t.xp desc, p.points desc, p.username) as pos
    from profiles p cross join lateral (select _xp(p.id) as xp) t
    where _na_tabela(p)
    order by t.xp desc, p.points desc, p.username
    limit least(100, greatest(1, p_limite))
  ) x
$$;

-- ---------------------------------------------------------------- o melhor de cada agente

/**
 * Para cada agente, os melhores jogadores (até p_top, no máximo 10) pela média de Rangify Score com esse
 * agente. Só entra quem tem pelo menos p_minimo partidas acabadas com ele. Os agentes sem ninguém não vêm.
 */
create or replace function public.ranking_agentes(p_minimo int default 1, p_top int default 5) returns jsonb
language sql stable security definer set search_path = public as $$
  with base as (
    select mp.agent as agente, p.id, count(*) as n, avg(mp.rangify_score) as media, max(mp.rangify_score) as melhor,
           count(*) filter (where mp.team = m.winner) as vitorias, avg(mp.acs) as acs,
           (sum(mp.kills) + sum(mp.assists))::numeric / greatest(1, sum(mp.deaths)) as kda
    from match_players mp
    join matches m on m.id = mp.match_id
    join profiles p on p.id = mp.profile_id
    where m.state = 'COMPLETED' and mp.team is not null and mp.agent is not null and mp.rangify_score is not null and _na_tabela(p)
    group by mp.agent, p.id
    having count(*) >= greatest(1, p_minimo)
  ),
  ord as (
    select b.*, row_number() over (partition by b.agente order by b.media desc, b.n desc, p.points desc, p.username) as pos
    from base b join profiles p on p.id = b.id
  )
  select jsonb_build_object(
    'minimo', greatest(1, p_minimo),
    'agentes', coalesce((
      select jsonb_agg(jsonb_build_object('agente', a.agente, 'jogadores', a.js) order by a.agente)
      from (
        select o.agente, jsonb_agg(jsonb_build_object(
          'posicao', o.pos, 'perfil', _perfil_json(p), 'media', round(o.media, 1), 'melhor', o.melhor,
          'partidas', o.n, 'vitorias', o.vitorias, 'acs', round(o.acs), 'kda', round(o.kda, 2)
        ) order by o.pos) as js
        from ord o join profiles p on p.id = o.id
        where o.pos <= least(10, greatest(1, p_top))
        group by o.agente
      ) a
    ), '[]'::jsonb)
  )
$$;

revoke all on function public._na_tabela(profiles) from public, anon, authenticated;
revoke all on function public.ranking_agentes(int, int) from public, anon;
grant execute on function public.ranking_agentes(int, int) to authenticated;
