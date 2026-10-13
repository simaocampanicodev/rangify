-- =============================================================================
-- Rangify: Rangify Score, agentes e Discord obrigatório para a fila.
--
-- * Rangify Score (RS): a nota de desempenho de cada jogador numa partida,
--   feita com o ACS, o KDA, o KAST e os trades, comparados com a média dos 10
--   jogadores dessa partida. 100 é a média da partida.
--   Pesos: ACS 35%, KDA 25%, KAST 25%, trades por ronda 15%. Cada métrica conta
--   entre 0,25x e 2x a média, para um número estranho não estragar a nota.
-- * Os pontos passam a ter três partes: o resultado (+20 ou -20), o desnível
--   dos ranks oficiais (de -8 a +10, como antes) e o desempenho (de -6 a +6,
--   um ponto por cada 6 de RS acima ou abaixo de 100). Sem estatísticas, o
--   desempenho vale 0. O MVP passa a ser quem tem o RS mais alto.
-- * O agente de cada jogador fica guardado (vem da Henrik Dev API), para o
--   perfil mostrar onde cada um joga melhor por mapa e por agente.
-- * A staff pode exigir que quem entra na fila esteja no servidor de Discord.
--   A Edge Function verificar-discord confirma-o com o bot e guarda a resposta.
--
-- Corre depois de 0001 a 0011. Pode correr outra vez sem estragar nada.
-- =============================================================================

alter table public.match_players
  add column if not exists rangify_score int,
  add column if not exists points_perf int,
  add column if not exists agent text;

alter table public.config
  add column if not exists discord_required boolean not null default false,
  add column if not exists discord_invite text;

-- Escritas só pela Edge Function verificar-discord (os jogadores não mexem em profiles).
alter table public.profiles
  add column if not exists discord_member boolean,
  add column if not exists discord_checked_at timestamptz;

-- ------------------------------------------------------------ Rangify Score

/** Calcula o RS de todos os jogadores com estatísticas de uma partida. */
create or replace function public._rangify_scores(p_match uuid, p_rondas int) returns void
language sql security definer set search_path = public as $$
  with base as (
    select profile_id, acs::numeric as acs,
      (kills + assists)::numeric / greatest(1, deaths) as kda,
      kast_pct::numeric as kast,
      case when trades is not null then trades::numeric / greatest(1, p_rondas) end as tpr
    from match_players where match_id = p_match and team is not null and acs is not null
  ),
  med as (select avg(acs) as a, avg(kda) as k, avg(kast) as t, avg(tpr) as r from base),
  rat as (
    select b.profile_id,
      case when med.a > 0 then least(2, greatest(0.25, b.acs / med.a)) end as ra,
      case when med.k > 0 then least(2, greatest(0.25, b.kda / med.k)) end as rk,
      case when med.t > 0 and b.kast is not null then least(2, greatest(0.25, b.kast / med.t)) end as rt,
      case when med.r > 0 and b.tpr is not null then least(2, greatest(0.25, b.tpr / med.r)) end as rr
    from base b cross join med
  )
  update match_players mp set rangify_score = round(100 * (
      coalesce(0.35 * ra, 0) + coalesce(0.25 * rk, 0) + coalesce(0.25 * rt, 0) + coalesce(0.15 * rr, 0)
    ) / nullif(
      (case when ra is not null then 0.35 else 0 end) + (case when rk is not null then 0.25 else 0 end)
      + (case when rt is not null then 0.25 else 0 end) + (case when rr is not null then 0.15 else 0 end), 0))::int
  from rat where mp.match_id = p_match and mp.profile_id = rat.profile_id
$$;

/** Os pontos de desempenho: um por cada 6 de RS acima ou abaixo de 100, entre -6 e +6. */
create or replace function public._bonus_desempenho(p_rs int) returns int
language sql immutable as $$
  select case when p_rs is null then 0 else greatest(-6, least(6, round((p_rs - 100) / 6.0)::int)) end
$$;

create or replace function public._fechar(p_match uuid, p_a int, p_b int, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_win team := (case when p_a > p_b then 'A' else 'B' end)::team;
  v_delta int;
  v_perf int;
begin
  select * into m from matches where id = p_match for update;
  if m.state in ('COMPLETED', 'CANCELLED') then return; end if;

  if p_stats is not null then
    update match_players mp set
      kills = (s ->> 'kills')::int, deaths = (s ->> 'deaths')::int, assists = (s ->> 'assists')::int,
      acs = (s ->> 'acs')::int, first_bloods = (s ->> 'firstBloods')::int,
      trades = (s ->> 'trades')::int, hs_pct = (s ->> 'hsPct')::int, kast_pct = (s ->> 'kastPct')::int,
      agent = nullif(s ->> 'agente', '')
    from jsonb_array_elements(p_stats) s
    where mp.match_id = p_match and mp.profile_id = (s ->> 'perfilId')::uuid;
    perform _rangify_scores(p_match, p_a + p_b);
    update match_players set mvp = false where match_id = p_match;
    update match_players set mvp = true where match_id = p_match and profile_id = (
      select profile_id from match_players where match_id = p_match and rangify_score is not null
      order by rangify_score desc, acs desc limit 1
    );
  end if;

  for r in select profile_id, team, tier_snapshot, rangify_score from match_players where match_id = p_match and team is not null loop
    v_perf := _bonus_desempenho(r.rangify_score);
    v_delta := _pontos(
      r.tier_snapshot,
      array(select tier_snapshot from match_players where match_id = p_match and team is not null and team <> r.team),
      r.team = v_win
    ) + v_perf;
    -- Todas as partidas contam, também as de teste: remover a partida devolve tudo.
    update profiles set points = points + v_delta,
      wins = wins + case when r.team = v_win then 1 else 0 end,
      losses = losses + case when r.team = v_win then 0 else 1 end
    where id = r.profile_id;
    update match_players set points_delta = v_delta,
      points_perf = case when r.rangify_score is not null then v_perf end,
      points_after = (select points from profiles where id = r.profile_id)
    where match_id = p_match and profile_id = r.profile_id;
  end loop;

  update matches set state = 'COMPLETED', score_a = p_a, score_b = p_b, winner = v_win, finished_at = now(),
    has_stats = p_stats is not null, points_applied = true, phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
end $$;

-- ------------------------------------------------------------ Agentes nas simulações

/** Um agente da função do jogador; p_n diferente dá agentes diferentes. */
create or replace function public._agente_simulado(p_funcao text, p_n int) returns text
language sql immutable as $$
  select a[1 + (p_n % array_length(a, 1))] from (select case p_funcao
    when 'Duelista' then array['Jett', 'Raze', 'Reyna', 'Phoenix', 'Neon', 'Yoru', 'Iso', 'Waylay']
    when 'Iniciador' then array['Sova', 'Skye', 'Fade', 'Breach', 'KAY/O', 'Gekko', 'Tejo']
    when 'Controlador' then array['Omen', 'Brimstone', 'Viper', 'Astra', 'Harbor', 'Clove', 'Miks']
    when 'Sentinela' then array['Killjoy', 'Cypher', 'Sage', 'Chamber', 'Deadlock', 'Vyse', 'Veto']
    else array['Jett', 'Sova', 'Omen', 'Killjoy', 'Raze', 'Skye', 'Viper', 'Cypher']
  end as a) x
$$;

create or replace function public._estatisticas_simuladas(p_match uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m matches;
  v_rondas int;
  v_win team;
  v_off int := floor(random() * 8)::int;
  v jsonb;
begin
  select * into m from matches where id = p_match;
  v_rondas := coalesce(m.score_a, 13) + coalesce(m.score_b, 0);
  v_win := case when coalesce(m.score_a, 13) > coalesce(m.score_b, 0) then 'A' else 'B' end;
  with base as (
    select mp.profile_id, mp.team = v_win as ganhou, p.game_role,
      -- Na mesma equipa, quem tem a mesma função fica com agentes diferentes.
      _agente_simulado(p.game_role, v_off + (row_number() over (partition by mp.team, p.game_role order by random()))::int) as agente,
      greatest(90, round(150 + random() * 120 + (_divisao(mp.tier_snapshot) - 14) * 3
        + case when mp.team = v_win then 22 else -18 end + case when p.game_role = 'Duelista' then 18 else 0 end))::int as acs
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.team is not null
  )
  select jsonb_agg(jsonb_build_object(
    'perfilId', profile_id, 'acs', acs, 'agente', agente,
    'kills', greatest(1, round(v_rondas * (acs / 265.0) * (0.68 + random() * 0.18)))::int,
    'deaths', greatest(2, round(v_rondas * case when ganhou then 0.5 + random() * 0.24 else 0.62 + random() * 0.24 end))::int,
    'assists', round(v_rondas * (case when game_role in ('Iniciador', 'Controlador') then 0.22 else 0.1 end + random() * 0.2))::int,
    'firstBloods', round(v_rondas * random() * case when game_role = 'Duelista' then 0.2 else 0.09 end)::int,
    'trades', round(v_rondas * (0.03 + random() * 0.12))::int,
    'hsPct', least(45, round(13 + random() * 14 + greatest(0, acs - 200) / 25.0))::int,
    'kastPct', least(95, round(case when ganhou then 70 else 58 end + random() * 18))::int
  )) into v from base;
  return v;
end $$;

-- ------------------------------------------------------------ Leituras

create or replace function public._partida_json(p_match uuid, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'estado', m.state, 'regiao', m.region, 'mapa', m.map,
    'capitaoA', m.captain_a, 'capitaoB', m.captain_b,
    'codigoGrupo', case
      when p_viewer is not null and (exists (select 1 from match_players x where x.match_id = m.id and x.profile_id = p_viewer) or e_staff(p_viewer))
      then (select s.party_code from match_secrets s where s.match_id = m.id) end,
    'pool', to_jsonb(m.map_pool), 'resultadoA', m.score_a, 'resultadoB', m.score_b, 'vencedor', m.winner, 'simulada', m.simulated, 'automatica', m.automatic,
    'prazoConfirmacao', m.ready_deadline, 'inicioFase', m.phase_started_at, 'prazoFase', m.phase_deadline,
    'comecouEm', m.started_at, 'terminouEm', m.finished_at, 'estatisticas', m.has_stats,
    'criadaEm', m.created_at, 'atualizadaEm', m.updated_at,
    'jogadores', coalesce((
      select jsonb_agg(jsonb_build_object(
        'perfilId', p.id, 'utilizador', p.username, 'riotId', p.riot_id, 'avatarUrl', p.avatar_url,
        'tier', mp.tier_snapshot, 'pontos', p.points, 'funcaoJogo', p.game_role, 'bot', p.is_bot,
        'equipa', mp.team, 'capitao', mp.is_captain, 'aceitou', mp.accepted, 'ordemEscolha', mp.pick_order,
        'kills', mp.kills, 'deaths', mp.deaths, 'assists', mp.assists, 'acs', mp.acs,
        'firstBloods', mp.first_bloods, 'mvp', mp.mvp, 'deltaPontos', mp.points_delta,
        'trades', mp.trades, 'hsPct', mp.hs_pct, 'kastPct', mp.kast_pct,
        'rangifyScore', mp.rangify_score, 'deltaDesempenho', mp.points_perf, 'agente', mp.agent
      ) order by mp.team nulls last, mp.is_captain desc, mp.pick_order nulls first, mp.tier_snapshot desc)
      from match_players mp join profiles p on p.id = mp.profile_id where mp.match_id = m.id
    ), '[]'::jsonb),
    'bans', coalesce((
      select jsonb_agg(jsonb_build_object('mapa', b.map, 'equipa', b.team, 'ordem', b.ban_order) order by b.ban_order)
      from match_bans b where b.match_id = m.id
    ), '[]'::jsonb),
    'submissoes', coalesce((
      select jsonb_agg(jsonb_build_object('capitaoId', r.captain_id, 'a', r.score_a, 'b', r.score_b, 'em', r.submitted_at) order by r.submitted_at)
      from match_results r where r.match_id = m.id
    ), '[]'::jsonb)
  )
  from matches m where m.id = p_match
$$;

create or replace function public._resumo_json(p_match uuid, p_ref uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with m as (select * from matches where id = p_match),
  meu as (select * from match_players where match_id = p_match and profile_id = p_ref and team is not null)
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'mapa', m.map, 'estado', m.state, 'resultadoA', m.score_a, 'resultadoB', m.score_b,
    'vencedor', m.winner, 'terminouEm', m.finished_at, 'simulada', m.simulated,
    'capitaoA', (select _nome(p) from profiles p where p.id = m.captain_a),
    'capitaoB', (select _nome(p) from profiles p where p.id = m.captain_b),
    'tierMedioA', _tier_de_divisao((select avg(_divisao(tier_snapshot)) from match_players where match_id = m.id and team = 'A')),
    'tierMedioB', _tier_de_divisao((select avg(_divisao(tier_snapshot)) from match_players where match_id = m.id and team = 'B')),
    'duracaoMin', case when m.started_at is not null and m.finished_at is not null then round(extract(epoch from m.finished_at - m.started_at) / 60)::int end,
    'mvp', (select _nome(p) from match_players mp join profiles p on p.id = mp.profile_id where mp.match_id = m.id and mp.mvp limit 1),
    'minha', (select jsonb_build_object(
        'equipa', meu.team, 'venceu', meu.team = m.winner, 'deltaPontos', meu.points_delta, 'kills', meu.kills,
        'deaths', meu.deaths, 'assists', meu.assists, 'acs', meu.acs, 'mvp', meu.mvp,
        'rangifyScore', meu.rangify_score, 'agente', meu.agent,
        'tierAdversario', _tier_de_divisao((select avg(_divisao(o.tier_snapshot)) from match_players o where o.match_id = m.id and o.team is not null and o.team <> meu.team))
      ) from meu)
  ) from m
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
    'totalJogadores', (select count(*) from profiles where not is_bot and riot_id is not null)
  )
$$;

create or replace function public.forma_perfil(p_perfil uuid, p_n int default 20) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(x.j order by x.fin), '[]'::jsonb) from (
    select m.finished_at as fin, jsonb_build_object(
      'partidaId', m.id, 'data', m.finished_at, 'mapa', m.map,
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
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null
    order by m.finished_at desc limit least(50, greatest(1, p_n))
  ) x
$$;

-- ------------------------------------------------------------ Discord obrigatório

/** Se a fila exige o servidor de Discord, o convite e o que se sabe do próprio jogador. */
create or replace function public.discord_fila() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'obrigatorio', c.discord_required, 'convite', c.discord_invite,
    'membro', p.discord_member, 'verificadoEm', p.discord_checked_at
  ) from config c, profiles p where c.id and p.id = eu()
$$;

create or replace function public.definir_discord_fila(p_obrigatorio boolean, p_convite text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  v text := nullif(trim(p_convite), '');
begin
  me := _exigir_owner_dev();
  if v is not null and v !~ '^https://(discord\.gg|discord\.com/invite)/[A-Za-z0-9-]+/?$' then
    raise exception 'O convite tem de ser um link discord.gg ou discord.com/invite.';
  end if;
  if p_obrigatorio and v is null then raise exception 'Põe o link de convite do servidor antes de tornar o Discord obrigatório.'; end if;
  update config set discord_required = coalesce(p_obrigatorio, false), discord_invite = v, updated_at = now(), updated_by = me.id where id;
  return discord_fila();
end $$;

-- A verificação vale 30 minutos: o site pede outra antes de entrar na fila se for preciso.
create or replace function public.entrar_fila() returns void
language plpgsql security definer set search_path = public as $$
declare me profiles;
begin
  me := _eu();
  if me.riot_id is null then raise exception 'Liga o teu Riot ID antes de entrar na fila.'; end if;
  if me.cooldown_until > now() then raise exception 'Ainda estás de castigo por não aceitares uma partida.'; end if;
  if _partida_ativa(me.id) is not null then raise exception 'Já tens uma partida a decorrer.'; end if;
  if coalesce((select discord_required from config where id), false)
     and not (coalesce(me.discord_member, false) and me.discord_checked_at > now() - interval '30 minutes') then
    raise exception 'Entra no servidor de Discord do Rangify para poderes entrar na fila.';
  end if;
  insert into queue_entries (profile_id, region) values (me.id, me.region) on conflict do nothing;
  perform _emparelhar(me.region);
end $$;

revoke all on function public._rangify_scores(uuid, int), public._bonus_desempenho(int), public._agente_simulado(text, int) from public, anon, authenticated;
grant execute on function public.discord_fila(), public.definir_discord_fila(boolean, text) to authenticated;
