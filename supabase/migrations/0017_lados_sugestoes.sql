-- Capitães ao calhas, escolha do lado, sugestões da equipa e resultados pela staff.
--
-- * Os dois capitães passam a ser sorteados entre os 10 (antes eram os dois ranks
--   mais altos, o que dava sempre o draft às mesmas pessoas).
-- * Bans e lado com 60 segundos por vez: os colegas do capitão podem sugerir o mapa
--   a banir (ou o lado). Se o tempo acabar, vale a sugestão mais votada da equipa.
-- * Depois do último ban, a equipa que não fez esse ban escolhe o lado em que começa
--   (Ataque ou Defesa). Continua na fase MAP_BAN, já com o mapa definido.
-- * A staff vê as partidas à espera do resultado e submete-o pelos capitães que faltam.
--
-- Corre depois de 0001 a 0016. Pode correr outra vez sem estragar nada.

alter table public.matches add column if not exists side_team public.team;
alter table public.matches add column if not exists side_pick text;
alter table public.matches drop constraint if exists matches_side_pick_check;
alter table public.matches add constraint matches_side_pick_check check (side_pick in ('ataque', 'defesa'));

-- step: o número do ban (0, 1, 2...) ou 100 para a escolha do lado.
create table if not exists public.match_suggestions (
  match_id uuid not null references public.matches (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  step int not null,
  value text not null,
  created_at timestamptz not null default now(),
  primary key (match_id, profile_id, step)
);
alter table public.match_suggestions enable row level security;

/** A vez em que a partida está: que equipa decide, e se é um ban ou o lado. */
create or replace function public._vez_mapas(p_match uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select case
    when m.state <> 'MAP_BAN' then null
    when m.map is not null then jsonb_build_object('passo', 100, 'equipa', m.side_team, 'capitao', case when m.side_team = 'A' then m.captain_a else m.captain_b end)
    else (select jsonb_build_object('passo', n, 'equipa', case when n % 2 = 0 then 'A' else 'B' end, 'capitao', case when n % 2 = 0 then m.captain_a else m.captain_b end)
          from (select count(*)::int as n from match_bans where match_id = m.id) c)
  end
  from matches m where m.id = p_match
$$;

/** Quanto espera um capitão bot: mais tempo se houver pessoas na equipa, para poderem sugerir. */
create or replace function public._atraso_mapas(p_match uuid, p_equipa public.team) returns interval
language sql volatile security definer set search_path = public as $$
  select case
    when (select automatic from matches where id = p_match) then _atraso(true)
    when exists (select 1 from match_players mp join profiles p on p.id = mp.profile_id
                 where mp.match_id = p_match and mp.team = p_equipa and not mp.is_captain and not p.is_bot)
      then (7 + random() * 5) * interval '1 second'
    else _atraso(false)
  end
$$;

/** A sugestão mais votada da equipa para este passo (a mais antiga desempata). Só conta o que ainda é válido. */
create or replace function public._sugestao_top(p_match uuid, p_equipa public.team, p_passo int) returns text
language sql stable security definer set search_path = public as $$
  select s.value from match_suggestions s
  join match_players mp on mp.match_id = s.match_id and mp.profile_id = s.profile_id and mp.team = p_equipa
  join matches m on m.id = s.match_id
  where s.match_id = p_match and s.step = p_passo
    and case when p_passo = 100 then s.value in ('ataque', 'defesa')
             else s.value = any (m.map_pool) and not exists (select 1 from match_bans b where b.match_id = p_match and b.map = s.value) end
  group by s.value order by count(*) desc, min(s.created_at) limit 1
$$;

-- ---------------------------------------------------------------- capitães ao calhas

create or replace function public._iniciar_draft(p_match uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  a uuid;
  b uuid;
begin
  select * into m from matches where id = p_match;
  -- As ferramentas de teste podem obrigar alguém a ser capitão A; o resto é sorteado.
  if m.forced_captain is not null and exists (select 1 from match_players where match_id = p_match and profile_id = m.forced_captain) then
    a := m.forced_captain;
  else
    select profile_id into a from match_players where match_id = p_match order by random() limit 1;
  end if;
  select profile_id into b from match_players where match_id = p_match and profile_id <> a order by random() limit 1;

  update match_players set is_captain = true, team = 'A' where match_id = p_match and profile_id = a;
  update match_players set is_captain = true, team = 'B' where match_id = p_match and profile_id = b;
  update matches set state = 'DRAFT_PHASE', captain_a = a, captain_b = b, phase_started_at = now(),
    phase_deadline = now() + interval '30 seconds', bot_move_at = now() + _atraso(m.automatic), updated_at = now()
  where id = p_match;
end $$;

-- ---------------------------------------------------------------- draft, bans e lado

create or replace function public._escolher(p_match uuid, p_perfil uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
begin
  select * into m from matches where id = p_match;
  select count(*) into n from match_players where match_id = p_match and team is not null and not is_captain;
  update match_players set team = (case when n % 2 = 0 then 'A' else 'B' end)::team, pick_order = n + 1
  where match_id = p_match and profile_id = p_perfil and team is null;
  if not found then raise exception 'Esse jogador já foi escolhido.'; end if;
  if n + 1 >= 8 then
    update matches set state = 'MAP_BAN', phase_started_at = now(), phase_deadline = now() + interval '60 seconds',
      bot_move_at = now() + _atraso_mapas(p_match, 'A'), updated_at = now() where id = p_match;
  else
    update matches set phase_started_at = now(), phase_deadline = now() + interval '30 seconds',
      bot_move_at = now() + _atraso(m.automatic), updated_at = now() where id = p_match;
  end if;
end $$;

create or replace function public._banir(p_match uuid, p_mapa text) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  n int;
  v_mapa text;
  v_equipa team;
  v_lado team;
begin
  select * into m from matches where id = p_match;
  if m.map is not null then raise exception 'Os bans já terminaram: falta escolher o lado.'; end if;
  if not (p_mapa = any (m.map_pool)) or exists (select 1 from match_bans where match_id = p_match and map = p_mapa) then
    raise exception 'Esse mapa já não está disponível.';
  end if;
  select count(*) into n from match_bans where match_id = p_match;
  v_equipa := (case when n % 2 = 0 then 'A' else 'B' end)::team;
  insert into match_bans (match_id, ban_order, map, team) values (p_match, n + 1, p_mapa, v_equipa);
  if n + 1 >= array_length(m.map_pool, 1) - 1 then
    -- Sobra um mapa. A equipa que não fez o último ban escolhe o lado.
    select x into v_mapa from unnest(m.map_pool) x
    where not exists (select 1 from match_bans b where b.match_id = p_match and b.map = x) limit 1;
    v_lado := (case when v_equipa = 'A' then 'B' else 'A' end)::team;
    update matches set map = v_mapa, side_team = v_lado, side_pick = null, phase_started_at = now(), phase_deadline = now() + interval '60 seconds',
      bot_move_at = now() + _atraso_mapas(p_match, v_lado), updated_at = now() where id = p_match;
  else
    update matches set phase_started_at = now(), phase_deadline = now() + interval '60 seconds',
      bot_move_at = now() + _atraso_mapas(p_match, (case when v_equipa = 'A' then 'B' else 'A' end)::team), updated_at = now() where id = p_match;
  end if;
end $$;

create or replace function public._escolher_lado(p_match uuid, p_lado text) returns void
language plpgsql security definer set search_path = public as $$
declare m matches;
begin
  select * into m from matches where id = p_match;
  if m.state <> 'MAP_BAN' or m.map is null or m.side_pick is not null then raise exception 'O lado já foi escolhido.'; end if;
  if p_lado not in ('ataque', 'defesa') then raise exception 'Escolhe Ataque ou Defesa.'; end if;
  update matches set side_pick = p_lado, state = 'LOBBY_CREATION', phase_started_at = now(), phase_deadline = now() + interval '10 minutes',
    bot_move_at = now() + case when m.automatic then interval '0.8 seconds' else (3.5 + random() * 2) * interval '1 second' end,
    updated_at = now() where id = p_match;
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
  v_vez jsonb;
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
    v_vez := _vez_mapas(p_match);
    v_cap := (v_vez->>'capitao')::uuid;
    if now() >= m.phase_deadline or (_auto(m, v_cap) and m.bot_move_at <= now()) then
      -- Sem decisão a tempo (ou capitão bot): vale a sugestão mais votada da equipa, senão ao calhas.
      v_mapa := _sugestao_top(p_match, (v_vez->>'equipa')::team, (v_vez->>'passo')::int);
      if (v_vez->>'passo')::int = 100 then
        perform _escolher_lado(p_match, coalesce(v_mapa, (array['ataque', 'defesa'])[1 + floor(random() * 2)::int]));
      else
        if v_mapa is null then
          select x into v_mapa from unnest(m.map_pool) x
          where not exists (select 1 from match_bans b where b.match_id = p_match and b.map = x)
          order by random() limit 1;
        end if;
        perform _banir(p_match, v_mapa);
      end if;
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

-- ---------------------------------------------------------------- RPCs dos jogadores

create or replace function public.banir_mapa(p_match uuid, p_mapa text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _eu();
  m matches;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'MAP_BAN' then raise exception 'Os bans já terminaram.'; end if;
  if m.map is not null then raise exception 'Os bans já terminaram: falta escolher o lado.'; end if;
  if m.automatic or (_vez_mapas(p_match)->>'capitao')::uuid is distinct from me.id then
    raise exception 'Ainda não é a tua vez de banir.';
  end if;
  perform _banir(p_match, p_mapa);
end $$;

create or replace function public.escolher_lado(p_match uuid, p_lado text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _eu();
  m matches;
begin
  select * into m from matches where id = p_match for update;
  if not found or m.state <> 'MAP_BAN' or m.map is null then raise exception 'Ainda não é altura de escolher o lado.'; end if;
  if m.automatic or (_vez_mapas(p_match)->>'capitao')::uuid is distinct from me.id then
    raise exception 'Só o capitão da equipa que escolhe o lado pode decidir.';
  end if;
  perform _escolher_lado(p_match, p_lado);
end $$;

/**
 * Um colega do capitão sugere o mapa a banir (ou o lado). Voltar a sugerir o mesmo tira a sugestão.
 * O capitão vê as sugestões da equipa nos cartões e decide.
 */
create or replace function public.sugerir_mapa(p_match uuid, p_valor text) returns void
language plpgsql security definer set search_path = public as $$
declare
  me profiles := _eu();
  m matches;
  v_vez jsonb;
  v_equipa team;
  v_passo int;
begin
  select * into m from matches where id = p_match;
  if not found or m.state <> 'MAP_BAN' then raise exception 'Já não há nada para sugerir.'; end if;
  v_vez := _vez_mapas(p_match);
  v_passo := (v_vez->>'passo')::int;
  select team into v_equipa from match_players where match_id = p_match and profile_id = me.id;
  if v_equipa is null or v_equipa::text <> v_vez->>'equipa' then raise exception 'Só a equipa que está a decidir pode sugerir.'; end if;
  if v_passo = 100 then
    if p_valor not in ('ataque', 'defesa') then raise exception 'Sugere Ataque ou Defesa.'; end if;
  elsif not (p_valor = any (m.map_pool)) or exists (select 1 from match_bans where match_id = p_match and map = p_valor) then
    raise exception 'Esse mapa já não está disponível.';
  end if;
  if exists (select 1 from match_suggestions where match_id = p_match and profile_id = me.id and step = v_passo and value = p_valor) then
    delete from match_suggestions where match_id = p_match and profile_id = me.id and step = v_passo;
  else
    insert into match_suggestions (match_id, profile_id, step, value) values (p_match, me.id, v_passo, p_valor)
    on conflict (match_id, profile_id, step) do update set value = excluded.value, created_at = now();
  end if;
  -- Para os colegas verem logo (o Realtime ouve a tabela das partidas).
  update matches set updated_at = now() where id = p_match;
end $$;

-- ---------------------------------------------------------------- o que o site recebe

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
    'lado', case when m.side_team is not null then jsonb_build_object('equipa', m.side_team, 'escolha', m.side_pick) end,
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
    ), '[]'::jsonb),
    -- Só a equipa que está a decidir vê as sugestões dela (a outra equipa não espreita).
    'sugestoes', coalesce((
      select jsonb_agg(jsonb_build_object('perfilId', s.profile_id, 'valor', s.value) order by s.created_at)
      from match_suggestions s
      join match_players eu on eu.match_id = m.id and eu.profile_id = p_viewer
      where s.match_id = m.id and m.state = 'MAP_BAN'
        and s.step = (_vez_mapas(m.id)->>'passo')::int and eu.team::text = _vez_mapas(m.id)->>'equipa'
    ), '[]'::jsonb)
  )
  from matches m where m.id = p_match
$$;

-- ---------------------------------------------------------------- staff: resultados por submeter

/** As partidas a jogar ou à espera do resultado, para a staff submeter pelos capitães que faltam. */
create or replace function public.resultados_pendentes() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare me profiles := _exigir_staff();
begin
  return (select coalesce(jsonb_agg(_partida_json(id, me.id) order by updated_at), '[]'::jsonb)
          from matches where state in ('IN_PROGRESS', 'RESULT_SUBMISSION'));
end $$;

/**
 * A staff submete o resultado em nome de cada capitão que ainda não o fez. Se um capitão
 * já tinha submetido outro resultado, a partida vai para disputa, como se fosse ele.
 */
create or replace function public.staff_submeter_resultado(p_match uuid, p_a int, p_b int) returns void
language plpgsql security definer set search_path = public as $$
declare
  m matches;
  v_erro text;
  v_cap uuid;
begin
  perform _exigir_staff();
  select * into m from matches where id = p_match for update;
  if not found then raise exception 'Esta partida já não existe.'; end if;
  if m.state not in ('IN_PROGRESS', 'RESULT_SUBMISSION') then raise exception 'Esta partida já não está à espera do resultado.'; end if;
  v_erro := _resultado_invalido(p_a, p_b);
  if v_erro is not null then raise exception '%', v_erro; end if;
  if m.state = 'IN_PROGRESS' then perform _abrir_resultado(p_match); end if;
  foreach v_cap in array array[m.captain_a, m.captain_b] loop
    if (select state from matches where id = p_match) <> 'RESULT_SUBMISSION' then exit; end if;
    if not exists (select 1 from match_results where match_id = p_match and captain_id = v_cap) then
      perform _submeter(p_match, v_cap, p_a, p_b);
    end if;
  end loop;
end $$;

revoke all on function public._vez_mapas(uuid), public._atraso_mapas(uuid, public.team), public._sugestao_top(uuid, public.team, int),
  public._escolher_lado(uuid, text) from public, anon, authenticated;
grant execute on function public._vez_mapas(uuid), public._atraso_mapas(uuid, public.team), public._sugestao_top(uuid, public.team, int),
  public._escolher_lado(uuid, text) to service_role;
grant execute on function public.escolher_lado(uuid, text), public.sugerir_mapa(uuid, text), public.resultados_pendentes(),
  public.staff_submeter_resultado(uuid, int, int) to authenticated;
