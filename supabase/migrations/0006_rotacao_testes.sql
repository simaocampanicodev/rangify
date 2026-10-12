-- =============================================================================
-- Rangify: rotação de mapas editável e partidas de teste que contam.
--
-- * A staff (Owner e Dev) escolhe que mapas estão na rotação. Cada partida
--   guarda a pool do momento em que nasce e os bans vão até sobrar um.
-- * As partidas de teste (simuladas) passam a dar pontos e estatísticas como
--   as outras, para se ver o resultado no perfil e no histórico. Remover a
--   partida devolve os pontos, e as estatísticas desaparecem com ela.
-- =============================================================================

create table public.config (
  id boolean primary key default true check (id),
  map_pool text[] not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id)
);
insert into public.config (map_pool) values (array['Abyss', 'Ascent', 'Bind', 'Haven', 'Lotus', 'Split', 'Sunset']);
alter table public.config enable row level security;
create policy "ler configuração" on public.config for select to authenticated using (true);

alter table public.matches
  add column if not exists map_pool text[],
  add column if not exists points_applied boolean not null default false;
-- As partidas que já existiam jogaram com os 13 mapas; as terminadas a sério já deram pontos.
update public.matches set map_pool = _mapas() where map_pool is null;
update public.matches set points_applied = true where state = 'COMPLETED' and not simulated;
alter table public.matches alter column map_pool set not null;

create function public._pool_ativa() returns text[]
language sql stable security definer set search_path = public as $$
  select map_pool from config where id
$$;

-- A rotação atual, pela ordem dos mapas do jogo.
create function public.pool_mapas() returns jsonb
language sql stable security definer set search_path = public as $$
  select to_jsonb(array(select x from unnest(_mapas()) x where x = any (_pool_ativa())))
$$;

create function public.definir_pool_mapas(p_mapas text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  me profiles;
  v text[];
begin
  me := _exigir_owner_dev();
  v := array(select x from unnest(_mapas()) x where x = any (p_mapas));
  if exists (select 1 from unnest(p_mapas) x where not (x = any (_mapas()))) then raise exception 'Há um mapa que não existe no Valorant.'; end if;
  if coalesce(array_length(v, 1), 0) < 3 then raise exception 'A rotação precisa de pelo menos 3 mapas.'; end if;
  update config set map_pool = v, updated_at = now(), updated_by = me.id where id;
  return to_jsonb(v);
end $$;

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
        'trades', mp.trades, 'hsPct', mp.hs_pct, 'kastPct', mp.kast_pct
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

create or replace function public._fechar(p_match uuid, p_a int, p_b int, p_stats jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
  v_win team := (case when p_a > p_b then 'A' else 'B' end)::team;
  v_delta int;
begin
  select * into m from matches where id = p_match for update;
  if m.state in ('COMPLETED', 'CANCELLED') then return; end if;

  if p_stats is not null then
    update match_players mp set
      kills = (s ->> 'kills')::int, deaths = (s ->> 'deaths')::int, assists = (s ->> 'assists')::int,
      acs = (s ->> 'acs')::int, first_bloods = (s ->> 'firstBloods')::int,
      trades = (s ->> 'trades')::int, hs_pct = (s ->> 'hsPct')::int, kast_pct = (s ->> 'kastPct')::int
    from jsonb_array_elements(p_stats) s
    where mp.match_id = p_match and mp.profile_id = (s ->> 'perfilId')::uuid;
    update match_players set mvp = false where match_id = p_match;
    update match_players set mvp = true where match_id = p_match and profile_id = (
      select profile_id from match_players where match_id = p_match and acs is not null order by acs desc limit 1
    );
  end if;

  for r in select profile_id, team, tier_snapshot from match_players where match_id = p_match and team is not null loop
    v_delta := _pontos(
      r.tier_snapshot,
      array(select tier_snapshot from match_players where match_id = p_match and team is not null and team <> r.team),
      r.team = v_win
    );
    -- Todas as partidas contam, também as de teste: remover a partida devolve tudo.
    update profiles set points = points + v_delta,
      wins = wins + case when r.team = v_win then 1 else 0 end,
      losses = losses + case when r.team = v_win then 0 else 1 end
    where id = r.profile_id;
    update match_players set points_delta = v_delta, points_after = (select points from profiles where id = r.profile_id)
    where match_id = p_match and profile_id = r.profile_id;
  end loop;

  update matches set state = 'COMPLETED', score_a = p_a, score_b = p_b, winner = v_win, finished_at = now(),
    has_stats = p_stats is not null, points_applied = true, phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
end $$;

create or replace function public.remover_partida(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
begin
  perform _exigir_owner_dev();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state not in ('COMPLETED', 'CANCELLED') then raise exception 'Cancela a partida antes de a remover.'; end if;
  if m.state = 'COMPLETED' and m.points_applied then
    for r in select profile_id, team, points_delta from match_players where match_id = p_match and team is not null and points_delta is not null loop
      update profiles set
        points = points - r.points_delta,
        wins = greatest(0, wins - case when r.team = m.winner then 1 else 0 end),
        losses = greatest(0, losses - case when r.team = m.winner then 0 else 1 end)
      where id = r.profile_id;
    end loop;
  end if;
  delete from matches where id = p_match;
end $$;

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
      select jsonb_agg(jsonb_build_object('mapa', map, 'partidas', n, 'vitorias', v, 'acs', a) order by n desc, map)
      from (select map, count(*) as n, count(*) filter (where ganhou) as v, avg(acs) as a from minhas group by map) x
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
      'mvp', mp.mvp
    ) as j
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null
    order by m.finished_at desc limit least(50, greatest(1, p_n))
  ) x
$$;

create or replace function public._forma_curta(p_perfil uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(r order by fin), '[]'::jsonb) from (
    select case when mp.team = m.winner then 'V' else 'D' end as r, m.finished_at as fin
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null
    order by m.finished_at desc limit 5
  ) x
$$;

create or replace function public._progresso_missao(p_perfil uuid, p_tipo text, p_desde timestamptz) returns int
language sql stable security definer set search_path = public as $$
  with minhas as (
    select mp.*, m.winner, m.finished_at,
      (select round(avg(_divisao(o.tier_snapshot))) from match_players o where o.match_id = m.id and o.team is not null and o.team <> mp.team) as div_adv
    from match_players mp join matches m on m.id = mp.match_id
    where mp.profile_id = p_perfil and m.state = 'COMPLETED' and mp.team is not null and m.finished_at >= p_desde
  )
  select (case p_tipo
    when 'jogos' then (select count(*) from minhas)
    when 'vitorias' then (select count(*) from minhas where team = winner)
    when 'vitorias_acima' then (select count(*) from minhas where team = winner and div_adv > _divisao(tier_snapshot))
    when 'first_bloods' then (select coalesce(sum(first_bloods), 0) from minhas)
    when 'mvp' then (select count(*) from minhas where mvp)
    when 'acs' then (select coalesce(max(acs), 0) from minhas)
    when 'pontos' then (select points from profiles where id = p_perfil)
    when 'sequencia' then (
      select coalesce(max(c), 0) from (
        select count(*) as c from (
          select team = winner as ganhou, sum(case when team = winner then 0 else 1 end) over (order by finished_at) as grupo from minhas
        ) s where ganhou group by grupo
      ) t)
    else 0 end)::int
$$;

create or replace function public.historico(p_perfil uuid default null, p_minhas boolean default true, p_mapa text default null, p_offset int default 0)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ref uuid := coalesce(p_perfil, case when p_minhas then eu() end);
  v_linhas jsonb;
  v_n int;
begin
  -- As simuladas só aparecem no histórico de quem as jogou.
  with lista as (
    select m.id, m.finished_at from matches m
    where m.state = 'COMPLETED'
      and (v_ref is null or exists (select 1 from match_players mp where mp.match_id = m.id and mp.profile_id = v_ref and mp.team is not null))
      and (p_mapa is null or m.map = p_mapa)
    order by m.finished_at desc
    offset greatest(0, p_offset) limit 21
  )
  select coalesce(jsonb_agg(_resumo_json(l.id, v_ref) order by l.finished_at desc) filter (where l.rn <= 20), '[]'::jsonb), count(*)
  into v_linhas, v_n
  from (select lista.*, row_number() over (order by finished_at desc) rn from lista) l;
  return jsonb_build_object('linhas', v_linhas, 'cursor', case when v_n > 20 then (greatest(0, p_offset) + 20)::text end);
end $$;

create or replace function public._criar_partida(p_ids uuid[], p_region text, p_simulada boolean, p_automatica boolean, p_forcar uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  -- Cada partida guarda a pool de mapas do momento em que nasce: mudar a rotação não estraga as que já decorrem.
  insert into matches (code, state, region, simulated, automatic, forced_captain, map_pool, ready_deadline, phase_started_at, phase_deadline)
  values ('RG-' || nextval('match_code_seq'), 'READY_CHECK', p_region, p_simulada, p_automatica, p_forcar, _pool_ativa(),
          now() + interval '20 seconds', now(), now() + interval '20 seconds')
  returning id into v_id;

  -- Os bots (e toda a gente numa simulação automática) aceitam sozinhos daqui a pouco.
  insert into match_players (match_id, profile_id, tier_snapshot, queued_since, accept_at)
  select v_id, p.id, p.official_tier, q.joined_at,
    case when p.is_bot or p_automatica
      then now() + (case when p_automatica then 0.3 + random() * 1.1 else 1 + random() * 7 end) * interval '1 second' end
  from profiles p left join queue_entries q on q.profile_id = p.id
  where p.id = any (p_ids);

  delete from queue_entries where profile_id = any (p_ids);
  return v_id;
end $$;

create or replace function public._banir(p_match uuid, p_mapa text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
  v_mapa text;
begin
  select * into m from matches where id = p_match;
  if not (p_mapa = any (m.map_pool)) or exists (select 1 from match_bans where match_id = p_match and map = p_mapa) then
    raise exception 'Esse mapa já não está disponível.';
  end if;
  select count(*) into n from match_bans where match_id = p_match;
  insert into match_bans (match_id, ban_order, map, team) values (p_match, n + 1, p_mapa, (case when n % 2 = 0 then 'A' else 'B' end)::team);
  -- Bans até sobrar um mapa da pool desta partida.
  if n + 1 >= array_length(m.map_pool, 1) - 1 then
    select x into v_mapa from unnest(m.map_pool) x
    where not exists (select 1 from match_bans b where b.match_id = p_match and b.map = x) limit 1;
    update matches set state = 'LOBBY_CREATION', map = v_mapa, phase_started_at = now(), phase_deadline = now() + interval '10 minutes',
      bot_move_at = now() + case when m.automatic then interval '0.8 seconds' else (3.5 + random() * 2) * interval '1 second' end,
      updated_at = now() where id = p_match;
  else
    update matches set phase_started_at = now(), phase_deadline = now() + interval '20 seconds',
      bot_move_at = now() + _atraso(m.automatic), updated_at = now() where id = p_match;
  end if;
end $$;

create or replace function public._passo(p_match uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
  v_cap uuid;
  v_alvo uuid;
  v_mapa text;
  v_humano uuid;
  v_outro uuid;
  s match_results;
begin
  select * into m from matches where id = p_match for update;
  if not found then return false; end if;

  case m.state
  when 'READY_CHECK' then
    update match_players set accepted = true
    where match_id = p_match and not accepted and accept_at is not null and accept_at <= now();
    if not exists (select 1 from match_players where match_id = p_match and not accepted) then
      perform _iniciar_draft(p_match);
      return true;
    elsif now() >= m.ready_deadline then
      perform _falhou_confirmacao(p_match);
      return true;
    end if;

  when 'DRAFT_PHASE' then
    select count(*) into n from match_players where match_id = p_match and team is not null and not is_captain;
    v_cap := case when n % 2 = 0 then m.captain_a else m.captain_b end;
    if now() >= m.phase_deadline or (_auto(m, v_cap) and m.bot_move_at <= now()) then
      select mp.profile_id into v_alvo from match_players mp join profiles p on p.id = mp.profile_id
      where mp.match_id = p_match and mp.team is null order by mp.tier_snapshot desc, p.points desc limit 1;
      perform _escolher(p_match, v_alvo);
      return true;
    end if;

  when 'MAP_BAN' then
    select count(*) into n from match_bans where match_id = p_match;
    v_cap := case when n % 2 = 0 then m.captain_a else m.captain_b end;
    if now() >= m.phase_deadline or (_auto(m, v_cap) and m.bot_move_at <= now()) then
      select x into v_mapa from unnest(m.map_pool) x
      where not exists (select 1 from match_bans b where b.match_id = p_match and b.map = x)
      order by random() limit 1;
      perform _banir(p_match, v_mapa);
      return true;
    end if;

  when 'LOBBY_CREATION' then
    if _auto(m, m.captain_a) and m.bot_move_at <= now() then
      perform _comecar(p_match, upper(substr(md5(random()::text), 1, 6)));
      return true;
    elsif now() >= m.phase_deadline then
      update matches set state = 'CANCELLED', finished_at = now(), phase_deadline = null, bot_move_at = null, updated_at = now() where id = p_match;
      return true;
    end if;

  when 'IN_PROGRESS' then
    if now() >= m.phase_deadline then
      perform _abrir_resultado(p_match);
      return true;
    end if;

  when 'RESULT_SUBMISSION' then
    if m.bot_move_at is not null and m.bot_move_at <= now() then
      if _auto(m, m.captain_a) and _auto(m, m.captain_b) then
        -- Dois capitães automáticos: inventam um resultado e submetem os dois.
        if m.auto_score_a is null then
          perform _resultado_aleatorio(p_match);
          select * into m from matches where id = p_match;
        end if;
        v_cap := case
          when not exists (select 1 from match_results where match_id = p_match and captain_id = m.captain_a) then m.captain_a
          when not exists (select 1 from match_results where match_id = p_match and captain_id = m.captain_b) then m.captain_b
        end;
        if v_cap is not null then
          update matches set bot_move_at = now() + case when m.automatic then interval '0.4 seconds' else interval '1.6 seconds' end where id = p_match;
          perform _submeter(p_match, v_cap, m.auto_score_a, m.auto_score_b);
          return true;
        end if;
      else
        -- Um capitão humano e um bot: o bot confirma o que o humano submeteu.
        v_humano := case when _auto(m, m.captain_a) then m.captain_b else m.captain_a end;
        v_outro := case when v_humano = m.captain_a then m.captain_b else m.captain_a end;
        select * into s from match_results where match_id = p_match and captain_id = v_humano;
        if found and _auto(m, v_outro) and not exists (select 1 from match_results where match_id = p_match and captain_id = v_outro) then
          perform _submeter(p_match, v_outro, s.score_a, s.score_b);
          return true;
        end if;
      end if;
    end if;
    if now() >= m.phase_deadline then
      -- Prazo esgotado: vale a única submissão; sem nenhuma, vai para a staff.
      select count(*) into n from match_results where match_id = p_match;
      if n = 1 then
        select * into s from match_results where match_id = p_match;
        update matches set state = 'PROCESSING_API', score_a = s.score_a, score_b = s.score_b, phase_started_at = now(),
          phase_deadline = now() + case when m.simulated then interval '3.5 seconds' else interval '15 minutes' end, updated_at = now()
        where id = p_match;
      else
        update matches set state = 'DISPUTE', phase_deadline = null, bot_move_at = null, updated_at = now() where id = p_match;
      end if;
      return true;
    end if;

  when 'PROCESSING_API' then
    if now() >= m.phase_deadline then
      -- Simulação: estatísticas inventadas. Partida real sem resposta da API: fecha sem estatísticas.
      perform _fechar(p_match, m.score_a, m.score_b, case when m.simulated then _estatisticas_simuladas(p_match) end);
      return true;
    end if;

  else
    return false;
  end case;
  return false;
end $$;

revoke execute on function public._pool_ativa() from public, anon, authenticated;
grant execute on function public._pool_ativa() to service_role;
