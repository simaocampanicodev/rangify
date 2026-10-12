-- =============================================================================
-- Rangify: mais estatísticas por jogador (Trades, HS% e KAST%), remover
-- partidas do histórico e acertar pontos à mão. Só Owner e Dev fazem as duas
-- últimas; ao remover uma partida real, os pontos dela são devolvidos.
-- =============================================================================

alter table public.match_players
  add column if not exists trades int,
  add column if not exists hs_pct int,
  add column if not exists kast_pct int;

create or replace function public._partida_json(p_match uuid, p_viewer uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', m.id, 'codigo', m.code, 'estado', m.state, 'regiao', m.region, 'mapa', m.map,
    'capitaoA', m.captain_a, 'capitaoB', m.captain_b,
    'codigoGrupo', case
      when p_viewer is not null and (exists (select 1 from match_players x where x.match_id = m.id and x.profile_id = p_viewer) or e_staff(p_viewer))
      then (select s.party_code from match_secrets s where s.match_id = m.id) end,
    'resultadoA', m.score_a, 'resultadoB', m.score_b, 'vencedor', m.winner, 'simulada', m.simulated, 'automatica', m.automatic,
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

create or replace function public._estatisticas_simuladas(p_match uuid) returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare
  m matches;
  v_rondas int;
  v_win team;
  v jsonb;
begin
  select * into m from matches where id = p_match;
  v_rondas := coalesce(m.score_a, 13) + coalesce(m.score_b, 0);
  v_win := case when coalesce(m.score_a, 13) > coalesce(m.score_b, 0) then 'A' else 'B' end;
  with base as (
    select mp.profile_id, mp.team = v_win as ganhou, p.game_role,
      greatest(90, round(150 + random() * 120 + (_divisao(mp.tier_snapshot) - 14) * 3
        + case when mp.team = v_win then 22 else -18 end + case when p.game_role = 'Duelista' then 18 else 0 end))::int as acs
    from match_players mp join profiles p on p.id = mp.profile_id
    where mp.match_id = p_match and mp.team is not null
  )
  select jsonb_agg(jsonb_build_object(
    'perfilId', profile_id, 'acs', acs,
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
    -- As partidas simuladas mostram o cálculo, mas não mexem nos pontos reais.
    if not m.simulated then
      update profiles set points = points + v_delta,
        wins = wins + case when r.team = v_win then 1 else 0 end,
        losses = losses + case when r.team = v_win then 0 else 1 end
      where id = r.profile_id;
    end if;
    update match_players set points_delta = v_delta, points_after = (select points from profiles where id = r.profile_id)
    where match_id = p_match and profile_id = r.profile_id;
  end loop;

  update matches set state = 'COMPLETED', score_a = p_a, score_b = p_b, winner = v_win, finished_at = now(),
    has_stats = p_stats is not null, phase_deadline = null, bot_move_at = null, updated_at = now()
  where id = p_match;
end $$;

create function public._exigir_owner_dev() returns public.profiles
language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  p := _eu();
  if p.role not in ('owner', 'dev') then raise exception 'Só Owner e Dev podem fazer isto.'; end if;
  return p;
end $$;

-- Remove uma partida terminada ou cancelada. Numa partida real terminada, devolve
-- os pontos, as vitórias e as derrotas de cada jogador antes de a apagar.
create function public.remover_partida(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  r record;
begin
  perform _exigir_owner_dev();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state not in ('COMPLETED', 'CANCELLED') then raise exception 'Cancela a partida antes de a remover.'; end if;
  if m.state = 'COMPLETED' and not m.simulated then
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

-- Acerta os pontos de um jogador à mão (por exemplo, depois de um erro ou de um castigo).
create function public.definir_pontos(p_perfil uuid, p_pontos int) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform _exigir_owner_dev();
  if p_pontos is null or p_pontos < 0 or p_pontos > 10000 then raise exception 'Os pontos têm de estar entre 0 e 10000.'; end if;
  update profiles set points = p_pontos where id = p_perfil and not is_bot;
  if not found then raise exception 'Jogador não encontrado.'; end if;
end $$;

-- O relógio do servidor vai junto com o estado da fila, para o site acertar as contagens.
create or replace function public.estado_fila() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  me profiles;
  q queue_entries;
begin
  me := _eu();
  select * into q from queue_entries where profile_id = me.id;
  return jsonb_build_object(
    'naFila', q.profile_id is not null,
    'desde', q.joined_at,
    'contagem', (select count(*) from queue_entries where region = me.region),
    'regiao', me.region,
    'cooldownAte', case when me.cooldown_until > now() then me.cooldown_until end,
    'agora', now()
  );
end $$;

revoke execute on function public._exigir_owner_dev() from public, anon, authenticated;
grant execute on function public._exigir_owner_dev() to service_role;
